/**
 * Config-driven motion analysis — exercise schema.
 *
 * One `ExerciseDef` describes how to measure an exercise from 2D pose
 * landmarks (MediaPipe BlazePose 33-point topology). The engine in
 * `engine.ts` interprets it; no exercise has bespoke code.
 *
 * Schema adapted from react-native-nitro-pose-exercises (MIT) and
 * fitness-trainer-pose-estimation (MIT) — see THIRD_PARTY_NOTICES.md.
 */

/** Joint angles measured at the middle landmark (degrees, 0–180). */
export type JointName =
  | 'knee' // hip–knee–ankle
  | 'hip' // shoulder–hip–knee
  | 'elbow' // shoulder–elbow–wrist
  | 'shoulder' // hip–shoulder–elbow (arm elevation relative to torso)
  | 'ankle' // knee–ankle–foot_index
  | 'bodyLine' // shoulder–hip–ankle (plank / push-up straightness)
  | 'wrist'; // elbow–wrist–index

/** Segment inclination (degrees, 0–180) against a global reference. */
export type SegmentName =
  | 'trunk' // hip→shoulder
  | 'shin' // ankle→knee
  | 'thigh' // hip→knee
  | 'upperArm' // shoulder→elbow
  | 'forearm' // elbow→wrist
  | 'shoulders' // left→right shoulder (tilt, front view)
  | 'hips'; // left→right hip (tilt, front view)

/** flexed / extended: the more / less bent of the two sides each frame (lunging leg vs straight leg, whichever side leads). */
export type Side = 'auto' | 'left' | 'right' | 'both' | 'flexed' | 'extended';

export type AngleDef =
  | {
      id: string;
      label: string;
      kind: 'joint';
      joint: JointName;
      /** auto = more visible side (facing camera); both = mean of L/R + asymmetry; flexed/extended = min/max of L/R. */
      side?: Side;
    }
  | {
      id: string;
      label: string;
      kind: 'segment';
      segment: SegmentName;
      /** vertical: 0 = pointing straight up. horizontal: 0 = level. */
      ref: 'vertical' | 'horizontal';
      side?: Side;
    }
  | {
      id: string;
      label: string;
      /** Horizontal spread between two bilateral landmarks divided by shoulder width. */
      kind: 'spread';
      what: 'feet' | 'knees' | 'hands';
    };

/** Inclusive range in degrees (or ratio for spread). */
export type Range = [number, number];

export interface Check {
  angle: string;
  /**
   * When the check applies:
   *  - any:    every tracked frame
   *  - active: while away from the start position (the working phase)
   *  - bottom: scored at the extreme of each rep (deepest / highest point)
   *  - top:    while in the start/lockout position
   *  - release: at the ballistic event instant (throws, jumps)
   *  - hold:   during an isometric hold
   */
  when: 'any' | 'active' | 'bottom' | 'top' | 'release' | 'hold';
  /** Green band. */
  good: Range;
  /** Yellow band (must contain `good`). Outside = red. */
  ok: Range;
  /** Coaching cue shown when yellow/red (imperative, ≤ 8 words). */
  cue: string;
  /** Why it matters — used in the report. */
  why?: string;
  /** Weight in the form score (default 1). */
  weight?: number;
}

export interface RepRule {
  /** Angle that drives the rep counter. */
  driver: string;
  /** Start position has a high driver angle (squat knee ~170) or low (curl elbow ~160→40 = 'high'). */
  start: 'high' | 'low';
  /** Schmitt thresholds: leaving start past `enter` begins a rep; returning past `exit` completes it. */
  enter: number;
  exit: number;
  /** Driver value that counts as full range at the extreme. */
  target: number;
  /** Reps faster than this are rejected as bounces / noise. Default 600 ms. */
  minRepMs?: number;
  /** Alternating-leg drill (high knees, mountain climbers): one rep = one left + right cycle, counted on the leg nearer the camera. */
  alternating?: boolean;
}

export interface HoldRule {
  /** Target hold time in seconds shown as the goal. */
  targetSec: number;
}

export interface EventRule {
  /** What defines the event instant. */
  trigger: 'wristPeak' | 'jump' | 'hipPeak';
  /** Expected release / take-off angle of the tracked point's velocity (degrees above horizontal). */
  releaseAngle?: { good: Range; ok: Range };
}

export type Category =
  | 'gym'
  | 'calisthenics'
  | 'athletics'
  | 'throws'
  | 'olympic'
  | 'yoga'
  | 'mobility'
  | 'sai';

export interface ExerciseDef {
  id: string;
  name: string;
  category: Category;
  /** Single emoji used as the card glyph. */
  icon: string;
  mode: 'reps' | 'hold' | 'event';
  camera: 'side' | 'front';
  difficulty: 1 | 2 | 3;
  equipment: string[];
  muscles: string[];
  /** One-sentence summary. */
  summary: string;
  /** 2–4 short setup steps shown before the camera opens. */
  setup: string[];
  /** Metabolic equivalent, for the energy estimate. */
  met: number;
  angles: AngleDef[];
  checks: Check[];
  reps?: RepRule;
  hold?: HoldRule;
  event?: EventRule;
}
