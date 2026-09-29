/**
 * Synthetic athlete for demo / testing without a camera.
 *
 * Builds a 2D stick figure by forward kinematics from joint angles, with
 * keyframes derived from the exercise's own green bands — so any catalog
 * entry can be replayed through the real engine. Directions are measured
 * from straight up, clockwise toward +x (the way the figure faces).
 */

import type { PoseFrame } from '../jump/types.js';
import type { Check, ExerciseDef, JointName } from './types.js';

interface Pose { trunk: number; hip: number; knee: number; ankle: number | null; shoulder: number; elbow: number; spread: number; lift: number; arm: number | null }

const BASE: Pose = { trunk: 2, hip: 176, knee: 176, ankle: null, shoulder: 15, elbow: 168, spread: 0.9, lift: 0, arm: null };
const SEG = { trunk: 0.3, thigh: 0.245, shin: 0.245, foot: 0.075, upper: 0.17, fore: 0.15, head: 0.11 };

const mid = (c: Check) => (c.good[0] + c.good[1]) / 2;
const rad = (d: number) => (d * Math.PI) / 180;
const dir = (d: number) => ({ x: Math.sin(rad(d)), y: -Math.cos(rad(d)) });

function applyChecks(def: ExerciseDef, p: Pose, phases: Check['when'][], set = new Set<string>()): Pose {
  const out = { ...p };
  for (const c of def.checks) {
    if (!phases.includes(c.when)) continue;
    const a = def.angles.find((x) => x.id === c.angle);
    if (!a) continue;
    const v = mid(c);
    if (a.kind === 'joint') {
      const j = a.joint as JointName;
      if (j === 'bodyLine') { out.hip = v; out.knee = Math.max(out.knee, 172); }
      else if (j === 'wrist') continue;
      else { (out as unknown as Record<string, number>)[j] = v; set.add(j); }
    } else if (a.kind === 'segment' && a.ref === 'vertical') {
      if (a.segment === 'trunk') { out.trunk = v; set.add('trunk'); }
      if (a.segment === 'upperArm') out.arm = v;
    } else if (a.kind === 'spread' && a.what === 'feet') out.spread = v;
  }
  return settle(out, set);
}

/** Standing & bent-kneed with a free hip: keep the shin ~25° forward so the pose balances. */
function settle(p: Pose, set: Set<string>): Pose {
  if (set.has('hip') || p.knee > 160 || Math.abs(p.trunk) > 60) return p;
  return { ...p, hip: Math.min(178, 25 + p.knee - p.trunk) };
}

function orientation(def: ExerciseDef): Partial<Pose> {
  const hasTrunk = def.checks.some((c) => def.angles.find((a) => a.id === c.angle && a.kind === 'segment' && a.segment === 'trunk'));
  if (hasTrunk) return {};
  if (def.angles.some((a) => a.kind === 'joint' && a.joint === 'bodyLine')) return { trunk: 80 };
  if (def.equipment.some((e) => /bench/i.test(e)) && def.reps && /elbow/.test(def.reps.driver)) return { trunk: -90, knee: 90, shoulder: 90 };
  return {};
}

/** Figure → 33 landmarks (normalised image coords). */
function render(p: Pose, aspect: number, jitter: () => number, ground = 0.93): PoseFrame['landmarks'] {
  const S = 0.72 * (ground / 0.93); // body height as a fraction of frame height, shrunk with a raised floor
  const add = (a: { x: number; y: number }, d: number, len: number) => { const u = dir(d); return { x: a.x + u.x * len * S, y: a.y + u.y * len * S }; };
  const hip = { x: 0, y: 0 };
  const shoulder = add(hip, p.trunk, SEG.trunk);
  const thighD = p.trunk + p.hip;
  const knee = add(hip, thighD, SEG.thigh);
  const shinD = thighD + 180 - p.knee;
  const ankle = add(knee, shinD, SEG.shin);
  const footD = p.ankle === null ? 90 : shinD + 180 + p.ankle;
  const foot = add(ankle, footD, SEG.foot);
  const heel = add(ankle, footD + 180, SEG.foot * 0.35);
  const upperD = p.arm ?? p.trunk + 180 - p.shoulder;
  const elbow = add(shoulder, upperD, SEG.upper);
  const wrist = add(elbow, upperD + 180 + p.elbow, SEG.fore);
  const index = add(wrist, upperD + 180 + p.elbow, 0.04);
  const nose = add(shoulder, p.trunk, SEG.head);

  const pts = [hip, shoulder, knee, ankle, foot, heel, elbow, wrist, index, nose];
  // Fit wide poses (planks, lying lifts) into narrow/portrait frames.
  const wSpan = Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
  const k = Math.min(1, (0.8 * aspect) / (wSpan || 1));
  if (k < 1) for (const q of pts) { q.x *= k; q.y *= k; }
  const lowest = Math.max(...pts.map((q) => q.y));
  const highest = Math.min(...pts.map((q) => q.y));
  const dy = lowest - highest > 0.86 ? 0.5 - (lowest + highest) / 2 : ground - lowest;
  const cx = k < 1 ? (Math.max(...pts.map((q) => q.x)) + Math.min(...pts.map((q) => q.x))) / 2 : 0; // hip-centred so moving limbs never shift the body
  const T = (q: { x: number; y: number }, depth: number, vis: number) => ({
    x: (q.x - cx + aspect / 2 + depth) / aspect + jitter(),
    y: q.y + dy - p.lift + jitter(),
    z: 0,
    visibility: vis,
  });

  const lm: PoseFrame['landmarks'] = Array.from({ length: 33 }, () => T(nose, 0, 0.9));
  const put = (l: number, r: number, q: { x: number; y: number }) => { lm[l] = T(q, 0.012, 0.97); lm[r] = T(q, -0.012, 0.88); };
  put(11, 12, shoulder); put(13, 14, elbow); put(15, 16, wrist); put(19, 20, index); put(17, 18, index); put(21, 22, index);
  put(23, 24, hip); put(25, 26, knee); put(27, 28, ankle); put(29, 30, heel); put(31, 32, foot);
  // Spread (front-view feel): push L/R ankles apart relative to the shoulder offset.
  const sw = Math.abs(lm[11]!.x - lm[12]!.x) || 0.024 / aspect;
  const feetGap = (p.spread * sw) / 2;
  const fx = (lm[27]!.x + lm[28]!.x) / 2;
  lm[27] = { ...lm[27]!, x: fx + feetGap }; lm[28] = { ...lm[28]!, x: fx - feetGap };
  lm[31] = { ...lm[31]!, x: lm[31]!.x + feetGap }; lm[32] = { ...lm[32]!, x: lm[32]!.x - feetGap };
  return lm;
}

const resolveArm = (p: Pose): Pose => (p.arm === null ? { ...p, arm: p.trunk + 180 - p.shoulder } : p);
const lerp = (a0: Pose, b0: Pose, u: number): Pose => {
  const a = resolveArm(a0), b = resolveArm(b0);
  const o = { ...a };
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    const x = a[k], y = b[k]!;
    (o as Record<string, number | null>)[k] = x === null || y === null ? (u < 0.5 ? x : y) : x + (y - x) * u;
  }
  return o;
};

export interface PuppetOptions { reps?: number; fps?: number; aspect?: number; seed?: number; repSec?: number; /** Floor line as a fraction of frame height. */ ground?: number }

/** Deterministic synthetic session for any exercise definition. */
export function simulateExercise(def: ExerciseDef, opts: PuppetOptions = {}): PoseFrame[] {
  const fps = opts.fps ?? 30, aspect = opts.aspect ?? 16 / 9;
  let seed = opts.seed ?? 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const jitter = () => rnd() * 0.004;
  const base = { ...BASE, ...orientation(def) };
  const top = applyChecks(def, base, ['any', 'top']);
  const bottomSet = new Set<string>();
  const bottom = applyChecks(def, top, ['active', 'bottom', 'hold', 'release'], bottomSet);
  const frames: PoseFrame[] = [];
  let t = 0;
  const emit = (p: Pose) => { frames.push({ timestampMs: t, landmarks: render(p, aspect, jitter, opts.ground) }); t += 1000 / fps; };
  const hold = (p: Pose, sec: number) => { for (let i = 0; i < sec * fps; i++) emit(p); };
  const move = (a: Pose, b: Pose, sec: number) => { const n = Math.max(1, Math.round(sec * fps)); for (let i = 1; i <= n; i++) emit(lerp(a, b, (1 - Math.cos((Math.PI * i) / n)) / 2)); };

  hold(top, 1.2);

  if (def.mode === 'reps' && def.reps) {
    const r = def.reps;
    const setDriver = (p: Pose, v: number): Pose => {
      const a = def.angles.find((x) => x.id === r.driver);
      if (a?.kind === 'joint' && a.joint !== 'wrist') {
        if (a.joint === 'bodyLine') return { ...p, hip: v };
        return { ...p, [a.joint]: v };
      }
      if (a?.kind === 'segment' && a.segment === 'trunk') return { ...p, trunk: v };
      if (a?.kind === 'segment' && a.segment === 'upperArm') return { ...p, arm: v };
      return p;
    };
    const topV = r.start === 'high' ? Math.min(178, Math.max(r.exit + 12, 150)) : Math.max(2, r.exit - 10);
    const lo = settle(setDriver(bottom, r.start === 'high' ? r.target - 4 : r.target + 4), bottomSet);
    const hi = setDriver(top, topV);
    const n = opts.reps ?? 6, rs = opts.repSec ?? 2.4;
    for (let i = 0; i < n; i++) {
      // Last rep deliberately shallow so the demo shows a red/yellow rep.
      const deep = i === n - 1 ? lerp(hi, lo, 0.55) : lo;
      move(hi, deep, rs * 0.55); hold(deep, 0.15); move(deep, hi, rs * 0.4); hold(hi, 0.35);
    }
  } else if (def.mode === 'hold') {
    move(top, bottom, 1.2);
    const sec = (def.hold?.targetSec ?? 20) + 3;
    for (let i = 0; i < sec * fps; i++) emit(lerp(bottom, top, 0.04 + 0.04 * Math.sin(i / 9)));
    move(bottom, top, 1);
  } else if (def.event?.trigger === 'jump') {
    for (let i = 0; i < (opts.reps ?? 3); i++) {
      const crouch = { ...bottom, knee: Math.min(bottom.knee, 110), hip: Math.min(bottom.hip, 110), trunk: Math.max(bottom.trunk, 30) };
      move(top, crouch, 0.6);
      const ext = { ...top, knee: 178, hip: 178, ankle: 140, arm: 20 };
      move(crouch, ext, 0.18);
      const flight = 0.5, n = Math.round(flight * fps);
      for (let k = 1; k <= n; k++) { const tt = (k / n) * flight; emit({ ...ext, lift: 4.905 * tt * (flight - tt) * 0.72 / 1.75 }); }
      move(ext, crouch, 0.25); move(crouch, top, 0.6); hold(top, 0.8);
    }
  } else {
    // Throw / strike: arm sweeps back-down → over the top → forward with peak speed at ~35° release.
    const rel = def.event?.releaseAngle ? (def.event.releaseAngle.good[0] + def.event.releaseAngle.good[1]) / 2 : 35;
    const releaseDir = 367 - rel; // arm direction whose wrist tangent is ~`rel` above horizontal (forearm adds ~7°)
    for (let i = 0; i < (opts.reps ?? 3); i++) {
      const wind = { ...bottom, arm: releaseDir - 80, elbow: Math.max(bottom.elbow, 160) };
      const follow = { ...bottom, arm: releaseDir + 80, elbow: Math.max(bottom.elbow, 160) };
      move(top, wind, 0.9); hold(wind, 0.2); move(wind, follow, 0.26); move(follow, top, 0.9); hold(top, 0.8);
    }
  }
  hold(top, 0.8);
  return frames;
}
