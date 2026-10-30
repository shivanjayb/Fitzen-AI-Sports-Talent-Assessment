import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../jump/types.js';
import { EXERCISES, exerciseById } from './catalog/index.js';
import { MotionSession, movementMismatch, referenceSignature, type RepSignature } from './engine.js';
import { simulateExercise } from './puppet.js';

const run = (selected: string, frames: PoseFrame[]) => {
  const s = new MotionSession(exerciseById(selected)!);
  for (const f of frames) s.push(f);
  return s.finish().reps!;
};

const ARM_L = [13, 15, 19, 17, 21], ARM_R = [14, 16, 20, 18, 22];
/**
 * Lateral raise filmed side-on: the arm rises toward the camera, so its image-plane x extent collapses. Image landmarks
 * only (the 2D fallback). `world: true` adds world landmarks with the same arm swung consistently into depth
 * (x′ = 0.25·dx, z′ = −0.968·dx, length kept), which the 3D plane-of-elevation test must flag.
 */
function lateralRaiseSideOn(world = false): PoseFrame[] {
  const squash = (all: PoseFrame['landmarks'], depth: boolean) => all.map((p, i) => {
    const sh = ARM_L.includes(i) ? all[11]! : ARM_R.includes(i) ? all[12]! : null;
    if (!sh) return p;
    const dx = p.x - sh.x;
    return depth ? { ...p, x: sh.x + dx * 0.25, z: sh.z - 0.968 * dx } : { ...p, x: sh.x + dx * 0.25 };
  });
  return simulateExercise(exerciseById('front-raise')!).map(({ world: w, ...f }) => ({
    ...f,
    landmarks: squash(f.landmarks, false),
    ...(world && w ? { world: squash(w, true) } : {}),
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
  }, 60_000); // simulates and scores the whole catalog (~17 s alone, >30 s when the suite runs in parallel)

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

  it('natural arm action (≈ 45° elbow ROM) is not a different exercise in leg, drill and Olympic defs; it is in a raise', () => {
    const ref = (id: string) => referenceSignature(exerciseById(id)!)!;
    for (const id of ['snatch', 'high-knees', 'a-skip', 'butt-kicks', 'forward-lunge', 'kettlebell-swing']) {
      const r = ref(id);
      expect(movementMismatch(exerciseById(id)!, { ...r, rom: { ...r.rom, elbow: 45 } }, r), id).toBeNull();
    }
    const fr = ref('front-raise');
    expect(movementMismatch(exerciseById('front-raise')!, { ...fr, rom: { ...fr.rom, elbow: 45 } }, fr)).toMatch(/elbows/);
  });

  it('does not count an overhead press as front raises', () => {
    const r = run('front-raise', simulateExercise(exerciseById('overhead-press')!));
    expect(r.mismatched.length).toBeGreaterThan(0);
    expect(r.count).toBe(0);
  });

  it('does not count a side-on lateral raise as front raises (2D fallback)', () => {
    const r = run('front-raise', lateralRaiseSideOn());
    expect(r.mismatched.length).toBeGreaterThan(0);
    expect(r.valid).toBe(0);
  });

  it('does not count a side-on lateral raise as front raises (3D plane of elevation)', () => {
    const r = run('front-raise', lateralRaiseSideOn(true));
    expect(r.mismatched.length).toBeGreaterThan(0);
    expect(r.count).toBe(0);
  });
});
