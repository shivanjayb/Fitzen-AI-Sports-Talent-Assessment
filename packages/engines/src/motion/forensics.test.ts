import { describe, expect, it } from 'vitest';
import { inspectContainer } from './forensics.js';

// Minimal ISO-BMFF writers.
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const str = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const box = (type: string, ...parts: number[][]) => { const body = parts.flat(); return [...u32(8 + body.length), ...str(type), ...body]; };
const full = (type: string, ...parts: number[][]) => box(type, [0, 0, 0, 0], ...parts);
const T1904 = (ms: number) => Math.floor(ms / 1000) + 2082844800;

const REC = Date.UTC(2025, 5, 1, 10, 0, 0);
const NOW = Date.UTC(2025, 5, 2);

function mp4(o: { brand?: string; created?: number; deltas: [number, number][]; edits?: number; encoder?: string; handlerName?: string; extra?: number[][] }) {
  const mvhd = full('mvhd', u32(o.created ? T1904(o.created) : 0), u32(o.created ? T1904(o.created) : 0), u32(1000), u32(10000), new Array(80).fill(0));
  const tkhd = full('tkhd', new Array(72).fill(0), u32(1920 << 16), u32(1080 << 16));
  const mdhd = full('mdhd', u32(0), u32(0), u32(600), u32(6000), [0, 0, 0, 0]);
  const hdlr = full('hdlr', u32(0), str('vide'), new Array(12).fill(0), str(o.handlerName ?? 'VideoHandler'), [0]);
  const stts = full('stts', u32(o.deltas.length), ...o.deltas.map(([c, d]) => [...u32(c), ...u32(d)]));
  const elst = full('elst', u32(o.edits ?? 1), ...Array.from({ length: o.edits ?? 1 }, (_, i) => [...u32(3000), ...u32(i * 3000), 0, 1, 0, 0]));
  const trak = box('trak', tkhd, box('edts', elst), box('mdia', mdhd, hdlr, box('minf', box('stbl', stts))));
  const udta = o.encoder
    ? box('udta', full('meta', full('hdlr', u32(0), str('mdir'), new Array(12).fill(0), [0]), box('ilst', box('\xa9too', box('data', u32(1), u32(0), str(o.encoder))))))
    : [];
  return new Uint8Array([...box('ftyp', str(o.brand ?? 'isom'), u32(512), str('isomiso2avc1mp41')), ...box('moov', mvhd, trak, udta), ...(o.extra ?? []).flat()]);
}
const codes = (r: ReturnType<typeof inspectContainer>) => r.flags.map((f) => f.code);

describe('container forensics', () => {
  it('reads a clean CFR 30 fps clip with no editor flags', () => {
    const r = inspectContainer(mp4({ brand: 'qt  ', created: REC, deltas: [[300, 20]], handlerName: 'Core Media Video' }), { fileName: 'IMG_0001.MOV', lastModified: REC + 60_000, nowMs: NOW });
    expect(r.format).toBe('mov');
    expect(r.metadata.nominalFps).toBeCloseTo(30, 5);
    expect(r.metadata.vfr).toBe(false);
    expect(r.metadata.creationTime).toBe(new Date(REC).toISOString());
    expect(r.metadata.tracks[0]).toMatchObject({ width: 1920, height: 1080, handler: 'vide' });
    expect(codes(r)).toEqual(['camera-signature']);
  });

  it('flags FFmpeg encoder, multi-segment edit list, VFR and missing creation time', () => {
    const r = inspectContainer(mp4({ deltas: [[200, 20], [100, 40]], edits: 2, encoder: 'Lavf60.3.100' }), { fileName: 'clip.mp4', lastModified: NOW, nowMs: NOW });
    expect(r.metadata.encoderStrings).toContain('\xa9too=Lavf60.3.100');
    expect(r.metadata.vfr).toBe(true);
    expect(codes(r)).toEqual(expect.arrayContaining(['editor-signature', 'edit-list', 'variable-frame-rate', 'no-creation-time']));
  });

  it('ignores a single odd last-sample delta when judging VFR', () => {
    const r = inspectContainer(mp4({ created: REC, deltas: [[299, 20], [1, 7]] }), { fileName: 'a.mp4', lastModified: REC, nowMs: NOW });
    expect(r.metadata.vfr).toBe(false);
  });

  it('notes future and inconsistent creation times', () => {
    const r = inspectContainer(mp4({ created: NOW + 30 * 86_400_000, deltas: [[300, 20]] }), { fileName: 'a.mp4', lastModified: NOW, nowMs: NOW });
    expect(codes(r)).toEqual(expect.arrayContaining(['creation-in-future', 'created-after-modified']));
  });

  it('strongly flags a C2PA manifest declaring trainedAlgorithmicMedia', () => {
    const uuid = [0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81];
    const manifest = box('jumb', box('jumd', str('c2pa')), str('c2pa.actions c2pa.created softwareAgent Sora digitalSourceType http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'));
    const r = inspectContainer(mp4({ created: REC, deltas: [[300, 20]], extra: [box('uuid', uuid, [0, 0, 0, 0], str('manifest'), [0], manifest)] }), { fileName: 'gen.mp4', lastModified: REC, nowMs: NOW });
    expect(r.metadata.c2pa).toBe(true);
    const f = r.flags.find((x) => x.code === 'c2pa-ai-generated')!;
    expect(f.severity).toBe('strong');
    expect(f.evidence).toContain('trainedAlgorithmicMedia');
    expect(f.evidence).toContain('sora');
  });

  const c2pa = (claim: string) => {
    const uuid = [0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81];
    return box('uuid', uuid, [0, 0, 0, 0], str('manifest'), [0], box('jumb', box('jumd', str('c2pa')), str(claim)));
  };

  it('only the IPTC declaration is strong; a bare tool name (e.g. a "Veo" sports camera) is a warning', () => {
    const named = inspectContainer(mp4({ created: REC, deltas: [[300, 20]], extra: [c2pa('c2pa.actions c2pa.created softwareAgent Veo Cam 3')] }), { fileName: 'match.mp4', lastModified: REC, nowMs: NOW });
    expect(named.flags.find((x) => x.code === 'c2pa-ai-tool')?.severity).toBe('warn');
    expect(named.flags.some((x) => x.severity === 'strong')).toBe(false);
    const edited = inspectContainer(mp4({ created: REC, deltas: [[300, 20]], extra: [c2pa('digitalSourceType http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia')] }), { fileName: 'a.mp4', lastModified: REC, nowMs: NOW });
    expect(edited.flags.find((x) => x.code === 'c2pa-ai-generated')?.severity).toBe('strong');
  });

  it('flags a C2PA screen capture and notes stripped metadata', () => {
    const r = inspectContainer(mp4({ created: REC, deltas: [[300, 20]], extra: [c2pa('digitalSourceType http://cv.iptc.org/newscodes/digitalsourcetype/screenCapture')] }), { fileName: 'rec.mp4', lastModified: REC, nowMs: NOW });
    expect(codes(r)).toEqual(expect.arrayContaining(['c2pa-present', 'c2pa-screen-capture', 'no-capture-signature']));
    expect(codes(inspectContainer(mp4({ deltas: [[300, 20]] }), { fileName: 'x.mp4', lastModified: NOW, nowMs: NOW }))).toContain('no-capture-signature');
  });

  it('names consumer editors from encoder tags', () => {
    const r = inspectContainer(mp4({ created: REC, deltas: [[300, 20]], encoder: 'CapCut 12.1' }), { fileName: 'v.mp4', lastModified: REC, nowMs: NOW });
    expect(r.flags.find((x) => x.code === 'editor-signature')?.message).toContain('CapCut');
    expect(codes(r)).not.toContain('no-capture-signature');
  });

  it('reads WebM writing app and rejects unknown bytes', () => {
    const info = [0x15, 0x49, 0xa9, 0x66, 0x80 | 16, 0x4d, 0x80, 0x80 | 5, ...str('Lavf6'), 0x57, 0x41, 0x80 | 5, ...str('Chrom')];
    const r = inspectContainer(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80, ...info]), { fileName: 'x.webm', lastModified: NOW });
    expect(r.format).toBe('webm');
    expect(r.metadata.encoderStrings).toEqual(['MuxingApp=Lavf6', 'WritingApp=Chrom']);
    expect(codes(r)).toContain('editor-signature');
    expect(inspectContainer(new Uint8Array(16), { fileName: 'x', lastModified: 0 }).format).toBe('unknown');
  });
});
