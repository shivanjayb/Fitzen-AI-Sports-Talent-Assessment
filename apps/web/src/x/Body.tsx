import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { exerciseById } from '@fitzen/engines';
import { figureArt } from '../app/Figure';
import { getProfile } from '../app/store';
import { getWellnessRecords, saveWellnessRecord, subscribeWellness, wellnessToday, type WellnessRecord } from '../app/wellnessStore';
import { Card, CardHead, Dialog, Icon, MetricTile, PageHead, Soon, Stat, toast, useExplore } from './ui';
import { fmt, realSeries, shortDate, useSampleMode } from './sample';
import './body.css';

const GROUP = ['weight', 'rhr', 'hrv', 'spo2', 'skin', 'resp', 'burned', 'active', 'steps'];
const TILES = ['rhr', 'hrv', 'spo2', 'skin', 'resp', 'burned', 'active', 'steps'];
const DAY = 864e5;
const SAMPLE_WEIGHTS = [72.5, 72.3, 72.2, 71.9, 71.8, 71.7, 71.6, 71.3];

type Kind = 'weight' | 'bodyfat' | 'lean';
const KINDS: Record<Kind, { title: string; unit: string; unitWord: string; min: number; max: number; init: number }> = {
  weight: { title: 'Weight', unit: 'kg', unitWord: 'kilograms', min: 30, max: 250, init: 70 },
  bodyfat: { title: 'Body fat', unit: '%', unitWord: 'percent', min: 1, max: 75, init: 20 },
  lean: { title: 'Lean body mass', unit: 'kg', unitWord: 'kilograms', min: 20, max: 150, init: 55 },
};
type View = 'digital' | 'stats';
const VIEW_KEY = 'fitzen-body-view';
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'stats' ? 'stats' : 'digital'; } catch { return 'digital'; } };

interface Entry { date: Date; value: number }
const recordDate = (d: string) => new Date(`${d}T12:00:00`);
const entriesOf = (records: WellnessRecord[], key: 'bodyfat' | 'lean'): Entry[] => records
  .filter((r) => r.kind === 'body' && r.values[key] !== undefined)
  .map((r) => ({ date: recordDate(r.date), value: r.values[key]! }))
  .sort((a, b) => a.date.getTime() - b.date.getTime());

export default function Body() {
  const sample = useSampleMode();
  const { open } = useExplore();
  const [records, setRecords] = useState(getWellnessRecords);
  useEffect(() => subscribeWellness(() => setRecords(getWellnessRecords())), []);
  const [view, setView] = useState<View>(readView);
  const [viewOpen, setViewOpen] = useState(false);
  const [measure, setMeasure] = useState<Kind | null>(null);

  const real = realSeries('weight', 3650);
  const weights = real.length ? real : sample
    ? SAMPLE_WEIGHTS.map((value, i) => ({ date: new Date(Date.now() - (2 + (7 - i) * 4) * DAY), value })) : [];
  const weightIsSample = !real.length && weights.length > 0;
  const lastWeight = weights[weights.length - 1];
  const lastFat = entriesOf(records, 'bodyfat').at(-1), lastLean = entriesOf(records, 'lean').at(-1);
  const exploreWeight = () => open('weight', GROUP);

  const chooseView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode: keep for this visit */ } };

  const pins: PinDef[] = [
    { id: 'weight', at: [51.5, 31], title: 'Weight', entry: lastWeight, unit: 'kg',
      label: lastWeight ? `Weight: ${fmt(lastWeight.value, 1)} kg. Explore your weight trend` : 'Add weight measurement',
      onClick: lastWeight ? exploreWeight : () => setMeasure('weight') },
    { id: 'bodyfat', at: [50, 45], title: 'Body fat', entry: lastFat, unit: '%',
      label: lastFat ? `Body fat: ${fmt(lastFat.value, 1)} %. Add a new body fat measurement` : 'Add body fat measurement', onClick: () => setMeasure('bodyfat') },
    { id: 'lean', at: [53, 59], title: 'Lean body mass', entry: lastLean, unit: 'kg',
      label: lastLean ? `Lean body mass: ${fmt(lastLean.value, 1)} kg. Add a new lean body mass measurement` : 'Add lean body mass measurement', onClick: () => setMeasure('lean') },
  ];

  return <>
    <PageHead title="Body" subtitle="Measurements you add. Progress you can see.">
      <button className="x-btn ghost" onClick={() => setViewOpen(true)}>Change view <Icon name="arrow" /></button>
    </PageHead>

    <div className="x-body-grid">
      <Card className="x-body-visual">
        <CardHead title="Your body" />
        {view === 'digital' ? <Figure pins={pins} /> : <ul className="x-body-statlist">
          {pins.map((p) => <li key={p.id}><button className={`x-body-pin-copy${p.entry ? '' : ' is-empty'}`} aria-label={p.label} onClick={p.onClick}><PinCopy pin={p} /></button></li>)}
        </ul>}
        <div className="x-body-visual-foot">{view === 'digital' ? 'Athlete figure · Illustrative artwork · Not a body composition scan' : 'Just the statistics · Change the view anytime'}</div>
      </Card>

      <Card as="article" className="x-body-measure">
        <CardHead title="Weight" onOpen={exploreWeight} openLabel="Explore your weight trend" />
        {lastWeight ? <>
          <div className="x-body-stat">
            <Stat value={fmt(lastWeight.value, 1)} unit="kg" big={44} />
            {weights.length > 1 && <span className="x-badge">{delta(lastWeight.value - weights[weights.length - 2]!.value)}</span>}
          </div>
          <span className="x-caption">{weightIsSample ? 'Sample data' : 'Your records'} · {shortDate(lastWeight.date)}</span>
          <div className="x-body-history">
            <Spark entries={weights.slice(-8)} />
            <span>{weights.length} {weights.length === 1 ? 'entry' : 'entries'} since {shortDate(weights[0]!.date)}</span>
          </div>
        </> : <p className="x-empty x-body-empty">Your weight appears once you add an entry.</p>}
        <div className="x-body-action">
          <span>Add a new entry</span>
          <button className="x-icon-btn small" aria-label="Add weight measurement" onClick={() => setMeasure('weight')}><Icon name="plus" /></button>
        </div>
      </Card>

      <Card className="x-body-add">
        <CardHead title="Add a measurement" />
        <ul className="x-body-add-list">
          {(['bodyfat', 'lean'] as const).map((k) => <li key={k}>
            <button className="x-body-add-row" aria-label={`Add ${KINDS[k].title.toLowerCase()} measurement`} onClick={() => setMeasure(k)}>
              <span className="x-body-add-name">{KINDS[k].title}<small>{KINDS[k].unit}</small></span>
              <span className="x-body-add-cta"><Icon name="plus" />Add</span>
            </button>
          </li>)}
        </ul>
      </Card>

      {TILES.map((id) => <MetricTile key={id} id={id} group={GROUP} className={id === 'steps' ? 'span-3' : undefined} />)}

      <TalentCard />
    </div>

    <ViewDialog open={viewOpen} view={view} onChoose={chooseView} onClose={() => setViewOpen(false)} />
    {measure && <MeasureDialog key={measure} kind={measure}
      initial={{ weight: lastWeight, bodyfat: lastFat, lean: lastLean }[measure]?.value}
      onExplore={() => { setMeasure(null); exploreWeight(); }} onClose={() => setMeasure(null)} />}
  </>;
}

const delta = (d: number) => Math.abs(d) < 0.05 ? 'Steady' : `${d > 0 ? '↑' : '↓'} ${fmt(Math.abs(d), 1)}`;

/* ---------- figure with pins ---------- */
interface PinDef { id: string; at: [number, number]; title: string; entry?: Entry; unit: string; label: string; onClick: () => void }

function PinCopy({ pin }: { pin: PinDef }) {
  return pin.entry
    ? <><span className="x-body-pin-name">{pin.title}<small>{shortDate(pin.entry.date)}</small></span><strong>{fmt(pin.entry.value, 1)}<small>{pin.unit}</small></strong></>
    : <><span className="x-body-pin-name">{pin.title}<small>Not added yet</small></span><span className="x-body-pin-add"><Icon name="plus" />Add</span></>;
}

function Figure({ pins }: { pins: PinDef[] }) {
  const fig = useRef<HTMLDivElement>(null);
  const art = useMemo(() => { const def = exerciseById('mountain-pose'); return def ? figureArt(def, 'key', 480, 480) : ''; }, []);
  const tilt = (e: PointerEvent<HTMLDivElement>) => {
    const el = fig.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1200px) rotateX(${(-y * 3).toFixed(2)}deg) rotateY(${(x * 3).toFixed(2)}deg)`;
  };
  return <div className="x-body-scene" onPointerMove={tilt} onPointerLeave={() => { if (fig.current) fig.current.style.transform = ''; }}>
    <div className="x-body-fig">
      <div ref={fig} className="x-body-art" style={{ '--art': `url(${art})` } as CSSProperties}>
        {art && <img src={art} alt="Fitzen athlete figure standing, rendered in pearlescent ivory" draggable={false} />}
      </div>
      {pins.map((p) => <button key={p.id} className="x-body-pin" aria-label={p.label} onClick={p.onClick}
        style={{ left: `${p.at[0]}%`, top: `${p.at[1]}%`, '--px': p.at[0] } as CSSProperties}>
        <span className="x-body-pin-dot" /><span className="x-body-pin-line" />
        <span className={`x-body-pin-copy${p.entry ? '' : ' is-empty'}`}><PinCopy pin={p} /></span>
      </button>)}
    </div>
  </div>;
}

function Spark({ entries }: { entries: Entry[] }) {
  const vals = entries.map((e) => e.value);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pts = vals.map((v, i) => [entries.length > 1 ? (i / (entries.length - 1)) * 100 : 50, 90 - ((v - lo) / span) * 80] as const);
  return <div className="x-body-spark" role="img" aria-label={`Weight, last ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--x-accent)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
    {pts.map(([x, y], i) => <i key={i} className={i === pts.length - 1 ? 'is-last' : undefined} style={{ left: `${x}%`, top: `${y}%` }} />)}
  </div>;
}

/* ---------- Fitzen: measurements used by the talent assessment ---------- */
function TalentCard() {
  const p = getProfile();
  const cell = (label: string, value: number | null, unit: string) => <div>
    <span>{label}</span>
    {value != null ? <b>{fmt(value, 0)}<small>{unit}</small></b> : <b className="is-unset">Not set</b>}
  </div>;
  return <Card className="x-body-talent">
    <CardHead title="Body measurements for talent assessment">
      <Link className="x-btn ghost small" to="/profile">Edit in Profile <Icon name="arrow" /></Link>
    </CardHead>
    <p className="x-body-talent-lead">Your assessment reports compare results with athletes of your age and size, using these profile values.</p>
    <div className="x-body-talent-cells">
      {cell('Height', p.heightCm, 'cm')}
      {cell('Weight', p.weightKg, 'kg')}
      {cell('Age', p.age, 'years')}
    </div>
  </Card>;
}

/* ---------- Change view ---------- */
function ViewDialog({ open, view, onChoose, onClose }: { open: boolean; view: View; onChoose: (v: View) => void; onClose: () => void }) {
  const art = useMemo(() => { const def = exerciseById('mountain-pose'); return open && def ? figureArt(def, 'key', 480, 480) : ''; }, [open]);
  const option = (value: 'photo' | View, title: ReactNode, text: string, artEl: ReactNode) => {
    const soon = value === 'photo';
    return <label className={`x-body-view${soon ? ' is-soon' : ''}`}>
      <input type="radio" name="body-view" className="sr-only" value={value} disabled={soon} checked={!soon && view === value} onChange={() => { if (!soon) onChoose(value); }} />
      <span className="x-body-view-art">{artEl}</span>
      <span className="x-body-view-copy"><strong>{title}</strong><span>{text}</span></span>
      <span className="x-body-view-check" aria-hidden />
    </label>;
  };
  return <Dialog open={open} onClose={onClose} kicker="Your view" title="How would you like to see yourself?">
    <p className="x-body-lead">Choose a view for your Body page. You can change it anytime.</p>
    <fieldset className="x-body-views">
      <legend className="sr-only">Body representation</legend>
      {option('photo', <>Your own portrait <Soon /></>, 'Your likeness, rendered in the Fitzen style from a photo.', <Icon name="user" size={40} />)}
      {option('digital', 'Digital human', 'Fitzen’s athlete figure. No photo needed.', art && <img src={art} alt="" />)}
      {option('stats', 'Just the statistics', 'Your measurements take the whole stage.', <span className="x-body-view-bars"><i /><i /><i /><i /></span>)}
    </fieldset>
    <div className="x-body-dialog-foot">
      <span>Saved on this device. Your choice is always yours.</span>
      <button className="x-btn" onClick={onClose}>Done</button>
    </div>
  </Dialog>;
}

/* ---------- Measurement entry ---------- */
function MeasureDialog({ kind, initial, onExplore, onClose }: { kind: Kind; initial?: number; onExplore: () => void; onClose: () => void }) {
  const K = KINDS[kind];
  const [value, setValue] = useState(initial ?? K.init);
  const [date, setDate] = useState(wellnessToday);
  const [error, setError] = useState('');
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(value) || value < K.min || value > K.max) return setError(`Enter a number between ${K.min} and ${K.max}.`);
    try {
      saveWellnessRecord({ kind: 'body', date, title: K.title, note: 'Manual entry', unit: K.unit, values: { [kind]: value } });
      toast(`${K.title} saved.`);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'This measurement could not be saved.'); }
  };
  return <Dialog open onClose={onClose} kicker="Your measurements" title={K.title}>
    <form className="x-body-measure-form" onSubmit={save} noValidate>
      <p className="x-body-lead">Add a measurement from your scale, a scan or your own records.</p>
      <Ruler value={value} onChange={(v) => { setValue(v); setError(''); }} min={K.min} max={K.max} unit={K.unit} unitWord={K.unitWord} label={K.title} />
      {kind !== 'weight' && <p className="x-body-hint">Drag the scale or type a number</p>}
      <label className="x-field">Measurement date
        <input type="date" value={date} min="1900-01-01" max={wellnessToday()} required onChange={(e) => { setDate(e.target.value); setError(''); }} />
      </label>
      <p className="x-body-hint">Saved privately as a manual entry, with your measurement date.</p>
      {error && <p className="x-body-error" role="alert">{error}</p>}
      <div className="x-body-dialog-foot is-left"><button className="x-btn" type="submit">Save measurement</button></div>
    </form>
    {kind === 'weight' && <button className="x-text-button x-body-trend" onClick={onExplore}>Explore the trend ↗</button>}
  </Dialog>;
}

const PX = 60; // pixels per unit on the scale
function Ruler({ value, onChange, min, max, unit, unitWord, label, disabled }: {
  value: number; onChange: (v: number) => void; min: number; max: number; unit: string; unitWord: string; label: string; disabled?: boolean;
}) {
  const [text, setText] = useState(value.toFixed(1));
  const drag = useRef<{ x: number; v: number } | null>(null);
  const origin = Math.floor(min / 5) * 5; // major ticks land on multiples of 5
  const set = (v: number) => { const c = Math.min(max, Math.max(min, Math.round(v * 10) / 10)); onChange(c); setText(c.toFixed(1)); };
  const labels: number[] = [];
  for (let i = origin; i <= max; i++) labels.push(i);
  return <div className="x-ruler-field">
    <label className="x-ruler-readout">
      <span className="sr-only">{label} in {unit}</span>
      <input className="x-ruler-input" inputMode="decimal" value={text} placeholder={KINDS.weight.init.toFixed(1)} title="Enter a number like 70.5" disabled={disabled}
        size={Math.max(3, text.length)}
        onChange={(e) => { setText(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n >= min && n <= max) onChange(n); else onChange(NaN); }}
        onBlur={() => { if (Number.isFinite(value)) setText(value.toFixed(1)); }} />
      <span className="x-ruler-unit">{unit}</span>
    </label>
    <div className="x-ruler" role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`${label} scale`}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={Number.isFinite(value) ? value : undefined} aria-valuetext={`${fmt(value, 1)} ${unitWord}`}
      onKeyDown={(e) => {
        if (disabled) return;
        const step = { ArrowLeft: -0.1, ArrowDown: -0.1, ArrowRight: 0.1, ArrowUp: 0.1, PageDown: -1, PageUp: 1 }[e.key];
        if (step) { e.preventDefault(); set((Number.isFinite(value) ? value : min) + step); }
        if (e.key === 'Home') set(min);
        if (e.key === 'End') set(max);
      }}
      onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, v: Number.isFinite(value) ? value : min }; }}
      onPointerMove={(e) => { if (drag.current) set(drag.current.v - (e.clientX - drag.current.x) / PX); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="x-ruler-track" style={{ width: (max - origin) * PX + 2, transform: `translateX(${-((Number.isFinite(value) ? value : min) - origin) * PX}px)` }}>
        {labels.map((i) => <span key={i} className={i % 5 === 0 ? 'major' : undefined} style={{ left: (i - origin) * PX }}>{i}</span>)}
      </div>
      <span className="x-ruler-needle" />
    </div>
  </div>;
}
