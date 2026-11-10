import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const load = async (file) => {
  const src = await readFile(new URL(`../src/x/${file}`, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const S = await load('sleepMath.ts'), R = await load('recovery.ts');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('sleep hours wrap across midnight and subtract awake time', () => {
  near(S.sleepHours(23 * 60, 7 * 60), 8);
  near(S.sleepHours(22 * 60 + 30, 6 * 60 + 15, 15), 7.5);
  near(S.sleepHours(60, 9 * 60), 8); // fell asleep after midnight
  near(S.sleepHours(13 * 60, 14 * 60 + 30), 1.5); // afternoon nap
  near(S.sleepHours(420, 420), 0);
});

test('circular mean and SD of clock times handle the midnight wrap', () => {
  const c = S.circular([23 * 60 + 50, 10]);
  near(Math.abs(S.clockDiff(c.mean, 0)), 0, 1e-6);
  assert.ok(c.sd > 9 && c.sd < 11, `sd ${c.sd}`); // ±10 min, not ±11.8 h
  near(S.circular([420, 420, 420]).sd, 0, 1e-3);
  assert.equal(S.circular([]), null);
  assert.equal(S.clockDiff(10, 1430), 20);
  assert.equal(S.clock(1439.6), '00:00');
  assert.equal(S.parseClock('23:15'), 1395);
  assert.equal(S.parseClock('24:00'), null);
});

test('sleep debt sums only the shortfall against the goal', () => {
  near(S.sleepDebt([7, 8, 9, 6.5], 8), 2.5);
  assert.equal(S.sleepDebt([], 8), 0);
});

test('social jet lag compares weekend and weekday mid-sleep', () => {
  const work = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, bed: 23 * 60, wake: 7 * 60 })); // mid 03:00
  const free = [6, 0].map((weekday) => ({ weekday, bed: 60, wake: 9 * 60 })); // mid 05:00
  near(S.socialJetLag([...work, ...free]), 120, 1e-6);
  assert.equal(S.socialJetLag(work), null);
});

const day = new Date(2026, 5, 30);
const pts = (vals) => vals.map((value, i) => ({ date: new Date(2026, 5, 30 - (vals.length - 1 - i)), value }));

test('recovery estimate needs 7 days of HRV or resting HR', () => {
  assert.equal(R.recoveryEstimate(pts([60, 61, 62, 60, 59, 61]), [], [], 8, day), null);
  assert.equal(R.recoveryEstimate([], [], pts([8]), 8, day), null);
  const base = [58, 62, 60, 61, 59, 60, 60];
  assert.equal(R.recoveryEstimate(pts([...base.slice(0, 6), 60]), [], [], 8, day), 50); // at baseline
});

test('recovery estimate rises with HRV, falls with resting HR and sleep debt, and stays in 0–100', () => {
  const hrv = pts([58, 62, 60, 61, 59, 60, 70]), rhr = pts([55, 56, 55, 54, 56, 55, 51]);
  const good = R.recoveryEstimate(hrv, rhr, pts([8.5]), 8, day);
  const bad = R.recoveryEstimate(pts([58, 62, 60, 61, 59, 60, 50]), pts([55, 56, 55, 54, 56, 55, 60]), pts([5]), 8, day);
  assert.ok(good > 80 && good <= 100, `good ${good}`);
  assert.ok(bad < 20 && bad >= 0, `bad ${bad}`);
  assert.ok(R.recoveryEstimate(hrv, [], pts([4]), 8, day) < R.recoveryEstimate(hrv, [], pts([8]), 8, day));
});

test('recoveryDays prefers a device value, then the estimate, else null', () => {
  const data = { recovery: pts([77]), hrv: pts([58, 62, 60, 61, 59, 60, 60, 60]), rhr: [], sleep: [] };
  const out = R.recoveryDays([day, new Date(2026, 5, 29), new Date(2026, 5, 20)], (id) => data[id], 8);
  assert.deepEqual(out[0], { value: 77, estimate: false });
  assert.deepEqual(out[1], { value: 50, estimate: true });
  assert.equal(out[2], null);
});
