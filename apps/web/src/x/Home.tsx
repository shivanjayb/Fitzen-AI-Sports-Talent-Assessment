import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EXERCISES, exerciseById } from '@fitzen/engines';
import { ExerciseArt, FigureArt } from '../app/Figure';
import { getHistory, measureOf, type SavedSession } from '../app/store';
import { getWellnessRecords, saveWellnessRecord, subscribeWellness, validateWellness, wellnessToday, type WellnessInput, type WellnessRecord } from '../app/wellnessStore';
import { CUSTOMIZE_EVENT } from './XShell';
import { Card, CardHead, Dialog, Icon, MetricTile, MiniChart, PageHead, Soon, Stat, toast, useExplore, type Tone } from './ui';
import { METRICS, dayStart, fmt, longDate, mean, series, setSampleMode, shortDate, useSampleMode, versusAverage, type Point } from './sample';
import './home.css';

const HOME = ['recovery', 'hrv', 'rhr', 'sleep', 'strain', 'hr'];
const NEWS_GROUP = [...HOME, 'deep', 'steps'];
// Colour belongs to the slot, not the metric (Xeyo edit mode).
const SLOT_TONES: Tone[] = ['dark', 'light', 'light', 'night', 'light', 'pulse'];
const LAYOUT_KEY = 'fitzen-home-layout';
const HEART = 'M12 20.5s-7.6-4.5-9.7-9.1C.8 8 2.9 4 6.8 4c2.2 0 3.7 1.2 5.2 3.1C13.5 5.2 15 4 17.2 4c3.9 0 6 4 4.5 7.4-2.1 4.6-9.7 9.1-9.7 9.1z';
const MOODS = ['', 'Bad', 'Low', 'Okay', 'Good', 'Great'];
const SAMPLE_MOODS = ['Good', 'Low', 'Good', 'Great', 'Okay', 'Good'];
const SUMMARY = ['rhr', 'spo2', 'hrv', 'sleep', 'recovery', 'resp', 'skin', 'performance', 'efficiency', 'deep', 'rem', 'light', 'awake', 'steps', 'active', 'strain', 'burned', 'hr'];
const SOURCES: Record<string, [WellnessRecord['kind'], string]> = { hrv: ['vitals', 'hrv'], rhr: ['vitals', 'rhr'], sleep: ['sleep', 'hours'] };
const FIGURE = exerciseById('warrior-ii') ?? EXERCISES[0]!; // arms spread wide, like the Vitruvian figure

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysBack = (n: number) => { const t = dayStart(); return Array.from({ length: n }, (_, i) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - (n - 1 - i))); };
const recordDate = (date: string) => new Date(`${date}T12:00:00`);
const lastOf = (id: string) => series(id, 30).at(-1)!.value;

interface Layout { order: string[]; removed: string[] }
function loadLayout(): Layout {
  try {
    const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null') as Partial<Layout> | null;
    const ok = (xs: unknown) => Array.isArray(xs) ? xs.filter((id): id is string => typeof id === 'string' && HOME.includes(id)) : [];
    return { order: [...new Set([...ok(v?.order), ...HOME])], removed: ok(v?.removed) };
  } catch { return { order: HOME, removed: [] }; }
}

function useWellness() {
  const [records, setRecords] = useState(getWellnessRecords);
  useEffect(() => subscribeWellness(() => setRecords(getWellnessRecords())), []);
  return records;
}

export default function Home() {
  const sample = useSampleMode();
  const records = useWellness();
  const [sessions] = useState(() => getHistory().slice().sort((a, b) => b.report.startedAt.localeCompare(a.report.startedAt)));
  const [saved, setSaved] = useState(loadLayout);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [summary, setSummary] = useState(false);
  useEffect(() => {
    const on = () => setDraft((d) => d ?? loadLayout());
    window.addEventListener(CUSTOMIZE_EVENT, on);
    return () => window.removeEventListener(CUSTOMIZE_EVENT, on);
  }, []);

  const layout = draft ?? saved;
  const visible = layout.order.filter((id) => !layout.removed.includes(id));
  const move = (id: string, by: number) => setDraft((d) => {
    if (!d) return d;
    const vis = d.order.filter((x) => !d.removed.includes(x)), i = vis.indexOf(id), j = i + by;
    if (i < 0 || j < 0 || j >= vis.length) return d;
    [vis[i], vis[j]] = [vis[j]!, vis[i]!];
    return { order: [...vis, ...d.removed], removed: d.removed };
  });
  const done = () => {
    if (draft) { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(draft)); } catch { /* private mode: layout lasts this visit */ } setSaved(draft); }
    setDraft(null);
    toast('Dashboard saved.');
  };

  const tiles = visible.map((id, slot) => {
    const tone = SLOT_TONES[slot] ?? 'light', label = METRICS[id]!.label;
    const tools = draft && <span className="x-home-tools">
      <button className="x-icon-btn small" aria-label={`Move ${label} earlier`} disabled={slot === 0} onClick={() => move(id, -1)}>←</button>
      <button className="x-icon-btn small" aria-label={`Move ${label} later`} disabled={slot === visible.length - 1} onClick={() => move(id, 1)}>→</button>
      <button className="x-icon-btn small" aria-label={`Remove ${label}`} onClick={() => setDraft((d) => d && { ...d, removed: [...d.removed, id] })}><Icon name="close" /></button>
    </span>;
    const cls = `x-home-tile x-home-${id}${draft ? ' is-editing' : ''}`;
    if (!sample) return id === 'recovery'
      ? <GetStarted key={id} className={cls}>{tools}</GetStarted>
      : <RealTile key={id} id={id} tone={tone} records={records} className={cls}>{tools}</RealTile>;
    return <MetricTile key={id} id={id} tone={tone} group={HOME} lastLabel={id === 'sleep' ? 'Last night' : undefined} className={cls}>
      {id === 'sleep' && <Stages />}
      {id === 'hr' && <span className="x-home-beat" aria-hidden><svg viewBox="0 0 24 24"><path d={HEART} fill="#fff" /></svg></span>}
      {tools}
    </MetricTile>;
  });

  const weekAgo = isoDay(daysBack(7)[0]!);
  const checkins = records.filter((r) => r.kind === 'journal' && r.date >= weekAgo).length;

  return <>
    <PageHead title="Home" hidden />
    {draft && <div className="x-home-editbar" role="region" aria-label="Customize your dashboard">
      <span>Move or remove tiles. Colours stay with each position.</span>
      {draft.removed.length > 0 && <button className="x-text-button" onClick={() => setDraft({ ...draft, removed: [] })}>Restore {draft.removed.length} removed</button>}
      <button className="x-chip" onClick={() => setDraft(null)}>Cancel</button>
      <button className="x-chip x-home-done" onClick={done}>Done</button>
    </div>}
    <div className="x-home-grid">
      {tiles}
      <MonthCard sample={sample} records={records} sessions={sessions} />
      <Calories sample={sample} records={records} />
      <Weight sample={sample} records={records} />
      <Week sample={sample} records={records} onSummary={() => setSummary(true)} />
      <TrainNow />
      <LatestReport session={sessions[0]} />
      <ProgressCard sessions={sessions} />
      <Demo />
    </div>
    <Summary open={summary} onClose={() => setSummary(false)} sample={sample} checkins={checkins} />
  </>;
}

function Stages() {
  const [d, r, l] = [lastOf('deep'), lastOf('rem'), lastOf('light')];
  return <>
    <div className="x-home-stages" role="img" aria-label={`Deep ${d} hours, REM ${r} hours, Light ${l} hours`}>
      <i className="t-accent" style={{ flex: d }} /><i className="t-violet" style={{ flex: r }} /><i className="t-blue" style={{ flex: l }} />
    </div>
    <div className="x-legend"><span><i className="t-accent" />Deep {fmt(d, 1)} h</span><span><i className="t-violet" />REM {fmt(r, 1)} h</span><span><i className="t-blue" />Light {fmt(l, 1)} h</span></div>
  </>;
}

const Empty = ({ what }: { what: string }) => <div className="x-home-empty">
  <p className="x-empty">{what} appears once a connected source records it.</p>
  <Link className="x-btn small ghost" to="/integrations">Connect a source</Link>
</div>;

/** Real-data tile: the user's own vitals/sleep records, else Xeyo's empty state. */
function RealTile({ id, tone, records, className, children }: { id: string; tone: Tone; records: WellnessRecord[]; className: string; children: ReactNode }) {
  const m = METRICS[id]!, src = SOURCES[id];
  const pts: Point[] = src ? records.filter((r) => r.kind === src[0] && r.values[src[1]] !== undefined).slice(0, 14).reverse()
    .map((r) => ({ date: recordDate(r.date), value: r.values[src[1]]! })) : [];
  const last = pts.at(-1);
  return <Card tone={tone} className={className}>
    <CardHead title={m.label} />
    {last ? <>
      <Stat value={fmt(last.value, m.digits)} unit={m.unit} />
      <span className="x-caption">Last entry {shortDate(last.date)}</span>
      {pts.length > 1 && pts.some((p) => p.value > 0) && <MiniChart points={pts} kind={m.chart} tone={tone} digits={m.digits} lastLabel={shortDate(last.date)} label={m.label} />}
    </> : <Empty what={m.label} />}
    {children}
  </Card>;
}

function GetStarted({ className, children }: { className: string; children: ReactNode }) {
  return <Card tone="dark" className={`${className} x-home-start`}>
    <CardHead title="Get started" />
    <p>Three steps to fill your dashboard with your own data.</p>
    <ol className="x-home-steps">
      <li><Link to="/integrations"><b>1</b>Connect a wearable<Soon /></Link></li>
      <li><Link to="/journal"><b>2</b>Write your first check-in</Link></li>
      <li><Link to="/nutrition"><b>3</b>Log a meal</Link></li>
    </ol>
    <button className="x-text-button" onClick={() => setSampleMode(true)}>Or explore with sample data</button>
    {children}
  </Card>;
}

function MonthCard({ sample, records, sessions }: { sample: boolean; records: WellnessRecord[]; sessions: SavedSession[] }) {
  const { open } = useExplore();
  const days = daysBack(10), today = days[9]!;
  const recorded = new Set([...records.map((r) => r.date), ...sessions.map((s) => isoDay(new Date(s.report.startedAt)))]);
  const score = Math.round(versusAverage('recovery').last);
  const [head, advice] = !sample ? ['Your day', 'Write a check-in or record a session and your daily brief builds from your own records.']
    : score >= 67 ? ['Ready day', 'Your body looks ready. A harder session or an assessment fits today.']
      : score >= 34 ? ['Steady day', 'Train at a moderate effort and notice how you feel as the day goes on.']
        : ['Easy day', 'Keep it light today: mobility, a walk and an early night.'];
  const news = sample ? (['deep', 'steps'] as const).map((id) => ({ id, vs: versusAverage(id) })).filter((n) => n.vs.text !== 'Steady') : [];
  return <Card tone="orange" className="x-home-month">
    <div className="x-home-figure" aria-hidden><FigureArt def={FIGURE} w={600} h={600} /></div>
    <div className="x-home-panel">
      <h2>{today.toLocaleDateString('en-GB', { month: 'long' })} <span>{today.getFullYear()}</span></h2>
      <ol className="x-home-days">{days.map((d, i) => {
        const has = sample || recorded.has(isoDay(d));
        return <li key={i} className={`${has ? 'has-data' : ''}${i === 9 ? ' today' : ''}`} aria-label={`${shortDate(d)}: ${has ? 'data recorded' : 'no data'}${i === 9 ? ', today' : ''}`}>{String(d.getDate()).padStart(2, '0')}</li>;
      })}</ol>
      <div className="x-home-brief">
        {sample
          ? <button className="x-home-brief-head" onClick={() => open('recovery', HOME)}><b>{head}</b><span>Recovery {score}%</span></button>
          : <Link className="x-home-brief-head" to="/journal"><b>{head}</b><span>Start with a check-in</span></Link>}
        <p>{advice}</p>
        {news.length > 0 && <ul aria-label="Changes today">{news.map((n) => <li key={n.id}>
          <button onClick={() => open(n.id, NEWS_GROUP)}><i>{n.vs.text.slice(0, 1)}</i><span>{METRICS[n.id]!.label} {n.vs.title}</span></button>
        </li>)}</ul>}
      </div>
    </div>
  </Card>;
}

function Calories({ sample, records }: { sample: boolean; records: WellnessRecord[] }) {
  const navigate = useNavigate();
  const today = wellnessToday();
  const meals = records.filter((r) => r.kind === 'nutrition' && r.date === today);
  const sum = (k: string) => meals.reduce((a, r) => a + (r.values[k] ?? 0), 0);
  const eaten = sample ? 1500 : sum('calories'), burned = sample ? 2342 : null;
  const [p, c, f] = sample ? [102, 142, 51] : [sum('protein'), sum('carbs'), sum('fat')];
  const kcal = p * 4 + c * 4 + f * 9, pct = (g: number, per: number) => kcal ? Math.round((g * per / kcal) * 100) : 0;
  return <Card className="x-home-cal" onClick={() => navigate('/nutrition')}>
    <CardHead title="Calories" onOpen={() => navigate('/nutrition')} openLabel="Open Nutrition" />
    <div className="x-home-pair">
      <div><span className="x-caption">Eaten</span><Stat value={fmt(eaten)} unit="kcal" big={34} /></div>
      <div><span className="x-caption">Burned</span>{burned != null ? <Stat value={fmt(burned)} unit="kcal" big={34} /> : <Stat value="—" big={34} />}</div>
    </div>
    {burned != null ? <>
      <div className="x-home-calbar" role="img" aria-label={`Eaten ${eaten} of ${burned} kcal burned`}><i style={{ width: `${Math.min(100, (eaten / burned) * 100)}%` }} /></div>
      <span className="x-caption">{fmt(Math.abs(burned - eaten))} kcal {eaten <= burned ? 'under' : 'over'} what you burned</span>
    </> : <span className="x-caption x-home-calnote">{meals.length ? `${meals.length} ${meals.length === 1 ? 'meal' : 'meals'} logged today` : 'No meals logged today'}. Burned energy needs a connected source.</span>}
    <div className="x-legend x-home-macros">
      <span><i className="t-accent" />Protein {fmt(p)} g · {pct(p, 4)}%</span>
      <span><i className="t-violet" />Carbs {fmt(c)} g · {pct(c, 4)}%</span>
      <span><i className="t-blue" />Fat {fmt(f)} g · {pct(f, 9)}%</span>
    </div>
  </Card>;
}

const clampKg = (v: number) => Math.round(Math.min(250, Math.max(30, v)) * 10) / 10;
const PX_PER_KG = 60;
const RULER_LABELS = Array.from({ length: 221 }, (_, i) => <span key={i} className={i % 5 === 0 ? 'major' : undefined} style={{ left: i * PX_PER_KG }}>{30 + i}</span>);
const KEY_STEPS: Record<string, number> = { ArrowLeft: -.1, ArrowDown: -.1, ArrowRight: .1, ArrowUp: .1, PageDown: -1, PageUp: 1 };

function Ruler({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const end = () => { drag.current = null; };
  return <div className="x-home-ruler" role="slider" tabIndex={0} aria-label="Weight scale" aria-valuemin={30} aria-valuemax={250}
    aria-valuenow={value} aria-valuetext={`${value.toFixed(1)} kilograms`}
    onPointerDown={(e) => { drag.current = { x: e.clientX, v: value }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={(e) => { if (drag.current) onChange(drag.current.v - (e.clientX - drag.current.x) / PX_PER_KG); }}
    onPointerUp={end} onPointerCancel={end}
    onKeyDown={(e) => {
      const step = KEY_STEPS[e.key];
      if (step !== undefined) { e.preventDefault(); onChange(value + step); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); onChange(e.key === 'Home' ? 30 : 250); }
    }}>
    <div className="x-home-track" style={{ transform: `translateX(${-(value - 30) * PX_PER_KG}px)` }}>{RULER_LABELS}</div>
    <span className="x-home-needle" />
  </div>;
}

function Weight({ sample, records }: { sample: boolean; records: WellnessRecord[] }) {
  const navigate = useNavigate();
  const entries = records.filter((r) => r.kind === 'body' && r.values.weight !== undefined);
  const last = entries[0], prev = last && entries.find((r) => r.date < last.date);
  let caption = 'No entry yet', badge: string | undefined, badgeTitle: string | undefined;
  if (last) {
    caption = `Last entry ${fmt(last.values.weight!, 1)} kg · ${shortDate(recordDate(last.date))}`;
    if (prev) {
      const d = last.values.weight! - prev.values.weight!;
      badge = Math.abs(d) < .05 ? 'Steady' : `${d > 0 ? '↑' : '↓'} ${fmt(Math.abs(d), 1)} kg`;
      badgeTitle = `Since ${shortDate(recordDate(prev.date))}`;
    }
  } else if (sample) {
    const [before, entry] = [daysBack(7)[0]!, daysBack(3)[0]!];
    caption = `Last entry 71.3 kg · ${shortDate(entry)}`; badge = '↓ 0.3 kg'; badgeTitle = `Since ${shortDate(before)}`;
  }
  const [kg, setKg] = useState(() => last?.values.weight ?? (sample ? 71.3 : 70));
  const [text, setText] = useState(kg.toFixed(1));
  const [error, setError] = useState('');
  const set = (v: number) => { const k = clampKg(v); setKg(k); setText(k.toFixed(1)); };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const input: WellnessInput = { kind: 'body', date: wellnessToday(), title: 'Weight', note: '', unit: 'kg', values: { weight: kg } };
    const err = validateWellness(input);
    if (err) { setError(err); return; }
    try { saveWellnessRecord(input); setError(''); toast(`Saved ${kg.toFixed(1)} kg for today.`); }
    catch (x) { setError(x instanceof Error ? x.message : 'Could not save this entry.'); }
  };
  return <Card className="x-home-weight">
    <CardHead title="Weight" badge={badge} badgeTitle={badgeTitle} onOpen={() => navigate('/body')} openLabel="Open Body" />
    <span className="x-caption">{caption}</span>
    <form onSubmit={save} noValidate>
      <label className="x-home-readout">
        <span className="sr-only">Weight in kg</span>
        <input type="text" inputMode="decimal" value={text} placeholder="70.0" title="Enter a number like 70.5" aria-invalid={!!error}
          onChange={(e) => { setText(e.target.value); const n = Number(e.target.value.replace(',', '.')); if (e.target.value.trim() && Number.isFinite(n) && n >= 30 && n <= 250) setKg(Math.round(n * 10) / 10); }}
          onBlur={() => setText(kg.toFixed(1))} />
        <span className="x-home-unit">kg</span>
      </label>
      <Ruler value={kg} onChange={set} />
      <div className="x-home-weight-foot">
        <span className="x-home-error" role="alert">{error}</span>
        <button className="x-btn small" type="submit">Save today</button>
      </div>
    </form>
  </Card>;
}

function Week({ sample, records, onSummary }: { sample: boolean; records: WellnessRecord[]; onSummary: () => void }) {
  const { open } = useExplore();
  const days = daysBack(7);
  const byDay = (kind: WellnessRecord['kind'], key: string) => days.map((d) => records.find((r) => r.kind === kind && r.date === isoDay(d) && r.values[key] !== undefined)?.values[key]);
  const last7 = (id: string) => series(id, 30).slice(-7).map((p) => p.value);
  const none = days.map(() => undefined);
  const rows: { id: string; label: string; unit: string; values: (number | undefined)[] }[] = [
    { id: 'recovery', label: 'Recovery', unit: '%', values: sample ? last7('recovery') : none },
    { id: 'sleep', label: 'Sleep', unit: 'h', values: sample ? last7('sleep') : byDay('sleep', 'hours') },
    { id: 'strain', label: 'Strain', unit: '', values: sample ? last7('strain') : none },
  ];
  const realMoods = byDay('journal', 'mood').map((m) => m ? MOODS[m] : undefined);
  const moods = sample ? [...SAMPLE_MOODS, realMoods[6]] : realMoods;
  const today = (i: number) => i === 6 ? 'is-today' : undefined;
  return <Card className="x-home-week">
    <CardHead title="Your week">
      <button className="x-text-button" onClick={onSummary}>Summary</button>
      <Link className="x-chip is-cta x-home-cta" to="/journal">Check in</Link>
    </CardHead>
    <table className="x-home-week-table">
      <thead><tr>
        <th><span className="sr-only">Signal</span></th>
        {days.map((d, i) => <th key={i} scope="col" className={today(i)}>{d.toLocaleDateString('en-GB', { weekday: 'short' })} <small>{d.getDate()}</small>{i === 6 && <span className="sr-only">, today</span>}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((r) => {
          const max = Math.max(1, ...r.values.map((v) => v ?? 0));
          const label = <>{r.label} {r.unit && <small>{r.unit}</small>}</>;
          return <tr key={r.id}>
            <th scope="row">{sample ? <button className="x-home-signal" onClick={() => open(r.id, HOME)}>{label}</button> : <span className="x-home-signal">{label}</span>}</th>
            {r.values.map((v, i) => <td key={i} className={today(i)}>{v === undefined ? <span className="x-home-none">—</span> : <><b>{fmt(v, METRICS[r.id]!.digits)}</b><i style={{ width: `${(v / max) * 100}%` }} /></>}</td>)}
          </tr>;
        })}
        <tr>
          <th scope="row"><Link className="x-home-signal" to="/journal">Mood</Link></th>
          {moods.map((m, i) => <td key={i} className={today(i)}>
            {m ? <span className="x-home-mood">{m}</span>
              : i === 6 ? <Link className="x-home-add" to="/journal" aria-label="Check in for today"><Icon name="plus" /></Link>
                : <span className="x-home-none">—</span>}
          </td>)}
        </tr>
      </tbody>
    </table>
  </Card>;
}

function Summary({ open, onClose, sample, checkins }: { open: boolean; onClose: () => void; sample: boolean; checkins: number }) {
  return <Dialog open={open} onClose={onClose} wide kicker="Last 7 days compared with the 7 before" title="Your week, in summary">
    {sample ? <div className="x-home-weekly-wrap"><table className="x-home-weekly">
      <thead><tr><th scope="col">Signal</th><th scope="col">Last 7 days</th><th scope="col">7 days before</th><th scope="col">Change</th></tr></thead>
      <tbody>{SUMMARY.map((id) => {
        const m = METRICS[id]!, v = series(id, 30).map((p) => p.value);
        const a = mean(v.slice(-7)), b = mean(v.slice(-14, -7)), pct = ((a - b) / b) * 100, steady = Math.abs(pct) < 1;
        const p = Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1);
        return <tr key={id}>
          <td><b>{m.label}</b><small>7 days recorded</small></td>
          <td><span className="x-home-weekly-value">{fmt(a, m.digits)}</span> <small>{m.unit}</small></td>
          <td>{fmt(b, m.digits)} <small>{m.unit}</small></td>
          <td><span className={`x-badge${steady ? '' : ' solid'}`}>{steady ? 'Steady' : `${pct > 0 ? '↑' : '↓'} ${p}%`}</span></td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="x-empty">Weekly comparisons appear once a connected source records two weeks of readings.</p>}
    <p className="x-home-note">{checkins} journal check-in{checkins === 1 ? '' : 's'} this week{sample ? ' · Sample data' : ''}. Averages of daily means. A change describes a difference, not whether it is good or bad.</p>
  </Dialog>;
}

/* ---------- Fitzen's own row ---------- */
function TrainNow() {
  return <Card tone="dark" className="x-home-train">
    <CardHead title="Train now" />
    <div className="x-home-actions">
      <Link className="x-home-action" to="/train"><span><Icon name="camera" /></span><b>Start live session</b><small>Pose tracking with your camera</small></Link>
      <Link className="x-home-action" to="/train?upload=1"><span><Icon name="upload" /></span><b>Analyse a video</b><small>From a file, offline</small></Link>
    </div>
    <p className="x-caption x-home-private"><Icon name="shield" size={13} />Camera processing stays on your device.</p>
  </Card>;
}

function LatestReport({ session: s }: { session?: SavedSession }) {
  const navigate = useNavigate();
  if (!s) return <Card className="x-home-report">
    <CardHead title="Latest report" />
    <p className="x-empty x-home-grow">Your first assessment appears here.</p>
    <Link className="x-btn small x-home-push" to="/train">Start an assessment</Link>
  </Card>;
  const m = measureOf(s.report);
  return <Card className="x-home-report">
    <CardHead title="Latest report" badge={s.source === 'video' ? 'Video' : s.source === 'demo' ? 'Demo' : 'Live'} onOpen={() => navigate(`/results/${s.id}`)} openLabel="Open latest report" />
    <span className="x-caption x-home-exercise">{exerciseById(s.report.exerciseId)?.name ?? s.report.exerciseId}</span>
    {m ? <Stat value={fmt(m.value, m.unit === 'reps' ? 0 : 1)} unit={m.unit} /> : <Stat value={fmt(s.report.formScore)} unit="form score" />}
    <span className="x-caption">{longDate(new Date(s.report.startedAt))}</span>
    <Link className="x-btn small ghost x-home-push" to={`/results/${s.id}`}>Open report</Link>
  </Card>;
}

function ProgressCard({ sessions }: { sessions: SavedSession[] }) {
  const navigate = useNavigate();
  const pts: Point[] = daysBack(14).map((d) => ({ date: d, value: sessions.filter((s) => isoDay(new Date(s.report.startedAt)) === isoDay(d)).length }));
  const week = pts.slice(-7).reduce((a, p) => a + p.value, 0);
  return <Card tone="night" className="x-home-progress">
    <CardHead title="Progress" onOpen={() => navigate('/progress')} openLabel="Open Progress" />
    <Stat value={week} unit={week === 1 ? 'session' : 'sessions'} />
    <span className="x-caption">This week</span>
    {pts.some((p) => p.value > 0)
      ? <MiniChart points={pts} kind="bars" tone="night" label="Assessment sessions per day" />
      : <p className="x-empty x-home-grow">Each session you record adds a bar here, day by day.</p>}
  </Card>;
}

function Demo() {
  const ex = EXERCISES[Math.floor(dayStart().getTime() / 864e5) % EXERCISES.length]!;
  return <Card className="x-home-demo">
    <CardHead title="Demo of the day" />
    <div className="x-home-stage"><ExerciseArt def={ex} play /></div>
    <div className="x-home-demo-foot"><b title={ex.name}>{ex.name}</b><Link className="x-btn small" to={`/exercise/${ex.id}`}>Try it</Link></div>
  </Card>;
}
