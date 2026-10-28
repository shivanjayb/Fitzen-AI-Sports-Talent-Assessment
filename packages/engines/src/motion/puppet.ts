/**
 * Synthetic athlete for demo / testing without a camera.
 *
 * Builds a 2D figure by forward kinematics from joint angles, in the camera's plane: side-on, or facing the camera
 * for `camera: 'front'` exercises. Keyframes come from the exercise's own green bands, so any catalog entry can be
 * replayed through the real engine; per-exercise styles (puppetStyle.ts) pose what the checks leave free (split
 * stances, arm carriage, lying on a bench, the start of each rep). Directions are measured from straight up,
 * clockwise toward +x (the way a side-on figure faces; a facing figure's left side). Right-side ("R") angles are
 * given in the same convention and mirrored about the trunk in the front view.
 */

import type { PoseFrame } from '../jump/types.js';
import type { Check, ExerciseDef, JointName } from './types.js';
import { STYLES, type Pose, type PuppetStyle } from './puppetStyle.js';

export type { Prop } from './puppetStyle.js';

const BASE: Pose = {
  trunk: 2, hip: 176, knee: 176, ankle: null, shoulder: 15, elbow: 168, spread: 0.9, lift: 0, arm: null, shift: 0,
  hipR: null, kneeR: null, ankleR: null, shoulderR: null, elbowR: null, armR: null,
};
const SEG = { trunk: 0.3, thigh: 0.245, shin: 0.245, foot: 0.075, upper: 0.17, fore: 0.15, head: 0.11 };
/** Facing figure: half shoulder and hip widths (body units). */
const HALF = { shoulder: 0.105, hip: 0.075 };

const mid = (c: Check) => (c.good[0] + c.good[1]) / 2;
const rad = (d: number) => (d * Math.PI) / 180;
const dir = (d: number) => ({ x: Math.sin(rad(d)), y: -Math.cos(rad(d)) });
const R_OF = { hip: 'hipR', knee: 'kneeR', ankle: 'ankleR', shoulder: 'shoulderR', elbow: 'elbowR' } as const;
const PAIRS = [...Object.entries(R_OF), ['arm', 'armR']] as const;
type Num = Record<string, number | null>;

function applyChecks(def: ExerciseDef, p: Pose, phases: Check['when'][], set = new Set<string>(), supine = false, front = def.camera === 'front'): Pose {
  const out = { ...p };
  const o = out as unknown as Num;
  // Trunk first: thigh checks are relative to it.
  const isTrunk = (c: Check) => def.angles.some((a) => a.id === c.angle && a.kind === 'segment' && a.segment === 'trunk');
  for (const c of [...def.checks.filter(isTrunk), ...def.checks.filter((c) => !isTrunk(c))]) {
    if (!phases.includes(c.when)) continue;
    const a = def.angles.find((x) => x.id === c.angle);
    if (!a) continue;
    const v = mid(c);
    if (a.kind === 'joint') {
      const j = a.joint as JointName;
      if (j === 'bodyLine') { out.hip = v; out.knee = Math.max(out.knee, 172); if (out.hipR !== null) out.hipR = v; }
      else if (j === 'wrist') continue;
      else {
        // flexed = the leading (left) limb, extended = the trailing (right) one; both = keep any split in step.
        const side = a.side ?? 'auto', r = R_OF[j as keyof typeof R_OF];
        if (side === 'right' || side === 'extended') o[r] = v;
        else { o[j] = v; if (side === 'both' && o[r] !== null) o[r] = v; }
        set.add(j);
      }
    } else if (a.kind === 'segment' && a.ref === 'vertical') {
      if (a.segment === 'trunk') {
        const w = front ? c.good[0] + (c.good[1] - c.good[0]) / 4 : v; // facing: a lean tilts the shoulders, which are checked level
        out.trunk = supine ? -w : w; set.add('trunk');
      }
      if (a.segment === 'upperArm') { out.arm = v; if (out.armR !== null) out.armR = v; }
      if (a.segment === 'thigh') { out.hip = v - out.trunk; set.add('hip'); }
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

type P2 = { x: number; y: number };
interface Body { hip: [P2, P2]; shoulder: [P2, P2]; knee: [P2, P2]; ankle: [P2, P2]; foot: [P2, P2]; heel: [P2, P2]; elbow: [P2, P2]; wrist: [P2, P2]; index: [P2, P2]; nose: P2; ear: [P2, P2]; eye: [P2, P2] }

const right = (p: Pose) => ({
  hip: p.hipR ?? p.hip, knee: p.kneeR ?? p.knee, ankle: p.ankleR ?? p.ankle,
  shoulder: p.shoulderR ?? p.shoulder, elbow: p.elbowR ?? p.elbow, arm: p.armR ?? (p.shoulderR === null ? p.arm : null),
});

/** Forward kinematics in body units, hip centre at the origin. Index 0 = left / near / leading, 1 = right. */
function skeleton(p: Pose, front: boolean): Body {
  const add = (a: P2, d: number, len: number) => { const u = dir(d); return { x: a.x + u.x * len, y: a.y + u.y * len }; };
  const sides: [Pose, Pose] = [p, { ...p, ...right(p) }];
  // The facing figure's right side is the left side mirrored about the trunk.
  const m = (s: 0 | 1, d: number) => (front && s === 1 ? 2 * p.trunk - d : d);
  const perp = dir(p.trunk + 90);
  const c = { x: 0, y: 0 }, neck = add(c, p.trunk, SEG.trunk);
  const off = (q: P2, s: 0 | 1, half: number) => (front ? { x: q.x + perp.x * half * (s ? -1 : 1), y: q.y + perp.y * half * (s ? -1 : 1) } : q);
  const pair = <T>(f: (s: 0 | 1) => T): [T, T] => [f(0), f(1)];
  const hip = pair((s) => off(c, s, HALF.hip));
  const shoulder = pair((s) => off(neck, s, HALF.shoulder));
  const thighD = pair((s) => m(s, p.trunk + sides[s].hip));
  const knee = pair((s) => add(hip[s], thighD[s], SEG.thigh));
  const shinD = pair((s) => m(s, p.trunk + sides[s].hip + 180 - sides[s].knee));
  const ankle = pair((s) => add(knee[s], shinD[s], SEG.shin));
  const footD = pair((s) => (front ? (s ? 210 : 150) : sides[s].ankle === null ? 90 : shinD[s] + 180 + sides[s].ankle!)); // facing: feet turn out on the floor, whatever the trunk does
  const footLen = front ? 0.035 : SEG.foot;
  const foot = pair((s) => add(ankle[s], footD[s], footLen));
  const heel = pair((s) => add(ankle[s], footD[s] + 180, footLen * 0.35));
  const upperRaw = pair((s) => sides[s].arm ?? p.trunk + 180 - sides[s].shoulder);
  const upperD = pair((s) => m(s, upperRaw[s]));
  const elbow = pair((s) => add(shoulder[s], upperD[s], SEG.upper));
  const foreD = pair((s) => m(s, upperRaw[s] + 180 + sides[s].elbow));
  const wrist = pair((s) => add(elbow[s], foreD[s], SEG.fore));
  const index = pair((s) => add(wrist[s], foreD[s], 0.04));
  const nose = add(neck, p.trunk, SEG.head);
  const ear = pair((s) => (front ? off(add(neck, p.trunk, SEG.head * 1.05), s, 0.045) : nose));
  const eye = pair((s) => (front ? off(add(neck, p.trunk, SEG.head * 1.15), s, 0.02) : nose));
  return { hip, shoulder, knee, ankle, foot, heel, elbow, wrist, index, nose, ear, eye };
}

/** Lowest point of one leg (toe, heel or ankle). */
const legLow = (b: Body, s: 0 | 1) => Math.max(b.ankle[s].y, b.foot[s].y, b.heel[s].y);

/** Figure → 33 landmarks (normalised image coords). */
function render(p: Pose, aspect: number, jitter: () => number, ground = 0.93, front = false, hands?: number, anchor?: number): PoseFrame['landmarks'] {
  const S = 0.72 * (ground / 0.93); // body height as a fraction of frame height, shrunk with a raised floor
  const b = skeleton(p, front);
  // Bounds in one pass; points are scaled on output (body units → frame), as some are shared between sides.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const v of Object.values(b) as Array<P2 | [P2, P2]>) for (const q of Array.isArray(v) ? v : [v]) {
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  // Fit wide poses (planks, lying lifts) into narrow/portrait frames.
  const k = Math.min(1, (0.8 * aspect) / ((x1 - x0) * S || 1)), sk = S * k;
  const lowest = y1 * sk, highest = y0 * sk;
  const dy = hands !== undefined ? hands - Math.min(b.wrist[0].y, b.wrist[1].y) * sk : lowest - highest > 0.86 ? 0.5 - (lowest + highest) / 2 : ground - lowest;
  // Hip-centred so moving limbs never shift the body; a stepping athlete is held by the rear (planted) foot instead.
  const cx = anchor !== undefined ? (Math.min(b.ankle[0].x, b.ankle[1].x) - anchor) * sk : k < 1 ? ((x1 + x0) / 2) * sk : 0;
  const T = (q: P2, depth: number, vis: number) => ({
    x: (q.x * sk - cx + p.shift * S * Math.min(1, aspect / 1.6) + aspect / 2 + depth) / aspect + jitter(),
    y: q.y * sk + dy - p.lift + jitter(),
    z: 0,
    visibility: vis,
  });

  const [dl, dr, vl, vr] = front ? [0, 0, 0.95, 0.95] : [0.012, -0.012, 0.97, 0.88];
  const lm = place(b, front, (q, s) => T(q, s === 0 ? dl : s === 1 ? dr : 0, s === 0 ? vl : s === 1 ? vr : 0.9));
  if (front) return lm;
  if (p.hipR !== null || p.kneeR !== null || p.ankleR !== null) return lm; // split stance: the legs already differ
  // Side-on spread (front-view feel): push L/R ankles apart relative to the shoulder offset.
  const sw = Math.abs(lm[11]!.x - lm[12]!.x) || 0.024 / aspect;
  const feetGap = (p.spread * sw) / 2;
  const fx = (lm[27]!.x + lm[28]!.x) / 2;
  lm[27] = { ...lm[27]!, x: fx + feetGap }; lm[28] = { ...lm[28]!, x: fx - feetGap };
  lm[31] = { ...lm[31]!, x: lm[31]!.x + feetGap }; lm[32] = { ...lm[32]!, x: lm[32]!.x - feetGap };
  return lm;
}

type Lm = PoseFrame['landmarks'][number];
/** Body points → the 33 BlazePose slots. `T(point, side)`: side 0 = left/near, 1 = right/far, -1 = head. */
function place(b: Body, front: boolean, T: (q: P2, s: -1 | 0 | 1, half: number) => Lm): Lm[] {
  const lm: Lm[] = Array.from({ length: 33 }, () => T(b.nose, -1, 0));
  const put = (l: number, r: number, q: [P2, P2], half: number) => { lm[l] = T(q[0], 0, half); lm[r] = T(q[1], 1, half); };
  put(11, 12, b.shoulder, HALF.shoulder); put(13, 14, b.elbow, HALF.shoulder); put(15, 16, b.wrist, HALF.shoulder); put(19, 20, b.index, HALF.shoulder);
  put(17, 18, b.index, HALF.shoulder); put(21, 22, b.index, HALF.shoulder);
  put(23, 24, b.hip, HALF.hip); put(25, 26, b.knee, HALF.hip); put(27, 28, b.ankle, HALF.hip); put(29, 30, b.heel, HALF.hip); put(31, 32, b.foot, HALF.hip);
  if (front) { put(7, 8, b.ear, 0); put(2, 5, b.eye, 0); }
  return lm;
}

/** Metres per body unit (≈ 1.75 m athlete). */
const M = 1.88;
/**
 * MediaPipe-style world landmarks: metres, origin at the mid-hip, y down, smaller z = nearer the camera. Side view: the
 * near (left) side sits half a body width toward the camera, the far side away, so every segment stays in its
 * parasagittal plane and 3D angles equal the 2D ones. Front view: z = 0. That is a cartoon only because every
 * front-camera def (sumo squat, lateral raise, upright row, DB press, pull-up, lateral bound, the frontal holds) moves
 * roughly in the frontal plane. Lift and shift are ignored: world landmarks are hip-centred.
 */
function worldOf(b: Body, front: boolean): Lm[] {
  const ox = (b.hip[0].x + b.hip[1].x) / 2, oy = (b.hip[0].y + b.hip[1].y) / 2;
  // One depth per side (the mean half width), so no segment — trunk included — leaves its parasagittal plane.
  const half = ((HALF.hip + HALF.shoulder) / 2) * M;
  return place(b, front, (q, s) => ({ x: (q.x - ox) * M, y: (q.y - oy) * M, z: front || s < 0 ? 0 : s === 0 ? -half : half, visibility: 0.9 }));
}

const resolveArm = (p: Pose): Pose => {
  const o = { ...p };
  if (o.arm === null) o.arm = o.trunk + 180 - o.shoulder;
  if (o.armR === null && o.shoulderR !== null) o.armR = o.trunk + 180 - o.shoulderR;
  return o;
};
/** A flat foot (ankle null) as an ankle angle, so it blends smoothly into a pointed one (take-off, calf raise). */
const flat = (p: Pose) => ({ ...p, ankle: ((((p.knee - p.trunk - p.hip - 270) % 360) + 540) % 360) - 180 });
const lerp = (a0: Pose, b0: Pose, u: number): Pose => {
  let a = resolveArm(a0), b = resolveArm(b0);
  if (a.ankle === null && b.ankle !== null) a = flat(a);
  if (b.ankle === null && a.ankle !== null) b = flat(b);
  // A right side left null copies the left; give it that value when the other pose sets it, or it snaps mid-move.
  const fill = (p: Pose, q: Pose) => { const o = { ...p } as unknown as Num; for (const [l, r] of PAIRS) if (o[r] === null && (q as unknown as Num)[r] !== null) o[r] = o[l]!; return o as unknown as Pose; };
  [a, b] = [fill(a, b), fill(b, a)];
  const o = { ...a };
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    const x = a[k], y = b[k]!;
    (o as unknown as Num)[k] = x === null || y === null ? (u < 0.5 ? x : y) : x + (y - x) * u;
  }
  return o;
};

/** Keep the trailing foot planted `gap` behind the leading one and on the floor: solve its hip and knee (Newton). */
function plant(p: Pose, gap: number, from?: [number, number]): Pose {
  const res = (h: number, k: number) => { const b = skeleton({ ...p, hipR: h, kneeR: k }, false); return [b.ankle[0].x - b.ankle[1].x - gap, legLow(b, 1) - legLow(b, 0)] as const; };
  let [h, k] = from ?? [p.hipR ?? p.hip, p.kneeR ?? p.knee];
  for (let i = 0; i < 8; i++) {
    const [a, c] = res(h, k);
    if (Math.abs(a) + Math.abs(c) < 1e-7) break;
    const [ah, ch] = res(h + 0.01, k), [ak, ck] = res(h, k + 0.01);
    const j11 = (ah - a) / 0.01, j12 = (ak - a) / 0.01, j21 = (ch - c) / 0.01, j22 = (ck - c) / 0.01, det = j11 * j22 - j12 * j21;
    if (!det) break;
    h -= (a * j22 - c * j12) / det; k -= (j11 * c - j21 * a) / det;
  }
  return { ...p, hipR: h, kneeR: k };
}

/**
 * Pushes and punches drive the hand along a straight line: solve the arm (two-link IK) for each point of it,
 * keeping the elbow on the side the blended pose has it. `over` aims past the end hand (strikes lock out early).
 */
function straight(a: Pose, b: Pose, r: boolean, over = 1) {
  const s = r ? 1 : 0, U = SEG.upper, F = SEG.fore;
  const hand = (p: Pose) => { const k = skeleton(resolveArm(p), false); return { x: k.wrist[s].x - k.shoulder[s].x, y: k.wrist[s].y - k.shoulder[s].y }; };
  const A = hand(a), B0 = hand(b), B = { x: A.x + (B0.x - A.x) * over, y: A.y + (B0.y - A.y) * over };
  const acos = (v: number) => (Math.acos(Math.max(-1, Math.min(1, v))) * 180) / Math.PI;
  return (q: Pose, u: number): Pose => {
    const x = A.x + (B.x - A.x) * u, y = A.y + (B.y - A.y) * u, d = Math.min(Math.hypot(x, y), (U + F) * 0.9999);
    const phi = (Math.atan2(x, -y) * 180) / Math.PI, beta = acos((U * U + d * d - F * F) / (2 * U * d)), eps = acos((U * U + F * F - d * d) / (2 * U * F));
    const near = (r ? q.armR : q.arm) ?? q.arm!, off = (v: number) => Math.abs(((v - near + 540) % 360) - 180);
    const [arm, elbow] = off(phi + beta) <= off(phi - beta) ? [phi + beta, eps] : [phi - beta, -eps];
    return r ? { ...q, armR: arm, elbowR: elbow } : { ...q, arm, elbow };
  };
}

/** Keep the forearms vertical the way a bar or the floor holds them (presses up, push-ups and dips down). */
function couple(p: Pose, mode: PuppetStyle['forearm']): Pose {
  if (!mode) return p;
  const toward = mode === 'up' ? 0 : 180;
  const o = { ...p, arm: toward - 180 - p.elbow };
  if (p.elbowR !== null) o.armR = toward - 180 - p.elbowR;
  return o;
}

/** Bring the trailing foot to the floor (split stances) by turning one right-side angle. */
function level(p: Pose, key: NonNullable<PuppetStyle['level']>, front: boolean, from?: number): Pose {
  const err = (v: number) => { const b = skeleton({ ...p, [key]: v }, front); return legLow(b, 1) - legLow(b, 0); };
  const cur = (p[key] as number | null) ?? (p[key.replace('R', '') as keyof Pose] as number);
  // Newton from the previous frame's answer (poses change little frame to frame); scan only if it fails.
  let v = from ?? cur, e = err(v);
  for (let i = 0; i < 6 && Math.abs(e) > 1e-6; i++) { const d = (err(v + 0.01) - e) / 0.01; if (!d) break; v -= e / d; e = err(v); }
  if (Math.abs(e) < 1e-5 && Math.abs(v - cur) <= 40) return { ...p, [key]: v };
  let best = cur, bestE = Math.abs(err(cur));
  // Search near the styled angle only: far away lies the mirror solution (both legs forward).
  for (let v = cur - 40; v <= cur + 40; v += 1) { const e = Math.abs(err(v)); if (e < bestE) { bestE = e; best = v; } }
  for (let v = best - 1; v <= best + 1; v += 0.05) { const e = Math.abs(err(v)); if (e < bestE) { bestE = e; best = v; } }
  return { ...p, [key]: best };
}

/** Facing view: open both hips symmetrically until the feet sit `p.spread` shoulder widths apart. */
function fitSpread(p: Pose): Pose {
  const at = (open: number) => {
    const q = { ...p, hip: p.hip - open, hipR: (p.hipR ?? p.hip) - open }, b = skeleton(q, true);
    return { q, ratio: Math.abs(b.ankle[0].x - b.ankle[1].x) / Math.abs(b.shoulder[0].x - b.shoulder[1].x) };
  };
  let lo = -40, hi = 80;
  for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (at(m).ratio < p.spread) lo = m; else hi = m; }
  return at((lo + hi) / 2).q;
}

export interface PuppetOptions {
  reps?: number; fps?: number; aspect?: number; seed?: number; repSec?: number; /** Floor line as a fraction of frame height. */ ground?: number;
  /** Fraction of the full rep range reached (default 1): partial-range athletes, with bone lengths kept. */
  depth?: number;
}

/** Equipment the demo athlete is using, for drawing. */
export const puppetProps = (def: ExerciseDef) => STYLES[def.id]?.props ?? [];

/** Deterministic synthetic session for any exercise definition. */
export function simulateExercise(def: ExerciseDef, opts: PuppetOptions = {}): PoseFrame[] {
  const fps = opts.fps ?? 30, aspect = opts.aspect ?? 16 / 9;
  let seed = opts.seed ?? 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const jitter = () => rnd() * 0.004;
  const st: PuppetStyle = STYLES[def.id] ?? {};
  const front = def.camera === 'front';
  const styled = new Set(Object.keys({ ...st.base, ...st.top, ...st.bottom }));
  const base = { ...BASE, ...orientation(def), ...st.base, shift: -(st.travel ?? 0) / 2 }; // broad jumps start behind centre
  const top = applyChecks(def, { ...base, ...st.top }, ['any', 'top'], new Set(styled), st.supine);
  const bottomSet = new Set(styled);
  const bottom = applyChecks(def, { ...top, ...st.bottom }, ['any', 'active', 'bottom', 'hold', 'release'], bottomSet, st.supine);
  let lastLevel: number | undefined, lastPlant: [number, number] | undefined;
  const stride = (p: Pose) => { const b = skeleton(p, false); return b.ankle[0].x - b.ankle[1].x; };
  const gap = st.plant ? stride(level(couple(top, st.forearm), st.level ?? 'hipR', false)) : 0;
  const finish = (p: Pose) => {
    let q = couple(p, st.forearm);
    if (st.fitSpread && front) q = fitSpread(q);
    if (st.plant) { q = plant(q, gap, lastPlant); lastPlant = [q.hipR!, q.kneeR!]; return q; }
    if (!st.level) return q;
    q = level(q, st.level, front, lastLevel);
    lastLevel = q[st.level] as number;
    return q;
  };
  const frames: PoseFrame[] = [];
  let t = 0;
  const rearFoot = st.step ? Math.min(...skeleton(top, false).ankle.map((a) => a.x)) : undefined;
  const emit = (p: Pose) => {
    const q = finish(p);
    frames.push({ timestampMs: t, landmarks: render(q, aspect, jitter, opts.ground, front, st.hands, rearFoot), world: worldOf(skeleton(q, front), front) });
    t += 1000 / fps;
  };
  const hold = (p: Pose, sec: number) => { for (let i = 0; i < sec * fps; i++) emit(p); };
  // Speed peaks a fraction `p` of the way through a move: 0.5 is the plain cosine ease; strikes peak late, near lock-out.
  const ease = (s: number, p: number) => (s < p ? p * (1 - Math.cos((Math.PI / 2) * (s / p))) : p + (1 - p) * Math.sin((Math.PI / 2) * ((s - p) / (1 - p))));
  const move = (a: Pose, b: Pose, sec: number, p = 0.5, hand?: (q: Pose, u: number) => Pose) => {
    const n = Math.max(1, Math.round(sec * fps));
    for (let i = 1; i <= n; i++) { const u = ease(i / n, p), q = lerp(a, b, u); emit(hand ? hand(q, u) : q); }
  };

  hold(top, 1.2);

  if (def.mode === 'reps' && def.reps) {
    const r = def.reps;
    const setDriver = (p: Pose, v: number): Pose => {
      const a = def.angles.find((x) => x.id === r.driver);
      if (a?.kind === 'joint' && a.joint !== 'wrist') {
        if (a.joint === 'bodyLine') return { ...p, hip: v };
        const both = a.side === 'both' && (p as unknown as Num)[R_OF[a.joint as keyof typeof R_OF]] !== null;
        return { ...p, [a.joint]: v, ...(both ? { [R_OF[a.joint as keyof typeof R_OF]]: v } : {}) };
      }
      if (a?.kind === 'segment' && a.segment === 'trunk') return { ...p, trunk: st.supine ? -v : v };
      if (a?.kind === 'segment' && a.segment === 'upperArm') return { ...p, arm: v };
      if (a?.kind === 'segment' && a.segment === 'thigh') return { ...p, hip: v - p.trunk };
      if (a?.kind === 'spread') return { ...p, spread: v };
      return p;
    };
    const topV = st.topDriver ?? (r.start === 'high' ? Math.min(178, Math.max(r.exit + 12, 150)) : Math.max(2, r.exit - 10));
    const lo = settle(setDriver(bottom, st.bottomDriver ?? (r.start === 'high' ? r.target - 4 : r.target + 4)), bottomSet);
    const hi = setDriver(top, topV);
    const n = opts.reps ?? 6, rs = opts.repSec ?? 2.4;
    // Jumping into and out of a split: the feet leave the floor instead of skating.
    const hop = st.hop ? (q: Pose, u: number) => ({ ...q, lift: q.lift + st.hop! * Math.sin(Math.PI * u) }) : undefined;
    const swap = (p: Pose): Pose => ({ ...p, hip: p.hipR ?? p.hip, knee: p.kneeR ?? p.knee, ankle: p.ankleR, hipR: p.hip, kneeR: p.knee, ankleR: p.ankle });
    const arc = (lead: 0 | 1) => (q: Pose, u: number): Pose => {
      const s = Math.sin(Math.PI * u), hip = (lead ? q.hipR ?? q.hip : q.hip) - 25 * s, knee = (lead ? q.kneeR ?? q.knee : q.knee) - 45 * s;
      return lead ? { ...q, hipR: hip, kneeR: knee } : { ...q, hip, knee };
    };
    // Alternating drills: the trailing leg runs half a cycle behind the counted (near) leg.
    const alt = (a: Pose, b: Pose) => !r.alternating || st.alternate === false || st.step ? [a, b] : [
      { ...a, hipR: b.hip, kneeR: b.knee, ankleR: b.ankle },
      { ...b, hipR: a.hip, kneeR: a.knee, ankleR: a.ankle },
    ] as const;
    for (let i = 0; i < n; i++) {
      // Last rep deliberately shallow so the demo shows a red/yellow rep.
      const full = (opts.depth ?? 1) < 1 ? lerp(hi, lo, opts.depth!) : lo;
      const deep = i === n - 1 ? lerp(hi, full, 0.55) : full;
      // Lunges lead with each leg in turn; the stepping foot clears the floor on the way out and back.
      const lead = st.step && i % 2 ? 1 : 0;
      const [h, d] = alt(hi, lead ? swap(deep) : deep);
      const step = st.step ? arc(lead) : hop;
      move(h!, d!, rs * 0.55, 0.5, step); hold(d!, 0.15); move(d!, h!, rs * 0.4, 0.5, step); hold(h!, 0.35);
    }
  } else if (def.mode === 'hold') {
    move(top, bottom, 1.2);
    const sec = (def.hold?.targetSec ?? 20) + 3;
    for (let i = 0; i < sec * fps; i++) emit(lerp(bottom, top, 0.02 + 0.02 * Math.sin(i / 9)));
    move(bottom, top, 1);
  } else if (def.event?.trigger === 'jump') {
    for (let i = 0; i < (opts.reps ?? 3); i++) {
      // Broad jumps travel forward in the air and walk back between attempts.
      const d = st.travel ?? 0, far = top.shift + d;
      const crouch = { ...bottom, knee: Math.min(bottom.knee, 95), hip: Math.min(bottom.hip, 105), trunk: Math.max(bottom.trunk, 30), ...st.crouch };
      move(top, crouch, 0.6);
      const ext = { ...top, knee: 178, hip: 178, ankle: 140, arm: 20, ...st.takeoff };
      move(crouch, ext, 0.18);
      const flight = 0.5, n = Math.round(flight * fps);
      for (let k = 1; k <= n; k++) { const tt = (k / n) * flight; emit({ ...ext, lift: 4.905 * tt * (flight - tt) * 0.72 / 1.75, shift: top.shift + (d * k) / n }); }
      move({ ...ext, shift: far }, { ...crouch, shift: far }, 0.25); move({ ...crouch, shift: far }, top, d ? 1.4 : 0.6); hold(top, 0.8);
    }
  } else {
    // Throw / strike: arm sweeps back-down → over the top → forward with peak speed at ~35° release.
    const rel = def.event?.releaseAngle ? (def.event.releaseAngle.good[0] + def.event.releaseAngle.good[1]) / 2 : 35;
    const releaseDir = 367 - rel; // arm direction whose wrist tangent is ~`rel` above horizontal (forearm adds ~7°)
    // Throws judged on the right arm swing it; the left arm follows the style (balance arm) or mirrors it.
    const rightArm = def.angles.some((a) => a.kind === 'joint' && a.side === 'right' && (a.joint === 'shoulder' || a.joint === 'elbow'));
    const sweep = (armV: number, elbowV: number): Partial<Pose> => rightArm
      ? { armR: armV, elbowR: Math.max(bottom.elbowR ?? bottom.elbow, elbowV) }
      : { arm: armV, elbow: Math.max(bottom.elbow, elbowV) };
    for (let i = 0; i < (opts.reps ?? 3); i++) {
      const wind = { ...bottom, ...sweep(releaseDir - 80, 160), ...st.windup };
      const follow = { ...bottom, ...sweep(releaseDir + 80, 160), ...st.follow };
      const rs = st.release ?? 0.26;
      if (st.crouch) {
        // Jump shot: load, take off, and finish the release at the apex of a ballistic flight.
        const c = { ...wind, ...st.crouch }, T = 0.5, n = Math.round(T * fps);
        move(top, c, 0.6); move(c, wind, 0.18);
        for (let k = 1; k <= n; k++) {
          const tt = (k / n) * T, u = Math.min(1, Math.max(0, (tt - (T / 2 - rs)) / rs));
          emit({ ...lerp(wind, follow, ease(u, st.peak ?? 0.5)), lift: (4.905 * tt * (T - tt) * 0.72) / 1.75 });
        }
      } else {
        move(top, wind, 0.9); hold(wind, 0.2);
        move(wind, follow, rs, st.peak, st.linear ? straight(wind, follow, rightArm, 1.15) : undefined);
      }
      move(follow, top, 0.9); hold(top, 0.8);
    }
  }
  hold(top, 0.8);
  return frames;
}
