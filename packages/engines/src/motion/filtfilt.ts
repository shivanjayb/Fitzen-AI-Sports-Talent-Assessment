/**
 * Zero-phase Butterworth low-pass for OFFLINE landmark tracks (uploaded videos).
 *
 * Live capture has to use a causal filter (One Euro, engine.ts), which lags. An upload is already complete,
 * so we can run the filter forward and then backward: the phase shifts cancel (zero lag) and the magnitude
 * response is squared. This is the standard biomechanics treatment of marker/keypoint trajectories:
 * - Winter, Biomechanics and Motor Control of Human Movement, 4th ed. (Wiley 2009), ch. 2 (signal processing):
 *   2nd-order Butterworth run forward + backward; ~6 Hz cutoff is adequate for gait-type human movement.
 * - Sports2D (Pagnon, github.com/davidpagnon/Sports2D) filters 2D keypoints the same way by default
 *   (zero-phase Butterworth, 6 Hz). Faster movements (sprint, throws) may need a higher cutoff: pass cutoffHz.
 * Implementation matches scipy.signal.filtfilt(b, a, x) with scipy.signal.butter(order, fc/(fs/2)): bilinear
 * transform with tan pre-warp, odd-reflection padding of 3·(order+1) samples, and lfilter_zi initial state.
 * Verified against scipy 1.13 output in filtfilt.test.ts.
 */
import type { PoseFrame } from '../jump/types.js';

/** Digital Butterworth low-pass [b, a] (same as scipy.signal.butter(order, fc / (fs / 2))). */
export function butterLowpass(cutoffHz: number, fs: number, order: number): [number[], number[]] {
  const K = Math.tan((Math.PI * cutoffHz) / fs); // pre-warped analog cutoff for the bilinear transform
  const mul = (p: number[], q: number[]) => {
    const r = new Array(p.length + q.length - 1).fill(0);
    p.forEach((pi, i) => q.forEach((qj, j) => { r[i + j] += pi * qj; }));
    return r;
  };
  let b = [1], a = [1];
  // Analog prototype poles s_k = exp(iπ(2k+N+1)/(2N)); conjugate pairs give s² − 2Re(s_k)s + 1.
  for (let k = 0; k < Math.floor(order / 2); k++) {
    const c = -2 * Math.cos((Math.PI * (2 * k + order + 1)) / (2 * order));
    b = mul(b, [K * K, 2 * K * K, K * K]);
    a = mul(a, [1 + c * K + K * K, 2 * K * K - 2, 1 - c * K + K * K]);
  }
  if (order % 2) { b = mul(b, [K, K]); a = mul(a, [1 + K, K - 1]); } // real pole at s = −1
  const a0 = a[0]!;
  return [b.map((v) => v / a0), a.map((v) => v / a0)];
}

/** Direct-form II transposed IIR, state pre-loaded for a constant input `x[0]` (scipy lfilter_zi · x[0]). */
function lfilter(b: number[], a: number[], x: number[]): number[] {
  const n = a.length - 1;
  const gain = b.reduce((s, v) => s + v, 0) / a.reduce((s, v) => s + v, 0);
  // Steady state for unit step: z_k = Σ_{j≥k} (b_j − a_j·gain).
  const z = new Array(n).fill(0);
  for (let k = n; k >= 1; k--) z[k - 1] = b[k]! - a[k]! * gain + (k < n ? z[k]! : 0);
  for (let k = 0; k < n; k++) z[k] *= x[0]!;
  return x.map((xi) => {
    const y = b[0]! * xi + z[0]!;
    for (let k = 0; k < n; k++) z[k] = b[k + 1]! * xi - a[k + 1]! * y + (k + 1 < n ? z[k + 1]! : 0);
    return y;
  });
}

/** scipy.signal.filtfilt(b, a, x), padtype 'odd', padlen 3·max(len(a), len(b)) (shortened for short input). */
export function filtfilt(b: number[], a: number[], x: number[]): number[] {
  if (x.length < 2) return x.slice();
  const pad = Math.min(3 * Math.max(a.length, b.length), x.length - 1);
  const x0 = x[0]!, xn = x[x.length - 1]!;
  const ext = [
    ...Array.from({ length: pad }, (_, i) => 2 * x0 - x[pad - i]!),
    ...x,
    ...Array.from({ length: pad }, (_, i) => 2 * xn - x[x.length - 2 - i]!),
  ];
  const fwd = lfilter(b, a, ext);
  const back = lfilter(b, a, fwd.reverse()).reverse();
  return back.slice(pad, pad + x.length);
}

/** Linear interpolation of (ts, v) at t (ts ascending). */
function interp(ts: number[], v: number[], t: number, hint: { i: number }): number {
  while (hint.i < ts.length - 2 && ts[hint.i + 1]! < t) hint.i++;
  const t0 = ts[hint.i]!, t1 = ts[hint.i + 1] ?? t0;
  const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  return v[hint.i]! + u * ((v[hint.i + 1] ?? v[hint.i]!) - v[hint.i]!);
}

/**
 * Zero-phase low-pass of every landmark's x, y, z. Visibility is left raw.
 * Timestamps must be ascending. If frame spacing is irregular (VFR clip, dropped frames), each track is
 * resampled to a uniform grid at the median frame interval, filtered, and interpolated back to the original
 * timestamps, so the output has the same frames and times as the input.
 * ponytail: linear interpolation bridges tracking gaps; a long gap gets a straight line, not real motion.
 */
export function filtfiltLandmarks(frames: PoseFrame[], cutoffHz = 6, order = 2): PoseFrame[] {
  if (frames.length < 3) return frames.map((f) => ({ ...f, landmarks: f.landmarks.map((l) => ({ ...l })) }));
  const ts = frames.map((f) => f.timestampMs);
  const dts = ts.slice(1).map((t, i) => t - ts[i]!).sort((p, q) => p - q);
  const med = dts[Math.floor(dts.length / 2)]!;
  if (!(med > 0) || dts[0]! < 0) throw new Error('filtfiltLandmarks: timestamps must be ascending');
  // Uniform if every interval is within 1 % of the median (container timestamps are rounded to ~1 ms).
  const uniform = dts[0]! > 0.99 * med && dts[dts.length - 1]! < 1.01 * med;
  const span = ts[ts.length - 1]! - ts[0]!;
  const steps = Math.max(2, Math.round(span / med));
  const dt = uniform ? med : span / steps; // grid spans first..last frame exactly
  const fs = 1000 / dt;
  // Cutoff must sit below Nyquist; clamp to 0.45·fs so very low fps clips still filter (lightly) instead of failing.
  const [b, a] = butterLowpass(Math.min(cutoffHz, 0.45 * fs), fs, order);
  const grid = uniform ? ts : Array.from({ length: steps + 1 }, (_, k) => ts[0]! + k * dt);

  const out: PoseFrame[] = frames.map((f) => ({ ...f, landmarks: f.landmarks.map((l) => ({ ...l })) }));
  const nLm = Math.min(...frames.map((f) => f.landmarks.length));
  for (let j = 0; j < nLm; j++) {
    for (const key of ['x', 'y', 'z'] as const) {
      const v = frames.map((f) => f.landmarks[j]![key]);
      if (uniform) {
        filtfilt(b, a, v).forEach((y, i) => { out[i]!.landmarks[j]![key] = y; });
      } else {
        const h1 = { i: 0 }, h2 = { i: 0 };
        const g = grid.map((t) => interp(ts, v, t, h1));
        const y = filtfilt(b, a, g);
        ts.forEach((t, i) => { out[i]!.landmarks[j]![key] = interp(grid, y, t, h2); });
      }
    }
  }
  return out;
}
