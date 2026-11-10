/** Recovery when no device supplies one: a simple, explained estimate from the user's own HRV, resting HR and sleep. Pure: no imports. */
export interface Pt { date: Date; value: number }
export interface Reading { value: number; estimate: boolean }

export const RECOVERY_FORMULA = 'Fitzen estimate: 50 + 20 × the average of how far today’s HRV (up is good) and resting heart rate (down is good) sit from your 30-day baseline, in standard deviations, and last night’s sleep against your goal.';

const DAY = 864e5;
const offset = (d: Date, day: Date) => Math.round((+d - +day) / DAY);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Today's value against the 30 days before it, in standard deviations. Needs 7 days in the window including today. */
function zScore(pts: Pt[], day: Date): number | null {
  const window = pts.filter((p) => { const o = offset(p.date, day); return o <= 0 && o > -30; });
  const today = window.find((p) => offset(p.date, day) === 0);
  if (!today || window.length < 7) return null;
  const base = window.filter((p) => p !== today).map((p) => p.value), m = avg(base);
  const sd = Math.max(1, Math.sqrt(avg(base.map((v) => (v - m) ** 2))));
  return clamp((today.value - m) / sd, -2.5, 2.5);
}

/** 0–100, or null when neither HRV nor resting HR has 7 days of history ending on `day`. */
export function recoveryEstimate(hrv: Pt[], rhr: Pt[], sleep: Pt[], goal: number, day: Date): number | null {
  const zh = zScore(hrv, day), zr = zScore(rhr, day);
  if (zh === null && zr === null) return null;
  const night = sleep.find((p) => offset(p.date, day) === 0);
  const parts = [zh, zr === null ? null : -zr, night ? clamp((night.value - goal) / 1.5, -2.5, 2.5) : null].filter((z): z is number => z !== null);
  return Math.round(clamp(50 + 20 * avg(parts), 0, 100));
}

/** Recovery for each day: a device value when recorded, else the Fitzen estimate, else null. `get` returns a metric's daily points. */
export function recoveryDays(days: Date[], get: (id: string) => Pt[], goal: number): (Reading | null)[] {
  const [rec, hrv, rhr, sleep] = ['recovery', 'hrv', 'rhr', 'sleep'].map(get) as [Pt[], Pt[], Pt[], Pt[]];
  return days.map((day) => {
    const real = rec.find((p) => offset(p.date, day) === 0);
    if (real) return { value: real.value, estimate: false };
    const v = recoveryEstimate(hrv, rhr, sleep, goal, day);
    return v === null ? null : { value: v, estimate: true };
  });
}

export const readiness = (v: number) => v >= 67 ? 'good day for a hard session' : v >= 34 ? 'a moderate session fits today' : 'keep it light today';
