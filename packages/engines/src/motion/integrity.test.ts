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

describe('analyseIntegrity', () => {
  it('passes genuine puppet sessions (reps, hold, jump)', () => {
    for (const [id, mode] of [['back-squat', 'reps'], ['plank', 'hold'], ['countermovement-jump', 'event']] as const) {
      const r = log(`genuine ${id}`, check(sim(id), mode));
      expect(r.verdict).toBe('ok');
      expect(r.score).toBe(100);
    }
    const g = measured['genuine countermovement-jump']!.metrics.gravity!;
    expect(g).toBeGreaterThan(9.81 * 0.9);
    expect(g).toBeLessThan(9.81 * 1.1);
  });

  it('bone-length check stays quiet on every genuine catalog exercise', () => {
    const cvs = EXERCISES.map((d) => check(simulateExercise(d), d.mode).metrics);
    const maxCv = Math.max(...cvs.map((m) => m.boneCV!)), maxLr = Math.max(...cvs.map((m) => m.lrDrift!));
    console.log(`[integrity] catalog genuine: max boneCV=${maxCv} max lrDrift=${maxLr} over ${cvs.length} exercises`);
    expect(maxCv).toBeLessThan(0.035);
    expect(maxLr).toBeLessThan(0.05);
  });

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
