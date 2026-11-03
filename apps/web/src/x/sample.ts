import { useSyncExternalStore } from 'react';

/** Sample-data workspace: made-up wellness readings so every screen shows its populated design.
 *  Wearable sync is "coming soon", so until a real source exists these fill the Xeyo-style cards. */

const KEY = 'fitzen-sample-data';
const listeners = new Set<() => void>();
const readOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
let on = readOn();
export const useSampleMode = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => on);
export function setSampleMode(value: boolean) {
  on = value;
  try { localStorage.setItem(KEY, value ? 'on' : 'off'); } catch { /* private mode: keep in memory */ }
  listeners.forEach((f) => f());
}

export interface MetricDef {
  id: string; label: string; unit: string; chart: 'bars' | 'line'; digits: number;
  base: number; swing: number; min: number; max: number;
  what: string; context: string; source?: [string, string];
}

export const METRICS: Record<string, MetricDef> = {
  recovery: { id: 'recovery', label: 'Recovery', unit: '%', chart: 'bars', digits: 0, base: 68, swing: 13, min: 20, max: 99,
    what: 'How ready your body looks for strain today, from overnight heart rate variability, resting heart rate and sleep.',
    context: 'Read it as a trend against your own 30-day average, not as a grade.' },
  hrv: { id: 'hrv', label: 'HRV', unit: 'ms', chart: 'line', digits: 0, base: 62, swing: 9, min: 25, max: 120,
    what: 'Heart rate variability: the small changes in time between heartbeats while you sleep.',
    context: 'Higher than your usual often means you have recovered well; one low night matters less than a run of them.' },
  rhr: { id: 'rhr', label: 'Resting heart rate', unit: 'bpm', chart: 'line', digits: 0, base: 58, swing: 3, min: 40, max: 90,
    what: 'Your lowest steady heart rate overnight.',
    context: 'A rise of a few beats over several days can follow hard training, illness, alcohol or poor sleep.' },
  sleep: { id: 'sleep', label: 'Sleep', unit: 'hours', chart: 'bars', digits: 1, base: 7.9, swing: .5, min: 4, max: 10,
    what: 'The time your device estimated you were asleep, excluding detected awake time.',
    context: 'Look at duration alongside regularity and how rested you feel.' },
  strain: { id: 'strain', label: 'Strain', unit: '/ 21', chart: 'bars', digits: 1, base: 11.7, swing: 2, min: 2, max: 21,
    what: 'How much load your heart was under across the day, on a 0–21 scale.',
    context: 'Match strain to recovery: push on high-recovery days, go easier when recovery is low.' },
  hr: { id: 'hr', label: 'Heart rate', unit: 'bpm', chart: 'line', digits: 0, base: 66, swing: 3, min: 45, max: 110,
    what: 'Your average heart rate across the day.',
    context: 'It moves with activity, caffeine, heat and stress; compare like-for-like days.' },
  spo2: { id: 'spo2', label: 'Blood oxygen', unit: '%', chart: 'line', digits: 1, base: 96.8, swing: .7, min: 90, max: 100,
    what: 'The share of your blood’s haemoglobin carrying oxygen, measured overnight.', context: 'Most healthy readings sit between 95% and 100%.' },
  resp: { id: 'resp', label: 'Respiratory rate', unit: 'breaths/min', chart: 'line', digits: 1, base: 14.6, swing: .5, min: 10, max: 22,
    what: 'Breaths per minute while you sleep.', context: 'It is usually very stable; a sustained change is worth noticing.' },
  skin: { id: 'skin', label: 'Skin temperature', unit: '°C', chart: 'line', digits: 1, base: 33.9, swing: .3, min: 31, max: 36,
    what: 'Overnight skin temperature from the wrist.', context: 'Read it relative to your own baseline rather than as an absolute value.' },
  steps: { id: 'steps', label: 'Steps', unit: 'steps', chart: 'bars', digits: 0, base: 8400, swing: 2600, min: 800, max: 22000,
    what: 'Steps counted across the day.', context: 'Consistency across the week matters more than a single big day.' },
  active: { id: 'active', label: 'Active energy', unit: 'kcal', chart: 'bars', digits: 0, base: 640, swing: 160, min: 100, max: 1600,
    what: 'Energy burned through movement, on top of your resting energy.', context: 'Estimates vary between devices; follow your own trend.' },
  burned: { id: 'burned', label: 'Calories burned', unit: 'kcal', chart: 'bars', digits: 0, base: 2300, swing: 180, min: 1400, max: 4000,
    what: 'Resting plus active energy for the day.', context: 'Compare it with what you ate to see your daily balance.' },
  weight: { id: 'weight', label: 'Weight', unit: 'kg', chart: 'line', digits: 1, base: 71.6, swing: .4, min: 30, max: 250,
    what: 'Body weight entries you saved.', context: 'Weigh at the same time of day; daily water shifts of 0.5–1 kg are normal.' },
  deep: { id: 'deep', label: 'Deep sleep', unit: 'hours', chart: 'bars', digits: 1, base: 1.45, swing: .25, min: .3, max: 3,
    what: 'Slow-wave sleep, when the body does most physical recovery.', context: 'It is front-loaded in the night.' },
  rem: { id: 'rem', label: 'REM sleep', unit: 'hours', chart: 'bars', digits: 1, base: 1.7, swing: .25, min: .3, max: 3,
    what: 'Rapid-eye-movement sleep, linked to memory and learning.', context: 'It is longer towards the morning.' },
  light: { id: 'light', label: 'Light sleep', unit: 'hours', chart: 'bars', digits: 1, base: 4.6, swing: .35, min: 2, max: 7,
    what: 'The lighter stages that make up most of the night.', context: 'Normal and necessary; it links the deeper stages.' },
  awake: { id: 'awake', label: 'Awake time', unit: 'min', chart: 'bars', digits: 0, base: 32, swing: 10, min: 5, max: 90,
    what: 'Time detected awake after you first fell asleep.', context: 'Short awakenings are normal and mostly not remembered.' },
  efficiency: { id: 'efficiency', label: 'Sleep efficiency', unit: '%', chart: 'line', digits: 0, base: 92, swing: 3, min: 70, max: 99,
    what: 'Time asleep as a share of time in bed.', context: 'Above 85% is generally considered good.' },
  performance: { id: 'performance', label: 'Sleep performance', unit: '%', chart: 'bars', digits: 0, base: 88, swing: 6, min: 40, max: 100,
    what: 'Sleep you got as a share of the sleep you needed.', context: 'Needed sleep rises after hard training days.' },
};

/** Deterministic pseudo-random series (same numbers on every load), newest value last. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

const DAY = 864e5;
export const dayStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export interface Point { date: Date; value: number }

export function series(id: string, days = 90): Point[] {
  return seriesFull(id, Math.max(days, 90)).slice(-days); // same value for a date whatever the window
}
function seriesFull(id: string, days: number): Point[] {
  const m = METRICS[id]!;
  const r = rng(id);
  const today = dayStart();
  let walk = 0;
  const out: Point[] = [];
  for (let i = days - 1; i >= 0; i--) {
    walk = walk * .7 + (r() - .5) * 1.1;
    const v = m.base + m.swing * (walk + Math.sin((days - i) / 4.3) * .45);
    const k = 10 ** m.digits;
    out.push({ date: new Date(today.getTime() - i * DAY), value: Math.round(Math.min(m.max, Math.max(m.min, v)) * k) / k });
  }
  return out;
}

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export const fmt = (v: number, digits = 0) => v.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** Badge vs the 30-day average: "↑ 11%" / "↓ 13 pts" (percent metrics) / "Steady" within 1%. */
export function versusAverage(id: string, pts = series(id, 30)) {
  const m = METRICS[id]!;
  const last = pts[pts.length - 1]!.value;
  const avg = mean(pts.map((p) => p.value));
  const pct = ((last - avg) / avg) * 100;
  if (Math.abs(pct) < 1) return { text: 'Steady', title: 'Within 1% of your 30-day average', avg, last };
  const up = pct > 0, arrow = up ? '↑' : '↓';
  if (m.unit === '%') { const d = Math.round(Math.abs(last - avg)); return { text: `${arrow} ${d} pts`, title: `${d} points ${up ? 'above' : 'below'} your 30-day average`, avg, last }; }
  const p = Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.round(Math.abs(pct) * 10) / 10;
  return { text: `${arrow} ${p}%`, title: `${p}% ${up ? 'above' : 'below'} your 30-day average`, avg, last };
}
