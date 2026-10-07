/**
 * Physics / biometric plausibility checks on a pose-frame series.
 *
 * Flags clips that look AI-generated, warped, re-timed (sped up / slowed) or
 * spliced. Every result is a WARNING with a reason, never proof: each check
 * has honest innocent explanations (bad tracking, variable frame rate,
 * athlete walking toward the camera) that are named in the messages.
 *
 * Coordinates: MediaPipe normalised image coords (x by width, y by height).
 * x is multiplied by `aspect` so both axes are in frame-height units.
 */

import type { Landmark, PoseFrame } from '../jump/types.js';
import { NOSE_STATURE_RATIO } from '../jump/jumpAnalyzer.js';
import { GRAVITY } from '../jump/uncertainty.js';
import { FILTER } from './engine.js';

export type IntegritySeverity = 'info' | 'warn' | 'fail';
export interface IntegrityFlag { code: string; severity: IntegritySeverity; message: string; evidence: Record<string, number> }
export interface IntegrityReport { score: number; verdict: 'ok' | 'warn' | 'fail'; flags: IntegrityFlag[]; metrics: Record<string, number> }
export interface IntegrityOptions { aspect: number; statureCm?: number; mode?: 'reps' | 'hold' | 'event' }

// ── thresholds (each with its source / derivation) ─────────────────────────

// Bone-length robust CV, NOISE-CORRECTED: tracker jitter σ alone gives a length CV of √2σ/L, which is subtracted in
// quadrature so only the excess counts (red team: raw CVs at σ = 3–5 mm-class noise reached 4–6 % on genuine clips and
// false-flagged 15/18 of them; corrected, 0/18). Markerless joint-centre errors are a few cm (Needham et al. 2021,
// Sci Rep 11:20673). The >0.87 in-plane filter truncates any spread, so the measure saturates near 5 % however strong
// the morph. Genuine catalog max after correction 2.1 %; morph 3.5 % → flagged 16/18, 8 % → 18/18.
// ponytail: puppet noise is white; real BlazePose noise is temporally correlated — recalibrate on real phone clips.
const BONE_CV_WARN = 0.035;
const BONE_CV_FAIL = 0.045;
// Left/right length ratio: both sides of a rigid body share the camera distance, so the ratio is constant up to
// jitter (≈ √2 × per-side CV). Puppet genuine max 3.9 % (plank); any morph ≥ 3.5 % injected reads 5.7 %+.
const LR_DRIFT_WARN = 0.05;

// Gravity fit. 1σ relative error budget on g, propagated in quadrature (g ∝ 2a · stature·0.93 / span):
//  stature: user-entered height ±2 cm → 0.02; default 170 cm → adult SD ≈ 7 cm (NCD-RisC 2016, eLife 5:e13410) → 0.06
//  nose/stature ratio 0.93: anthropometric spread ≈ 1.5 % (Drillis & Contini 1966 segment proportions)
//  span in pixels: keypoint localisation ≈ 3 % of nose–ankle span (Needham 2021 errors / ~1.6 m span)
//  hip ≠ centre of mass: leg tuck moves CoM ~5 cm vs hip during flight; for T≈0.5 s that is up to 8Δ/T² ≈ 1.6 m/s²,
//    take 0.08 as 1σ (tuck jumps can exceed it)
//  fit: standard error of the quadratic coefficient from the residuals (computed per clip).
// Generated video also fails this test: off-the-shelf video generators render falling objects at g_eff ≈ 1.8 m/s²
// ("Objects in Generated Videos Are Slower Than They Appear", arXiv:2512.02016).
// Re-timing by factor k scales g by k² (k=2 → ×4, ln 4 = 1.39 ≈ 12σ), so 2σ warn / 3σ fail still separates ±25 % speed.
const REL = { statureGiven: 0.02, statureDefault: 0.06, ratio: 0.015, span: 0.03, com: 0.08 };
const G_WARN_Z = 2;
const G_FAIL_Z = 3;
// Airborne = lowest foot landmark ≥ 2 % of nose–ankle span (~3 cm) above the floor line, for ≥ MIN_FLIGHT frames.
// 2 % is ≥ 4× the puppet jitter and above typical BlazePose foot jitter at rest; 6 points = 3 dof + 3 residual dof.
const CLEARANCE = 0.02;
const MIN_FLIGHT = 6;
// Longest human flight is < 1 s (1 m vertical jump → 0.9 s); 2.5 s leaves room for a 0.5× slow-mo while excluding
// hanging exercises where the feet stay off the floor for the whole set.
const MAX_FLIGHT_S = 2.5;

// Temporal. Frozen: a new camera frame always re-noises detector output well above 1e-4 (≈ 0.2 px at 1080p); exact
// repeats are duplicated frames. 24→30 fps pulldown duplicates 1 frame in 5 (20 %), so tolerate up to 25 % and flag a
// run only when it lasts ≥ 0.3 s (≥ 9 frames at 30 fps — longer than any pulldown pattern).
const FROZEN_EPS = 1e-4;
const FROZEN_FRACTION_WARN = 0.25;
const FROZEN_RUN_SEC_WARN = 0.3;
// Gap = dt > 3× median (≥ 2 frames missing). Irregular = |dt − median| > 50 % (phone VFR jitter is typically ±10–20 %).
const GAP_FACTOR = 3;
const IRREGULAR_TOL = 0.5;
const IRREGULAR_FRACTION_WARN = 0.2;
// Whole-body speed (median of 8 core joints) above the fastest human sprint, 12.4 m/s (Bolt, Berlin 2009 —
// Graubner & Nixdorf 2011, New Studies in Athletics 26:19) = the body jumped, not ran.
const BODY_SPEED_MAX = 12.5;
// Single wrist above elite overarm-throw hand speed (hand ≈ ball at release, ~40 m/s in pro pitching;
// Fleisig et al. 1999, J Biomech 32:1371). Punches are only ~10–15 m/s, so this is deliberately loose.
const WRIST_SPEED_MAX = 50;
// Torso-length step between consecutive frames > 25 % of its max. A 2D torso rotating 10°/frame (300°/s at 30 fps,
// faster than a deliberate trunk flexion) changes projected length by ≤ sin 10° ≈ 17 %.
const TORSO_STEP = 0.25;
// Tracking: frame counts as poorly tracked when mean visibility of core joints < FILTER.minVisibility (0.5).
const LOW_VIS_FRACTION_WARN = 0.2;
// Tracker noise σ is measured per clip from second differences: for white noise var(Δ²x) = 6σ², and the median of
// |Δ²x| (÷ 0.6745 for a Gaussian MAD) ignores the minority of frames dominated by real acceleration.
// Repeated segment (copied / looped reps). Two re-tracked copies of the same footage differ only by tracker noise:
// mean 2D joint distance ≈ √π·σ ≈ 1.8σ (difference of two N(0,σ²) points), SD ≈ 0.27σ over 12 joints. LOOP_TAU = 3σ
// sits > 4 SD above that. Real repeats of a movement are never this close for long: tempo alone varies a few % rep to
// rep, which at limb speeds of ~1 m/s puts the poses cm apart (≫ σ ≈ mm). Only MOVING frames count (a still hold
// "matches itself" at any lag). A copy needs ≥ 2.5 s of matching moving frames at a non-overlapping lag — set
// above the longest near-repeat seen between the puppet's otherwise robot-identical jumps (2.1 s), so a single copied
// short rep can slip through: false positives cost more than misses here.
// Over the run the MEAN distance must also be copy-like: < 2.2σ (copies average 1.77σ, SE ≈ 0.27σ/√30 ≈ 0.05σ),
// which a near-repeat cherry-picked frame by frame under the 3σ cap does not reach.
const LOOP_TAU = 3;
const LOOP_MEAN = 2.2;
const LOOP_MIN_SEC = 2.5;
// …and the copied stretch must travel ≥ 5 % of body height: a small periodic wobble (breathing, sway) is not a rep.
const LOOP_TRAVEL = 0.05;
// Frame interpolation (slow-mo / frame-rate up-conversion). Synthesised in-between frames sit on the straight line
// between real ones, so the per-frame second-difference energy E_i stops being stationary: it alternates with the
// interpolation period (2 for ×2, 3 for ×3). Test: every phase r of period p must have the same mean E; z = deviation
// of a phase mean in units of its standard error. 6 SE is a ~1e-9 Gaussian tail over the 5 phase tests, so only a
// strong periodic structure trips it. Needs ≥ 30 regular frames per phase.
const INTERP_Z = 6;
const INTERP_MIN_PER_PHASE = 30;
// Foot sliding. Footskating is a known artefact of synthesised human motion ("UnderPressure: Deep Learning for Foot
// Contact Detection, Ground Reaction Force Estimation and Footskate Cleanup", arXiv:2208.04598). While both toes
// are on the floor, their 2D separation is fixed whatever the camera does (pan/tilt move both toes alike). Flag a
// ≥ 0.5 s double-support stretch whose separation spans (q90 − q10) more than 4 % of body height (~7 cm) and more
// than 6σ of noise (q90 − q10 of a N(0, 2σ²) difference ≈ 3.6σ).
const FOOT_MIN_SEC = 0.5;
const FOOT_SLIDE = 0.04;
// ≥ 2 reversals (out-in-out) of at least that size: a single step-out-and-back (warrior pose, stance change on a
// smooth floor) is 1 reversal and stays quiet.
const FOOT_SWINGS = 2;
// Score: flat penalties — fail 40, warn 15 (two warns ≈ one fail, so an ok verdict never scores below a warn).
const PENALTY: Record<IntegritySeverity, number> = { info: 0, warn: 15, fail: 40 };

// ── helpers ─────────────────────────────────────────────────────────────────

const CORE = [11, 12, 23, 24, 25, 26, 27, 28];
const TRACKED = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const FEET = [27, 28, 29, 30, 31, 32];
const SEGMENTS: Record<string, [number, number][]> = {
  thigh: [[23, 25], [24, 26]],
  shin: [[25, 27], [26, 28]],
  upperArm: [[11, 13], [12, 14]],
  forearm: [[13, 15], [14, 16]],
  trunk: [[11, 23], [12, 24]],
};

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo]! + (s[Math.min(lo + 1, s.length - 1)]! - s[lo]!) * (i - lo);
};
const median = (xs: number[]) => quantile(xs, 0.5);
/** 1.4826·MAD / median — CV that ignores a few outlier frames. */
const robustCv = (xs: number[]) => { const m = median(xs); return (1.4826 * median(xs.map((x) => Math.abs(x - m)))) / m; };
const ok = (l: Landmark | undefined) => !!l && l.visibility >= FILTER.minVisibility;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Least-squares y = a t² + b t + c; returns a and its standard error. */
function fitParabola(t: number[], y: number[]): { a: number; se: number } {
  const S = [0, 0, 0, 0, 0], T = [0, 0, 0];
  for (let i = 0; i < t.length; i++) {
    let p = 1;
    for (let k = 0; k < 5; k++) { S[k]! += p; if (k < 3) T[k]! += p * y[i]!; p *= t[i]!; }
  }
  // Normal matrix for basis (t², t, 1).
  const M = [[S[4]!, S[3]!, S[2]!], [S[3]!, S[2]!, S[1]!], [S[2]!, S[1]!, S[0]!]];
  const det = (m: number[][]) =>
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
    m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const D = det(M);
  const rhs = [T[2]!, T[1]!, T[0]!];
  const solve = (col: number) => det(M.map((row, r) => row.map((v, c) => (c === col ? rhs[r]! : v)))) / D;
  const a = solve(0), b = solve(1), c = solve(2);
  let ss = 0;
  for (let i = 0; i < t.length; i++) ss += (y[i]! - (a * t[i]! ** 2 + b * t[i]! + c)) ** 2;
  const inv00 = (M[1]![1]! * M[2]![2]! - M[1]![2]! * M[2]![1]!) / D;
  return { a, se: Math.sqrt((ss / Math.max(1, t.length - 3)) * inv00) };
}

// ── main ────────────────────────────────────────────────────────────────────

export function analyseIntegrity(frames: PoseFrame[], opts: IntegrityOptions): IntegrityReport {
  const { aspect } = opts;
  const flags: IntegrityFlag[] = [];
  const metrics: Record<string, number> = { frames: frames.length };
  const flag = (code: string, severity: IntegritySeverity, message: string, evidence: Record<string, number>) =>
    flags.push({ code, severity, message, evidence: Object.fromEntries(Object.entries(evidence).map(([k, v]) => [k, r4(v)])) });
  const dist = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const midOf = (f: PoseFrame, i: number, j: number) => { const a = f.landmarks[i]!, b = f.landmarks[j]!; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0, visibility: Math.min(a.visibility, b.visibility) }; };

  if (frames.length < 10) {
    flag('too-short', 'warn', 'Too few frames to check this clip; nothing can be said about it either way.', { frames: frames.length });
    return finish(flags, metrics);
  }

  // Scale: nose→ankle-mid span at its robust max ≈ 0.93·stature (same convention as the jump analyzer).
  const spans = frames.filter((f) => ok(f.landmarks[0]) && ok(f.landmarks[27]) && ok(f.landmarks[28])).map((f) => dist(f.landmarks[0]!, midOf(f, 27, 28)));
  const spanU = quantile(spans, 0.95);
  const statureM = (opts.statureCm ?? 170) / 100;
  const mPerUnit = spanU > 0.05 ? (statureM * NOSE_STATURE_RATIO) / spanU : NaN;
  metrics.metresPerUnit = r4(mPerUnit);

  const dts = frames.slice(1).map((f, i) => f.timestampMs - frames[i]!.timestampMs);
  const nonMono = dts.filter((d) => d <= 0).length;
  const medDt = median(dts.filter((d) => d > 0));

  // Tracker noise and per-frame second-difference energy (regular frames only) ─
  const P = frames.map((f) => (TRACKED.every((k) => ok(f.landmarks[k])) ? TRACKED.flatMap((k) => [f.landmarks[k]!.x * aspect, f.landmarks[k]!.y]) : null));
  const regular = (i: number) => Math.abs(dts[i]! - medDt) <= 0.25 * medDt;
  const absD2: number[] = [], E: { i: number; e: number }[] = [];
  for (let i = 1; i + 1 < frames.length; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    if (!a || !b || !c || !regular(i - 1) || !regular(i)) continue;
    let e = 0;
    for (let k = 0; k < b.length; k++) { const d = a[k]! - 2 * b[k]! + c[k]!; absD2.push(Math.abs(d)); e += d * d; }
    E.push({ i, e });
  }
  const noise = absD2.length ? median(absD2) / 0.6745 / Math.sqrt(6) : 0;
  metrics.noise = r4(noise);

  // 1. Bone-length constancy ─────────────────────────────────────────────────
  let boneMax = 0, lrMax = 0, worst = '';
  for (const [name, sides] of Object.entries(SEGMENTS)) {
    const perSide = sides.map(([a, b]) => frames.map((f) => (ok(f.landmarks[a]) && ok(f.landmarks[b]) ? dist(f.landmarks[a]!, f.landmarks[b]!) : NaN)));
    const inPlane = perSide.map((L) => {
      const max = quantile(L.filter(Number.isFinite), 0.95);
      return L.map((x) => (x >= FILTER.minSegmentRatio * max ? x : NaN)); // not foreshortened (cos φ > 0.87)
    });
    // Tracker noise alone gives a length CV of √2σ/L; subtract it in quadrature so only the excess counts.
    const jit = inPlane.map((L) => (Math.SQRT2 * noise) / median(L.filter(Number.isFinite)));
    const excess = (v: number, j: number) => Math.sqrt(Math.max(0, v * v - j * j));
    const cvs = inPlane.map((L, k) => [L.filter(Number.isFinite), k] as const).filter(([L]) => L.length >= 10).map(([L, k]) => excess(robustCv(L), jit[k]!));
    if (!cvs.length) continue;
    const cv = cvs.reduce((s, x) => s + x, 0) / cvs.length;
    metrics[`boneCV_${name}`] = r4(cv);
    if (cv > boneMax) { boneMax = cv; worst = name; }
    const ratios = inPlane[0]!.map((l, i) => l / inPlane[1]![i]!).filter(Number.isFinite);
    if (ratios.length >= 10) { const d = excess(robustCv(ratios), Math.hypot(jit[0]!, jit[1]!)); metrics[`lrDrift_${name}`] = r4(d); lrMax = Math.max(lrMax, d); }
  }
  metrics.boneCV = r4(boneMax);
  metrics.lrDrift = r4(lrMax);
  if (boneMax > BONE_CV_WARN)
    flag('bone-length', boneMax > BONE_CV_FAIL ? 'fail' : 'warn',
      `The ${worst} changes length by ~${(boneMax * 100).toFixed(1)}% between frames where it faces the camera. Real bones are rigid, so this can point to AI-generated or warped video — but loose clothing, occlusion or poor tracking can also cause it.`,
      { boneCV: boneMax, warnAt: BONE_CV_WARN, failAt: BONE_CV_FAIL });
  if (lrMax > LR_DRIFT_WARN)
    flag('left-right-drift', 'warn',
      `Left and right limb lengths drift relative to each other (~${(lrMax * 100).toFixed(1)}%). A real body keeps this ratio fixed; tracking swaps between sides can also cause it.`,
      { lrDrift: lrMax, warnAt: LR_DRIFT_WARN });

  // 3. Temporal integrity (before gravity: gravity needs a sane clock) ───────
  const gaps = dts.filter((d) => d > GAP_FACTOR * medDt).length;
  const irregular = dts.filter((d) => d > 0 && d <= GAP_FACTOR * medDt && Math.abs(d - medDt) > IRREGULAR_TOL * medDt).length / dts.length;
  Object.assign(metrics, { fps: r4(1000 / medDt), nonMonotonic: nonMono, gaps, irregularFraction: r4(irregular) });
  if (nonMono) flag('timestamps-backward', 'fail', `Timestamps go backward or repeat ${nonMono} time(s). The stream was reordered or stitched, so every time-based measurement from it is unreliable.`, { count: nonMono });
  if (gaps) flag('timestamp-gap', 'warn', `${gaps} gap(s) in the frame clock (> ${GAP_FACTOR}× the normal frame interval). Could be a cut in the clip — or just dropped frames on a busy phone.`, { gaps, medianDtMs: medDt });
  if (irregular > IRREGULAR_FRACTION_WARN) flag('irregular-timing', 'warn', `${(irregular * 100).toFixed(0)}% of frame intervals are off the normal rate by more than half. Timing-based results (speeds, flight time) are less trustworthy.`, { irregularFraction: irregular });

  let frozen = 0, run = 0, longestRun = 0, runStart = 0, longestSec = 0, teleports = 0, torsoSteps = 0;
  const torso = frames.map((f) => dist(midOf(f, 11, 12), midOf(f, 23, 24)));
  const torsoMax = quantile(torso, 0.95);
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!.landmarks, b = frames[i]!.landmarks;
    let maxD = 0;
    for (let k = 0; k < 33; k++) maxD = Math.max(maxD, Math.abs(a[k]!.x - b[k]!.x), Math.abs(a[k]!.y - b[k]!.y));
    if (maxD < FROZEN_EPS) {
      frozen++;
      if (run++ === 0) runStart = frames[i - 1]!.timestampMs;
      if (run > longestRun) { longestRun = run; longestSec = (frames[i]!.timestampMs - runStart) / 1000; }
    } else run = 0;
    const dt = dts[i - 1]! / 1000;
    if (dt > 0 && Number.isFinite(mPerUnit)) {
      const body = CORE.filter((k) => ok(a[k]) && ok(b[k])).map((k) => dist(a[k]!, b[k]!) * mPerUnit / dt);
      const wrist = [15, 16].filter((k) => ok(a[k]) && ok(b[k])).map((k) => dist(a[k]!, b[k]!) * mPerUnit / dt);
      if ((body.length >= 4 && median(body) > BODY_SPEED_MAX) || wrist.some((v) => v > WRIST_SPEED_MAX)) teleports++;
    }
    if (dts[i - 1]! <= 2 * medDt && Math.abs(torso[i]! - torso[i - 1]!) > TORSO_STEP * torsoMax) torsoSteps++;
  }
  Object.assign(metrics, { frozenFraction: r4(frozen / dts.length), longestFrozenSec: r4(longestSec), teleports, torsoSteps });
  if (frozen / dts.length > FROZEN_FRACTION_WARN || longestSec >= FROZEN_RUN_SEC_WARN)
    flag('frozen-frames', 'warn', `Pose is pixel-identical across ${frozen} frame step(s) (longest ${longestSec.toFixed(2)} s). Real footage always carries sensor noise; repeats suggest duplicated frames or a paused/looped clip — or a frame-rate conversion.`, { frozenFraction: frozen / dts.length, longestFrozenSec: longestSec });
  if (teleports) flag('teleport', 'warn', `The body jumps faster than any human can move (> ${BODY_SPEED_MAX} m/s whole-body) in ${teleports} frame step(s). Suggests a splice or cut — or the tracker jumping to someone else.`, { teleports, bodySpeedMax: BODY_SPEED_MAX });
  if (torsoSteps) flag('scale-step', 'warn', `Torso size jumps by > ${TORSO_STEP * 100}% in one frame ${torsoSteps} time(s). Suggests a different person, a zoom cut or a splice.`, { torsoSteps, stepAt: TORSO_STEP });


  // Repeated segment: same movement at a fixed lag, matching to within tracker noise.
  // ponytail: O(n²) pairs; the centroid gate (|mean a − mean b| ≤ mean |a − b|) rejects almost all of them cheaply.
  const C = P.map((p) => p && [0, 1].map((o) => p.filter((_, k) => k % 2 === o).reduce((s, x) => s + x, 0) / (p.length / 2)));
  const pd = (i: number, j: number, gate = true) => {
    const a = P[i], b = P[j];
    if (!a || !b || (gate && Math.hypot(C[i]![0]! - C[j]![0]!, C[i]![1]! - C[j]![1]!) >= tau)) return Infinity;
    if (gate && !mov[i] && !mov[j]) return 0; // both still and co-located: neutral
    let s = 0; for (let k = 0; k < a.length; k += 2) s += Math.hypot(a[k]! - b[k]!, a[k + 1]! - b[k + 1]!);
    return s / (a.length / 2);
  };
  const minRun = Math.max(5, Math.round((LOOP_MIN_SEC * 1000) / medDt));
  const tau = LOOP_TAU * noise + FROZEN_EPS;
  // Moving = the pose shifted > 2τ over the last ~0.2 s. Still frames neither count nor break a run (a copied rep
  // includes its pauses), but must still sit in the same place (centroid gate).
  const w = Math.max(1, Math.round(200 / medDt));
  const mov = P.map((_, i) => pd(i, i >= w ? i - w : Math.min(i + w, P.length - 1), false) > 2 * tau);
  const copied = new Uint8Array(frames.length);
  let bestMean = Infinity;
  for (let L = minRun; L < frames.length; L++) {
    for (let i = L, hits: number[] = [], sum = 0; i <= frames.length; i++) {
      const j = i - L;
      const d = i < frames.length ? pd(i, j) : Infinity;
      if (d === 0 && !mov[i] && !mov[j]) continue; // both still, same place: neutral
      if (d < tau) { hits.push(i); sum += d; continue; }
      if (hits.length >= minRun) {
        const m = sum / hits.length / Math.max(noise, 1e-9);
        bestMean = Math.min(bestMean, m);
        const travel = Math.max(...hits.map((k) => pd(k, hits[0]!, false)));
        if (m < LOOP_MEAN && travel > LOOP_TRAVEL * spanU) for (const k of hits) copied[k] = 1;
      }
      hits = []; sum = 0;
    }
  }
  const copiedSec = (copied.reduce((s, x) => s + x, 0) * medDt) / 1000;
  metrics.repeatedSec = r4(copiedSec);
  if (Number.isFinite(bestMean)) metrics.repeatMeanSigma = r4(bestMean);
  if (copiedSec) flag('repeated-segment', 'warn', `${copiedSec.toFixed(1)} s of movement repeats an earlier stretch to within tracker noise. Real repetitions always differ by more than that, so this looks like a copied or looped segment — or an app's loop/replay effect.`, { repeatedSec: copiedSec, noise });

  // Interpolated frames: periodic second-difference energy.
  // Medians, not means: motion bursts make E heavy-tailed. SE(median) ≈ 1.2533·σ/√n with σ from the MAD.
  let interpZ = 0, interpP = 0;
  const mE = median(E.map((x) => x.e));
  const sdE = 1.4826 * median(E.map((x) => Math.abs(x.e - mE)));
  for (const p of [2, 3]) for (let r = 0; r < p; r++) {
    const ph = E.filter((x) => x.i % p === r).map((x) => x.e);
    if (ph.length < INTERP_MIN_PER_PHASE || !(sdE > 0)) continue;
    const z = Math.abs(median(ph) - mE) / ((1.2533 * sdE) / Math.sqrt(ph.length));
    if (z > interpZ) { interpZ = z; interpP = p; }
  }
  metrics.interpZ = r4(interpZ);
  if (interpZ > INTERP_Z) flag('interpolated-frames', 'warn', `Frame-to-frame motion follows a strict every-${interpP}-frames pattern, typical of synthesised in-between frames (slow motion or frame-rate conversion). Some video encoders leave a similar rhythm, so treat timing-based results with care.`, { z: interpZ, period: interpP });

  // Foot sliding during double support.
  const groundToe = median(frames.flatMap((f) => [31, 32].filter((k) => ok(f.landmarks[k])).map((k) => f.landmarks[k]!.y)));
  const sep = frames.map((f) => {
    const l = f.landmarks[31], r = f.landmarks[32];
    return ok(l) && ok(r) && groundToe - l!.y < CLEARANCE * spanU && groundToe - r!.y < CLEARANCE * spanU ? dist(l!, r!) : NaN;
  });
  // Count back-and-forth swings of the separation (zigzag with step h): one step-out or step-in is a deliberate stance
  // change; skating wanders out and back repeatedly.
  const h = Math.max(FOOT_SLIDE * spanU, 6 * noise);
  let slide = 0, swings = 0;
  const footRun = Math.round((FOOT_MIN_SEC * 1000) / medDt);
  for (let i = 0; i < sep.length; ) {
    if (!Number.isFinite(sep[i])) { i++; continue; }
    let j = i; while (j < sep.length && Number.isFinite(sep[j])) j++;
    if (j - i >= footRun) {
      const raw = sep.slice(i, j) as number[];
      slide = Math.max(slide, quantile(raw, 0.9) - quantile(raw, 0.1));
      // 0.2 s moving average first, so noise extremes (±3.5σ over hundreds of frames) can't fake a swing.
      const s = raw.map((_, k) => { const win = raw.slice(Math.max(0, k - w), k + w + 1); return win.reduce((a, b) => a + b, 0) / win.length; });
      let n = 0, lo = s[0]!, hi = s[0]!, dir = 0;
      for (const x of s) {
        lo = Math.min(lo, x); hi = Math.max(hi, x);
        if (dir >= 0 && hi - x > h) { if (dir > 0) n++; dir = -1; lo = hi = x; }
        else if (dir <= 0 && x - lo > h) { if (dir < 0) n++; dir = 1; lo = hi = x; }
      }
      swings = Math.max(swings, n);
    }
    i = j;
  }
  Object.assign(metrics, { footSlide: r4(slide / spanU), footSwings: swings });
  if (swings >= FOOT_SWINGS)
    flag('foot-slide', 'warn', `With both feet on the floor, the gap between them widens and narrows ${swings + 1} times by ~${((slide / spanU) * 100).toFixed(0)}% of body height. Planted feet don't wander like that, so this can point to generated or warped video ("foot skating") — or to slider/skater drills, a slippery floor, or the tracker confusing left and right foot.`, { footSlide: slide / spanU, swings, warnAt: FOOT_SLIDE });

  // 2. Gravity / time-scale ───────────────────────────────────────────────────
  if (opts.mode === 'event' || opts.mode === undefined) {
    // Reps/holds skipped: hanging and lying exercises lift the feet without being ballistic.
    const lowest = frames.map((f) => { const ys = FEET.filter((k) => ok(f.landmarks[k])).map((k) => f.landmarks[k]!.y); return ys.length ? Math.max(...ys) : NaN; });
    const ground = median(lowest.filter(Number.isFinite));
    // Hip must rise with the feet, or a lying leg raise would count as flight.
    const hipY = frames.map((f) => midOf(f, 23, 24).y);
    const hipGround = median(hipY);
    const air = lowest.map((y, i) => Number.isFinite(y) && ground - y > CLEARANCE * spanU && hipGround - hipY[i]! > CLEARANCE * spanU);
    const fits: { g: number; se: number; n: number }[] = [];
    for (let i = 0; i < frames.length; ) {
      if (!air[i]) { i++; continue; }
      let j = i; while (j < frames.length && air[j]) j++;
      const seg = frames.slice(i, j).filter((f) => ok(f.landmarks[23]) && ok(f.landmarks[24]));
      const dur = seg.length ? (seg[seg.length - 1]!.timestampMs - seg[0]!.timestampMs) / 1000 : 0;
      if (seg.length >= MIN_FLIGHT && dur > 0 && dur <= MAX_FLIGHT_S && !nonMono) {
        const t0 = seg[0]!.timestampMs;
        const { a, se } = fitParabola(seg.map((f) => (f.timestampMs - t0) / 1000), seg.map((f) => midOf(f, 23, 24).y));
        if (a > 0) fits.push({ g: 2 * a * mPerUnit, se: 2 * se * mPerUnit, n: seg.length }); // y grows downward: falling = a > 0
      }
      i = j;
    }
    if (fits.length && Number.isFinite(mPerUnit)) {
      const w = fits.map((f) => 1 / Math.max(f.se, 1e-6) ** 2), W = w.reduce((s, x) => s + x, 0);
      const g = fits.reduce((s, f, k) => s + f.g * w[k]!, 0) / W;
      const fitRel = 1 / Math.sqrt(W) / g;
      const sig = Math.hypot(opts.statureCm ? REL.statureGiven : REL.statureDefault, REL.ratio, REL.span, REL.com, fitRel);
      const z = Math.log(g / GRAVITY) / sig;
      const speed = Math.sqrt(g / GRAVITY); // playback speed factor k that would produce this g
      Object.assign(metrics, { gravity: r4(g), gravityZ: r4(z), gravitySigmaRel: r4(sig), flights: fits.length, flightFrames: fits.reduce((s, f) => s + f.n, 0), impliedSpeed: r4(speed) });
      if (Math.abs(z) > G_WARN_Z)
        flag('gravity', Math.abs(z) > G_FAIL_Z ? 'fail' : 'warn',
          `Airborne motion implies g ≈ ${g.toFixed(1)} m/s² (Earth: 9.8). That fits the clip playing at ~${speed.toFixed(2)}× real speed (${speed > 1 ? 'sped up' : 'slow motion'}). Could also be a wrong height entry or a tucked jump.`,
          { gravity: g, z, sigmaRel: sig, impliedSpeed: speed });
    } else if (opts.mode === 'event') {
      flag('no-flight', 'info', 'No clear airborne phase, so playback speed could not be checked against gravity.', {});
    }
  }

  // 4. Tracking quality ───────────────────────────────────────────────────────
  const lowVis = frames.filter((f) => TRACKED.reduce((s, k) => s + (f.landmarks[k]?.visibility ?? 0), 0) / TRACKED.length < FILTER.minVisibility).length / frames.length;
  metrics.lowVisFraction = r4(lowVis);
  if (lowVis > LOW_VIS_FRACTION_WARN)
    flag('low-visibility', 'warn', `${(lowVis * 100).toFixed(0)}% of frames are poorly tracked, so the other checks saw less of the clip and are weaker.`, { lowVisFraction: lowVis });

  return finish(flags, metrics);
}

function finish(flags: IntegrityFlag[], metrics: Record<string, number>): IntegrityReport {
  const score = Math.max(0, 100 - flags.reduce((s, f) => s + PENALTY[f.severity], 0));
  const verdict = flags.some((f) => f.severity === 'fail') ? 'fail' : flags.some((f) => f.severity === 'warn') ? 'warn' : 'ok';
  return { score, verdict, flags, metrics };
}
