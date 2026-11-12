import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { METRICS, dayStart, fmt, longDate, mean, pointsFor, shortDate, useDataVersion, useSampleMode, versusAverage, type Point } from './sample';

/* ---------- icons: 24x24 line, stroke 1.5 ---------- */
const PATHS = {
  home: 'M3 10 12 3l9 7v11H3z M9 21v-8h6v8',
  vitals: 'M2 12h4l3-8 4 16 3-8h6',
  body: 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M7 11l5-2 5 2 M12 9v7 M7 21l5-5 5 5 M7 11l-2 5 M17 11l2 5',
  nutrition: 'M5 3v6q0 3 3 3V3 M8 12v9 M19 3q-6 4-3 10h3 M19 3v18',
  journal: 'M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11 M9 8h6',
  sleep: 'M20 14A8 8 0 0 1 10 4a9 9 0 1 0 10 10z',
  labs: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3 M7.5 15h9',
  train: 'M6.5 6.5v11 M17.5 6.5v11 M3 9v6 M21 9v6 M6.5 12h11',
  reports: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M20 20l-4-4',
  pencil: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  refresh: 'M20 7V3l-3 3a8 8 0 1 0 3 9 M20 3v5h-5',
  menu: 'M4 9h16 M4 15h16',
  link: 'm9 15 6-6 M8 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 7l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  shield: 'M12 2 3 6v6q0 6 9 10 9-4 9-10V6z M8 12l3 3 5-6',
  signout: 'M9 3H3v18h6 M9 12h12 M16 7l5 5-5 5',
  arrow: 'M6 18 18 6 M7 6h11v11',
  close: 'M6 6l12 12 M18 6 6 18',
  plus: 'M12 5v14 M5 12h14',
  camera: 'M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  upload: 'M12 16V4 M6 10l6-6 6 6 M4 20h16',
  play: 'M7 4v16l13-8z',
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M7 6H4a3 3 0 0 0 3 4 M17 6h3a3 3 0 0 1-3 4',
  watch: 'M8 3h8l1 4H7z M7 17h10l-1 4H8z M7 7h10v10H7z M12 10v3l2 1',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  chevron: 'm9 6 6 6-6 6',
  back: 'M15 18l-6-6 6-6',
  user: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21a8 8 0 0 1 16 0',
  heart: 'M12 20.5s-7.6-4.5-9.7-9.1C.8 8 2.9 4 6.8 4c2.2 0 3.7 1.2 5.2 3.1C13.5 5.2 15 4 17.2 4c3.9 0 6 4 4.5 7.4-2.1 4.6-9.7 9.1-9.7 9.1z',
  people: 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7 M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.6a3.5 3.5 0 0 1 0 6.8 M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
} as const;
export type IconName = keyof typeof PATHS;
export const Icon = ({ name, size }: { name: IconName; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={PATHS[name]} />
  </svg>
);

/* ---------- building blocks ---------- */
export type Tone = 'light' | 'dark' | 'night' | 'pulse' | 'orange';
export const Marker = () => <span className="x-marker" aria-hidden />;
export const Soon = ({ label = 'Coming soon' }: { label?: string }) => <span className="x-soon-tag">{label}</span>;

export function Card({ tone = 'light', className = '', style, children, as = 'section', onClick, label }: {
  tone?: Tone; className?: string; style?: React.CSSProperties; children: ReactNode; as?: 'section' | 'div' | 'article'; onClick?: () => void; label?: string;
}) {
  const Tag = as;
  return <Tag className={`x-card x-tile ${tone === 'light' ? '' : tone} ${className}`} style={style} onClick={onClick} aria-label={label}>{children}</Tag>;
}

export function CardHead({ title, badge, badgeTitle, onOpen, openLabel, children, level = 2 }: {
  title: ReactNode; badge?: ReactNode; badgeTitle?: string; onOpen?: () => void; openLabel?: string; children?: ReactNode; level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return <div className="x-card-head">
    <Marker /><H>{title}</H><span className="x-spacer" />
    {children}
    {badge != null && <span className="x-badge" title={badgeTitle}>{badge}</span>}
    {onOpen && <button className="x-icon-btn small" aria-label={openLabel ?? `Open ${typeof title === 'string' ? title : ''} details${badgeTitle ? ` (${badgeTitle})` : ''}`} onClick={(e) => { e.stopPropagation(); onOpen(); }}><Icon name="arrow" /></button>}
  </div>;
}

export const Stat = ({ value, unit, big }: { value: ReactNode; unit?: ReactNode; big?: number }) => (
  <div className="x-stat"><b style={big ? { fontSize: big, lineHeight: `${big}px` } : undefined}>{value}</b>{unit && <small>{unit}</small>}</div>
);

/** 14-day mini chart: grey bars (last one orange) or an ink line with an end dot, dashed average + "avg" chip. */
export function MiniChart({ points, kind, tone = 'light', digits = 0, lastLabel = 'Today', label }: {
  points: Point[]; kind: 'bars' | 'line'; tone?: Tone; digits?: number; lastLabel?: string; label: string;
}) {
  const vals = points.map((p) => p.value);
  const avg = mean(vals);
  const lo = Math.min(...vals, avg), hi = Math.max(...vals, avg);
  const span = hi - lo || 1;
  const darkish = tone !== 'light';
  const y = (v: number) => kind === 'bars' ? 100 - ((v - lo * .6) / (hi - lo * .6)) * 96 : 92 - ((v - lo) / span) * 84;
  const avgY = y(avg);
  const n = vals.length, step = 100 / n;
  const xs = vals.map((_, i) => step * (i + .5));
  const last = vals[n - 1]!;
  return <div className="x-mini">
    <div className="x-mini-plot">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label}, last ${n} days`}>
        {kind === 'bars' ? vals.map((v, i) => <rect key={i} x={xs[i]! - 2} width={4} y={y(v)} height={100 - y(v)}
          fill={i === n - 1 ? 'var(--x-accent)' : darkish ? '#ffffff2e' : 'var(--x-line-strong)'} />)
          : <polyline points={vals.map((v, i) => `${xs[i]},${y(v)}`).join(' ')} fill="none" stroke={tone === 'pulse' ? '#fff' : darkish ? 'var(--x-on-dark)' : 'var(--x-ink)'}
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
        <line x1={0} x2={100} y1={avgY} y2={avgY} stroke={darkish ? '#bdbdb7' : '#686862'} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={`x-mini-avg${avgY < 22 ? ' below' : ''}`} style={{ top: `${avgY}%` }}>avg {fmt(avg, digits)}</span>
      {kind === 'line' && <i className="x-mini-now" style={{ left: `${xs[n - 1]}%`, top: `${y(last)}%` }} />}
    </div>
    <div className="x-mini-dates"><span>{shortDate(points[0]!.date)}</span><span>{lastLabel}</span></div>
  </div>;
}

/* ---------- dialog, toast ---------- */
export function Dialog({ open, onClose, kicker, title, wide, children }: { open: boolean; onClose: () => void; kicker?: ReactNode; title: ReactNode; wide?: boolean; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(<div className="x x-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} tabIndex={-1} className={`x-dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
      <button className="x-icon-btn x-close" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
      {kicker && <div className="x-dialog-kicker"><Marker />{kicker}</div>}
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  </div>, document.body);
}

type ToastAction = { label: string; run: () => void };
let toastMsg = '', toastShow = false, toastAction: ToastAction | undefined, timer = 0;
const toastSubs = new Set<() => void>();
const hideToast = () => { toastShow = false; toastSubs.forEach((f) => f()); };
export function toast(message: string, action?: ToastAction) {
  toastMsg = message; toastAction = action; toastShow = true; toastSubs.forEach((f) => f());
  clearTimeout(timer);
  timer = window.setTimeout(hideToast, action ? 6000 : 2800); // longer when there is something to undo
}
export function Toast() {
  const show = useSyncExternalStore((f) => { toastSubs.add(f); return () => { toastSubs.delete(f); }; }, () => toastShow);
  return <div className="x-toast" role="status" data-show={show}>{toastMsg}
    {toastAction && <button style={{ color: 'var(--x-accent-2)', fontWeight: 500 }} onClick={() => { toastAction!.run(); hideToast(); }}>{toastAction.label}</button>}
  </div>;
}

/* ---------- metric explorer (shared by every section) ---------- */
interface Explore { open: (id: string, group?: string[]) => void }
const ExploreCtx = createContext<Explore>({ open: () => {} });
export const useExplore = () => useContext(ExploreCtx);

export function ExploreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ id: string; group: string[] } | null>(null);
  return <ExploreCtx.Provider value={{ open: (id, group) => setState({ id, group: group ?? [id] }) }}>
    {children}
    {state && <MetricExplorer id={state.id} group={state.group} onMove={(id) => setState({ ...state, id })} onClose={() => setState(null)} />}
  </ExploreCtx.Provider>;
}

function MetricExplorer({ id, group, onMove, onClose }: { id: string; group: string[]; onMove: (id: string) => void; onClose: () => void }) {
  const m = METRICS[id]!;
  const [days, setDays] = useState(30);
  const sample = useSampleMode(); useDataVersion();
  const pts = pointsFor(id, days, sample);
  const [sel, setSel] = useState(pts.length - 1);
  useEffect(() => setSel(pts.length - 1), [id, days, pts.length]);
  if (!pts.length) return <Dialog open onClose={onClose} kicker="Your trend" title={m.label}>
    <p className="x-empty">No {m.label.toLowerCase()} recorded in the last {days} days. Connect a watch or import a file in <Link to="/integrations">Integrations</Link>, or turn on sample data to explore.</p>
    <div className="x-periods">{[7, 30, 90].map((d) => <button key={d} className="x-chip" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>)}</div>
    <section className="x-explainer"><h3>What {m.label.toLowerCase()} means</h3><p>{m.what}</p><p>{m.context}</p></section>
  </Dialog>;
  const i = Math.min(sel, pts.length - 1);
  const vals = pts.map((p) => p.value), avg = mean(vals);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const X = (k: number) => 3 + (k / (pts.length - 1)) * 94, Y = (v: number) => 88 - ((v - lo) / span) * 72;
  const pct = ((pts[i]!.value - avg) / avg) * 100;
  const pos = group.indexOf(id);
  const plot = useRef<HTMLDivElement>(null);
  const pick = (clientX: number) => {
    const r = plot.current!.getBoundingClientRect();
    setSel(Math.max(0, Math.min(pts.length - 1, Math.round(((clientX - r.left) / r.width * 100 - 3) / 94 * (pts.length - 1)))));
  };
  const line = vals.map((v, k) => `${X(k)},${Y(v)}`).join(' ');
  return <Dialog open onClose={onClose} kicker={sample ? 'Sample data / Your trend' : 'Your trend'} title={m.label}>
    {group.length > 1 && <nav className="x-switch" aria-label="Metrics">
      <button disabled={pos <= 0} onClick={() => onMove(group[pos - 1]!)}>{pos > 0 ? `← ${METRICS[group[pos - 1]!]!.label}` : ''}</button>
      <span>{pos + 1} of {group.length}</span>
      <button disabled={pos >= group.length - 1} onClick={() => onMove(group[pos + 1]!)}>{pos < group.length - 1 ? `${METRICS[group[pos + 1]!]!.label} →` : ''}</button>
    </nav>}
    <div className="x-readout">
      <div><span className="date">{longDate(pts[i]!.date)}</span><div className="x-figure">{fmt(pts[i]!.value, m.digits)}<small>{m.unit}</small></div></div>
      <span className="x-badge">{Math.abs(pct) < 1 ? 'Steady' : `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}%`} vs your {days}-day average</span>
    </div>
    <div className="x-periods">{[7, 30, 90].map((d) => <button key={d} className="x-chip" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>)}</div>
    <div ref={plot} className="x-trend" tabIndex={0} role="slider" aria-label={`${m.label} by day`} aria-valuemin={0} aria-valuemax={pts.length - 1} aria-valuenow={i}
      aria-valuetext={`${longDate(pts[i]!.date)}: ${fmt(pts[i]!.value, m.digits)} ${m.unit}`}
      onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') setSel(Math.max(0, i - 1)); if (e.key === 'ArrowRight') setSel(Math.min(pts.length - 1, i + 1)); }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs><linearGradient id="x-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff6a1a" stopOpacity=".28" /><stop offset="1" stopColor="#ff6a1a" stopOpacity="0" /></linearGradient></defs>
        {[20, 45, 70, 95].map((g) => <line key={g} x1={3} x2={97} y1={g} y2={g} stroke="#e6e6e3" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        <path d={`M${X(0)},96 L${line.replace(/ /g, ' L')} L${X(pts.length - 1)},96 Z`} fill="url(#x-fill)" />
        <polyline points={line} fill="none" stroke="#ff6a1a" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <line x1={3} x2={97} y1={Y(avg)} y2={Y(avg)} stroke="#686862" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line x1={X(i)} x2={X(i)} y1={4} y2={96} stroke="#16161655" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <i className="x-mini-now" style={{ left: `${X(i)}%`, top: `${Y(pts[i]!.value)}%` }} />
    </div>
    <div className="x-axis"><span>{shortDate(pts[0]!.date)}</span><span>{shortDate(pts[pts.length - 1]!.date)}</span></div>
    <p className="x-hint">Move across the chart, or use ← →, to read any day.</p>
    <div className="x-stats3">
      <div><span>{days}-day average</span><strong>{fmt(avg, m.digits)}<small>{m.unit}</small></strong></div>
      <div><span>Recorded days</span><strong>{pts.length}<small>/ {days}</small></strong></div>
      <div><span>Daily range</span><strong>{fmt(lo, m.digits)} – {fmt(hi, m.digits)}</strong></div>
    </div>
    <p className="x-method">Readings from {sample ? 'Sample data' : 'your saved and imported records'}. Dashed line: the {days}-day average of daily values; missing days are left out. The change compares a day with your other days in the last {days}.</p>
    <section className="x-explainer"><h3>What {m.label.toLowerCase()} means</h3><p>{m.what}</p><p>{m.context}</p></section>
  </Dialog>;
}

/** A standard metric tile: title, badge vs 30-day average, big number, 14-day mini chart, opens the explorer. */
export function MetricTile({ id, tone = 'light', group, lastLabel, className, style, children }: {
  id: string; tone?: Tone; group?: string[]; lastLabel?: string; className?: string; style?: React.CSSProperties; children?: ReactNode;
}) {
  const m = METRICS[id]!;
  const { open } = useExplore();
  const sample = useSampleMode(); useDataVersion();
  const month = pointsFor(id, 30, sample);
  const last = lastLabel ?? 'Today';
  if (!month.length) return <Card tone={tone} className={className} style={style}>
    <CardHead title={m.label} />
    <p className="x-empty" style={{ marginTop: 22 }}>{m.label} appears once a connected source records it.</p>
    <div style={{ marginTop: 12 }}><Link className="x-btn ghost small" to="/integrations">Connect a source</Link></div>
  </Card>;
  const vs = versusAverage(id, month);
  const recent = month.slice(-14);
  const latest = month[month.length - 1]!.date;
  const caption = sample || +latest === +dayStart() ? last : `Last recorded ${shortDate(latest)}`;
  return <Card tone={tone} className={className} style={style}>
    <CardHead title={m.label} badge={month.length > 1 ? vs.text : undefined} badgeTitle={vs.title} onOpen={() => open(id, group)} />
    <Stat value={fmt(vs.last, m.digits)} unit={m.unit} />
    <span className="x-caption">{caption}</span>
    {children}
    {recent.length > 1 && <MiniChart points={recent} kind={m.chart} tone={tone} digits={m.digits} lastLabel={sample ? last : shortDate(latest)} label={m.label} />}
  </Card>;
}

/** Section heading row: h1 + optional subtitle on the left, actions on the right. */
export const PageHead = ({ title, subtitle, children, hidden }: { title: string; subtitle?: ReactNode; children?: ReactNode; hidden?: boolean }) => hidden
  ? <h1 className="sr-only">{title}</h1>
  : <header className="x-page-head"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children && <div className="x-page-actions">{children}</div>}</header>;
