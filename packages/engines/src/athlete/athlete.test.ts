import { describe, it, expect } from 'vitest';
import type { SessionReport } from '../motion/engine.js';
import { assessDiet, bmiAssessment, maturityOffset } from './body.js';
import { normCdf, percentileFor } from './norms.js';
import { projectGrowth } from './projection.js';
import { mentalReport, readiness } from './readiness.js';
import { summarizeFuture } from './summary.js';
import type { AthleteProfile } from './types.js';

const athlete: AthleteProfile = {
  name: 'Ravi', ageYears: 15, sex: 'male', heightCm: 165, weightKg: 50,
  diet: { pattern: 'vegetarian', mealsPerDay: 3, proteinServingsPerDay: 1, milkServingsPerDay: 1, fruitVegServingsPerDay: 2 },
  sleepHours: 7, trainingDaysPerWeek: 1, hasCoach: false,
};

const jumpSession = (cm: number, day: number, id = 'sai-vertical-jump'): SessionReport => ({
  exerciseId: id, name: 'Jump', mode: 'event', startedAt: new Date(Date.UTC(2026, 0, 1 + day)).toISOString(),
  durationSec: 20, frames: 600, fps: 30, trackedPct: 99, foreshortenedPct: 0,
  events: [{ index: 0, tMs: 1000, kind: 'jump', jumpHeightCm: cm, score: 80, faults: [], atEvent: {} }],
  mismatched: [], angles: {}, checks: [], symmetry: { knee: 3 }, formScore: 78, grade: 'B', kcal: null,
  insights: [{ level: 'warn', title: 'Knee dip shallow', detail: 'Dip deeper before take-off.' }], series: [],
});

describe('BMI', () => {
  it('uses WHO 5–19 z-scores: +1 SD edge at 15 y boys is 22.685', () => {
    // WHO table SD1 at 180 months = 22.685 kg/m²
    const h = 170, at = (bmi: number) => bmiAssessment({ ageYears: 15, sex: 'male', heightCm: h, weightKg: bmi * (h / 100) ** 2 });
    expect(at(22.6).category).toBe('normal');
    expect(at(22.8).category).toBe('overweight');
    expect(at(27.0).category).toBe('obese'); // SD2 = 26.969
    expect(at(22.685).zScore!).toBeCloseTo(1, 1);
  });
  it('uses Asian adult cut-offs 23 / 27.5 from 19 y', () => {
    const at = (bmi: number) => bmiAssessment({ ageYears: 22, sex: 'female', heightCm: 160, weightKg: bmi * 2.56 }).category;
    expect(at(22.9)).toBe('normal');
    expect(at(23)).toBe('overweight');
    expect(at(27.5)).toBe('obese');
    expect(at(18.4)).toBe('thinness');
  });
});

describe('diet', () => {
  it('computes the protein gap for a low-intake vegetarian athlete', () => {
    const d = assessDiet(athlete);
    // 1 training day → ICMR RDA, vegetarian with < 2 milk → 1.0 g/kg → 50 g target
    expect(d.proteinNeedG.target).toBe(50);
    // 3×6 + 1×7 + 1×6.5 = 31.5 → 32
    expect(d.proteinIntakeG).toBe(32);
    expect(d.proteinGapG).toBe(18);
    expect(d.suggestions.reduce((a, s) => a + s.proteinG, 0)).toBeGreaterThanOrEqual(18);
    expect(d.suggestions.some((s) => /egg|chicken/i.test(s.food))).toBe(false);
  });
  it('raises the target to 1.4 g/kg for athletes training ≥ 3 days', () => {
    expect(assessDiet({ ...athlete, trainingDaysPerWeek: 4 }).proteinNeedG.target).toBe(70);
  });
});

describe('maturity', () => {
  it('Moore without sitting height, Mirwald with it, null for adults', () => {
    expect(maturityOffset(athlete)!.method).toBe('Moore 2015');
    // Moore boys: −7.999994 + 0.0036124 × 15 × 165 = 0.94
    expect(maturityOffset(athlete)!.offsetYears).toBeCloseTo(0.9, 1);
    expect(maturityOffset({ ...athlete, sittingHeightCm: 85 })!.method).toBe('Mirwald 2002');
    expect(maturityOffset({ ...athlete, ageYears: 20 })).toBeNull();
  });
});

describe('readiness', () => {
  it('maps Hooper sums to levels and flags very high stress', () => {
    expect(readiness({ sleepQuality: 2, stress: 2, fatigue: 2, soreness: 2, mood: 4 }).level).toBe('ready');
    expect(readiness({ sleepQuality: 3, stress: 3, fatigue: 4, soreness: 3, mood: 3 }).level).toBe('steady');
    expect(readiness({ sleepQuality: 5, stress: 4, fatigue: 5, soreness: 4, mood: 3 }).level).toBe('caution');
    expect(readiness({ sleepQuality: 6, stress: 5, fatigue: 6, soreness: 6, mood: 2 }).level).toBe('rest');
    expect(readiness({ sleepQuality: 1, stress: 6, fatigue: 1, soreness: 1, mood: 4 }).level).toBe('caution');
    expect(readiness({ sleepQuality: 2, stress: 7, fatigue: 2, soreness: 2, mood: 3 }).safety).toMatch(/14416/);
    expect(readiness({ sleepQuality: 2, stress: 3, fatigue: 2, soreness: 2, mood: 3 }).safety).toBeUndefined();
  });
  it('mental report gives 2–3 tips', () => {
    const m = mentalReport(jumpSession(40, 5), readiness({ sleepQuality: 5, stress: 4, fatigue: 5, soreness: 4, mood: 3 }), [jumpSession(40, 1)]);
    expect(m.tips.length).toBeGreaterThanOrEqual(2);
    expect(m.tips.length).toBeLessThanOrEqual(3);
  });
});

describe('norms', () => {
  it('normCdf is accurate', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
  });
  it('matches Gabel 2016 table: 15 y boy at the median 0.40 m is the 50th percentile, P90 0.48 m ≈ 90th', () => {
    expect(percentileFor('countermovement-jump', 'jumpHeightCm', 40, 15, 'male')!.percentile).toBeCloseTo(50, 0);
    expect(percentileFor('countermovement-jump', 'jumpHeightCm', 48, 15, 'male')!.percentile!).toBeGreaterThan(88);
  });
  it('is monotonic in value', () => {
    let prev = -1;
    for (let cm = 15; cm <= 70; cm += 5) {
      const p = percentileFor('sai-vertical-jump', 'jumpHeightCm', cm, 16, 'female')!.percentile!;
      expect(p).toBeGreaterThanOrEqual(prev);
      if (cm >= 25 && cm <= 40) expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });
  it('CSEP push-up bands and nulls where no verified table exists', () => {
    expect(percentileFor('sai-push-up', 'reps', 39, 16, 'male')!.band).toBe('excellent');
    expect(percentileFor('sai-push-up', 'reps', 17, 16, 'male')!.band).toBe('needs work');
    expect(percentileFor('sai-push-up', 'reps', 20, 16, 'female')!.band).toBe('good');
    expect(percentileFor('sai-push-up', 'reps', 20, 13, 'male')).toBeNull();
    expect(percentileFor('sai-sit-up', 'reps', 30, 15, 'male')).toBeNull();
    expect(percentileFor('plank', 'holdSec', 60, 15, 'male')).toBeNull();
  });
});

describe('projection', () => {
  const history = [jumpSession(36, 0), jumpSession(38, 7), jumpSession(39, 14)];
  const g = projectGrowth(athlete, history);
  const m = g.metrics[0]!;
  it('projects the latest jump exercise from the recent best', () => {
    expect(m.baseline).toBe(39);
    expect(m.points.map((p) => p.week)).toEqual([4, 8, 12]);
  });
  it('plan ≥ current, and ranges widen with time', () => {
    for (const p of m.points) {
      expect(p.plan.low).toBeGreaterThanOrEqual(p.current.low);
      expect(p.plan.high).toBeGreaterThanOrEqual(p.current.high);
    }
    const width = (r: { low: number; high: number }) => r.high - r.low;
    for (let i = 1; i < m.points.length; i++) {
      expect(width(m.points[i]!.plan)).toBeGreaterThanOrEqual(width(m.points[i - 1]!.plan));
      expect(width(m.points[i]!.current)).toBeGreaterThanOrEqual(width(m.points[i - 1]!.current));
    }
  });
  it('plan gain stays inside Markovic CI at 10 weeks', () => {
    const p = projectGrowth({ ...athlete, ageYears: 21 }, history, { weeks: [10] }).metrics[0]!.points[0]!; // no age growth at 21
    expect(p.plan.low).toBeCloseTo(39 * 1.042, 1);
    expect(p.plan.high).toBeLessThanOrEqual(39 * 1.108 + 0.05);
  });
  it('returns a talent signal and no metrics without jumps', () => {
    expect(g.talent?.potentialScore).toBeGreaterThanOrEqual(g.talent!.currentPerformance);
    expect(projectGrowth(athlete, []).metrics).toEqual([]);
  });
});

describe('summarizeFuture', () => {
  it('returns ≤ 5 prioritised actions and future scope', () => {
    const s = summarizeFuture(athlete, jumpSession(40, 21), [jumpSession(36, 0), jumpSession(38, 7)]);
    expect(s.actions.length).toBe(5);
    for (let i = 1; i < s.actions.length; i++) expect(s.actions[i - 1]!.priority).toBeGreaterThanOrEqual(s.actions[i]!.priority);
    expect(s.futureScope.join(' ')).toMatch(/weeks/);
  });
});
