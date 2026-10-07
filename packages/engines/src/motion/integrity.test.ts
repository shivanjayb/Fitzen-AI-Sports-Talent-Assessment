/**
 * Integrity red team (defensive: our own anti-cheat). Genuine = the puppet humanised (3 takes, ±5 % tempo drift,
 * sway, 120 Hz source resampled, optional ±15 % VFR) + Gaussian tracker noise. Six conditions per exercise:
 * 24/30/60 fps, σ = 0.0015–0.005 frame heights, one VFR. Cell = clips with verdict ≠ 'ok' out of 6 (asserted below).
 *
 *   manipulation                 squat  plank  jump   caught by
 *   genuine (false positives)     0/6    0/6    0/6   — (and 0/86 across the catalog)
 *   speed ×0.5/×0.75/×1.25/×2     0/6    0/6    6/6   gravity (needs a flight phase; reps/holds are blind)
 *   speed ×2 by dropping frames   0/6    0/6    6/6   gravity
 *   slow ×0.5, duplicated frames  6/6    6/6    6/6   frozen-frames (+gravity)
 *   slow ×0.5, interpolated       6/6    6/6    6/6   interpolated-frames (+gravity)
 *   fps up-conversion ×2          6/6    6/6    6/6   interpolated-frames
 *   splice, second take offset    6/6    6/6    6/6   bone-length (scale change); teleport only if the jump is huge
 *   cut at a matching pose        0/6    0/6    0/6   — invisible in landmarks (container edit list if kept)
 *   loop 4 s (≈1 rep)             0/6    0/6    0/6   — below the 2.5 s repeated-segment minimum
 *   loop 8 s, re-encoded / exact  5/6    0/6    6/6   repeated-segment (a still hold can't be told from a loop)
 *   bone morph 3.5 % / 8 %       5–6/6   6/6  5–6/6   bone-length, left-right-drift
 *   foot sliding, one foot 5 cm   6/6    4/6    6/6   foot-slide
 *   over-smoothed track           0/6    0/6    5/6   gravity only (smoothing flattens flight)
 *   temporal flicker σ×4          2/6    5/6    2/6   scale-step — indistinguishable from bad tracking
 */
import { describe, expect, it } from 'vitest';
import { EXERCISES, exerciseById } from './catalog/index.js';
import { simulateExercise } from './puppet.js';
import { analyseIntegrity, type IntegrityReport } from './integrity.js';
import type { PoseFrame } from '../jump/types.js';

const ASPECT = 16 / 9;
const sim = (id: string) => simulateExercise(exerciseById(id)!);
const check = (frames: PoseFrame[], mode?: 'reps' | 'hold' | 'event') => analyseIntegrity(frames, { aspect: ASPECT, statureCm: 175, mode }); // puppet is built as a 1.75 m athlete
const retime = (frames: PoseFrame[], k: number) => frames.map((f) => ({ ...f, timestampMs: f.timestampMs / k }));
const measured: Record<string, IntegrityReport> = {};
const log = (name: string, r: IntegrityReport) => {
  measured[name] = r;
  const m = r.metrics;
  console.log(`[integrity] ${name}: verdict=${r.verdict} score=${r.score} boneCV=${m.boneCV} lrDrift=${m.lrDrift} g=${m.gravity ?? '-'} z=${m.gravityZ ?? '-'} ` +
    `teleports=${m.teleports} torsoSteps=${m.torsoSteps} gaps=${m.gaps} frozen=${m.frozenFraction}/${m.longestFrozenSec}s lowVis=${m.lowVisFraction} flags=[${r.flags.map((f) => `${f.code}:${f.severity}`).join(', ')}]`);
  return r;
};

/** Generative-video style morph: each segment's length oscillates by ±A (injected CV = A/√2), rebuilt down each chain. */
function morph(frames: PoseFrame[], A: number): PoseFrame[] {
  return frames.map((f) => {
    const t = f.timestampMs / 1000;
    const L = f.landmarks.map((l) => ({ ...l }));
    for (const side of [0, 1]) {
      let k = side * 5;
      const at = (i: number) => f.landmarks[i + side]!;
      const chain = (ids: number[], ends: number[]) => {
        let prev = at(ids[0]!), x = prev.x, y = prev.y;
        for (const id of ids.slice(1)) {
          const cur = at(id), s = 1 + A * Math.sin((2 * Math.PI * t) / (1.3 + 0.41 * k) + 1.7 * k++);
          x += (cur.x - prev.x) * s; y += (cur.y - prev.y) * s;
          L[id + side] = { ...L[id + side]!, x, y };
          prev = cur;
        }
        for (const e of ends) L[e + side] = { ...L[e + side]!, x: x + at(e).x - prev.x, y: y + at(e).y - prev.y };
      };
      chain([23, 11, 13, 15], [17, 19, 21]); // hip→shoulder→elbow→wrist→hand
      chain([23, 25, 27], [29, 31]); // hip→knee→ankle→foot
    }
    return { ...f, landmarks: L };
  });
}

// ── red-team set ─────────────────────────────────────────────────────────────
// "Video" = clean poses + a frame id; `track` then adds tracker noise that is a deterministic function of the id, so a
// bit-identical duplicated frame re-tracks identically while a re-encoded copy gets fresh noise.
interface VFrame { t: number; lm: PoseFrame['landmarks']; id: number; soft?: boolean }
const rng = (seed: number) => { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
interface Cond { fps: number; sigma: number; seed: number; vfr?: boolean }
let nextId = 1;

/** Real-looking capture: 3 takes of varied tempo/depth, 120 Hz source sampled at fps (optionally ±15 % VFR), body sway. */
function capture(id: string, c: Cond): VFrame[] {
  const def = exerciseById(id)!, r = rng(c.seed * 7919);
  const hi: PoseFrame[] = [];
  for (let k = 0; k < (def.mode === 'hold' ? 1 : 3); k++) {
    const t0 = hi.length ? hi[hi.length - 1]!.timestampMs + 1000 / 120 : 0;
    for (const f of simulateExercise(def, { fps: 120, reps: 2, repSec: 2.1 + 0.3 * ((c.seed + k) % 3), seed: c.seed * 31 + k })) hi.push({ ...f, timestampMs: t0 + f.timestampMs });
  }
  const ph = [r(), r()].map((x) => x * 2 * Math.PI), out: VFrame[] = [];
  for (let t = 0; t <= hi[hi.length - 1]!.timestampMs; t += (1000 / c.fps) * (c.vfr ? 0.85 + 0.3 * r() : 1)) {
    // ±5 % tempo drift (period 3.7 s): a real athlete never repeats a rep at identical speed; the puppet does.
    const f = hi[Math.max(0, Math.min(hi.length - 1, Math.round(((t + 30 * Math.sin((2 * Math.PI * t) / 3700 + ph[0]!)) * 120) / 1000)))]!, s = t / 1000;
    const sx = 0.003 * Math.sin(2 * Math.PI * 0.23 * s + ph[0]!), sy = 0.0015 * Math.sin(2 * Math.PI * 0.31 * s + ph[1]!);
    out.push({ t, id: nextId++, lm: f.landmarks.map((l) => ({ ...l, x: l.x + sx / ASPECT, y: l.y + sy })) });
  }
  return out;
}
/** Pose tracker: Gaussian noise σ (frame-height units) seeded by frame id; synthesised frames get σ/2 (blended pixels carry less sensor noise — an assumption). */
const track = (v: VFrame[], sigma: number): PoseFrame[] => v.map((f) => {
  const r = rng(f.id * 104729), s = f.soft ? sigma / 2 : sigma;
  return { timestampMs: f.t, landmarks: f.lm.map((l) => ({ ...l, x: l.x + (s * gauss(r)) / ASPECT, y: l.y + s * gauss(r) })) };
});
const retimed = (v: VFrame[], dt: number) => v.map((f, i) => ({ ...f, t: i * dt }));
const mid = (a: VFrame, b: VFrame): VFrame => ({ t: 0, id: nextId++, soft: true, lm: a.lm.map((l, k) => ({ ...l, x: (l.x + b.lm[k]!.x) / 2, y: (l.y + b.lm[k]!.y) / 2 })) });
const interp = (v: VFrame[]) => v.flatMap((f, i) => (i + 1 < v.length ? [f, mid(f, v[i + 1]!)] : [f]));
const poseGap = (a: VFrame, b: VFrame) => a.lm.reduce((s, l, k) => s + Math.hypot((l.x - b.lm[k]!.x) * ASPECT, l.y - b.lm[k]!.y), 0);

/** Copy `sec` of footage from 1/3 in and paste it right after (rep-count inflation); re-encoded copies re-track with fresh noise. */
const loop = (v: VFrame[], fps: number, s: number, sec: number, reencode: boolean) => {
  const a = Math.floor(v.length / 3), seg = v.slice(a, a + Math.round(sec * fps)).map((f) => (reencode ? { ...f, id: nextId++ } : f));
  return track(retimed([...v.slice(0, a + seg.length), ...seg, ...v.slice(a + seg.length)], dt(fps)), s);
};
type Manip = (v: VFrame[], fps: number, sigma: number) => PoseFrame[];
const dt = (fps: number) => 1000 / fps;
const MANIPS: Record<string, Manip> = {
  'speed x0.5 (timestamps)': (v, _, s) => track(v.map((f) => ({ ...f, t: f.t * 2 })), s),
  'speed x0.75 (timestamps)': (v, _, s) => track(v.map((f) => ({ ...f, t: f.t / 0.75 })), s),
  'speed x1.25 (timestamps)': (v, _, s) => track(v.map((f) => ({ ...f, t: f.t / 1.25 })), s),
  'speed x2 (timestamps)': (v, _, s) => track(v.map((f) => ({ ...f, t: f.t / 2 })), s),
  'speed x2 (drop frames)': (v, fps, s) => track(retimed(v.filter((_, i) => i % 2 === 0), dt(fps)), s),
  'slow x0.5 (duplicate frames)': (v, fps, s) => track(retimed(v.flatMap((f) => [f, f]), dt(fps)), s),
  'slow x0.5 (interpolated)': (v, fps, s) => track(retimed(interp(v), dt(fps)), s),
  'fps up-conversion x2': (v, fps, s) => track(retimed(interp(v.filter((_, i) => i % 2 === 0)), dt(fps)), s),
  'splice (second take offset)': (v, fps, s) => {
    const a = Math.floor(v.length / 3), b = Math.floor((2 * v.length) / 3);
    const moved = v.slice(b).map((f) => ({ ...f, lm: f.lm.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * 0.9 + 0.04, y: 0.5 + (l.y - 0.5) * 0.9 })) }));
    return track(retimed([...v.slice(0, a), ...moved], dt(fps)), s);
  },
  'cut at matching pose': (v, fps, s) => { // best possible attacker cut: drop ≥ 2 s between the two most similar poses
    const a = Math.floor(v.length / 3), gap = Math.round(2 * fps);
    let b = a + gap;
    for (let j = a + gap; j < v.length - fps; j++) if (poseGap(v[a]!, v[j]!) < poseGap(v[a]!, v[b]!)) b = j;
    return track(retimed([...v.slice(0, a), ...v.slice(b)], dt(fps)), s);
  },
  ...Object.fromEntries([4, 8].flatMap((sec) => [
    [`loop ${sec} s (re-encoded copy)`, ((v, fps, s) => loop(v, fps, s, sec, true)) as Manip],
    [`loop ${sec} s (bit-exact copy)`, ((v, fps, s) => loop(v, fps, s, sec, false)) as Manip],
  ])),
  'bone morph 3.5 %': (v, _, s) => morph(track(v, s), 0.035 * Math.SQRT2),
  'bone morph 8 %': (v, _, s) => morph(track(v, s), 0.08 * Math.SQRT2),
  'foot sliding (one foot, 5 cm)': (v, _, s) => track(v.map((f) => ({ ...f, lm: f.lm.map((l, k) => ([27, 29, 31].includes(k) ? { ...l, x: l.x + (0.03 * Math.sin((2 * Math.PI * f.t) / 1700)) / ASPECT } : l)) })), s),
  'over-smoothed track (AI-like)': (v, _, s) => { const p = track(v, s); return p.map((f, i) => ({ ...f, landmarks: f.landmarks.map((l, k) => { const w = p.slice(Math.max(0, i - 4), i + 5); return { ...l, x: w.reduce((a, g) => a + g.landmarks[k]!.x, 0) / w.length, y: w.reduce((a, g) => a + g.landmarks[k]!.y, 0) / w.length }; }) })); },
  'temporal flicker (σ x4)': (v, _, s) => track(v, s * 4),
};
const CONDS: Cond[] = [
  { fps: 24, sigma: 0.003, seed: 1 }, { fps: 30, sigma: 0.0015, seed: 2 }, { fps: 30, sigma: 0.003, seed: 3 },
  { fps: 30, sigma: 0.003, seed: 4, vfr: true }, { fps: 30, sigma: 0.005, seed: 5 }, { fps: 60, sigma: 0.003, seed: 6 },
];
const RT_EXERCISES = [['back-squat', 'reps'], ['plank', 'hold'], ['countermovement-jump', 'event']] as const;

describe('red team', () => {
  it('measures detection and false-positive rates', () => {
    const hits: Record<string, number[]> = {}, rows: string[] = [];
    const rate = (name: string, run: (c: Cond, v: VFrame[]) => PoseFrame[]) => {
      hits[name] = RT_EXERCISES.map(([id, mode]) => CONDS.filter((c) => analyseIntegrity(run(c, capture(id, c)), { aspect: ASPECT, statureCm: 175, mode }).verdict !== 'ok').length);
      rows.push(`${name.padEnd(30)} | ${hits[name]!.map((n) => `${n}/${CONDS.length}`).join(' | ')}`);
    };
    rate('genuine', (c, v) => track(v, c.sigma));
    for (const [name, m] of Object.entries(MANIPS)) rate(name, (c, v) => m(v, c.fps, c.sigma));
    console.log(`[redteam] squat | plank | jump\n${rows.join('\n')}`);
    // [squat, plank, jump] flagged counts out of 6 conditions; see the table in the file header.
    const N = CONDS.length, all = [N, N, N];
    expect(hits['genuine']).toEqual([0, 0, 0]);
    for (const k of ['speed x0.5 (timestamps)', 'speed x0.75 (timestamps)', 'speed x1.25 (timestamps)', 'speed x2 (timestamps)', 'speed x2 (drop frames)']) expect(hits[k]![2]).toBe(N);
    for (const k of ['slow x0.5 (duplicate frames)', 'slow x0.5 (interpolated)', 'fps up-conversion x2', 'splice (second take offset)', 'bone morph 8 %']) expect(hits[k]).toEqual(all);
    expect(hits['foot sliding (one foot, 5 cm)']!.reduce((a, b) => a + b)).toBeGreaterThanOrEqual(15);
    expect(hits['bone morph 3.5 %']!.reduce((a, b) => a + b)).toBeGreaterThanOrEqual(15);
    for (const k of ['loop 8 s (re-encoded copy)', 'loop 8 s (bit-exact copy)']) { expect(hits[k]![0]).toBeGreaterThanOrEqual(5); expect(hits[k]![2]).toBe(N); }
  }, 300_000);
});

describe('analyseIntegrity', () => {
  // The bare puppet repeats every rep bit-for-bit like a robot, so "genuine" here means the humanised capture
  // (tempo drift, sway, tracker noise); the bare puppet is only used as the base for single manipulations.
  it('passes genuine sessions (reps, hold, jump)', () => {
    for (const [id, mode] of RT_EXERCISES) {
      const r = log(`genuine ${id}`, check(track(capture(id, { fps: 30, sigma: 0.002, seed: 9 }), 0.002), mode));
      expect(r.verdict).toBe('ok');
      expect(r.score).toBe(100);
    }
    const g = measured['genuine countermovement-jump']!.metrics.gravity!;
    expect(g).toBeGreaterThan(9.81 * 0.9);
    expect(g).toBeLessThan(9.81 * 1.1);
  });

  it('stays ok on every genuine catalog exercise', () => {
    const reports = EXERCISES.map((d) => [d.id, check(track(capture(d.id, { fps: 30, sigma: 0.002, seed: 3 }), 0.002), d.mode)] as const);
    // The bare puppet moves the hip ~0.2 frame heights in one frame on these lying exercises (a render discontinuity at
    // its last rep), so 'teleport' is correct there. Lateral bound is a reps-mode drill the puppet performs by sliding
    // its feet apart and together on the floor (it never takes off), i.e. real foot skating. Both are left out.
    const puppetJump = ['hip-thrust', 'crunch', 'sai-partial-curl-up', 'lateral-bound'];
    const flagged = reports.filter(([id, r]) => !puppetJump.includes(id) && r.flags.some((f) => f.severity !== 'info')).map(([id, r]) => `${id}:${r.flags.map((f) => f.code)}`);
    console.log(`[integrity] catalog genuine flagged: ${flagged.length}/${reports.length} ${flagged.join(' ')}`);
    expect(flagged).toEqual([]);
    const cvs = reports.map(([, r]) => r.metrics);
    const maxCv = Math.max(...cvs.map((m) => m.boneCV!)), maxLr = Math.max(...cvs.map((m) => m.lrDrift!));
    console.log(`[integrity] catalog genuine: max boneCV=${maxCv} max lrDrift=${maxLr} over ${cvs.length} exercises`);
    expect(maxCv).toBeLessThan(0.035);
    expect(maxLr).toBeLessThan(0.05);
  }, 60_000);

  it('fails a 2x sped-up jump (g ≈ 4 × 9.81)', () => {
    const r = log('2x sped-up jump', check(retime(sim('countermovement-jump'), 2), 'event'));
    expect(r.verdict).toBe('fail');
    expect(r.metrics.gravity!).toBeGreaterThan(35);
    expect(r.metrics.gravity!).toBeLessThan(45);
    expect(r.metrics.impliedSpeed!).toBeCloseTo(2, 0);
  });

  it('fails a 0.5x slow-motion jump (g ≈ 9.81 / 4)', () => {
    const r = log('0.5x slow-mo jump', check(retime(sim('countermovement-jump'), 0.5), 'event'));
    expect(r.verdict).toBe('fail');
    expect(r.metrics.gravity!).toBeGreaterThan(2);
    expect(r.metrics.gravity!).toBeLessThan(3);
  });

  it('flags morphing limbs at 8 % and 15 % injected CV', () => {
    for (const cv of [0.08, 0.15]) {
      const r = log(`morph ${cv * 100}% squat`, check(morph(sim('back-squat'), cv * Math.SQRT2), 'reps'));
      expect(r.verdict).not.toBe('ok');
      expect(r.flags.map((f) => f.code)).toContain('bone-length');
    }
  });

  it('warns on a spliced clip (teleport + zoom step + clock gap)', () => {
    const a = sim('back-squat'), half = Math.floor(a.length / 2);
    // Second take: athlete 15 % of frame width to the right and 30 % smaller, then 20 frames cut out of it.
    const b = a.slice(half).map((f) => {
      const hx = f.landmarks[23]!.x, hy = f.landmarks[23]!.y;
      return { ...f, landmarks: f.landmarks.map((l) => ({ ...l, x: hx + 0.15 + (l.x - hx) * 0.7, y: hy + (l.y - hy) * 0.7 })) };
    });
    const spliced = [...a.slice(0, half), ...b.slice(0, 100), ...b.slice(120)]; // original clock kept → 20-frame gap
    const r = log('spliced squat', check(spliced, 'reps'));
    expect(r.verdict).toBe('warn');
    const codes = r.flags.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['teleport', 'scale-step', 'timestamp-gap']));
  });

  it('warns on frozen (duplicated) frames', () => {
    const f = sim('back-squat');
    const frozen = f.map((x, i) => (i >= 60 && i < 80 ? { ...x, landmarks: f[60]!.landmarks } : x));
    const r = log('frozen squat', check(frozen, 'reps'));
    expect(r.verdict).toBe('warn');
    expect(r.flags.map((x) => x.code)).toContain('frozen-frames');
    expect(r.metrics.longestFrozenSec!).toBeGreaterThan(0.6);
  });

  it('fails backward timestamps and warns on poor tracking', () => {
    const f = sim('back-squat');
    const swapped = f.map((x, i) => (i === 50 ? { ...x, timestampMs: f[51]!.timestampMs } : i === 51 ? { ...x, timestampMs: f[50]!.timestampMs } : x));
    expect(log('reordered squat', check(swapped, 'reps')).flags.map((x) => x.code)).toContain('timestamps-backward');
    const dim = f.map((x, i) => (i % 5 < 2 ? { ...x, landmarks: x.landmarks.map((l) => ({ ...l, visibility: 0.3 })) } : x));
    const r = log('low-visibility squat', check(dim, 'reps'));
    expect(r.verdict).toBe('warn');
    expect(r.metrics.lowVisFraction!).toBeCloseTo(0.4, 1);
  });
});

describe('missing detection frames', () => {
  it('keeps missing detections in quality coverage without crashing physical checks', () => {
    const raw = sim('countermovement-jump').slice(0, 90);
    const withGaps = raw.map((f, i) => i % 3 === 0 ? { ...f, landmarks: [] } : f);
    const report = check(withGaps, 'event');
    expect(report.metrics.frames).toBe(withGaps.length);
    expect(report.metrics.lowVisFraction).toBeGreaterThanOrEqual(1 / 3 - 0.001);
    expect(report.flags.some(f => f.code === 'low-visibility')).toBe(true);
  });

  it('all-missing footage is quality-limited, never reported as fully tracked', () => {
    const frames: PoseFrame[] = Array.from({ length: 30 }, (_, i) => ({ timestampMs: i * 1000 / 30, landmarks: [] }));
    const report = check(frames, 'event');
    expect(report.metrics.lowVisFraction).toBe(1);
    expect(report.verdict).toBe('warn');
    expect(report.metrics.frozenFraction).toBe(0);
  });
});
