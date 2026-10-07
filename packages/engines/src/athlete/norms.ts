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
 * Fit India 5–18 Years v1: printed page 51, push-up bands ages 13–18, for coach-confirmed protocol counts only.
 * No verified compatible table for sit-ups, curl-ups, plank or flamingo holds.
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

const JUMP_IDS = new Set(['countermovement-jump']);
const PUSHUP_IDS = new Set(['sai-push-up', 'push-up']);

export function percentileFor(exerciseId: string, metric: NormMetric, value: number, age: number, sex: 'male' | 'female'): NormResult | null {
  if (!(value >= 0)) return null;
  if (metric === 'jumpHeightCm' && JUMP_IDS.has(exerciseId) && age >= 13 && age <= 21) {
    const z = lmsZ(lmsAt(GABEL_HMAX[sex], 13, age), value / 100);
    // Beyond the published P3–P97 the LMS curve is extrapolation, so report 1–99 only.
    const percentile = Math.min(99, Math.max(1, Math.round(normCdf(z) * 1000) / 10));
    const notes = ['Reference jumps were hands-on-waist on a force plate; Fitzen estimates height from camera flight time.'];
    return { percentile, band: bandForPercentile(percentile), reference: 'International (Gabel 2016, Canada)', n: 715, note: notes.join(' ') };
  }
  if (metric === 'reps' && PUSHUP_IDS.has(exerciseId) && sex === 'male' && age >= 15 && age < 30) {
    const cut = CSEP_PUSHUP[age < 20 ? '15-19' : '20-29'][sex];
    const bands: NormBand[] = ['excellent', 'very good', 'good', 'fair'];
    const i = cut.findIndex((c) => value >= c);
    return {
      percentile: null,
      band: i < 0 ? 'needs work' : bands[i]!,
      reference: 'International (CSEP-PATH 2019, Canada)',
      note: 'Standard full push-ups. The female CSEP reference uses knee push-ups and is not comparable with this test.',
    };
  }
  return null;
}


export const FIT_INDIA_PUSHUP_SOURCE = 'https://fitindia.gov.in/wp-content/uploads/doc/Fitness%20Protocols%20for%20Age%2005-18%20Years%20v1%20(English).pdf';
export type FitIndiaPushupProtocol = 'fit-india-full-push-up-v1' | 'fit-india-modified-push-up-v1';
export type FitIndiaLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'below published range';
export interface FitIndiaPushupResult {
  level: FitIndiaLevel;
  label: string;
  percentile: null;
  reference: string;
  sourceUrl: string;
  sourcePage: 51;
  protocolId: FitIndiaPushupProtocol;
  note: string;
}

// Verified against printed p51, sections 7.9/7.10. Each row contains the strict lower bound of L1
// followed by the six inclusive upper bounds. L7 is strictly above the last bound.
// Girls age13 L2 is >8 to8 in the source: retain the empty band, never interpolate it.
const FIT_INDIA_PUSHUP: Record<'male' | 'female', Record<number, number[]>> = {
  male: {
    13: [8, 9, 10, 11, 13, 15, 16],
    14: [9, 10, 11, 13, 15, 16, 17],
    15: [13, 15, 17, 19, 21, 23, 28],
    16: [15, 17, 19, 21, 23, 28, 33],
    17: [17, 19, 21, 23, 28, 33, 37],
    18: [19, 21, 23, 28, 33, 37, 43],
  },
  female: {
    13: [7, 8, 8, 9, 10, 12, 14],
    14: [10, 11, 13, 15, 16, 17, 19],
    15: [11, 13, 15, 16, 17, 19, 21],
    16: [13, 15, 16, 17, 19, 21, 22],
    17: [15, 16, 17, 19, 21, 22, 24],
    18: [16, 17, 19, 21, 22, 24, 27],
  },
};
const FIT_INDIA_LABELS = ['Work Harder', 'Must Improve', 'Can do Better', 'Good', 'Very Good', 'Athletic', 'Sports Fit'];

/** Requires a coach-confirmed correctly completed count under the published protocol (p23).
 * Camera reps currently allow >90° elbow depth and cannot establish exhaustion/rhythm: do not pass their raw count.
 * Age is completed whole years; no age, sex or protocol extrapolation. Bands are not percentiles or user rankings.
 */
export function fitIndiaPushupBand(reps: number, age: number, sex: 'male' | 'female', protocolId: string): FitIndiaPushupResult | null {
  if (!Number.isInteger(reps) || reps < 0 || !Number.isFinite(age) || age < 13 || age >= 19) return null;
  const expected: FitIndiaPushupProtocol = sex === 'male' ? 'fit-india-full-push-up-v1' : 'fit-india-modified-push-up-v1';
  if (protocolId !== expected) return null;
  const row = FIT_INDIA_PUSHUP[sex]?.[Math.floor(age)];
  if (!row) return null;
  const below = reps <= row[0]!;
  const index = below ? -1 : row.slice(1).findIndex((upper) => reps <= upper);
  const band = index < 0 ? 6 : index;
  return {
    level: below ? 'below published range' : `L${band + 1}` as FitIndiaLevel,
    label: below ? 'Below published range' : FIT_INDIA_LABELS[band]!,
    percentile: null,
    reference: 'Fit India Mission, Fitness Protocols for Age 5–18 Years v1, p51',
    sourceUrl: FIT_INDIA_PUSHUP_SOURCE,
    sourcePage: 51,
    protocolId: expected,
    note: 'Coach-confirmed protocol count; screening comparison, not a percentile or Fitzen leaderboard. Strict published boundaries and empty bands are preserved.',
  };
}
