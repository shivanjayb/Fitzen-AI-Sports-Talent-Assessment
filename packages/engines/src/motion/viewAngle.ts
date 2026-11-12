/**
 * Background view-angle detection.
 *
 * A single camera measures a joint angle correctly only when the limb moves parallel to the image. This estimates, on
 * every frame, how the athlete's body is turned relative to the lens and how far that is from the view the exercise
 * needs (side-on or facing), so setup, live guidance and the report can all say so.
 *
 * Yaw comes from BlazePose's metric world landmarks (x right, y down, z toward/away from the camera): the direction of
 * the shoulder and hip lines in the horizontal x–z plane. 0° = facing the lens, 90° = side-on. BlazePose depth is the
 * weakest axis (Bazarevsky et al. 2020), so the value is smoothed, reported as an estimate and judged with wide bands.
 */
import type { ExerciseDef } from './types.js';

type P3 = { x: number; y: number; z?: number; visibility?: number };

export interface ViewSummary {
  /** View the exercise needs. */
  expected: 'side' | 'front';
  /** Mean body yaw, 0 = facing the lens, 90 = side-on. */
  meanDeg: number;
  sdDeg: number;
  /** Mean absolute distance from the needed view, degrees. */
  errorDeg: number;
  /** % of measured frames more than 30° away from the needed view. */
  offPct: number;
  frames: number;
}

/** Yaw of one frame in degrees (0 facing, 90 side-on), or null when the torso is not upright enough or not visible. */
export function bodyYawDeg(world: P3[] | undefined | null): number | null {
  if (!world || world.length < 25) return null;
  const line = (a: number, b: number) => {
    const p = world[a]!, q = world[b]!;
    if ((p.visibility ?? 1) < 0.5 || (q.visibility ?? 1) < 0.5) return null;
    const dx = q.x - p.x, dy = q.y - p.y, dz = (q.z ?? 0) - (p.z ?? 0);
    const flat = Math.hypot(dx, dz), len = Math.hypot(flat, dy);
    // A shoulder line that points mostly up or down (side plank, lying on one side) says nothing about yaw.
    return len > 1e-4 && flat / len >= 0.6 ? { yaw: (Math.atan2(Math.abs(dz), Math.abs(dx)) * 180) / Math.PI, w: flat } : null;
  };
  const s = line(11, 12), h = line(23, 24);
  if (!s && !h) return null;
  // Width-weighted: the wider line has the better signal-to-noise in depth.
  const ws = s?.w ?? 0, wh = h?.w ?? 0;
  return ((s?.yaw ?? 0) * ws + (h?.yaw ?? 0) * wh) / (ws + wh);
}

export class ViewAngleTracker {
  private ema: number | null = null;
  private n = 0; private sum = 0; private sq = 0; private err = 0; private off = 0;
  readonly expected: 'side' | 'front';
  constructor(def: Pick<ExerciseDef, 'camera'>) { this.expected = def.camera === 'front' ? 'front' : 'side'; }

  /** Feed every frame. `record` = false while not measuring (setup, pause), so only the attempt enters the summary. */
  push(world: P3[] | undefined | null, record = true): { yawDeg: number; errorDeg: number; ok: boolean } | null {
    const raw = bodyYawDeg(world);
    if (raw === null) return this.ema === null ? null : this.state(this.ema);
    this.ema = this.ema === null ? raw : this.ema + 0.2 * (raw - this.ema);
    if (record) {
      const e = this.errorOf(this.ema);
      this.n++; this.sum += this.ema; this.sq += this.ema * this.ema; this.err += e; if (e > 30) this.off++;
    }
    return this.state(this.ema);
  }
  private errorOf(yaw: number): number { return Math.abs(yaw - (this.expected === 'side' ? 90 : 0)); }
  private state(yaw: number) { const errorDeg = this.errorOf(yaw); return { yawDeg: yaw, errorDeg, ok: errorDeg <= 30 }; }
  reset(): void { this.n = this.sum = this.sq = this.err = this.off = 0; }
  summary(): ViewSummary | null {
    if (this.n < 10) return null;
    const mean = this.sum / this.n;
    return { expected: this.expected, meanDeg: mean, sdDeg: Math.sqrt(Math.max(0, this.sq / this.n - mean * mean)), errorDeg: this.err / this.n, offPct: (100 * this.off) / this.n, frames: this.n };
  }
}
