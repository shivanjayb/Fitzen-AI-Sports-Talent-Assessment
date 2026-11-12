import { describe, expect, it } from 'vitest';
import { bodyYawDeg, ViewAngleTracker } from './viewAngle.js';

/** Upright torso turned `yaw` degrees from facing the lens (world coordinates: x right, y down, z depth). */
const body = (yaw: number) => {
  const r = (yaw * Math.PI) / 180, w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  const hx = 0.18 * Math.cos(r), hz = 0.18 * Math.sin(r);
  w[11] = { x: hx, y: -0.5, z: hz, visibility: 1 }; w[12] = { x: -hx, y: -0.5, z: -hz, visibility: 1 };
  w[23] = { x: 0.7 * hx, y: 0, z: 0.7 * hz, visibility: 1 }; w[24] = { x: -0.7 * hx, y: 0, z: -0.7 * hz, visibility: 1 };
  return w;
};

describe('view angle', () => {
  it('recovers the turn of an upright torso', () => {
    for (const y of [0, 20, 45, 70, 90]) expect(bodyYawDeg(body(y))).toBeCloseTo(y, 5);
  });
  it('abstains when the shoulder and hip lines point up or are hidden', () => {
    const w = body(0);
    w[11] = { x: 0, y: -0.2, z: 0, visibility: 1 }; w[12] = { x: 0.02, y: 0.16, z: 0, visibility: 1 };
    w[23] = { x: 0.5, y: -0.15, z: 0, visibility: 1 }; w[24] = { x: 0.5, y: 0.15, z: 0, visibility: 1 };
    expect(bodyYawDeg(w)).toBeNull();
    expect(bodyYawDeg(body(30).map((p) => ({ ...p, visibility: 0.1 })))).toBeNull();
    expect(bodyYawDeg(undefined)).toBeNull();
  });
  it('summarises only recorded frames against the needed view', () => {
    const t = new ViewAngleTracker({ camera: 'side' });
    for (let i = 0; i < 30; i++) t.push(body(10), false); // setup frames: tracked, not recorded
    expect(t.summary()).toBeNull();
    t.reset();
    const fresh = new ViewAngleTracker({ camera: 'side' });
    for (let i = 0; i < 60; i++) fresh.push(body(50));
    const s = fresh.summary()!;
    expect(s.meanDeg).toBeCloseTo(50, 5);
    expect(s.errorDeg).toBeCloseTo(40, 5);
    expect(s.offPct).toBe(100);
    expect(new ViewAngleTracker({ camera: 'front' }).push(body(10))!.ok).toBe(true);
  });
});
