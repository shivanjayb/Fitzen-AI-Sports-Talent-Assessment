import { isMissingSchema, storageOwner, supabase } from '../lib/supabase';

export type WellnessKind = 'vitals' | 'sleep' | 'body' | 'nutrition' | 'journal' | 'blood-records';
export interface WellnessRecord {
  id: string; kind: WellnessKind; date: string; title: string; note: string; unit: string;
  values: Record<string, number>; updatedAt: string; deletedAt?: string;
}
export type WellnessInput = Pick<WellnessRecord, 'kind' | 'date' | 'title' | 'note' | 'unit' | 'values'> & { id?: string };
interface Stored { records: WellnessRecord[]; pending: string[] }
const prefix = 'fitzen.wellness.v1.';
const memory = new Map<string, Stored>();
const status = new Map<string, string>();
const inFlight = new Map<string, Promise<void>>();
const deleting = new Set<string>();
const listeners = new Set<() => void>();
const generations = new Map<string, number>();
let lastStamp = 0;
const stamp = () => new Date(lastStamp = Math.max(Date.now(), lastStamp + 1)).toISOString();
const checkOwner = (owner: string) => { if (owner !== storageOwner()) throw Error('Your account changed. Open this record again before making changes.'); };
const notify = () => listeners.forEach((fn) => fn());
export const subscribeWellness = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key?.startsWith(prefix)) notify(); });
function read(owner = storageOwner()): Stored {
  if (memory.has(owner)) return memory.get(owner)!;
  try {
    const data = JSON.parse(localStorage.getItem(prefix + owner) ?? 'null') as Stored | null;
    if (data && Array.isArray(data.records) && Array.isArray(data.pending)) return { records: data.records.filter((r) => { try { return typeof r.id === 'string' && typeof r.updatedAt === 'string' && Number.isFinite(Date.parse(r.updatedAt)) && !validateWellness(r, true); } catch { return false; } }), pending: data.pending.filter((id) => typeof id === 'string') };
  } catch { /* Damaged or inaccessible storage never prevents a new entry. */ }
  return { records: [], pending: [] };
}
function write(owner: string, data: Stored) {
  try { localStorage.setItem(prefix + owner, JSON.stringify(data)); if (memory.has(owner)) status.delete(owner); memory.delete(owner); }
  catch { memory.set(owner, data); status.set(owner, 'Device storage is full or blocked. These changes last only until this tab closes.'); }
  notify();
}
export const getWellnessRecords = (): WellnessRecord[] => read().records.filter((r) => !r.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
export const getWellnessSyncStatus = () => status.get(storageOwner()) ?? (storageOwner() === 'guest' ? 'Saved on this device. Sign in to sync future records.' : read().pending.length ? 'Changes are waiting to sync.' : 'Your records are saved on this device.');
export const wellnessToday = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const limits: Record<WellnessKind, Record<string, [number, number]>> = {
  vitals: { rhr: [25, 240], hrv: [1, 400] }, sleep: { hours: [0, 24] }, body: { weight: [15, 350], bodyfat: [1, 75] },
  nutrition: { calories: [0, 10000], protein: [0, 1000], carbs: [0, 2000], fat: [0, 1000] }, journal: { mood: [1, 5] }, 'blood-records': { value: [0, 1000000], low: [0, 1000000], high: [0, 1000000] },
};
export function validateWellness(input: WellnessInput, stored = false): string | null {
  if (!Object.hasOwn(limits, input.kind)) return 'Choose a supported record type.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(`${input.date}T12:00:00`))) return 'Choose a valid date.';
  const parsed = new Date(`${input.date}T12:00:00`);
  if (`${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}` !== input.date || (!stored && input.date > wellnessToday())) return 'Choose today or a valid earlier date.';
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100 || typeof input.note !== 'string' || input.note.length > 1000 || typeof input.unit !== 'string' || input.unit.length > 30) return 'Add a name (up to 100 characters) and keep notes under 1,000 characters.';
  if (!input.values || typeof input.values !== 'object' || Array.isArray(input.values)) return 'Add at least one measurement.';
  const entries = Object.entries(input.values);
  if (!entries.length) return 'Add at least one measurement.';
  for (const [key, value] of entries) {
    const range = Object.hasOwn(limits[input.kind], key) ? limits[input.kind][key] : undefined;
    if (!range || !Number.isFinite(value) || value < range[0] || value > range[1]) return `Check ${key}: enter a number between ${range?.[0] ?? 0} and ${range?.[1] ?? 0}.`;
  }
  if (input.kind === 'journal' && !Number.isInteger(input.values.mood)) return 'Choose a mood from 1 to 5.';
  if (input.kind === 'sleep' && input.values.hours === undefined) return 'Add the hours you slept.';
  if (input.kind === 'nutrition' && input.values.calories === undefined) return 'Add the meal’s calories.';
  if (input.kind === 'blood-records') {
    if (input.values.value === undefined || !input.unit.trim()) return 'Add the result and its unit from your lab report.';
    if (input.values.low !== undefined && input.values.high !== undefined && input.values.low > input.values.high) return 'The lower reference limit must not exceed the upper limit.';
  }
  return null;
}
function update(record: WellnessRecord) {
  const owner = storageOwner(), data = read(owner);
  if (deleting.has(owner)) throw Error('Your records are being deleted. Please wait.');
  write(owner, { records: [record, ...data.records.filter((r) => r.id !== record.id)], pending: [...new Set([...data.pending, record.id])] });
  if (!memory.has(owner)) void syncWellness();
}
export function saveWellnessRecord(input: WellnessInput, owner = storageOwner()): WellnessRecord {
  checkOwner(owner);
  const error = validateWellness(input); if (error) throw Error(error);
  if (input.id && !read().records.some((r) => r.id === input.id)) throw Error('This record is no longer available in this account.');
  const record = { ...input, title: input.title.trim(), note: input.note.trim(), unit: input.unit.trim(), id: input.id ?? crypto.randomUUID(), updatedAt: stamp() };
  update(record); return record;
}
export function deleteWellnessRecord(id: string, owner = storageOwner()) {
  checkOwner(owner);
  const record = read().records.find((r) => r.id === id); if (!record) return;
  update({ ...record, updatedAt: stamp(), deletedAt: new Date().toISOString() });
}
export function restoreWellnessRecord(record: WellnessRecord, owner = storageOwner()) {
  checkOwner(owner);
  const current = read().records.find((r) => r.id === record.id);
  if (!current?.deletedAt) throw Error('This record cannot be restored in this account.');
  const { deletedAt: _, ...rest } = record; update({ ...rest, updatedAt: stamp() });
}
/** Account switches never mix records; pending updates and deletion tombstones survive offline retries. */
export async function syncWellness(): Promise<void> {
  const owner = storageOwner();
  if (!supabase || owner === 'guest' || memory.has(owner) || deleting.has(owner)) return;
  if (inFlight.has(owner)) return inFlight.get(owner);
  const generation = generations.get(owner) ?? 0;
  const run = (async () => {
    let retryChanges = false;
    const sameOwner = async () => {
      const { data } = await supabase!.auth.getSession();
      return (generations.get(owner) ?? 0) === generation && storageOwner() === owner && data.session?.user.id === owner;
    };
    try {
      if (!(await sameOwner())) return;
      status.set(owner, 'Syncing your private records…'); notify();
      const captured = read(owner), pending = captured.records.filter((r) => captured.pending.includes(r.id));
      if (pending.length) {
        const { error } = await supabase!.from('wellness_records').upsert(pending.map((r) => ({ id: r.id, user_id: owner, kind: r.kind, recorded_on: r.date, title: r.title, note: r.note, unit: r.unit, values: r.values, updated_at: r.updatedAt, deleted_at: r.deletedAt ?? null })), { onConflict: 'id' });
        if (error) throw error;
        if (!(await sameOwner())) return;
        const current = read(owner);
        write(owner, { ...current, pending: current.pending.filter((id) => !pending.some((r) => r.id === id && current.records.find((x) => x.id === id)?.updatedAt === r.updatedAt)) });
      }
      // Supabase caps individual responses; page through the owner's history instead of silently truncating it.
      const remote: WellnessRecord[] = [];
      for (let offset = 0; ; offset += 500) {
        if (!(await sameOwner())) return;
        const { data, error } = await supabase!.from('wellness_records').select('*').eq('user_id', owner).order('id').range(offset, offset + 499);
        if (error) throw error;
        if (!(await sameOwner())) return;
        for (const row of data ?? []) {
          const candidate: WellnessRecord = { id: row.id, kind: row.kind, date: row.recorded_on, title: row.title, note: row.note, unit: row.unit, values: row.values, updatedAt: row.updated_at, ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}) };
          if (!validateWellness(candidate, true)) remote.push(candidate);
        }
        if ((data?.length ?? 0) < 500) break;
      }
      const current = read(owner), merged = new Map(current.records.map((r) => [r.id, r]));
      for (const record of remote) {
        const local = merged.get(record.id);
        if (!current.pending.includes(record.id) && (!local || record.updatedAt > local.updatedAt)) merged.set(record.id, record);
      }
      write(owner, { records: [...merged.values()], pending: current.pending });
      retryChanges = current.pending.length > 0;
      if (!memory.has(owner)) status.set(owner, current.pending.length ? 'Changes are waiting to sync. Retry when online.' : 'Synced to your private account.');
    } catch (error) {
      if (storageOwner() === owner) status.set(owner, isMissingSchema(error) ? 'Saved on this device. Account sync needs the wellness database update (007).' : 'Saved on this device. Sync failed; reconnect and retry.');
    } finally {
      inFlight.delete(owner); notify();
      if (retryChanges && storageOwner() === owner && (generations.get(owner) ?? 0) === generation) queueMicrotask(() => void syncWellness());
    }
  })();
  inFlight.set(owner, run); return run;
}

/** Delete the current owner's wellness backup before clearing its local queue. Does not touch other accounts. */
export async function purgeWellnessRecords(): Promise<void> {
  const owner = storageOwner();
  deleting.add(owner);
  try {
  generations.set(owner, (generations.get(owner) ?? 0) + 1);
  await inFlight.get(owner);
  checkOwner(owner);
  if (supabase && owner !== 'guest') {
    if ((await supabase.auth.getSession()).data.session?.user.id !== owner) throw Error('Sign in again before deleting your wellness data.');
    checkOwner(owner);
    const { error } = await supabase.from('wellness_records').delete().eq('user_id', owner);
    if (error && !isMissingSchema(error)) throw Error('Wellness backup could not be deleted. Reconnect and retry.');
    checkOwner(owner);
  }
  try { localStorage.removeItem(prefix + owner); }
  catch { throw Error('Device storage is blocked. Clear this site’s data in browser settings to remove stored wellness records.'); }
  memory.delete(owner); status.delete(owner); notify();
  } finally { deleting.delete(owner); }
}
