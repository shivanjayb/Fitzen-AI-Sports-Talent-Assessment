import { describe, expect, it } from 'vitest';
import { EXERCISES, exerciseById } from './catalog/index.js';
import { MotionSession } from './engine.js';
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
const reversed = (frames: PoseFrame[]): PoseFrame[] => frames.map((f, i) => ({ ...f, landmarks: frames[frames.length - 1 - i]!.landmarks }));

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
      const turned = mapLm(squat, (lm, t) => (t >= tTurn ? { x: cx + (lm.x - cx) * k } : {}));
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
      a.forEach((x, i) => expect(x).toBeCloseTo(ref[i]!, 6));
    });
    it('an athlete facing the other way gets the same release angles', () => {
      const mirror = mapLm(fwd, (lm) => ({ x: 1 - lm.x }));
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

  it('requires a fresh starting position after losing a rep mid-descent', () => {
    const poses = simulateExercise(exerciseById('back-squat')!, { reps: 1 });
    const s = new MotionSession(exerciseById('back-squat')!, { checkMovement: false });
    const midpoint = Math.floor(poses.length / 2);
    for (const f of poses.slice(0, midpoint)) s.push(f);
    s.push({ timestampMs: poses[midpoint]!.timestampMs, landmarks: [] });
    for (const f of poses.slice(midpoint + 1)) s.push(f);
    expect(s.finish().reps!.count).toBe(0);
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
