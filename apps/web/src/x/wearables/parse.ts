/* Pure, on-device parsers for health exports. No imports, so node tests can load this file directly. */
export type Kind = 'vitals' | 'sleep' | 'body';
export type Days = Record<string, Partial<Record<Kind, Record<string, number>>>>;
type Mode = 'avg' | 'sum';
const LB = 0.45359237;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Accepts ISO dates, M/D/Y(Y) dates (D/M/Y when dayFirst), epoch seconds or milliseconds and anything Date.parse understands. */
export function toDate(raw: string, dayFirst = false): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (m) { const [mo, d] = dayFirst ? [m[2]!, m[1]!] : [m[1]!, m[2]!]; return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  if (/^\d{12,13}$/.test(s)) return ymd(new Date(Number(s)));
  if (/^\d{10}$/.test(s)) return ymd(new Date(Number(s) * 1000));
  const t = Date.parse(s);
  return s && Number.isFinite(t) ? ymd(new Date(t)) : null;
}
const clock = (s: string) => { const m = s.match(/[T ](\d{2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };

/** Per-day accumulator. Sums are kept per source and the largest source wins, so a watch and a phone that both count steps are not added together. */
export class Acc {
  private cells = new Map<string, { mode: Mode; n: number; v: number; by: Map<string, number> }>();
  add(date: string | null, kind: Kind, key: string, value: number, mode: Mode = 'avg', source = '') {
    if (!date || !Number.isFinite(value)) return;
    const id = `${date}|${kind}|${key}`;
    const c = this.cells.get(id) ?? { mode, n: 0, v: 0, by: new Map<string, number>() };
    this.cells.set(id, c);
    c.n++;
    if (mode === 'sum') c.by.set(source, (c.by.get(source) ?? 0) + value); else c.v += value;
  }
  get size() { return this.cells.size; }
  days(): Days {
    const out: Days = {};
    for (const [id, c] of this.cells) {
      const [date, kind, key] = id.split('|') as [string, Kind, string];
      const v = c.mode === 'sum' ? Math.max(...c.by.values()) : c.v / c.n;
      ((out[date] ??= {})[kind] ??= {})[key] = kind === 'sleep' ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10; // sleep hours to 36 s
    }
    return out;
  }
}

/* ---------- Apple Health export.xml (streamed) ---------- */
const APPLE: Record<string, [Kind, string, Mode]> = {
  HKQuantityTypeIdentifierRestingHeartRate: ['vitals', 'rhr', 'avg'],
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: ['vitals', 'hrv', 'avg'],
  HKQuantityTypeIdentifierHeartRate: ['vitals', 'hr', 'avg'],
  HKQuantityTypeIdentifierOxygenSaturation: ['vitals', 'spo2', 'avg'],
  HKQuantityTypeIdentifierRespiratoryRate: ['vitals', 'resp', 'avg'],
  HKQuantityTypeIdentifierStepCount: ['vitals', 'steps', 'sum'],
  HKQuantityTypeIdentifierActiveEnergyBurned: ['vitals', 'active', 'sum'],
  HKQuantityTypeIdentifierBasalEnergyBurned: ['vitals', 'burned', 'sum'],
  HKQuantityTypeIdentifierBodyMass: ['body', 'weight', 'avg'],
};
const STAGE: Record<string, 'light' | 'deep' | 'rem' | 'unspec' | 'awake'> = {
  HKCategoryValueSleepAnalysisAsleepCore: 'light', HKCategoryValueSleepAnalysisAsleepDeep: 'deep', HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'unspec', HKCategoryValueSleepAnalysisAsleep: 'unspec', HKCategoryValueSleepAnalysisAwake: 'awake',
};
const ATTR = { type: /\stype="([^"]*)"/, unit: /\sunit="([^"]*)"/, value: /\svalue="([^"]*)"/, start: /\sstartDate="([^"]*)"/, end: /\sendDate="([^"]*)"/, source: /\ssourceName="([^"]*)"/ };
const appleTime = (s: string) => Date.parse(s.replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2'));
type Night = { light: number; deep: number; rem: number; unspec: number; awake: number; start: number; startS: string; end: number; endS: string };

export function appleParser(acc: Acc) {
  let buf = '';
  const nights = new Map<string, Night>();
  const record = (tag: string) => {
    const type = tag.match(ATTR.type)?.[1] ?? '';
    const start = tag.match(ATTR.start)?.[1] ?? '', end = tag.match(ATTR.end)?.[1] ?? start, source = tag.match(ATTR.source)?.[1] ?? '';
    const value = tag.match(ATTR.value)?.[1] ?? '';
    if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      const stage = STAGE[value]; const a = appleTime(start), b = appleTime(end);
      if (!stage || !(b > a)) return;
      const key = `${end.slice(0, 10)}|${source}`;
      const n = nights.get(key) ?? { light: 0, deep: 0, rem: 0, unspec: 0, awake: 0, start: Infinity, startS: '', end: -Infinity, endS: '' };
      nights.set(key, n);
      n[stage] += b - a;
      if (stage !== 'awake') { if (a < n.start) { n.start = a; n.startS = start; } if (b > n.end) { n.end = b; n.endS = end; } }
      return;
    }
    const map = APPLE[type]; if (!map) return;
    let v = Number(value); const unit = tag.match(ATTR.unit)?.[1] ?? '';
    if (map[1] === 'spo2' && v <= 1) v *= 100;
    if (map[1] === 'weight' && unit === 'lb') v *= LB;
    if (unit === 'kJ') v /= 4.184;
    acc.add(toDate(start), map[0], map[1], v, map[2], source);
    if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned') acc.add(toDate(start), 'vitals', 'burned', v, 'sum', source);
  };
  return {
    push(chunk: string) {
      buf += chunk;
      const re = /<Record\b[^>]*>/g; let m: RegExpExecArray | null, last = 0;
      while ((m = re.exec(buf))) { record(m[0]); last = re.lastIndex; }
      buf = buf.slice(Math.max(last, buf.lastIndexOf('<')));
    },
    finish() {
      const best = new Map<string, Night>();
      for (const [key, n] of nights) {
        const date = key.slice(0, 10), asleep = (x: Night) => x.light + x.deep + x.rem + x.unspec;
        const cur = best.get(date); if (!cur || asleep(n) > asleep(cur)) best.set(date, n);
      }
      const h = 3600000;
      for (const [date, n] of best) {
        const asleep = n.light + n.deep + n.rem + n.unspec; if (!asleep) continue;
        acc.add(date, 'sleep', 'hours', asleep / h);
        for (const k of ['light', 'deep', 'rem'] as const) if (n[k]) acc.add(date, 'sleep', k, n[k] / h);
        if (n.awake) acc.add(date, 'sleep', 'awake', n.awake / 60000);
        acc.add(date, 'sleep', 'bedtime', clock(n.startS));
        acc.add(date, 'sleep', 'wake', clock(n.endS));
      }
    },
  };
}

/* ---------- Fitbit / Google Takeout JSON ---------- */
type Row = Record<string, unknown>;
const num = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN);
const obj = (x: unknown): Row => (x && typeof x === 'object' ? x as Row : {});

/** Returns the number of rows read, or -1 when the file name is not a known Fitbit export. */
export function parseFitbitJson(name: string, text: string, acc: Acc, weightInLb = false): number {
  const base = name.split('/').pop()!.toLowerCase();
  const kind = (['resting_heart_rate', 'heart_rate', 'steps', 'calories', 'sleep', 'weight'] as const).find((k) => base.startsWith(`${k}-`));
  if (!kind) return -1;
  const rows: unknown = JSON.parse(text);
  if (!Array.isArray(rows)) return 0;
  for (const raw of rows) {
    const r = obj(raw), at = toDate(String(r.dateTime ?? r.date ?? ''));
    if (kind === 'resting_heart_rate') { const v = obj(r.value); if (num(v.value) > 0) acc.add(toDate(String(v.date ?? r.dateTime ?? '')), 'vitals', 'rhr', num(v.value)); }
    else if (kind === 'heart_rate') acc.add(at, 'vitals', 'hr', num(obj(r.value).bpm));
    else if (kind === 'steps') acc.add(at, 'vitals', 'steps', num(r.value), 'sum');
    else if (kind === 'calories') acc.add(at, 'vitals', 'burned', num(r.value), 'sum');
    else if (kind === 'weight') {
      const date = toDate(String(r.date ?? r.dateTime ?? ''));
      acc.add(date, 'body', 'weight', num(r.weight) * (weightInLb ? LB : 1));
      if (num(r.fat) > 0) acc.add(date, 'body', 'bodyfat', num(r.fat));
    } else if (r.mainSleep !== false && r.isMainSleep !== false) {
      const date = toDate(String(r.dateOfSleep ?? '')), s = obj(obj(r.levels).summary), min = (k: string) => num(obj(s[k]).minutes);
      acc.add(date, 'sleep', 'hours', num(r.minutesAsleep) / 60, 'sum');
      for (const k of ['deep', 'light', 'rem']) if (min(k) >= 0) acc.add(date, 'sleep', k, min(k) / 60, 'sum');
      acc.add(date, 'sleep', 'awake', Number.isFinite(min('wake')) ? min('wake') : num(r.minutesAwake), 'sum');
      acc.add(date, 'sleep', 'efficiency', num(r.efficiency));
      acc.add(date, 'sleep', 'bedtime', clock(String(r.startTime ?? '')));
      acc.add(date, 'sleep', 'wake', clock(String(r.endTime ?? '')));
    }
  }
  return rows.length;
}

/* ---------- CSV: Garmin Connect, WHOOP, Fitbit daily summaries, the Fitzen template ---------- */
export const CSV_TEMPLATE = 'date,steps,resting_hr,hrv,sleep_hours,weight,spo2,calories\n2026-01-01,8000,58,62,7.5,72.4,97,2300\n';
const DATE_COLS = new Set(['date', 'day', 'timestamp', 'datetime', 'date time', 'calendar date', 'cycle start time', 'sleep score date', 'day time', 'start time']);
const COLS: Record<string, [Kind, string, number?]> = {
  steps: ['vitals', 'steps'], 'total steps': ['vitals', 'steps'], 'step count': ['vitals', 'steps'],
  'resting hr': ['vitals', 'rhr'], 'resting heart rate': ['vitals', 'rhr'], rhr: ['vitals', 'rhr'],
  hrv: ['vitals', 'hrv'], rmssd: ['vitals', 'hrv'], 'heart rate variability': ['vitals', 'hrv'], 'overnight hrv': ['vitals', 'hrv'],
  'avg hr': ['vitals', 'hr'], 'average heart rate': ['vitals', 'hr'], 'heart rate': ['vitals', 'hr'],
  spo2: ['vitals', 'spo2'], 'average value': ['vitals', 'spo2'], 'blood oxygen': ['vitals', 'spo2'], 'avg spo2': ['vitals', 'spo2'],
  'respiratory rate': ['vitals', 'resp'], 'breathing rate': ['vitals', 'resp'], 'full sleep breathing rate': ['vitals', 'resp'],
  calories: ['vitals', 'burned'], 'total calories': ['vitals', 'burned'], 'calories burned': ['vitals', 'burned'], 'active calories': ['vitals', 'active'],
  'recovery score': ['vitals', 'recovery'], recovery: ['vitals', 'recovery'], 'day strain': ['vitals', 'strain'], strain: ['vitals', 'strain'],
  'sleep hours': ['sleep', 'hours'], 'hours slept': ['sleep', 'hours'], 'sleep duration': ['sleep', 'hours'], 'asleep duration': ['sleep', 'hours', 1 / 60],
  'deep duration': ['sleep', 'deep', 1 / 60], 'rem duration': ['sleep', 'rem', 1 / 60], 'light sleep duration': ['sleep', 'light', 1 / 60],
  'awake duration': ['sleep', 'awake'], 'sleep efficiency': ['sleep', 'efficiency'],
  weight: ['body', 'weight'], 'body fat': ['body', 'bodyfat'], bodyfat: ['body', 'bodyfat'],
};
const norm = (h: string) => h.toLowerCase().replace(/\([^)]*\)/g, ' ').split('.').pop()!.replace(/[%_-]/g, ' ').replace(/\s+/g, ' ').trim();
function split(line: string, d: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) { if (ch !== '"') cur += ch; else if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
    else if (ch === '"') q = true; else if (ch === d) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim()); return out;
}
function cell(raw: string, key: string, header: string): number {
  const s = raw.trim();
  if (!s || s === '--') return NaN;
  const dur = key === 'hours' || key === 'awake' || key === 'deep' || key === 'rem' || key === 'light';
  let v: number;
  const hm = s.match(/^(\d+)\s*h(?:\s*(\d+)\s*m(?:in)?)?$/i), colon = s.match(/^(\d+):(\d{2})(?::\d{2})?$/);
  if (dur && (hm || colon)) { const m = (hm ?? colon)!; v = Number(m[1]) + Number(m[2] ?? 0) / 60; if (key === 'awake') v *= 60; }
  else if (key === 'steps' && /^\d{1,3}([.,\s]\d{3})+$/.test(s)) v = Number(s.replace(/\D/g, '')); // 8.123 or 8,123 steps is eight thousand
  else v = parseFloat(/^-?\d{1,3}(,\d{3})+(\.\d+)?/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.'));
  if (key === 'weight' && /lb/i.test(s + header)) v *= LB;
  if (key === 'spo2' && v <= 1) v *= 100;
  return v;
}

/** Returns the number of data rows that produced at least one value, or -1 when no date column was found. Sums are kept per source (file), so two files with the same days are not added together. */
export function parseCsv(text: string, acc: Acc, source = ''): number {
  const lines = text.replace(/^﻿/, '').split(/\r\n?|\n/);
  for (let h = 0; h < Math.min(3, lines.length); h++) {
    const head = lines[h]!;
    const d = [',', ';', '\t'].reduce((a, b) => (head.split(b).length > head.split(a).length ? b : a));
    const cols = split(head, d), names = cols.map(norm), dateAt = names.findIndex((n) => DATE_COLS.has(n));
    if (dateAt < 0) continue;
    let used = 0;
    const rows = lines.slice(h + 1).filter((l) => l.trim()).map((l) => split(l, d));
    // Day-first (13/01/2026) when any slash date in the file has a first part above 12; one file uses one order.
    const dayFirst = rows.some((c) => Number(c[dateAt]?.match(/^(\d{1,2})\/\d{1,2}\//)?.[1]) > 12);
    for (const cells of rows) {
      const date = toDate(cells[dateAt] ?? '', dayFirst);
      let got = false;
      names.forEach((n, i) => {
        const map = COLS[n]; if (!map || !date) return;
        const v = cell(cells[i] ?? '', map[1], cols[i]!) * (map[2] ?? 1);
        if (Number.isFinite(v)) { acc.add(date, map[0], map[1], v, map[1] === 'steps' || map[0] === 'vitals' && /calories/.test(n) ? 'sum' : 'avg', source); got = true; }
      });
      if (got) used++;
    }
    return used;
  }
  return -1;
}
