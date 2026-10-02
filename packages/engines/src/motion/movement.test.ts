import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../jump/types.js';
import { EXERCISES, exerciseById } from './catalog/index.js';
import { MotionSession, movementMismatch, type RepSignature } from './engine.js';
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
  const session = (selected: string, frames: PoseFrame[]) => {
    const s = new MotionSession(exerciseById(selected)!);
    for (const f of frames) s.push(f);
    return s.finish();
  };

  it('never flags any of the 90 exercises performed as defined', () => {
    for (const d of EXERCISES) expect(session(d.id, simulateExercise(d)).mismatched, d.id).toHaveLength(0);
  });

  it('holds: squats while a plank is selected are flagged and get no hold time', () => {
    const r = session('plank', simulateExercise(exerciseById('back-squat')!));
    expect(r.mismatched.length).toBeGreaterThan(0);
    expect(r.hold!.bestSec).toBe(0);
  });

  it('holds: squatting during tree pose is flagged', () => {
    expect(session('tree-pose', simulateExercise(exerciseById('back-squat')!)).mismatched.length).toBeGreaterThan(0);
  });

  it('events: a deep squat before a throw is a different movement, a run-up knee bend is not', () => {
    const def = exerciseById('javelin-release')!;
    const sig = (knee: number): RepSignature => ({
      rom: { knee, hip: 10, elbow: 30, shoulder: 150 }, trunk: 10,
      outOfPlane: { trunk: 0, thigh: 0, shin: 0, upperArm: 0, forearm: 0 },
    });
    const ref = sig(5);
    expect(movementMismatch(def, sig(95), ref)).toMatch(/knees/);
    expect(movementMismatch(def, sig(55), ref)).toBeNull();
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
