/**
 * Persistence: profile + session history live on this device first, so everything works offline. When signed in
 * (lib/supabase.ts) they are also kept in the account (athlete_data, sessions: migration 004), so the same login works
 * on any device, and each camera/video session's headline number goes to the leaderboards. Video never leaves the device.
 * Offline changes wait in local flags (synced, backedUp, profile dirty, deletions) and go up on the next syncHistory().
 */
import { bestJumpCm, isAssessedReport, percentileFor, personalize, standardReps, usualExtreme, type AthleteProfile, type ExerciseDef, type Personalized, type TrainingLevel, type ForensicsReport, type IntegrityReport, type NormResult, type ReadinessInput, type SessionReport } from '@fitzen/engines';
import { storageOwner, supabase } from '../lib/supabase';
import { isLowEndDevice } from '../pose/poseSource';

export interface Profile {
  name: string; weightKg: number | null; heightCm: number | null; age: number | null;
  sex: 'male' | 'female'; sittingHeightCm: number | null; city: string; state: string; sport: string;
  diet: AthleteProfile['diet']; sleepHours: number; trainingDaysPerWeek: number; hasCoach: boolean;
  model: 'lite' | 'full' | 'heavy'; voice: boolean;
  level: TrainingLevel; personalRanges: boolean;
  /** Last local edit; the newer of this device and the account wins when syncing. */
  updatedAt?: string;
}
export interface SavedSession {
  id: string; report: SessionReport; source: 'camera' | 'video' | 'demo';
  /** Uploaded videos only: physics plausibility of the raw landmarks, and container metadata forensics. */
  integrity?: IntegrityReport; forensics?: ForensicsReport;
  /** Post-session Hooper check-in (optional, athlete may skip). */
  readiness?: ReadinessInput;
  cloudId?: string;
  /** Headline number is on the leaderboards. */
  synced?: boolean;
  /** Full session is saved to the account (other devices, coach). */
  backedUp?: boolean;
  batteryRun?: string;
  reference?: { value: number; unit: string; method: string; notes: string };
}

const PROFILE = 'fitzen.profile';
const HISTORY = 'fitzen.history';
const DIRTY = 'fitzen.profileDirty';
const HIDDEN = 'fitzen.hidden'; // cloudIds removed from this device only: never pulled back
const MAX = 60; // ponytail: localStorage cap, move to IndexedDB if users need more history
const volatile = new Map<string, unknown>();
const CLOUD_JUMP_EXERCISES = new Set(['countermovement-jump', 'squat-jump', 'sai-vertical-jump']);
const key = (k: string, owner = storageOwner()) => owner === 'guest' ? k : `${k}.${owner}`;

const read = <T,>(k: string, fallback: T): T => {
  if (volatile.has(k)) return volatile.get(k) as T;
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (k: string, v: unknown): boolean => {
  try { localStorage.setItem(k, JSON.stringify(v)); volatile.delete(k); return true; }
  catch { volatile.set(k, v); return false; } // keep recoverable reports until this tab closes
};

export const DEFAULT_PROFILE: Profile = {
  name: 'Athlete', weightKg: null, heightCm: null, age: null, sex: 'male', sittingHeightCm: null, city: '', state: '', sport: '',
  diet: { pattern: 'vegetarian', mealsPerDay: 3, proteinServingsPerDay: 1, milkServingsPerDay: 1, fruitVegServingsPerDay: 2 },
  sleepHours: 8, trainingDaysPerWeek: 2, hasCoach: false, model: isLowEndDevice() ? 'lite' : 'full', voice: true,
  level: 'beginner', personalRanges: true,
};
// Old profiles only had name/weight/height/age/model/voice; spreading over the defaults migrates them.
export const getProfile = (): Profile => {
  const p = read<Partial<Profile>>(key(PROFILE), {});
  return { ...DEFAULT_PROFILE, ...p, diet: { ...DEFAULT_PROFILE.diet, ...p.diet } };
};
const strip = ({ updatedAt: _, ...rest }: Partial<Profile>) => JSON.stringify(rest);
let pushTimer: ReturnType<typeof setTimeout> | undefined;
/** Saves locally; a real change is stamped and pushed to the account shortly after (typing doesn't spam the network). */
export function saveProfile(p: Profile): boolean {
  if (strip(getProfile()) === strip(p)) return true; // also stops a fresh device pushing defaults over the account
  const ok = write(key(PROFILE), { ...p, updatedAt: new Date().toISOString() });
  if (ok && storageOwner() !== 'guest') { write(key(DIRTY), true); clearTimeout(pushTimer); pushTimer = setTimeout(() => void pushProfile(), 1500); }
  return ok;
}

export const getHistory = (): SavedSession[] => read<SavedSession[]>(key(HISTORY), []);
export const getSession = (id: string) => getHistory().find((s) => s.id === id);
export function saveSession(s: SavedSession): boolean {
  const saved = { ...s, cloudId: s.cloudId ?? crypto.randomUUID() };
  const ok = write(key(HISTORY), [saved, ...getHistory().filter((x) => x.id !== s.id)].slice(0, MAX));
  if (ok) void uploadResult(saved).then(() => backupSession(saved));
  return ok;
}
export const isEligibleSession = (s: SavedSession) => s.source !== 'demo' && s.integrity?.verdict !== 'fail' &&
  !s.forensics?.flags.some((f) => f.severity === 'strong') && isAssessedReport(s.report);
const isCloudMetric = (s: SavedSession, metric: NonNullable<ReturnType<typeof measureOf>>) =>
  metric.metric !== 'jumpHeightCm' || CLOUD_JUMP_EXERCISES.has(s.report.exerciseId);
export function isSessionPersistent(id: string): boolean {
  try { return (JSON.parse(localStorage.getItem(key(HISTORY)) ?? '[]') as SavedSession[]).some((s) => s.id === id); }
  catch { return false; }
}

/** Upload one session's headline number, form score, exercise and date (never video) to the leaderboards.
 *  Skips demo runs, failed integrity checks and signed-out users; never throws, so offline never breaks saving. */
export async function uploadResult(s: SavedSession): Promise<boolean> {
  const m = measureOf(s.report);
  const owner = storageOwner();
  if (!supabase || owner === 'guest' || !isEligibleSession(s) || !m || !isCloudMetric(s, m)) return false;
  try {
    if ((await supabase.auth.getSession()).data.session?.user.id !== owner || storageOwner() !== owner) return false;
    const cloudId = s.cloudId ?? crypto.randomUUID();
    const historyKey = key(HISTORY, owner);
    const current = read<SavedSession[]>(historyKey, []);
    // Persist identity before the request, so even a lost acknowledgement can be retried without duplication.
    if (!write(historyKey, current.map((x) => x.id === s.id ? { ...x, cloudId } : x))) return false;
    const { error } = await supabase.from('results').upsert({
      id: cloudId, user_id: owner,
      // Personal ranges never inflate a board: reps are recounted against the standard catalog target.
      exercise_id: s.report.exerciseId, metric: m.metric, value: standardReps(s.report) ?? m.value, form_score: Math.round(s.report.formScore),
      source: s.source, created_at: s.report.startedAt,
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (!error) write(historyKey, read<SavedSession[]>(historyKey, []).map((x) => x.id === s.id ? { ...x, cloudId, synced: true } : x));
    return !error; // e.g. no profile yet (foreign key) or an implausible value (check constraint)
  } catch { return false; }
}
export type Verdict = 'genuine' | 'review' | 'suspect';
/** Does this look like a real, honest attempt? Shown to coaches next to the evidence (integrity, forensics, movement match). */
export function verdictOf(s: SavedSession): Verdict {
  const r = s.report;
  const wrong = r.mismatched?.length ?? 0, counted = r.reps?.count ?? r.events?.length ?? 0;
  if (s.integrity?.verdict === 'fail' || s.forensics?.flags.some((f) => f.severity === 'strong') || (wrong >= 2 && wrong >= counted)) return 'suspect';
  if (s.integrity?.verdict === 'warn' || s.forensics?.flags.some((f) => f.severity === 'warn') || wrong > 0 || !isAssessedReport(r) || r.trackedPct < 60) return 'review';
  return 'genuine';
}

/** True when the signed-in session still belongs to `owner` (account switches mid-request never write across users). */
const stillOwner = async (owner: string) =>
  !!supabase && owner !== 'guest' && storageOwner() === owner && (await supabase.auth.getSession()).data.session?.user.id === owner;
const markHistory = (owner: string, id: string, patch: Partial<SavedSession>) =>
  write(key(HISTORY, owner), read<SavedSession[]>(key(HISTORY, owner), []).map((x) => x.id === id ? { ...x, ...patch } : x));

/** Save the full session (report, integrity, forensics, check-in) to the account. Demos stay local. Never throws. */
async function backupSession(s: SavedSession): Promise<boolean> {
  const owner = storageOwner();
  if (s.source === 'demo' || !s.cloudId) return false;
  try {
    if (!(await stillOwner(owner))) return false;
    const { cloudId, synced: _s, backedUp: _b, ...data } = s;
    const { error } = await supabase!.from('sessions').upsert({
      id: cloudId, user_id: owner, exercise_id: s.report.exerciseId, source: s.source, started_at: s.report.startedAt,
      verdict: verdictOf(s), form_score: Math.round(s.report.formScore), data,
    }, { onConflict: 'id' });
    if (!error) markHistory(owner, s.id, { backedUp: true, cloudId });
    return !error;
  } catch { return false; }
}

async function pushProfile(): Promise<void> {
  const owner = storageOwner();
  try {
    if (!read<boolean>(key(DIRTY, owner), false) || !(await stillOwner(owner))) return;
    const { updatedAt, ...profile } = read<Profile>(key(PROFILE, owner), DEFAULT_PROFILE);
    const { error } = await supabase!.from('athlete_data').upsert({ user_id: owner, profile, updated_at: updatedAt ?? new Date().toISOString() }, { onConflict: 'user_id' });
    if (!error) write(key(DIRTY, owner), false);
  } catch { /* offline: stays dirty for the next sync */ }
}

/** Bring the account's profile (if newer) and sessions this device doesn't have yet. */
async function pullCloud(owner: string): Promise<void> {
  const [prof, rows] = await Promise.all([
    supabase!.from('athlete_data').select('profile, updated_at').eq('user_id', owner).maybeSingle(),
    supabase!.from('sessions').select('id, data').eq('user_id', owner).order('started_at', { ascending: false }).limit(MAX),
  ]);
  if (storageOwner() !== owner) return;
  const local = read<Partial<Profile>>(key(PROFILE, owner), {});
  const remote = prof.data as { profile: Partial<Profile>; updated_at: string } | null;
  let changed = false;
  if (remote && !read<boolean>(key(DIRTY, owner), false) && (!local.updatedAt || Date.parse(remote.updated_at) > Date.parse(local.updatedAt))) {
    changed = write(key(PROFILE, owner), { ...remote.profile, updatedAt: remote.updated_at });
  }
  const hidden = new Set(read<string[]>(key(HIDDEN, owner), []));
  const history = read<SavedSession[]>(key(HISTORY, owner), []);
  const have = new Set(history.flatMap((x) => [x.cloudId, x.id]));
  const fresh = ((rows.data ?? []) as Array<{ id: string; data: SavedSession }>).filter((r) => !have.has(r.id) && !have.has(r.data.id) && !hidden.has(r.id))
    .map((r) => ({ ...r.data, cloudId: r.id, backedUp: true, synced: false })); // results upsert ignores duplicates, so re-upload is a no-op
  if (fresh.length) changed = write(key(HISTORY, owner), [...history, ...fresh].sort((a, b) => b.report.startedAt.localeCompare(a.report.startedAt)).slice(0, MAX)) || changed;
  if (changed) window.dispatchEvent(new Event(SYNCED));
}
/** Fired after the account's data lands on this device, so open screens can re-read it. */
export const SYNCED = 'fitzen-synced';

export function deleteSession(id: string, everywhere = false): boolean {
  const s = getSession(id);
  if (everywhere && s?.cloudId && storageOwner() !== 'guest') {
    const k = key('fitzen.deletions');
    if (!write(k, [...new Set([...read<string[]>(k, []), s.cloudId])])) return false;
  }
  else if (s?.cloudId && storageOwner() !== 'guest') write(key(HIDDEN), [...new Set([...read<string[]>(key(HIDDEN), []), s.cloudId])]);
  const ok = write(key(HISTORY), getHistory().filter((s) => s.id !== id));
  if (everywhere && ok) void syncHistory();
  return ok;
}
let inflight: Promise<{ uploaded: number; pending: number }> | null = null;
/** Pull the account's data, then push everything waiting on this device. Safe to call often (one run at a time). */
export function syncHistory(): Promise<{ uploaded: number; pending: number }> {
  inflight ??= runSync().finally(() => { inflight = null; });
  return inflight;
}
const needsResult = (x: SavedSession) => { const m = measureOf(x.report); return isEligibleSession(x) && m !== null && isCloudMetric(x, m) && !x.synced; };
const needsBackup = (x: SavedSession) => x.source !== 'demo' && !x.backedUp;
async function runSync(): Promise<{ uploaded: number; pending: number }> {
  const owner = storageOwner();
  let uploaded = 0;
  try { if (await stillOwner(owner)) await pullCloud(owner); } catch { /* offline: push what we can */ }
  await pushProfile();
  for (const s of getHistory().filter((x) => needsResult(x) || needsBackup(x))) {
    if (storageOwner() !== owner) break;
    const cur = { ...s, cloudId: s.cloudId ?? crypto.randomUUID() };
    let ok = !needsResult(cur) || await uploadResult(cur);
    ok = (!needsBackup(cur) || await backupSession(read<SavedSession[]>(key(HISTORY, owner), []).find((x) => x.id === s.id) ?? cur)) && ok;
    if (ok) uploaded++;
  }
  const k = key('fitzen.deletions', owner);
  if (await stillOwner(owner).catch(() => false)) {
    for (const id of read<string[]>(k, [])) {
      if (storageOwner() !== owner) break;
      try {
        const [a, b] = await Promise.all([
          supabase!.from('results').delete().eq('id', id).eq('user_id', owner),
          supabase!.from('sessions').delete().eq('id', id).eq('user_id', owner),
        ]);
        if (!a.error && !b.error) write(k, read<string[]>(k, []).filter((x) => x !== id));
      } catch { break; }
    }
  }
  const pending = read<SavedSession[]>(key(HISTORY, owner), []).filter((x) => needsResult(x) || needsBackup(x)).length
    + read<string[]>(k, []).length + (read<boolean>(key(DIRTY, owner), false) ? 1 : 0);
  return { uploaded, pending };
}
export function importGuestHistory(): boolean {
  if (storageOwner() === 'guest') return false;
  const guest = read<SavedSession[]>(HISTORY, []);
  const mine = getHistory();
  return write(key(HISTORY), [...mine, ...guest.filter((s) => !mine.some((m) => m.id === s.id)).map((s) => ({ ...s, cloudId: crypto.randomUUID(), synced: false, backedUp: false }))].slice(0, MAX));
}
export function saveReadiness(id: string, r: ReadinessInput): void {
  write(key(HISTORY), getHistory().map((s) => (s.id === id ? { ...s, readiness: r, backedUp: false } : s)));
  void syncHistory();
}
export function saveReference(id: string, reference: NonNullable<SavedSession['reference']>): boolean {
  const ok = write(key(HISTORY), getHistory().map((s) => s.id === id ? { ...s, reference, backedUp: false } : s));
  if (ok) void syncHistory();
  return ok;
}
export interface TrainingGoal { exerciseId: string; target: number; unit: string; date: string; createdAt: string; baseline: number | null }
export const getGoal = () => read<TrainingGoal | null>(key('fitzen.goal'), null);
export const saveGoal = (goal: TrainingGoal) => write(key('fitzen.goal'), goal);

/** This person's ranges for an exercise (body, level and usual depth), or null when they chose standard ranges. */
export function personalFor(def: ExerciseDef, p = getProfile()): Personalized | null {
  if (!p.personalRanges) return null;
  const usual = usualExtreme(def, getHistory().filter((s) => s.source !== 'demo').map((s) => s.report));
  return personalize(def, { ageYears: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg, sittingHeightCm: p.sittingHeightCm, level: p.level, usualExtreme: usual });
}

/** Engine profile, or null until age, height and weight are filled in. */
export function toAthlete(p: Profile): AthleteProfile | null {
  if (!p.age || !p.heightCm || !p.weightKg) return null;
  return {
    name: p.name, ageYears: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg, sittingHeightCm: p.sittingHeightCm ?? undefined,
    city: p.city || undefined, state: p.state || undefined, sport: p.sport || undefined,
    diet: p.diet, sleepHours: p.sleepHours, trainingDaysPerWeek: p.trainingDaysPerWeek, hasCoach: p.hasCoach,
  };
}

/** The session's headline number and, where a cited norm exists, its reference-sample percentile/band. */
export function measureOf(r: SessionReport): { value: number; unit: string; metric: 'jumpHeightCm' | 'reps' | 'holdSec' } | null {
  if (!isAssessedReport(r)) return null;
  const j = bestJumpCm(r);
  if (j !== null) return { value: j, unit: 'cm', metric: 'jumpHeightCm' };
  if (r.reps) return { value: r.reps.valid, unit: 'reps', metric: 'reps' };
  if (r.hold) return { value: r.hold.bestSec, unit: 's', metric: 'holdSec' };
  return null;
}
export function normOf(r: SessionReport, a: AthleteProfile | null): NormResult | null {
  const m = measureOf(r);
  return m && a ? percentileFor(r.exerciseId, m.metric, m.value, a.ageYears, a.sex) : null;
}

export const INDIAN_STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];

/** Pointer-follow specular highlight for .glass elements. */
export function glow(e: React.PointerEvent<HTMLElement>): void {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
}
