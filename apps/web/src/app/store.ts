/**
 * Persistence: profile + session history live on this device. When signed in (lib/supabase.ts), each camera/video
 * session's headline number is also uploaded for leaderboards; video never leaves the device.
 */
import { bestJumpCm, isAssessedReport, percentileFor, type AthleteProfile, type ForensicsReport, type IntegrityReport, type NormResult, type ReadinessInput, type SessionReport } from '@fitzen/engines';
import { storageOwner, supabase } from '../lib/supabase';

export interface Profile {
  name: string; weightKg: number | null; heightCm: number | null; age: number | null;
  sex: 'male' | 'female'; sittingHeightCm: number | null; city: string; state: string; sport: string;
  diet: AthleteProfile['diet']; sleepHours: number; trainingDaysPerWeek: number; hasCoach: boolean;
  model: 'lite' | 'full' | 'heavy'; voice: boolean;
}
export interface SavedSession {
  id: string; report: SessionReport; source: 'camera' | 'video' | 'demo';
  /** Uploaded videos only: physics plausibility of the raw landmarks, and container metadata forensics. */
  integrity?: IntegrityReport; forensics?: ForensicsReport;
  /** Post-session Hooper check-in (optional, athlete may skip). */
  readiness?: ReadinessInput;
  cloudId?: string;
  synced?: boolean;
  batteryRun?: string;
  reference?: { value: number; unit: string; method: string; notes: string };
}

const PROFILE = 'fitzen.profile';
const HISTORY = 'fitzen.history';
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
  sleepHours: 8, trainingDaysPerWeek: 2, hasCoach: false, model: 'full', voice: true,
};
// Old profiles only had name/weight/height/age/model/voice; spreading over the defaults migrates them.
export const getProfile = (): Profile => {
  const p = read<Partial<Profile>>(key(PROFILE), {});
  return { ...DEFAULT_PROFILE, ...p, diet: { ...DEFAULT_PROFILE.diet, ...p.diet } };
};
export const saveProfile = (p: Profile) => write(key(PROFILE), p);

export const getHistory = (): SavedSession[] => read<SavedSession[]>(key(HISTORY), []);
export const getSession = (id: string) => getHistory().find((s) => s.id === id);
export function saveSession(s: SavedSession): boolean {
  const saved = { ...s, cloudId: s.cloudId ?? crypto.randomUUID() };
  const ok = write(key(HISTORY), [saved, ...getHistory().filter((x) => x.id !== s.id)].slice(0, MAX));
  if (ok) void uploadResult(saved);
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
      exercise_id: s.report.exerciseId, metric: m.metric, value: m.value, form_score: Math.round(s.report.formScore),
      source: s.source, created_at: s.report.startedAt,
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (!error) write(historyKey, read<SavedSession[]>(historyKey, []).map((x) => x.id === s.id ? { ...x, cloudId, synced: true } : x));
    return !error; // e.g. no profile yet (foreign key) or an implausible value (check constraint)
  } catch { return false; }
}
export function deleteSession(id: string, everywhere = false): boolean {
  const s = getSession(id);
  if (everywhere && s?.cloudId && storageOwner() !== 'guest') {
    const k = key('fitzen.deletions');
    if (!write(k, [...new Set([...read<string[]>(k, []), s.cloudId])])) return false;
  }
  const ok = write(key(HISTORY), getHistory().filter((s) => s.id !== id));
  if (everywhere && ok) void syncHistory();
  return ok;
}
export async function syncHistory(): Promise<{ uploaded: number; pending: number }> {
  const owner = storageOwner();
  let uploaded = 0;
  for (const s of getHistory().filter((x) => {
    const metric = measureOf(x.report);
    return isEligibleSession(x) && metric !== null && isCloudMetric(x, metric) && !x.synced;
  })) {
    if (storageOwner() !== owner) break;
    if (await uploadResult(s)) uploaded++;
  }
  const k = key('fitzen.deletions', owner);
  if (supabase && owner !== 'guest' && storageOwner() === owner && (await supabase.auth.getSession()).data.session?.user.id === owner) {
    for (const id of read<string[]>(k, [])) {
      if (storageOwner() !== owner) break;
      try {
        const { error } = await supabase.from('results').delete().eq('id', id).eq('user_id', owner);
        if (!error) write(k, read<string[]>(k, []).filter((x) => x !== id));
      } catch { break; }
    }
  }
  const pending = read<SavedSession[]>(key(HISTORY, owner), []).filter((x) => {
    const metric = measureOf(x.report);
    return isEligibleSession(x) && metric !== null && isCloudMetric(x, metric) && !x.synced;
  }).length + read<string[]>(k, []).length;
  return { uploaded, pending };
}
export function importGuestHistory(): boolean {
  if (storageOwner() === 'guest') return false;
  const guest = read<SavedSession[]>(HISTORY, []);
  const mine = getHistory();
  return write(key(HISTORY), [...mine, ...guest.filter((s) => !mine.some((m) => m.id === s.id)).map((s) => ({ ...s, cloudId: crypto.randomUUID(), synced: false }))].slice(0, MAX));
}
export function saveReadiness(id: string, r: ReadinessInput): void {
  write(key(HISTORY), getHistory().map((s) => (s.id === id ? { ...s, readiness: r } : s)));
}
export function saveReference(id: string, reference: NonNullable<SavedSession['reference']>): boolean {
  return write(key(HISTORY), getHistory().map((s) => s.id === id ? { ...s, reference } : s));
}
export interface TrainingGoal { exerciseId: string; target: number; unit: string; date: string; createdAt: string; baseline: number | null }
export const getGoal = () => read<TrainingGoal | null>(key('fitzen.goal'), null);
export const saveGoal = (goal: TrainingGoal) => write(key('fitzen.goal'), goal);

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
