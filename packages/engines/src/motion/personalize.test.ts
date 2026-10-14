import { describe, expect, it } from 'vitest';
import { EXERCISES, exerciseById } from './catalog/index.js';
import { MotionSession, type SessionReport } from './engine.js';
import { personalize, responseProfile, standardReps, usualExtreme } from './personalize.js';
import { simulateExercise } from './puppet.js';

const squat = exerciseById('bodyweight-squat')!;
const heavyBeginner = { ageYears: 30, sex: 'male' as const, heightCm: 170, weightKg: 95, level: 'beginner' as const };

describe('personalize', () => {
  it('keeps the catalog untouched and gives a fit advanced adult the standard ranges', () => {
    const p = personalize(squat, { ageYears: 25, sex: 'female', heightCm: 165, weightKg: 55, level: 'advanced' });
    expect(p.shiftDeg).toBe(0);
    expect(p.def.checks).toEqual(squat.checks);
    expect(squat.reps!.target).toBe(80);
  });

  it('widens depth for a heavier beginner, but never alignment checks', () => {
    const p = personalize(squat, heavyBeginner);
    expect(p.def.reps!.target).toBe(94); // obese +8, beginner +6
    expect(p.def.checks[0]!.good).toEqual([20, 94]);
    expect(p.def.checks[1]).toEqual(squat.checks[1]); // trunk lean unchanged without a long-leg build
    expect(p.reasons.join(' ')).toMatch(/BMI 32.9/);
  });

  it('gives long-legged lifters more trunk lean on knee-led lifts only', () => {
    const p = personalize(squat, { heightCm: 180, sittingHeightCm: 88 });
    expect(p.leanDeg).toBe(6);
    expect(p.def.checks[1]!.good).toEqual([10, 56]);
    expect(personalize(exerciseById('push-up')!, { heightCm: 180, sittingHeightCm: 88 }).leanDeg).toBe(0);
  });

  it('follows the usual depth (biometric bias), capped and never past the rep entry', () => {
    expect(personalize(squat, { usualExtreme: 101 }).def.reps!.target).toBe(98);
    expect(personalize(squat, { usualExtreme: 140 }).def.reps!.target).toBe(105); // 80 + 25 cap
    for (const d of EXERCISES.filter((e) => e.reps)) {
      const r = personalize(d, { ...heavyBeginner, ageYears: 70, usualExtreme: d.reps!.enter }).def.reps!;
      const s = r.start === 'high' ? 1 : -1;
      expect(s * r.target).toBeLessThanOrEqual(Math.max(s * r.enter - 10, s * d.reps!.target));
      expect(s * r.target).toBeGreaterThanOrEqual(s * d.reps!.target);
    }
  });

  it('scales hold goals by level and leaves release angles alone', () => {
    const plank = EXERCISES.find((e) => e.hold)!;
    expect(personalize(plank, { level: 'beginner' }).def.hold!.targetSec).toBeLessThan(plank.hold!.targetSec);
    const t = EXERCISES.find((e) => e.event?.releaseAngle)!;
    expect(personalize(t, heavyBeginner).def.event).toEqual(t.event);
  });

  it('counts a shallow squatter\'s reps under personal ranges, while leaderboards keep the standard count', () => {
    const shallow = structuredClone(squat);
    shallow.reps!.target = 96; // the demo athlete bottoms out ~4° past the target: ~92° knee
    shallow.checks[0]!.good = [20, 96]; shallow.checks[0]!.ok = [20, 100];
    const frames = simulateExercise(shallow, { reps: 4 });
    const run = (d: typeof squat) => { const s = new MotionSession(d); for (const f of frames) s.push(f); return s.finish(); };
    const std = run(squat), mine = run(personalize(squat, heavyBeginner).def);
    expect(std.reps!.valid).toBe(0);
    expect(mine.reps!.valid).toBeGreaterThanOrEqual(3);
    expect(mine.reps!.target).toBe(94);
    expect(standardReps(mine)).toBe(0);
    expect(usualExtreme(squat, [mine, mine, mine])).toBeGreaterThan(85);
    expect(usualExtreme(squat, [mine, mine])).toBeNull();
  });
});

describe('responseProfile', () => {
  const rep = (id: string, day: number, valid: number, form = 70) =>
    ({ exerciseId: id, name: id, startedAt: `2026-01-${String(day).padStart(2, '0')}T10:00:00Z`, formScore: form, reps: { valid, list: [] } }) as unknown as SessionReport;
  it('labels each exercise by the person\'s own trend', () => {
    const out = responseProfile([
      rep('push-up', 1, 10), rep('push-up', 2, 11), rep('push-up', 3, 14),
      rep('squat', 1, 20), rep('squat', 2, 20), rep('squat', 3, 20),
      rep('lunge', 1, 20), rep('lunge', 2, 18), rep('lunge', 3, 15),
      rep('curl', 1, 5),
    ]);
    expect(out.map((o) => [o.exerciseId, o.response])).toEqual([['push-up', 'responding'], ['squat', 'plateau'], ['lunge', 'declining']]);
  });
});
