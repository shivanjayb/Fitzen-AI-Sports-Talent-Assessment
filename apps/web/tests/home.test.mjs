import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const load = async (file) => {
  const src = await readFile(new URL(`../src/x/${file}`, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const H = await load('homeMath.ts'), S = await load('sleepMath.ts'), R = await load('recovery.ts');
const day = (y, m, d) => new Date(y, m - 1, d);

test('Home burned energy reads vitals burned, falling back to active only (was always "—")', () => {
  const recs = [
    { kind: 'nutrition', date: '2026-11-10', values: { calories: 600 } },
    { kind: 'vitals', date: '2026-11-10', values: { steps: 9000 } },          // newest record lacks energy
    { kind: 'vitals', date: '2026-11-10', values: { active: 795, burned: 2455 } },
    { kind: 'vitals', date: '2026-11-09', values: { burned: 2400 } },
  ];
  assert.deepEqual(H.energyOn(recs, '2026-11-10'), { value: 2455, total: true });
  assert.deepEqual(H.energyOn([{ kind: 'vitals', date: '2026-11-10', values: { active: 795 } }], '2026-11-10'), { value: 795, total: false });
  assert.equal(H.energyOn(recs, '2026-11-08'), null);
  // three sources on one day: any record carrying a total wins over active-only ones
  const three = [{ kind: 'vitals', date: 'd', values: { active: 500 } }, { kind: 'vitals', date: 'd', values: { hrv: 60 } }, { kind: 'vitals', date: 'd', values: { burned: 2300 } }];
  assert.deepEqual(H.energyOn(three, 'd'), { value: 2300, total: true });
});

test('week table matches days across a DST change (exact-ms compare missed them)', () => {
  // 2026-11-01 US fall-back; both are local midnights 8 calendar days apart but not 8×24 h on DST zones
  assert.ok(H.sameDay(day(2026, 11, 1), day(2026, 11, 1)));
  assert.ok(!H.sameDay(day(2026, 10, 31), day(2026, 11, 1)));
  const shifted = new Date(+day(2026, 11, 2) + 3600e3); // one hour off, as an n×24 h date would be
  assert.ok(H.sameDay(shifted, day(2026, 11, 2)));
});

test('weekly summary compares real calendar weeks and handles gaps', () => {
  const today = day(2026, 11, 10);
  const pts = Array.from({ length: 14 }, (_, i) => ({ date: day(2026, 10, 28 + i), value: i < 7 ? 10 : 12 }));
  assert.deepEqual(H.weekCompare(pts, today), { a: 12, b: 10, na: 7, nb: 7 });
  assert.equal(H.weekCompare(pts.slice(7), today), null); // only one week recorded
  const gappy = pts.filter((_, i) => i % 3 !== 0);
  const w = H.weekCompare(gappy, today);
  assert.equal(w.na + w.nb, gappy.length);
  assert.equal(H.changeText(12, 10, false), '↑ 20%');
  assert.equal(H.changeText(10.05, 10, false), 'Steady');
  assert.equal(H.changeText(10.5, 10, false), '↑ 5.0%');
  assert.equal(H.changeText(62, 70, true), '↓ 8 pts');
});

test('calendar-day distance for sleep windows ignores DST and clock time', () => {
  assert.equal(S.daysBefore(new Date(2026, 10, 1, 12), day(2026, 11, 1)), 0);
  assert.equal(S.daysBefore(new Date(2026, 9, 31, 12), day(2026, 11, 7)), 7);
  assert.equal(S.daysBefore(new Date(2026, 2, 7, 12), day(2026, 3, 9)), 2); // across spring-forward
});

test('60 imported days from truth.json: averages, debt, recovery', async () => {
  const truth = JSON.parse(await readFile('/Users/shiv/my_projects/fitzen-test-data/truth.json', 'utf8'));
  const today = new Date(`${truth.at(-1).date}T00:00:00`);
  const pts = (k) => truth.map((t) => ({ date: new Date(`${t.date}T00:00:00`), value: t[k] }));
  // Home Calories: Apple import stores burned = active + basal
  const recs = truth.map((t) => ({ kind: 'vitals', date: t.date, values: { active: t.active, burned: t.active + t.basal } }));
  assert.equal(H.energyOn(recs, truth.at(-1).date).value, 795 + 1660);
  // weekly HRV change vs truth
  const last7 = truth.slice(-7).map((t) => t.hrv), prev7 = truth.slice(-14, -7).map((t) => t.hrv), mean = (x) => x.reduce((a, b) => a + b) / x.length;
  const w = H.weekCompare(pts('hrv'), today);
  assert.ok(Math.abs(w.a - mean(last7)) < 1e-9 && Math.abs(w.b - mean(prev7)) < 1e-9);
  // sleep debt over last 7 nights against an 8 h goal
  const debt = truth.slice(-7).reduce((a, t) => a + Math.max(0, 8 - t.sleep), 0);
  assert.ok(Math.abs(S.sleepDebt(truth.slice(-7).map((t) => t.sleep), 8) - debt) < 1e-9);
  // recovery estimate is available for today and bounded
  const r = R.recoveryDays([today], (id) => id === 'recovery' ? [] : pts(id === 'sleep' ? 'sleep' : id), 8)[0];
  assert.ok(r && r.estimate && r.value >= 0 && r.value <= 100);
  // bedtimes after midnight (bed > 1440 in truth) average sensibly on the clock
  const c = S.circular(truth.map((t) => t.bed % 1440));
  assert.ok(Math.abs(S.clockDiff(c.mean, 23 * 60 + 30)) < 40, S.clock(c.mean));
});

test('data only up to yesterday: no recovery reading for today', () => {
  const today = day(2026, 11, 10);
  const hrv = Array.from({ length: 20 }, (_, i) => ({ date: day(2026, 10, 21 + i), value: 60 + (i % 3) })); // ends 9 Nov
  const week = R.recoveryDays([day(2026, 11, 9), today], (id) => id === 'hrv' ? hrv : [], 8);
  assert.ok(week[0] && week[1] === null);
});
