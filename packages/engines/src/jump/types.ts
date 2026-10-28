/**
 * Pose-frame types shared by the jump analyzer and its consumers.
 *
 * Landmarks follow the MediaPipe Pose topology (33 points, normalized
 * image coordinates: x,y in [0,1] with y increasing downwards).
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** Landmark visibility/confidence in [0,1]. */
  visibility: number;
}

export interface PoseFrame {
  /** Capture timestamp in milliseconds (monotonic). */
  timestampMs: number;
  /** 33 MediaPipe pose landmarks in normalized image coordinates. */
  landmarks: Landmark[];
  /**
   * MediaPipe worldLandmarks: metres, origin at mid-hip, camera-aligned axes (x right, y down, smaller z = nearer);
   * optional, engine falls back to 2D (BlazePose GHUM: Bazarevsky 2020 arXiv:2006.10204; Grishchenko 2022 arXiv:2206.11678).
   */
  world?: Landmark[];
}

/** MediaPipe Pose landmark indices used by the analyzer. */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export interface AthleteAnthropometrics {
  /** Standing height in centimetres. Used as the single-camera scale reference. */
  heightCm: number;
  /** Body mass in kilograms. Required for power estimation. */
  massKg: number;
}

export interface EstimateWithUncertainty {
  /** Point estimate. */
  value: number;
  /** One standard deviation of the estimate, same unit as value. */
  sigma: number;
  /** 95% confidence interval [low, high]. */
  ci95: [number, number];
}

export type JumpPhase =
  | 'standing'
  | 'countermovement'
  | 'propulsion'
  | 'flight'
  | 'landing'
  | 'complete';

export interface JumpMetrics {
  /** Fused jump height estimate in metres. */
  jumpHeight: EstimateWithUncertainty;
  /** Flight-time-derived height in metres (h = g*T^2/8). */
  heightFromFlightTime: EstimateWithUncertainty;
  /** Displacement-derived height in metres (hip rise scaled by athlete stature). */
  heightFromDisplacement: EstimateWithUncertainty;
  /** Flight time in seconds. */
  flightTime: EstimateWithUncertainty;
  /** Peak anaerobic power (Sayers equation), watts. */
  peakPowerW: number;
  /** Relative peak power, watts per kilogram. */
  relativePowerWkg: number;
  /** Left/right symmetry score in [0,100]. 100 = perfectly symmetric. */
  symmetryScore: number;
  /** Movement-quality score in [0,100] (depth, valgus control, soft landing). */
  movementQuality: number;
  /** Countermovement depth in metres. */
  countermovementDepth: number;
  /** Overall analysis confidence in [0,1]. */
  confidence: number;
  /** Mean effective capture rate over the analyzed window, frames/second. */
  effectiveFps: number;
  /** Human-readable notes about detected quality issues. */
  qualityFlags: string[];
}

export interface JumpAnalysis {
  ok: true;
  metrics: JumpMetrics;
  /** Millisecond timestamps of detected events (relative to first frame). */
  events: {
    countermovementStartMs: number;
    takeoffMs: number;
    landingMs: number;
  };
  frameCount: number;
}

export interface JumpAnalysisFailure {
  ok: false;
  /** Machine-readable reason code. */
  reason:
    | 'insufficient_frames'
    | 'no_takeoff_detected'
    | 'no_landing_detected'
    | 'low_visibility'
    | 'implausible_result';
  message: string;
}

export type JumpAnalysisResult = JumpAnalysis | JumpAnalysisFailure;
