import { Link } from 'react-router-dom';
import { assessEvidence, exerciseById, standardReps, summarizeReport } from '@fitzen/engines';
import { getHistory, getProfile, isEligibleSession, measureOf, type SavedSession } from '../app/store';
import { Icon } from './ui';

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Home's first screenful: what to do next, the last real result, and this week's training days. All from saved sessions. */
export default function Today() {
  const real = getHistory().filter((s: SavedSession) => s.source !== 'demo').sort((a, b) => b.report.startedAt.localeCompare(a.report.startedAt));
  const last = real.find(isEligibleSession);
  const ex = last ? exerciseById(last.report.exerciseId) : undefined;
  const evidence = last ? assessEvidence(ex, last.report) : null;
  const summary = last && evidence ? summarizeReport(ex, last.report, evidence) : null;
  const m = last ? measureOf(last.report) : null;
  const value = m ? (m.metric === 'reps' ? standardReps(last!.report) ?? m.value : m.value) : null;
  const name = getProfile().name.trim().split(' ')[0];
  const hour = new Date().getHours();
  const trained = new Set(real.map((s) => dayKey(new Date(s.report.startedAt))));
  const now = new Date();
  const week = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i)));

  return <section className="fz-today" aria-label="Today">
    <div className="fz-next">
      <span className="fz-today-date" style={{ color: '#c9c6be' }}>{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <h1>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}{name ? `, ${name}` : ''}</h1>
      {summary && last
        ? <p>{summary.focus ? <>Last time on {last.report.name}: <b style={{ color: '#fff' }}>{summary.focus.title.toLowerCase()}</b>. Retest it today under the same setup.</> : <>Your last {last.report.name} held up well. Add a little and retest.</>}</p>
        : <p>Prop your phone, step back, and get your first measured result. It takes about two minutes and needs no equipment.</p>}
      <div className="fz-actions">
        {last && ex ? <Link className="x-btn accent" to={`/exercise/${ex.id}`}><Icon name="camera" />Retest {ex.name}</Link>
          : <Link className="x-btn accent" to="/guided"><Icon name="camera" />Start guided assessment</Link>}
        <Link className="x-btn ghost" to="/train">Browse movements</Link>
      </div>
    </div>
    {last && m && value !== null
      ? <Link className="fz-last" to={`/results/${last.id}`} aria-label={`Open your last report: ${last.report.name}`}>
        <span className="fz-today-date">Last result · {new Date(last.report.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
        <b style={{ fontSize: 17, fontWeight: 650 }}>{last.report.name}</b>
        <span className="fz-row"><span className="fz-num">{Number(value.toFixed(1))}</span><small>{m.unit} · form {last.report.formScore}/100</small></span>
        {evidence && <span className={`rx-badge ev-${evidence.level}`} style={{ alignSelf: 'flex-start' }}>{evidence.level === 'strong' ? 'Strong evidence' : 'Limited evidence'}</span>}
        <WeekStrip week={week} trained={trained} />
      </Link>
      : <div className="fz-last">
        <span className="fz-today-date">This week</span>
        <b style={{ fontSize: 17, fontWeight: 650 }}>No measured result yet</b>
        <small>Your latest result, its evidence quality and your training days will show here after your first attempt.</small>
        <WeekStrip week={week} trained={trained} />
      </div>}
  </section>;
}

function WeekStrip({ week, trained }: { week: Date[]; trained: Set<string> }) {
  const count = week.filter((d) => trained.has(dayKey(d))).length;
  return <div className="fz-week" role="img" aria-label={`Trained on ${count} of the last 7 days`}>
    {week.map((d, i) => <span key={i}><i className={`${trained.has(dayKey(d)) ? 'on' : ''}${i === 6 ? ' today' : ''}`} />{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>)}
  </div>;
}
