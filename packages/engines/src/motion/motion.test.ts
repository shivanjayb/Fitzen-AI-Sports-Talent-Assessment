import { describe, expect, it } from 'vitest';
import { EXERCISES, exerciseById } from './catalog/index.js';
import { MotionSession } from './engine.js';
import { simulateExercise } from './puppet.js';

const run = (id: string) => {
  const def = exerciseById(id)!;
  const s = new MotionSession(def, { weightKg: 70 });
  for (const f of simulateExercise(def)) s.push(f);
  return s.finish();
};

describe('motion engine', () => {
  it('counts squat reps and flags the shallow one', () => {
    const r = run('back-squat');
    expect(r.reps!.count).toBe(6);
    expect(r.reps!.partial).toBe(1);
    expect(r.reps!.avgEccentricSec).toBeGreaterThan(0.8);
    expect(r.kcal).toBeGreaterThan(0);
  });

  it('times a plank hold', () => {
    expect(run('plank').hold!.bestSec).toBeGreaterThan(30);
  });

  it('measures jump height from flight time', () => {
    const h = run('countermovement-jump').events!.map((e) => e.jumpHeightCm!);
    expect(h).toHaveLength(3);
    // 0.5 s puppet flight → 30.7 cm; threshold trims a few frames.
    for (const x of h) expect(x).toBeGreaterThan(22), expect(x).toBeLessThan(33);
  });

  it('every catalog entry is well-formed and runs end-to-end', () => {
    const ids = new Set<string>();
    for (const d of EXERCISES) {
      expect(ids.has(d.id)).toBe(false); ids.add(d.id);
      for (const c of d.checks) {
        expect(d.angles.some((a) => a.id === c.angle)).toBe(true);
        expect(c.ok[0] <= c.good[0] && c.good[1] <= c.ok[1]).toBe(true);
      }
      const s = new MotionSession(d);
      for (const f of simulateExercise(d, { reps: 2 })) s.push(f);
      expect(s.finish().formScore).toBeGreaterThanOrEqual(0);
    }
    expect(EXERCISES.length).toBeGreaterThanOrEqual(80);
  });
});
