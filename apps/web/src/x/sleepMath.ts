/** Sleep schedule maths on clock times stored as minutes after local midnight (0–1440). Pure: no imports. */
const DAY_MIN = 1440;
const wrap = (m: number) => ((m % DAY_MIN) + DAY_MIN) % DAY_MIN;

/** Hours asleep from bedtime to wake time, crossing midnight when wake is earlier than bed, minus awake minutes. */
export const sleepHours = (bed: number, wake: number, awakeMin = 0) => (wrap(wake - bed) - awakeMin) / 60;

/** Signed shortest distance a − b on the clock, in minutes (−720..720). */
export const clockDiff = (a: number, b: number) => wrap(a - b + 720) - 720;

/** Circular mean and standard deviation of clock times, so 23:50 and 00:10 average to midnight. */
export function circular(mins: number[]): { mean: number; sd: number } | null {
  if (!mins.length) return null;
  const a = mins.map((m) => (m / DAY_MIN) * 2 * Math.PI);
  const c = a.reduce((s, x) => s + Math.cos(x), 0) / a.length, s = a.reduce((t, x) => t + Math.sin(x), 0) / a.length;
  const r = Math.min(1, Math.hypot(c, s));
  return { mean: wrap((Math.atan2(s, c) / (2 * Math.PI)) * DAY_MIN), sd: (Math.sqrt(-2 * Math.log(Math.max(r, 1e-9))) * DAY_MIN) / (2 * Math.PI) };
}

/** Hours short of the goal, summed over the given nights (nights above goal do not pay debt back). */
export const sleepDebt = (hours: number[], goal: number) => hours.reduce((a, h) => a + Math.max(0, goal - h), 0);

/** Social jet lag: gap between the average mid-sleep on free days (waking Sat/Sun) and on work days, in minutes. */
export function socialJetLag(nights: { weekday: number; bed: number; wake: number }[]): number | null {
  const mid = (n: { bed: number; wake: number }) => wrap(n.bed + wrap(n.wake - n.bed) / 2);
  const free = circular(nights.filter((n) => n.weekday === 0 || n.weekday === 6).map(mid));
  const work = circular(nights.filter((n) => n.weekday !== 0 && n.weekday !== 6).map(mid));
  return free && work ? Math.abs(clockDiff(free.mean, work.mean)) : null;
}

export const clock = (m: number) => { const t = Math.round(wrap(m)) % DAY_MIN; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
export const parseClock = (s: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s); return m && +m[1]! < 24 && +m[2]! < 60 ? +m[1]! * 60 + +m[2]! : null; };

/** Whole calendar days from `d` back to `today` (0 = same day), ignoring clock time and DST. */
export const daysBefore = (d: Date, today: Date) =>
  Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
