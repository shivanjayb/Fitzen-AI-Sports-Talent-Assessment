import { describe, expect, it } from 'vitest';
import { EXERCISES, exerciseById } from './catalog/index.js';
import { MotionSession, jointAngle, vsHorizontal, vsVertical } from './engine.js';
import { simulateExercise } from './puppet.js';
import type { PoseFrame } from '../jump/types.js';

const report = (id: string, frames: PoseFrame[]) => {
  const s = new MotionSession(exerciseById(id)!);
  for (const f of frames) s.push(f);
  return s.finish();
};
/** Rewrite landmarks, keeping timestamps. */
const mapLm = (frames: PoseFrame[], fn: (lm: PoseFrame['landmarks'][number], t: number) => Partial<PoseFrame['landmarks'][number]>): PoseFrame[] =>
  frames.map((f) => ({ ...f, landmarks: f.landmarks.map((lm) => ({ ...lm, ...fn(lm, f.timestampMs) })) }));
/** Same poses in reverse order on the original clock: every swing runs backward. */
const reversed = (frames: PoseFrame[]): PoseFrame[] => frames.map((f, i) => ({ ...f, landmarks: frames[frames.length - 1 - i]!.landmarks, world: frames[frames.length - 1 - i]!.world }));
/** Image landmarks only: exercises the 2D fallback (cameras without world landmarks). */
const noWorld = (frames: PoseFrame[]): PoseFrame[] => frames.map(({ world: _w, ...f }) => f);

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
  }, 30_000); // simulates and scores the whole catalog

  describe('foreshortening gate', () => {
    const squat = simulateExercise(exerciseById('back-squat')!);
    it('flags nothing when the limbs stay in the image plane', () => {
      const r = report('back-squat', squat);
      expect(r.foreshortenedPct).toBe(0);
      for (const c of r.checks) expect(c.excluded).toBe(0);
    });
    it('greys out and excludes readings once the athlete turns ~50° away from side-on', () => {
      // Rotating about the vertical axis by φ scales image x by cos φ; the bent-knee thigh is near horizontal, so it
      // projects to ~cos 50° = 0.64 of its length (< 0.87 gate) while the upright standing frames stay valid.
      const tTurn = squat[Math.floor(squat.length / 3)]!.timestampMs, cx = 0.5, k = Math.cos((50 * Math.PI) / 180);
      // 2D fallback only: with world landmarks the angle is measured in 3D and nothing needs greying out.
      const turned = noWorld(mapLm(squat, (lm, t) => (t >= tTurn ? { x: cx + (lm.x - cx) * k } : {})));
      const s = new MotionSession(exerciseById('back-squat')!);
      let greyKnee = 0;
      for (const f of turned) {
        const st = s.push(f);
        const kIdx = s.def.checks.findIndex((c) => c.angle === 'knee');
        if (st.angles.knee?.foreshortened) { greyKnee++; expect(st.checkZones[kIdx]).toBeNull(); expect(st.angles.knee.zone).toBeNull(); }
      }
      const r = s.finish();
      expect(greyKnee).toBeGreaterThan(0);
      expect(r.foreshortenedPct).toBeGreaterThan(20);
      expect(r.foreshortenedPct).toBeLessThan(60);
      expect(r.checks.find((c) => c.angle === 'knee')!.excluded).toBeGreaterThanOrEqual(2); // bottoms of the turned reps
      expect(r.insights.some((i) => /side-on/.test(i.detail))).toBe(true);
    });
  });

  describe('throw release direction', () => {
    const def = EXERCISES.find((d) => d.event?.trigger === 'wristPeak')!;
    const fwd = simulateExercise(def);
    const angles = (fr: PoseFrame[]) => report(def.id, fr).events!.map((e) => e.releaseAngle!);
    it('records one release per forward throw', () => {
      const a = angles(fwd);
      expect(a).toHaveLength(3);
      for (const x of a) expect(x).toBeGreaterThan(0), expect(x).toBeLessThan(90);
    });
    it('ignores swings that move the hand backward', () => {
      expect(angles(reversed(fwd))).toHaveLength(0);
    });
    it('a fast backswing does not steal the release', () => {
      const back = reversed(fwd), T = back[back.length - 1]!.timestampMs + 33;
      const both = [...back, ...fwd.map((f) => ({ ...f, timestampMs: f.timestampMs + T }))];
      const a = angles(both), ref = angles(fwd);
      expect(a).toHaveLength(3);
      // 2 decimals: the hip-velocity term scales by the session's world/image body-height ratio, which the prefix changes.
      a.forEach((x, i) => expect(x).toBeCloseTo(ref[i]!, 2));
    });
    it('an athlete facing the other way gets the same release angles', () => {
      const mirror = mapLm(fwd, (lm) => ({ x: 1 - lm.x })).map((f) => ({ ...f, world: f.world?.map((p) => ({ ...p, x: -p.x })) }));
      const a = angles(mirror), ref = angles(fwd);
      expect(a).toHaveLength(3);
      a.forEach((x, i) => expect(x).toBeCloseTo(ref[i]!, 6));
    });
  });

  describe('jump ground re-baseline', () => {
    const cmj = simulateExercise(exerciseById('countermovement-jump')!);
    const heights = (fr: PoseFrame[]) => report('countermovement-jump', fr).events!.map((e) => e.jumpHeightCm!);
    it('a step back between jumps (ground line rises 6 % of frame) keeps every jump and its height', () => {
      // After the first landing the athlete steps back: the whole body moves up 0.06 in 0.2 s, ~2× the take-off gate.
      const ref = heights(cmj);
      const t0 = 3400, dur = 200, dy = 0.06;
      const moved = mapLm(cmj, (lm, t) => ({ y: lm.y - dy * Math.min(1, Math.max(0, (t - t0) / dur)) }));
      const h = heights(moved);
      expect(h).toHaveLength(3);
      h.forEach((x, i) => expect(Math.abs(x - ref[i]!)).toBeLessThan(0.5));
    });
    it('walking drift while grounded between jumps does not bias height', () => {
      // Ground line creeps 0.025 down then 0.025 up (~3 %/s) during the standing phases after landings 1 and 2.
      const ref = heights(cmj);
      const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
      const drift = mapLm(cmj, (lm, t) => ({ y: lm.y + 0.025 * (ramp(t, 3350, 4100) - ramp(t, 6280, 7030)) }));
      const h = heights(drift);
      expect(h).toHaveLength(3);
      h.forEach((x, i) => expect(Math.abs(x - ref[i]!)).toBeLessThan(0.5));
    });
  });
});

describe('jump landings', () => {
  const run = (id: string, map: (f: PoseFrame[]) => PoseFrame[] = (f) => f) => {
    const s = new MotionSession(exerciseById(id)!, { checkMovement: false });
    for (const f of map(simulateExercise(exerciseById(id)!, { reps: 3, seed: 1 }))) s.push(f);
    return s.finish().events ?? [];
  };
  it('reports height for a vertical jump, none for a horizontal broad jump', () => {
    expect(run('countermovement-jump').every((e) => e.jumpHeightCm! > 10)).toBe(true);
    const broad = run('standing-broad-jump');
    expect(broad.length).toBeGreaterThan(0);
    expect(broad.every((e) => e.jumpHeightCm === undefined)).toBe(true);
  });
  it('records a jump that lands on a box (higher than take-off), without a height', () => {
    const toe = (f: PoseFrame) => Math.max(f.landmarks[31]!.y, f.landmarks[32]!.y);
    const onBox = (fr: PoseFrame[]) => {
      const ground = toe(fr[0]!);
      const k = fr.findIndex((f) => toe(f) < ground - 0.03); // first airborne frame
      return fr.map((f, i) => (i < k + 8 ? f : { ...f, landmarks: f.landmarks.map((l) => ({ ...l, y: l.y - 0.12 })) }));
    };
    const ev = run('box-jump', onBox);
    expect(ev.length).toBeGreaterThan(0);
    expect(ev[0]!.jumpHeightCm).toBeUndefined();
  });
});


describe('assessment evidence and interrupted tracking', () => {
  it('does not award an A to an idle jump with zero attempts', () => {
    const poses = simulateExercise(exerciseById('countermovement-jump')!).slice(0, 10);
    const r = report('countermovement-jump', poses);
    expect(r.events).toHaveLength(0);
    expect(r.assessmentStatus).toBe('insufficient-evidence');
    expect(r.formScore).toBe(0);
    expect(r.grade).toBe('N/A');
  });

  it('counts absent detections in coverage and breaks a continuous hold', () => {
    const poses = simulateExercise(exerciseById('plank')!).filter((f) => f.timestampMs >= 1000 && f.timestampMs < 3000);
    const begin = poses[0]!.timestampMs;
    const first = poses.map((f) => ({ ...f, timestampMs: f.timestampMs - begin }));
    const absent = Array.from({ length: 300 }, (_, i) => ({ timestampMs: 2000 + i * 1000 / 30, landmarks: [] }));
    const second = first.map((f) => ({ ...f, timestampMs: f.timestampMs + 12000 }));
    const r = report('plank', [...first, ...absent, ...second]);
    expect(r.hold!.bestSec).toBeLessThan(2.1);
    expect(r.hold!.totalSec).toBeLessThan(4.1);
    expect(r.trackedPct).toBeLessThan(30);
    expect(r.validity!.longestGapMs).toBeGreaterThan(9900);
    expect(r.validity!.attemptedFrames).toBe(first.length * 2 + 300);
  });

  it('breaks a hold when source callbacks stop without adding time on resume', () => {
    const poses = simulateExercise(exerciseById('plank')!).filter((f) => f.timestampMs >= 1000 && f.timestampMs < 3000);
    const begin = poses[0]!.timestampMs;
    const first = poses.map((f) => ({ ...f, timestampMs: f.timestampMs - begin }));
    const r = report('plank', [...first, ...first.map((f) => ({ ...f, timestampMs: f.timestampMs + 12000 }))]);
    expect(r.hold!.bestSec).toBeLessThan(2.1);
    expect(r.hold!.totalSec).toBeLessThan(4);
    expect(r.validity!.longestGapMs).toBeGreaterThan(10000);
  });

  // A pose lost for 400 ms (12 missed detections) mid-descent ends the rep; one missed detection (33 ms), which real
  // cameras produce all the time, must not.
  const midRepGap = (missing: number) => {
    const poses = simulateExercise(exerciseById('back-squat')!, { reps: 1 });
    const s = new MotionSession(exerciseById('back-squat')!, { checkMovement: false });
    const midpoint = Math.floor(poses.length / 2);
    for (const f of poses.slice(0, midpoint)) s.push(f);
    for (const f of poses.slice(midpoint, midpoint + missing)) s.push({ timestampMs: f.timestampMs, landmarks: [] });
    for (const f of poses.slice(midpoint + missing)) s.push(f);
    return s.finish().reps!.count;
  };
  it('requires a fresh starting position after losing the pose mid-descent for 400 ms', () => {
    expect(midRepGap(12)).toBe(0);
  });
  it('keeps the rep through a single missed detection', () => {
    expect(midRepGap(1)).toBe(1);
  });

  it('does not connect pre-gap takeoff with post-gap landing', () => {
    const poses = simulateExercise(exerciseById('countermovement-jump')!, { reps: 1 });
    const toe = (f: PoseFrame) => Math.max(f.landmarks[31]!.y, f.landmarks[32]!.y);
    const ground = toe(poses[0]!);
    const air = poses.findIndex((f) => toe(f) < ground - 0.05);
    const land = poses.findIndex((f, i) => i > air && toe(f) >= ground - 0.005);
    const r = report('countermovement-jump', [...poses.slice(0, air + 2), { timestampMs: poses[air + 2]!.timestampMs, landmarks: [] }, ...poses.slice(land)]);
    expect(r.events).toHaveLength(0);
  });

  it('does not score a rejected event as an accepted form check', () => {
    const jump = exerciseById('countermovement-jump')!;
    const def = { ...jump, id: 'plank', name: 'Plank' }; // jump trigger, incompatible hold reference
    const s = new MotionSession(def);
    for (const f of simulateExercise(jump)) s.push(f);
    const r = s.finish();
    expect(r.mismatched.length).toBeGreaterThan(0);
    expect(r.events).toHaveLength(0);
    expect(r.checks.filter((c) => c.when === 'bottom' || c.when === 'release').every((c) => c.samples === 0)).toBe(true);
  });
});

describe('3D angles, self-normalised counting and noise robustness', () => {
  let seed = 4242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const pt = () => ({ x: rnd(), y: rnd(), z: rnd(), v: 1 });

  it('joint angles are invariant to any 3D rotation, segment angles to any turn about the vertical', () => {
    for (let n = 0; n < 50; n++) {
      // Random rotation from a unit quaternion (Shoemake 1992).
      const [u1, u2, u3] = [rnd(), rnd(), rnd()];
      const q = [Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2), Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2), Math.sqrt(u1) * Math.sin(2 * Math.PI * u3), Math.sqrt(u1) * Math.cos(2 * Math.PI * u3)];
      const [a, b, c, d] = q as [number, number, number, number];
      const rot = (p: { x: number; y: number; z: number; v: number }) => ({
        x: (1 - 2 * (b * b + c * c)) * p.x + 2 * (a * b - c * d) * p.y + 2 * (a * c + b * d) * p.z,
        y: 2 * (a * b + c * d) * p.x + (1 - 2 * (a * a + c * c)) * p.y + 2 * (b * c - a * d) * p.z,
        z: 2 * (a * c - b * d) * p.x + 2 * (b * c + a * d) * p.y + (1 - 2 * (a * a + b * b)) * p.z, v: 1,
      });
      const t = 2 * Math.PI * rnd(), yaw = (p: { x: number; y: number; z: number; v: number }) => ({ ...p, x: p.x * Math.cos(t) + p.z * Math.sin(t), z: -p.x * Math.sin(t) + p.z * Math.cos(t) });
      const [p1, p2, p3] = [pt(), pt(), pt()];
      expect(Math.abs(jointAngle(rot(p1), rot(p2), rot(p3)) - jointAngle(p1, p2, p3))).toBeLessThan(0.5);
      expect(Math.abs(vsVertical(yaw(p1), yaw(p2)) - vsVertical(p1, p2))).toBeLessThan(0.5);
      expect(Math.abs(vsHorizontal(yaw(p1), yaw(p2)) - vsHorizontal(p1, p2))).toBeLessThan(0.5);
    }
  });

  it('limbs in the image plane keep the 2D angle (blend weight 0)', () => {
    const def = exerciseById('back-squat')!, frames = simulateExercise(def, { reps: 2 });
    const a = new MotionSession(def), b = new MotionSession(def);
    for (const f of frames) {
      const la = a.push(f), lb = b.push(noWorld([f])[0]!);
      for (const id of Object.keys(lb.angles)) expect(Math.abs(la.angles[id]!.value - lb.angles[id]!.value)).toBeLessThan(1e-9);
    }
  });

  it('counts an athlete who only reaches 60 % of the catalog range', () => {
    const def = exerciseById('back-squat')!, s = new MotionSession(def);
    for (const f of simulateExercise(def, { depth: 0.6 })) s.push(f);
    expect(s.finish().reps!.count).toBeGreaterThanOrEqual(4);
  });

  it('counts nothing on a still athlete under landmark noise: every reps exercise, 30 and 15 fps, with and without world', () => {
    // σ in frame heights; world x/y 2.4σ m, z 3× that. 15 fps: the noise estimator must still run (it once needed ≥ 16 fps).
    for (const def of EXERCISES.filter((d) => d.mode === 'reps')) {
      for (const [fps, sd, world] of [[30, 0.02, true], [30, 0.01, false], [15, 0.02, true], [15, 0.01, false]] as const) {
        for (let k = 0; k < 3; k++) {
          const f0 = simulateExercise(def, { reps: 1, seed: 1 + k })[0]!, s = new MotionSession(def);
          for (let i = 0; i < 10 * fps; i++) {
            s.push({
              timestampMs: (i * 1000) / fps,
              landmarks: f0.landmarks.map((l) => ({ ...l, x: l.x + (gauss() * sd) / (16 / 9), y: l.y + gauss() * sd })),
              ...(world ? { world: f0.world!.map((l) => ({ ...l, x: l.x + gauss() * sd * 2.4, y: l.y + gauss() * sd * 2.4, z: l.z + gauss() * sd * 7.2 })) } : {}),
            });
          }
          expect(s.finish().reps!.count, `${def.id} ${fps} fps σ ${sd} ${world ? '3D' : '2D'} draw ${k}`).toBe(0);
        }
      }
    }
  }, 60_000);

  it('a pause partway up a half-depth lunge does not split one rep into two', () => {
    const def = exerciseById('forward-lunge')!, s = new MotionSession(def);
    for (const f of simulateExercise(def, { depth: 0.5 })) s.push(f);
    expect(s.finish().reps!.count).toBeLessThanOrEqual(6);
  });

  it('release angle is of the ground-frame velocity: body drift changes it in 3D as in 2D', () => {
    // 0.15 frame heights/s (≈ 0.36 m/s) of forward drift flattens the release; hip-centred world points alone missed it.
    const def = exerciseById('javelin-release')!, fr = simulateExercise(def);
    const drift = (v: number) => fr.map((f) => ({ ...f, landmarks: f.landmarks.map((l) => ({ ...l, x: l.x + (v * f.timestampMs) / 1000 / (16 / 9) })) }));
    const ang = (x: PoseFrame[]) => report(def.id, x).events!.map((e) => e.releaseAngle!);
    const still = ang(fr), fwd = ang(drift(0.15)), back = ang(drift(-0.15));
    still.forEach((a, i) => { expect(fwd[i]!).toBeLessThan(a - 0.5); expect(back[i]!).toBeGreaterThan(a + 0.5); });
  });

  it('jump height survives blurred feet at take-off (no frozen toes in the flight fit)', () => {
    const def = exerciseById('countermovement-jump')!, fr = simulateExercise(def);
    const clean = report(def.id, fr).events!;
    const t0 = fr[0]!.timestampMs;
    const blur = fr.map((f) => (clean.some((e) => f.timestampMs >= e.tMs + t0 && f.timestampMs < e.tMs + t0 + 200)
      ? { ...f, landmarks: f.landmarks.map((l, i) => (i >= 27 ? { ...l, visibility: 0.1 } : l)) } : f));
    const b = report(def.id, blur).events!;
    expect(b).toHaveLength(clean.length);
    b.forEach((e, i) => expect(Math.abs(e.jumpHeightCm! - clean[i]!.jumpHeightCm!)).toBeLessThan(0.02 * clean[i]!.jumpHeightCm!));
  });

  it('a plank with the hips sagging 30° earns no hold time', () => {
    // Drop both hips (and knees with them) perpendicular to the shoulder-ankle line until the body line reads 150°.
    const sag = (lm: PoseFrame['landmarks'], k: number, target = 150) => {
      const S = lm[11]!, A = lm[27]!, H = lm[23]!;
      const sx = S.x * k, ax = A.x * k, hx = H.x * k, len = Math.hypot(ax - sx, A.y - S.y);
      let nx = -(A.y - S.y) / len, ny = (ax - sx) / len;
      if (ny < 0) { nx = -nx; ny = -ny; } // toward the floor (y down)
      const at = (d: number) => jointAngle({ x: sx, y: S.y, v: 1 }, { x: hx + nx * d, y: H.y + ny * d, v: 1 }, { x: ax, y: A.y, v: 1 });
      let lo = 0, hi = len;
      for (let i = 0; i < 60; i++) { const d = (lo + hi) / 2; if (at(d) > target) lo = d; else hi = d; }
      return lm.map((p, i) => ([23, 24, 25, 26].includes(i) ? { ...p, x: p.x + (nx * lo * (i < 25 ? 1 : 0.5)) / k, y: p.y + ny * lo * (i < 25 ? 1 : 0.5) } : p));
    };
    const frames = simulateExercise(exerciseById('plank')!).map((f) => ({ ...f, landmarks: sag(f.landmarks, 16 / 9), world: f.world && sag(f.world, 1) }));
    const r = report('plank', frames);
    expect(r.angles.bodyLine!.mean).toBeLessThan(160);
    expect(r.hold!.totalSec).toBe(0);
    // 6° below the band under noise (σ̂ ≈ 4–6°): the old widened edge (min(8°, 2σ̂)) credited it; bias correction must not.
    const ok0 = exerciseById('plank')!.checks.find((c) => c.angle === 'bodyLine' && c.when === 'hold')!.ok[0];
    const near = simulateExercise(exerciseById('plank')!).map((f) => ({ ...f, landmarks: sag(f.landmarks, 16 / 9, ok0 - 6).map((l) => ({ ...l, x: l.x + (gauss() * 0.012) / (16 / 9), y: l.y + gauss() * 0.012 })) }));
    expect(report('plank', near).hold!.totalSec).toBeLessThan(2);
  });
});
