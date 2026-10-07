// Ground-truth accuracy harness: synthetic clips with KNOWN truth, degraded like a real camera/decoder, run through
// both measurement paths, errors measured against the truth.
//   live    = MotionSession with the causal One Euro filter (camera).
//   offline = filtfiltLandmarks (zero-phase 6 Hz Butterworth) + MotionSession({ smoothing: 'none' }) (uploaded video).
// Degradations: fps, camera aspect (16:9 landscape; 9:16 portrait with the athlete at half the size), Gaussian landmark
// noise σ in frame-height units (x gets σ/aspect, so it is isotropic in pixels), randomly dropped frames, timestamp jitter.
// Truth: reps/angles/holds from the puppet with seed 0 (its jitter LCG then returns a constant, i.e. a pure translation,
// so the geometry is exact); jumps and throws from closed-form trajectories generated here (rigid ballistic flight with a
// random take-off phase against the frame grid; a wrist on a circular arc whose speed peaks at a known direction).
// The movement (wrong-exercise) check is off: this measures the measurement maths, not that classifier.
// What this CANNOT show: out-of-plane/perspective bias, real MediaPipe error (biased per joint and correlated in time,
// not white), motion blur, rolling shutter, non-rigid take-off/landing postures. Those need real-athlete ground truth
// (force plate / marker mocap). `npx vitest run accuracy` prints the full table.
import { describe, expect, it } from 'vitest';
import { exerciseById } from '../catalog/index.js';
import { MotionSession, type LiveState, type SessionReport } from '../engine.js';
import { filtfiltLandmarks } from '../filtfilt.js';
import { simulateExercise } from '../puppet.js';
import type { ExerciseDef } from '../types.js';
import type { PoseFrame } from '../../jump/types.js';

type Path = 'live' | 'offline';
interface Cond { fps: number; aspect: number; sigma: number; drop: number; jitterMs: number; path: Path }
const G = 9.81;
const M2F = 0.72 / 1.75; // puppet scale: frame heights per metre
const LAND = 16 / 9, PORT = 9 / 16;
const FPS = [24, 25, 30, 60, 120];
const PATHS: Path[] = ['live', 'offline'];
/** [σ, drop fraction, timestamp jitter ±ms] */
const NOISE = [[0, 0, 0], [0.002, 0, 0], [0.005, 0.05, 2], [0.01, 0.1, 2]] as const;
const def = (id: string): ExerciseDef => exerciseById(id)!;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** Re-shoot a 16:9 clip in portrait 9:16 from twice the distance (constant scale 0.5, centred). Angles are unchanged. */
function view(frames: PoseFrame[], aspect: number): PoseFrame[] {
  if (aspect === LAND) return frames;
  return frames.map((f) => ({ ...f, landmarks: f.landmarks.map((l) => ({ ...l, x: 0.5 + ((l.x - 0.5) * LAND * 0.5) / PORT, y: 0.5 + (l.y - 0.5) * 0.5 })) }));
}

/** Camera/decoder degradation. Returns surviving frames with their original index. */
function degrade(frames: PoseFrame[], c: Cond, seed = 1): Array<{ i: number; f: PoseFrame }> {
  const r = rng(seed);
  const out: Array<{ i: number; f: PoseFrame }> = [];
  view(frames, c.aspect).forEach((f, i) => {
    const jit = c.jitterMs ? (r() - 0.5) * 2 * c.jitterMs : 0;
    const keep = i === 0 || i === frames.length - 1 || r() >= c.drop;
    const lm = f.landmarks.map((l) => ({ ...l, x: l.x + (gauss(r) * c.sigma) / c.aspect, y: l.y + gauss(r) * c.sigma }));
    if (keep) out.push({ i, f: { timestampMs: f.timestampMs + jit, landmarks: lm } });
  });
  return out;
}

/** Run one path; returns the report and the live state per original frame index. */
function run(d: ExerciseDef, frames: Array<{ i: number; f: PoseFrame }>, c: Pick<Cond, 'aspect' | 'path'>): { rep: SessionReport; st: Map<number, LiveState> } {
  const s = new MotionSession(d, { checkMovement: false, smoothing: c.path === 'offline' ? 'none' : 'one-euro' });
  // Same cutoffs as Session.tsx finish(): 10 Hz for jumps, 6 Hz otherwise.
  const fs = c.path === 'offline' ? filtfiltLandmarks(frames.map((x) => x.f), d.event?.trigger === 'jump' ? 10 : 6) : frames.map((x) => x.f);
  const st = new Map<number, LiveState>();
  fs.forEach((f, k) => st.set(frames[k]!.i, s.push(f, c.aspect)));
  return { rep: s.finish(), st };
}
const clean = (frames: PoseFrame[]) => frames.map((f, i) => ({ i, f }));

const stats = (e: number[]) => ({
  bias: e.reduce((a, b) => a + b, 0) / Math.max(1, e.length),
  rmse: Math.sqrt(e.reduce((a, b) => a + b * b, 0) / Math.max(1, e.length)),
  max: Math.max(0, ...e.map(Math.abs)),
});
const f2 = (x: number) => x.toFixed(2).padStart(7);
const tag = (c: Cond) => `${c.path.padEnd(7)} ${String(c.fps).padStart(3)} ${c.aspect > 1 ? '16:9' : '9:16'} ${c.sigma.toFixed(3)} ${c.drop.toFixed(2)} ${c.jitterMs}`;
const rows: string[] = [];

/** Standing template (16:9 normalised landmarks). */
const stand = (d: ExerciseDef) => simulateExercise(d, { seed: 0, reps: 0 })[0]!.landmarks;

/** Rigid ballistic jumps with flight times Ts (s), each taking off at a random phase of the frame grid. Truth h = g·T²/8. */
function jumpClip(fps: number, Ts: number[], seed: number): PoseFrame[] {
  const tpl = stand(def('countermovement-jump'));
  const r = rng(seed);
  const takeoffs: number[] = [];
  let t0 = 1.5;
  for (const T of Ts) { t0 += r() / fps; takeoffs.push(t0); t0 += T + 1.6; }
  const out: PoseFrame[] = [];
  for (let k = 0; k / fps < t0; k++) {
    const t = k / fps;
    let lift = 0;
    Ts.forEach((T, j) => { const u = t - takeoffs[j]!; if (u > 0 && u < T) lift = (G / 2) * u * (T - u) * M2F; });
    out.push({ timestampMs: t * 1000, landmarks: tpl.map((l) => ({ ...l, y: l.y - lift })) });
  }
  return out;
}

/**
 * Overarm throws: left arm straight, on a circle about the shoulder. Direction θ (from straight up, toward +x = the way
 * the figure faces) sweeps Φ in D s with speed ∝ 1 − cos(2πu), peaking (ω = 2Φ/D ≈ 21.5 rad/s) at θ* = −rel, where the
 * hand moves rel° above horizontal. Truth release angle = rel.
 */
const OMEGA = (2 * (160 * Math.PI) / 180) / 0.26;
function throwClip(fps: number, rel: number, seed: number, D = 0.26, PhiDeg = 160): PoseFrame[] {
  const tpl = stand(def('shot-put'));
  const r = rng(seed);
  const rad = Math.PI / 180, th0 = (-rel - PhiDeg / 2) * rad, Phi = PhiDeg * rad;
  const sh = { x: tpl[11]!.x * LAND, y: tpl[11]!.y };
  const starts: number[] = [];
  let t = 1.0;
  for (let i = 0; i < 3; i++) { t += r() / fps; starts.push(t); t += D + 3.2; }
  const theta = (tt: number): number => {
    let th = th0;
    for (const s0 of starts) {
      const u = (tt - s0) / D;
      if (u <= 0) break;
      if (u < 1) return th0 + Phi * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI));
      const back = (tt - s0 - D - 1.2) / 1.5; // hold, then a slow return (< 0.5 body-heights/s, not an event)
      th = back <= 0 ? th0 + Phi : back < 1 ? th0 + Phi * (1 - (1 - Math.cos(Math.PI * back)) / 2) : th0;
    }
    return th;
  };
  const out: PoseFrame[] = [];
  for (let k = 0; k / fps < t; k++) {
    const th = theta(k / fps);
    const at = (len: number) => ({ x: (sh.x + Math.sin(th) * len * 0.72) / LAND, y: sh.y - Math.cos(th) * len * 0.72 });
    const lm = tpl.map((l) => ({ ...l }));
    const put = (i: number, p: { x: number; y: number }) => { lm[i] = { ...lm[i]!, ...p }; };
    put(13, at(0.17)); put(15, at(0.32)); put(17, at(0.36)); put(19, at(0.36)); put(21, at(0.36));
    out.push({ timestampMs: (k / fps) * 1000, landmarks: lm });
  }
  return out;
}

const grid = function* (noise: ReadonlyArray<readonly [number, number, number]> = NOISE) {
  for (const path of PATHS) for (const fps of FPS) for (const aspect of [LAND, PORT]) for (const [sigma, drop, jitterMs] of noise) yield { path, fps, aspect, sigma, drop, jitterMs } as Cond;
};

describe('accuracy vs ground truth', () => {
  it('reps: count and per-frame driver-angle error', () => {
    rows.push('\nREPS  6 reps/clip. Angle error = driver angle − truth, every frame, degrees.');
    rows.push('exercise      path    fps aspect σ    drop jit | count   bias    rmse     max');
    for (const id of ['back-squat', 'dumbbell-curl', 'push-jerk']) {
      const d = def(id);
      for (const c of grid()) {
        const frames = simulateExercise(d, { seed: 0, fps: c.fps });
        const truth = run(d, clean(frames), { aspect: LAND, path: 'offline' }).st; // unfiltered exact geometry
        const { rep, st } = run(d, degrade(frames, c, c.fps + c.sigma * 1e4), c);
        const e: number[] = [];
        for (const [i, s] of st) { const v = s.angles[d.reps!.driver]?.value, tv = truth.get(i)?.angles[d.reps!.driver]?.value; if (v !== undefined && tv !== undefined) e.push(v - tv); }
        const m = stats(e);
        rows.push(`${id.padEnd(13)} ${tag(c)} | ${String(rep.reps!.count).padStart(4)} ${f2(m.bias)} ${f2(m.rmse)} ${f2(m.max)}`);
        const why = `${id} ${tag(c)}`;
        expect.soft(rep.reps!.count, why).toBe(6);
        // Clean: offline is exact (incl. 9:16 → aspect correction); live error is One Euro lag only (its max is set by
        // the puppet's instantaneous arm-pose switch in push-jerk, so RMSE is asserted there).
        if (c.sigma === 0) {
          if (c.path === 'offline') expect.soft(m.max, why).toBeLessThan(1e-6); else expect.soft(m.rmse, why).toBeLessThan(4.5);
          expect.soft(Math.abs(rep.fps / c.fps - 1), `report fps ${why}`).toBeLessThan(1e-3);
        }
        if (c.sigma === 0.002) expect.soft(m.rmse, why).toBeLessThan(c.path === 'offline' ? 3.5 : 5.5);
      }
    }
  }, 300_000);

  it('jumps: height from flight time vs truth; frame-count quantisation analytic vs empirical', () => {
    rows.push('\nJUMPS  flights U(0.35, 0.65) s (15–52 cm), random take-off phase, 8 clips × 3 jumps. Error = measured − true height, cm.');
    rows.push('path    fps aspect σ    drop jit |   n     bias    rmse     max | frame-count method on clean clip: rmse  max | analytic SD  max');
    for (const c of grid()) {
      const e: number[] = [], efc: number[] = [];
      let n = 0, nTrue = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const r = rng(100 + seed);
        const Ts = [0, 1, 2].map(() => 0.35 + 0.3 * r());
        const frames = jumpClip(c.fps, Ts, seed);
        const evs = run(def('countermovement-jump'), degrade(frames, c, seed), c).rep.events!.filter((x) => x.kind === 'jump');
        nTrue += Ts.length; n += evs.length;
        evs.forEach((ev, j) => { if (Ts[j] !== undefined) e.push(ev.jumpHeightCm! - (G * Ts[j]! ** 2 / 8) * 100); });
        // Frame-count method (My Jump style) on the clean clip: first airborne frame → first frame back in contact.
        const air = frames.map((f) => f.landmarks[31]!.y < frames[0]!.landmarks[31]!.y - 1e-9);
        let j = 0;
        for (let k = 1; k < air.length; k++) if (air[k] && !air[k - 1]) { const k2 = air.indexOf(false, k); efc.push(((G * ((frames[k2]!.timestampMs - frames[k]!.timestampMs) / 1000) ** 2) / 8 - (G * Ts[j]! ** 2) / 8) * 100); j++; }
      }
      const m = stats(e), mf = stats(efc);
      // T_fc = T + (u2 − u1)/fps with u1, u2 ~ U(0,1): dT triangular on ±1/fps, SD = 1/(fps·√6). dh ≈ g·T·dT/4 (T = 0.5 s; max at T = 0.65 s).
      const sdA = ((G * 0.5) / 4) * (1 / (c.fps * Math.sqrt(6))) * 100, maxA = ((G * 0.65) / 4) * (1 / c.fps) * 100;
      rows.push(`${tag(c)} | ${n}/${nTrue} ${f2(m.bias)} ${f2(m.rmse)} ${f2(m.max)} |                       ${f2(mf.rmse)} ${f2(mf.max)} |   ${f2(sdA)} ${f2(maxA)}`);
      const why = tag(c);
      if (c.sigma <= 0.005) expect.soft(n, why).toBe(nTrue);
      if (c.sigma === 0 && c.aspect === LAND) {
        expect.soft(mf.rmse / sdA, `frame-count SD matches analytic ${why}`).toBeGreaterThan(0.6);
        expect.soft(mf.rmse / sdA, `frame-count SD matches analytic ${why}`).toBeLessThan(1.4);
        expect.soft(mf.max, why).toBeLessThan(maxA);
      }
      // Parabola-fit (sub-frame) estimate beats frame counting: clean < 0.5 cm even at 24 fps, and no filter bias.
      if (c.sigma === 0) { expect.soft(m.max, why).toBeLessThan(0.5); expect.soft(Math.abs(m.bias), why).toBeLessThan(0.3); }
      if (c.sigma === 0.002) expect.soft(m.rmse, why).toBeLessThan(2.5);
      if (c.sigma === 0.005 && c.path === 'offline') expect.soft(m.rmse, why).toBeLessThan(c.aspect === LAND ? 2.5 : 5);
    }
  }, 300_000);

  it('throws: release angle at peak wrist speed vs truth', () => {
    rows.push(`\nTHROWS  release 20/35/45°, peak arm ω ≈ ${OMEGA.toFixed(1)} rad/s, 3 throws × 3 seeds. Error = measured − true, degrees. Whole-frame bound = ω/(2·fps).`);
    rows.push('path    fps aspect σ    drop jit |   n     bias    rmse     max | bound');
    for (const c of grid(NOISE.slice(0, 3))) {
      const e: number[] = [];
      let n = 0, nTrue = 0;
      for (const rel of [20, 35, 45]) for (let seed = 1; seed <= 3; seed++) {
        const evs = run(def('shot-put'), degrade(throwClip(c.fps, rel, seed), c, seed), c).rep.events!.filter((x) => x.kind === 'release');
        nTrue += 3; n += evs.length;
        for (const ev of evs) e.push(ev.releaseAngle! - rel);
      }
      const m = stats(e);
      const bound = (OMEGA / (2 * c.fps)) * (180 / Math.PI);
      rows.push(`${tag(c)} | ${n}/${nTrue} ${f2(m.bias)} ${f2(m.rmse)} ${f2(m.max)} | ${bound.toFixed(1)}`);
      const why = tag(c);
      if (c.path === 'offline' || c.sigma <= 0.002) expect.soft(n, why).toBe(nTrue);
      // Sub-frame peak interpolation: clean error ≪ the whole-frame bound at every fps.
      if (c.sigma === 0) expect.soft(m.max, why).toBeLessThan(0.5);
      if (c.sigma === 0.002 && c.path === 'offline') expect.soft(m.rmse, why).toBeLessThan(2);
    }
  }, 300_000);

  it('holds: total hold time vs truth', () => {
    rows.push('\nHOLDS  truth = same puppet at 240 fps, unfiltered. Error = measured − true total hold, s.');
    rows.push('exercise  path    fps aspect σ    drop jit |  total   truth     err');
    for (const id of ['plank', 'wall-sit']) {
      const d = def(id);
      const truth = run(d, clean(simulateExercise(d, { seed: 0, fps: 240 })), { aspect: LAND, path: 'offline' }).rep.hold!.totalSec;
      for (const c of grid()) {
        const h = run(d, degrade(simulateExercise(d, { seed: 0, fps: c.fps }), c, c.fps), c).rep.hold!;
        rows.push(`${id.padEnd(9)} ${tag(c)} | ${f2(h.totalSec)} ${f2(truth)} ${f2(h.totalSec - truth)}`);
        const why = `${id} ${tag(c)}`;
        // Portrait at σ = 0.005 (≈ 10 % of a forearm's length per landmark) still trips the foreshortening gate: not asserted.
        if (c.sigma === 0) expect.soft(Math.abs(h.totalSec - truth), why).toBeLessThan(0.1);
        else if (c.sigma === 0.002 || (c.sigma === 0.005 && c.aspect === LAND)) expect.soft(Math.abs(h.totalSec - truth), why).toBeLessThan(1);
      }
    }
  }, 300_000);

  it('hold: a gap with no pose frames breaks the continuous hold', () => {
    const d = def('plank');
    const frames = simulateExercise(d, { seed: 0, fps: 30 });
    const mid = frames.length / 2;
    const gapped = frames.filter((_, i) => i < mid || i > mid + 60); // athlete out of frame for 2 s: no landmarks at all
    const h = run(d, clean(gapped), { aspect: LAND, path: 'live' }).rep.hold!;
    expect(h.bestSec).toBeLessThan(h.totalSec * 0.6);
  }, 300_000);

  it('prints the accuracy table', () => { console.log(rows.join('\n')); });
});
