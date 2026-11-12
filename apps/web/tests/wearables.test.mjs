import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const load = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const hr = await load('../src/x/wearables/heartRate.ts');
const p = await load('../src/x/wearables/parse.ts');
const view = (bytes) => new DataView(Uint8Array.from(bytes).buffer);

test('heart-rate measurement: 8-bit, 16-bit, energy field and RR intervals', () => {
  assert.deepEqual(hr.parseHeartRate(view([0x00, 72])), { bpm: 72, rr: [] });
  assert.deepEqual(hr.parseHeartRate(view([0x01, 0x2c, 0x01])), { bpm: 300, rr: [] });
  // flags: RR present + energy present; RR 1024 → 1000 ms, 820 → 801 ms
  assert.deepEqual(hr.parseHeartRate(view([0x18, 60, 0x10, 0x00, 0x00, 0x04, 0x34, 0x03])), { bpm: 60, rr: [1000, 801] });
});

test('RMSSD needs 60 s of clean RR and drops artefacts', () => {
  assert.equal(hr.rmssd([800, 820, 800]), null);
  const rr = Array.from({ length: 80 }, (_, i) => (i % 2 ? 820 : 800));
  assert.equal(hr.rmssd(rr), 20);
  assert.equal(hr.rmssd([...rr.slice(0, 40), 3000, 200, 1200, ...rr.slice(40)]), 20);
});

test('resting heart rate is the lowest steady minute', () => {
  const s = Array.from({ length: 180 }, (_, i) => ({ t: i * 1000, bpm: i < 60 ? 80 : i < 120 ? 58 + (i % 3) : 70 }));
  assert.equal(hr.restingHeartRate(s), 59);
  assert.equal(hr.restingHeartRate(s.slice(0, 30)), null);
  assert.equal(hr.restingHeartRate(Array.from({ length: 70 }, (_, i) => ({ t: i * 1000, bpm: i % 2 ? 50 : 90 }))), null);
});

test('Apple Health XML: chunked stream, unit conversion, per-source step max and sleep nights', () => {
  const acc = new p.Acc(), parser = p.appleParser(acc);
  const xml = `<HealthData>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" unit="count" startDate="2026-01-02 08:00:00 +0000" endDate="2026-01-02 08:10:00 +0000" value="1000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" unit="count" startDate="2026-01-02 09:00:00 +0000" endDate="2026-01-02 09:10:00 +0000" value="500"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Phone" unit="count" startDate="2026-01-02 08:00:00 +0000" endDate="2026-01-02 08:10:00 +0000" value="1200"/>
 <Record type="HKQuantityTypeIdentifierOxygenSaturation" sourceName="Watch" unit="%" startDate="2026-01-02 03:00:00 +0000" endDate="2026-01-02 03:00:00 +0000" value="0.97"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="lb" startDate="2026-01-02 07:00:00 +0000" endDate="2026-01-02 07:00:00 +0000" value="160">
  <MetadataEntry key="x" value="y"/>
 </Record>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Watch" unit="kcal" startDate="2026-01-02 10:00:00 +0000" endDate="2026-01-02 10:00:00 +0000" value="300"/>
 <Record type="HKQuantityTypeIdentifierBasalEnergyBurned" sourceName="Watch" unit="kcal" startDate="2026-01-02 10:00:00 +0000" endDate="2026-01-02 10:00:00 +0000" value="1500"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-01-01 23:00:00 +0000" endDate="2026-01-02 03:00:00 +0000" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-01-02 03:00:00 +0000" endDate="2026-01-02 04:00:00 +0000" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-01-02 04:00:00 +0000" endDate="2026-01-02 04:30:00 +0000" value="HKCategoryValueSleepAnalysisAwake"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-01-02 04:30:00 +0000" endDate="2026-01-02 06:30:00 +0000" value="HKCategoryValueSleepAnalysisAsleepREM"/>
</HealthData>`;
  for (let i = 0; i < xml.length; i += 37) parser.push(xml.slice(i, i + 37));
  parser.finish();
  const d = acc.days()['2026-01-02'];
  assert.equal(d.vitals.steps, 1500);
  assert.equal(d.vitals.spo2, 97);
  assert.equal(d.vitals.active, 300);
  assert.equal(d.vitals.burned, 1800);
  assert.equal(d.body.weight, 72.6);
  assert.deepEqual(d.sleep, { hours: 7, light: 4, deep: 1, awake: 30, rem: 2, bedtime: 1380, wake: 390 });
});

test('Fitbit Takeout JSON by file name', () => {
  const acc = new p.Acc();
  p.parseFitbitJson('Takeout/Fitbit/Global Export Data/heart_rate-2026-01-03.json', JSON.stringify([{ dateTime: '01/03/26 00:00:05', value: { bpm: 60, confidence: 2 } }, { dateTime: '01/03/26 00:00:10', value: { bpm: 70, confidence: 2 } }]), acc);
  p.parseFitbitJson('steps-2026-01-03.json', JSON.stringify([{ dateTime: '01/03/26 00:00:00', value: '40' }, { dateTime: '01/03/26 00:01:00', value: '60' }]), acc);
  p.parseFitbitJson('resting_heart_rate-2026-01-03.json', JSON.stringify([{ dateTime: '01/03/26 00:00:00', value: { date: '01/03/26', value: 57.4, error: 6 } }]), acc);
  p.parseFitbitJson('weight-2026-01-03.json', JSON.stringify([{ weight: 150, fat: 18, date: '01/03/26', time: '07:00:00' }]), acc, true);
  p.parseFitbitJson('sleep-2026-01-03.json', JSON.stringify([{ dateOfSleep: '2026-01-03', startTime: '2026-01-02T23:15:00.000', endTime: '2026-01-03T07:00:00.000', minutesAsleep: 420, minutesAwake: 45, efficiency: 91, mainSleep: true, levels: { summary: { deep: { minutes: 60 }, light: { minutes: 270 }, rem: { minutes: 90 }, wake: { minutes: 45 } } } }]), acc);
  assert.equal(p.parseFitbitJson('profile.json', '{}', acc), -1);
  const d = acc.days()['2026-01-03'];
  assert.deepEqual(d.vitals, { hr: 65, steps: 100, rhr: 57.4 });
  assert.deepEqual(d.body, { weight: 68, bodyfat: 18 });
  assert.deepEqual(d.sleep, { hours: 7, deep: 1, light: 4.5, rem: 1.5, awake: 45, efficiency: 91, bedtime: 1395, wake: 420 });
});

test('CSV: Fitzen template, WHOOP columns, Garmin durations and Fitbit HRV summary', () => {
  const acc = new p.Acc();
  assert.equal(p.parseCsv(p.CSV_TEMPLATE, acc), 1);
  assert.equal(p.parseCsv('Cycle start time,Resting heart rate (bpm),Heart rate variability (ms),Recovery score %,Asleep duration (min),Deep (SWS) duration (min),Awake duration (min),Blood oxygen %\n2026-01-04 22:10:00,52,80,66,450,90,30,96.5\n', acc), 1);
  assert.equal(p.parseCsv('﻿Date;Sleep Duration;Weight\n"01/05/2026";7h 30m;165.0 lbs\n', acc), 1);
  assert.equal(p.parseCsv('timestamp,rmssd,nremhr,entropy\n2026-01-06T00:00:00,41.2,55,2.3\n', acc), 1);
  assert.equal(p.parseCsv('foo,bar\n1,2\n', acc), -1);
  const d = acc.days();
  assert.deepEqual(d['2026-01-01'], { vitals: { steps: 8000, rhr: 58, hrv: 62, spo2: 97, burned: 2300 }, sleep: { hours: 7.5 }, body: { weight: 72.4 } });
  assert.deepEqual(d['2026-01-04'], { vitals: { rhr: 52, hrv: 80, recovery: 66, spo2: 96.5 }, sleep: { hours: 7.5, deep: 1.5, awake: 30 } });
  assert.deepEqual(d['2026-01-05'], { sleep: { hours: 7.5 }, body: { weight: 74.8 } });
  assert.equal(d['2026-01-06'].vitals.hrv, 41.2);
});

test('RMSSD and heart-rate packet match hand-computed values; truncated packets are ignored', () => {
  // 1000,980,1010,990 ×16 = 64 s. 63 diffs: 15×(400+900+400+100) + 400+900+400 = 28700; √(28700/63) = 21.34
  assert.equal(hr.rmssd(Array.from({ length: 64 }, (_, i) => [1000, 980, 1010, 990][i % 4])), 21.3);
  assert.deepEqual(hr.parseHeartRate(view([0x00])), { bpm: 0, rr: [] });
  assert.deepEqual(hr.parseHeartRate(view([0x01, 0x48])), { bpm: 0, rr: [] });
});

test('CSV: day-first dates, European separators, epoch seconds, CR-only lines, per-file sums', () => {
  const acc = new p.Acc();
  assert.equal(p.parseCsv('﻿Date;Steps;Weight (lbs)\r\n13/01/2026;8.123;165,4\r\n02/01/2026;9000;164,8\r\n', acc, 'eu.csv'), 2);
  assert.equal(p.parseCsv('timestamp,steps\n1767225600,5000\n', acc, 'epoch.csv'), 1);
  assert.equal(p.parseCsv('date,steps\r2026-03-01,7000\r', acc, 'cr.csv'), 1);
  p.parseCsv('date,steps\n2026-02-01,8000\n', acc, 'a.csv');
  p.parseCsv('Date,Total Steps\n2026-02-01,8000\n', acc, 'b.csv');
  const d = acc.days();
  assert.deepEqual(d['2026-01-13'], { vitals: { steps: 8123 }, body: { weight: 75 } });
  assert.equal(d['2026-01-02'].vitals.steps, 9000);
  assert.equal(d['2026-01-01'].vitals.steps, 5000);
  assert.equal(d['2026-03-01'].vitals.steps, 7000);
  assert.equal(d['2026-02-01'].vitals.steps, 8000, 'the same day in two files is not doubled');
});
