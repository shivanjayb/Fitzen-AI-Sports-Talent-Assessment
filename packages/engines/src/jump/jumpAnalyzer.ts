/**
 * Single-camera countermovement-jump analyzer.
 *
 * Works on a sequence of MediaPipe pose frames from one uncalibrated
 * smartphone camera. No calibration board or external sensor is needed:
 *
 *  - Flight time is measured from ankle liftoff/touchdown with sub-frame
 *    interpolation, and converted to height via ballistics (h = g·T²/8).
 *  - A second, independent estimate scales hip displacement to metres
 *    using the athlete's stated standing height as the scale reference.
 *  - The two estimators are fused with inverse-variance weighting and a
 *    95% confidence interval is reported alongside the point estimate.
 */

import {
  LM,
  type AthleteAnthropometrics,
  type JumpAnalysisResult,
  type Landmark,
  type PoseFrame,
} from './types.js';
import {
  estimatorAgreement,
  flightTimeSigmaSeconds,
  fuseEstimates,
  GRAVITY,
  heightFromFlightTime,
  heightSigmaFromFlightTime,
  withCi95,
} from './uncertainty.js';

/** Nose height as a fraction of full stature (anthropometric average). */
export const NOSE_STATURE_RATIO = 0.93;

/** Minimum frames required for a meaningful analysis. */
const MIN_FRAMES = 24;

/** Ankles must rise this fraction of shank length to count as airborne. */
const LIFT_FRACTION = 0.55;

/** Mean landmark visibility below this aborts the analysis. */
const MIN_VISIBILITY = 0.45;

interface FrameFeatures {
  t: number;
  hipY: number;
  ankleY: number;
  ankleLY: number;
  ankleRY: number;
  kneeAngleL: number;
  kneeAngleR: number;
  kneeL: Landmark;
  kneeR: Landmark;
  hipL: Landmark;
  hipR: Landmark;
  ankleL: Landmark;
  ankleR: Landmark;
  noseY: number;
  shoulderY: number;
  visibility: number;
}

function mid(a: number, b: number): number {
  return (a + b) / 2;
}

function angleDeg(a: Landmark, vertex: Landmark, c: Landmark): number {
  const v1x = a.x - vertex.x;
  const v1y = a.y - vertex.y;
  const v2x = c.x - vertex.x;
  const v2y = c.y - vertex.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function extractFeatures(frame: PoseFrame): FrameFeatures | null {
  const lm = frame.landmarks;
  if (!lm || lm.length < 33) return null;
  const need = [
    LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE,
    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ];
  let visSum = 0;
  for (const i of need) {
    const p = lm[i];
    if (!p) return null;
    visSum += p.visibility;
  }
  const hipL = lm[LM.LEFT_HIP]!;
  const hipR = lm[LM.RIGHT_HIP]!;
  const kneeL = lm[LM.LEFT_KNEE]!;
  const kneeR = lm[LM.RIGHT_KNEE]!;
  const ankleL = lm[LM.LEFT_ANKLE]!;
  const ankleR = lm[LM.RIGHT_ANKLE]!;
  return {
    t: frame.timestampMs,
    hipY: mid(hipL.y, hipR.y),
    ankleY: mid(ankleL.y, ankleR.y),
    ankleLY: ankleL.y,
    ankleRY: ankleR.y,
    kneeAngleL: angleDeg(hipL, kneeL, ankleL),
    kneeAngleR: angleDeg(hipR, kneeR, ankleR),
    kneeL, kneeR, hipL, hipR, ankleL, ankleR,
    noseY: lm[LM.NOSE]!.y,
    shoulderY: mid(lm[LM.LEFT_SHOULDER]!.y, lm[LM.RIGHT_SHOULDER]!.y),
    visibility: visSum / need.length,
  };
}

/** Centered moving-average smoothing over a small window. */
function smooth(values: number[], radius: number): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      sum += values[j]!;
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}

/**
 * Ordinary-least-squares fit of y = a·t² + b·t + c to paired samples.
 * Returns null if the system is degenerate (fewer than 3 distinct points).
 */
function fitQuadratic(
  ts: number[],
  ys: number[],
): { a: number; b: number; c: number } | null {
  const n = ts.length;
  if (n < 3) return null;
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  let t0y = 0, t1y = 0, t2y = 0;
  for (let i = 0; i < n; i++) {
    const t = ts[i]!;
    const y = ys[i]!;
    const t2 = t * t;
    s1 += t;
    s2 += t2;
    s3 += t2 * t;
    s4 += t2 * t2;
    t0y += y;
    t1y += t * y;
    t2y += t2 * y;
  }
  // Solve the 3×3 normal equations [s4 s3 s2; s3 s2 s1; s2 s1 s0]·[a b c] = [t2y t1y t0y].
  const m = [
    [s4, s3, s2, t2y],
    [s3, s2, s1, t1y],
    [s2, s1, s0, t0y],
  ];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const pivVal = m[col]![col]!;
    for (let cc = col; cc < 4; cc++) m[col]![cc]! /= pivVal;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const factor = m[r]![col]!;
      for (let cc = col; cc < 4; cc++) m[r]![cc]! -= factor * m[col]![cc]!;
    }
  }
  return { a: m[0]![3]!, b: m[1]![3]!, c: m[2]![3]! };
}

/**
 * Linear-interpolated time at which `series` crosses `threshold` between
 * samples i-1 and i (falling = crossing downward in value).
 */
function interpolateCrossing(
  times: number[],
  series: number[],
  i: number,
  threshold: number,
): number {
  const t0 = times[i - 1]!;
  const t1 = times[i]!;
  const v0 = series[i - 1]!;
  const v1 = series[i]!;
  if (v1 === v0) return t1;
  const alpha = (threshold - v0) / (v1 - v0);
  return t0 + Math.min(1, Math.max(0, alpha)) * (t1 - t0);
}

export interface AnalyzeOptions {
  /** Frames from the start assumed to be quiet standing (default 8). */
  baselineFrames?: number;
}

export function analyzeJump(
  frames: PoseFrame[],
  athlete: AthleteAnthropometrics,
  options: AnalyzeOptions = {},
): JumpAnalysisResult {
  if (frames.length < MIN_FRAMES) {
    return {
      ok: false,
      reason: 'insufficient_frames',
      message: `Need at least ${MIN_FRAMES} pose frames, got ${frames.length}.`,
    };
  }

  const features: FrameFeatures[] = [];
  for (const frame of frames) {
    const f = extractFeatures(frame);
    if (f) features.push(f);
  }
  if (features.length < MIN_FRAMES) {
    return {
      ok: false,
      reason: 'insufficient_frames',
      message: 'Too many frames were missing critical landmarks.',
    };
  }

  const meanVisibility =
    features.reduce((acc, f) => acc + f.visibility, 0) / features.length;
  if (meanVisibility < MIN_VISIBILITY) {
    return {
      ok: false,
      reason: 'low_visibility',
      message:
        'Body landmarks were not visible enough. Ensure the full body is in frame and well lit.',
    };
  }

  const times = features.map((f) => f.t - features[0]!.t);
  const durationMs = times[times.length - 1]!;
  const effectiveFps = durationMs > 0 ? ((features.length - 1) / durationMs) * 1000 : 0;
  const frameIntervalMs = durationMs > 0 ? durationMs / (features.length - 1) : 33.3;

  const hipY = smooth(features.map((f) => f.hipY), 2);
  const ankleY = smooth(features.map((f) => f.ankleY), 1);

  // --- Baseline (quiet standing) -----------------------------------------
  const nBase = Math.min(options.baselineFrames ?? 8, features.length - 8);
  let baseHipY = 0;
  let baseAnkleY = 0;
  let baseNoseY = 0;
  for (let i = 0; i < nBase; i++) {
    baseHipY += hipY[i]!;
    baseAnkleY += ankleY[i]!;
    baseNoseY += features[i]!.noseY;
  }
  baseHipY /= nBase;
  baseAnkleY /= nBase;
  baseNoseY /= nBase;

  // Scale reference: nose→ankle span at quiet standing corresponds to
  // NOSE_STATURE_RATIO of the athlete's stature.
  const bodySpanUnits = baseAnkleY - baseNoseY;
  const metersPerUnit =
    bodySpanUnits > 0.05
      ? (athlete.heightCm / 100) * NOSE_STATURE_RATIO / bodySpanUnits
      : NaN;

  // Shank length in normalized units drives the airborne threshold, making
  // detection invariant to how large the athlete appears in frame.
  const shankUnits = Math.abs(
    mid(features[0]!.kneeL.y, features[0]!.kneeR.y) - baseAnkleY,
  );
  const liftThreshold = baseAnkleY - Math.max(0.015, shankUnits * LIFT_FRACTION);

  // --- Event detection -----------------------------------------------------
  // Countermovement start: hip drops below baseline by a depth threshold.
  const cmThreshold = baseHipY + Math.max(0.01, shankUnits * 0.15);
  let cmStartIdx = -1;
  for (let i = nBase; i < features.length; i++) {
    if (hipY[i]! > cmThreshold) {
      cmStartIdx = i;
      break;
    }
  }

  // Takeoff: first frame (after countermovement) with ankles above threshold.
  let takeoffIdx = -1;
  const searchFrom = cmStartIdx > 0 ? cmStartIdx : nBase;
  for (let i = searchFrom + 1; i < features.length; i++) {
    if (ankleY[i]! < liftThreshold && ankleY[i - 1]! >= liftThreshold) {
      takeoffIdx = i;
      break;
    }
  }
  if (takeoffIdx < 0) {
    return {
      ok: false,
      reason: 'no_takeoff_detected',
      message: 'No takeoff detected. Jump vertically with both feet leaving the ground.',
    };
  }

  // Landing: ankles return below (visually: down past) the threshold.
  let landingIdx = -1;
  for (let i = takeoffIdx + 1; i < features.length; i++) {
    if (ankleY[i]! >= liftThreshold && ankleY[i - 1]! < liftThreshold) {
      landingIdx = i;
      break;
    }
  }
  if (landingIdx < 0) {
    return {
      ok: false,
      reason: 'no_landing_detected',
      message: 'Landing was not captured. Keep recording until you are standing again.',
    };
  }

  // Threshold crossings bracket the airborne window but, because the ankle
  // must rise a finite amount to cross, they clip the ballistic arc and bias
  // flight time low. Instead, fit the airborne centre-of-mass (hip) path to a
  // parabola and recover the two baseline crossings analytically — an
  // unbiased, inherently sub-frame estimate of true flight time.
  const airT: number[] = [];
  const airY: number[] = [];
  for (let i = takeoffIdx; i < landingIdx; i++) {
    airT.push(times[i]!);
    airY.push(hipY[i]!);
  }
  const rawTakeoffMs = interpolateCrossing(times, ankleY, takeoffIdx, liftThreshold);
  const rawLandingMs = interpolateCrossing(times, ankleY, landingIdx, liftThreshold);

  let takeoffMs = rawTakeoffMs;
  let landingMs = rawLandingMs;
  const fit = fitQuadratic(airT, airY);
  if (fit && fit.a > 0) {
    // hipY is y-down, so the airborne arc is an upward-opening parabola with
    // its minimum (apex) at the top of the jump. Baseline crossings solve
    // a·t² + b·t + (c − baseHipY) = 0.
    const disc = fit.b * fit.b - 4 * fit.a * (fit.c - baseHipY);
    if (disc > 0) {
      const sq = Math.sqrt(disc);
      const r1 = (-fit.b - sq) / (2 * fit.a);
      const r2 = (-fit.b + sq) / (2 * fit.a);
      takeoffMs = Math.min(r1, r2);
      landingMs = Math.max(r1, r2);
    }
  }

  const flightTimeS = (landingMs - takeoffMs) / 1000;

  if (flightTimeS <= 0.08 || flightTimeS > 1.4) {
    return {
      ok: false,
      reason: 'implausible_result',
      message: `Measured flight time ${flightTimeS.toFixed(3)}s is outside the plausible human range.`,
    };
  }

  // --- Estimator 1: ballistic flight time --------------------------------
  const sigmaT = flightTimeSigmaSeconds(frameIntervalMs, true);
  const hFlight = heightFromFlightTime(flightTimeS);
  const sigmaHFlight = heightSigmaFromFlightTime(flightTimeS, sigmaT);

  // --- Estimator 2: scaled hip displacement -------------------------------
  let minHipY = Infinity;
  for (let i = takeoffIdx; i <= landingIdx; i++) {
    if (hipY[i]! < minHipY) minHipY = hipY[i]!;
  }
  const hipRiseUnits = baseHipY - minHipY;
  const hDisplacement = Number.isFinite(metersPerUnit)
    ? hipRiseUnits * metersPerUnit
    : NaN;
  // Displacement error budget: landmark jitter (~0.8% of body span per
  // landmark pair) plus scale-reference error (~3% of the estimate).
  const jitterMeters = Number.isFinite(metersPerUnit)
    ? 0.008 * bodySpanUnits * metersPerUnit
    : Infinity;
  const sigmaHDisp = Number.isFinite(hDisplacement)
    ? Math.hypot(jitterMeters, 0.03 * Math.max(hDisplacement, 0.05))
    : Infinity;

  // --- Fusion --------------------------------------------------------------
  const flightEst = { value: hFlight, sigma: sigmaHFlight };
  const dispEst = { value: hDisplacement, sigma: sigmaHDisp };
  const usable = Number.isFinite(hDisplacement) ? [flightEst, dispEst] : [flightEst];
  const fused = fuseEstimates(usable);

  // --- Countermovement depth ----------------------------------------------
  let maxHipY = baseHipY;
  for (let i = searchFrom; i < takeoffIdx; i++) {
    if (hipY[i]! > maxHipY) maxHipY = hipY[i]!;
  }
  const cmDepthM = Number.isFinite(metersPerUnit)
    ? (maxHipY - baseHipY) * metersPerUnit
    : 0;

  // --- Symmetry -------------------------------------------------------------
  // (a) knee-flexion agreement at the deepest countermovement point.
  let deepestIdx = searchFrom;
  for (let i = searchFrom; i < takeoffIdx; i++) {
    if (hipY[i]! > hipY[deepestIdx]!) deepestIdx = i;
  }
  const deepest = features[deepestIdx]!;
  const kneeDiff = Math.abs(deepest.kneeAngleL - deepest.kneeAngleR);
  const kneeSym = Math.max(0, 1 - kneeDiff / 30);

  // (b) liftoff timing agreement between left and right ankles.
  const ankleLSeries = features.map((f) => f.ankleLY);
  const ankleRSeries = features.map((f) => f.ankleRY);
  let liftL = takeoffMs;
  let liftR = takeoffMs;
  for (let i = searchFrom + 1; i < features.length; i++) {
    if (ankleLSeries[i]! < liftThreshold && ankleLSeries[i - 1]! >= liftThreshold) {
      liftL = interpolateCrossing(times, ankleLSeries, i, liftThreshold);
      break;
    }
  }
  for (let i = searchFrom + 1; i < features.length; i++) {
    if (ankleRSeries[i]! < liftThreshold && ankleRSeries[i - 1]! >= liftThreshold) {
      liftR = interpolateCrossing(times, ankleRSeries, i, liftThreshold);
      break;
    }
  }
  const liftGapS = Math.abs(liftL - liftR) / 1000;
  const timingSym = Math.max(0, 1 - liftGapS / 0.12);
  const symmetryScore = Math.round((0.6 * kneeSym + 0.4 * timingSym) * 100);

  // --- Movement quality ------------------------------------------------------
  const qualityFlags: string[] = [];
  // Depth: optimal countermovement is roughly 25–40% of leg length.
  const legLenM = (athlete.heightCm / 100) * 0.53;
  const depthRatio = legLenM > 0 ? cmDepthM / legLenM : 0;
  let depthScore: number;
  if (depthRatio < 0.12) {
    depthScore = Math.max(0, depthRatio / 0.12) * 0.7;
    qualityFlags.push('Shallow countermovement — dip deeper before exploding up.');
  } else if (depthRatio > 0.55) {
    depthScore = 0.7;
    qualityFlags.push('Very deep countermovement — slightly shallower may be more explosive.');
  } else {
    depthScore = 1;
  }

  // Knee valgus proxy: knee x drifting inside the hip–ankle line at depth.
  const valgusL = Math.abs(deepest.kneeL.x - mid(deepest.hipL.x, deepest.ankleL.x));
  const valgusR = Math.abs(deepest.kneeR.x - mid(deepest.hipR.x, deepest.ankleR.x));
  const hipWidth = Math.abs(deepest.hipL.x - deepest.hipR.x) || 0.08;
  const valgusRatio = (valgusL + valgusR) / (2 * hipWidth);
  const valgusScore = Math.max(0, 1 - Math.max(0, valgusRatio - 0.25) * 2.2);
  if (valgusScore < 0.7) {
    qualityFlags.push('Knees tracked inward during the dip — focus on knee alignment.');
  }

  // Soft landing: knee flexion shortly after touchdown.
  const postIdx = Math.min(features.length - 1, landingIdx + Math.round(effectiveFps * 0.15));
  const landKneeAngle = mid(
    features[postIdx]!.kneeAngleL,
    features[postIdx]!.kneeAngleR,
  );
  const landingScore = landKneeAngle < 155 ? 1 : Math.max(0, 1 - (landKneeAngle - 155) / 25);
  if (landingScore < 0.7) {
    qualityFlags.push('Stiff landing — absorb impact by bending the knees.');
  }

  const movementQuality = Math.round(
    (0.35 * depthScore + 0.35 * valgusScore + 0.3 * landingScore) * 100,
  );

  // --- Power (Sayers 1999): P(W) = 60.7·h(cm) + 45.3·mass(kg) − 2055 --------
  const peakPowerW = Math.max(
    0,
    60.7 * (fused.value * 100) + 45.3 * athlete.massKg - 2055,
  );
  const relativePowerWkg = athlete.massKg > 0 ? peakPowerW / athlete.massKg : 0;

  // --- Confidence ------------------------------------------------------------
  const fpsFactor = Math.min(1, effectiveFps / 30);
  const agreement = Number.isFinite(hDisplacement)
    ? estimatorAgreement(flightEst, dispEst)
    : 0.6;
  const confidence = Math.max(
    0.05,
    Math.min(1, 0.45 * meanVisibility + 0.3 * fpsFactor + 0.25 * agreement),
  );
  if (effectiveFps < 24) {
    qualityFlags.push('Low camera frame rate — results carry wider uncertainty.');
  }

  return {
    ok: true,
    frameCount: features.length,
    events: {
      countermovementStartMs: cmStartIdx >= 0 ? times[cmStartIdx]! : times[nBase]!,
      takeoffMs,
      landingMs,
    },
    metrics: {
      jumpHeight: withCi95(fused.value, fused.sigma),
      heightFromFlightTime: withCi95(hFlight, sigmaHFlight),
      heightFromDisplacement: Number.isFinite(hDisplacement)
        ? withCi95(hDisplacement, sigmaHDisp)
        : withCi95(hFlight, sigmaHFlight * 2),
      flightTime: withCi95(flightTimeS, sigmaT),
      peakPowerW: Math.round(peakPowerW),
      relativePowerWkg: Math.round(relativePowerWkg * 10) / 10,
      symmetryScore,
      movementQuality,
      countermovementDepth: Math.round(cmDepthM * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      effectiveFps: Math.round(effectiveFps * 10) / 10,
      qualityFlags,
    },
  };
}

export { GRAVITY };
