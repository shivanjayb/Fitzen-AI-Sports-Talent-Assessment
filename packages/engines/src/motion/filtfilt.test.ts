import { describe, expect, it } from 'vitest';
import { butterLowpass, filtfilt, filtfiltLandmarks } from './filtfilt.js';
import type { PoseFrame } from '../jump/types.js';
import { MotionSession } from './engine.js';
import { simulateExercise } from './puppet.js';
import { exerciseById } from './catalog/index.js';

// Fixture generated with scipy 1.13.1:
//   n=48; fs=30; t=arange(n)/fs
//   x = sin(2π·1.5t) + 0.3·sin(2π·9t) + 0.1·(((arange(n)*7) % 5) − 2)
//   b, a = butter(order, 6/(fs/2)); filtfilt(b, a, x)
const N = 48, FS = 30;
const X = Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * 1.5 * i / FS) + 0.3 * Math.sin(2 * Math.PI * 9 * i / FS) + 0.1 * (((i * 7) % 5) - 2));
const SCIPY: Record<number, number[]> = {
  2: [-0.199986140860,0.323545870478,0.651405049456,0.836036781301,0.937834358353,0.944798231019,0.927623921224,0.870453732064,0.629800343192,0.257402263522,-0.050341272818,-0.287783757918,-0.548856488432,-0.789494224655,-0.958756613732,-1.048056400974,-0.969469959935,-0.744180096427,-0.543355582989,-0.359277560840,-0.050309595188,0.328876831573,0.624065965683,0.824890354618,0.939068871147,0.947437067755,0.928357313777,0.870208003050,0.629565870817,0.257363686836,-0.050309408294,-0.287763782882,-0.548855180530,-0.789500639777,-0.958765725750,-1.048055496397,-0.969429031080,-0.744107309447,-0.543425748380,-0.359781163797,-0.050901730623,0.330331084161,0.629834222885,0.828349113864,0.916138389352,0.886501203030,0.930466496707,1.185378142052],
  3: [-0.199934373977,0.320264480349,0.674330553057,0.848697528358,0.916698067473,0.941379198970,0.944694354310,0.865608487927,0.623633246460,0.271573841525,-0.050687708987,-0.303047083453,-0.541244593003,-0.781671784779,-0.975805722248,-1.049960286208,-0.957010400815,-0.755166882594,-0.553104439799,-0.345899472557,-0.050020938864,0.315024416772,0.634006592859,0.836070399266,0.926120961191,0.949873877962,0.944915760914,0.862688879660,0.622329547771,0.272047207112,-0.050041094459,-0.302910548899,-0.541334866991,-0.781756575333,-0.976039070218,-1.050303190016,-0.956748651175,-0.753780880913,-0.552163626730,-0.348711812571,-0.056006304279,0.315882278290,0.651873540929,0.854774580577,0.898268516742,0.866789544865,0.940270642524,1.185051643498],
};

const frame = (t: number, v: number): PoseFrame => ({ timestampMs: t, landmarks: Array.from({ length: 33 }, () => ({ x: v, y: -v, z: 0, visibility: 0.9 })) });

describe('filtfilt', () => {
  it.each([2, 3])('matches scipy.signal.filtfilt, order %i, to 1e-6', (order) => {
    const [b, a] = butterLowpass(6, FS, order);
    const y = filtfilt(b, a, X);
    y.forEach((v, i) => expect(Math.abs(v - SCIPY[order]![i]!)).toBeLessThan(1e-6));
  });

  it('filtfiltLandmarks: same result on x, negated on y, visibility untouched', () => {
    const out = filtfiltLandmarks(X.map((v, i) => frame((i * 1000) / FS, v)));
    out.forEach((f, i) => {
      expect(Math.abs(f.landmarks[5]!.x - SCIPY[2]![i]!)).toBeLessThan(1e-6);
      expect(Math.abs(f.landmarks[5]!.y + SCIPY[2]![i]!)).toBeLessThan(1e-6);
      expect(f.landmarks[5]!.visibility).toBe(0.9);
    });
  });

  it('irregular timestamps: keeps frame times and a constant stays constant; zero lag on a slow ramp', () => {
    const ts = [0, 33, 70, 100, 133, 166, 210, 233, 266, 300, 333, 366, 400, 433, 466, 500];
    const flat = filtfiltLandmarks(ts.map((t) => frame(t, 0.4)));
    flat.forEach((f, i) => { expect(f.timestampMs).toBe(ts[i]); expect(f.landmarks[0]!.x).toBeCloseTo(0.4, 9); });
    // Odd padding + zero-phase filtering keeps a linear ramp on the line (a causal filter would lag behind it).
    const ramp = filtfiltLandmarks(ts.map((t) => frame(t, t / 1000)));
    ramp.forEach((f, i) => expect(Math.abs(f.landmarks[0]!.x - ts[i]! / 1000)).toBeLessThan(1e-4));
  });

  it('offline pipeline (filtfilt + smoothing none) counts the same reps as the live One Euro path', () => {
    const def = exerciseById('bodyweight-squat')!;
    const frames = simulateExercise(def, { reps: 6 });
    const live = new MotionSession(def);
    const offline = new MotionSession(def, { smoothing: 'none' });
    for (const f of frames) live.push(f);
    for (const f of filtfiltLandmarks(frames)) offline.push(f);
    const a = live.finish(), b = offline.finish();
    expect(b.reps?.count).toBe(a.reps?.count);
    expect(b.reps?.count).toBe(6);
  });
});
