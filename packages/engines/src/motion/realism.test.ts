/**
 * Realism stress harness: the demo athlete (puppet) perturbed the way a real camera + MediaPipe perturbs it, through the
 * live engine (One Euro, movement check on) or the upload path (offline*: filtfiltLandmarks at uploadCutoffHz, then
 * smoothing 'none', as Session.tsx runs it). Truth comes from the generator: E = scripted reps/attempts, H = seconds of
 * emitted frames whose pose is inside every hold band. Over-counting always fails a cell (holds: > H + 0.5/1 s).
 * Every cell runs over independent draws (puppet seed × noise seed, the noise seed hashed from cell + exercise):
 * `still` fails if ANY draw counts (over-counting is the safety case); other cells count the mean failing fraction.
 *  - default run (CI, ≈ 40 s): 4 reps, the core perturbations on 1 draw, `still` on 5 draws, owner pairs.
 *  - REALISM=1: every perturbation on 3 draws, 6 reps, prints the F/M/D/Z/T/E/O table and the wrong-exercise matrix.
 *  - FULL=1 (with REALISM=1): per-exercise lines.
 * What passing proves: the algorithm is self-consistent under these perturbations. The world-z noise model (3× xy,
 * AR(1) drift, 0.6 compression) is an assumption: re-fit it on real MediaPipe clips before claiming "any camera".
 */
import { expect, it } from 'vitest';
import type { PoseFrame } from '../jump/types.js';
import { EXERCISES, exerciseById } from './catalog/index.js';
import { MotionSession, referenceSignature } from './engine.js';
import { filtfiltLandmarks, uploadCutoffHz } from './filtfilt.js';
import { simulateExercise } from './puppet.js';
import type { ExerciseDef } from './types.js';

const ASPECT = 16 / 9;
const FULLRUN = !!process.env.REALISM;
type LM = PoseFrame['landmarks'][number];
type Tf = (f: PoseFrame[], def: ExerciseDef) => PoseFrame[];

let seed = 12345;
/** FNV-1a hash → a Park–Miller seed in [1, 2³¹ − 2], so every (cell, exercise, draw) gets its own noise stream. */
const seedOf = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return ((h >>> 0) % 2147483646) + 1; };
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const isL = (i: number) => i >= 11 && i % 2 === 1;
const isR = (i: number) => i >= 12 && i % 2 === 0;
const swapLR = (a: LM[]) => a.map((_, i) => a[isL(i) ? i + 1 : isR(i) ? i - 1 : i]!);
/** Map image landmarks (and optionally world landmarks). */
const map = (fs: PoseFrame[], g: (lm: LM, i: number, f: PoseFrame, k: number) => LM, w?: (lm: LM, i: number, f: PoseFrame, k: number) => LM): PoseFrame[] =>
  fs.map((f, k) => ({ ...f, landmarks: f.landmarks.map((lm, i) => g(lm, i, f, k)), ...(f.world && w ? { world: f.world.map((lm, i) => w(lm, i, f, k)) } : {}) }));
const keep = (lm: LM) => lm;

/** Metres per frame height (puppet: 0.72 frame heights ≈ 1.75 m). */
const MPF = 2.4;
/** White landmark noise, σ in frame heights; world xy σ = 2.4·σ m, world z 3× that (assumption: monocular depth is the weakest axis). */
const noise = (sd: number): Tf => (fs) => map(fs, (lm) => ({ ...lm, x: lm.x + (gauss() * sd) / ASPECT, y: lm.y + gauss() * sd }),
  (lm) => ({ ...lm, x: lm.x + gauss() * sd * MPF, y: lm.y + gauss() * sd * MPF, z: lm.z + 3 * gauss() * sd * MPF }));
/** AR(1) jitter per landmark (stationary σ, correlation ρ per frame): low-frequency wobble no One Euro removes. */
const ar1 = (fs: PoseFrame[], rho: number, sd: number, f: (lm: LM, e: number[], world: boolean) => LM): PoseFrame[] => {
  const s = new Map<string, number[]>(), q = Math.sqrt(1 - rho * rho);
  const step = (key: string) => { const e = (s.get(key) ?? [gauss() * sd, gauss() * sd, gauss() * sd]).map((x) => rho * x + q * sd * gauss()); s.set(key, e); return e; };
  return map(fs, (lm, i) => f(lm, step(`i${i}`), false), (lm, i) => f(lm, step(`w${i}`), true));
};
const corrNoise: Tf = (fs) => ar1(fs, 0.9, 0.005, (lm, e, w) => w
  ? { ...lm, x: lm.x + e[0]! * MPF, y: lm.y + e[1]! * MPF, z: lm.z + 3 * e[2]! * MPF }
  : { ...lm, x: lm.x + e[0]! / ASPECT, y: lm.y + e[1]! });
const zDrift: Tf = (fs) => ar1(fs, 0.8, 0.04, (lm, e, w) => (w ? { ...lm, z: lm.z + e[0]! } : lm));
const zFlat: Tf = (fs) => map(fs, keep, (lm) => ({ ...lm, z: lm.z * 0.6 }));
const noWorld: Tf = (fs) => fs.map(({ world: _w, ...f }) => f);

/**
 * Turn the athlete θ° about the vertical axis through the hip: rotate the world landmarks, then reproject with a
 * weak-perspective (affine) camera, x_img = hip.x + s·x′/aspect, y_img = hip.y + s·y, s = image/world y-span
 * (Hartley & Zisserman 2004 §6.3). Points turned away (z′ > 8 cm) lose visibility, as MediaPipe's do.
 */
const yaw = (deg: number): Tf => (fs) => {
  const c = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180);
  return occlude(fs.map((f) => {
    if (!f.world) return f;
    const w = f.world.map((p) => ({ ...p, x: p.x * c + p.z * sn, z: -p.x * sn + p.z * c }));
    const ys = f.landmarks.map((p) => p.y), wy = f.world.map((p) => p.y);
    const s = (Math.max(...ys) - Math.min(...ys)) / (Math.max(...wy) - Math.min(...wy) || 1);
    const hx = (f.landmarks[23]!.x + f.landmarks[24]!.x) / 2, hy = (f.landmarks[23]!.y + f.landmarks[24]!.y) / 2;
    const wh = { x: (w[23]!.x + w[24]!.x) / 2, y: (w[23]!.y + w[24]!.y) / 2 };
    return {
      ...f,
      landmarks: f.landmarks.map((lm, i) => ({ ...lm, x: hx + (s * (w[i]!.x - wh.x)) / ASPECT, y: hy + s * (w[i]!.y - wh.y), visibility: w[i]!.z > 0.08 ? lm.visibility * (0.5 + 0.3 * rnd()) : lm.visibility })),
      world: w,
    };
  }));
};
/**
 * Occluded points: MediaPipe still outputs a guess for them. Every point the occlusion model darkened (v < 0.7) gets an
 * AR(1) position error (ρ 0.9) with σ = 0.05·(1 − v) frame heights (0.03 at v 0.4; world 2.4× that, ≈ 7 cm), and, while
 * v < 0.5, starts a 1 s collapse onto its near-side counterpart with p 0.02 per frame (MediaPipe's classic far-limb guess).
 */
const occlude = (fs: PoseFrame[]): PoseFrame[] => {
  const st = new Map<number, { e: number[]; c: number }>();
  return fs.map((f) => {
    const im = f.landmarks, W = f.world;
    if (!im.length) return f;
    const lm2 = im.map((p) => ({ ...p })), w2 = W?.map((p) => ({ ...p }));
    im.forEach((p, i) => {
      const v = p.visibility;
      if (i < 11 || v >= 0.7) return;
      const z = st.get(i) ?? { e: [gauss(), gauss(), gauss()], c: 0 };
      z.e = z.e.map((x) => 0.9 * x + 0.436 * gauss()); // stationary unit variance: √(1 − 0.81)
      if (z.c > 0) z.c--; else if (v < 0.5 && rnd() < 0.02) z.c = 30;
      st.set(i, z);
      const sd = 0.05 * (1 - v), m = isL(i) ? i + 1 : i - 1, src = z.c > 0 ? im[m]! : p, srcW = z.c > 0 ? W?.[m] : W?.[i];
      lm2[i] = { ...p, x: src.x + (z.e[0]! * sd) / ASPECT, y: src.y + z.e[1]! * sd };
      if (w2 && srcW) w2[i] = { ...W![i]!, x: srcW.x + z.e[0]! * sd * MPF, y: srcW.y + z.e[1]! * sd * MPF, z: srcW.z + z.e[2]! * sd * MPF };
    });
    return { ...f, landmarks: lm2, ...(w2 ? { world: w2 } : {}) };
  });
};
const DISTAL = new Set([15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32]);
/** Feet/ankles/wrists visibility U(lo,hi), plus 5 % dropouts to 0.1. */
const distalVis = (lo: number, hi: number): Tf => (fs) => map(fs, (lm, i) => DISTAL.has(i) ? { ...lm, visibility: rnd() < 0.05 ? 0.1 : lo + (hi - lo) * rnd() } : lm);
/** Real side view: the far side is occluded (`far` = which labels are far). */
const farVis = (lo: number, hi: number, far = isR): Tf => (fs, def) => def.camera !== 'side' ? fs : occlude(map(fs, (lm, i) => far(i) ? { ...lm, visibility: lo + (hi - lo) * rnd() } : lm));
/** Athlete's right side toward the camera: swap L/R labels in image and world; then the (new) far left side darkens. */
const rightNear: Tf = (fs, d) => farVis(0.2, 0.6, isL)(fs.map((f) => ({ ...f, landmarks: swapLR(f.landmarks), ...(f.world ? { world: swapLR(f.world) } : {}) })), d);
const mirror: Tf = (fs) => map(fs, (lm) => ({ ...lm, x: 1 - lm.x }), (lm) => ({ ...lm, x: -lm.x }));
const tempo = (k: number): Tf => (fs) => fs.map((f) => ({ ...f, timestampMs: f.timestampMs * k }));
const offCentre: Tf = (fs) => map(fs, (lm) => ({ ...lm, x: 0.25 + (lm.x - 0.5) * 0.6, y: 0.3 + (lm.y - 0.5) * 0.6 }));
const zLike: Tf = (fs) => map(fs, (lm) => ({ ...lm, z: gauss() * 0.3 }));
/** Body proportions: shins and forearms 15 % longer (distal points slide along the segment), image and world. */
const longer = (a: LM[]) => {
  const l = a.map((p) => ({ ...p }));
  for (const [prox, dist, rest] of [[25, 27, [29, 31]], [26, 28, [30, 32]], [13, 15, [17, 19, 21]], [14, 16, [18, 20, 22]]] as const) {
    const dx = (l[dist]!.x - l[prox]!.x) * 0.15, dy = (l[dist]!.y - l[prox]!.y) * 0.15, dz = (l[dist]!.z - l[prox]!.z) * 0.15;
    for (const j of [dist, ...rest]) { l[j]!.x += dx; l[j]!.y += dy; l[j]!.z += dz; }
  }
  return l;
};
const limbs: Tf = (fs) => fs.map((f) => ({ ...f, landmarks: longer(f.landmarks), ...(f.world ? { world: longer(f.world) } : {}) }));
/** 3 % empty detections plus one 200 ms loss every 5 s. */
const dropout: Tf = (fs) => fs.map((f) => (rnd() < 0.03 || f.timestampMs % 5000 < 200 ? { timestampMs: f.timestampMs, landmarks: [] } : f));
const fps15: Tf = (fs) => fs.filter((_, i) => i % 2 === 0);
const tsJitter: Tf = (fs) => fs.map((f) => ({ ...f, timestampMs: f.timestampMs + (rnd() - 0.5) * 16 }));
/** 1 % of frames start a 1–2 frame left/right label swap (MediaPipe's classic glitch). */
const lrSwap: Tf = (fs) => { let left = 0; return fs.map((f) => { if (!left && rnd() < 0.01) left = 1 + Math.floor(rnd() * 2); if (!left) return f; left--; return { ...f, landmarks: swapLR(f.landmarks), ...(f.world ? { world: swapLR(f.world) } : {}) }; }); };
const chain = (...t: Tf[]): Tf => (fs, d) => t.reduce((a, f) => f(a, d), fs);
/** Standing still for 10 s on a bad camera: the first frame given (the start pose; for holds a pose outside the bands), white + correlated noise and z drift. */
const still: Tf = (fs, d) => chain(...(process.env.STILLV === '1' ? [noise(0.02), corrNoise] : process.env.STILLV === '2' ? [noise(0.02), zDrift] : process.env.STILLV === '3' ? [noise(0.02), corrNoise, zDrift, noWorld] : [noise(0.02), corrNoise, zDrift]))(Array.from({ length: 300 }, (_, i) => ({ ...fs[0]!, timestampMs: (i * 1000) / 30 })), d);
const REAL: Tf = chain(yaw(25), corrNoise, noise(0.008), zDrift, farVis(0.4, 0.8), distalVis(0.45, 0.95), dropout, lrSwap, tsJitter);

type Group = 'clean' | 'harsh' | 'report' | 'idle';
const yawN = (deg: number): Tf => chain(yaw(deg), noise(0.008), zDrift);
/** [name, transform, group, uses partial-depth frames (rom85/REAL), timestamp scale for hold truth] */
const PERTURB: Array<[string, Tf, Group, number?, number?]> = [
  ['base', (f) => f, 'clean'],
  ['noise1', noise(0.01), 'clean'],
  ['noise2', noise(0.02), 'harsh'],
  ['distalVis', distalVis(0.3, 0.7), 'clean'],
  ['farVis', farVis(0.2, 0.6), 'clean'],
  ['feetVis', (fs) => map(fs, (lm, i) => i >= 27 ? { ...lm, visibility: 0.3 + 0.4 * rnd() } : lm), 'clean'],
  ['flicker3', (fs) => map(fs, (lm, i, _f, k) => i >= 27 && (k * 7919) % 100 < 3 ? { ...lm, visibility: 0.2 } : lm), 'clean'],
  ['rightNear', rightNear, 'clean'],
  ['yaw20', yaw(20), 'clean'],
  // Turned athletes always carry depth error: exact rotated world points would only show that exact 3D angles are
  // rotation-invariant. Noise-free variants stay as report-only rows.
  ['yaw45', yawN(45), 'harsh'],
  ['yaw90', yawN(90), 'harsh'],
  ['yaw45n2', chain(yaw(45), noise(0.02)), 'harsh'],
  ['rom85', (f) => f, 'harsh', 0.85],
  ['fast', tempo(0.6), 'harsh', undefined, 0.6],
  ['slow', tempo(1.7), 'harsh', undefined, 1.7],
  ['fps15', fps15, 'harsh'],
  ['tsJitter', tsJitter, 'harsh'],
  ['lrSwap', lrSwap, 'harsh'],
  ['dropout', dropout, 'harsh'],
  ['corrNoise', corrNoise, 'harsh'],
  ['zFlat', zFlat, 'harsh'],
  ['zDrift', zDrift, 'harsh'],
  ['mirror', mirror, 'clean'],
  ['offCtr', offCentre, 'clean'],
  ['limbs', limbs, 'clean'],
  ['zLike', zLike, 'clean'],
  ['noWorld', noWorld, 'clean'],
  ['offline', (f) => f, 'clean'],
  ['offlineN1', noise(0.01), 'harsh'],
  ['REAL', REAL, 'harsh', 0.9],
  ['still', still, 'idle'],
  ['yaw45pure', yaw(45), 'report'],
  ['yaw90pure', yaw(90), 'report'],
  ['yaw90_noWorld', chain(yaw(90), noWorld), 'report'],
];
const CORE = new Set(['base', 'noise2', 'farVis', 'rightNear', 'yaw45', 'yaw90', 'rom85', 'dropout', 'offline', 'REAL', 'still']);
/** Draws per cell: [puppet seed, noise draw]. `still` always gets STILL_DRAWS (cheap, and it is the safety case). */
const DRAWS: Array<[number, number]> = FULLRUN ? [[3, 0], [3, 1], [5, 2]] : [[3, 0]];
const STILL_DRAWS: Array<[number, number]> = [[3, 0], [5, 1], [3, 2], [5, 3], [3, 4]];

/**
 * Failing cells allowed, of 90 (rom85: of the reps defs), as the mean over draws. Lowering a target needs a written reason here.
 *  - alternating drills (minRepMs 250–350) can merge two cycles across a gap or a 2× frame step: ≤ 2.
 *  - small-ROM drivers (crunch, calf raise, curl-up) lose reps when 6·σ̂ of the noise exceeds their range: ≤ 3.
 */
const TARGET: Record<string, number> = {
  base: 0, noise1: 0, distalVis: 0, feetVis: 0, flicker3: 0, mirror: 0, offCtr: 0, limbs: 0, zLike: 0, yaw20: 0, farVis: 0, rightNear: 0, noWorld: 0, offline: 0,
  fast: 2, slow: 2, fps15: 2, tsJitter: 2, lrSwap: 2, dropout: 2, corrNoise: 2, zFlat: 2, zDrift: 2, offlineN1: 2,
  noise2: 3, yaw45: 3, yaw90: 3, yaw45n2: 3, rom85: 3, REAL: 3, still: 0,
};

let cellName = '';
function run(def: ExerciseDef, frames: PoseFrame[], offline = false): { n: number; mism: number; pctU: number; framing: string; rejected: number } {
  const s = new MotionSession(def, offline ? { smoothing: 'none' } : {});
  let untracked = 0;
  const framing = new Map<string, number>();
  for (const f of offline ? filtfiltLandmarks(frames, uploadCutoffHz(def)) : frames) {
    const l = s.push(f, ASPECT);
    if (!l.tracking && f.landmarks.length) { untracked++; framing.set(l.framing!, (framing.get(l.framing!) ?? 0) + 1); }
  }
  const r = s.finish();
  if (process.env.ONLY) console.log('RUN', cellName, def.id, JSON.stringify(r.reps?.list.map((x) => [Math.round(x.startMs), Math.round(x.durationMs), Math.round(x.rom), Math.round(x.extreme)])), r.mismatched.map((m) => m.reason).join('|'), r.hold?.totalSec, (r.events ?? []).map((e) => `${Math.round(e.tMs)}:${e.peakSpeed?.toFixed(1) ?? e.flightMs?.toFixed(0)}`).join(","));
  const n = def.mode === 'reps' ? r.reps?.count ?? 0 : def.mode === 'hold' ? r.hold?.totalSec ?? 0 : (r.events ?? []).filter((e) => !e.faults.some((x) => /doesn't|beyond|left the camera|Body position/.test(x))).length;
  return { n, mism: r.mismatched.length, pctU: untracked / frames.length, framing: [...framing].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '', rejected: r.reps?.rejected ?? 0 };
}

/** Per-frame truth on noise-free frames: every hold check's angle inside its ok band (geometry only: no filter, no
 * median, no grace, no movement check). Unmeasurable → out. */
function inBand(def: ExerciseDef, frames: PoseFrame[]): boolean[] {
  const s = new MotionSession(def, { smoothing: 'none', checkMovement: false });
  const hc = def.checks.filter((c) => c.when === 'hold');
  return frames.map((f) => {
    const l = s.push(f, ASPECT);
    return l.tracking && hc.length > 0 && hc.every((c) => { const v = l.angles[c.angle]?.value; return v !== undefined && v >= c.ok[0] && v <= c.ok[1]; });
  });
}
/** H: seconds of emitted frames inside every hold band (frame steps capped at 100 ms, as the engine credits them). */
function holdTruth(def: ExerciseDef, frames: PoseFrame[]): number {
  const ok = inBand(def, frames);
  let ms = 0;
  for (let i = 1; i < frames.length; i++) if (ok[i] && ok[i - 1]) ms += Math.min(100, frames[i]!.timestampMs - frames[i - 1]!.timestampMs);
  return ms / 1000;
}
/** Holds' idle start: the candidate pose (own clip, or a standing / plank / lying start pose) furthest outside a hold band (≥ 20°). */
function outsidePose(def: ExerciseDef, own: PoseFrame[]): PoseFrame | null {
  const hc = def.checks.filter((c) => c.when === 'hold' && def.angles.find((a) => a.id === c.angle)?.kind !== 'spread');
  const cands = [...own.filter((_, i) => i % 15 === 0), ...['back-squat', 'push-up', 'crunch'].map((id) => simulateExercise(exerciseById(id)!, { reps: 1, seed: 3, aspect: ASPECT })[0]!)];
  let best: PoseFrame | null = null, bestD = 0;
  for (const f of cands) {
    const s = new MotionSession(def, { smoothing: 'none', checkMovement: false });
    let l = s.push(f, ASPECT);
    for (let i = 1; i < 6; i++) l = s.push({ ...f, timestampMs: f.timestampMs + i * 33 }, ASPECT);
    if (!l.tracking) continue;
    const d = Math.max(0, ...hc.map((c) => { const v = l.angles[c.angle]?.value; return v === undefined ? 0 : Math.max(c.ok[0] - v, v - c.ok[1]); }));
    if (d > bestD) { bestD = d; best = f; }
  }
  return bestD >= 20 ? best : null;
}

/** Pass/fail of one cell against the generator's truth (E reps/events, H hold seconds). */
function judge(def: ExerciseDef, group: Group, o: ReturnType<typeof run>, E: number, H: number): { n: number; gate: string } {
  const n = o.n;
  let ok: boolean;
  if (group === 'idle') ok = def.mode === 'hold' ? n <= 0.5 : n === 0;
  else if (def.mode === 'hold') ok = group === 'clean' ? n >= 0.9 * H && n <= H + 0.5 : n >= 0.8 * H && n <= H + 1;
  else ok = group === 'clean' ? n === E : n >= E - 1 && n <= E;
  let gate = '';
  if (!ok) {
    if (def.mode === 'hold' ? n > H + 0.5 : n > E) gate = def.mode === 'hold' ? `O(+${(n - H).toFixed(1)}s)` : `O(+${n - E})`;
    else if (o.pctU > 0.15) gate = `F(${Math.round(o.pctU * 100)}%:${o.framing.slice(0, 22)})`;
    else if (o.mism) gate = 'M';
    else if (o.rejected) gate = `T(x${o.rejected})`;
    else gate = def.mode === 'hold' ? 'Z' : def.mode === 'event' ? 'E' : 'D';
  }
  return { n, gate };
}

function table(reps: number, names: Set<string> | null) {
  const lines: string[] = [];
  const fails: Record<string, number> = {};
  const gates: Record<string, Record<string, number>> = {};
  const failed: Record<string, string[]> = {};
  const clips = new Map<string, PoseFrame[]>();
  for (const def of EXERCISES.filter((d) => !process.env.ONLY || process.env.ONLY.split(',').includes(d.id))) {
    const clip = (ps: number, d = 1) => { const k = `${ps}:${d}`; if (!clips.has(k)) clips.set(k, simulateExercise(def, { reps, seed: ps, aspect: ASPECT, ...(d < 1 ? { depth: d } : {}) })); return clips.get(k)!; };
    clips.clear();
    const H = new Map<number, number>(); // per puppet seed
    const truthH = (ps: number) => H.get(ps) ?? H.set(ps, holdTruth(def, clip(ps))).get(ps)!;
    if (def.mode === 'hold') {
      const scripted = (def.hold?.targetSec ?? 20) + 3;
      expect.soft(truthH(3), `${def.id}: in-band truth ${truthH(3).toFixed(1)} s vs ${scripted} s scripted`).toBeGreaterThanOrEqual(0.9 * scripted);
    }
    const cells: string[] = [];
    for (const [name, tf, group, d, k] of PERTURB) {
      if (names && !names.has(name)) continue;
      if (d && def.mode !== 'reps' && name === 'rom85') continue;
      const idleSrc = group === 'idle' && def.mode === 'hold' ? outsidePose(def, clip(3)) : null;
      if (group === 'idle' && def.mode === 'hold' && !idleSrc) { cells.push(`${name}=skip(no pose ≥ 20° outside the bands)`); continue; }
      const draws = group === 'idle' ? STILL_DRAWS : DRAWS;
      let bad = 0;
      const shownAll: string[] = [];
      for (const [ps, kd] of draws) {
        seed = seedOf(`${name}|${def.id}|${kd}`); cellName = `${name}#${kd}`;
        const src = idleSrc ? [idleSrc] : d && def.mode === 'reps' ? clip(ps, d) : clip(ps);
        const o = judge(def, group, run(def, tf(src, def), name.startsWith('offline')), group === 'idle' ? 0 : reps, def.mode === 'hold' ? truthH(ps) * (k ?? 1) : 0);
        const shown = def.mode === 'hold' ? o.n.toFixed(1) : String(o.n);
        if (o.gate || name === 'base') shownAll.push(`${shown}${o.gate ? ' ' + o.gate : ''}`);
        if (o.gate) {
          bad++;
          const g = o.gate.slice(0, 1);
          (gates[name] ??= {})[g] = (gates[name]![g] ?? 0) + 1;
        }
      }
      if (shownAll.length) cells.push(`${name}=${shownAll.join('/')}`);
      if (bad) {
        // `still`: any draw counting is a failure; else the mean failing fraction over draws.
        fails[name] = (fails[name] ?? 0) + (group === 'idle' ? 1 : bad / draws.length);
        (failed[name] ??= []).push(def.id + (draws.length > 1 ? `(${bad}/${draws.length})` : ''));
      }
    }
    lines.push(`${def.id} [${def.camera}/${def.mode}] H=${def.mode === 'hold' ? truthH(3).toFixed(1) : '-'} ${cells.join(' | ')}`);
  }
  return { lines, fails, gates, failed };
}

/**
 * A deep squat right before every throw: the javelin athlete's legs (landmarks 23–32, image and world) replaced by a
 * squatting athlete's, hip-aligned, with the (2× speed) squat's bottom 0.75 s before each release.
 */
function squatThenThrow(reps: number): PoseFrame[] {
  const jav = simulateExercise(exerciseById('javelin-release')!, { reps, seed: 3, aspect: ASPECT });
  const sq = simulateExercise(exerciseById('back-squat')!, { reps: 2, seed: 3, aspect: ASPECT }); // rep 1 is full depth (the demo's last is shallow)
  const s0 = new MotionSession(exerciseById('javelin-release')!, { checkMovement: false });
  for (const f of jav) s0.push(f, ASPECT);
  const releases = (s0.finish().events ?? []).map((e) => e.tMs + jav[0]!.timestampMs);
  const hip = (a: LM[]) => ({ x: (a[23]!.x + a[24]!.x) / 2, y: (a[23]!.y + a[24]!.y) / 2 });
  const bottom = sq.reduce((b, f, i) => (hip(f.landmarks).y > hip(sq[b]!.landmarks).y ? i : b), 0); // lowest hips
  const legs = (up: LM[], lo: LM[]) => { const hu = hip(up), hl = hip(lo); return up.map((p, i) => (i >= 23 ? { ...lo[i]!, x: lo[i]!.x - hl.x + hu.x, y: lo[i]!.y - hl.y + hu.y } : p)); };
  return jav.map((f) => {
    const r = releases.find((t) => Math.abs(f.timestampMs - (t - 750)) < 1500);
    const k = r === undefined ? 0 : bottom + Math.round((2 * (f.timestampMs - (r - 750))) / (1000 / 30)); // at 2× speed, so it fits the 1.5 s pre-release window
    const g = sq[Math.max(0, Math.min(sq.length - 1, k))]!;
    return { ...f, landmarks: legs(f.landmarks, g.landmarks), ...(f.world && g.world ? { world: f.world.map((p, i) => (i >= 23 ? g.world![i]! : p)) } : {}) };
  });
}

/** Owner's must-catch pairs: [selected, frames, label, must also flag it (else counting 0 is enough)]. */
function ownerPairs(reps: number): Array<[string, PoseFrame[], string, boolean?]> {
  const sim = (id: string) => simulateExercise(exerciseById(id)!, { reps, seed: 3, aspect: ASPECT });
  return [
    ['javelin-release', squatThenThrow(reps), 'deep squat before every throw', true],
    ['front-raise', sim('overhead-press'), 'overhead press as front raise', true],
    ['plank', sim('back-squat'), 'squats in plank', true],
    ['tree-pose', sim('back-squat'), 'squats in tree pose', true],
    ['front-raise', yaw(90)(sim('lateral-raise'), exerciseById('lateral-raise')!), 'lateral raise turned 90° (3D plane test) as front raise', true],
    // Regressions the self-normalised counter introduced against the absolute-threshold engine (9ed7bb7^ counted 0).
    ...([['overhead-press', 'butt-kicks'], ['dumbbell-shoulder-press', 'butt-kicks'], ['upright-row', 'butt-kicks'], ['standing-calf-raise', 'butt-kicks'], ['standing-calf-raise', 'discus-release'],
      ['romanian-deadlift', 'snatch'], ['good-morning', 'snatch'], ['hip-hinge-drill', 'snatch']] as const).map(([a, b]): [string, PoseFrame[], string] => [a, sim(b), `${b} as ${a}`]),
  ];
}

it('realism stress table', () => {
  const reps = FULLRUN ? 6 : 4;
  const { lines, fails, gates, failed } = table(reps, FULLRUN ? null : CORE);
  if (process.env.FULL) console.log(lines.join('\n'));
  if (FULLRUN) {
    console.log(`\nFAILS per perturbation (of 90, mean over ${DRAWS.length} draws; still: any of ${STILL_DRAWS.length}; F=framing M=wrong-exercise D=driver/count Z=hold time T=too fast E=no event O=over-count; gate tallies are per draw):`);
    for (const [name] of PERTURB) console.log(`${name.padEnd(14)} ${(fails[name] ?? 0).toFixed(2).padStart(5)}  ${JSON.stringify(gates[name] ?? {})} ${(failed[name] ?? []).slice(0, 10).join(' ')}`);
  }
  for (const [name] of PERTURB) {
    if (TARGET[name] === undefined || (!FULLRUN && !CORE.has(name))) continue;
    expect.soft(fails[name] ?? 0, `${name}: ${(failed[name] ?? []).join(', ')}`).toBeLessThanOrEqual(TARGET[name]!);
  }

  // Owner pairs: a clearly different exercise must never count, on a clean, a noisy and a realistic camera.
  for (const [sel, frames, label, flag] of ownerPairs(reps)) {
    const def = exerciseById(sel)!;
    for (const [pn, tf] of [['base', (f: PoseFrame[]) => f], ['noise1', noise(0.01)], ['REAL', REAL]] as const) {
      seed = seedOf(`${label}|${pn}`);
      const o = run(def, tf(frames, def));
      if (flag) expect.soft(o.mism, `${label} [${pn}] flagged`).toBeGreaterThan(0);
      expect.soft(def.mode === 'hold' ? o.n : o.n, `${label} [${pn}] counted`).toBeLessThanOrEqual(def.mode === 'hold' ? 1 : 0);
    }
  }

  // Wrong-exercise matrix: A must count 0 reps on B's frames whenever B's reference moves a joint A keeps still.
  if (FULLRUN) {
    const repsDefs = EXERCISES.filter((d) => d.mode === 'reps');
    const clip = new Map(EXERCISES.map((d) => [d.id, simulateExercise(d, { reps: 3, seed: 3, aspect: ASPECT })]));
    let pairs = 0, clean = 0;
    const leaks: string[] = [];
    for (const a of repsDefs) {
      const ra = referenceSignature(a)!;
      for (const b of EXERCISES) {
        if (b.id === a.id) continue;
        const rb = referenceSignature(b);
        if (!rb || !(['knee', 'hip', 'elbow', 'shoulder'] as const).some((p) => ra.rom[p] < 20 && rb.rom[p] > 100)) continue;
        pairs++;
        const o = run(a, clip.get(b.id)!);
        if (o.n === 0) clean++; else leaks.push(`${a.id}<-${b.id}=${o.n}`);
      }
    }
    console.log(`\nWRONG-EXERCISE MATRIX: ${clean}/${pairs} pairs counted 0. Leaks: ${leaks.slice(0, 30).join(' ')}`);
    expect.soft(clean / Math.max(1, pairs)).toBeGreaterThanOrEqual(0.95);
  }
}, FULLRUN ? 900_000 : 120_000);
