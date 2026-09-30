/**
 * Motion session engine — interprets an `ExerciseDef` over a stream of pose
 * frames and produces live per-joint feedback plus a scientific session report.
 *
 * Measurement choices (see paper §III):
 *  - 2D angles in the image plane with x scaled by the frame aspect ratio.
 *    MediaPipe z is not used — it is a weak monocular guess.
 *  - One Euro filtering of landmarks (Casiez et al., CHI 2012) for low lag at
 *    speed and low jitter at rest.
 *  - Schmitt-trigger rep counting with a minimum rep time (Good-GYM, nitro-pose).
 *  - Jump height from flight time, h = g·t²/8, take-off/landing from the toes.
 */

import type { PoseFrame } from '../jump/types.js';
import type { AngleDef, Check, ExerciseDef, Range, SegmentName } from './types.js';

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

interface P { x: number; y: number; v: number }

const deg = (r: number) => (r * 180) / Math.PI;

function jointAngle(a: P, b: P, c: P): number {
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const n = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (n === 0) return NaN;
  return deg(Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / n))));
}

/** Angle of a→b against straight up (image y grows downward). */
function vsVertical(a: P, b: P): number {
  return deg(Math.atan2(Math.abs(b.x - a.x), a.y - b.y)) ;
}
function vsHorizontal(a: P, b: P): number {
  const t = deg(Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)));
  return t;
}

export const zoneOf = (v: number, good: Range, ok: Range): Zone =>
  v >= good[0] && v <= good[1] ? 'good' : v >= ok[0] && v <= ok[1] ? 'ok' : 'bad';

// ---------------------------------------------------------------------------
// One Euro filter
// ---------------------------------------------------------------------------

/** Tuning knobs — exposed because real cameras differ. */
// beta 10 (was 1): in frame-height/s units beta=1 barely lifts the cutoff at rep speeds, giving ~2 frames of lag and
// 5-10 % peak loss at 1 Hz; beta=10 keeps rest jitter nearly the same. Casiez, Roussel & Vogel, CHI 2012 (tune beta for lag).
export const FILTER = { minCutoff: 1.5, beta: 10, dCutoff: 1.0, minVisibility: 0.5 };

class OneEuro {
  private x = NaN; private dx = 0; private t = 0;
  filter(v: number, tMs: number): number {
    if (Number.isNaN(this.x)) { this.x = v; this.t = tMs; return v; }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const alpha = (fc: number) => 1 / (1 + 1 / (2 * Math.PI * fc * dt));
    const d = (v - this.x) / dt;
    this.dx += alpha(FILTER.dCutoff) * (d - this.dx);
    this.x += alpha(FILTER.minCutoff + FILTER.beta * Math.abs(this.dx)) * (v - this.x);
    return this.x;
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AngleReading { value: number; left?: number; right?: number; zone: Zone | null }

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
  reps?: {
    count: number;
    valid: number;
    partial: number;
    rejected: number;
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
  angles: Record<string, AngleStat>;
  checks: CheckStat[];
  symmetry: Record<string, number>;
  formScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  kcal: number | null;
  insights: CoachInsight[];
  /** Driver (or first angle) over time, ≤ 400 points, for charts. */
  series: Array<{ t: number; v: number }>;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

interface CheckAcc { good: number; ok: number; bad: number; sum: number; n: number }

const W: Record<Zone, number> = { good: 1, ok: 0.6, bad: 0 };

export class MotionSession {
  readonly def: ExerciseDef;
  private filters = new Map<number, [OneEuro, OneEuro]>();
  private side: 'left' | 'right' = 'left';
  private startMs = NaN;
  private lastMs = NaN;
  private frames = 0;
  private tracked = 0;
  private history: Array<{ t: number; a: Record<string, number>; raw: Record<string, number>; pts: P[]; rp: P[] }> = [];
  private acc: CheckAcc[];
  private sym: Record<string, number[]> = {};

  // reps
  private repState: 'top' | 'down' = 'top';
  private repStart = 0; private lastTop = 0; private topPeak = -Infinity;
  private extreme = Infinity; private extremeT = 0; private extremeSnap: Record<string, number> = {};
  private repActive: CheckAcc[] = [];
  private atTop = true;
  private descending = false;
  private reps: RepRecord[] = [];
  private rejected = 0;

  // hold
  private holdMs = 0; private holdRun = 0; private bestHold = 0; private lastTrackedT = NaN;

  // events
  private events: EventRecord[] = [];
  private groundY = NaN; private airborneSince = NaN; private lastEventT = -1e9;
  private speedPeak = 0; private speedPeakFrame = -1; private speedPeakWrist = L.wrist;
  private airSamples: Array<[number, number]> = []; private bodyHMax = 0;

  private cue: string | null = null; private cueT = 0;
  /** Zones judged at the last event, shown briefly on the skeleton. */
  private eventZones: (Zone | null)[] = []; private eventZonesT = -1e9;
  private weightKg: number | null;

  constructor(def: ExerciseDef, opts: { weightKg?: number } = {}) {
    this.def = def;
    this.weightKg = opts.weightKg ?? null;
    this.acc = def.checks.map(() => ({ good: 0, ok: 0, bad: 0, sum: 0, n: 0 }));
  }

  /** Feed one frame. `aspect` = videoWidth / videoHeight. */
  push(frame: PoseFrame, aspect = 16 / 9): LiveState {
    const t = frame.timestampMs;
    if (Number.isNaN(this.startMs)) this.startMs = t;
    const prevT = this.lastMs;
    this.lastMs = t;
    this.frames++;

    const pts: P[] = frame.landmarks.map((lm, i) => {
      let f = this.filters.get(i);
      if (!f) { f = [new OneEuro(), new OneEuro()]; this.filters.set(i, f); }
      return { x: f[0]!.filter(lm.x * aspect, t), y: f[1]!.filter(lm.y, t), v: lm.visibility ?? 1 };
    });
    const rawPts: P[] = frame.landmarks.map((lm) => ({ x: lm.x * aspect, y: lm.y, v: lm.visibility ?? 1 }));

    this.pickSide(pts);
    const framing = this.framing(pts);
    const tracking = framing === null;
    const angles: Record<string, AngleReading> = {};
    const values: Record<string, number> = {};
    const raw: Record<string, number> = {};
    if (tracking) {
      this.tracked++;
      for (const a of this.def.angles) {
        const r = this.measure(a, pts);
        const rr = this.measure(a, rawPts);
        if (!Number.isFinite(r.value)) continue;
        angles[a.id] = { ...r, zone: null };
        values[a.id] = r.value;
        raw[a.id] = rr.value;
        if (r.left !== undefined && r.right !== undefined) (this.sym[a.id] ??= []).push(Math.abs(r.left - r.right));
      }
      this.history.push({ t, a: values, raw, pts, rp: rawPts });
      this.lastTrackedT = t;
    } else if (t - this.lastTrackedT > 300) this.holdRun = 0; // tracking lost > 300 ms breaks the continuous hold

    // Phase for check applicability
    let phase: LiveState['phase'] = 'idle';
    let progress = 0;
    if (tracking && this.def.mode === 'reps' && this.def.reps) progress = this.stepReps(t, values);
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
      let z = zoneOf(v, c.good, c.ok);
      if (c.when === 'bottom' && this.def.mode === 'reps') {
        // Depth feedback: stay green once reached; amber while still descending; else judge the rep's extreme.
        const ext = this.extremeSnap[c.angle];
        const ze = ext === undefined ? z : zoneOf(ext, c.good, c.ok);
        z = ze === 'good' ? 'good' : this.descending ? (z === 'bad' ? 'ok' : z) : ze;
      }
      // Frame-level stats for continuous checks; bottom/release are scored per rep/event.
      if (c.when !== 'bottom' && c.when !== 'release' && !(c.when === 'hold' && this.def.mode !== 'hold')) {
        const s = this.acc[i]!; s[z]++; s.sum += v; s.n++;
        if (this.repState === 'down' && this.repActive[i]) { this.repActive[i][z]++; this.repActive[i].n++; }
      }
      return z;
    });

    if (tracking && this.def.mode === 'hold') {
      const holdIdx = this.def.checks.map((c, i) => (c.when === 'hold' ? i : -1)).filter((i) => i >= 0);
      const holding = holdIdx.length > 0 && holdIdx.every((i) => checkZones[i] !== null && checkZones[i] !== 'bad');
      // dt from the previous frame of any kind, capped at 100 ms, so untracked gaps never count as hold time.
      const dt = Number.isFinite(prevT) ? Math.min(100, Math.max(0, t - prevT)) : 0;
      if (holding) { this.holdMs += dt; this.holdRun += dt; this.bestHold = Math.max(this.bestHold, this.holdRun); phase = 'hold'; }
      else { this.holdRun = 0; phase = 'start'; }
      if (this.def.hold) progress = Math.min(1, this.holdRun / (this.def.hold.targetSec * 1000));
    }

    if (tracking && this.def.mode === 'event') this.stepEvent(t, values, pts);

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
      const nextCue = framing ?? (w ? w.c.cue : null);
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
    };
  }

  // -------------------------------------------------------------------------

  private pickSide(p: P[]): void {
    const vis = (s: SideMap) => [s.shoulder, s.elbow, s.hip, s.knee, s.ankle].reduce((a, i) => a + (p[i]!?.v ?? 0), 0) / 5;
    const l = vis(L), r = vis(R);
    if (this.side === 'left' && r > l + 0.15) this.side = 'right';
    else if (this.side === 'right' && l > r + 0.15) this.side = 'left';
  }

  private sideMap(s: 'left' | 'right'): SideMap { return s === 'left' ? L : R; }

  /** Landmark chains an angle touches (for colouring). */
  private chains(a: AngleDef): number[][] {
    const sides: Array<'left' | 'right'> =
      'side' in a && a.side === 'both' ? ['left', 'right'] :
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

  private measure(a: AngleDef, p: P[]): { value: number; left?: number; right?: number } {
    const one = (s: 'left' | 'right'): number => {
      const m = this.sideMap(s);
      if (a.kind === 'joint') { const [i, j, k] = JOINTS[a.joint](m); return jointAngle(p[i]!, p[j]!, p[k]!); }
      if (a.kind === 'segment') {
        const [i, j] =
          a.segment === 'shoulders' ? [L.shoulder, R.shoulder] :
          a.segment === 'hips' ? [L.hip, R.hip] : SEGMENTS[a.segment](m);
        return a.ref === 'vertical' ? vsVertical(p[i]!, p[j]!) : vsHorizontal(p[i]!, p[j]!);
      }
      const m2 = { feet: 'ankle', knees: 'knee', hands: 'wrist' } as const;
      const sw = Math.abs(p[L.shoulder]!.x - p[R.shoulder]!.x);
      return sw > 0 ? Math.abs(p[L[m2[a.what]]]!.x - p[R[m2[a.what]]]!.x) / sw : NaN;
    };
    const side = 'side' in a ? a.side ?? 'auto' : 'auto';
    if (a.kind === 'spread' || (a.kind === 'segment' && (a.segment === 'shoulders' || a.segment === 'hips'))) return { value: one('left') };
    if (side === 'both') { const l = one('left'), r = one('right'); return { value: (l + r) / 2, left: l, right: r }; }
    return { value: one(side === 'auto' ? this.side : side) };
  }

  private framing(p: P[]): string | null {
    if (p.length < 33) return 'Step into the frame';
    const need = new Set<number>();
    for (const a of this.def.angles) this.chains(a).flat().forEach((i) => need.add(i));
    const missing = [...need].filter((i) => (p[i]!?.v ?? 0) < FILTER.minVisibility);
    if (missing.length === need.size) return 'Step into the frame';
    if (missing.length) {
      const lower = missing.some((i) => i >= 25);
      const upper = missing.some((i) => i < 23);
      return lower && !upper ? 'Step back — show your legs and feet' : upper && !lower ? 'Step back — show your arms' : 'Step back — show your whole body';
    }
    const ys = [...need].map((i) => p[i]!.y);
    const span = Math.max(...ys) - Math.min(...ys);
    if (span > 0.97) return 'Move a little further away';
    return null;
  }

  // Reps — Schmitt trigger on the driver. `s` flips 'low' rules so one code path serves both.
  private stepReps(t: number, v: Record<string, number>): number {
    const rule = this.def.reps!;
    const raw = v[rule.driver];
    if (raw === undefined) return 0;
    const s = rule.start === 'high' ? 1 : -1;
    const x = s * raw, enter = s * rule.enter, exit = s * rule.exit, target = s * rule.target;
    this.atTop = this.repState === 'top' && x >= exit;
    this.descending = this.repState === 'down' && x <= this.extreme + 3;
    if (this.repState === 'top') {
      this.topPeak = Math.max(this.topPeak, x);
      if (x >= exit) this.lastTop = t;
      if (x < enter) {
        this.repState = 'down';
        // Rep starts at the last local maximum of the driver (descent onset), not the last frame above `exit`.
        const h = this.history;
        let j = h.length - 1;
        const xs = (k: number) => { const d = h[k]?.a[rule.driver]; return d === undefined ? NaN : s * d; };
        while (j > 0 && xs(j - 1) > xs(j)) j--;
        this.repStart = h.length ? h[j]!.t : this.lastTop || t;
        this.extreme = x; this.extremeT = t; this.extremeSnap = { ...v };
        this.repActive = this.def.checks.map(() => ({ good: 0, ok: 0, bad: 0, sum: 0, n: 0 }));
      }
      return 0;
    }
    if (x < this.extreme) { this.extreme = x; this.extremeT = t; this.extremeSnap = { ...v }; }
    if (x > exit) this.completeRep(t, s, target);
    const span = this.topPeak - target;
    return span > 0 ? Math.max(0, Math.min(1, (this.topPeak - this.extreme) / span)) : 0;
  }

  private completeRep(t: number, s: number, target: number): void {
    const rule = this.def.reps!;
    this.repState = 'top';
    const duration = t - this.repStart;
    const top = this.topPeak;
    this.topPeak = -Infinity;
    if (duration < (rule.minRepMs ?? 600)) { this.rejected++; return; }
    const faults: string[] = [];
    let wsum = 0, score = 0;
    this.def.checks.forEach((c, i) => {
      const w = c.weight ?? 1;
      if (c.when === 'bottom') {
        const val = this.extremeSnap[c.angle];
        if (val === undefined) return;
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
  private stepEvent(t: number, v: Record<string, number>, p: P[]): void {
    const ev = this.def.event!;
    const h = this.history;
    const n = h.length;
    // Running max of the shoulder-toe span: crouched/leaning throw postures shrink the per-frame span and inflate speed.
    // ponytail: session max, assumes roughly constant camera distance; switch to a decaying p95 if athletes move toward the camera.
    this.bodyHMax = Math.max(this.bodyHMax, Math.abs((p[L.foot]!.y + p[R.foot]!.y) / 2 - (p[L.shoulder]!.y + p[R.shoulder]!.y) / 2));
    const bodyH = this.bodyHMax / 0.8 || 1;

    if (ev.trigger === 'wristPeak') {
      if (n < 3) return;
      // Raw landmarks: the adaptive filter lags x and y differently at speed, which bends the release direction.
      const a = h[n - 3]!.rp, b = h[n - 1]!.rp, dt = (h[n - 1]!.t - h[n - 3]!.t) / 1000;
      if (dt <= 0) return;
      const speedOf = (i: number) => Math.hypot(b[i]!.x - a[i]!.x, b[i]!.y - a[i]!.y) / dt / bodyH;
      const wrist = speedOf(L.wrist) > speedOf(R.wrist) ? L.wrist : R.wrist;
      const sp = speedOf(wrist);
      if (sp > this.speedPeak) { this.speedPeak = sp; this.speedPeakFrame = n - 2; this.speedPeakWrist = wrist; }
      // Peak confirmed once speed falls to 55 % of a peak above 2.5 body-heights/s.
      if (this.speedPeak > 2.5 && sp < 0.55 * this.speedPeak && t - this.lastEventT > 1200) {
        const k = this.speedPeakFrame;
        const w = this.speedPeakWrist; // the wrist that peaked, not whichever is faster at confirmation
        const pa = h[Math.max(0, k - 1)]!.rp[w]!, pb = h[Math.min(n - 1, k + 1)]!.rp[w]!;
        const ang = deg(Math.atan2(pa.y - pb.y, Math.abs(pb.x - pa.x)));
        this.recordEvent('release', h[k]!.t, h[k]!.a, ang, this.speedPeak);
        this.speedPeak = 0;
      }
      if (sp < 0.5) this.speedPeak = 0;
      return;
    }

    const toeY = Math.max(p[L.foot]!.y, p[R.foot]!.y); // lower toe (y down)
    const hipY = (p[L.hip]!.y + p[R.hip]!.y) / 2;
    const legLen = Math.abs(toeY - hipY) || 0.3;

    if (ev.trigger === 'jump') {
      // Ground = slowly-tracked lowest toe position while grounded.
      if (Number.isNaN(this.groundY)) this.groundY = toeY;
      const up = this.groundY - toeY;
      const air = up > 0.08 * legLen;
      if (!air && Number.isNaN(this.airborneSince)) this.groundY += 0.1 * (toeY - this.groundY);
      if (air && Number.isNaN(this.airborneSince)) { this.airborneSince = t; this.airSamples = []; }
      const rawUp = this.groundY - Math.max(h[n - 1]!.rp[L.foot]!.y, h[n - 1]!.rp[R.foot]!.y);
      if (air && rawUp > 0.08 * legLen) this.airSamples.push([t, rawUp]);
      if (!air && !Number.isNaN(this.airborneSince)) {
        // The 8 % gate trims ~t_th at both ends (≈ -25 % height at 30 cm). Recover true contact instants by fitting
        // a parabola to the raw airborne toe heights and solving up(t) = 0. Bosco, Luhtanen & Komi 1983 (h = g·t²/8).
        let flight = t - this.airborneSince;
        let takeoff = this.airborneSince;
        const fit = parabolaRoots(this.airSamples);
        if (fit && fit[1] - fit[0] >= flight * 0.8 && fit[1] - fit[0] <= flight + 300) { takeoff = fit[0]; flight = fit[1] - fit[0]; }
        this.airborneSince = NaN;
        if (flight >= 120 && flight <= 1200 && takeoff - this.lastEventT > 800) {
          const k = h.findIndex((f) => f.t >= takeoff);
          const i0 = Math.max(0, k - 2);
          const hp = (f: P[]) => ({ x: (f[L.hip]!.x + f[R.hip]!.x) / 2, y: (f[L.hip]!.y + f[R.hip]!.y) / 2 });
          // Raw landmarks, as in the throw path: filter lag bends the take-off direction.
          const a = hp(h[i0]!.rp), b = hp(h[Math.min(h.length - 1, k + 1)]!.rp);
          const ang = deg(Math.atan2(a.y - b.y, Math.abs(b.x - a.x)));
          const rec = this.recordEvent('jump', takeoff, h[Math.max(0, k)]!.a, ang);
          rec.flightMs = flight;
          rec.jumpHeightCm = (9.81 * (flight / 1000) ** 2 / 8) * 100;
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
    if (isMin && Math.max(...recent) - m > 0.1 * legLen && mid.t - this.lastEventT > 1000) this.recordEvent('apex', mid.t, mid.a);
  }

  private recordEvent(kind: EventRecord['kind'], tAbs: number, at: Record<string, number>, releaseAngle?: number, peakSpeed?: number): EventRecord {
    this.lastEventT = tAbs;
    const faults: string[] = [];
    let wsum = 0, score = 0;
    const win = this.history.filter((f) => f.t >= tAbs - 1500 && f.t <= tAbs);
    this.eventZones = this.def.checks.map(() => null);
    this.eventZonesT = this.lastMs;
    // Deepest countermovement = frame of minimum knee (else hip) angle in the window.
    const depthId = (this.def.angles.find((a) => a.kind === 'joint' && a.joint === 'knee') ?? this.def.angles.find((a) => a.kind === 'joint' && a.joint === 'hip'))?.id;
    let deepest: Record<string, number> | null = null;
    if (depthId) for (const f of win) if (f.a[depthId] !== undefined && (!deepest || f.a[depthId]! < deepest[depthId]!)) deepest = f.a;
    this.def.checks.forEach((c, i) => {
      let val: number | undefined;
      if (c.when === 'release') val = at[c.angle];
      else if (c.when === 'bottom') {
        if (deepest) val = deepest[c.angle];
        else {
          const vals = win.map((f) => f.a[c.angle]).filter((x): x is number => x !== undefined);
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
    return wsum ? Math.round((100 * s) / wsum) : 100;
  }

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  finish(): SessionReport {
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
        if (w.some((x) => x === undefined) || hs[i + 2]!.t - hs[i - 2]!.t > 250) continue;
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
    if (this.tracked === 0) formScore = 0;
    const grade = formScore >= 90 ? 'A' : formScore >= 80 ? 'B' : formScore >= 70 ? 'C' : formScore >= 60 ? 'D' : 'F';

    const driver = def.reps?.driver ?? def.checks[0]?.angle ?? def.angles[0]?.id ?? '';
    const step = Math.max(1, Math.ceil(this.history.length / 400));
    const series = this.history
      .filter((_, i) => i % step === 0)
      .filter((f) => f.a[driver] !== undefined)
      .map((f) => ({ t: (f.t - this.startMs) / 1000, v: Math.round(f.a[driver]! * 10) / 10 }));

    const report: SessionReport = {
      exerciseId: def.id,
      name: def.name,
      mode: def.mode,
      startedAt: new Date(Date.now() - durMs).toISOString(),
      durationSec: dur,
      frames: this.frames,
      fps: dur > 0 ? this.frames / dur : 0,
      trackedPct: this.frames ? (100 * this.tracked) / this.frames : 0,
      reps,
      hold,
      events: def.mode === 'event' ? this.events : undefined,
      angles,
      checks,
      symmetry,
      formScore,
      grade,
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

  if (r.trackedPct < 70) out.push({ level: 'warn', title: 'Camera could not see you clearly', detail: `Body was tracked in ${Math.round(r.trackedPct)} % of frames. Place the camera ${def.camera === 'side' ? 'side-on' : 'facing you'} at hip height, 2–3 m away, with your whole body and good light.` });

  const rp = r.reps;
  if (rp) {
    if (rp.count === 0) out.push({ level: 'warn', title: 'No reps detected', detail: `Move through the full range — the counter needs the ${rp.driverLabel.toLowerCase()} to pass ${def.reps!.enter}° and return past ${def.reps!.exit}°.` });
    if (rp.partial > 0) out.push({ level: rp.partial / Math.max(1, rp.count) > 0.3 ? 'bad' : 'warn', title: `${rp.partial} of ${rp.count} reps were short of full range`, detail: `Target ${rp.driverLabel.toLowerCase()} ${def.reps!.start === 'high' ? '≤' : '≥'} ${rp.target}°. Reduce the load or slow down until every rep reaches it — partial reps build less strength through the full range.` });
    if (rp.rejected > 0) out.push({ level: 'warn', title: `${rp.rejected} movements were too fast to count`, detail: 'Bouncing reps under 0.6 s were discarded. Control every rep.' });
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
