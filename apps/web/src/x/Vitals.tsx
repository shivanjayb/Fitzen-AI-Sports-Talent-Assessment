import { useId } from 'react';
import { Link } from 'react-router-dom';
import { dayStart, fmt, mean, pointsFor, useDataVersion, useSampleMode, versusAverage, type Point } from './sample';
import { Card, CardHead, Icon, MetricTile, PageHead, Soon, Stat, useExplore } from './ui';
import { RECOVERY_FORMULA, recoveryDays } from './recovery';
import { readGoals } from './sleepGoals';
import './vitals.css';

const TILES = ['rhr', 'spo2', 'hrv', 'resp', 'skin', 'steps', 'active', 'strain', 'burned', 'hr'];
const GROUP = ['recovery', ...TILES];
const TICKS = [1, 4, 7, 10, 13];
const DAY = 864e5;
const dayLabel = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const ManageSources = () => <Link className="x-btn ghost" to="/integrations">Manage sources<Icon name="arrow" /></Link>;
const Empty = ({ label }: { label: string }) => <div className="x-vitals-empty">
  <p className="x-empty">{label} appears once a connected source records it.</p>
  <Link className="x-btn small ghost" to="/integrations">Connect a source</Link>
</div>;

/** Last 30 days of recovery: device values where recorded, otherwise the Fitzen estimate. */
function recoveryPoints(sample: boolean): { pts: Point[]; estimated: boolean } {
  const days = Array.from({ length: 30 }, (_, i) => new Date(dayStart().getTime() - (29 - i) * DAY));
  const readings = recoveryDays(days, (id) => pointsFor(id, 60, sample), readGoals().sleep);
  const pts = days.flatMap((date, i) => { const r = readings[i]; return r ? [{ date, value: r.value }] : []; });
  return { pts, estimated: readings.some((r) => r?.estimate) };
}

function RecoveryHero({ month, estimated }: { month: Point[]; estimated: boolean }) {
  const { open } = useExplore();
  const clip = `x-above-${useId().replace(/:/g, '')}`;
  const cutoff = dayStart().getTime() - 13 * DAY;
  const pts = month.filter((p) => +p.date >= cutoff), vals = pts.map((p) => p.value), n = vals.length;
  const avg = mean(vals), sd = Math.sqrt(mean(vals.map((v) => (v - avg) ** 2)));
  const lo = Math.min(...vals, avg - sd), hi = Math.max(...vals, avg + sd);
  const X = (i: number) => (n > 1 ? i / (n - 1) : 1) * 100, Y = (v: number) => 92 - ((v - lo) / (hi - lo || 1)) * 84;
  const vs = versusAverage('recovery', month), avg30 = mean(month.map((p) => p.value));
  const lastDate = pts[n - 1]!.date, today = +lastDate === +dayStart();
  const trace = vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const avgY = Y(avg), bandTop = Y(avg + sd), bandBottom = Y(avg - sd);
  return <Card tone="dark" className="x-vitals-hero">
    <CardHead title={<>Recovery <span className="x-vitals-muted">· 14 days</span></>} badge={vs.text} badgeTitle={vs.title}
      onOpen={estimated ? undefined : () => open('recovery', GROUP)} openLabel={`Open Recovery details (${vs.title})`} />
    <Stat value={fmt(vs.last)} unit="%" big={72} />
    <span className="x-caption">{today ? 'Today' : dayLabel(lastDate)} · {month.length > 1 ? vs.title : 'First reading'}</span>
    {estimated && <p className="x-vitals-estimate"><b>Fitzen estimate</b> {RECOVERY_FORMULA.replace('Fitzen estimate: ', '')}</p>}
    <div className="x-vitals-trend">
      <div className="x-vitals-plot">
        {[avg + sd, avg, avg - sd].map((v, k) => <span key={k} className="x-vitals-axis" style={{ top: `${Y(v)}%` }}>{Math.round(v)}</span>)}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Recovery over the last ${n} recorded days`}>
          <defs><clipPath id={clip}><rect x={0} y={0} width={100} height={avgY} /></clipPath></defs>
          {TICKS.map((i) => <line key={i} x1={X(i)} x2={X(i)} y1={0} y2={100} stroke="#ffffff17" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <g opacity={.16}>{Array.from({ length: 180 }, (_, k) => {
            const x = ((k + .5) / 180) * 100;
            return <line key={k} x1={x} x2={x} y1={bandTop} y2={bandBottom} stroke="#fff" strokeWidth={1.2} strokeOpacity={.25 + ((k * 37) % 75) / 100} vectorEffect="non-scaling-stroke" />;
          })}</g>
          <polygon points={`0,${avgY} ${trace} 100,${avgY}`} fill="#ff6a1a" opacity={.38} clipPath={`url(#${clip})`} />
          <polyline points={trace} fill="none" stroke="#f5f5f3" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <i className="x-vitals-now" style={{ left: '100%', top: `${Y(vals[n - 1]!)}%` }} />
      </div>
      <div className="x-vitals-dates">{TICKS.filter((i) => i < n).map((i) => <span key={i} style={{ left: `${X(i)}%` }}>{dayLabel(pts[i]!.date)}</span>)}</div>
    </div>
    <div className="x-legend x-vitals-legend"><span><i className="t-accent" />Above your 14-day average</span><span><i className="x-vitals-band-key" />Your usual range</span></div>
    <div className="x-vitals-cells">
      <span><small>14-day low</small><b>{fmt(Math.min(...vals))}<small>%</small></b></span>
      <span><small>14-day high</small><b>{fmt(Math.max(...vals))}<small>%</small></b></span>
      <span><small>Days recorded</small><b>{n}<small>of 14</small></b></span>
    </div>
    <div className="x-vitals-foot"><span>30-day avg <b>{fmt(avg30)}</b> %</span></div>
  </Card>;
}

const TrainingHeart = () => <Card className="x-vitals-train">
  <CardHead title="Heart rate from training"><Soon /></CardHead>
  <div className="x-vitals-train-body">
    <span className="x-vitals-train-icon"><Icon name="watch" /></span>
    <p><b>Coming soon · smartwatch heart rate during sessions</b>
      <span>Pair a watch and each camera session will show your heart rate and effort beside your reps and form score.</span></p>
  </div>
</Card>;

export default function Vitals() {
  const sample = useSampleMode(); useDataVersion();
  const tall = (i: number) => (i < 2 ? 'x-vitals-tall' : undefined);
  const { pts, estimated } = recoveryPoints(sample);
  return <>
    <PageHead title="Vitals" subtitle={`${GROUP.length} signals from ${sample ? 'Sample data' : 'your imported and entered records'} · compared with your own recent days.`}>
      <ManageSources />
    </PageHead>
    <div className="x-vitals-grid">
      {pts.length ? <RecoveryHero month={pts} estimated={estimated} /> : <Card tone="dark" className="x-vitals-hero"><CardHead title="Recovery" /><Empty label="Recovery" />
        <p className="x-vitals-estimate">Or record 7 days of HRV or resting heart rate and Fitzen estimates it for you.</p></Card>}
      {TILES.map((id, i) => <MetricTile key={id} id={id} group={GROUP} className={tall(i)} />)}
      <TrainingHeart />
    </div>
  </>;
}
