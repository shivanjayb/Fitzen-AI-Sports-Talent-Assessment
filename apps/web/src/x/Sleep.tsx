import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getWellnessRecords, saveWellnessRecord, subscribeWellness, validateWellness, wellnessToday, type WellnessInput, type WellnessRecord } from '../app/wellnessStore';
import { METRICS, dayStart, fmt, mean, series, shortDate, useSampleMode } from './sample';
import { Card, CardHead, Dialog, Icon, MetricTile, PageHead, Soon, Stat, toast, useExplore } from './ui';
import './sleep.css';

const TILES = ['performance', 'efficiency', 'deep', 'rem', 'light', 'awake'];
const GROUP = ['sleep', ...TILES];
const STAGES = [['Deep', 't-accent'], ['REM', 't-violet'], ['Light', 't-blue']] as const;
const PAST = ['#bdbdb7', '#ffffff2e', '#ffffff0f'], NOW = ['var(--x-accent)', 'var(--x-violet)', 'var(--x-blue)'];
const DAY = 864e5;
const longDay = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** One night: stage hours (deep, REM, light) from a source, or a single total from the user's own log. */
interface Night { date: Date; stages: number[] }
const hoursOf = (n: Night) => n.stages.reduce((a, b) => a + b, 0);
function sampleNights(days: number): Night[] {
  const [deep, rem, light] = ['deep', 'rem', 'light'].map((id) => series(id, days));
  return deep!.map((p, i) => ({ date: p.date, stages: [p.value, rem![i]!.value, light![i]!.value] }));
}
/** Latest entry per date, oldest first (records arrive newest first). */
function ownNights(records: WellnessRecord[]): Night[] {
  const seen = new Set<string>(), out: Night[] = [];
  for (const r of records) if (r.kind === 'sleep' && r.values.hours !== undefined && !seen.has(r.date)) {
    seen.add(r.date); out.push({ date: new Date(`${r.date}T12:00:00`), stages: [r.values.hours] });
  }
  return out.reverse();
}

/* ---------- goals: a local preference ---------- */
interface Goals { sleep: number; recovery: number }
const GOALS_KEY = 'fitzen-sleep-goals';
const goalsError = (g: Goals) =>
  !Number.isFinite(g.sleep) || g.sleep < 4 || g.sleep > 12 || (g.sleep * 4) % 1 !== 0 ? 'Choose a sleep goal from 4 to 12 hours, in quarter hours.'
    : !Number.isInteger(g.recovery) || g.recovery < 1 || g.recovery > 100 ? 'Choose a recovery goal from 1 to 100%.' : null;
function readGoals(): Goals {
  try {
    const g = JSON.parse(localStorage.getItem(GOALS_KEY) ?? 'null') as Partial<Goals> | null;
    if (g && typeof g.sleep === 'number' && typeof g.recovery === 'number' && !goalsError({ sleep: g.sleep, recovery: g.recovery })) return { sleep: g.sleep, recovery: g.recovery };
  } catch { /* damaged or blocked storage: fall back to defaults */ }
  return { sleep: 8, recovery: 66 };
}

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
      onOpen={sample ? () => open('sleep', GROUP) : undefined} openLabel="Open sleep details" />
    <div className="x-sleep-hero-body">
      <div className="x-sleep-hero-main">
        <Stat value={fmt(hours, 1)} unit="hours asleep" big={64} />
        <span className="x-caption">{caption}</span>
        {sample && <>
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
  const debt = (hs: number[]) => hs.reduce((a, h) => a + Math.max(0, goals.sleep - h), 0);
  const recent = debt(hours.slice(-7)), before = hours.slice(-14, -7), diff = recent - debt(before);
  const recovery = series('recovery', 14).filter((p) => p.value >= goals.recovery).length;
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
      <li><span><b>Recovery goal</b><small>{sample ? `Reached on ${recovery} of 14 days in the last 14` : 'Appears once a connected source records it.'}</small></span>
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

function GoalsDialog({ goals, onSave, onClose }: { goals: Goals; onSave: (g: Goals) => void; onClose: () => void }) {
  const [sleep, setSleep] = useState(String(goals.sleep)), [recovery, setRecovery] = useState(String(goals.recovery));
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = { sleep: Number(sleep), recovery: Number(recovery) }, err = sleep && recovery ? goalsError(next) : 'Fill in both goals.';
    if (err) return setError(err);
    try { localStorage.setItem(GOALS_KEY, JSON.stringify(next)); } catch { toast('Device storage is blocked. Goals last until this tab closes.'); }
    onSave(next);
  };
  return <Dialog open onClose={onClose} kicker="Sleep" title="Your goals">
    <form onSubmit={submit} noValidate>
      <p className="x-sleep-dialog-lede">Set targets that suit you. Fitzen compares your recorded nights and recovery with them.</p>
      <div className="x-form-grid">
        <label className="x-field">Sleep goal (hours)<input type="number" min={4} max={12} step={0.25} value={sleep} onChange={(e) => setSleep(e.target.value)} aria-invalid={!!error} /></label>
        <label className="x-field">Recovery goal (%)<input type="number" min={1} max={100} step={1} value={recovery} onChange={(e) => setRecovery(e.target.value)} aria-invalid={!!error} /></label>
      </div>
      {error && <p className="x-sleep-error" role="alert">{error}</p>}
      <div className="x-form-actions x-sleep-dialog-foot"><span>Saved on this device.</span><button className="x-btn" type="submit">Save goals</button></div>
    </form>
  </Dialog>;
}

function LogSleepDialog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(wellnessToday), [hours, setHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input: WellnessInput = { kind: 'sleep', date, title: 'Sleep', note: '', unit: 'hours', values: { hours: hours.trim() ? Number(hours) : NaN } };
    const err = validateWellness(input);
    if (err) return setError(err);
    try { saveWellnessRecord(input); } catch (x) { return setError(x instanceof Error ? x.message : 'This night could not be saved.'); }
    toast('Sleep saved.'); onClose();
  };
  return <Dialog open onClose={onClose} kicker="Sleep" title="Log sleep">
    <form onSubmit={submit} noValidate>
      <div className="x-form-grid">
        <label className="x-field">Night of<input type="date" max={wellnessToday()} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!error} /></label>
        <label className="x-field">Hours asleep<input type="number" inputMode="decimal" min={0} max={24} step={0.25} placeholder="7.5" value={hours} onChange={(e) => setHours(e.target.value)} aria-invalid={!!error} /></label>
      </div>
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
  const subtitle = last ? `Your last recorded night · ${longDay(last.date)} · from ${sample ? 'Sample data' : 'your own entries'}` : 'No nights recorded yet.';
  return <>
    <PageHead title="Sleep" subtitle={subtitle}>
      <button className="x-btn small" onClick={() => setDialog('log')}><Icon name="plus" />Log sleep</button>
      <ManageSources />
    </PageHead>
    <div className="x-sleep-grid">
      <LastNight nights={nights} avg30={avg30} sample={sample} />
      <GoalsCard nights={nights} sample={sample} goals={goals} onChange={() => setDialog('goals')} />
      {TILES.map((id) => sample ? <MetricTile key={id} id={id} group={GROUP} lastLabel="Last night" />
        : <Card key={id}><CardHead title={METRICS[id]!.label} /><Empty label={METRICS[id]!.label} /></Card>)}
      <Card className="x-sleep-perf">
        <CardHead title="Sleep and your performance"><Soon /></CardHead>
        <p className="x-sleep-perf-line"><Icon name="sleep" />Fitzen will link your sleep to your assessment scores, so you can see how a short night changes your reps, jumps and form.</p>
      </Card>
    </div>
    {dialog === 'goals' && <GoalsDialog goals={goals} onClose={() => setDialog(null)} onSave={(g) => { setGoals(g); setDialog(null); toast('Goals saved.'); }} />}
    {dialog === 'log' && <LogSleepDialog onClose={() => setDialog(null)} />}
  </>;
}
