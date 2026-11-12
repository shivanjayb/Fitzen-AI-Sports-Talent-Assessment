// Every catalog exercise through the same engine path the app uses: the demo (live MotionSession, One Euro) on the
// screen-shaped demo canvas, and an uploaded clip (zero-phase filtfilt, no live smoothing) as Session.finish() does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, MotionSession, exerciseById, filtfiltLandmarks, simulateExercise, uploadCutoffHz } from '@fitzen/engines';

const H = 900;
function analyse(def, { ratio, fps = 30, path = 'live' }) {
  const W = Math.round(H * ratio), aspect = W / H, ground = W < H ? 0.74 : 0.86; // Session's DEMO_W / DEMO_GROUND
  const frames = simulateExercise(def, { reps: def.mode === 'reps' ? 6 : 3, aspect, ground, fps });
  const s = new MotionSession(def, path === 'live' ? { weightKg: 70 } : { weightKg: 70, smoothing: 'none' });
  for (const f of path === 'live' ? frames : filtfiltLandmarks(frames, uploadCutoffHz(def))) s.push(f, aspect);
  return s.finish();
}

for (const [label, opts] of [['demo 16:9', { ratio: 16 / 9 }], ['demo 9:16', { ratio: 9 / 16 }], ['video 24 fps', { ratio: 16 / 9, fps: 24, path: 'video' }]]) {
  test(`all ${EXERCISES.length} exercises measure the demo athlete (${label})`, () => {
    const bad = [];
    for (const def of EXERCISES) {
      const r = analyse(def, opts), why = [];
      if (r.grade === 'N/A' || !Number.isFinite(r.formScore) || r.formScore < 0 || r.formScore > 100) why.push(`grade ${r.grade} form ${r.formScore}`);
      if (def.mode === 'reps') {
        if (r.reps?.count !== 6) why.push(`reps ${r.reps?.count}/6`);
        for (const k of ['romMean', 'avgEccentricSec', 'avgConcentricSec', 'perMin', 'consistencyCv', 'tutSec']) if (!Number.isFinite(r.reps?.[k])) why.push(`${k} ${r.reps?.[k]}`);
      } else if (def.mode === 'hold') {
        // The puppet holds target + 3 s (some start poses already count as in position, so allow more).
        if (!(r.hold?.bestSec >= (def.hold?.targetSec ?? 20) + 2)) why.push(`hold ${r.hold?.bestSec}`);
      } else {
        const ev = r.events ?? [];
        if (ev.length !== 3) why.push(`events ${ev.length}/3`);
        // Flight lasts round(0.5·fps) frames of the puppet's clock: h = g·T²/8.
        const T = Math.round(0.5 * (opts.fps ?? 30)) / (opts.fps ?? 30), h = 981 * T * T / 8;
        if (def.event?.trigger === 'jump') for (const e of ev) if (e.jumpHeightCm !== undefined && Math.abs(e.jumpHeightCm - h) > 1.5) why.push(`jump ${e.jumpHeightCm.toFixed(1)} vs ${h.toFixed(1)}`);
      }
      if (why.length) bad.push(`${def.id}: ${why.join(', ')}`);
    }
    assert.deepEqual(bad, []);
  });
}

test('a fast-bowling delivery filmed at 24 fps is still detected (wind-up does not mask the release)', () => {
  const r = analyse(exerciseById('fast-bowling-delivery'), { ratio: 16 / 9, fps: 24, path: 'video' });
  assert.equal(r.events?.length, 3);
});
