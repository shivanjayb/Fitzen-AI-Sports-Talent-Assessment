/**
 * Persistence: profile + session history live on this device. When signed in (lib/supabase.ts), each camera/video
 * session's headline number is also uploaded for leaderboards; video never leaves the device.
 */
import { bestJumpCm, percentileFor, type AthleteProfile, type ForensicsReport, type IntegrityReport, type NormResult, type ReadinessInput, type SessionReport } from '@fitzen/engines';
import { supabase } from '../lib/supabase';

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
}

const PROFILE = 'fitzen.profile';
const HISTORY = 'fitzen.history';
const MAX = 60; // ponytail: localStorage cap, move to IndexedDB if users need more history

const read = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota / private mode */ } };

export const DEFAULT_PROFILE: Profile = {
  name: 'Athlete', weightKg: null, heightCm: null, age: null, sex: 'male', sittingHeightCm: null, city: '', state: '', sport: '',
  diet: { pattern: 'vegetarian', mealsPerDay: 3, proteinServingsPerDay: 1, milkServingsPerDay: 1, fruitVegServingsPerDay: 2 },
  sleepHours: 8, trainingDaysPerWeek: 2, hasCoach: false, model: 'full', voice: true,
};
// Old profiles only had name/weight/height/age/model/voice; spreading over the defaults migrates them.
export const getProfile = (): Profile => {
  const p = read<Partial<Profile>>(PROFILE, {});
  return { ...DEFAULT_PROFILE, ...p, diet: { ...DEFAULT_PROFILE.diet, ...p.diet } };
};
export const saveProfile = (p: Profile) => write(PROFILE, p);

export const getHistory = (): SavedSession[] => read<SavedSession[]>(HISTORY, []);
export const getSession = (id: string) => getHistory().find((s) => s.id === id);
export function saveSession(s: SavedSession): void {
  write(HISTORY, [s, ...getHistory().filter((x) => x.id !== s.id)].slice(0, MAX));
  void uploadResult(s);
}

/** Upload one session's headline number, form score, exercise and date (never video) to the leaderboards.
 *  Skips demo runs, failed integrity checks and signed-out users; never throws, so offline never breaks saving. */
export async function uploadResult(s: SavedSession): Promise<boolean> {
  const m = measureOf(s.report);
  if (!supabase || s.source === 'demo' || s.integrity?.verdict === 'fail' || !m) return false;
  try {
    if (!(await supabase.auth.getSession()).data.session) return false;
    const { error } = await supabase.from('results').insert({
      exercise_id: s.report.exerciseId, metric: m.metric, value: m.value, form_score: Math.round(s.report.formScore),
      source: s.source, created_at: s.report.startedAt,
    });
    return !error; // e.g. no profile yet (foreign key) or an implausible value (check constraint)
  } catch { return false; }
}
export function deleteSession(id: string): void { write(HISTORY, getHistory().filter((s) => s.id !== id)); }
export function saveReadiness(id: string, r: ReadinessInput): void {
  write(HISTORY, getHistory().map((s) => (s.id === id ? { ...s, readiness: r } : s)));
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
