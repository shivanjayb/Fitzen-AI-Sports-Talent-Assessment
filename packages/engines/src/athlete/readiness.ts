/**
 * Readiness check-in and the "mind & performance" note after a session.
 *
 * Hooper index: Hooper SL, Mackinnon LT (1995) Sports Med 20:321–327 — four self-ratings (sleep quality, stress,
 * fatigue, muscle soreness), each 1 (very, very good / low) … 7 (very, very bad / high); index = sum (4–28).
 * The paper gives no universal cut-offs, so the level bands below are a Fitzen convention, stated as such.
 * Velocity-loss threshold: Pareja-Blanco et al. (2017) Scand J Med Sci Sports 27:724–735 (VL20 vs VL40).
 *
 * This is a training-readiness tool, not a mental-health assessment, and it never diagnoses anything.
 */
import type { SessionReport } from '../motion/engine.js';

export interface ReadinessInput {
  sleepQuality: number; // 1–7
  stress: number; // 1–7
  fatigue: number; // 1–7
  soreness: number; // 1–7
  mood: number; // 1 (low) – 5 (great)
}
export type ReadinessLevel = 'ready' | 'steady' | 'caution' | 'rest';
export interface ReadinessResult { hooper: number; level: ReadinessLevel; message: string; safety?: string }

const SAFETY =
  'You rated stress very high. Talk to someone you trust — a parent, teacher or coach. Free, confidential help in India: Tele-MANAS 14416 (24×7).';

const clampInt = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));

export function readiness(i: ReadinessInput): ReadinessResult {
  const s = clampInt(i.sleepQuality, 1, 7), st = clampInt(i.stress, 1, 7), f = clampInt(i.fatigue, 1, 7), so = clampInt(i.soreness, 1, 7);
  const mood = clampInt(i.mood, 1, 5);
  const hooper = s + st + f + so;
  // Fitzen bands: any single item at 6–7 or low mood caps the level.
  let level: ReadinessLevel = hooper <= 10 ? 'ready' : hooper <= 15 ? 'steady' : hooper <= 20 ? 'caution' : 'rest';
  if ((Math.max(s, st, f, so) >= 6 || mood <= 1) && (level === 'ready' || level === 'steady')) level = 'caution';
  const message = {
    ready: 'You are fresh — a good day for a test or a hard session.',
    steady: 'Normal training day. Warm up well and keep form strict.',
    caution: 'Body or mind is carrying load. Train lighter, skip max tests, focus on technique.',
    rest: 'Take an easy day: walk, stretch, eat well and sleep early. Test again tomorrow.',
  }[level];
  return { hooper, level, message, safety: st >= 7 || (st >= 6 && mood <= 1) ? SAFETY : undefined };
}

export interface MentalReport { summary: string; signals: string[]; tips: string[]; safety?: string }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Combines session evidence with today's readiness into a short note and 2–3 tips. */
export function mentalReport(report: SessionReport, ready: ReadinessResult | null, history: SessionReport[] = []): MentalReport {
  const signals: string[] = [];
  const tips: string[] = [];
  const past = history.filter((h) => h.exerciseId === report.exerciseId && h.startedAt !== report.startedAt);
  const prev = mean(past.slice(-5).map((h) => h.formScore));
  const trend = Number.isFinite(prev) ? report.formScore - prev : 0;
  if (Number.isFinite(prev)) signals.push(trend >= 3 ? `Form up ${Math.round(trend)} points on your recent average.` : trend <= -5 ? `Form down ${Math.round(-trend)} points on your recent average.` : 'Form is steady versus recent sessions.');

  const r = report.reps;
  if (r && r.count >= 4) {
    if (r.consistencyCv > 25) signals.push(`Rep rhythm was uneven (CV ${Math.round(r.consistencyCv)} %).`);
    if (r.velocityLossPct > 20) signals.push(`Reps slowed by ${Math.round(r.velocityLossPct)} % — clear fatigue by the end.`);
  }
  const mism = report.mismatched.length;
  if (mism >= 2) signals.push(`${mism} movements didn't match the exercise — attention may have drifted.`);
  const wobble = report.hold ? mean(Object.values(report.hold.stability)) : NaN;
  if (Number.isFinite(wobble)) signals.push(wobble > 6 ? `Hold wobbled ±${Math.round(wobble)}° — balance and focus tired.` : 'Hold was steady — good focus.');

  const tired = (r?.velocityLossPct ?? 0) > 20 || ready?.level === 'caution' || ready?.level === 'rest';
  if (tired) tips.push('Stop each set when reps clearly slow down; quality beats quantity (≈ 20 % slow-down is enough).');
  if (mism >= 2 || (r && r.consistencyCv > 25)) tips.push('Pick one cue before each set (e.g. "chest up") and say it in your head every rep.');
  if (wobble > 6) tips.push('Fix your eyes on one point and breathe slowly out through the mouth while holding.');
  if (ready && ready.hooper > 15) tips.push('Sleep 8–10 h tonight and eat a proper meal within an hour of training.');
  if (trend <= -5 && !tired) tips.push('Form dropped — film one slow practice set before your next test.');
  if (tips.length < 2) tips.push('Keep a regular time for training — routine makes effort feel easier.', 'Before a test, 3 slow breaths and picture one perfect rep.');

  const mood = ready ? { ready: 'fresh', steady: 'settled', caution: 'loaded', rest: 'very tired' }[ready.level] : null;
  const summary = [
    mood ? `You checked in ${mood} (Hooper ${ready!.hooper}/28).` : null,
    `Form ${report.formScore}/100 (grade ${report.grade}).`,
    tired ? 'Signs of fatigue — recovery will help more than extra work today.' : 'Mind and body worked together well.',
  ].filter(Boolean).join(' ');

  return { summary, signals, tips: tips.slice(0, 3), safety: ready?.safety };
}
