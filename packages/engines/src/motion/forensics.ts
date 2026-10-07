/**
 * Container forensics for an uploaded video: reads the MP4/MOV box tree (or the
 * WebM writing-app strings) and reports WARNINGS about provenance. Nothing here
 * proves a clip is real or fake: metadata is trivially stripped or forged. The
 * flags only say what the container claims and why that is worth a human look.
 *
 * References:
 * - ISO/IEC 14496-12 (ISO base media file format): box layout, mvhd/tkhd/mdhd/hdlr/stts/elst.
 * - Apple QuickTime File Format spec: 1904 epoch, udta '©xxx' text atoms, mdta 'keys' metadata.
 * - C2PA Technical Specification v2.1, §A.4 "Embedding manifests into BMFF-based assets":
 *   manifest store lives in a 'uuid' box with the UUID below, as a JUMBF ('jumb') box labelled 'c2pa'.
 *   https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html
 * - IPTC Digital Source Type vocabulary (values used in c2pa.actions digitalSourceType):
 *   https://cv.iptc.org/newscodes/digitalsourcetype/
 * - Matroska/EBML element IDs (Info 0x1549A966, MuxingApp 0x4D80, WritingApp 0x5741):
 *   https://www.matroska.org/technical/elements.html
 */

export type ForensicSeverity = 'info' | 'warn' | 'strong';
export interface ForensicFlag { code: string; severity: ForensicSeverity; message: string; evidence: string }
export interface TrackInfo {
  handler: string; handlerName: string; width?: number; height?: number;
  timescale?: number; sampleCount?: number; nominalFps?: number; vfr?: boolean; edits?: number;
}
export interface ForensicsReport {
  format: 'mp4' | 'mov' | 'webm' | 'unknown';
  flags: ForensicFlag[];
  metadata: {
    majorBrand?: string; compatibleBrands: string[];
    creationTime?: string; modificationTime?: string; durationSec?: number;
    tracks: TrackInfo[]; encoderStrings: string[]; uuids: string[]; c2pa: boolean;
    /** Frame-rate facts for the analyser (first video track). */
    nominalFps?: number; vfr?: boolean;
  };
}
export interface ContainerMeta { fileName: string; lastModified: number; /** for tests; default Date.now() */ nowMs?: number }

/** C2PA v2.1 §A.4: BMFF manifest-store uuid box extended type. */
const C2PA_UUID = 'd8fec3d61b0e483c92975828877ec481';
/** QuickTime/MP4 times count seconds from 1904-01-01; this is that date in Unix seconds. */
const EPOCH_1904 = 2082844800;
const DAY_MS = 86_400_000;

// Encoder/handler strings written by editors and re-encoders (observed defaults of each tool).
const EDITORS: [RegExp, string][] = [
  [/\bLavf|\bFFmpeg|\bLavc/i, 'FFmpeg/libavformat'], [/capcut/i, 'CapCut'], [/premiere/i, 'Adobe Premiere'],
  [/inshot/i, 'InShot'], [/\bVN\b|vlognow/i, 'VN'], [/kinemaster/i, 'KineMaster'],
  [/davinci|\bresolve\b/i, 'DaVinci Resolve'], [/imovie/i, 'iMovie'], [/filmora|wondershare/i, 'Filmora'],
];
// Capture-side signatures: Apple camera writes com.apple.quicktime.* keys and 'Core Media' handler
// names; Android MediaMuxer/MPEG4Writer writes 'VideoHandle'/'SoundHandle' and com.android.* keys.
const CAMERAS: [RegExp, string][] = [
  [/com\.apple\.quicktime|Core Media (Video|Audio|Metadata)/, 'Apple camera'],
  [/com\.android\.|^VideoHandle$|^SoundHandle$/, 'Android camera'],
];
// IPTC digitalSourceType values meaning generative-AI or non-camera output (see IPTC vocabulary URL above):
// trainedAlgorithmicMedia "Created using Generative AI", compositeWithTrainedAlgorithmicMedia "Edited using Generative
// AI", compositeSynthetic "Composite including generative AI elements", algorithmicMedia "Pure algorithmic media".
// OpenAI states every Sora video embeds C2PA metadata (openai.com/index/launching-sora-responsibly).
const AI_SOURCE = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|compositeSynthetic|algorithmicMedia/g;
// IPTC screenCapture: "A capture of the contents of the screen" — a screen recording of some other video.
const SCREEN_SOURCE = /digitalsourcetype\/screenCapture|\bscreenCapture\b/;
// A generator name alone is weaker than the IPTC declaration: "Veo" is also a brand of AI sports cameras that record
// real matches, so names only raise a warning.
const AI_GENERATORS = /\b(sora|veo|runway|firefly|kling|pika|luma|midjourney|dall-e|stable diffusion)\b/gi;

const ascii = (b: Uint8Array) => { let s = ''; for (const c of b) s += String.fromCharCode(c); return s; };
const printable = (s: string) => s.replace(/[^\x20-\x7e\xa9]/g, '').trim();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function inspectContainer(input: ArrayBuffer | Uint8Array, meta: ContainerMeta): ForensicsReport {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags: ForensicFlag[] = [];
  const md: ForensicsReport['metadata'] = { compatibleBrands: [], tracks: [], encoderStrings: [], uuids: [], c2pa: false };
  const flag = (code: string, severity: ForensicSeverity, message: string, evidence: string) => flags.push({ code, severity, message, evidence });
  const now = meta.nowMs ?? Date.now();

  if (bytes.length >= 4 && dv.getUint32(0) === 0x1a45dfa3) {
    md.encoderStrings = webmApps(bytes, dv);
    fingerprint(md.encoderStrings, meta.fileName, flag);
    flag('webm-limited', 'info', 'WebM/Matroska: only the muxing/writing app strings were read; no dates or frame timing checked.', meta.fileName);
    return { format: 'webm', flags, metadata: md };
  }
  if (bytes.length < 8 || ascii(bytes.subarray(4, 8)) !== 'ftyp') {
    flag('unknown-container', 'warn', 'Not an MP4/MOV/WebM container (no ftyp or EBML header); cannot inspect provenance.', hex(bytes.subarray(0, 8)));
    return { format: 'unknown', flags, metadata: md };
  }

  const handlerNames: string[] = [];
  const c2paPayloads: Uint8Array[] = [];
  let keys: string[] = [];
  let track: TrackInfo | undefined;
  let deltas: [number, number][] = [];

  const walk = (start: number, end: number, parent: string) => {
    let off = start;
    while (off + 8 <= end) {
      let size = dv.getUint32(off);
      const type = ascii(bytes.subarray(off + 4, off + 8));
      let hdr = 8;
      if (size === 1) { if (off + 16 > end) return; size = Number(dv.getBigUint64(off + 8)); hdr = 16; }
      else if (size === 0) size = end - off; // box runs to end of file
      if (size < hdr) return; // corrupt: stop rather than loop
      const boxEnd = Math.min(off + size, end);
      const p = off + hdr; // payload start
      const body = bytes.subarray(p, boxEnd);
      switch (type) {
        case 'ftyp':
          md.majorBrand = ascii(bytes.subarray(p, p + 4));
          for (let i = p + 8; i + 4 <= boxEnd; i += 4) md.compatibleBrands.push(ascii(bytes.subarray(i, i + 4)));
          break;
        case 'moov': case 'mdia': case 'minf': case 'stbl': case 'edts': case 'udta': case 'ilst':
          walk(p, boxEnd, type); break;
        case 'trak':
          track = { handler: '', handlerName: '' }; deltas = [];
          walk(p, boxEnd, type);
          finishTrack(track, deltas); md.tracks.push(track); track = undefined; break;
        case 'meta': {
          // ISO 'meta' is a FullBox (4 bytes version/flags); QuickTime 'meta' is not. Probe for the child header.
          const full = boxEnd - p >= 12 && ascii(bytes.subarray(p + 8, p + 12)) === 'hdlr' ? 4 : 0;
          walk(p + full, boxEnd, type); break;
        }
        case 'mvhd': {
          const v1 = bytes[p] === 1;
          const ct = v1 ? Number(dv.getBigUint64(p + 4)) : dv.getUint32(p + 4);
          const mt = v1 ? Number(dv.getBigUint64(p + 12)) : dv.getUint32(p + 8);
          const ts = dv.getUint32(p + (v1 ? 20 : 12));
          const dur = v1 ? Number(dv.getBigUint64(p + 24)) : dv.getUint32(p + 16);
          if (ct) md.creationTime = new Date((ct - EPOCH_1904) * 1000).toISOString();
          if (mt) md.modificationTime = new Date((mt - EPOCH_1904) * 1000).toISOString();
          if (ts) md.durationSec = dur / ts;
          break;
        }
        case 'tkhd': if (track) { // width/height are 16.16 fixed-point, the last 8 bytes of tkhd
          track.width = dv.getUint32(boxEnd - 8) / 65536; track.height = dv.getUint32(boxEnd - 4) / 65536;
        } break;
        case 'mdhd': if (track) track.timescale = dv.getUint32(p + (bytes[p] === 1 ? 20 : 12)); break;
        case 'hdlr': {
          const handler = ascii(bytes.subarray(p + 8, p + 12));
          // name follows version/flags(4) pre_defined(4) type(4) reserved(12); QuickTime uses a Pascal string.
          let name = bytes.subarray(p + 24, boxEnd);
          if (name.length && name[0] === name.length - 1) name = name.subarray(1);
          const nameStr = printable(ascii(name));
          if (nameStr) handlerNames.push(nameStr);
          if (track && parent === 'mdia') { track.handler = handler; track.handlerName = nameStr; }
          break;
        }
        case 'stts': if (track) {
          const n = dv.getUint32(p + 4);
          for (let i = 0; i < n && p + 16 + i * 8 <= boxEnd; i++) deltas.push([dv.getUint32(p + 8 + i * 8), dv.getUint32(p + 12 + i * 8)]);
        } break;
        case 'elst': if (track) {
          const v1 = bytes[p] === 1, n = dv.getUint32(p + 4), w = v1 ? 20 : 12;
          let real = 0; // empty edits (media_time = -1) only delay start; they are not cuts
          for (let i = 0; i < n && p + 8 + (i + 1) * w <= boxEnd; i++) {
            const q = p + 8 + i * w + (v1 ? 8 : 4);
            const mediaTime = v1 ? Number(dv.getBigInt64(q)) : dv.getInt32(q);
            if (mediaTime !== -1) real++;
          }
          track.edits = real;
        } break;
        case 'keys': {
          keys = [];
          const n = dv.getUint32(p + 4);
          for (let i = 0, q = p + 8; i < n && q + 8 <= boxEnd; i++) { const s = dv.getUint32(q); keys.push(printable(ascii(bytes.subarray(q + 8, q + s)))); q += s; }
          md.encoderStrings.push(...keys.filter((k) => /^com\.(apple|android)\./.test(k)));
          break;
        }
        case 'uuid': {
          const id = hex(bytes.subarray(p, p + 16));
          md.uuids.push(id);
          if (id === C2PA_UUID || ascii(body).includes('c2pa')) c2paPayloads.push(body);
          break;
        }
        case 'jumb': c2paPayloads.push(body); break;
        default:
          if (parent === 'ilst' || (parent === 'udta' && type.charCodeAt(0) === 0xa9)) {
            // ilst item holds a 'data' box: size(4) 'data'(4) type(4) locale(4) value. udta '©xxx': len(2) lang(2) text.
            const isData = ascii(bytes.subarray(p + 4, p + 8)) === 'data';
            const text = printable(ascii(isData ? bytes.subarray(p + 16, boxEnd) : bytes.subarray(p + 4, boxEnd)));
            const idx = dv.getUint32(off + 4); // keyed (mdta) ilst items use a 1-based key index as type
            const label = parent === 'ilst' && idx > 0 && idx <= keys.length ? keys[idx - 1]! : type;
            if (text && /too|swr|enc|software|make|model|©fmt|encoder/i.test(label)) md.encoderStrings.push(`${label}=${text}`);
          }
      }
      off += size;
    }
  };
  walk(0, bytes.length, '');

  const video = md.tracks.find((t) => t.handler === 'vide');
  if (video) { md.nominalFps = video.nominalFps; md.vfr = video.vfr; }
  const format = md.majorBrand === 'qt  ' ? 'mov' : 'mp4';

  // --- C2PA / Content Credentials ---
  if (c2paPayloads.length) {
    md.c2pa = true;
    const text = c2paPayloads.map(ascii).join('\n');
    const sources = [...new Set(text.match(AI_SOURCE) ?? [])];
    const gens = [...new Set((text.match(AI_GENERATORS) ?? []).map((g) => g.toLowerCase()))];
    if (sources.length) {
      flag('c2pa-ai-generated', 'strong', 'Content Credentials declare AI-generated or AI-composited media. The declaration was not cryptographically verified here, but a real camera clip would not normally carry it.',
        [...sources.map((s) => `digitalSourceType=${s}`), ...gens.map((g) => `softwareAgent~${g}`)].join(', '));
    } else if (gens.length) {
      flag('c2pa-ai-tool', 'warn', 'Content Credentials name a tool that can generate video, without declaring the clip AI-generated. Could be an edit made with that tool — or a camera brand with the same name.', gens.map((g) => `softwareAgent~${g}`).join(', '));
    } else {
      flag('c2pa-present', 'info', 'Content Credentials (C2PA) manifest present; no AI-generation assertion found by text scan. Signature not verified.', `${c2paPayloads.length} manifest box(es)`);
    }
    if (SCREEN_SOURCE.test(text)) flag('c2pa-screen-capture', 'warn', 'Content Credentials say this is a screen recording, so it may show someone else\'s video rather than an original capture.', 'digitalSourceType=screenCapture');
  }

  // --- Editing / capture fingerprints ---
  fingerprint([...md.encoderStrings, ...handlerNames], meta.fileName, flag);

  // --- Neither a camera nor an editor left a mark: metadata was stripped (ffmpeg -map_metadata -1, some messengers). ---
  if (!flags.some((f) => f.code === 'camera-signature' || f.code === 'editor-signature'))
    flag('no-capture-signature', 'info', 'No camera or editing-app tags in the file, so where it came from cannot be told. Messaging apps and metadata strippers both do this.', 'no encoder/handler/keys match');

  // --- Edit lists ---
  const edited = md.tracks.filter((t) => (t.edits ?? 0) > 1);
  if (edited.length) flag('edit-list', 'warn', 'Edit list has multiple segments: the clip was likely trimmed or spliced in an editor.', edited.map((t) => `${t.handler}:${t.edits} edits`).join(', '));

  // --- Dates ---
  if (!md.creationTime) flag('no-creation-time', 'info', 'No creation time in the movie header; editors and messaging apps often zero it, so origin cannot be dated.', 'mvhd.creation_time=0');
  else {
    const ct = Date.parse(md.creationTime);
    // 1 day slack: some Android phones write local time labelled as UTC (up to ±14 h off).
    if (ct > now + DAY_MS) flag('creation-in-future', 'warn', 'Creation time is in the future; the date was set wrongly or rewritten.', md.creationTime);
    if (meta.lastModified && ct > meta.lastModified + DAY_MS) flag('created-after-modified', 'warn', 'Container says it was created after the file was last modified; timestamps are inconsistent.', `${md.creationTime} > ${new Date(meta.lastModified).toISOString()}`);
    // 7 days: file mtime resets on download/copy, so only a long gap is worth noting, and even then weakly.
    else if (meta.lastModified && meta.lastModified - ct > 7 * DAY_MS) flag('old-recording', 'info', 'File was saved long after the recording date; it may be an old clip (or just copied later).', `${md.creationTime} vs ${new Date(meta.lastModified).toISOString()}`);
  }
  if (video?.vfr) flag('variable-frame-rate', 'info', 'Variable frame rate: normal for phone cameras, but frame timing must come from timestamps, not a fixed fps.', `nominal ${video.nominalFps?.toFixed(2)} fps`);
  if (!video) flag('no-video-track', 'warn', 'No video track found in the container.', md.tracks.map((t) => t.handler).join(',') || 'none');

  return { format, flags, metadata: md };
}

function finishTrack(t: TrackInfo, deltas: [number, number][]) {
  const samples = deltas.reduce((s, [c]) => s + c, 0);
  const ticks = deltas.reduce((s, [c, d]) => s + c * d, 0);
  if (!samples || !ticks || !t.timescale) return;
  t.sampleCount = samples;
  t.nominalFps = (t.timescale * samples) / ticks;
  // VFR if >1% of frames deviate >10% from the modal delta. 10% clears the 1-tick rounding jitter
  // at QuickTime's 600 timescale for 30 fps (delta 20, jitter 5%); 1% ignores the odd final-sample delta.
  const mode = deltas.reduce((a, b) => (b[0] > a[0] ? b : a))[1];
  const off = deltas.filter(([, d]) => Math.abs(d - mode) > 0.1 * mode).reduce((s, [c]) => s + c, 0);
  t.vfr = off > 0.01 * samples;
}

function fingerprint(strings: string[], fileName: string, flag: (c: string, s: ForensicSeverity, m: string, e: string) => void) {
  const all = [...strings, `file=${fileName}`];
  for (const [re, name] of EDITORS) {
    const hit = all.find((s) => re.test(s));
    if (hit) flag('editor-signature', 'warn', `Written by ${name}: the clip was edited or re-encoded after capture. Not proof of tampering, but the original recording is not what was uploaded.`, hit);
  }
  for (const [re, name] of CAMERAS) {
    const hit = strings.find((s) => re.test(s));
    if (hit) flag('camera-signature', 'info', `Metadata consistent with original ${name} capture (can be forged; absence of editor tags is not proof).`, hit);
  }
}

/** Minimal EBML: find the Segment Info element and read MuxingApp / WritingApp strings. */
function webmApps(bytes: Uint8Array, dv: DataView): string[] {
  const out: string[] = [];
  const vint = (o: number, keepMarker: boolean): [number, number] => {
    const b = bytes[o]!; let len = 1; while (len <= 8 && !(b & (0x80 >> (len - 1)))) len++;
    let v = keepMarker ? b : b & (0xff >> len);
    for (let i = 1; i < len; i++) v = v * 256 + bytes[o + i]!;
    return [v, len];
  };
  const lim = Math.min(bytes.length - 4, 1 << 20); // Info sits near the start; 1 MB bounds the scan
  for (let i = 0; i < lim; i++) {
    if (dv.getUint32(i) !== 0x1549a966) continue;
    const [size, sl] = vint(i + 4, false);
    const end = Math.min(i + 4 + sl + size, bytes.length);
    for (let o = i + 4 + sl; o < end;) {
      const [id, il] = vint(o, true); const [len, ll] = vint(o + il, false);
      const p = o + il + ll;
      if (id === 0x4d80 || id === 0x5741) out.push(`${id === 0x4d80 ? 'MuxingApp' : 'WritingApp'}=${printable(ascii(bytes.subarray(p, p + len)))}`);
      o = p + len;
    }
    break;
  }
  return out;
}
