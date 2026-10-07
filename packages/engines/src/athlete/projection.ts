/**
 * Growth projection: where a jump result is likely to be in 4 / 8 / 12 weeks under "current habits" vs
 * "follow the plan". Ranges, not promises.
 *
 * Sourced numbers:
 *  - Training effect: Markovic G (2007) Br J Sports Med 41:349–355, doi:10.1136/bjsm.2007.035113. Pooled plyometric
 *    gains (95 % CI): CMJ 8.7 % (7.0–10.4), CMJ with arm swing 7.5 % (4.2–10.8), squat jump 4.7 % (1.8–7.6).
 *    Lesinski M et al. (2016) Br J Sports Med 50:781–795, doi:10.1136/bjsports-2015-095497 (youth athletes: resistance
 *    training SMD 0.8–1.09 on strength & jump) supports applying these to 13–18 year olds.
 *  - Age-related change without training: difference between Gabel 2016 median jump heights at today's age and the
 *    target date (cross-sectional reference — see norms.ts).
 * Assumptions (Fitzen, not from a source — listed in the output too):
 *  - The meta-analytic gain is reached after ~10 weeks; progress follows w/(w+5), normalised to 1 at 10 weeks.
 *  - Drivers (novice status, headroom, protein, sleep, training days) only move the estimate INSIDE the published CI.
 *  - Age-related change is uncertain by ±50 %.
 */
import { isAssessedReport, type SessionReport } from '../motion/engine.js';
import { computePotential, type PotentialResult } from '../potential/potentialScore.js';
import { assessDiet, maturityOffset } from './body.js';
import { gabelMedianM, percentileFor } from './norms.js';
import type { AthleteProfile, EstimateRange } from './types.js';

const GAIN: Record<string, { lo: number; mid: number; hi: number; label: string }> = {
  'countermovement-jump': { lo: 7.0, mid: 8.7, hi: 10.4, label: 'CMJ' },
  'sai-vertical-jump': { lo: 4.2, mid: 7.5, hi: 10.8, label: 'CMJ with arm swing' },
  'squat-jump': { lo: 1.8, mid: 4.7, hi: 7.6, label: 'squat jump' },
};

export interface ProjectionPoint { week: number; current: EstimateRange; plan: EstimateRange }
export interface MetricProjection { metric: 'jumpHeightCm'; exerciseId: string; unit: 'cm'; baseline: number; percentile: number | null; points: ProjectionPoint[]; basis: string }
export interface TalentSignal { currentPerformance: number; potentialScore: number; confidenceScore: number; maturityOffsetYears: number; maturityMethod: string; summary: string; potential: PotentialResult }
export interface GrowthProjection { metrics: MetricProjection[]; drivers: string[]; assumptions: string[]; talent: TalentSignal | null }
export interface ProjectOptions { weeks?: number[] }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const progress = (w: number) => w / (w + 5) / (10 / 15);

/** Best jump (cm) in a session, or null. */
export const bestJumpCm = (r: SessionReport): number | null => {
  if (!isAssessedReport(r)) return null;
  const hs = (r.events ?? []).map((e) => e.jumpHeightCm).filter((h): h is number => h !== undefined && h > 0);
  return hs.length ? Math.max(...hs) : null;
};

export function projectGrowth(p: AthleteProfile, history: SessionReport[], opts: ProjectOptions = {}): GrowthProjection {
  const weeks = opts.weeks ?? [4, 8, 12];
  const diet = assessDiet(p);
  const sleepOk = clamp(p.sleepHours / diet.sleepTargetH.low, 0, 1);
  const protOk = clamp(diet.proteinAdequacy, 0, 1);
  const daysOk = clamp(p.trainingDaysPerWeek / 3, 0, 1);
  const novice = !p.hasCoach && p.trainingDaysPerWeek < 3;
  const drivers: string[] = [
    novice ? 'New to structured training — beginners usually adapt fastest.' : 'Already training regularly — gains come a little slower.',
    `Protein ≈ ${Math.round(protOk * 100)} % of target (${diet.proteinIntakeG} of ${diet.proteinNeedG.target} g/day).`,
    `Sleep ${p.sleepHours} h vs ${diet.sleepTargetH.low}–${diet.sleepTargetH.high} h advised.`,
    `${p.trainingDaysPerWeek} training day(s) a week; the plan asks for ≥ 3.`,
  ];
  const dates = history.map((h) => Date.parse(h.startedAt)).filter(Number.isFinite).sort((a, b) => a - b);
  if (dates.length >= 2) {
    const perWeek = (dates.length - 1) / Math.max(1, (dates[dates.length - 1]! - dates[0]!) / 6048e5);
    drivers.push(`History: ${r1(perWeek)} sessions a week so far.`);
  }

  const metrics: MetricProjection[] = [];
  const jumpSessions = history.filter((h) => GAIN[h.exerciseId] && bestJumpCm(h) !== null).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const last = jumpSessions[jumpSessions.length - 1];
  if (last) {
    const id = last.exerciseId, g = GAIN[id]!;
    const recent = jumpSessions.filter((s) => s.exerciseId === id).slice(-3);
    const base = Math.max(...recent.map((s) => bestJumpCm(s)!));
    const pct = percentileFor(id, 'jumpHeightCm', base, p.ageYears, p.sex)?.percentile ?? null;
    const headroom = pct === null ? 0.5 : 1 - pct / 100;
    const q = (Number(novice) + headroom) / 2; // position inside the CI when following the plan
    const habit = (protOk + sleepOk + daysOk) / 3; // how much of the low-CI gain current habits keep
    const trainsNow = p.trainingDaysPerWeek >= 2;
    const matchingAgeReference = id === 'countermovement-jump' && p.ageYears >= 13 && p.ageYears <= 21;
    const m0 = gabelMedianM(p.ageYears, p.sex);
    const points = weeks.map((w) => {
      const nat = matchingAgeReference ? gabelMedianM(Math.min(21, p.ageYears + w / 52), p.sex) / m0 - 1 : 0;
      const s = progress(w);
      const natLo = base * nat * 0.5, natHi = base * nat * 1.5;
      const planLo = base * (g.lo / 100) * s, planHi = base * ((g.lo + (g.hi - g.lo) * q) / 100) * s;
      const curHi = trainsNow ? base * (g.lo / 100) * s * habit : 0;
      return {
        week: w,
        current: { low: r1(base + natLo), high: r1(base + natHi + curHi) },
        plan: { low: r1(base + natLo + planLo), high: r1(base + natHi + planHi) },
      };
    });
    metrics.push({ metric: 'jumpHeightCm', exerciseId: id, unit: 'cm', baseline: r1(base), percentile: pct, points, basis: `Markovic 2007 ${g.label} +${g.mid} % (95 % CI ${g.lo}–${g.hi})${matchingAgeReference ? ' + age-related change (Gabel 2016)' : '; no matching age-related reference'}` });
  }

  const assumptions = [
    'Published gains are reached after about 10 weeks of 2–3 plyometric/strength sessions a week (Fitzen assumption).',
    'Your drivers only move the estimate inside the published 95 % range — they never push beyond it.',
    'Age-related change comes from a cross-sectional reference and is taken as ± 50 % uncertain.',
    '"Follow the plan" = ≥ 3 training days/week, protein target met, recommended sleep, and the form fixes from your report.',
    'Only jump height is projected: no published training-response rate was verified for rep or hold tests.',
  ];

  // Talent signal via the existing potential engine (needs a jump).
  let talent: TalentSignal | null = null;
  if (last) {
    const comparable = jumpSessions.filter((s) => s.exerciseId === last.exerciseId);
    const heights = comparable.map((s) => bestJumpCm(s)!);
    const mu = heights.reduce((a, b) => a + b, 0) / heights.length;
    const cv = heights.length > 1 ? Math.sqrt(heights.reduce((a, h) => a + (h - mu) ** 2, 0) / (heights.length - 1)) / mu : 0.1;
    const best = Math.max(...heights);
    // Sayers et al. (1999) Med Sci Sports Exerc 31:572–577: peak power W = 60.7·jump(cm) + 45.3·mass − 2055.
    const watts = 60.7 * best + 45.3 * p.weightKg - 2055;
    const bestSession = comparable.find((s) => bestJumpCm(s) === best)!;
    const symDeg = Object.values(bestSession.symmetry);
    const symmetryScore = symDeg.length ? clamp(100 - 4 * (symDeg.reduce((a, b) => a + b, 0) / symDeg.length), 0, 100) : 85; // Fitzen mapping: 1° ≈ 4 points
    const potential = computePotential({
      ageYears: p.ageYears, sex: p.sex, heightCm: p.heightCm, massKg: p.weightKg,
      jumpHeightM: best / 100, relativePowerWkg: Math.max(0, watts / p.weightKg),
      movementQuality: bestSession.formScore, symmetryScore, jumpCv: cv, assessmentCount: comparable.length,
    });
    const mat = maturityOffset(p);
    const offset = mat?.offsetYears ?? potential.maturityOffsetYears;
    const stage = offset < -1 ? 'before your growth spurt' : offset <= 1 ? 'around your growth spurt' : 'past your growth spurt';
    talent = {
      currentPerformance: potential.currentPerformance,
      potentialScore: potential.potentialScore,
      confidenceScore: potential.confidenceScore,
      maturityOffsetYears: offset,
      maturityMethod: mat ? `${mat.method} (± ${mat.seYears} y)` : 'Fitzen potential engine estimate',
      summary: `Experimental, unvalidated research signal — not a selection decision. Today ${potential.currentPerformance}/100, estimated potential ${potential.potentialScore}/100 (confidence ${potential.confidenceScore} %). You are ${stage}, so ${offset < 1 ? 'much of your strength is still to come' : 'results now mostly reflect training'}.`,
      potential,
    };
  }
  return { metrics, drivers, assumptions, talent };
}
