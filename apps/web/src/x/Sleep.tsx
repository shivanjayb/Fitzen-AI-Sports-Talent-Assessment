import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getWellnessRecords, saveWellnessRecord, subscribeWellness, validateWellness, wellnessToday, type WellnessInput, type WellnessRecord } from '../app/wellnessStore';
import { dayStart, fmt, mean, pointsFor, series, shortDate, useSampleMode } from './sample';
import { Card, CardHead, Dialog, Icon, MetricTile, PageHead, Soon, Stat, toast, useExplore } from './ui';
import { circular, clock, clockDiff, parseClock, sleepDebt, sleepHours, socialJetLag } from './sleepMath';
import { goalsError, readGoals, reminderOn, setReminder, writeGoals, type Goals } from './sleepGoals';
import { recoveryDays } from './recovery';
import './sleep.css';

const TILES = ['performance', 'efficiency', 'deep', 'rem', 'light', 'awake'];
const GROUP = ['sleep', ...TILES];
const STAGES = [['Deep', 't-accent'], ['REM', 't-violet'], ['Light', 't-blue']] as const;
const PAST = ['#bdbdb7', '#ffffff2e', '#ffffff0f'], NOW = ['var(--x-accent)', 'var(--x-violet)', 'var(--x-blue)'];
const DAY = 864e5;
const longDay = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** One night, dated by the wake-up day: stage hours (deep, REM, light) when a watch recorded them, else a single total. */
interface Night { date: Date; stages: number[]; bed?: number; wake?: number }
const hoursOf = (n: Night) => n.stages.reduce((a, b) => a + b, 0);
function sampleNights(days: number): Night[] {
  const [deep, rem, light] = ['deep', 'rem', 'light'].map((id) => series(id, days));
  return deep!.map((p, i) => {
    const stages = [p.value, rem![i]!.value, light![i]!.value], wake = 420 + ((p.date.getDate() * 37) % 50) - 25 + (p.date.getDay() % 6 ? 0 : 50);
    return { date: p.date, stages, wake, bed: Math.round(wake - stages.reduce((a, b) => a + b, 0) * 60 + 1440) % 1440 };
  });
}
/** Latest entry per date, oldest first (records arrive newest first). */
function ownNights(records: WellnessRecord[]): Night[] {
  const seen = new Set<string>(), out: Night[] = [];
  for (const r of records) if (r.kind === 'sleep' && r.values.hours !== undefined && !seen.has(r.date)) {
    const { hours, deep, rem, light, bedtime, wake } = r.values;
    seen.add(r.date);
    out.push({ date: new Date(`${r.date}T12:00:00`), stages: deep !== undefined && rem !== undefined && light !== undefined ? [deep, rem, light] : [hours], bed: bedtime, wake });
  }
  return out.reverse();
}
const duration = (min: number) => { const m = Math.round(Math.abs(min)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };

const ManageSources = () => <Link className="x-btn ghost" to="/integrations">Manage sources<Icon name="arrow" /></Link>;
const Empty = ({ label }: { label: string }) => <div className="x-sleep-empty">
  <p className="x-empty">{label} appears once a connected source records it.</p>
  <Link className="x-btn small ghost" to="/integrations">Connect a source</Link>
</div>;

function StackChart({ nights, sample }: { nights: Night[]; sample: boolean }) {
  const n = nights.length, slot = 100 / Math.max(n, 14), max = Math.max(.1, ...nights.map(hoursOf)) * 1.06;
  return <div className="x-sleep-chart">
    <span className="x-sleep-vplot">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Sleep: ${n} of the last ${Math.max(n, 14)} nights recorded`}>
        {nights.map((night, i) => {
          const x = 100 - (n - i - .5) * slot - 2.15;
          let top = 100;
          return night.stages.map((h, s) => {
            const height = (h / max) * 100;
            top -= height;
            return <rect key={`${i}-${s}`} x={x} width={4.3} y={top + .4} height={Math.max(0, height - .4)} fill={(i === n - 1 ? NOW : PAST)[s]} />;
          });
        })}
      </svg>
    </span>
    <span className="x-sleep-vscale"><span>{shortDate(nights[0]!.date)}</span><span>{n} nights</span><span>{sample ? 'Last night' : shortDate(nights[n - 1]!.date)}</span></span>
  </div>;
}

function LastNight({ nights, avg30, sample }: { nights: Night[]; avg30: number; sample: boolean }) {
  const { open } = useExplore();
  const last = nights[nights.length - 1];
  const title = sample ? 'Last night' : 'Last recorded night';
  if (!last) return <Card tone="dark" className="x-sleep-hero"><CardHead title={title} /><Empty label="Sleep" />
    <p className="x-sleep-hint">Or log a night yourself with Log sleep.</p></Card>;
  const hours = hoursOf(last), pct = ((hours - avg30) / avg30) * 100, steady = Math.abs(pct) < 1;
  const badge = steady ? 'Steady' : `${pct > 0 ? '↑' : '↓'} ${fmt(Math.abs(pct), 1)}%`;
  const caption = steady ? 'Within 1% of your 30-day average' : `${fmt(Math.abs(pct), 1)}% ${pct > 0 ? 'above' : 'below'} your 30-day average`;
  return <Card tone="dark" className="x-sleep-hero">
    <CardHead title={<>{title} <span className="x-sleep-muted">· {longDay(last.date)}</span></>} badge={badge} badgeTitle={caption}
      onOpen={() => open('sleep', GROUP)} openLabel="Open sleep details" />
    <div className="x-sleep-hero-body">
      <div className="x-sleep-hero-main">
        <Stat value={fmt(hours, 1)} unit="hours asleep" big={64} />
        <span className="x-caption">{caption}</span>
        {last.stages.length === 3 && <>
          <div className="x-sleep-stage-bar" role="img" aria-label={STAGES.map(([name], s) => `${name} ${fmt(last.stages[s]!, 1)} hours`).join(', ')}>
            {STAGES.map(([name, tone], s) => <i key={name} className={tone} style={{ flexGrow: last.stages[s] }} />)}
          </div>
          <ul className="x-sleep-stage-list">{STAGES.map(([name, tone], s) =>
            <li key={name}><i className={tone} /><span>{name}</span><b>{fmt(last.stages[s]!, 1)}<small>h</small></b></li>)}</ul>
        </>}
      </div>
      <StackChart nights={nights} sample={sample} />
    </div>
    <div className="x-sleep-hero-foot">30-day avg hours <b>{fmt(avg30, 1)}</b></div>
  </Card>;
}

function GoalsCard({ nights, sample, goals, onChange }: { nights: Night[]; sample: boolean; goals: Goals; onChange: () => void }) {
  const hours = nights.map(hoursOf), met = hours.filter((h) => h >= goals.sleep).length;
  const recent = sleepDebt(hours.slice(-7), goals.sleep), before = hours.slice(-14, -7), diff = recent - sleepDebt(before, goals.sleep);
  const days = Array.from({ length: 14 }, (_, i) => new Date(dayStart().getTime() - (13 - i) * DAY));
  const readings = recoveryDays(days, (id) => pointsFor(id, 60, sample), goals.sleep).filter((r) => r !== null);
  const recovery = readings.filter((r) => r.value >= goals.recovery).length;
  const scale = Math.max(...hours, goals.sleep) * 1.12;
  const none = 'Appears once you log or connect your sleep.';
  return <Card tone="night" className="x-sleep-goals">
    <CardHead title="Your goals"><button className="x-btn small x-sleep-change" onClick={onChange}>Change goals</button></CardHead>
    <ul className="x-sleep-goal-list">
      <li><span><b>Sleep goal</b><small>{hours.length ? `Met on ${met} of ${hours.length} recorded nights in the last ${Math.max(hours.length, 14)} days` : none}</small></span>
        <span className="x-sleep-goal-value"><b>{fmt(goals.sleep, goals.sleep % 1 ? 2 : 0)}</b><small>h</small></span></li>
      <li><span><b>Sleep debt · last 7 nights</b><small>{!hours.length ? none : !before.length ? 'Below your goal across your recorded nights'
        : Math.abs(diff) < .05 ? 'Same as the 7 nights before' : `${fmt(Math.abs(diff), 1)} h ${diff > 0 ? 'more' : 'less'} than the 7 nights before`}</small></span>
        <span className="x-sleep-goal-value"><b>{hours.length ? fmt(recent, 1) : '–'}</b><small>h</small></span></li>
      <li><span><b>Recovery goal</b><small>{readings.length ? `Reached on ${recovery} of ${readings.length} days with a reading in the last 14${readings.some((r) => r.estimate) ? ' · includes Fitzen estimates' : ''}` : 'Appears once a source records recovery, or after 7 days of HRV or resting heart rate.'}</small></span>
        <span className="x-sleep-goal-value"><b>{goals.recovery}</b><small>%</small></span></li>
    </ul>
    {hours.length > 0 && <div className="x-sleep-goal-chart">
      <span className="x-sleep-goal-title">Last {hours.length} recorded nights</span>
      <div className="x-sleep-goal-bars" role="img" aria-label={`Sleep on the last ${hours.length} recorded nights against your ${fmt(goals.sleep, 2)} hour goal`}>
        {nights.map((night, i) => <i key={i} className={hours[i]! >= goals.sleep ? 'met' : undefined} style={{ height: `${(hours[i]! / scale) * 100}%` }}
          title={`${shortDate(night.date)}: ${fmt(hours[i]!, 1)} h`} />)}
        <span className="x-sleep-goal-line" style={{ bottom: `${(goals.sleep / scale) * 100}%` }}><b>{fmt(goals.sleep, goals.sleep % 1 ? 2 : 0)} h goal</b></span>
      </div>
      <div className="x-sleep-goal-scale"><span>{shortDate(nights[0]!.date)}</span><span>{shortDate(nights[nights.length - 1]!.date)}</span></div>
      <div className="x-legend"><span><i className="t-accent" />Goal met</span><span><i className="x-sleep-goal-key" />Below goal</span></div>
    </div>}
  </Card>;
}

function ScheduleCard({ nights, goals }: { nights: Night[]; goals: Goals }) {
  const timed = nights.filter((n): n is Night & { bed: number; wake: number } => n.bed !== undefined && n.wake !== undefined);
  const bed = circular(timed.map((n) => n.bed)), wake = circular(timed.map((n) => n.wake));
  const lag = socialJetLag(timed.map((n) => ({ weekday: n.date.getDay(), bed: n.bed, wake: n.wake })));
  const [on, setOn] = useState(reminderOn);
  const toggle = async () => { toast(await setReminder(!on)); setOn(reminderOn()); };
  const vsTarget = (avg: number, target: number) => { const d = clockDiff(avg, target); return Math.abs(d) < 5 ? 'On your target' : `${duration(d)} ${d > 0 ? 'later' : 'earlier'} than your ${clock(target)} target`; };
  const row = (label: string, s: { mean: number; sd: number } | null, target: number) => <li>
    <span><b>{label}</b><small>{s ? `${vsTarget(s.mean, target)} · varies ±${duration(s.sd)}` : `Target ${clock(target)}`}</small></span>
    <span className="x-sleep-goal-value"><b>{s ? clock(s.mean) : '–'}</b></span>
  </li>;
  return <Card className="x-sleep-schedule">
    <CardHead title={<>Your schedule <span className="x-sleep-muted-light">· {timed.length} of the last 14 nights with times</span></>} />
    {timed.length ? <ul className="x-sleep-goal-list">
      {row('Average bedtime', bed, goals.bedtime)}
      {row('Average wake time', wake, goals.wake)}
      <li><span><b>Weekday to weekend shift</b><small>{lag === null ? 'Needs nights before both work days and weekends' : 'Gap between your weekday and weekend mid-sleep (social jet lag)'}</small></span>
        <span className="x-sleep-goal-value"><b>{lag === null ? '–' : duration(lag)}</b></span></li>
    </ul> : <p className="x-empty x-sleep-schedule-empty">Log a night with your bedtime and wake time to see how regular your schedule is.</p>}
    <div className="x-sleep-reminder">
      <button className="x-chip" aria-pressed={on} onClick={toggle}><Icon name="sleep" />Bedtime reminder {on ? 'on' : 'off'}</button>
      <span>30 minutes before {clock(goals.bedtime)}. It only fires while Fitzen is open in your browser.</span>
    </div>
  </Card>;
}

function GoalsDialog({ goals, onSave, onClose }: { goals: Goals; onSave: (g: Goals) => void; onClose: () => void }) {
  const [sleep, setSleep] = useState(String(goals.sleep)), [recovery, setRecovery] = useState(String(goals.recovery));
  const [bed, setBed] = useState(clock(goals.bedtime)), [wake, setWake] = useState(clock(goals.wake));
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = { sleep: Number(sleep), recovery: Number(recovery), bedtime: parseClock(bed) ?? NaN, wake: parseClock(wake) ?? NaN };
    const err = sleep && recovery ? goalsError(next) : 'Fill in both goals.';
    if (err) return setError(err);
    if (!writeGoals(next)) toast('Device storage is blocked. Goals last until this tab closes.');
    onSave(next);
  };
  return <Dialog open onClose={onClose} kicker="Sleep" title="Your goals">
    <form onSubmit={submit} noValidate>
      <p className="x-sleep-dialog-lede">Set targets that suit you. Fitzen compares your recorded nights and recovery with them.</p>
      <div className="x-form-grid">
        <label className="x-field">Sleep goal (hours)<input type="number" min={4} max={12} step={0.25} value={sleep} onChange={(e) => setSleep(e.target.value)} aria-invalid={!!error} /></label>
        <label className="x-field">Recovery goal (%)<input type="number" min={1} max={100} step={1} value={recovery} onChange={(e) => setRecovery(e.target.value)} aria-invalid={!!error} /></label>
        <label className="x-field">Target bedtime<input type="time" value={bed} onChange={(e) => setBed(e.target.value)} aria-invalid={!!error} /></label>
        <label className="x-field">Target wake time<input type="time" value={wake} onChange={(e) => setWake(e.target.value)} aria-invalid={!!error} /></label>
      </div>
      {error && <p className="x-sleep-error" role="alert">{error}</p>}
      <div className="x-form-actions x-sleep-dialog-foot"><span>Saved on this device.</span><button className="x-btn" type="submit">Save goals</button></div>
    </form>
  </Dialog>;
}

function LogSleepDialog({ goals, onClose }: { goals: Goals; onClose: () => void }) {
  const [date, setDate] = useState(wellnessToday);
  const [bed, setBed] = useState(clock(goals.bedtime)), [wake, setWake] = useState(clock(goals.wake)), [awake, setAwake] = useState('');
  const [error, setError] = useState<string | null>(null);
  const b = parseClock(bed), w = parseClock(wake), a = awake.trim() ? Number(awake) : 0;
  const hours = b !== null && w !== null && Number.isFinite(a) ? sleepHours(b, w, a) : NaN;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (b === null || w === null) return setError('Enter your bedtime and wake time.');
    if (!Number.isInteger(a) || a < 0) return setError('Awake time is whole minutes, 0 or more.');
    if (!(hours > 0)) return setError(b === w ? 'Bedtime and wake time cannot be the same.' : 'Awake time is longer than the time in bed.');
    const input: WellnessInput = { kind: 'sleep', date, title: 'Sleep', note: '', unit: 'hours',
      values: { hours: Math.round(hours * 100) / 100, bedtime: b, wake: w, ...(awake.trim() ? { awake: a } : {}) } };
    const err = validateWellness(input);
    if (err) return setError(err);
    try { saveWellnessRecord(input); } catch (x) { return setError(x instanceof Error ? x.message : 'This night could not be saved.'); }
    toast('Sleep saved.'); onClose();
  };
  return <Dialog open onClose={onClose} kicker="Sleep" title="Log sleep">
    <form onSubmit={submit} noValidate>
      <div className="x-form-grid">
        <label className="x-field">Woke up on<input type="date" max={wellnessToday()} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!error} /></label>
        <label className="x-field">Awake in the night (min, optional)<input type="number" inputMode="numeric" min={0} max={600} step={1} placeholder="0" value={awake} onChange={(e) => setAwake(e.target.value)} aria-invalid={!!error} /></label>
        <label className="x-field">Bedtime<input type="time" value={bed} onChange={(e) => setBed(e.target.value)} aria-invalid={!!error} /></label>
        <label className="x-field">Wake time<input type="time" value={wake} onChange={(e) => setWake(e.target.value)} aria-invalid={!!error} /></label>
      </div>
      <p className="x-sleep-dialog-lede x-sleep-total" role="status">{hours > 0 ? `${fmt(hours, 2)} hours asleep` : 'Enter a bedtime and wake time.'}</p>
      {error && <p className="x-sleep-error" role="alert">{error}</p>}
      <div className="x-form-actions x-sleep-dialog-foot"><span>Saved to your own records.</span><button className="x-btn" type="submit">Save night</button></div>
    </form>
  </Dialog>;
}

export default function Sleep() {
  const sample = useSampleMode();
  const [records, setRecords] = useState(getWellnessRecords);
  useEffect(() => subscribeWellness(() => setRecords(getWellnessRecords())), []);
  const [goals, setGoals] = useState(readGoals);
  const [dialog, setDialog] = useState<'goals' | 'log' | null>(null);
  const own = ownNights(records), since = dayStart().getTime() - 29 * DAY;
  const nights = sample ? sampleNights(14) : own.slice(-14);
  const avg30 = mean((sample ? sampleNights(30) : own.filter((n) => n.date.getTime() >= since)).map(hoursOf)) || (nights.length ? hoursOf(nights[nights.length - 1]!) : 0);
  const last = nights[nights.length - 1];
  const subtitle = last ? `Your last recorded night · ${longDay(last.date)} · from ${sample ? 'Sample data' : 'your records'}` : 'No nights recorded yet.';
  return <>
    <PageHead title="Sleep" subtitle={subtitle}>
      <button className="x-btn small" onClick={() => setDialog('log')}><Icon name="plus" />Log sleep</button>
      <ManageSources />
    </PageHead>
    <div className="x-sleep-grid">
      <LastNight nights={nights} avg30={avg30} sample={sample} />
      <GoalsCard nights={nights} sample={sample} goals={goals} onChange={() => setDialog('goals')} />
      <ScheduleCard nights={nights} goals={goals} />
      {TILES.map((id) => <MetricTile key={id} id={id} group={GROUP} lastLabel="Last night" />)}
      <Card className="x-sleep-perf">
        <CardHead title="Sleep and your performance"><Soon /></CardHead>
        <p className="x-sleep-perf-line"><Icon name="sleep" />Fitzen will link your sleep to your assessment scores, so you can see how a short night changes your reps, jumps and form.</p>
      </Card>
    </div>
    {dialog === 'goals' && <GoalsDialog goals={goals} onClose={() => setDialog(null)} onSave={(g) => { setGoals(g); setDialog(null); toast('Goals saved.'); }} />}
    {dialog === 'log' && <LogSleepDialog goals={goals} onClose={() => setDialog(null)} />}
  </>;
}
