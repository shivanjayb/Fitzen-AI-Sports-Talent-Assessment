/**
 * Norm lookup for the metrics Fitzen actually measures. A norm percentile compares a result with a published
 * reference sample — it is NOT a ranking against other Fitzen users and must never be shown as a leaderboard.
 *
 * Tables embedded (only rows checked against the source):
 *  - Jump height: Gabel L, Macdonald HM, Nettlefold L, Race D, McKay HA (2016). Reference data for jumping
 *    mechanography in Canadian children, adolescents and young adults. J Musculoskelet Neuronal Interact
 *    16(4):283–295, Table 7 (Hmax, hands-on-waist CMJ, force plate; n = 715, 2017 observations), ages 13–21.
 *  - Push-ups: CSEP-PATH Resource Manual 2nd ed. (2019), push-up health-benefit ratings, ages 15–19 and 20–29
 *    (women: modified/knee push-ups), as reprinted in ACE Push-up Assessment Protocol (2020). Bands only.
 *
 * Not embedded (returns null): Khelo India / Fit India age-sex norm tables (official PDFs could not be retrieved
 * to verify rows), sit-ups, curl-ups, plank and flamingo holds. Add rows here once verified from the source.
 */
import { lmsAt, lmsZ } from './body.js';

export type NormBand = 'needs work' | 'fair' | 'good' | 'very good' | 'excellent';
export type NormMetric = 'jumpHeightCm' | 'reps' | 'holdSec';
export interface NormResult {
  /** 0–100 against the reference sample; null when the source gives only bands. */
  percentile: number | null;
  band: NormBand;
  reference: string;
  n?: number;
  note?: string;
}

// Gabel 2016 Table 7, ages 13..21: [L, M (m), S].
const GABEL_HMAX: Record<'male' | 'female', Array<[number, number, number]>> = {
  male: [[0.6, 0.35, 0.16], [0.85, 0.37, 0.15], [1.02, 0.4, 0.14], [1.06, 0.43, 0.14], [1.0, 0.44, 0.13], [0.86, 0.46, 0.14], [0.68, 0.46, 0.15], [0.48, 0.46, 0.16], [0.27, 0.46, 0.18]],
  female: [[1, 0.32, 0.13], [1, 0.32, 0.13], [1, 0.33, 0.13], [1, 0.33, 0.13], [1, 0.33, 0.13], [1, 0.33, 0.13], [1, 0.33, 0.13], [1, 0.33, 0.13], [1, 0.33, 0.13]],
};
/** Median reference jump height (m) at a (fractional) age — used by the projection for age-related change. */
export const gabelMedianM = (age: number, sex: 'male' | 'female') => lmsAt(GABEL_HMAX[sex], 13, age)[1];

// CSEP-PATH push-up minimums for Excellent / Very good / Good / Fair (below Fair = Needs improvement).
const CSEP_PUSHUP: Record<'15-19' | '20-29', Record<'male' | 'female', [number, number, number, number]>> = {
  '15-19': { male: [39, 29, 23, 18], female: [33, 25, 18, 12] },
  '20-29': { male: [36, 29, 22, 17], female: [30, 21, 15, 10] },
};

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Fitzen display convention (not from a source): quintiles of the reference percentile. */
export const bandForPercentile = (p: number): NormBand =>
  p >= 80 ? 'excellent' : p >= 60 ? 'very good' : p >= 40 ? 'good' : p >= 20 ? 'fair' : 'needs work';

const JUMP_IDS = new Set(['sai-vertical-jump', 'countermovement-jump', 'squat-jump']);
const PUSHUP_IDS = new Set(['sai-push-up', 'push-up']);

export function percentileFor(exerciseId: string, metric: NormMetric, value: number, age: number, sex: 'male' | 'female'): NormResult | null {
  if (!(value >= 0)) return null;
  if (metric === 'jumpHeightCm' && JUMP_IDS.has(exerciseId) && age >= 13) {
    const z = lmsZ(lmsAt(GABEL_HMAX[sex], 13, age), value / 100);
    // Beyond the published P3–P97 the LMS curve is extrapolation, so report 1–99 only.
    const percentile = Math.min(99, Math.max(1, Math.round(normCdf(z) * 1000) / 10));
    const notes = ['Reference jumps were hands-on-waist on a force plate; Fitzen estimates height from camera flight time.'];
    if (exerciseId === 'sai-vertical-jump') notes.push('Arm swing adds roughly 10 % height, so this percentile reads high.');
    if (age > 21) notes.push('Age > 21 compared with the 21-year row.');
    return { percentile, band: bandForPercentile(percentile), reference: 'International (Gabel 2016, Canada)', n: 715, note: notes.join(' ') };
  }
  if (metric === 'reps' && PUSHUP_IDS.has(exerciseId) && age >= 15 && age < 30) {
    const cut = CSEP_PUSHUP[age < 20 ? '15-19' : '20-29'][sex];
    const bands: NormBand[] = ['excellent', 'very good', 'good', 'fair'];
    const i = cut.findIndex((c) => value >= c);
    return {
      percentile: null,
      band: i < 0 ? 'needs work' : bands[i]!,
      reference: 'International (CSEP-PATH 2019, Canada)',
      note: sex === 'female' ? 'Women’s bands are for knee push-ups; full push-ups are harder, so this band is conservative.' : undefined,
    };
  }
  return null;
}
