/* Bluetooth GATT Heart Rate Service (0x180D / 0x2A37). No imports, so node tests can load it directly. */
export interface HrSample { bpm: number; rr: number[] }

export function parseHeartRate(view: DataView): HrSample {
  if (view.byteLength < 2 || (view.getUint8(0) & 1 && view.byteLength < 3)) return { bpm: 0, rr: [] }; // truncated packet; 0 bpm is ignored upstream
  const flags = view.getUint8(0);
  const wide = flags & 0x01;
  const bpm = wide ? view.getUint16(1, true) : view.getUint8(1);
  let i = wide ? 3 : 2;
  if (flags & 0x08) i += 2; // energy expended field
  const rr: number[] = [];
  if (flags & 0x10) for (; i + 1 < view.byteLength; i += 2) rr.push(Math.round(view.getUint16(i, true) * 1000 / 1024));
  return { bpm, rr };
}

/** RMSSD in ms over clean RR intervals, or null when there is less than 60 s of clean data. */
export function rmssd(rr: number[]): number | null {
  const clean: number[] = [];
  for (const v of rr) {
    if (v < 300 || v > 2000) continue;
    const prev = clean[clean.length - 1];
    if (prev !== undefined && Math.abs(v - prev) > prev * 0.2) continue;
    clean.push(v);
  }
  if (clean.reduce((a, b) => a + b, 0) < 60000 || clean.length < 3) return null;
  let sum = 0;
  for (let k = 1; k < clean.length; k++) sum += (clean[k]! - clean[k - 1]!) ** 2;
  return Math.round(Math.sqrt(sum / (clean.length - 1)) * 10) / 10;
}

/** Lowest average over any 60 s window whose readings stay within 8 bpm; null before a full minute is recorded. */
export function restingHeartRate(samples: { t: number; bpm: number }[]): number | null {
  let best: number | null = null;
  for (let a = 0, b = 0; a < samples.length; a++) {
    const start = samples[a]!.t;
    while (b < samples.length && samples[b]!.t - start < 60000) b++;
    const win = samples.slice(a, b);
    if (samples[b - 1]!.t - start < 55000 || win.length < 20) continue;
    const bpms = win.map((s) => s.bpm);
    if (Math.max(...bpms) - Math.min(...bpms) > 8) continue;
    const avg = bpms.reduce((x, y) => x + y, 0) / bpms.length;
    if (best === null || avg < best) best = avg;
  }
  return best === null ? null : Math.round(best);
}

interface Characteristic extends EventTarget { value?: DataView; startNotifications(): Promise<Characteristic> }
interface Device extends EventTarget { name?: string; gatt?: { connected: boolean; connect(): Promise<{ getPrimaryService(s: string): Promise<{ getCharacteristic(c: string): Promise<Characteristic> }> }>; disconnect(): void } }
interface Bluetooth { requestDevice(o: { filters: { services: string[] }[] }): Promise<Device> }
export const bluetooth = (): Bluetooth | undefined => (globalThis.navigator as (Navigator & { bluetooth?: Bluetooth }) | undefined)?.bluetooth;

export async function connectHeartRate(onSample: (s: HrSample) => void, onEnd: () => void = () => {}) {
  const bt = bluetooth();
  if (!bt) throw Error('This browser cannot use Bluetooth.');
  const device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  if (!device.gatt) throw Error('This device does not offer a heart-rate connection.');
  const server = await device.gatt.connect();
  const char = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
  const read = () => { if (char.value) onSample(parseHeartRate(char.value)); };
  char.addEventListener('characteristicvaluechanged', read);
  device.addEventListener('gattserverdisconnected', onEnd, { once: true });
  await char.startNotifications();
  return { name: device.name || 'Heart-rate sensor', disconnect: () => { char.removeEventListener('characteristicvaluechanged', read); if (device.gatt?.connected) device.gatt.disconnect(); } };
}

/* Shared live state, readable from any screen via useLiveHeartRate. */
export interface LiveHr { status: 'idle' | 'connecting' | 'live' | 'error'; device: string; bpm: number | null; samples: { t: number; bpm: number }[]; rr: number[]; error: string }
const MAX = 7200;
let live: LiveHr = { status: 'idle', device: '', bpm: null, samples: [], rr: [], error: '' };
let conn: { disconnect(): void } | null = null;
const subs = new Set<() => void>();
const set = (patch: Partial<LiveHr>) => { live = { ...live, ...patch }; subs.forEach((f) => f()); };
export const subscribeLiveHr = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export const getLiveHr = () => live;

export async function startLiveHr() {
  if (live.status === 'connecting' || live.status === 'live') return;
  set({ status: 'connecting', error: '', samples: [], rr: [], bpm: null });
  try {
    const c = await connectHeartRate((s) => {
      if (!s.bpm) return;
      const samples = [...live.samples.slice(-MAX + 1), { t: Date.now(), bpm: s.bpm }];
      set({ bpm: s.bpm, samples, rr: s.rr.length ? [...live.rr, ...s.rr].slice(-MAX * 2) : live.rr });
    }, () => { conn = null; set({ status: 'idle', bpm: null }); });
    conn = c; set({ status: 'live', device: c.name });
  } catch (e) {
    const cancelled = e instanceof Error && e.name === 'NotFoundError';
    set({ status: cancelled ? 'idle' : 'error', error: cancelled ? '' : e instanceof Error ? e.message : 'Could not connect.' });
  }
}
export function stopLiveHr() { conn?.disconnect(); conn = null; set({ status: 'idle', bpm: null }); }
