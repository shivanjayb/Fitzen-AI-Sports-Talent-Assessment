import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../jump/types.js';
import { EXERCISES, exerciseById } from './catalog/index.js';
import { MotionSession } from './engine.js';
import { simulateExercise } from './puppet.js';

const run = (selected: string, frames: PoseFrame[]) => {
  const s = new MotionSession(exerciseById(selected)!);
  for (const f of frames) s.push(f);
  return s.finish().reps!;
};

/** Lateral raise filmed side-on: the arm rises toward the camera, so its image-plane x extent collapses. */
function lateralRaiseSideOn(): PoseFrame[] {
  return simulateExercise(exerciseById('front-raise')!).map((f) => ({
    ...f,
    landmarks: f.landmarks.map((p, i, all) => {
      const sh = [11, 13, 15, 19, 17, 21].includes(i) ? all[11]! : [12, 14, 16, 20, 18, 22].includes(i) ? all[12]! : null;
      return sh && ![11, 12].includes(i) ? { ...p, x: sh.x + (p.x - sh.x) * 0.25 } : p;
    }),
  }));
}

describe('movement check (wrong exercise)', () => {
  it('never flags an exercise performed as defined', () => {
    for (const d of EXERCISES.filter((e) => e.mode === 'reps')) expect(run(d.id, simulateExercise(d)).mismatched, d.id).toHaveLength(0);
  });

  it('does not count an overhead press as front raises', () => {
    const r = run('front-raise', simulateExercise(exerciseById('overhead-press')!));
    expect(r.mismatched.length).toBeGreaterThan(0);
    expect(r.count).toBe(0);
  });

  it('does not count a side-on lateral raise as front raises', () => {
    const r = run('front-raise', lateralRaiseSideOn());
    expect(r.mismatched.length).toBeGreaterThan(0);
    expect(r.valid).toBe(0);
  });
});
