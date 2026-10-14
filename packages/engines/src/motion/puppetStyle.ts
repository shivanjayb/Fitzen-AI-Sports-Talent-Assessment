/**
 * How the synthetic athlete performs each exercise beyond what its checks pin down: where the arms carry the
 * bar or dumbbells, split stances, lying positions, the start of each rep, and the equipment to draw.
 * Checks always win over a style, so every demo still lands in its own green bands.
 *
 * Angles follow puppet.ts: directions from straight up, clockwise toward the way the athlete faces; `trunk` is
 * the hip→shoulder direction (+90 prone, −90 supine); joint angles are 180 when straight. `arm`/`armR` are absolute
 * upper-arm directions; `shoulder` is relative to the trunk (0 = arm down along the body). An elbow above 180
 * folds the forearm behind the upper arm (a bar held on the back). Right-side values ("R") are the far or
 * trailing limb side-on, and the athlete's right in the facing view.
 */

export interface Pose {
  trunk: number; hip: number; knee: number; ankle: number | null; shoulder: number; elbow: number; spread: number; lift: number; arm: number | null;
  /** Body shift along the floor (body heights), for broad jumps. */
  shift: number;
  hipR: number | null; kneeR: number | null; ankleR: number | null; shoulderR: number | null; elbowR: number | null; armR: number | null;
}

export type Prop =
  | 'barbell' | 'barbell-hips' | 'dumbbell' | 'dumbbells' | 'kettlebell' | 'medicine-ball' | 'basketball' | 'shot' | 'discus' | 'javelin' | 'racket' | 'cricket-ball' | 'gloves' | 'dowel'
  | 'bench' | 'incline-bench' | 'bench-shoulders' | 'bench-rear-foot' | 'bench-hands' | 'box' | 'bar' | 'parallel-bars' | 'wall' | 'wall-front' | 'mat' | 'blocks' | 'reach-box';

export interface PuppetStyle {
  /** Applied to every keyframe before the checks. */
  base?: Partial<Pose>;
  /** Start of each rep / the standing position. */
  top?: Partial<Pose>;
  /** Bottom of each rep / the held position / the release. */
  bottom?: Partial<Pose>;
  /** Driver value at the start and at the bottom of each rep (defaults sit just past the rep thresholds). */
  topDriver?: number;
  bottomDriver?: number;
  /** Trunk checks are unsigned; lying face up flips them to the supine side. */
  supine?: boolean;
  /** Keep forearms vertical as the bar or floor holds them: presses and pull-ups up, push-ups and dips down. */
  forearm?: 'up' | 'down';
  /** Turn this right-side angle so the trailing foot stays on the floor (split stances). */
  level?: 'hipR' | 'kneeR';
  /** Keep the trailing foot planted where the start pose puts it (split stances that don't step). */
  plant?: boolean;
  /** Reps: step forward from standing and back, leading with each leg in turn; the rear foot stays planted. */
  step?: boolean;
  /** Reps: rise this far (frame heights) mid-move, jumping into and out of a split instead of sliding the feet. */
  hop?: number;
  /** Facing view: open both hips so the feet stay this many shoulder widths apart. */
  fitSpread?: boolean;
  /** Hands fixed at this height (fraction of frame) instead of feet on the floor: hanging and support work. */
  hands?: number;
  /** One rep alternates legs (the trailing leg runs half a cycle behind); false keeps a fixed split stance. */
  alternate?: boolean;
  /** Jumps: crouch and take-off poses, forward travel in body heights. */
  crouch?: Partial<Pose>; takeoff?: Partial<Pose>; travel?: number;
  /** Throws: wind-up and follow-through poses (the throwing arm comes from the checks' side). */
  windup?: Partial<Pose>; follow?: Partial<Pose>;
  /** Throws: seconds from wind-up to follow-through (default 0.26). */
  release?: number;
  /** Throws: fraction of the swing at peak hand speed (default 0.5; punches and shots peak near lock-out). */
  peak?: number;
  /** Throws: the hand travels a straight line (punches, chest passes) instead of swinging. */
  linear?: boolean;
  props?: Prop[];
}

// Shared carriages.
const BAR_ON_BACK: Partial<Pose> = { shoulder: -20, elbow: 330 };
const FRONT_RACK: Partial<Pose> = { arm: 85, elbow: 25 };
const HANDS_ON_HIPS: Partial<Pose> = { shoulder: -35, elbow: 80 };
const RUN_ARMS_TOP: Partial<Pose> = { arm: 140, armR: 215, elbow: 90, elbowR: 90 };
const RUN_ARMS_BOTTOM: Partial<Pose> = { arm: 215, armR: 140, elbow: 90, elbowR: 90 };
const ARMS_FORWARD: Partial<Pose> = { shoulder: 85, elbow: 172 };
const ARMS_OVERHEAD: Partial<Pose> = { shoulder: 172, elbow: 172 };

export const STYLES: Record<string, PuppetStyle> = {
  // ── Gym ──
  'back-squat': { base: BAR_ON_BACK, props: ['barbell'] },
  'front-squat': { base: FRONT_RACK, props: ['barbell'] },
  'goblet-squat': { base: { shoulder: 15, elbow: 30 }, props: ['dumbbell'] },
  'sumo-squat': { base: { hip: 166, hipR: 166, kneeR: 176, shoulder: -8, shoulderR: -8, elbow: 176 }, fitSpread: true, props: ['dumbbell'] },
  'bench-press': { base: { trunk: -90, hip: 200, knee: 90 }, forearm: 'up', props: ['barbell', 'bench'] },
  'incline-bench-press': { base: { trunk: -58, hip: 168, knee: 90 }, forearm: 'up', props: ['barbell', 'incline-bench'] },
  'overhead-press': { top: { elbow: 25 }, forearm: 'up', props: ['barbell'] },
  'conventional-deadlift': { props: ['barbell'] },
  'romanian-deadlift': { props: ['barbell'] },
  'bent-over-row': { base: { trunk: 60, knee: 150 }, forearm: 'down', props: ['barbell'] },
  'dumbbell-curl': { props: ['dumbbells'] },
  'hammer-curl': { props: ['dumbbells'] },
  'overhead-triceps-extension': { props: ['dumbbell'] },
  'lateral-raise': { base: { shoulderR: 15, elbow: 168 }, props: ['dumbbells'] },
  'front-raise': { props: ['dumbbells'] },
  'forward-lunge': { base: HANDS_ON_HIPS, step: true, bottom: { hip: 98, hipR: 161, kneeR: 92 } },
  'bulgarian-split-squat': {
    top: { hip: 172, hipR: 205, kneeR: 115 }, bottom: { hip: 100, hipR: 178, kneeR: 85 }, props: ['dumbbells', 'bench-rear-foot'],
  },
  'hip-thrust': {
    topDriver: 100, top: { trunk: -50, knee: 90, shoulder: 8, elbow: 170 }, bottom: { trunk: -90 }, props: ['barbell-hips', 'bench-shoulders'],
  },
  'glute-bridge': { topDriver: 130, top: { trunk: -90, knee: 82, arm: 92 }, bottom: { trunk: -110, arm: 75 }, props: ['mat'] },
  'standing-calf-raise': { topDriver: 98, bottomDriver: 145, props: ['dumbbells'] },
  'good-morning': { base: BAR_ON_BACK, props: ['barbell'] },
  'upright-row': { top: { elbow: 176 }, bottom: { elbow: 402 }, props: ['barbell'] }, // 42° reached by folding inward: hands rise close to the body
  'kettlebell-swing': { top: { arm: 92, elbow: 176 }, bottom: { trunk: 55, arm: 195, elbow: 176 }, props: ['kettlebell'] },
  'dumbbell-shoulder-press': { base: { shoulderR: 90, elbowR: 90 }, top: { elbow: 85, elbowR: 85 }, forearm: 'up', props: ['dumbbells'] },

  // ── Calisthenics ──
  'push-up': { forearm: 'down' },
  'knee-push-up': { base: { trunk: 72, knee: 118 }, forearm: 'down', props: ['mat'] },
  'diamond-push-up': { forearm: 'down' },
  'pike-push-up': { base: { trunk: 145, hip: 75 }, forearm: 'down' },
  'pull-up': { base: { shoulderR: 170, elbowR: 170, kneeR: 176 }, forearm: 'up', hands: 0.06, props: ['bar'] },
  'chin-up': { forearm: 'up', hands: 0.06, base: { knee: 160 }, props: ['bar'] },
  'parallel-bar-dip': { base: { knee: 95 }, forearm: 'down', hands: 0.42, props: ['parallel-bars'] },
  'bench-dip': { base: { hip: 95, knee: 172 }, forearm: 'down', hands: 0.62, props: ['bench-hands'] },
  'bodyweight-squat': { top: { shoulder: 10 }, bottom: ARMS_FORWARD },
  'jump-squat': { base: { shoulder: 150, elbow: 30 } },
  'pistol-squat': { top: { hipR: 150, kneeR: 176, ...ARMS_FORWARD }, bottom: { hipR: 45, kneeR: 176, ...ARMS_FORWARD } },
  burpee: { topDriver: 2, top: { shoulder: 165, elbow: 172 }, bottom: { shoulder: 82, elbow: 176 } },
  'mountain-climber': { base: { trunk: 80, arm: 182, elbow: 176 }, top: { hip: 175, knee: 176 }, bottom: { knee: 72 } },
  crunch: { supine: true, topDriver: 92, base: { hip: 136, shoulder: 168, elbow: 40 } },
  'lying-leg-raise': { supine: true, base: { shoulder: 10, elbow: 176 }, props: ['mat'] },
  plank: { props: ['mat'] },
  'side-plank': { base: { trunk: 70, hipR: 176, kneeR: 176, arm: 182, elbow: 176, armR: 140, elbowR: 176 }, props: ['mat'] },
  'hollow-body-hold': { supine: true, top: { trunk: -90, hip: 176, shoulder: 10 }, props: ['mat'] },
  'wall-sit': { base: { shoulder: 35, elbow: 120 }, props: ['wall'] },
  'l-sit': { base: { arm: 182 }, props: ['parallel-bars'], hands: 0.62 },

  // ── Athletics ──
  'sprint-start-set': { level: 'hipR', top: { trunk: 103, hip: 60, knee: 92, hipR: 100, kneeR: 115, arm: 176 }, bottom: { hip: 60, hipR: 100 }, props: ['blocks'] },
  'high-knees': { top: { ...RUN_ARMS_TOP }, bottom: { knee: 80, ...RUN_ARMS_BOTTOM } },
  'a-skip': { top: { ...RUN_ARMS_TOP }, bottom: { knee: 85, ...RUN_ARMS_BOTTOM } },
  'butt-kicks': { top: { ...RUN_ARMS_TOP }, bottom: { ...RUN_ARMS_BOTTOM } },
  'countermovement-jump': { base: HANDS_ON_HIPS, takeoff: { arm: null, ...HANDS_ON_HIPS } },
  'squat-jump': { base: HANDS_ON_HIPS, takeoff: { arm: null, ...HANDS_ON_HIPS } },
  'standing-broad-jump': { crouch: { arm: 235, elbow: 176, trunk: 45 }, takeoff: { trunk: 32, arm: 55 }, travel: 1.3 },
  'box-jump': { crouch: { arm: 235, elbow: 176 }, props: ['box'] },
  'lateral-bound': { topDriver: 0.7, bottomDriver: 3.4, fitSpread: true, base: { hipR: 176, kneeR: 176, shoulder: 35, shoulderR: 35 } },

  // ── Throws & strikes ──
  'javelin-release': {
    level: 'hipR', base: { hip: 165, hipR: 205, kneeR: 150 },
    plant: true, windup: { arm: 100, elbow: 176 }, follow: { arm: 160, elbow: 150 }, props: ['javelin'],
  },
  'shot-put': { level: 'hipR', plant: true, linear: true, base: { hip: 165, hipR: 205, kneeR: 150 }, windup: { arm: 110, elbow: 150, armR: 230, elbowR: 30 }, follow: { arm: 165, elbow: 120, armR: 68, elbowR: 179 }, release: 0.18, peak: 0.7, props: ['shot'] },
  'discus-release': { level: 'hipR', plant: true, base: { hip: 165, hipR: 205, kneeR: 150 }, windup: { armR: 200, elbowR: 178, arm: 60 }, follow: { armR: -10, elbowR: 178, arm: 150 }, release: 0.45, props: ['discus'] },
  'fast-bowling-delivery': { level: 'hipR', plant: true, base: { hip: 160, hipR: 210, kneeR: 165 }, windup: { armR: -130, arm: 20 }, follow: { armR: 170, arm: 200 }, props: ['cricket-ball'] },
  'basketball-jump-shot': {
    base: { arm: 170, elbow: 50 }, crouch: { knee: 115, hip: 115, trunk: 20, lift: 0, arm: 170, elbow: 50 },
    windup: { arm: 30, elbow: 60 }, follow: { arm: 30, elbow: 179 }, release: 0.12, props: ['basketball'],
  },
  'overhead-smash': { windup: { arm: -40, elbow: 110 }, follow: { arm: 120, elbow: 179 }, release: 0.14, props: ['racket'] },
  'boxing-straight-punch': {
    level: 'hipR', plant: true, base: { hipR: 200, kneeR: 165, arm: 150, elbow: 40, armR: 150, elbowR: 30 }, linear: true,
    windup: { arm: 150, elbow: 25 }, follow: { arm: 86, elbow: 179 }, release: 0.1, peak: 0.6, props: ['gloves'],
  },

  // ── Olympic lifts ──
  'power-clean': { top: { trunk: 40, hip: 70, knee: 92, arm: 180 }, bottom: { trunk: 10, hip: 150, ...FRONT_RACK, elbow: 56 }, props: ['barbell'] },
  'hang-clean': { top: { trunk: 22, hip: 150, knee: 160, arm: 180 }, bottom: { hip: 150, elbow: 56 }, props: ['barbell'] },
  snatch: { topDriver: 40, top: { trunk: 40, hip: 70, knee: 92 }, bottom: { trunk: 15, hip: 95, knee: 95 }, props: ['barbell'] },
  'push-jerk': { top: { elbow: 40 }, bottom: { knee: 150 }, props: ['barbell'] },
  'split-jerk': { level: 'hipR', hop: 0.05, top: { elbow: 40, hipR: 176, kneeR: 176 }, bottom: { hip: 105, knee: 112, hipR: 205, kneeR: 160 }, props: ['barbell'] },
  'split-jerk-catch-hold': { level: 'hipR', base: { arm: 7, elbow: 176 }, top: { hip: 172, knee: 176, hipR: 182, kneeR: 176 }, bottom: { hip: 105, hipR: 205, kneeR: 160 }, props: ['barbell'] },

  // ── SAI battery ──
  'sai-sit-up': { base: { trunk: -90, hip: 140, knee: 85, shoulder: 15, elbow: 25 }, bottom: { trunk: 10 }, props: ['mat'] },
  'sai-partial-curl-up': { supine: true, topDriver: 92, base: { hip: 136, knee: 90, shoulder: 10 }, props: ['mat'] },
  'sai-sit-and-reach': { top: { trunk: 0, hip: 90, arm: 120, elbow: 176 }, bottom: { trunk: 60, arm: 100 }, props: ['reach-box'] },
  'sai-flamingo-balance': { base: { hipR: 176, kneeR: 32, shoulder: 70, shoulderR: 15 } },
  'sai-push-up': { forearm: 'down' },
  'sai-medicine-ball-throw': { base: { hip: 90, knee: 172, arm: 180, elbow: 35 }, linear: true, windup: { arm: 180, elbow: 35 }, follow: { arm: 65, elbow: 179 }, release: 0.12, peak: 0.7, props: ['medicine-ball', 'wall'] },
  'sai-vertical-jump': { crouch: { arm: 235, elbow: 176 } },
  'sai-broad-jump': { crouch: { arm: 235, elbow: 176, trunk: 50 }, takeoff: { trunk: 32, arm: 55 }, travel: 1.3 },

  // ── Yoga ──
  'tree-pose': { base: { hipR: 120, kneeR: 40, ...ARMS_OVERHEAD, shoulderR: 172 } }, // starts in the pose: its checks also pass standing, so stepping in reads as movement
  'warrior-ii': {
    level: 'hipR', base: { kneeR: 176 }, top: { hip: 160, knee: 176, hipR: 160, shoulder: 10, shoulderR: 10 },
    bottom: { hip: 112, knee: 100, hipR: 140, shoulder: 90, shoulderR: 90 },
  },
  'warrior-i': { level: 'hipR', base: { kneeR: 176 }, top: { hip: 172, knee: 176, hipR: 190, shoulder: 10 }, bottom: { hip: 100, hipR: 215, ...ARMS_OVERHEAD } },
  'chair-pose': { top: { shoulder: 10 } },
  'downward-dog': { top: { trunk: 70, hip: 176, knee: 176 }, bottom: { trunk: 130 } },
  'cobra-pose': { base: { hip: 215, arm: 162, elbow: 172 }, top: { trunk: 88, hip: 182, arm: 200, elbow: 90 }, props: ['mat'] },
  'triangle-pose': {
    level: 'hipR', base: { kneeR: 176, elbowR: 176 }, top: { trunk: 0, hip: 150, hipR: 150, arm: 160, armR: 160 },
    bottom: { hip: 85, hipR: 185, arm: 180, armR: 100 }, // lower hand to the shin, top arm stacked straight up
  },
  'boat-pose': { supine: true, top: { trunk: -10, hip: 70, knee: 120 }, props: ['mat'] }, // starts seated on the floor, knees up
  'bridge-pose': { base: { arm: 92 }, top: { trunk: -90, hip: 130, knee: 70 }, bottom: { trunk: -110 }, props: ['mat'] },
  'mountain-pose': { fitSpread: true, base: { hipR: 176, kneeR: 176, shoulder: 8, shoulderR: 8, elbow: 176 } },

  // ── Mobility ──
  'deep-squat-hold': { bottom: { shoulder: 70, elbow: 120 } },
  'overhead-reach-test': {},
  'hip-hinge-drill': { base: BAR_ON_BACK, bottom: { trunk: 60 }, props: ['dowel'] }, // hips back, chest forward, shins vertical
  'standing-toe-touch': { base: { trunk: 140, hip: 40, arm: 182 } }, // starts folded: folding down from standing reads as a different body position
  'knee-to-wall': { level: 'hipR', plant: true, base: { hip: 100, knee: 61, hipR: 190, kneeR: 95, shoulder: 70, elbow: 100 }, props: ['wall-front'] },
  'arm-circles': {},
};
