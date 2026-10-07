import { describe, expect, it } from 'vitest';
import { WELLNESS } from './wellness.js';
import { MotionSession } from '../engine.js';
import { simulateExercise } from '../puppet.js';
import type { PoseFrame } from '../../jump/types.js';

const holdSec = (id: string, frames: PoseFrame[]) => {
  const s = new MotionSession(WELLNESS.find((x) => x.id === id)!);
  for (const f of frames) s.push(f);
  return s.finish().hold!.bestSec;
};

/** Same athlete facing the other way: mirror x and swap every left/right landmark pair (BlazePose odd/even from 1). */
const otherSide = (frames: PoseFrame[]): PoseFrame[] =>
  frames.map((f) => ({
    ...f,
    landmarks: f.landmarks.map((_, i) => {
      const src = f.landmarks[i === 0 ? 0 : i % 2 ? i + 1 : i - 1] ?? f.landmarks[i]!;
      return { ...src, x: 1 - src.x };
    }),
  }));

describe('wellness audit', () => {
  it('warrior I holds whichever leg leads, as long as it is nearer the camera', () => {
    const frames = simulateExercise(WELLNESS.find((x) => x.id === 'warrior-i')!);
    const left = holdSec('warrior-i', frames);
    expect(left).toBeGreaterThan(20);
    expect(holdSec('warrior-i', otherSide(frames))).toBeGreaterThan(0.9 * left);
  });
});
