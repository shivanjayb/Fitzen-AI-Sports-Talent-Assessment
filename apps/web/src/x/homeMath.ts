/** Pure helpers for Home: calendar-day matching, today's energy and the weekly comparison. No imports. */
export interface Pt { date: Date; value: number }
interface Rec { kind: string; date: string; values: Record<string, number> }
const DAY = 864e5;

/** Two day-start dates are the same calendar day. Rounds, so a 23 h or 25 h DST day still matches. */
export const sameDay = (a: Date, b: Date) => Math.round((+a - +b) / DAY) === 0;

/** Energy burned on a date from vitals records (newest first): a total when any source recorded one, else active energy only. */
export function energyOn(records: Rec[], date: string): { value: number; total: boolean } | null {
  const pick = (k: string) => records.find((r) => r.kind === 'vitals' && r.date === date && r.values[k] !== undefined)?.values[k];
  const burned = pick('burned');
  if (burned !== undefined) return { value: burned, total: true };
  const active = pick('active');
  return active === undefined ? null : { value: active, total: false };
}

/** Mean of the 7 days ending `today` against the 7 before, from daily points. Null unless both weeks have a reading. */
export function weekCompare(pts: Pt[], today: Date): { a: number; b: number; na: number; nb: number } | null {
  const a: number[] = [], b: number[] = [];
  for (const p of pts) {
    const ago = Math.round((+today - +p.date) / DAY);
    if (ago >= 0 && ago < 7) a.push(p.value); else if (ago >= 7 && ago < 14) b.push(p.value);
  }
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return a.length && b.length ? { a: mean(a), b: mean(b), na: a.length, nb: b.length } : null;
}

/** "↑ 4.2%" style change; percentage-unit metrics move in points, like the 30-day badges. */
export function changeText(a: number, b: number, percentUnit: boolean): string {
  if (percentUnit) { const d = Math.round(Math.abs(a - b)); return d < 1 ? 'Steady' : `${a > b ? '↑' : '↓'} ${d} pts`; }
  if (!b) return a ? '↑ new' : 'Steady';
  const pct = ((a - b) / Math.abs(b)) * 100;
  if (Math.abs(pct) < 1) return 'Steady';
  return `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : (Math.round(Math.abs(pct) * 10) / 10).toFixed(1)}%`;
}
