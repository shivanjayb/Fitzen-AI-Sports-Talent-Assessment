import { Unzip, UnzipInflate } from 'fflate';
import { deleteWellnessRecord, getWellnessRecords, saveWellnessRecords, validateWellness, wellnessToday, type WellnessInput } from '../../app/wellnessStore';
import { storageOwner } from '../../lib/supabase';
import { Acc, appleParser, parseCsv, parseFitbitJson, type Days, type Kind } from './parse';

export const MAX_BYTES = 2 * 1024 ** 3;
const YIELD_EVERY = 4 * 1024 ** 2;
const pause = () => new Promise((r) => setTimeout(r));

/** Reads exports entirely in the browser. Zips are unpacked as a stream, so a large Apple Health export never sits in memory whole. */
export async function readExports(files: File[], weightInLb: boolean, onProgress: (fraction: number) => void) {
  const acc = new Acc(), used: string[] = [], skipped: string[] = [];
  const total = files.reduce((a, f) => a + f.size, 0) || 1;
  let done = 0, sinceYield = 0;
  const parseText = (name: string, text: string) => {
    try { return (name.toLowerCase().endsWith('.json') ? parseFitbitJson(name, text, acc, weightInLb) : parseCsv(text, acc, name)) >= 0; } catch { return false; }
  };
  const isApple = (name: string) => /(^|\/)export\.xml$/i.test(name);
  for (const file of files) {
    const lower = file.name.toLowerCase(), zip = lower.endsWith('.zip');
    if (!zip && !lower.endsWith('.xml')) { // a renamed export ("export (1).xml") is still Apple Health
      const ok = /\.(json|csv)$/.test(lower) && parseText(file.name, await file.text());
      (ok ? used : skipped).push(file.name); done += file.size; onProgress(done / total); continue;
    }
    const apple = appleParser(acc);
    let hits = 0;
    const unzip = zip ? new Unzip((entry) => {
      const dec = new TextDecoder();
      if (isApple(entry.name)) {
        hits++;
        entry.ondata = (err, chunk, final) => { if (!err) apple.push(dec.decode(chunk, { stream: !final })); };
      } else if (/\.(json|csv)$/i.test(entry.name)) {
        let text = '';
        entry.ondata = (err, chunk, final) => { if (err) return; text += dec.decode(chunk, { stream: !final }); if (final && parseText(entry.name, text)) hits++; };
      } else return;
      entry.start();
    }) : null;
    unzip?.register(UnzipInflate);
    const dec = new TextDecoder(), reader = file.stream().getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) { if (unzip) unzip.push(new Uint8Array(0), true); else apple.push(dec.decode()); break; }
      if (unzip) unzip.push(value); else apple.push(dec.decode(value, { stream: true }));
      done += value.byteLength; sinceYield += value.byteLength;
      if (sinceYield > YIELD_EVERY) { sinceYield = 0; onProgress(done / total); await pause(); }
    }
    apple.finish();
    (zip && !hits ? skipped : used).push(file.name);
  }
  onProgress(1);
  return { days: acc.days(), used, skipped };
}

const LABEL: Record<string, string> = {
  steps: 'steps', rhr: 'resting HR', hrv: 'HRV', hr: 'heart rate', spo2: 'blood oxygen', resp: 'breathing rate', active: 'energy', burned: 'energy',
  recovery: 'recovery', strain: 'strain', weight: 'weight', bodyfat: 'body fat',
};
const label = (kind: Kind, key: string) => (kind === 'sleep' ? 'sleep' : LABEL[key] ?? key);

/** Saves one record per kind per day. A record with the same kind, date and title is updated, so importing a file twice never duplicates. */
export async function saveDays(days: Days, title: string, onProgress: (fraction: number) => void = () => {}) {
  const existing = new Map(getWellnessRecords().map((r) => [`${r.kind}|${r.date}|${r.title}`, r]));
  const base = (kind: Kind, date: string, values: Record<string, number>): WellnessInput => ({ kind, date, title, note: '', unit: '', values });
  const fits = (kind: Kind, date: string, k: string, v: number) => !validateWellness(base(kind, date, kind === 'sleep' && k !== 'hours' ? { hours: 1, [k]: v } : { [k]: v }));
  const batch: WellnessInput[] = [], prior: Prior[] = [], dates = new Set<string>(), labels = new Set<string>();
  const entries = Object.entries(days).sort(([a], [b]) => a.localeCompare(b));
  for (const [i, [date, kinds]] of entries.entries()) {
    for (const [kind, raw] of Object.entries(kinds) as [Kind, Record<string, number>][]) {
      const values = Object.fromEntries(Object.entries(raw).filter(([k, v]) => fits(kind, date, k, v)));
      if (!Object.keys(values).length || (kind === 'sleep' && values.hours === undefined)) continue;
      const prev = existing.get(`${kind}|${date}|${title}`);
      const input = { ...base(kind, date, { ...prev?.values, ...values }), id: prev?.id };
      if (validateWellness(input)) continue;
      batch.push(input); dates.add(date);
      if (prev) prior.push({ id: prev.id, values: prev.values });
      Object.keys(values).forEach((k) => labels.add(label(kind, k)));
    }
    if (i % 40 === 39) { onProgress(i / entries.length); await pause(); }
  }
  const known = new Set(prior.map((p) => p.id));
  const ids = saveWellnessRecords(batch).map((r) => r.id).filter((id) => !known.has(id));
  return { ids, prior, days: dates.size, labels: [...labels] };
}
export const saveToday = (title: string, values: Record<string, number>) => saveDays({ [wellnessToday()]: { vitals: values } }, title);

type Prior = { id: string; values: Record<string, number> };
/** ids: records this import created. prior: values of records it updated, restored on undo so an earlier import's days survive. */
export interface ImportEntry { id: string; at: string; title: string; files: string[]; days: number; labels: string[]; ids: string[]; prior?: Prior[] }
// Per account, like the records themselves: another account on this device must not see or undo these imports.
const key = () => `fitzen.wearables.imports.v1.${storageOwner()}`;
export function importHistory(): ImportEntry[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key()) ?? '[]');
    return Array.isArray(v) ? v.filter((e): e is ImportEntry => !!e && typeof e.id === 'string' && Array.isArray(e.ids) && Array.isArray(e.files) && Array.isArray(e.labels)) : [];
  } catch { return []; }
}
const writeHistory = (list: ImportEntry[]) => { try { localStorage.setItem(key(), JSON.stringify(list.slice(0, 20))); } catch { /* history is a convenience; the records themselves are already saved */ } };
export const addHistory = (e: Omit<ImportEntry, 'id' | 'at'>) => writeHistory([{ ...e, id: crypto.randomUUID(), at: new Date().toISOString() }, ...importHistory()]);
export function undoImport(id: string) {
  const entry = importHistory().find((e) => e.id === id); if (!entry) return;
  const live = new Map(getWellnessRecords().map((r) => [r.id, r]));
  entry.ids.filter((rid) => live.has(rid)).forEach((rid) => deleteWellnessRecord(rid));
  const restore = (entry.prior ?? []).flatMap((p) => { const r = live.get(p.id); return r && !validateWellness({ ...r, values: p.values }) ? [{ ...r, values: p.values }] : []; });
  saveWellnessRecords(restore);
  writeHistory(importHistory().filter((e) => e.id !== id));
}
