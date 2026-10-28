/**
 * Motion session engine — interprets an `ExerciseDef` over a stream of pose
 * frames and produces live per-joint feedback plus a scientific session report.
 *
 * Measurement choices (see paper §III):
 *  - 2D angles in the image plane with x scaled by the frame aspect ratio, blended toward 3D angles from MediaPipe's
 *    metric world landmarks when a limb leaves the image plane. Image-landmark z is never used.
 *  - One Euro filtering of landmarks (Casiez et al., CHI 2012) for low lag at
 *    speed and low jitter at rest.
 *  - Rep counting on the driver normalised to the athlete's own observed range, with two-threshold hysteresis
 *    (PoseRAC, Yao 2023 arXiv:2303.08450; MediaPipe pose-classification repetition counter, Apache-2.0).
 *  - Jump height from flight time, h = g·t²/8, take-off/landing from the toes.
 */

import type { PoseFrame } from '../jump/types.js';
import type { AngleDef, Check, ExerciseDef, Range, SegmentName } from './types.js';
import { simulateExercise } from './puppet.js';
import { exerciseById } from './catalog/index.js';

export type Zone = 'good' | 'ok' | 'bad';

// BlazePose indices
const L = { shoulder: 11, elbow: 13, wrist: 15, index: 19, hip: 23, knee: 25, ankle: 27, heel: 29, foot: 31 };
const R = { shoulder: 12, elbow: 14, wrist: 16, index: 20, hip: 24, knee: 26, ankle: 28, heel: 30, foot: 32 };
type SideMap = typeof L;

const JOINTS: Record<import('./types.js').JointName, (s: SideMap) => [number, number, number]> = {
  knee: (s) => [s.hip, s.knee, s.ankle],
  hip: (s) => [s.shoulder, s.hip, s.knee],
  elbow: (s) => [s.shoulder, s.elbow, s.wrist],
  shoulder: (s) => [s.hip, s.shoulder, s.elbow],
  ankle: (s) => [s.knee, s.ankle, s.foot],
  bodyLine: (s) => [s.shoulder, s.hip, s.ankle],
  wrist: (s) => [s.elbow, s.wrist, s.index],
};
const SEGMENTS: Record<Exclude<SegmentName, 'shoulders' | 'hips'>, (s: SideMap) => [number, number]> = {
  trunk: (s) => [s.hip, s.shoulder],
  shin: (s) => [s.ankle, s.knee],
  thigh: (s) => [s.hip, s.knee],
  upperArm: (s) => [s.shoulder, s.elbow],
  forearm: (s) => [s.elbow, s.wrist],
};
type SegKey = keyof typeof SEGMENTS;
/** Body segments whose image-plane length a joint angle depends on (foreshortening gate). */
const JOINT_SEGS: Record<import('./types.js').JointName, SegKey[]> = {
  knee: ['thigh', 'shin'], hip: ['trunk', 'thigh'], elbow: ['upperArm', 'forearm'], shoulder: ['trunk', 'upperArm'],
  ankle: ['shin'], bodyLine: ['trunk', 'thigh', 'shin'], wrist: ['forearm'],
};
const NOSE = 0;

/** Image points (x scaled by aspect, y down; never MediaPipe's image z) or world points (metres, z = depth). */
interface P { x: number; y: number; v: number; z?: number }

const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Included angle at b, θ = atan2(|u×v|, u·v): stable near 0° and 180°, where acos loses precision (Kahan 2006, "How
 * futile are mindless assessments of roundoff", §12). This is the included angle — flexion for hinge joints, a
 * plane-independent elevation for ball joints — not ISB Euler angles (Wu et al. 2002/2005). z is 0 for image points.
 */
export function jointAngle(a: P, b: P, c: P): number {
  const ux = a.x - b.x, uy = a.y - b.y, uz = (a.z ?? 0) - (b.z ?? 0), vx = c.x - b.x, vy = c.y - b.y, vz = (c.z ?? 0) - (b.z ?? 0);
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if ((ux === 0 && uy === 0 && uz === 0) || (vx === 0 && vy === 0 && vz === 0)) return NaN;
  return deg(Math.atan2(Math.hypot(cx, cy, cz), ux * vx + uy * vy + uz * vz));
}

/** Angle of a→b against straight up (y grows downward); depth counts as horizontal. */
export function vsVertical(a: P, b: P): number {
  return deg(Math.atan2(Math.hypot(b.x - a.x, (b.z ?? 0) - (a.z ?? 0)), a.y - b.y));
}
export function vsHorizontal(a: P, b: P): number {
  return deg(Math.atan2(Math.abs(b.y - a.y), Math.hypot(b.x - a.x, (b.z ?? 0) - (a.z ?? 0))));
}

export const zoneOf = (v: number, good: Range, ok: Range): Zone =>
  v >= good[0] && v <= good[1] ? 'good' : v >= ok[0] && v <= ok[1] ? 'ok' : 'bad';

// ---------------------------------------------------------------------------
// One Euro filter
// ---------------------------------------------------------------------------

/** Tuning knobs — exposed because real cameras differ. */
// beta 10 (was 1): in frame-height/s units beta=1 barely lifts the cutoff at rep speeds, giving ~2 frames of lag and
// 5-10 % peak loss at 1 Hz; beta=10 keeps rest jitter nearly the same. Casiez, Roussel & Vogel, CHI 2012 (tune beta for lag).
// minSegmentRatio: a segment tilted φ out of the image plane projects to L·cos φ (orthographic approximation), so
// 0.87 ≈ cos 30°. Below it the 2D angle is flagged low-confidence: out-of-plane projection is the main 2D angle error
// source (Iizuka et al. 2026, doi:10.3389/fspor.2026.1831625, −11° hip/knee bias; view dependence, Baldinger 2025).
export const FILTER = { minCutoff: 1.5, beta: 10, dCutoff: 1.0, minVisibility: 0.5, minSegmentRatio: 0.87 };

/**
 * World landmarks (metres): lower minCutoff because monocular depth is noisier; beta rescaled for the speed unit
 * (1 m ≈ 0.42 frame heights, so 10 × 0.42 ≈ 4 keeps the same lag at speed). Casiez, Roussel & Vogel, CHI 2012.
 */
export const FILTER_WORLD = { minCutoff: 1.0, beta: 4, dCutoff: 1.0 };
/** Visibility floor per landmark: wrists/hands/feet are MediaPipe's least confident points (Sports2D keeps ≥ 0.3). */
const VIS_MIN = (i: number) => ((i >= 15 && i <= 22) || i >= 27 ? 0.3 : FILTER.minVisibility);
/** A landmark (or the whole pose) missing for up to this long is bridged; longer breaks tracking. */
const GAP_MS = 300;
/** Jumps: flight time is the measurement, so bridge at most 100 ms (h = g·t²/8, Bosco et al. 1983). */
const JUMP_GAP_MS = 100;

export class OneEuro {
  private x = NaN; private dx = 0; private t = 0;
  constructor(private f: { minCutoff: number; beta: number; dCutoff: number } = FILTER) {}
  filter(v: number, tMs: number): number {
    if (Number.isNaN(this.x)) { this.x = v; this.t = tMs; return v; }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const alpha = (fc: number) => 1 / (1 + 1 / (2 * Math.PI * fc * dt));
    const d = (v - this.x) / dt;
    this.dx += alpha(this.f.dCutoff) * (d - this.dx);
    this.x += alpha(this.f.minCutoff + this.f.beta * Math.abs(this.dx)) * (v - this.x);
    return this.x;
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** `foreshortened`: a segment the angle uses is < FILTER.minSegmentRatio of its session length — reading is low-confidence. */
export interface AngleReading { value: number; left?: number; right?: number; zone: Zone | null; foreshortened?: boolean }

export interface RepRecord {
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  eccentricMs: number;
  concentricMs: number;
  extreme: number;
  rom: number;
  fullRange: boolean;
  score: number; // 0..1
  valid: boolean;
  faults: string[];
  /** All angles at the rep extreme. */
  atExtreme: Record<string, number>;
}

export interface EventRecord {
  index: number;
  tMs: number;
  kind: 'release' | 'jump' | 'apex';
  releaseAngle?: number;
  releaseZone?: Zone;
  /** Peak tracked-point speed in body-heights per second. */
  peakSpeed?: number;
  flightMs?: number;
  jumpHeightCm?: number;
  score: number;
  faults: string[];
  atEvent: Record<string, number>;
}

export interface LiveState {
  tMs: number;
  tracking: boolean;
  framing: string | null;
  side: 'left' | 'right';
  angles: Record<string, AngleReading>;
  /** Zone per check index (null = not applicable right now). */
  checkZones: (Zone | null)[];
  /** Landmark index → zone, for skeleton colouring. */
  jointZones: Record<number, Zone>;
  /** "a-b" landmark pair → zone. */
  boneZones: Record<string, Zone>;
  /** Angle id → landmark chain [a, vertex, c] (or [a, b] for segments) for drawing labels/arcs. */
  anchors: Record<string, number[]>;
  phase: 'start' | 'active' | 'hold' | 'idle';
  reps: number;
  validReps: number;
  lastRep: RepRecord | null;
  holdMs: number;
  events: EventRecord[];
  cue: string | null;
  /** Running form score 0–100. */
  score: number;
  /** 0..1 progress of the current rep toward the target (for the ring). */
  progress: number;
  /** Set for ~4 s after a movement that doesn't match the selected exercise (not counted). */
  mismatch: string | null;
  mismatchedReps: number;
}

export interface CheckStat {
  angle: string;
  label: string;
  when: Check['when'];
  cue: string;
  why?: string;
  good: Range;
  ok: Range;
  samples: number;
  pctGood: number;
  pctOk: number;
  pctBad: number;
  mean: number;
  /** Readings skipped because a segment was foreshortened (out of the image plane). */
  excluded: number;
}

/** `noise` = in-plane frame jitter (1 SD, degrees). It cannot see out-of-plane (perspective) error, which is a bias. */
export interface AngleStat { label: string; mean: number; sd: number; min: number; max: number; noise: number }

export interface CoachInsight { level: 'good' | 'warn' | 'bad'; title: string; detail: string }

export interface SessionReport {
  exerciseId: string;
  name: string;
  mode: ExerciseDef['mode'];
  startedAt: string;
  durationSec: number;
  frames: number;
  fps: number;
  trackedPct: number;
  /** % of tracked frames where at least one checked angle was foreshortened (limb > ~30° out of the image plane). */
  foreshortenedPct: number;
  reps?: {
    count: number;
    valid: number;
    partial: number;
    rejected: number;
    /** Movements that didn't match the selected exercise, with the reason; not counted as reps. */
    mismatched: Array<{ tMs: number; reason: string }>;
    perMin: number;
    perSec: number;
    avgDurationSec: number;
    avgEccentricSec: number;
    avgConcentricSec: number;
    romMean: number;
    romSd: number;
    tutSec: number;
    consistencyCv: number;
    /** % change in rep duration first→last (linear fit). Positive = slowing. */
    fatigueSlopePct: number;
    /** Velocity loss %, first→last rep (linear fit) of mean concentric angular velocity. Sánchez-Medina & González-Badillo 2011. */
    velocityLossPct: number;
    romDropDeg: number;
    list: RepRecord[];
    target: number;
    driverLabel: string;
  };
  hold?: { totalSec: number; bestSec: number; targetSec: number; stability: Record<string, number> };
  events?: EventRecord[];
  /** Movements (reps, hold windows, attempts) that didn't match the selected exercise; not counted. */
  mismatched: Array<{ tMs: number; reason: string }>;
  angles: Record<string, AngleStat>;
  checks: CheckStat[];
  symmetry: Record<string, number>;
  formScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A';
  assessmentStatus?: 'assessed' | 'insufficient-evidence';
  validity?: { protocolId: string; modelVersion: string; attemptedFrames: number; trackedFrames: number; longestGapMs: number; completedAttempts: number; scoredSamples: number };
  kcal: number | null;
  insights: CoachInsight[];
  /** Driver (or first angle) over time, ≤ 400 points, for charts. */
  series: Array<{ t: number; v: number }>;
}

/** Old saved reports have no status field; infer eligibility from completed movement, never their grade alone. */
export function isAssessedReport(r: SessionReport): boolean {
  if (r.assessmentStatus) return r.assessmentStatus === 'assessed';
  return r.trackedPct > 0 && (r.reps ? r.reps.count > 0 : r.hold ? r.hold.totalSec > 0 : (r.events?.length ?? 0) > 0);
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

interface CheckAcc { good: number; ok: number; bad: number; sum: number; n: number }
/** pr: probe angles (movement signature); wr: raw world points (null without world); pl: plane of elevation sample. */
interface Frame { t: number; a: Record<string, number>; raw: Record<string, number>; pts: P[]; rp: P[]; w: P[] | null; wr: P[] | null; pr: Record<string, number>; pl?: number; fs: Set<string>; sh: Set<string> }

const W: Record<Zone, number> = { good: 1, ok: 0.6, bad: 0 };

/**
 * Movement signature of one rep: range of motion of the major joints, mean trunk inclination and how often each
 * limb segment left the image plane. Compared with the selected exercise's reference (its own demo athlete) to
 * catch a different movement being performed, e.g. lateral raises or presses while front raises are selected.
 */
export interface RepSignature {
  rom: Record<Probe, number>; trunk: number; outOfPlane: Record<SegKey, number>;
  /** Median angle of each probe over the rep: the posture of the joints the exercise keeps still. */
  pose?: Record<Probe, number>;
  /** Median ISB plane of elevation of the arm (0 = abduction, 90 = flexion), from world landmarks; absent without them. */
  plane?: number;
  /** Estimated per-frame angle noise (1 SD, degrees) of each probe on this camera. */
  noise?: Partial<Record<Probe, number>>;
  /** The rep's driver excursion (degrees, top − extreme). */
  drive?: number;
}
type Probe = 'knee' | 'hip' | 'elbow' | 'shoulder';
const PROBES: Probe[] = ['knee', 'hip', 'elbow', 'shoulder'];
/** Probe angles measured like any catalog angle (3D-blended, so a turned athlete reads the same), on the near side. */
const PROBE_DEFS: AngleDef[] = [
  ...PROBES.map((q): AngleDef => ({ id: `~${q}`, label: q, kind: 'joint', joint: q })),
  { id: '~trunk', label: 'trunk', kind: 'segment', segment: 'trunk', ref: 'vertical' },
];
/** Reps: knee and hip on the more flexed side, so alternating legs (butt kicks, high knees) can't hide on the far side;
 * a far side too occluded to see (any chain point < 0.5) falls back to the near side (measure). Not events: a stride's
 * front knee would mark the knee as moving in every throw's reference and hide a squat before the throw. */
const PROBE_DEFS_REPS: AngleDef[] = PROBE_DEFS.map((a) => (a.id === '~knee' || a.id === '~hip' ? { ...a, side: 'flexed' as const } : a));
/** Robust range: p95 − p5. The max − min of noisy samples is an extreme-value statistic that grows with n (Tippett 1925). */
/**
 * Lower toe (y down) of the feet actually seen: an occluded far foot (v < 0.5) is a guess and fakes take-offs. Side view:
 * the near foot alone while it is seen at its own floor (0.3) — a far foot guessed ~3 cm off (≈ 8 % of leg length) faked a
 * 157 ms flight whenever the near foot dipped under 0.5.
 */
function lowerToe(p: P[], near?: number): number {
  if (near !== undefined && p[near]!.v >= VIS_MIN(near)) return p[near]!.y;
  const seen = [L.foot, R.foot].filter((i) => p[i]!.v >= FILTER.minVisibility);
  return Math.max(...(seen.length ? seen : [L.foot, R.foot]).map((i) => p[i]!.y));
}
function range90(xs: number[]): number {
  if (xs.length < 2) return 0;
  const s = [...xs].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]!;
  return q(0.95) - q(0.05);
}
/**
 * ISB plane of elevation of the humerus (Wu et al. 2005, J Biomech 38:981-992): t = trunk axis, m = shoulder line made
 * ⊥ t, a = t × m (forward). Angle of the upper arm between m (0° = abduction) and a (90° = flexion). Front vs lateral
 * raise, whatever the camera angle.
 */
function planeOfElevation(w: P[], side: SideMap): number {
  const sub = (a: P, b: P) => [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const norm = (a: number[]) => { const n = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return a.map((x) => x / n); };
  const mid = (i: number, j: number): P => ({ x: (w[i]!.x + w[j]!.x) / 2, y: (w[i]!.y + w[j]!.y) / 2, z: ((w[i]!.z ?? 0) + (w[j]!.z ?? 0)) / 2, v: 1 });
  const tr = sub(mid(L.shoulder, R.shoulder), mid(L.hip, R.hip)), t = norm(tr);
  const d = sub(w[L.shoulder]!, w[R.shoulder]!), dt = dot(d, t), mr = d.map((x, i) => x - dt * t[i]!);
  // An occluded far shoulder is a guess, often collapsed onto the near one: with the shoulder line under 0.3 × the trunk
  // length (biacromial ≈ 0.75 × trunk) there is no mediolateral axis, so no plane this frame.
  if (Math.hypot(mr[0]!, mr[1]!, mr[2]!) < 0.3 * Math.hypot(tr[0]!, tr[1]!, tr[2]!)) return NaN;
  const m = norm(mr);
  const a = [t[1]! * m[2]! - t[2]! * m[1]!, t[2]! * m[0]! - t[0]! * m[2]!, t[0]! * m[1]! - t[1]! * m[0]!];
  const u = sub(w[side.elbow]!, w[side.shoulder]!), ua = Math.abs(dot(u, a)), um = Math.abs(dot(u, m));
  // The plane is singular with the arm along the trunk (down, or overhead in a press or jerk): needs sin(elevation) ≥ 0.5,
  // i.e. elevation 30–150°.
  if (Math.hypot(ua, um) < 0.5 * Math.hypot(u[0]!, u[1]!, u[2]!)) return NaN;
  return deg(Math.atan2(ua, um));
}
/**
 * A joint the exercise keeps still (reference ROM < STILL) that moves more than MOVED[joint] is a different movement.
 * MOVED is set well above what real athletes add around the prime mover (arm swing in a squat ≈ 60–90° shoulder,
 * knee dip in a press ≈ 20–30°), so only a clear change of exercise trips it. Elbow 20 (+ the ≥ 20° noise allowance,
 * so ≥ 40°) only in arm-driven exercises: a held bar or a straight-arm raise barely bends the elbow, while a half press
 * or a half jerk bends it ≈ 45–55° (ROM is p95 − p5). Elsewhere (legs, hinges, running drills, Olympic lifts) arm pumping
 * and a pull-under bend the elbow tens of degrees, so it keeps the 60° of the other joints' scale (MOVED_ELBOW_LEGS).
 * ponytail: thresholds tuned on the synthetic demo athlete; recalibrate on real clips.
 */
const STILL = 20;
const MOVED: Record<Probe, number> = { knee: 50, hip: 50, elbow: 20, shoulder: 100 };
const MOVED_ELBOW_LEGS = 60;
/** Throws and jumps legitimately add leg drive and arm swing, so only a clearly different whole-body pattern trips them. */
const MOVED_EVENT: Record<Probe, number> = { knee: 75, hip: 75, elbow: 90, shoulder: 140 };
/** Hold window length for the movement check. */
const HOLD_WINDOW_MS = 3000;
/** Trunk inclination change that means a different body position (standing ↔ lying/bent over). */
const TRUNK_SHIFT = 40;
/** Extra ROM on a moving joint beyond the reference that means a different lift (front raise ≈ 90° vs overhead ≈ 160°). */
const OVERSHOOT = 55;
/** ROM (beyond noise) above which a still joint that outmoves the driver 3× means another movement. */
const DOMINANT = 45;
/** Fraction of rep frames a segment may be out of plane before the movement is judged to be in another plane (2D only). */
const OUT_OF_PLANE = 0.5;
/** Plane-of-elevation difference (degrees) that means another raise (front 90° vs lateral 0°). */
const PLANE_SHIFT = 45;
/** Still-arm posture difference (median angle over the rep) that means a different arm exercise. Absolute angles carry
 * a camera bias of up to ≈ 19° (Asaeda et al. 2024), so the margin is well above it. */
const ARM_POSE = 45;
/**
 * Apparent ROM that landmark jitter alone produces on a still joint: at least 20° (never lower than the old fixed
 * allowance), else 4 σ̂ of that probe's measured per-frame noise (p95 − p5 of Gaussian noise ≈ 3.3 σ).
 */
const noiseRom = (sig: RepSignature, p: Probe) => Math.max(20, 4 * (sig.noise?.[p] ?? 0));
/** ROM with the noise removed in quadrature (independent signal and noise variances add; p95 − p5 of a normal = 3.29σ):
 * the unbiased estimate, for rules where either error direction matters. */
const trueRom = (sig: RepSignature, p: Probe) => Math.sqrt(Math.max(0, sig.rom[p] ** 2 - (3.29 * (sig.noise?.[p] ?? 0)) ** 2));

const refCache = new Map<string, RepSignature | null>();
export function referenceSignature(session: ExerciseDef): RepSignature | null {
  if (refCache.has(session.id)) return refCache.get(session.id)!;
  // The reference is the catalog movement: a personalized copy (wider bands, same id) must not change it.
  const def = exerciseById(session.id) ?? session;
  const s = new MotionSession(def, { checkMovement: false });
  for (const f of simulateExercise(def, { reps: 3, seed: 1 })) s.push(f);
  const sigs = def.mode === 'reps' ? s.signatures().slice(0, 2) : s.signatures(); // the demo's last rep is deliberately shallow
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const ref = sigs.length ? {
    rom: Object.fromEntries(PROBES.map((p) => [p, med(sigs.map((g) => g.rom[p]))])) as Record<Probe, number>,
    trunk: med(sigs.map((g) => g.trunk)),
    drive: med(sigs.map((g) => g.drive ?? 0)),
    pose: Object.fromEntries(PROBES.map((p) => [p, med(sigs.map((g) => g.pose?.[p] ?? NaN))])) as Record<Probe, number>,
    outOfPlane: Object.fromEntries((Object.keys(SEGMENTS) as SegKey[]).map((k) => [k, med(sigs.map((g) => g.outOfPlane[k]))])) as Record<SegKey, number>,
    ...(sigs.every((g) => g.plane !== undefined) ? { plane: med(sigs.map((g) => g.plane!)) } : {}),
  } : null;
  refCache.set(def.id, ref);
  return ref;
}

/** Why a rep's signature doesn't match the reference, or null if it does. Exported for tests. */
export function movementMismatch(def: ExerciseDef, sig: RepSignature, ref: RepSignature | null): string | null {
  if (!ref) return null;
  const name = def.name;
  const drv = def.reps ? def.angles.find((a) => a.id === def.reps!.driver) : undefined;
  const armDriven = drv?.kind === 'joint' ? drv.joint === 'elbow' || drv.joint === 'shoulder' : drv?.kind === 'segment' && (drv.segment === 'upperArm' || drv.segment === 'forearm');
  const moved = def.mode === 'event' ? MOVED_EVENT : armDriven && def.category !== 'olympic' ? MOVED : { ...MOVED, elbow: MOVED_ELBOW_LEGS };
  for (const p of PROBES) {
    // NOISE: real landmarks jitter, so measured ROM on a still joint reads ~10–20° even when it doesn't move.
    if (ref.rom[p] < STILL && sig.rom[p] - (def.mode === 'event' ? 0 : noiseRom(sig, p)) > moved[p]) return `Your ${p}s are moving a lot — that doesn't look like ${name}`;
    if (def.mode !== 'reps') continue;
    // A joint that should move, moving through far more range than this exercise ever uses (e.g. overhead press in a front raise).
    if (ref.rom[p] >= STILL && sig.rom[p] > ref.rom[p] + OVERSHOOT) return `That range of motion is far beyond ${name} — looks like a different exercise`;
    // A still joint doing most of the moving: ≥ 2.5× the driver's excursion and past DOMINANT (a discus swing or a snatch
    // pull read as a calf raise or a hinge). A squat's 60–90° arm swing is far under 2.5× its 85° knee range.
    if (ref.rom[p] < STILL && sig.drive !== undefined && trueRom(sig, p) > Math.max(DOMINANT, 2.5 * sig.drive)) return `Your ${p}s are doing most of the moving — that doesn't look like ${name}`;
    // A joint this exercise moves a lot (≥ 60°) that hardly moves (< 10 % of it; a half-depth lunge still moves the hip
    // 15 %, a 40 %-depth press the elbow ≈ 40 %): a press with locked elbows is an arm swing, not a press. On the
    // noise-corrected ROM: jitter alone reads ≈ 3.3σ̂.
    // Not alternating drills: with the far side occluded, every other rep's working leg is the unseen one.
    if (ref.rom[p] >= 60 && !def.reps?.alternating && !(drv?.kind === 'joint' && drv.joint === p) && trueRom(sig, p) < 0.1 * ref.rom[p]) return `Your ${p}s are hardly moving — that doesn't look like ${name}`;
  }
  // The driver itself far past this exercise's range (> 1.6× the reference and by more than a camera bias, ≈ 19°): a
  // 70° ankle swing is a running stride, not a 40° calf raise; a 101° squat would need > 160°. Degrees only (not spread).
  if (def.mode === 'reps' && drv?.kind !== 'spread' && sig.drive !== undefined && ref.drive && sig.drive > Math.max(1.6 * ref.drive, ref.drive + 25)) return `That range of motion is far beyond ${name} — looks like a different exercise`;
  if (def.camera === 'side' && Math.abs(sig.trunk - ref.trunk) > TRUNK_SHIFT) {
    return `Body position doesn't match ${name} (${sig.trunk > ref.trunk ? 'leaning or lying' : 'more upright'} than expected)`;
  }
  const segs: SegKey[] = !drv ? [] : drv.kind === 'joint' ? JOINT_SEGS[drv.joint] : drv.kind === 'segment' && drv.segment in SEGMENTS ? [drv.segment as SegKey] : [];
  // Only shoulder-driven raises need the plane test (front vs lateral raise); for curls, presses and rows ordinary
  // noise or a slight turn reads as 'out of plane' and wrongly discarded real reps.
  const raise = drv?.kind === 'joint' && drv.joint === 'shoulder';
  // Arm exercises are defined by where the still arm joints are held: a straight-arm raise vs a press (elbow ≈ 90°
  // bent), a curl (upper arm down) vs an overhead extension or a smash (arm up). Posture, not range: a shallow press
  // extends the elbow less than the range rule allows for noise, but it still starts bent. Arms only — leg posture
  // legitimately varies (a seated curl is still a curl), and so does arm placement in leg exercises.
  for (const p of armDriven ? (['elbow', 'shoulder'] as const) : []) {
    if (ref.rom[p] < STILL && Math.abs((sig.pose?.[p] ?? NaN) - (ref.pose?.[p] ?? NaN)) > ARM_POSE) return `Your ${p}s are held differently — that doesn't look like ${name}`;
  }
  if (raise && sig.plane !== undefined && ref.plane !== undefined && Math.abs(sig.plane - ref.plane) > PLANE_SHIFT) {
    return `That raise is in a different plane — that doesn't look like ${name}`;
  }
  // 2D fallback (no world landmarks): out-of-plane counts are only recorded without world landmarks.
  for (const g of raise ? segs : []) {
    // Arms only: a limb swinging into depth tells front from lateral raises; legs going out of plane usually means the
    // athlete turned, which the foreshortening gate already greys out.
    if (g !== 'upperArm' && g !== 'forearm') continue;
    if (ref.outOfPlane[g] < 0.2 && sig.outOfPlane[g] > OUT_OF_PLANE) return `The movement left the camera plane — that doesn't look like ${name}`;
  }
  return null;
}

export class MotionSession {
  readonly def: ExerciseDef;
  private filters = new Map<number, [OneEuro, OneEuro]>();
  private worldFilters = new Map<number, [OneEuro, OneEuro, OneEuro]>();
  private side: 'left' | 'right' = 'left';
  private startMs = NaN;
  private lastMs = NaN;
  private frames = 0;
  private tracked = 0;
  private history: Frame[] = [];
  private segmentStart = 0;
  private longestGapMs = 0;
  private previousTracked = false;
  private acc: CheckAcc[];
  private sym: Record<string, number[]> = {};
  // foreshortening gate: session max 2D length per `${side}:${segment}`, excluded readings per check
  private segRef = new Map<string, number>(); private segSm = new Map<string, number>();
  private excluded: number[];
  private fsFrames = 0;
  /** 2D→3D blend weight per `${angle}:${side}` (EMA, τ 0.3 s) and the last good point per landmark (gap bridging). */
  private kBlend = new Map<string, { k: number; t: number }>();
  private dzEma = new Map<string, { dz: number; dxy: number; t: number }>();
  private lastGood = new Map<number, { t: number; p: P; r: P; w?: P; wr?: P }>();
  private feetStale = false;
  private repTop = -Infinity;
  /** Largest driver noise of the rep in progress at its 2D/3D blend weight (1 SD, degrees). */
  private repNoise = 0;
  /** Per-series noise estimate (raw angle, 1 SD): last 5–9 [t, v], recent |residuals| and σ̂. */
  private noiseBuf = new Map<string, Array<[number, number]>>(); private noiseSd = new Map<string, number>(); private noiseRes = new Map<string, number[]>(); private noiseK = new Map<string, number>();

  // reps
  private repState: 'top' | 'down' = 'top';
  private repReady = false;
  private repStart = 0; private lastTop = 0; private topAcc = 0; private topT = NaN; private topPeak = -Infinity;
  private extreme = Infinity; private extremeT = 0; private extremeSnap: Record<string, number> = {}; private extremeFs = new Set<string>();
  private repActive: CheckAcc[] = [];
  private atTop = true;
  private descending = false;
  private reps: RepRecord[] = [];
  private rejected = 0;
  /** Self-normalised range: last 5 driver values (running median), peak-detection envelope, latch. */
  private drv: number[] = []; private runMax = -Infinity;
  private envMax = -Infinity; private envMaxT = 0; private envMin = Infinity; private lookCrest = true; private crests: number[] = []; private troughs: number[] = [];
  private reached = false;
  // movement check: per-rep probe samples, trunk inclination, out-of-plane counts and arm plane
  private checkMovement: boolean;
  private sigs: RepSignature[] = [];
  private mismatched: Array<{ tMs: number; reason: string }> = [];
  private lastShort = new Set<string>();
  private probeVals: Record<Probe, number[]> = { knee: [], hip: [], elbow: [], shoulder: [] };
  private planes: number[] = [];
  private trunkSum = 0; private repFrames = 0; private shortCount: Partial<Record<SegKey, number>> = {};

  // hold
  private holdMs = 0; private holdRun = 0; private bestHold = 0; private lastTrackedT = NaN;
  private holdWinStart = NaN; private holdWinMs = 0; private holdWinHeld = 0; private holdWinFrames = 0; private bestBeforeWin = 0; private heldTs = new Set<number>(); private unheldStrikes = 0; private holdEntries = 0; private wasOut = true;
  /** The previous hold window: its start, re-entries and hold credit not yet taken back (cycling spans two windows). */
  private prevWin = { start: NaN, entries: 0, ms: 0, best: 0, cycled: false };
  /** 0.5 s of each hold check (for its median) and the last time the athlete was in position (300 ms grace). */
  private holdBuf = new Map<string, Array<[number, number]>>(); private inPosT = NaN;

  // events
  private events: EventRecord[] = [];
  private groundY = NaN; private airborneSince = NaN; private lastEventT = -1e9; private flatT = -Infinity; private staleT = -Infinity;
  /** Grounded [t, lower-toe y] samples from the last 0.5 s; their median is the ground line. */
  private groundBuf: Array<[number, number]> = [];
  private speedPeak = 0; private speedPeakFrame = -1; private speedPeakWrist = L.wrist; private speedPeakOk = false;
  /** [t, wrist speed] over the last ~1.5 s, for the peak's prominence. */
  private speeds: Array<[number, number]> = [];
  private pendingRelease: { f: Frame; ang: number; sp: number } | null = null;
  /** Running sum of toe−heel and nose−mid-shoulder (x, and z in world): its sign is the direction the athlete faces. */
  private facingSum = 0; private facingZ = 0;
  private airSamples: Array<[number, number]> = []; private bodyHMax = 0; private bodyHMaxW = 0;

  private cue: string | null = null; private cueT = 0;
  /** Zones judged at the last event, shown briefly on the skeleton. */
  private eventZones: (Zone | null)[] = []; private eventZonesT = -1e9;
  private weightKg: number | null;
  private smooth: boolean;
  /** Counting-critical landmarks: the angles (and, for events, points) that must be seen for counting to run. */
  private critAngles: AngleDef[]; private critNeed: number; private critPts: number[];

  /** `smoothing: 'none'` skips the causal One Euro filter, for frames already zero-phase filtered offline (filtfiltLandmarks). */
  constructor(def: ExerciseDef, opts: { weightKg?: number; smoothing?: 'one-euro' | 'none'; checkMovement?: boolean } = {}) {
    this.def = def;
    this.weightKg = opts.weightKg ?? null;
    this.smooth = opts.smoothing !== 'none';
    this.checkMovement = opts.checkMovement !== false;
    this.acc = def.checks.map(() => ({ good: 0, ok: 0, bad: 0, sum: 0, n: 0 }));
    this.excluded = def.checks.map(() => 0);
    const byId = (id: string) => def.angles.find((a) => a.id === id);
    const holdIds = [...new Set(def.checks.filter((c) => c.when === 'hold').map((c) => c.angle))];
    this.critAngles = def.mode === 'reps' && def.reps ? [byId(def.reps.driver)!].filter(Boolean) : def.mode === 'hold' ? holdIds.map(byId).filter((a): a is AngleDef => !!a) : [];
    this.critNeed = def.mode === 'hold' ? Math.ceil(this.critAngles.length / 2) : this.critAngles.length;
    this.critPts = def.mode !== 'event' ? [] : def.event?.trigger === 'wristPeak' ? [L.wrist, R.wrist, L.shoulder, R.shoulder, L.foot, R.foot] : [L.hip, R.hip, L.foot, R.foot];
  }

  /** Feed one frame. `aspect` = videoWidth / videoHeight. */
  push(frame: PoseFrame, aspect = 16 / 9): LiveState {
    const t = frame.timestampMs;
    if (Number.isNaN(this.startMs)) this.startMs = t;
    const prevT = this.lastMs;
    this.longestGapMs = Math.max(this.longestGapMs, Number.isFinite(prevT) ? t - prevT : 0);
    if (Number.isFinite(prevT) && t - prevT > GAP_MS) this.breakTracking();
    this.lastMs = t;
    this.frames++;

    const pts: P[] = frame.landmarks.map((lm, i) => {
      if (!this.smooth) return { x: lm.x * aspect, y: lm.y, v: lm.visibility ?? 1 };
      let f = this.filters.get(i);
      if (!f) { f = [new OneEuro(), new OneEuro()]; this.filters.set(i, f); }
      return { x: f[0]!.filter(lm.x * aspect, t), y: f[1]!.filter(lm.y, t), v: lm.visibility ?? 1 };
    });
    // Hard rule: image points never carry MediaPipe's image z (a weak per-image depth guess); depth comes from world only.
    const rawPts: P[] = frame.landmarks.map((lm) => ({ x: lm.x * aspect, y: lm.y, v: lm.visibility ?? 1 }));
    const wl = frame.world && frame.world.length >= 33 && pts.length >= 33 ? frame.world : null;
    const vis = (i: number) => frame.landmarks[i]?.visibility ?? 1;
    const wp: P[] | null = wl && wl.map((lm, i) => {
      if (!this.smooth) return { x: lm.x, y: lm.y, z: lm.z, v: vis(i) };
      let f = this.worldFilters.get(i);
      if (!f) { f = [new OneEuro(FILTER_WORLD), new OneEuro(FILTER_WORLD), new OneEuro(FILTER_WORLD)]; this.worldFilters.set(i, f); }
      return { x: f[0]!.filter(lm.x, t), y: f[1]!.filter(lm.y, t), z: f[2]!.filter(lm.z, t), v: vis(i) };
    });
    const wr: P[] | null = wl && wl.map((lm, i) => ({ x: lm.x, y: lm.y, z: lm.z, v: vis(i) }));
    // Short occlusions: a landmark below its visibility floor keeps its last good position for up to GAP_MS — the causal
    // form of Sports2D's gap interpolation (Pagnon et al. 2024, JOSS); BlazePose still predicts occluded joints.
    // Jumps: flight time is the measurement, so a frame with a bridged (frozen) foot keeps tracking alive but gives the
    // jump detector no toe height at all (stepEvent skips it): the parabola is fitted to observed toe heights only.
    const jumpy = this.def.event?.trigger === 'jump' || this.def.event?.trigger === 'hipPeak';
    this.feetStale = false;
    for (let i = 0; i < pts.length; i++) {
      // Far-side points use the same 0.1 floor as seen(): a stale copy of a moving far arm is worse than its prediction.
      const g = this.lastGood.get(i), vmin = this.visMin(i);
      if (pts[i]!.v >= vmin) this.lastGood.set(i, { t, p: pts[i]!, r: rawPts[i]!, w: wp?.[i], wr: wr?.[i] });
      else if (g && t - g.t <= GAP_MS) {
        if (i >= 27) this.feetStale = true;
        pts[i] = { ...g.p, v: vmin }; rawPts[i] = { ...g.r, v: vmin };
        if (wp && g.w) wp[i] = { ...g.w, v: vmin };
        if (wr && g.wr) wr[i] = { ...g.wr, v: vmin };
      }
    }

    this.pickSide(pts, wp, t);
    const framing = this.framing(pts);
    const tracking = framing === null;
    if (!tracking) {
      this.longestGapMs = Math.max(this.longestGapMs, Number.isFinite(this.lastTrackedT) ? t - this.lastTrackedT : t - this.startMs);
      // A brief loss (missed detection, visibility dip) must not abort the rep or the hold; a real gap does.
      if (!(t - this.lastTrackedT <= (jumpy ? JUMP_GAP_MS : GAP_MS))) this.breakTracking();
    }
    const angles: Record<string, AngleReading> = {};
    const values: Record<string, number> = {};
    const raw: Record<string, number> = {};
    const pr: Record<string, number> = {};
    let fs = new Set<string>();
    let pl: number | undefined;
    if (tracking) {
      this.tracked++;
      fs = this.foreshortened(pts, t, wp !== null);
      for (const a of this.def.angles) {
        if (!this.measurable(a, pts)) continue; // a stale non-critical angle is left out of this frame
        const r = this.measure(a, pts, wp, t);
        const rr = this.measure(a, rawPts, wr, t, true);
        if (!Number.isFinite(r.value)) continue;
        angles[a.id] = { ...r, zone: null, ...(fs.has(a.id) ? { foreshortened: true } : {}) };
        values[a.id] = r.value;
        raw[a.id] = rr.value;
        this.noise(a.id, t, rr.value);
        if (wr && this.def.reps?.driver === a.id) {
          // The driver's pure 2D and pure 3D noise, so a rep measured partly in 3D is judged against the 3D noise.
          this.noise(`${a.id}~2`, t, this.measure(a, rawPts, null, t, true).value);
          this.noise(`${a.id}~3`, t, this.measure(a, wr, null, t, true).value);
        }
        if (r.left !== undefined && r.right !== undefined) (this.sym[a.id] ??= []).push(Math.abs(r.left - r.right));
      }
      (this.def.mode === 'reps' ? PROBE_DEFS_REPS : PROBE_DEFS).forEach((a, i) => {
        const v = this.measure(a, pts, wp, t).value;
        if (Number.isFinite(v)) pr[a.id] = v;
        // Noise on the near side only: a flexed-side probe hops between legs as the far leg's visibility crosses 0.5, and
        // those hops are not camera noise (they read as 15–25° and hid a different exercise's knee drive).
        this.noise(a.id, t, this.measure(PROBE_DEFS[i]!, rawPts, wr, t, true).value);
      });
      if (wp) { const q = planeOfElevation(wp, this.sideMap(this.side)); if (Number.isFinite(q)) pl = q; }
      if (this.def.checks.some((c) => fs.has(c.angle))) this.fsFrames++;
      this.history.push({ t, a: values, raw, pts, rp: rawPts, w: wp, wr, pr, pl, fs, sh: wp ? new Set() : this.lastShort });
      this.lastTrackedT = t;
    }

    // Phase for check applicability
    let phase: LiveState['phase'] = 'idle';
    let progress = 0;
    if (tracking && this.def.mode === 'reps' && this.def.reps) progress = this.stepReps(t, values, fs);
    if (this.def.mode === 'reps') phase = this.repState === 'down' ? 'active' : 'start';
    if (this.def.mode === 'event') phase = 'active';

    const checkZones: (Zone | null)[] = this.def.checks.map((c, i) => {
      const v = values[c.angle];
      if (!tracking || v === undefined) return null;
      const applies =
        c.when === 'any' ||
        (c.when === 'active' && phase === 'active') ||
        (c.when === 'bottom' && phase === 'active') ||
        (c.when === 'top' && phase === 'start' && (this.def.mode !== 'reps' || this.atTop)) ||
        c.when === 'hold' ||
        (c.when === 'release' && this.def.mode === 'event');
      if (!applies) return null;
      if (this.def.mode === 'event' && (c.when === 'release' || c.when === 'bottom')) return t - this.eventZonesT < 2500 ? this.eventZones[i] ?? null : null;
      // Foreshortened limb: the 2D angle is not the anatomical one — grey it out and keep it out of the stats.
      // Frame-level stats for continuous checks; bottom/release are scored per rep/event.
      const frameStat = c.when !== 'bottom' && c.when !== 'release' && !(c.when === 'hold' && this.def.mode !== 'hold');
      if (fs.has(c.angle)) { if (frameStat) this.excluded[i]!++; return null; }
      let z = zoneOf(v, c.good, c.ok);
      if (c.when === 'bottom' && this.def.mode === 'reps') {
        // Depth feedback: stay green once reached; amber while still descending; else judge the rep's extreme.
        const ext = this.extremeSnap[c.angle];
        const ze = ext === undefined ? z : zoneOf(ext, c.good, c.ok);
        z = ze === 'good' ? 'good' : this.descending ? (z === 'bad' ? 'ok' : z) : ze;
      }
      if (frameStat) {
        const s = this.acc[i]!; s[z]++; s.sum += v; s.n++;
        if (this.repState === 'down' && this.repActive[i]) { this.repActive[i][z]++; this.repActive[i].n++; }
      }
      return z;
    });

    if (tracking && this.def.mode === 'hold') {
      // Counting is separate from judging: in position = the 0.5 s median of each measurable hold check is not 'bad' (the
      // median of ~15 samples suppresses single-frame resets). Near a bound a noisy angle folds back inside: |X| of
      // N(μ, σ²) has E[X²] = μ² + σ², so the distance from 0° (or 180°) is bias-corrected to √(max(0, d² − σ̂²))
      // (second-moment correction of the folded normal, Leone, Nelson & Nottingham 1961). It only ever moves a reading
      // toward the bound, by ≤ σ̂ and ≈ σ̂²/2d away from it, so the band's far edge stays the catalog's. σ̂ is the raw angle's
      // noise (0 on clean data). Zones, cues and scores above still use the instantaneous values.
      const holdIdx = this.def.checks.map((c, i) => (c.when === 'hold' ? i : -1)).filter((i) => i >= 0);
      let measured = 0, inPos = true, inPosNow = true;
      for (const i of holdIdx) {
        const c = this.def.checks[i]!, v = values[c.angle];
        if (v === undefined || fs.has(c.angle)) continue;
        measured++;
        const buf = this.holdBuf.get(c.angle) ?? [];
        buf.push([t, v]);
        while (buf.length && buf[0]![0] < t - 500) buf.shift();
        this.holdBuf.set(c.angle, buf);
        const spread = this.def.angles.find((a) => a.id === c.angle)?.kind === 'spread';
        const sg = this.sigma(c.angle);
        const unfold = (x: number) => spread ? x : c.ok[1] >= 180 ? 180 - Math.sqrt(Math.max(0, (180 - x) ** 2 - sg * sg)) : c.ok[0] <= 0 ? Math.sqrt(Math.max(0, x * x - sg * sg)) : x;
        // Spread (a width ratio, no bound): symmetric tolerance min(0.15, 2σ̂).
        const tol = spread ? Math.min(0.15, 2 * sg) : 0;
        const ok: Range = [c.ok[0] - tol, c.ok[1] + tol];
        if (zoneOf(unfold(median(buf.map((b) => b[1]))), c.good, ok) === 'bad') inPos = false;
        if (zoneOf(unfold(v), c.good, ok) === 'bad') inPosNow = false;
      }
      const holding = holdIdx.length > 0 && measured >= Math.max(1, Math.ceil(holdIdx.length / 2)) && inPos;
      if (holding) this.inPosT = t;
      // Out of position must persist 300 ms before the run resets; inside that grace the clock pauses.
      const grace = !holding && t - this.inPosT <= 300;
      // dt from the previous frame of any kind, capped at 100 ms, so untracked gaps never count as hold time.
      const dt = this.previousTracked && Number.isFinite(prevT) && t - prevT <= GAP_MS ? Math.min(100, Math.max(0, t - prevT)) : 0;
      if (holding) {
        if (this.wasOut) this.holdEntries++; // a re-entry after a real exit (past the grace), not a noise flicker
        this.wasOut = false;
        this.holdMs += dt; this.holdRun += dt; this.bestHold = Math.max(this.bestHold, this.holdRun); phase = 'hold';
      } else if (grace) phase = 'hold';
      else { this.holdRun = 0; this.wasOut = true; phase = 'start'; }
      if (this.def.hold) progress = Math.min(1, this.holdRun / (this.def.hold.targetSec * 1000));
      // The movement check judges the frames actually in position this instant (not the median's lag or the grace).
      this.stepHoldWindow(t, holding && inPosNow, holding ? dt : 0);
    }

    if (tracking && this.def.mode === 'event') this.stepEvent(t, pts, wp);
    this.previousTracked = tracking;

    // Colour map
    const jointZones: Record<number, Zone> = {};
    const boneZones: Record<string, Zone> = {};
    const rank = (z: Zone) => (z === 'bad' ? 2 : z === 'ok' ? 1 : 0);
    this.def.checks.forEach((c, i) => {
      const z = checkZones[i];
      if (!z) return;
      const reading = angles[c.angle];
      if (reading && (reading.zone === null || rank(z) > rank(reading.zone))) reading.zone = z;
      const def = this.def.angles.find((a) => a.id === c.angle);
      if (!def) return;
      for (const chain of this.chains(def)) {
        chain.forEach((idx) => { if (jointZones[idx] === undefined || rank(z) > rank(jointZones[idx])) jointZones[idx] = z; });
        for (let k = 0; k + 1 < chain.length; k++) {
          const key = `${Math.min(chain[k]!, chain[k + 1]!)}-${Math.max(chain[k]!, chain[k + 1]!)}`;
          if (boneZones[key] === undefined || rank(z) > rank(boneZones[key])) boneZones[key] = z;
        }
      }
    });

    // Cue: worst applicable check, held ≥ 2.5 s so it's readable
    {
      let worst: { z: Zone; c: Check } | null = null;
      this.def.checks.forEach((c, i) => {
        const z = checkZones[i];
        if (z && z !== 'good' && (!worst || rank(z) > rank(worst.z))) worst = { z, c };
      });
      const w = worst as { z: Zone; c: Check } | null;
      // 2D only: side-view angles vanish when the athlete faces the camera (common on laptops): shoulders read wide
      // relative to the torso. With world landmarks the angles are measured in 3D, so no need to turn.
      const sw = tracking ? Math.hypot(pts[11]!.x - pts[12]!.x, pts[11]!.y - pts[12]!.y) : 0;
      const torso = tracking ? Math.hypot((pts[11]!.x + pts[12]!.x - pts[23]!.x - pts[24]!.x) / 2, (pts[11]!.y + pts[12]!.y - pts[23]!.y - pts[24]!.y) / 2) : 1;
      const facing = this.def.camera === 'side' && !wp && sw > 0.6 * torso ? 'Turn sideways — stand side-on to the camera' : null;
      const nextCue = framing ?? facing ?? (w ? w.c.cue : null);
      const hold = nextCue === null ? 1200 : 2500; // readable, but clear promptly once fixed
      if (nextCue !== this.cue && (this.cue === null || t - this.cueT > hold)) { this.cue = nextCue; this.cueT = t; }
    }

    return {
      tMs: t - this.startMs,
      tracking,
      framing,
      side: this.side,
      angles,
      checkZones,
      jointZones,
      boneZones,
      anchors: Object.fromEntries(this.def.angles.filter((a) => a.kind !== 'spread').map((a) => [a.id, this.chains(a)[0] ?? []])),
      phase,
      reps: this.reps.length,
      validReps: this.reps.filter((r) => r.valid).length,
      lastRep: this.reps[this.reps.length - 1] ?? null,
      holdMs: this.holdMs,
      events: this.events,
      cue: this.cue,
      score: this.runningScore(),
      progress,
      mismatch: this.mismatched.length && t - this.startMs - this.mismatched[this.mismatched.length - 1]!.tMs < 4000 ? this.mismatched[this.mismatched.length - 1]!.reason : null,
      mismatchedReps: this.mismatched.length,
    };
  }

  // -------------------------------------------------------------------------

  /**
   * Near side. Side-on with world landmarks: the side whose shoulder+hip sit nearer the camera (smaller z), switching
   * only past ±8 cm (side-on gives ≈ 17–28 cm, facing ≈ 0), so it is sticky. Otherwise: visibility, 0.15 hysteresis.
   */
  private pickSide(p: P[], w: P[] | null, t: number): void {
    const vis = (s: SideMap) => [s.shoulder, s.elbow, s.hip, s.knee, s.ankle].reduce((a, i) => a + (p[i]!?.v ?? 0), 0) / 5;
    const l = vis(L), r = vis(R);
    // A clear visibility gap is MediaPipe's direct occlusion signal and wins over monocular depth, whose error on an
    // occluded (guessed) far side can reach the shoulder separation.
    if (w && this.def.camera === 'side' && Math.abs(l - r) <= 0.15) {
      // Depth order of the shoulder+hip pairs, averaged like the segment tilts (≈ 0.4 s) so z jitter can't flip it.
      const z = (s: SideMap) => ((w[s.shoulder]!.z ?? 0) + (w[s.hip]!.z ?? 0)) / 2;
      const dz = this.depthEma('side', { x: 0, y: 0, z: z(R), v: 1 }, { x: 0, y: 0, z: z(L), v: 1 }, t).dz;
      if (dz < -0.08) this.side = 'right'; else if (dz > 0.08) this.side = 'left';
      return;
    }
    if (this.side === 'left' && r > l + 0.15) this.side = 'right';
    else if (this.side === 'right' && l > r + 0.15) this.side = 'left';
  }

  private sideMap(s: 'left' | 'right'): SideMap { return s === 'left' ? L : R; }

  /**
   * Angle ids whose segments are foreshortened this frame: 2D length < FILTER.minSegmentRatio × the session's longest
   * 2D length of that segment (≈ its true length when it was parallel to the image plane). Lengths are always tracked
   * (the 2D/3D blend uses them); the grey-out set is returned only without world landmarks, where the 2D angle is all
   * there is.
   * ponytail: session max assumes a fixed camera distance and trusts one clean side-on frame; use a decaying p95 if
   * athletes walk toward the camera.
   */
  private foreshortened(p: P[], t: number, world: boolean): Set<string> {
    const short = new Set<string>();
    // Lengths are smoothed (EMA, τ = 0.25 s) before the max and the comparison. A raw max is an extreme-value statistic
    // of landmark noise: at σ = 0.5 % of frame height the session max of a forearm sits ~20 % above its true length and
    // the gate then greys out (and pauses holds on) perfectly in-plane limbs.
    const a = 1 - Math.exp(-Math.max(0, t - this.lastTrackedT) / 250); // NaN on the first frame → falls back to len
    const track = (key: string, i: number, j: number) => {
      const raw = Math.hypot(p[i]!.x - p[j]!.x, p[i]!.y - p[j]!.y), prev = this.segSm.get(key);
      const len = prev === undefined || Number.isNaN(a) ? raw : prev + a * (raw - prev);
      this.segSm.set(key, len);
      const ref = Math.max(this.segRef.get(key) ?? 0, len);
      this.segRef.set(key, ref);
      return len < FILTER.minSegmentRatio * ref;
    };
    for (const side of ['left', 'right'] as const) {
      for (const seg of Object.keys(SEGMENTS) as SegKey[]) {
        const [i, j] = SEGMENTS[seg](this.sideMap(side));
        if (track(`${side}:${seg}`, i, j)) short.add(`${side}:${seg}`);
      }
    }
    track('line:shoulders', L.shoulder, R.shoulder); track('line:hips', L.hip, R.hip);
    this.lastShort = short;
    const out = new Set<string>();
    if (!short.size || world) return out;
    for (const a of this.def.angles) {
      const segs: SegKey[] =
        a.kind === 'joint' ? JOINT_SEGS[a.joint] :
        a.kind === 'segment' && a.segment !== 'shoulders' && a.segment !== 'hips' ? [a.segment] : [];
      const sides = 'side' in a && (a.side === 'both' || a.side === 'flexed' || a.side === 'extended') ? ['left', 'right'] : 'side' in a && (a.side === 'left' || a.side === 'right') ? [a.side] : [this.side];
      if (segs.some((g) => sides.some((sd) => short.has(`${sd}:${g}`)))) out.add(a.id);
    }
    return out;
  }

  /** Landmark chains an angle touches (for colouring). */
  private chains(a: AngleDef): number[][] {
    const sides: Array<'left' | 'right'> =
      'side' in a && (a.side === 'both' || a.side === 'flexed' || a.side === 'extended') ? ['left', 'right'] :
      'side' in a && (a.side === 'left' || a.side === 'right') ? [a.side] : [this.side];
    if (a.kind === 'joint') return sides.map((s) => JOINTS[a.joint](this.sideMap(s)));
    if (a.kind === 'segment') {
      if (a.segment === 'shoulders') return [[L.shoulder, R.shoulder]];
      if (a.segment === 'hips') return [[L.hip, R.hip]];
      return sides.map((s) => SEGMENTS[a.segment as keyof typeof SEGMENTS](this.sideMap(s)));
    }
    const m = { feet: 'ankle', knees: 'knee', hands: 'wrist' } as const;
    return [[L[m[a.what]], R[m[a.what]]]];
  }

  /** Seen well enough to measure: far-side points of a side-on session need only v ≥ 0.1 (MediaPipe still predicts them). */
  private seen(p: P[], i: number): boolean { return (p[i]?.v ?? 0) >= this.visMin(i); }
  private visMin(i: number): number {
    const far = this.def.camera === 'side' && (this.side === 'left' ? R : L);
    return far && Object.values(far).includes(i) ? 0.1 : VIS_MIN(i);
  }

  /** Measurable this frame: every point of one usable chain is seen (bilateral angles may fall back to one side). */
  private measurable(a: AngleDef, p: P[]): boolean {
    const bilateral = 'side' in a && (a.side === 'both' || a.side === 'flexed' || a.side === 'extended');
    const ok = this.chains(a).map((c) => c.every((i) => this.seen(p, i)));
    return bilateral ? ok.some(Boolean) : ok.every(Boolean);
  }

  /**
   * 2D→3D blend weight target for one side of an angle. r = the smallest in-plane ratio cos(tilt) = |d_xy| / |d| over the
   * world segments it uses, with depth averaged over ≈ 0.4 s (inPlane). Image x/y are measured; z is a learned monocular
   * guess (Martinez et al., ICCV 2017), so 2D is kept while the limb is in the image plane and the 3D angle takes over
   * as it turns into depth, where the 2D error grows with sin(tilt). k = 0 above cos 14° (pure 2D), 1 below cos 30°.
   * The world ratio also sees a segment that is never in the image plane (a face-on plank). The 2D length against its
   * session maximum is NOT used here: under landmark jitter that maximum is an extreme value (≈ +3σ) and the ratio
   * reads every in-plane limb as foreshortened, which hands the angle to the noisier 3D estimate.
   */
  private blendTarget(a: AngleDef, s: 'left' | 'right', w: P[], t: number): number {
    const m = this.sideMap(s);
    const segs: Array<[string, number, number]> =
      a.kind === 'joint' ? JOINT_SEGS[a.joint].map((g): [string, number, number] => [`${s}:${g}`, ...SEGMENTS[g](m)]) :
      a.kind === 'segment' ? (a.segment === 'shoulders' ? [['line:shoulders', L.shoulder, R.shoulder]] : a.segment === 'hips' ? [['line:hips', L.hip, R.hip]] : [[`${s}:${a.segment}`, ...SEGMENTS[a.segment](m)]]) : [];
    let r = 1;
    for (const [key, i, j] of segs) r = Math.min(r, this.inPlane(key, w[i]!, w[j]!, t));
    return Math.max(0, Math.min(1, (0.97 - r) / (0.97 - FILTER.minSegmentRatio)));
  }

  /**
   * World in-plane ratio cos(tilt) = |d_xy| / |d| of one segment, from its signed depth difference averaged over ≈ 0.4 s
   * (EMA). Monocular z jitter is zero-mean and averages out; a limb really turned into depth persists. Without the
   * average, z noise alone reads every limb as tilted and pulls in the noisy 3D angle, whose error near 180° is first
   * order. Updated once per frame per segment.
   */
  private inPlane(key: string, a: P, b: P, t: number): number {
    const e = this.depthEma(key, a, b, t), d = Math.hypot(e.dxy, e.dz);
    return d > 0 ? e.dxy / d : 1;
  }
  private depthEma(key: string, a: P, b: P, t: number): { dz: number; dxy: number; t: number } {
    const dz = (a.z ?? 0) - (b.z ?? 0), dxy = Math.hypot(a.x - b.x, a.y - b.y), prev = this.dzEma.get(key);
    if (prev?.t === t) return prev;
    const al = prev ? 1 - Math.exp(-Math.max(0, t - prev.t) / 400) : 1;
    const e = prev ? { dz: prev.dz + al * (dz - prev.dz), dxy: prev.dxy + al * (dxy - prev.dxy), t } : { dz, dxy, t };
    this.dzEma.set(key, e);
    return e;
  }

  private measure(a: AngleDef, p: P[], w: P[] | null, t: number, raw = false): { value: number; left?: number; right?: number } {
    const one = (s: 'left' | 'right', q: P[]): number => {
      const m = this.sideMap(s);
      if (a.kind === 'joint') { const [i, j, k] = JOINTS[a.joint](m); return jointAngle(q[i]!, q[j]!, q[k]!); }
      if (a.kind === 'segment') {
        const [i, j] =
          a.segment === 'shoulders' ? [L.shoulder, R.shoulder] :
          a.segment === 'hips' ? [L.hip, R.hip] : SEGMENTS[a.segment](m);
        return a.ref === 'vertical' ? vsVertical(q[i]!, q[j]!) : vsHorizontal(q[i]!, q[j]!);
      }
      const m2 = { feet: 'ankle', knees: 'knee', hands: 'wrist' } as const;
      const sw = Math.abs(q[L.shoulder]!.x - q[R.shoulder]!.x);
      return sw > 0 ? Math.abs(q[L[m2[a.what]]]!.x - q[R[m2[a.what]]]!.x) / sw : NaN;
    };
    // Spread stays 2D: numerator and denominator both scale with cos(yaw).
    const val = (s: 'left' | 'right'): number => {
      const v2 = one(s, p);
      if (!w || a.kind === 'spread') return v2;
      const v3 = one(s, w);
      if (!Number.isFinite(v3)) return v2;
      const key = `${a.id}:${s}`, prev = this.kBlend.get(key);
      let k = prev?.k ?? 0;
      if (!raw) {
        // EMA (τ 0.3 s) so a rep never steps when the source changes; raw readings reuse the filtered weight.
        const target = this.blendTarget(a, s, w, t);
        k = prev ? prev.k + (1 - Math.exp(-Math.max(0, t - prev.t) / 300)) * (target - prev.k) : target;
        this.kBlend.set(key, { k, t });
      }
      return Number.isFinite(v2) ? (1 - k) * v2 + k * v3 : v3;
    };
    const side = 'side' in a ? a.side ?? 'auto' : 'auto';
    if (a.kind === 'spread' || (a.kind === 'segment' && (a.segment === 'shoulders' || a.segment === 'hips'))) return { value: val('left') };
    if (side === 'both' || side === 'flexed' || side === 'extended') {
      // One side occluded (any point of its chain below 0.5, MediaPipe's own presence cut): use the other side only. An
      // occluded limb is a guess, often collapsed onto the near one, so it must not set a min/max or an average. (A chain
      // mean let a mostly occluded far leg in on ≈ 8 % of frames — beyond what a p95 − p5 range trims.)
      const cv = (s: 'left' | 'right') => Math.min(...this.chains({ ...a, side: s } as AngleDef)[0]!.map((i) => p[i]?.v ?? 0));
      const lv = cv('left'), rv = cv('right'), occ = FILTER.minVisibility;
      if (lv < occ !== rv < occ) return { value: val(lv < occ ? 'right' : 'left') };
      const l = val('left'), r = val('right');
      // ponytail: colours and foreshortening-gates both legs; pick the chosen side's chain if that greys out too much.
      return side === 'both' ? { value: (l + r) / 2, left: l, right: r } : { value: side === 'flexed' ? Math.min(l, r) : Math.max(l, r) };
    }
    return { value: val(side === 'auto' ? this.side : side) };
  }

  /**
   * Robust per-series noise (1 SD): 1.4826 × median |residual| (MAD; Hampel 1974, Rousseeuw & Croux 1993) over the last
   * 90 residuals (≈ 3 s) about a quadratic Savitzky-Golay fit (Savitzky & Golay 1964), ÷ √(1 − h₀), the residual
   * variance factor for white noise. The median ignores 1–2 frame glitches (left/right swaps, occluded-limb collapses),
   * which a mean of |residual| turned into 20–30° 'noise' allowances that hid a different exercise. The SG quadratic is
   * exact for cubics at its centre, so smooth motion barely leaks in (≈ 0.6 % of a 2.5 Hz swing's amplitude). 5 points on raw angles (white jitter); 9 points (`wide`) on the filtered driver, whose noise is correlated —
   * after the One Euro or an offline zero-phase filter a 5-point residual would miss most of it. A camera property, so it
   * survives tracking breaks.
   */
  private noise(key: string, t: number, v: number, wide = false): void {
    if (!Number.isFinite(v)) return;
    const n = wide ? 9 : 5, b = this.noiseBuf.get(key) ?? [];
    b.push([t, v]); if (b.length > n) b.shift();
    this.noiseBuf.set(key, b);
    // Skip windows spanning a tracking gap: steps up to 100 ms each (≥ 10 fps), so 15 fps still gets an estimate.
    if (b.length < n || b[n - 1]![0] - b[0]![0] > (n - 1) * 100) return;
    const y = b.map((x) => x[1]);
    // Quadratic SG smoothing weights: 5-point (−3 12 17 12 −3)/35, 9-point (−21 14 39 54 59 54 39 14 −21)/231.
    const w = wide ? [-21, 14, 39, 54, 59, 54, 39, 14, -21].map((k) => k / 231) : [-3, 12, 17, 12, -3].map((k) => k / 35);
    const c = y[n >> 1]!, fit = y.reduce((a, yi, i) => a + w[i]! * yi, 0);
    const rs = this.noiseRes.get(key) ?? [];
    rs.push(Math.abs(c - fit)); if (rs.length > 90) rs.shift();
    this.noiseRes.set(key, rs);
    this.noiseSd.delete(key); this.noiseK.set(key, 1.4826 / Math.sqrt(1 - w[n >> 1]!));
  }
  /** σ̂, computed on demand (a median per series per frame is the harness's main cost) and cached until the next residual. */
  private sigma(key: string): number {
    let v = this.noiseSd.get(key);
    if (v === undefined) { const rs = this.noiseRes.get(key); v = rs?.length ? this.noiseK.get(key)! * median(rs) : 0; this.noiseSd.set(key, v); }
    return v;
  }

  /** Framing judged on the counting-critical landmarks only: what the counter needs, not every angle the def draws. */
  private framing(p: P[]): string | null {
    if (p.length < 33) return 'Step into the frame';
    const need = new Set<number>(this.critPts);
    for (const a of this.critAngles) this.chains(a).flat().forEach((i) => need.add(i));
    if (!need.size) for (const a of this.def.angles) this.chains(a).flat().forEach((i) => need.add(i));
    const missing = [...need].filter((i) => !this.seen(p, i));
    const enough = this.critAngles.filter((a) => this.measurable(a, p)).length >= this.critNeed && this.critPts.every((i) => this.seen(p, i));
    if (missing.length === need.size) return 'Step into the frame';
    if (!enough) {
      const lower = missing.some((i) => i >= 25);
      const upper = missing.some((i) => i < 23);
      return lower && !upper ? 'Step back — show your legs and feet' : upper && !lower ? 'Step back — show your arms' : 'Step back — show your whole body';
    }
    const ys = [...need].map((i) => p[i]!.y);
    const span = Math.max(...ys) - Math.min(...ys);
    if (span > 0.97) return 'Move a little further away';
    return null;
  }

  /**
   * Reps on the driver normalised to the athlete's own range, u = (x − lo)/(hi − lo), x = running median of 5
   * (Tukey 1977; ≈ 67 ms lag, removes 1–2 frame spikes and left/right glitches). `s` flips 'low' rules.
   *  - hi: median of the last 3 crests (the latest while fewer), else the running max since tracking (re)started.
   *  - lo: seeded at hi − (catalog range), relative to the athlete's own top so an absolute camera bias cancels
   *    (change from a per-trial baseline is valid where absolute MediaPipe angles differ ≈ 19° from Vicon: Asaeda et
   *    al. 2024, Heliyon 10:e36338); the median of observed troughs takes over by the second trough.
   *  - crests/troughs by delta peak detection (Billauer peakdet, public domain), found whether or not a rep counts, so
   *    a stalled state machine recovers.
   *  - R_min = max(0.4 × catalog range, 3σ̂ raw, 8σ̂ filtered), for peaks and counting: jitter can't count; no absolute degree floor, so 10° drivers still count.
   * Hysteresis: leave the top below u 0.75, latch the extreme at u ≤ 0.55 and count on return above 0.80 (two-threshold
   * counters: PoseRAC; MediaPipe repetition counter). 0.55, not 0.25: partial reps are counted and flagged (a shallow
   * demo rep reaches u ≈ 0.45); depth judging stays on the absolute target.
   */
  private stepReps(t: number, v: Record<string, number>, fs: Set<string>): number {
    const rule = this.def.reps!;
    const d = v[rule.driver];
    if (d === undefined) return 0;
    const s = rule.start === 'high' ? 1 : -1;
    this.drv.push(d); if (this.drv.length > 5) this.drv.shift();
    const x = s * median(this.drv), target = s * rule.target;
    const rCat = s * rule.exit - s * rule.target;
    // Raw σ̂: x is One-Euro filtered and median-of-5 (≈ ¼ of the raw noise at rest), so 3σ̂ ≈ 12 SD of x. Filtered σ̂
    // (9-point): catches noise the raw estimate can't see, e.g. frames already low-passed offline.
    this.noise(`${rule.driver}~f`, t, d, true);
    // A full median window first: the filter's first output is the raw frame, and one noisy frame must not set the top.
    if (this.drv.length < 5) return 0;
    // 8σ̂_f: the filtered driver's p95 − p5 at rest measured ≈ 6–7 σ̂_f, since the 9-point residual misses its slow part
    // (correlated landmark wobble passes the One Euro untouched); at 6σ̂_f a still athlete on a noisy camera counted reps.
    const sx = 8 * this.sigma(`${rule.driver}~f`);
    // Also the floor a counted excursion must beat. (2σ̂ raw was not enough: on a still athlete the filtered driver's slow
    // wander, left after One Euro + median and invisible to residual estimates, made 1.8–2.9 σ̂ raw excursions that
    // counted as crunch, calf-raise and curl-up reps.)
    const rMin = Math.max(0.4 * rCat, 3 * this.sigma(rule.driver), sx);
    // Through the blend θ = (1 − k)θ₂ + kθ₃ the noise SD is √((1 − k)²σ₂² + k²σ₃²) (image and world landmarks taken as
    // independent estimates; propagation of independent errors, JCGM 100:2008 GUM §5.1). The raw
    // σ̂ is a 3 s median, dominated by in-plane (k ≈ 0) frames; a rep the blend measured in 3D, on monocular depth (the
    // noisiest axis), must beat that rep's own noise: the largest over the rep. 0 without world landmarks.
    const kd = Math.max(0, ...['left', 'right'].map((sd) => this.kBlend.get(`${rule.driver}:${sd}`)?.k ?? 0));
    if (this.repState === 'down') this.repNoise = Math.max(this.repNoise, Math.hypot((1 - kd) * this.sigma(`${rule.driver}~2`), kd * this.sigma(`${rule.driver}~3`)));
    // 3.3σ̂: p95 − p5 of a normal is 3.29σ, so a counted excursion beats the raw noise's own 90 % range.
    const rCount = Math.max(0.4 * rCat, 3.3 * Math.max(this.sigma(rule.driver), this.repNoise), sx);
    this.runMax = Math.max(this.runMax, x);
    if (x > this.envMax) { this.envMax = x; this.envMaxT = t; }
    this.envMin = Math.min(this.envMin, x);
    const keep3 = (xs: number[], y: number) => { xs.push(y); if (xs.length > 3) xs.shift(); };
    // Until three crests exist, the latest one is the top (adapts after one rep); then their median (robust to one outlier).
    const band = () => {
      const hi = this.crests.length >= 3 ? median(this.crests) : this.crests.length ? this.crests[this.crests.length - 1]! : this.runMax;
      const lo0 = hi - rCat;
      const lo = lo0 + Math.min(1, this.troughs.length / 2) * ((this.troughs.length ? median(this.troughs) : lo0) - lo0);
      return { hi, R: Math.max(hi - lo, rMin) };
    };
    if (this.lookCrest && x < this.envMax - rMin) {
      const b = band(), uCrest = (this.envMax - (b.hi - b.R)) / b.R;
      keep3(this.crests, this.envMax); this.envMin = x; this.lookCrest = false;
      // Stall fallback: the state machine is still 'down' with its extreme latched, but the athlete has already come back
      // up to a crest and left it — the top was lower than the bootstrap guess (e.g. a start pose taller than the rep
      // top). The excursion between that rep's start and this crest is the rep: complete it at the crest. Only when the
      // crest re-crosses the latch line by a margin (u > 0.6 > 0.55, hysteresis), or the rep started from a pose beyond
      // the catalog's top by more than any camera bias (≥ max(0.5 × range, 20°); ≈ 19°, Asaeda et al. 2024) — the
      // bootstrap guess was wrong (push jerk: arms down at 15°, then racked at 105°). Otherwise a pause or pulse partway
      // up a shallow rep (lunge at half depth: 107 → 134 → 106 → 170) is the same rep, not two.
      const wrongTop = this.repTop - s * rule.exit > Math.max(0.5 * rCat, 20);
      if (this.repState === 'down' && this.reached && this.envMaxT > this.extremeT && this.envMax - this.extreme >= rCount && (uCrest > 0.6 || wrongTop)) {
        this.topPeak = this.envMax;
        this.completeRep(this.envMaxT, s, target);
        this.topPeak = this.envMax; this.repReady = true; // the next rep starts from that crest
      }
    } else if (!this.lookCrest && x > this.envMin + rMin) { keep3(this.troughs, this.envMin); this.envMax = x; this.envMaxT = t; this.lookCrest = true; }
    const { hi, R } = band();
    // Measured from the top: when the noise floor widens R past hi − lo, the band grows downward, never above hi.
    const u = Math.max(0, Math.min(1, (x - (hi - R)) / R));
    this.atTop = this.repState === 'top' && u >= 0.8;
    if (this.repState === 'top') {
      this.topPeak = Math.max(this.topPeak, x);
      // The first rep after tracking (re)starts needs a settled start position (≥ 250 ms at the top): a noisy first frame
      // or a set-up movement into the start pose is not a rep. Later reps may turn straight around at the top.
      // Time at the top accumulates (frame gaps capped at 100 ms) rather than needing one unbroken run: under noise x
      // keeps dipping across the 0.8 line and an unbroken 250 ms never comes.
      const dtTop = Math.min(100, Math.max(0, t - this.topT)) || 0;
      this.topT = t;
      if (u >= 0.8) { this.lastTop = t; this.topAcc += dtTop; if (this.topAcc >= 250) this.repReady = true; }
      if (u < 0.75 && this.repReady) {
        this.repState = 'down'; this.reached = false; this.repTop = this.topPeak; this.repNoise = 0;
        // Rep starts at the last local maximum of the driver (descent onset), not the last frame at the top.
        const h = this.history.slice(this.segmentStart);
        let j = h.length - 1;
        const xs = (k: number) => { const dd = h[k]?.a[rule.driver]; return dd === undefined ? NaN : s * dd; };
        // Noise-tolerant (2σ̂ of the filtered driver; 0 on clean data, the exact local maximum): a jitter wiggle on the
        // way down must not end the walk early and shorten the rep below its minimum time.
        const tol = 2 * this.sigma(`${rule.driver}~f`);
        while (j > 0 && xs(j - 1) > xs(j) - tol && !(tol > 0 && xs(j) >= this.topPeak - tol)) j--;
        this.repStart = h.length ? h[j]!.t : this.lastTop || t;
        this.extreme = x; this.extremeT = t; this.extremeSnap = { ...v }; this.extremeFs = fs;
        this.repActive = this.def.checks.map(() => ({ good: 0, ok: 0, bad: 0, sum: 0, n: 0 }));
        for (const q of PROBES) this.probeVals[q] = [];
        this.planes = []; this.trunkSum = 0; this.repFrames = 0; this.shortCount = {};
        this.sampleProbes(h[h.length - 1]);
      }
      return 0;
    }
    if (x < this.extreme) { this.extreme = x; this.extremeT = t; this.extremeSnap = { ...v }; this.extremeFs = fs; }
    if (u <= 0.55) this.reached = true;
    this.sampleProbes(this.history[this.history.length - 1]);
    this.descending = x <= this.extreme + 0.05 * R;
    if (u >= 0.8) {
      // Back at the top: a rep only if the extreme was latched and the excursion beat the noise floor; otherwise an
      // aborted excursion — neither counted nor rejected.
      if (this.reached && this.topPeak - this.extreme >= rCount) this.completeRep(t, s, target);
      else { this.repState = 'top'; this.topPeak = x; }
      return 0;
    }
    return 1 - u;
  }

  /** Accumulate the movement signature for the rep in progress (side facing the camera). */
  private sampleProbes(f: Frame | undefined): void {
    if (!f) return;
    for (const q of PROBES) { const a = f.pr[`~${q}`]; if (a !== undefined) this.probeVals[q].push(a); }
    if (f.pl !== undefined) this.planes.push(f.pl);
    this.trunkSum += f.pr['~trunk'] ?? 0;
    this.repFrames++;
    for (const g of Object.keys(SEGMENTS) as SegKey[]) if (f.sh.has(`${this.side}:${g}`)) this.shortCount[g] = (this.shortCount[g] ?? 0) + 1;
  }

  /** Signature from accumulated samples (ROM = p95 − p5, plane = median), with this camera's probe noise. */
  private sigOf(vals: Record<Probe, number[]>, planes: number[], trunk: number, short: Partial<Record<SegKey, number>>, n: number): RepSignature {
    return {
      rom: Object.fromEntries(PROBES.map((q) => [q, range90(vals[q])])) as Record<Probe, number>,
      pose: Object.fromEntries(PROBES.map((q) => [q, vals[q].length ? median(vals[q]) : NaN])) as Record<Probe, number>,
      trunk: trunk / Math.max(1, n),
      outOfPlane: Object.fromEntries((Object.keys(SEGMENTS) as SegKey[]).map((g) => [g, (short[g] ?? 0) / Math.max(1, n)])) as Record<SegKey, number>,
      ...(planes.length ? { plane: median(planes) } : {}),
      noise: Object.fromEntries(PROBES.map((q) => [q, this.sigma(`~${q}`)])) as Record<Probe, number>,
    };
  }

  /** Movement signature over a span of tracked frames (hold windows, pre-event windows). */
  private windowSig(frames: Frame[]): RepSignature {
    const vals: Record<Probe, number[]> = { knee: [], hip: [], elbow: [], shoulder: [] };
    const planes: number[] = [];
    let trunk = 0;
    const short: Partial<Record<SegKey, number>> = {};
    for (const f of frames) {
      for (const q of PROBES) { const a = f.pr[`~${q}`]; if (a !== undefined) vals[q].push(a); }
      if (f.pl !== undefined) planes.push(f.pl);
      trunk += f.pr['~trunk'] ?? 0;
      for (const g of Object.keys(SEGMENTS) as SegKey[]) if (f.sh.has(`${this.side}:${g}`)) short[g] = (short[g] ?? 0) + 1;
    }
    return this.sigOf(vals, planes, trunk, short, frames.length);
  }

  /** Flag a movement that doesn't match the exercise: record it and alert for ~4 s. */
  private flagMismatch(t: number, why: string): void {
    this.mismatched.push({ tMs: t - this.startMs, reason: why });
    this.cue = why; this.cueT = t + 1500;
  }

  /**
   * Hold check every HOLD_WINDOW_MS of tracked frames. Windows held ≥ 90 % build the reference; any window that
   * doesn't match (other joints working, or a different body position while not holding) is flagged, and hold time
   * credited inside it is taken back.
   */
  private stepHoldWindow(t: number, holding: boolean, dt: number, last = false): void {
    if (Number.isNaN(this.holdWinStart)) { this.holdWinStart = t; this.holdWinMs = 0; this.holdWinHeld = 0; this.holdWinFrames = 0; }
    // dt is the hold credit actually given (median-based); `holding` is the instantaneous in-position frame.
    this.holdWinFrames++; this.holdWinMs += dt; if (holding) { this.holdWinHeld++; this.heldTs.add(t); }
    if (!last && t - this.holdWinStart < HOLD_WINDOW_MS) return;
    const inWin = this.history.filter((f) => f.t >= this.holdWinStart);
    const heldFrac = this.holdWinHeld / Math.max(1, this.holdWinFrames);
    // While holding, judge only the held frames: getting into or out of position is not a different exercise.
    const sig = this.windowSig(heldFrac >= 0.5 ? inWin.filter((f) => this.heldTs.has(f.t)) : inWin);
    if (heldFrac >= 0.9) this.sigs.push(sig);
    let cyc = false;
    if (this.checkMovement) {
      const ref = referenceSignature(this.def);
      // Not holding: only a clearly different body position counts as a wrong exercise (getting into position is fine).
      // Not holding: a clearly different body position, or ~6 s of continuous non-matching movement (two windows);
      // a single window is usually just getting into position.
      const moving = heldFrac < 0.5 ? movementMismatch(this.def, sig, ref) : null;
      this.unheldStrikes = moving ? this.unheldStrikes + 1 : 0;
      // Dropping out of and back into position repeatedly while joints move = doing reps, not holding. Judged over this
      // and the previous window (≈ 6 s): a squat cycle (≈ 3 s) re-enters the upright 'hold' about once per window.
      const span = Number.isNaN(this.prevWin.start) ? inWin : this.history.filter((f) => f.t >= this.prevWin.start);
      const cycling = this.holdEntries + this.prevWin.entries >= 2 ? movementMismatch(this.def, this.windowSig(span), ref) : null;
      cyc = !!cycling;
      const posture = ref && this.def.camera === 'side' && Math.abs(sig.trunk - ref.trunk) > TRUNK_SHIFT ? `Body position doesn't match ${this.def.name}` : null;
      // The session's last, partial window is judged for cycling only.
      const why = cycling ?? (last ? null : heldFrac >= 0.5 ? movementMismatch(this.def, sig, ref) : posture ?? (this.unheldStrikes >= 2 ? moving : null));
      if (why) {
        // Cycling also takes back the previous window's credit (the reps it spanned).
        const back = this.holdWinMs + (cycling ? this.prevWin.ms : 0);
        this.holdMs = Math.max(0, this.holdMs - back);
        this.holdRun = 0; this.bestHold = Math.min(this.bestHold, cycling && this.prevWin.ms ? this.prevWin.best : this.bestBeforeWin);
        this.holdWinMs = 0;
        this.flagMismatch(t, why);
      } else if (last && this.prevWin.cycled) {
        // A partial window straight after reps never established a hold: its credit is part of the same cycling.
        this.holdMs = Math.max(0, this.holdMs - this.holdWinMs);
        this.bestHold = Math.min(this.bestHold, this.bestBeforeWin);
      }
    }
    this.prevWin = { start: this.holdWinStart, entries: this.holdEntries, ms: this.holdWinMs, best: this.bestBeforeWin, cycled: cyc };
    this.bestBeforeWin = this.bestHold;
    this.holdWinStart = t; this.holdWinMs = 0; this.holdWinHeld = 0; this.holdWinFrames = 0; this.heldTs.clear(); this.holdEntries = 0;
  }

  /** Signatures of every completed rep (used to build an exercise's reference from its demo athlete). */
  signatures(): RepSignature[] { return this.sigs; }

  private completeRep(t: number, s: number, target: number): void {
    const rule = this.def.reps!;
    this.repState = 'top';
    const duration = t - this.repStart;
    const top = this.topPeak;
    this.topPeak = -Infinity;
    // Faster than the catalog's minimum rep time is a bounce or noise. (A softer 0.5× limit let 0.35–0.45 s landmark-noise
    // excursions on straight limbs count as push-ups on a still athlete; real reps are slower.)
    const minMs = rule.minRepMs ?? 600;
    if (duration < minMs) { this.rejected++; return; }
    const sig = { ...this.sigOf(this.probeVals, this.planes, this.trunkSum, this.shortCount, this.repFrames), ...(Number.isFinite(top) ? { drive: Math.abs(top - this.extreme) } : {}) };
    this.sigs.push(sig);
    if (this.checkMovement) {
      const why = movementMismatch(this.def, sig, referenceSignature(this.def));
      if (why) {
        // A different movement: don't count it, and tell the athlete right away.
        this.flagMismatch(t, why);
        return;
      }
    }
    const faults: string[] = [];
    let wsum = 0, score = 0;
    this.def.checks.forEach((c, i) => {
      const w = c.weight ?? 1;
      if (c.when === 'bottom') {
        const val = this.extremeSnap[c.angle];
        if (val === undefined) return;
        if (this.extremeFs.has(c.angle)) { this.excluded[i]!++; return; }
        const z = zoneOf(val, c.good, c.ok);
        const a = this.acc[i]!; a[z]++; a.sum += val; a.n++;
        score += w * W[z]; wsum += w;
        if (z !== 'good') faults.push(c.cue);
      } else if (c.when === 'active') {
        const r = this.repActive[i];
        if (!r || r.n === 0) return;
        const q = (r.good + 0.6 * r.ok) / r.n;
        score += w * q; wsum += w;
        if (r.bad / r.n > 0.25) faults.push(c.cue);
      }
    });
    const repScore = wsum ? score / wsum : 1;
    const fullRange = this.extreme <= target;
    const rec: RepRecord = {
      index: this.reps.length + 1,
      startMs: this.repStart - this.startMs,
      endMs: t - this.startMs,
      durationMs: duration,
      eccentricMs: this.extremeT - this.repStart,
      concentricMs: t - this.extremeT,
      extreme: s * this.extreme,
      rom: Number.isFinite(top) ? Math.abs(top - this.extreme) : 0,
      fullRange,
      score: repScore,
      valid: fullRange && repScore >= 0.5,
      faults: [...new Set(faults)],
      atExtreme: this.extremeSnap,
    };
    this.reps.push(rec);
  }

  // Events — throws (peak wrist speed), jumps (toe flight), apex (hip high point).
  private stepEvent(t: number, p: P[], w: P[] | null): void {
    const ev = this.def.event!;
    const h = this.segmentStart ? this.history.slice(this.segmentStart) : this.history;
    const n = h.length;
    // Running max of the shoulder-toe span: crouched/leaning throw postures shrink the per-frame span and inflate speed.
    // ponytail: session max, assumes roughly constant camera distance; switch to a decaying p95 if athletes move toward the camera.
    this.bodyHMax = Math.max(this.bodyHMax, Math.abs((p[L.foot]!.y + p[R.foot]!.y) / 2 - (p[L.shoulder]!.y + p[R.shoulder]!.y) / 2));
    if (w) this.bodyHMaxW = Math.max(this.bodyHMaxW, Math.abs((w[L.foot]!.y + w[R.foot]!.y) / 2 - (w[L.shoulder]!.y + w[R.shoulder]!.y) / 2));

    if (ev.trigger === 'wristPeak') {
      // Facing: toes point forward of the heels and the nose sits forward of the shoulders (side view; with world
      // landmarks also in depth, so a turned athlete still has a facing direction).
      this.flushRelease(t);
      const q = w ?? p;
      const fx = (k: 'x' | 'z') => (q[L.foot]![k] ?? 0) - (q[L.heel]![k] ?? 0) + (q[R.foot]![k] ?? 0) - (q[R.heel]![k] ?? 0) + (q[NOSE]![k] ?? 0) - ((q[L.shoulder]![k] ?? 0) + (q[R.shoulder]![k] ?? 0)) / 2;
      this.facingSum += fx('x'); this.facingZ += w ? fx('z') : 0;
      if (n < 3) return;
      // World (metres, hip-relative — fine for an arm action) when every frame used has it, else the image. Detection
      // runs on filtered points (raw jitter, monocular z above all, would swamp the prominence test); the release
      // direction on raw ones, since the adaptive filter lags x and y differently at speed and bends it.
      const world = !!(h[n - 3]!.wr && h[n - 1]!.wr);
      const pts = (f: Frame) => (world ? f.wr! : f.rp);
      const det = (f: Frame) => (world ? f.w! : f.pts);
      const bodyH = (world ? this.bodyHMaxW : this.bodyHMax) / 0.8 || 1;
      // Monocular depth is the noisiest world axis: weight it by σ̂_xy/σ̂_z (≤ 1), i.e. whiten the axes to the in-plane
      // noise (inverse-SD weighting), so z jitter can't fake or bury the speed peak. σ̂ from the raw shoulders.
      const wr = h[n - 1]!.wr;
      if (wr) for (const [i, k] of [[L.shoulder, 'l'], [R.shoulder, 'r']] as const) { this.noise(`~w${k}x`, t, wr[i]!.x); this.noise(`~w${k}z`, t, wr[i]!.z ?? 0); }
      const sxy = this.sigma('~wlx') + this.sigma('~wrx'), sz = this.sigma('~wlz') + this.sigma('~wrz');
      const wz = world && sz > 0.02 ? Math.min(1, Math.max(sxy, 0.01) / sz) : 1;
      const a = det(h[n - 3]!), b = det(h[n - 1]!), dt = (h[n - 1]!.t - h[n - 3]!.t) / 1000;
      if (dt <= 0) return;
      const speedOf = (i: number) => Math.hypot(b[i]!.x - a[i]!.x, b[i]!.y - a[i]!.y, wz * ((b[i]!.z ?? 0) - (a[i]!.z ?? 0))) / dt / bodyH;
      const wrist = speedOf(L.wrist) > speedOf(R.wrist) ? L.wrist : R.wrist;
      const sp = speedOf(wrist);
      const tk = h[n - 2]!.t;
      this.speeds.push([tk, sp]);
      while (this.speeds.length && this.speeds[0]![0] < tk - 1500) this.speeds.shift();
      if (sp > this.speedPeak) {
        this.speedPeak = sp; this.speedPeakFrame = n - 2; this.speedPeakWrist = wrist;
        // Prominence (as in scipy.signal.find_peaks): ≥ 3× the median speed of the second before, so landmark jitter can't
        // fire it.
        const before = this.speeds.filter(([ts]) => ts < tk && ts >= tk - 1000).map(([, v]) => v);
        // Needs ≥ 0.5 s of history: the filter's start-up transient isn't a release.
        this.speedPeakOk = this.speeds[0]![0] <= tk - 500 && sp >= 3 * median(before);
      }
      // Peak confirmed once speed falls to 55 % of a prominent peak of ≥ 1.5 body-heights/s that is a ballistic burst:
      // above half its peak for ≤ 0.54 s (demo releases 0.07–0.51 s even at 1.7× slower tempo; their wind-ups and
      // recovery swings ≥ 0.57 s), so a brisk arm swing isn't a throw.
      // ponytail: tuned on the demo athlete's throws; re-fit on real clips (real releases are faster, not slower).
      // It must also carry the hand ≥ 0.2 body heights (≈ 35 cm) from its quarter-max onset: jitter, however fast, goes
      // nowhere (demo strikes travel 0.21–0.64; noise-only peaks ≤ 0.18 at 2 % frame-height jitter).
      // Burst onset: back from the peak to half-max (its duration), then to quarter-max (where its travel starts).
      const onset = (): { t0: number; f0: Frame } | null => {
        let i = this.speeds.findIndex(([ts]) => ts >= h[this.speedPeakFrame]!.t);
        if (i < 0) return null;
        while (i > 0 && this.speeds[i - 1]![1] >= 0.5 * this.speedPeak) i--;
        const t0 = this.speeds[i]![0];
        while (i > 0 && this.speeds[i - 1]![1] >= 0.25 * this.speedPeak) i--;
        return { t0, f0: h.find((f) => f.t >= this.speeds[i]![0] - 34) ?? h[0]! };
      };
      const burst = () => {
        const o = onset();
        if (!o) return true;
        const p0 = det(o.f0)[this.speedPeakWrist]!, p1 = det(h[n - 1]!)[this.speedPeakWrist]!;
        const travel = Math.hypot(p1.x - p0.x, p1.y - p0.y, wz * ((p1.z ?? 0) - (p0.z ?? 0))) / bodyH;
        return tk - o.t0 <= 540 && travel >= 0.2;
      };
      if (this.speedPeak >= 1.5 && sp < 0.55 * this.speedPeak && h[this.speedPeakFrame]!.t - this.lastEventT > 1200) {
        const wi = this.speedPeakWrist; // the wrist that peaked, not whichever is faster at confirmation
        const fdir = Math.hypot(this.facingSum, this.facingZ) || 1;
        // World: facing known once its mean per-frame vector exceeds 2 cm (a front view sums to ~0); image: any sign.
        const facing = world ? Number(fdir / n > 0.02) : Math.sign(this.facingSum);
        // Central-difference wrist velocity at frame j: elevation (° above horizontal) and speed; the horizontal part is
        // signed toward the facing side. Facing unknown (front view, no world) → fall back to |horizontal|.
        // World points are hip-centred, so they miss the body's own velocity (run-up, glide, jump). Release angle is of the
        // absolute velocity, atan2(v_y, v_horizontal) (Linthorne 2001, J Sports Sci 19:359): add the camera-frame mid-hip
        // displacement back, in metres via the world/image body-height ratio (its depth part is unobservable; 0).
        const kM = world && this.bodyHMax > 0 ? this.bodyHMaxW / this.bodyHMax : 0;
        const hipD = (fa: Frame, fb: Frame, c: 'x' | 'y') => kM * ((fb.rp[L.hip]![c] + fb.rp[R.hip]![c]) - (fa.rp[L.hip]![c] + fa.rp[R.hip]![c])) / 2;
        // Central difference over ≥ ±33 ms (±1 frame at 30 fps, ±4 at 120): the chord of a circular arc is parallel to the
        // tangent at its midpoint, so a wider symmetric baseline adds no direction bias, while at high fps a ±1-frame
        // displacement is so short that landmark noise dominates its direction.
        const nb = (j: number, dir: 1 | -1) => { let i = Math.max(0, Math.min(n - 1, j + dir)); while (i > 0 && i < n - 1 && Math.abs(h[i]!.t - h[j]!.t) < 33) i += dir; return h[i]!; };
        const vel = (j: number) => {
          const fa = nb(j, -1), fb = nb(j, 1), pa = pts(fa)[wi]!, pb = pts(fb)[wi]!;
          const dx = pb.x - pa.x, dz = (pb.z ?? 0) - (pa.z ?? 0), dy = pb.y - pa.y;
          // Swing direction relative to the body (a wind-up stays a backward swing during a run-up); angle in the ground frame.
          const fwd = world ? (dx * this.facingSum + dz * this.facingZ) / fdir : facing * dx;
          const ax = dx + hipD(fa, fb, 'x'), ay = dy + hipD(fa, fb, 'y');
          const fwdA = world ? (ax * this.facingSum + dz * this.facingZ) / fdir : fwd;
          const horiz = world ? Math.hypot(ax, dz) : Math.abs(dx);
          return { fwd, ang: deg(Math.atan2(-ay, facing ? Math.sign(fwdA || 1) * horiz : horiz)), sp: Math.hypot(dx, dy, dz) / Math.max(1e-6, fb.t - fa.t) };
        };
        // The filtered peak lags the raw one by a frame or two: take the raw speed maximum next to it.
        let k = this.speedPeakFrame;
        const tp = h[k]!.t;
        for (let j = k; j > 1 && h[j - 1]!.t >= tp - 100; j--) if (vel(j - 1).sp > vel(k).sp) k = j - 1;
        if (k + 1 < n - 1 && h[k + 1]!.t <= tp + 40 && vel(k + 1).sp > vel(k).sp) k++;
        const [v0, v1, v2] = [vel(k - 1), vel(k), vel(k + 1)];
        // A release moves the hand toward the target: a wind-up or recovery swing (wrist moving backward) is not one.
        // Judged on the peak frame's velocity OR the net travel over the burst: an overarm release peaks at the top of
        // its arc, where the horizontal velocity crosses zero and its sign is noise.
        // From the onset (at least the frame before the peak: at 15 fps the burst can be one sample) to the frame after.
        const o = onset(), q0 = pts(o && o.f0.t < h[k - 1]!.t ? o.f0 : h[Math.max(0, k - 1)]!)[wi]!, q1 = pts(h[Math.min(n - 1, k + 1)]!)[wi]!;
        const fwdNet = world ? ((q1.x - q0.x) * this.facingSum + ((q1.z ?? 0) - (q0.z ?? 0)) * this.facingZ) / fdir : facing * (q1.x - q0.x);
          const fwd = v1.fwd > 0 || fwdNet > 0; // either: a jump shot's hand dips back over the burst yet leaves forward
        if ((!facing || fwd) && this.speedPeakOk && burst()) {
          // The true speed peak falls between frames: take the parabolic vertex of the speed and interpolate the direction
          // to it. The whole-frame angle is off by up to ω/(2·fps) (≈ 20° for a 21 rad/s arm swing at 30 fps).
          const c = v0.sp - 2 * v1.sp + v2.sp;
          const d = c < 0 ? Math.max(-0.5, Math.min(0.5, (v0.sp - v2.sp) / (2 * c))) : 0;
          const ang = v1.ang + d * (d > 0 ? v2.ang - v1.ang : v1.ang - v0.ang);
          // Held 1.2 s (the minimum spacing of two releases) before recording: the release is the fastest swing of the
          // action, so a faster one right after (the real release following a brisk wind-up) replaces it.
          if (!this.pendingRelease || this.speedPeak > this.pendingRelease.sp) this.pendingRelease = { f: h[k]!, ang, sp: this.speedPeak };
        } else if ((facing && !fwd) && this.pendingRelease && this.speedPeak > this.pendingRelease.sp) {
          // A faster backward swing right after: the pending forward swing was a counter-movement, not the release.
          this.pendingRelease = null;
        }
        this.speedPeak = 0;
      }
      if (sp < 0.5) this.speedPeak = 0;
      return;
    }

    const nf = this.def.camera === 'side' ? this.sideMap(this.side).foot : undefined;
    const toeY = lowerToe(p, nf);
    const hipY = (p[L.hip]!.y + p[R.hip]!.y) / 2;
    const legLen = Math.abs(toeY - hipY) || 0.3;

    if (ev.trigger === 'jump') {
      if (this.feetStale) { this.staleT = t; return; } // no toe observation this frame (see push)
      // Ground = median lower-toe y over the last 0.5 s of grounded frames, re-evaluated every grounded frame, so
      // walking or camera drift between jumps is followed and the rising toe-roll frames before take-off can't bias it.
      const grounded = Number.isNaN(this.airborneSince);
      if (grounded) {
        while (this.groundBuf.length && this.groundBuf[0]![0] < t - 500) this.groundBuf.shift();
        this.groundY = this.groundBuf.length ? median(this.groundBuf.map((g) => g[1])) : toeY;
      } else if (t - this.airborneSince > 1200) {
        // Longer than any real flight: the ground line moved (athlete stepped back), not a jump. Re-baseline on the
        // last 0.5 s of toe positions and resume.
        this.airborneSince = NaN;
        this.groundBuf = h.filter((f) => f.t >= t - 500).map((f) => [f.t, lowerToe(f.pts, nf)]);
        this.groundY = median(this.groundBuf.map((g) => g[1]));
        return;
      }
      const up = this.groundY - toeY;
      // Airborne: toes above ground by 8 % of leg length and by 3σ̂ of the raw toe height's per-frame noise, so a still
      // athlete on a noisy camera can't take off (heavy jitter alone reached the 8 % gate).
      this.noise('~toe', t, lowerToe(h[n - 1]!.rp, nf));
      const gate = Math.max(0.08 * legLen, 3 * this.sigma('~toe'));
      const air = up > gate;
      if (!air && grounded) this.groundBuf.push([t, toeY]);
      // Toes on the ground line (raw: the filtered toe lags take-off), within 2 % of leg length / ¾σ̂.
      if (grounded && this.groundY - lowerToe(h[n - 1]!.rp, nf) < gate / 4) this.flatT = t;
      if (air && grounded) { this.airborneSince = t; this.airSamples = []; }
      const rawUp = this.groundY - lowerToe(h[n - 1]!.rp, nf);
      if (air && rawUp > gate) this.airSamples.push([t, rawUp]);
      // Record an attempt. Height h = g·t²/8 (Bosco, Luhtanen & Komi 1983) only for a vertical jump that lands on the
      // take-off level: a horizontal jump (broad jump: take-off band well below vertical) or a landing on a box breaks
      // the symmetric-flight assumption, so those keep form/take-off scoring but get no height.
      const vertical = (ev.releaseAngle?.good[1] ?? 90) >= 60;
      const land = (takeoff: number, flight: number, sameLevel: boolean) => {
        if (flight < 120 || flight > 1200 || takeoff - this.lastEventT <= 800) return;
        const k = h.findIndex((f) => f.t >= takeoff);
        const i0 = Math.max(0, k - 2);
        const hp = (f: P[]) => ({ x: (f[L.hip]!.x + f[R.hip]!.x) / 2, y: (f[L.hip]!.y + f[R.hip]!.y) / 2 });
        // Raw landmarks, as in the throw path: filter lag bends the take-off direction.
        const a = hp(h[i0]!.rp), b = hp(h[Math.min(h.length - 1, k + 1)]!.rp);
        const rec = this.recordEvent('jump', takeoff, h[Math.max(0, k)]!, deg(Math.atan2(a.y - b.y, Math.abs(b.x - a.x))));
        rec.flightMs = flight;
        if (vertical && sameLevel) rec.jumpHeightCm = (9.81 * (flight / 1000) ** 2 / 8) * 100;
      };
      if (!air && !Number.isNaN(this.airborneSince)) {
        // The 8 % gate trims ~t_th at both ends (≈ -25 % height at 30 cm). Recover true contact instants by fitting
        // a parabola to the raw airborne toe heights and solving up(t) = 0.
        let flight = t - this.airborneSince;
        let takeoff = this.airborneSince;
        const fit = parabolaRoots(this.airSamples);
        // Take-off unobserved (feet blurred: stepEvent skipped them after the last flat-footed frame): the root is
        // extrapolated from the descent alone (+3–5 % height), so bound it by observation — no earlier than the last frame
        // seen flat on the ground.
        const t0 = this.staleT > this.flatT ? this.flatT : -Infinity;
        if (fit && fit[1] - fit[0] >= flight * 0.8 && fit[1] - fit[0] <= flight + 300) { takeoff = Math.max(fit[0], t0); flight = fit[1] - takeoff; }
        this.airborneSince = NaN;
        land(takeoff, flight, true);
      } else if (air && !grounded && t - this.airborneSince > 250) {
        // Landed on a raised surface (box jump): the toes stay still above the old ground line for 200 ms. A free
        // flight can't do that: even around the apex the toes fall g·(0.1 s)²/2 ≈ 5 cm, vs the 2 %-of-leg (≈ 2 cm) gate.
        const recent = h.filter((f) => f.t >= t - 200);
        const ys = recent.map((f) => lowerToe(f.pts, nf));
        if (recent.length >= 4 && Math.max(...ys) - Math.min(...ys) < 0.02 * legLen) {
          const takeoff = this.airborneSince;
          this.airborneSince = NaN;
          this.groundBuf = recent.map((f, i) => [f.t, ys[i]!]);
          this.groundY = median(ys);
          land(takeoff, recent[0]!.t - takeoff, false);
        }
      }
      return;
    }

    // hipPeak: local minimum of hip y with prominence ≥ 10 % leg length
    if (n < 5) return;
    const hy = (f: P[]) => (f[L.hip]!.y + f[R.hip]!.y) / 2;
    const mid = h[n - 3]!;
    const m = hy(mid.pts);
    const isMin = [n - 5, n - 4, n - 2, n - 1].every((i) => hy(h[i]!.pts) >= m);
    const recent = h.slice(Math.max(0, n - 45)).map((f) => hy(f.pts));
    if (isMin && Math.max(...recent) - m > 0.1 * legLen && mid.t - this.lastEventT > 1000) this.recordEvent('apex', mid.t, mid);
  }

  /** A missing pose must not join two independent movements or keep resources in the filter alive. */
  private flushRelease(t = Infinity): void {
    const r = this.pendingRelease;
    // Held 1.5 s, longer than the 1.2 s minimum spacing, so a noise peak just before a wind-up can't be recorded and
    // then block the real (faster) release that follows within 1.2 s.
    if (r && t - r.f.t > 1500) { this.pendingRelease = null; this.recordEvent('release', r.f.t, r.f, r.ang, r.sp); }
  }

  private breakTracking(): void {
    this.flushRelease();
    this.segmentStart = this.history.length;
    this.filters.clear();
    this.previousTracked = false;
    this.repState = 'top'; this.repReady = false; this.repActive = []; this.topPeak = -Infinity; this.lastTop = 0;
    this.drv = []; this.runMax = -Infinity; this.topAcc = 0; this.topT = NaN; this.envMax = -Infinity; this.envMin = Infinity; this.lookCrest = true;
    this.crests = []; this.troughs = []; this.reached = false;
    this.worldFilters.clear(); this.kBlend.clear(); this.dzEma.clear(); this.lastGood.clear(); this.holdBuf.clear(); this.inPosT = NaN;
    this.holdRun = 0; this.holdWinStart = NaN; this.holdWinMs = 0; this.holdWinHeld = 0;
    this.holdWinFrames = 0; this.holdEntries = 0; this.wasOut = true; this.heldTs.clear(); this.prevWin = { start: NaN, entries: 0, ms: 0, best: 0, cycled: false };
    this.bestBeforeWin = this.bestHold;
    this.airborneSince = NaN; this.groundY = NaN; this.groundBuf = []; this.airSamples = [];
    this.speedPeak = 0; this.speedPeakFrame = -1; this.facingSum = 0; this.facingZ = 0; this.speeds = [];
    this.eventZones = []; this.eventZonesT = -1e9;
  }

  private recordEvent(kind: EventRecord['kind'], tAbs: number, atFrame: Frame, releaseAngle?: number, peakSpeed?: number): EventRecord {
    const at = atFrame.a;
    this.lastEventT = tAbs;
    const faults: string[] = [];
    let wsum = 0, score = 0;
    const win = this.history.slice(this.segmentStart).filter((f) => f.t >= tAbs - 1500 && f.t <= tAbs);
    const sig = this.windowSig(win);
    this.sigs.push(sig);
    const why = this.checkMovement ? movementMismatch(this.def, sig, referenceSignature(this.def)) : null;
    if (why) {
      this.flagMismatch(tAbs, why);
      return { index: this.events.length + 1, tMs: tAbs - this.startMs, kind, score: 0, faults: [why], atEvent: at };
    }
    this.eventZones = this.def.checks.map(() => null);
    this.eventZonesT = this.lastMs;
    // Deepest countermovement = frame of minimum knee (else hip) angle in the window.
    const depthId = (this.def.angles.find((a) => a.kind === 'joint' && a.joint === 'knee') ?? this.def.angles.find((a) => a.kind === 'joint' && a.joint === 'hip'))?.id;
    let deepest: Frame | null = null;
    if (depthId) for (const f of win) if (f.a[depthId] !== undefined && !f.fs.has(depthId) && (!deepest || f.a[depthId]! < deepest.a[depthId]!)) deepest = f;
    this.def.checks.forEach((c, i) => {
      let val: number | undefined;
      if (c.when === 'release') {
        if (atFrame.fs.has(c.angle)) { this.excluded[i]!++; return; }
        val = at[c.angle];
      } else if (c.when === 'bottom') {
        if (deepest) {
          if (deepest.fs.has(c.angle)) { this.excluded[i]!++; return; }
          val = deepest.a[c.angle];
        } else {
          const vals = win.filter((f) => !f.fs.has(c.angle)).map((f) => f.a[c.angle]).filter((x): x is number => x !== undefined);
          if (vals.length) val = Math.min(...vals);
        }
      } else return;
      if (val === undefined) return;
      const z = zoneOf(val, c.good, c.ok);
      const a = this.acc[i]!; a[z]++; a.sum += val; a.n++;
      this.eventZones[i] = z;
      score += (c.weight ?? 1) * W[z]; wsum += c.weight ?? 1;
      if (z !== 'good') faults.push(c.cue);
    });
    let releaseZone: Zone | undefined;
    const ra = this.def.event?.releaseAngle;
    if (ra && releaseAngle !== undefined) {
      releaseZone = zoneOf(releaseAngle, ra.good, ra.ok);
      score += W[releaseZone]; wsum += 1;
      if (releaseZone !== 'good') faults.push(releaseAngle < ra.good[0] ? 'Release higher — aim up' : 'Release flatter — push forward');
    }
    const rec: EventRecord = {
      index: this.events.length + 1,
      tMs: tAbs - this.startMs,
      kind,
      releaseAngle,
      releaseZone,
      peakSpeed,
      score: wsum ? score / wsum : 1,
      faults,
      atEvent: at,
    };
    this.events = [...this.events, rec];
    return rec;
  }

  private runningScore(): number {
    let wsum = 0, s = 0;
    this.def.checks.forEach((c, i) => {
      const a = this.acc[i]!;
      const n = a.good + a.ok + a.bad;
      if (!n) return;
      const w = c.weight ?? 1;
      s += w * (a.good + 0.6 * a.ok) / n; wsum += w;
    });
    return wsum ? Math.round((100 * s) / wsum) : 0;
  }

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  finish(): SessionReport {
    this.flushRelease();
    if (this.def.mode === 'hold' && this.lastTrackedT - this.holdWinStart >= 1000) this.stepHoldWindow(this.lastTrackedT, false, 0, true);
    const def = this.def;
    const durMs = Number.isFinite(this.lastMs - this.startMs) ? this.lastMs - this.startMs : 0;
    const dur = durMs / 1000;
    const labelOf = (id: string) => def.angles.find((a) => a.id === id)?.label ?? id;

    const angles: Record<string, AngleStat> = {};
    for (const a of def.angles) {
      const xs = this.history.map((f) => f.a[a.id]).filter((x): x is number => x !== undefined);
      if (!xs.length) continue;
      // In-plane jitter: residual of raw angle about a 5-point quadratic Savitzky-Golay fit (removes motion curvature),
      // scaled by 1/sqrt(18/35) — the residual variance factor for white noise. Windows spanning a tracking gap are skipped.
      const hs = this.history, resid: number[] = [];
      for (let i = 2; i + 2 < hs.length; i++) {
        const w = [-2, -1, 0, 1, 2].map((d) => hs[i + d]!.raw[a.id]);
        if (w.some((x) => x === undefined) || hs[i + 2]!.t - hs[i - 2]!.t > 400) continue; // ≤ 100 ms steps, as noise()
        const [m2, m1, c, p1, p2] = w as number[];
        resid.push(c! - (-3 * m2! + 12 * m1! + 17 * c! + 12 * p1! - 3 * p2!) / 35);
      }
      angles[a.id] = { label: a.label, mean: mean(xs), sd: sd(xs), min: Math.min(...xs), max: Math.max(...xs), noise: resid.length > 1 ? sd(resid) / Math.sqrt(18 / 35) : 0 };
    }

    const checks: CheckStat[] = def.checks.map((c, i) => {
      const a = this.acc[i]!;
      const n = a.good + a.ok + a.bad;
      return {
        angle: c.angle, label: labelOf(c.angle), when: c.when, cue: c.cue, why: c.why, good: c.good, ok: c.ok,
        samples: n,
        pctGood: n ? (100 * a.good) / n : 0,
        pctOk: n ? (100 * a.ok) / n : 0,
        pctBad: n ? (100 * a.bad) / n : 0,
        mean: a.n ? a.sum / a.n : NaN,
        excluded: this.excluded[i]!,
      };
    });

    const symmetry: Record<string, number> = {};
    for (const [k, xs] of Object.entries(this.sym)) symmetry[k] = mean(xs);

    let reps: SessionReport['reps'];
    if (def.mode === 'reps' && def.reps) {
      const list = this.reps;
      const durs = list.map((r) => r.durationMs / 1000);
      const roms = list.map((r) => r.rom);
      const firstT = list[0]?.startMs ?? 0, lastT = list[list.length - 1]?.endMs ?? 0;
      const span = (lastT - firstT) / 1000;
      // Mean concentric angular velocity proxy: driver travel from the extreme back to `exit` over the concentric time.
      // Full-range reps only: a partial rep's shorter travel would read as a velocity drop.
      const vel = list.filter((r) => r.fullRange).map((r) => Math.abs(def.reps!.exit - r.extreme) / Math.max(1e-3, r.concentricMs / 1000));
      const vFirst = mean(vel) - slope(vel) * (vel.length - 1) / 2, vLast = mean(vel) + slope(vel) * (vel.length - 1) / 2;
      reps = {
        count: list.length,
        valid: list.filter((r) => r.valid).length,
        partial: list.filter((r) => !r.fullRange).length,
        rejected: this.rejected,
        mismatched: this.mismatched,
        perMin: span > 0 ? (list.length / span) * 60 : 0,
        perSec: span > 0 ? list.length / span : 0,
        avgDurationSec: mean(durs),
        avgEccentricSec: mean(list.map((r) => r.eccentricMs / 1000)),
        avgConcentricSec: mean(list.map((r) => r.concentricMs / 1000)),
        romMean: mean(roms),
        romSd: sd(roms),
        tutSec: durs.reduce((a, b) => a + b, 0),
        consistencyCv: mean(roms) ? (100 * sd(roms)) / mean(roms) : 0,
        fatigueSlopePct: list.length >= 3 ? (100 * slope(durs) * (durs.length - 1)) / (mean(durs) || 1) : 0,
        velocityLossPct: vel.length >= 3 && vFirst > 0 ? 100 * (1 - vLast / vFirst) : 0,
        romDropDeg: list.length >= 3 ? -slope(roms) * (roms.length - 1) : 0,
        list,
        target: def.reps.target,
        driverLabel: labelOf(def.reps.driver),
      };
    }

    let hold: SessionReport['hold'];
    if (def.mode === 'hold') {
      const stability: Record<string, number> = {};
      def.checks.filter((c) => c.when === 'hold').forEach((c) => { if (angles[c.angle]) stability[c.angle] = angles[c.angle]!.sd; });
      hold = { totalSec: this.holdMs / 1000, bestSec: this.bestHold / 1000, targetSec: def.hold?.targetSec ?? 30, stability };
    }

    let formScore = this.runningScore();
    if (reps && reps.count) formScore = Math.round(0.7 * formScore + 30 * (reps.valid / reps.count));
    if (def.mode === 'event' && this.events.length) formScore = Math.round(100 * mean(this.events.map((e) => e.score)));
    const completedAttempts = reps?.count ?? (hold ? Number(hold.totalSec > 0) : this.events.length);
    const scoredSamples = checks.reduce((sum, c) => sum + c.samples, 0);
    const assessmentStatus = this.tracked > 0 && completedAttempts > 0 && scoredSamples > 0 ? 'assessed' : 'insufficient-evidence';
    if (assessmentStatus !== 'assessed') formScore = 0;
    const grade = assessmentStatus !== 'assessed' ? 'N/A' : formScore >= 90 ? 'A' : formScore >= 80 ? 'B' : formScore >= 70 ? 'C' : formScore >= 60 ? 'D' : 'F';

    const driver = def.reps?.driver ?? def.checks[0]?.angle ?? def.angles[0]?.id ?? '';
    const step = Math.max(1, Math.ceil(this.history.length / 400));
    const series = this.history
      .filter((_, i) => i % step === 0)
      .filter((f) => f.a[driver] !== undefined)
      .map((f) => ({ t: (f.t - this.startMs) / 1000, v: Math.round(f.a[driver]! * 10) / 10 }));

    const report: SessionReport = {
      mismatched: this.mismatched,
      exerciseId: def.id,
      name: def.name,
      mode: def.mode,
      startedAt: new Date(Date.now() - durMs).toISOString(),
      durationSec: dur,
      frames: this.frames,
      fps: dur > 0 ? (this.frames - 1) / dur : 0, // N frames span N − 1 intervals
      trackedPct: this.frames ? (100 * this.tracked) / this.frames : 0,
      foreshortenedPct: this.tracked ? (100 * this.fsFrames) / this.tracked : 0,
      reps,
      hold,
      events: def.mode === 'event' ? this.events : undefined,
      angles,
      checks,
      symmetry,
      formScore,
      grade,
      assessmentStatus,
      validity: { protocolId: def.id === 'countermovement-jump' ? 'cmj-hands-on-hips-v1' : def.id === 'sai-vertical-jump' ? 'cmj-arm-swing-v1' : def.id, modelVersion: 'motion-2026-10-27-3d', attemptedFrames: this.frames, trackedFrames: this.tracked, longestGapMs: this.longestGapMs, completedAttempts, scoredSamples },
      kcal: this.weightKg ? (def.met * 3.5 * this.weightKg / 200) * (dur / 60) : null,
      insights: [],
      series,
    };
    report.insights = buildInsights(def, report);
    return report;
  }
}

// ---------------------------------------------------------------------------
// Coaching report
// ---------------------------------------------------------------------------

export function buildInsights(def: ExerciseDef, r: SessionReport): CoachInsight[] {
  const out: CoachInsight[] = [];
  const f1 = (x: number) => (Math.round(x * 10) / 10).toString();

  if (r.assessmentStatus === 'insufficient-evidence') out.push({ level: 'warn', title: 'Insufficient evidence', detail: 'No completed movement with measurable form checks was recorded. Retest with your whole body visible.' });
  if (r.trackedPct < 70) out.push({ level: 'warn', title: 'Camera could not see you clearly', detail: `Body was tracked in ${Math.round(r.trackedPct)} % of frames. Place the camera ${def.camera === 'side' ? 'side-on' : 'facing you'} at hip height, 2–3 m away, with your whole body and good light.` });

  const mm = r.mismatched ?? [];
  if (mm.length) out.push({ level: 'bad', title: `${mm.length} ${r.mode === 'reps' ? 'movement' : r.mode === 'hold' ? 'stretch' : 'attempt'}${mm.length > 1 ? 's' : ''} didn't match ${def.name} and ${mm.length > 1 ? 'were' : 'was'} not counted`, detail: `${mm[0]!.reason}. Stick to one exercise per session, or pick the exercise you're actually doing.` });
  if (r.foreshortenedPct > 20) out.push({ level: 'warn', title: `Limbs were turned away from the camera in ${Math.round(r.foreshortenedPct)} % of frames`, detail: `Those readings were greyed out and left out of the score: a 2D angle is only valid when the limb moves parallel to the screen. ${def.camera === 'side' ? 'Film exactly side-on, camera perpendicular to the direction you face' : 'Face the camera squarely and keep the movement in that plane'}, 2–3 m away at hip height.` });

  const rp = r.reps;
  if (rp) {
    if (rp.count === 0) out.push({ level: 'warn', title: 'No reps detected', detail: `Move through a bigger, controlled range of ${rp.driverLabel.toLowerCase()} and return fully to the start position each rep.` });
    if (rp.partial > 0) out.push({ level: rp.partial / Math.max(1, rp.count) > 0.3 ? 'bad' : 'warn', title: `${rp.partial} of ${rp.count} reps were short of full range`, detail: `Target ${rp.driverLabel.toLowerCase()} ${def.reps!.start === 'high' ? '≤' : '≥'} ${rp.target}°. Reduce the load or slow down until every rep reaches it — partial reps build less strength through the full range.` });
    if (rp.rejected > 0) out.push({ level: 'warn', title: `${rp.rejected} movements were too fast to count`, detail: 'Bounces far quicker than a controlled rep were discarded. Control every rep.' });
    if (rp.count >= 3 && rp.avgEccentricSec < 1) out.push({ level: 'warn', title: 'Lowering phase is rushed', detail: `Average eccentric ${f1(rp.avgEccentricSec)} s. A 2–3 s controlled lowering increases time under tension and reduces injury risk.` });
    if (rp.count >= 4 && rp.velocityLossPct > 20) out.push({ level: 'warn', title: `Concentric velocity fell ${Math.round(rp.velocityLossPct)} % across the set`, detail: 'Velocity loss above 20 % signals accumulating fatigue. For strength, stop the set here and rest 2–3 min; for endurance, this is your working limit.' });
    if (rp.count >= 4 && rp.romDropDeg > 10) out.push({ level: 'warn', title: `Range dropped ${Math.round(rp.romDropDeg)}° by the last rep`, detail: 'Form broke down with fatigue. End sets when range starts to shrink.' });
    if (rp.count >= 3 && rp.consistencyCv > 15) out.push({ level: 'warn', title: 'Inconsistent range between reps', detail: `ROM varied by ${Math.round(rp.consistencyCv)} % (CV). Pick a fixed depth cue and hit it every rep.` });
  }

  if (r.hold) {
    const h = r.hold;
    if (h.bestSec < h.targetSec) out.push({ level: h.bestSec < h.targetSec / 2 ? 'bad' : 'warn', title: `Best hold ${f1(h.bestSec)} s of ${h.targetSec} s target`, detail: 'Build up by adding 5–10 s per session, or split into sets with short rests.' });
    else out.push({ level: 'good', title: `Target hold reached (${f1(h.bestSec)} s)`, detail: 'Increase the target by 10–15 s or use a harder variation.' });
    for (const [id, s] of Object.entries(h.stability)) if (s > 6) out.push({ level: 'warn', title: `${r.angles[id]?.label ?? id} wobbled ±${f1(s)}°`, detail: 'Brace the core and fix your gaze on one point to steady the position.' });
  }

  if (r.events) {
    if (r.events.length === 0) out.push({ level: 'warn', title: 'No attempt detected', detail: def.event?.trigger === 'jump' ? 'Make sure both feet stay in frame and leave the ground.' : 'Perform the full movement at speed with the throwing arm visible.' });
    const jumps = r.events.filter((e) => e.jumpHeightCm !== undefined);
    if (jumps.length) {
      const best = Math.max(...jumps.map((e) => e.jumpHeightCm!));
      out.push({ level: 'good', title: `Best jump ${f1(best)} cm (flight-time method)`, detail: 'h = g·t²/8 from toe-off to toe-contact. Land with the same leg posture you took off in, or the estimate reads high.' });
    }
    const ra = def.event?.releaseAngle;
    const rel = r.events.filter((e) => e.releaseAngle !== undefined);
    if (ra && rel.length) {
      const m = mean(rel.map((e) => e.releaseAngle!));
      if (m < ra.good[0] || m > ra.good[1]) out.push({ level: 'warn', title: `Average release angle ${Math.round(m)}°`, detail: `Optimal window is ${ra.good[0]}–${ra.good[1]}°. ${m < ra.good[0] ? 'Drive the implement up and through — you are releasing too flat.' : 'You are releasing too steep — drive forward through the block.'}` });
      else out.push({ level: 'good', title: `Release angle on target (${Math.round(m)}°)`, detail: 'Keep this and work on release speed.' });
    }
  }

  const bad = [...r.checks].filter((c) => c.samples > 0).sort((a, b) => b.pctBad - a.pctBad);
  for (const c of bad) {
    if (c.pctBad >= 25) out.push({ level: 'bad', title: `${c.cue}`, detail: `${c.label} was out of range ${Math.round(c.pctBad)} % of the time (avg ${Math.round(c.mean)}°, target ${c.good[0]}–${c.good[1]}${c.label.toLowerCase().includes('width') || c.label.toLowerCase().includes('spread') ? '×' : '°'}). ${c.why ?? ''}`.trim() });
    else if (c.pctBad + c.pctOk >= 40) out.push({ level: 'warn', title: `${c.cue}`, detail: `${c.label} was only ${Math.round(c.pctGood)} % in the ideal range. ${c.why ?? ''}`.trim() });
  }

  for (const [id, d] of Object.entries(r.symmetry)) if (d > 10) out.push({ level: 'warn', title: `Left/right difference of ${Math.round(d)}° at ${r.angles[id]?.label.toLowerCase() ?? id}`, detail: 'Asymmetry above 10–15 % is linked to injury risk. Add unilateral work for the weaker side.' });

  if (r.formScore >= 85 && r.trackedPct >= 70 && (r.reps?.count ?? r.events?.length ?? 1) > 0) out.push({ level: 'good', title: out.some((i) => i.level !== 'good') ? 'Strong technique overall — polish the points above' : 'Excellent technique', detail: def.mode === 'reps' ? 'Progress by adding 2.5–5 % load or 1–2 reps next session.' : 'Keep practising at this quality and increase intensity gradually.' });
  return out;
}

/** Least-squares parabola through (t, up) samples; returns its two up = 0 roots, or null if not a downward parabola. */
function parabolaRoots(pts: Array<[number, number]>): [number, number] | null {
  if (pts.length < 3) return null;
  const t0 = pts[0]![0];
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
  for (const [tt, y] of pts) { const x = (tt - t0) / 1000; s0++; s1 += x; s2 += x * x; s3 += x ** 3; s4 += x ** 4; y0 += y; y1 += x * y; y2 += x * x * y; }
  // Normal equations [s4 s3 s2; s3 s2 s1; s2 s1 s0]·[a b c] = [y2 y1 y0], solved by Cramer's rule.
  const det3 = (m: number[]) => m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
  const D = det3([s4, s3, s2, s3, s2, s1, s2, s1, s0]);
  if (Math.abs(D) < 1e-12) return null;
  const a = det3([y2, s3, s2, y1, s2, s1, y0, s1, s0]) / D;
  const b = det3([s4, y2, s2, s3, y1, s1, s2, y0, s0]) / D;
  const c = det3([s4, s3, y2, s3, s2, y1, s2, s1, y0]) / D;
  const disc = b * b - 4 * a * c;
  if (!(a < 0) || disc <= 0) return null;
  const q = Math.sqrt(disc);
  const r1 = (-b + q) / (2 * a), r2 = (-b - q) / (2 * a);
  return [t0 + 1000 * Math.min(r1, r2), t0 + 1000 * Math.max(r1, r2)];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
/** Least-squares slope per index. */
function slope(ys: number[]): number {
  const n = ys.length; if (n < 2) return 0;
  const mx = (n - 1) / 2, my = mean(ys);
  let num = 0, den = 0;
  ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
  return num / den;
}
