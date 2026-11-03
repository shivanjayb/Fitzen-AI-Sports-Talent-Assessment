import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { exerciseById, isAssessedReport, standardReps } from '@fitzen/engines';
import { Thumb } from '../app/Figure';
import { getHistory, measureOf, SYNCED, verdictOf, type SavedSession, type Verdict } from '../app/store';
import { dayStart, shortDate } from './sample';
import { Card, CardHead, Icon, Marker, MiniChart, PageHead, Stat } from './ui';
import './reports.css';

const SOURCE = { camera: 'Camera', video: 'Video', demo: 'Demo' } as const;
const VERDICT: Record<Verdict, string> = { genuine: 'Verified', review: 'Review', suspect: 'Flagged' };
const DAY = 86_400_000;

/** Headline number, with reps compared against standard depth like History does. */
function headline(s: SavedSession) {
  const m = measureOf(s.report);
  if (!m) return null;
  const v = m.metric === 'reps' ? standardReps(s.report) : m.value;
  return v == null ? null : { value: Number(v.toFixed(1)), unit: m.unit };
}
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function LinkCard({ to, title, icon, text }: { to: string; title: string; icon: 'flag' | 'trophy'; text: string }) {
  return <Link to={to} className="x-card x-tile x-reports-link">
    <div className="x-card-head"><Marker /><h2>{title}</h2><span className="x-spacer" /><span className="x-icon-btn small" aria-hidden><Icon name="arrow" /></span></div>
    <span className="x-reports-link-glyph" aria-hidden><Icon name={icon} size={22} /></span>
    <p className="x-caption">{text}</p>
  </Link>;
}

export default function Reports() {
  const [, refresh] = useState(0);
  const [filter, setFilter] = useState<'all' | 'camera' | 'video'>('all');
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    window.addEventListener(SYNCED, update);
    return () => window.removeEventListener(SYNCED, update);
  }, []);

  const all = getHistory().slice().sort((a, b) => Date.parse(b.report.startedAt) - Date.parse(a.report.startedAt));
  const real = all.filter((s) => s.source !== 'demo');
  const today = dayStart().getTime();
  const week = all.filter((s) => Date.parse(s.report.startedAt) >= today - 6 * DAY);
  const weekMin = Math.round(week.reduce((a, s) => a + s.report.durationSec, 0) / 60);
  const best = real.filter((s) => isAssessedReport(s.report)).reduce<SavedSession | null>((b, s) => !b || s.report.formScore > b.report.formScore ? s : b, null);
  const verdicts = { genuine: 0, review: 0, suspect: 0 };
  for (const s of real) verdicts[verdictOf(s)]++;
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = today - (13 - i) * DAY;
    return { date: new Date(start), value: all.filter((s) => { const t = Date.parse(s.report.startedAt); return t >= start && t < start + DAY; }).length };
  });
  const list = filter === 'all' ? all : all.filter((s) => s.source === filter);

  return <div className="x-reports">
    <PageHead title="Reports" subtitle="Every session you’ve recorded, with its full report." />
    <div className="x-grid x-reports-grid">
      <Card tone="dark">
        <CardHead title="Total sessions" />
        <Stat value={all.length} unit={all.length === 1 ? 'session' : 'sessions'} />
        <span className="x-caption">{real.length} measured · {all.length - real.length} demo</span>
      </Card>
      <Card>
        <CardHead title="This week" badge={week.length ? `${weekMin} min` : undefined} badgeTitle="Time recorded in the last 7 days" />
        <Stat value={week.length} unit={week.length === 1 ? 'session' : 'sessions'} />
        <span className="x-caption">Last 7 days</span>
      </Card>
      <Card>
        <CardHead title="Best form score" />
        <Stat value={best ? best.report.formScore : '—'} unit="/ 100" />
        <span className="x-caption">{best ? `${best.report.name} · ${shortDate(new Date(best.report.startedAt))}` : 'Appears after your first measured session'}</span>
      </Card>
      <Card tone="night">
        <CardHead title="Verified vs review" />
        <Stat value={verdicts.genuine} unit="verified" />
        <span className="x-caption">{verdicts.review} to review · {verdicts.suspect} flagged</span>
        {real.length > 0 && <>
          <div className="x-reports-split" role="img" aria-label={`Verified ${verdicts.genuine}, review ${verdicts.review}, flagged ${verdicts.suspect}`}>
            {verdicts.genuine > 0 && <i className="t-accent" style={{ flex: verdicts.genuine }} />}
            {verdicts.review > 0 && <i className="t-violet" style={{ flex: verdicts.review }} />}
            {verdicts.suspect > 0 && <i className="t-blue" style={{ flex: verdicts.suspect }} />}
          </div>
          <div className="x-legend"><span><i className="t-accent" />Verified</span><span><i className="t-violet" />Review</span><span><i className="t-blue" />Flagged</span></div>
        </>}
      </Card>

      <Card className="x-reports-chart">
        <CardHead title="Sessions per day" badge={`${days.reduce((a, d) => a + d.value, 0)} in 14 days`} />
        {days.some((d) => d.value > 0)
          ? <MiniChart points={days} kind="bars" label="Sessions per day" digits={1} />
          : <p className="x-empty x-reports-wait">Your daily sessions appear here once you train.</p>}
      </Card>
      <LinkCard to="/progress" title="Progress & goals" icon="flag" text="Set a target for one movement and follow it across sessions." />
      <LinkCard to="/compete" title="Leaderboards" icon="trophy" text="See how your verified results rank in your group, city, state and country." />

      <Card className="x-reports-list">
        <div className="x-card-head">
          <Marker /><h2>Sessions <span className="x-reports-muted">· {list.length}</span></h2><span className="x-spacer" />
          <div className="x-reports-filters" role="group" aria-label="Source">
            {(['all', 'camera', 'video'] as const).map((f) => <button key={f} className="x-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : SOURCE[f]}</button>)}
          </div>
        </div>
        {list.length ? <ul className="x-reports-rows">{list.map((s) => {
          const ex = exerciseById(s.report.exerciseId), h = headline(s), v = verdictOf(s);
          return <li key={s.id}><Link to={`/results/${s.id}`} className="x-reports-row">
            {ex ? <Thumb def={ex} size={48} /> : <span className="x-reports-thumb" aria-hidden />}
            <span className="x-reports-name"><b>{s.report.name}</b><time dateTime={s.report.startedAt}>{when(s.report.startedAt)}</time></span>
            <span className="x-reports-value num">{h ? <>{h.value}<small>{h.unit}</small></> : '—'}</span>
            <span className="x-reports-badges">
              <span className="x-badge">{SOURCE[s.source]}</span>
              <span className={`x-badge x-reports-v-${s.source === 'demo' ? 'demo' : v}`}>{s.source === 'demo' ? 'Not scored' : VERDICT[v]}</span>
            </span>
            <Icon name="chevron" size={16} />
          </Link></li>;
        })}</ul>
          : <div className="x-reports-empty">
            <p className="x-empty">{all.length ? 'No sessions from this source yet.' : 'Your reports appear here after your first session.'}</p>
            <Link to="/train" className="x-btn small accent">Start training</Link>
          </div>}
        {all.length > 0 && <p className="x-reports-note">Open <Link to="/history">full history</Link> to compare attempts of one movement. Reports stay on this device; sign in from Profile to back them up.</p>}
      </Card>
    </div>
  </div>;
}
