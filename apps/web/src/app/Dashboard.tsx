import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { exerciseById, standardReps } from '@fitzen/engines';
import { PageHeader } from './Shell';
import { getHistory, getProfile, isEligibleSession, measureOf, SYNCED, type SavedSession } from './store';
import { openAssistant } from './openAssistant';
import { IconChevron, IconFlag, IconHistory, IconSparkle } from './icons';
import { t } from './language';
import { getWellnessRecords, subscribeWellness } from './wellnessStore';
import './dashboard.css';

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const format = (n: number, unit: string) => n.toLocaleString(undefined, { maximumFractionDigits: unit === 'reps' ? 0 : 1 });
const metricOf = (s: SavedSession) => {
  const metric = measureOf(s.report);
  if (metric?.metric !== 'reps') return metric;
  const value = standardReps(s.report);
  return value === null ? null : { ...metric, value };
};
const dateOf = (s: SavedSession) => new Date(s.report.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function Trend({ values, unit, name }: { values: number[]; unit: string; name: string }) {
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${8 + i / Math.max(1, values.length - 1) * 244},${65 - (v - low) / span * 50}`).join(' ');
  return <svg className="dash-trend" viewBox="0 0 260 80" role="img" aria-label={`${name}: ${values.map(v => format(v, unit)).join(', ')} ${unit}, oldest to newest`}>
    <path d="M8 70H252" stroke="currentColor" opacity=".15" />
    <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {values.map((v, i) => <circle key={i} cx={8 + i / Math.max(1, values.length - 1) * 244} cy={65 - (v - low) / span * 50} r="3" fill="currentColor" />)}
  </svg>;
}

/** Uses the account-scoped reports behind History, Results and cloud backup. */
export default function Dashboard() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(n => n + 1);
    window.addEventListener(SYNCED, update);
    const unsubscribeWellness = subscribeWellness(update);
    window.addEventListener('storage', update);
    return () => { unsubscribeWellness(); window.removeEventListener(SYNCED, update); window.removeEventListener('storage', update); };
  }, []);
  const all = getHistory();
  const sessions = all.filter(isEligibleSession).filter(s => Number.isFinite(Date.parse(s.report.startedAt)) && Date.parse(s.report.startedAt) <= Date.now()).sort((a, b) => Date.parse(b.report.startedAt) - Date.parse(a.report.startedAt));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6 + i); return d; });
  const week = sessions.filter(s => Date.parse(s.report.startedAt) >= days[0]!.getTime());
  const previousWeekStart = new Date(days[0]!); previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeek = sessions.filter(s => { const d = Date.parse(s.report.startedAt); return d >= previousWeekStart.getTime() && d < days[0]!.getTime(); });
  const activeDays = new Set(week.map(s => localDay(new Date(s.report.startedAt))));
  const minutes = week.reduce((n, s) => n + s.report.durationSec / 60, 0);
  const averageForm = week.length ? Math.round(week.reduce((n, s) => n + s.report.formScore, 0) / week.length) : null;
  const name = getProfile().name.trim();
  const measured = new Map<string, Array<{ session: SavedSession; value: number; unit: string; metric: string }>>();
  for (const session of sessions) {
    const m = metricOf(session);
    if (!m || !Number.isFinite(m.value)) continue;
    const validity = session.report.validity;
    // Legacy reports still appear, but missing protocol/version never becomes a comparable series.
    const key = JSON.stringify([session.report.exerciseId, m.metric, m.unit, validity?.protocolId, validity?.modelVersion,
      validity?.protocolId && validity.modelVersion ? '' : session.id]);
    measured.set(key, [...(measured.get(key) ?? []), { session, ...m }]);
  }
  const shownExercises = new Set<string>();
  const trends = [...measured.values()].filter(points => {
    const id = points[0]!.session.report.exerciseId;
    if (shownExercises.has(id)) return false;
    shownExercises.add(id); return true;
  }).slice(0, 3);
  const wellness = getWellnessRecords().filter(r => !r.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const signals = [
    { kind: 'sleep', key: 'hours', title: 'Sleep', unit: 'h', route: '/sleep', prompt: 'Log your first night' },
    { kind: 'vitals', key: 'rhr', title: 'Resting heart rate', unit: 'bpm', route: '/vitals', prompt: 'Add a measured reading' },
    { kind: 'body', key: 'weight', title: 'Body weight', unit: 'kg', route: '/body', prompt: 'Add a body measurement' },
  ].map(signal => ({ ...signal, readings: wellness.filter(r => r.kind === signal.kind && Number.isFinite(r.values[signal.key])) }));
  return <main className="page dashboard">
    <PageHeader title={t('Summary')} kicker={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} />
    <div className="dash-intro"><p>{name && name !== 'Athlete' ? `${name}, ` : ''}{sessions.length ? t('Your training, in perspective.') : t('A clear place to begin.')}</p><Link to="/progress">{t('Detailed progress')} <IconChevron /></Link></div>
    <div className="dash-top">
      <section className="dash-start">
        <span className="dash-label">{t('Guided assessment')}</span>
        <h2>{sessions.length ? t('Build on your last performance.') : t('Discover your starting point.')}</h2>
        <p>{t('Jump, squat, push-up and plank. Four guided tests with camera setup and a report you can return to.')}</p>
        <div className="dash-actions"><Link to="/guided" className="btn primary press"><IconFlag /> {sessions.length ? t('Start an assessment') : t('Start your first assessment')}</Link><Link to="/app" className="dash-text-link">{t('Browse exercises')} <IconChevron /></Link></div>
        <small>{t('Video stays on your device. No account needed.')}</small>
      </section>
      <section className="dash-week">
        <div className="dash-section-head"><h2>{t('Your week')}</h2><span>{days[0]!.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – {days[6]!.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></div>
        <div className="dash-days">{days.map(d => { const active = activeDays.has(localDay(d)); return <div key={localDay(d)} className={active ? 'is-active' : ''} aria-label={`${d.toLocaleDateString()}: ${active ? 'eligible training recorded' : 'no eligible training recorded'}`}><span>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span><b>{d.getDate()}</b></div>; })}</div>
        <dl className="dash-week-stats"><div><dt>{t('Active days')}</dt><dd>{activeDays.size}<small> / 7</small></dd></div><div><dt>{t('Sessions')}</dt><dd>{week.length}</dd></div><div><dt>{t('Training')}</dt><dd>{Math.round(minutes)}<small> min</small></dd></div></dl>
        <p className="dash-footnote">{previousWeek.length ? `${week.length - previousWeek.length >= 0 ? '+' : ''}${week.length - previousWeek.length} sessions compared with the previous 7 days.` : t('Your own sessions build this picture. Rest days are part of training.')}</p>
      </section>
    </div>
    <div className="dash-section-head dash-heading"><h2>{t('Your daily signals')}</h2><Link to="/journal">{t('Check in')} <IconChevron /></Link></div>
    <div className="dash-metrics dash-signals">{signals.map(signal => {
      const latest = signal.readings[0];
      const series = signal.readings.slice(0, 12).reverse();
      return <section className="dash-metric" key={signal.key}>
        <div className="dash-section-head"><h3>{t(signal.title)}</h3><Link to={signal.route} aria-label={`${t('Open')} ${t(signal.title)}`}><IconChevron /></Link></div>
        <div className="dash-reading">{latest ? format(latest.values[signal.key]!, signal.unit) : '—'} <small>{signal.unit}</small></div>
        <p className="dash-comparison">{latest ? `${t('Recorded')} ${new Date(`${latest.date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : t('No reading recorded yet')}</p>
        {series.length > 1 ? <Trend values={series.map(r => r.values[signal.key]!)} name={t(signal.title)} unit={signal.unit} /> : <div className="dash-trend-empty">{latest ? t('More readings will reveal your pattern.') : t(signal.prompt)}</div>}
        <div className="dash-metric-bottom"><small>{t('Self-reported records')}</small><Link to={signal.route}>{latest ? t('View history') : t('Add reading')}</Link></div>
      </section>;
    })}</div>
    <div className="dash-section-head dash-heading"><h2>{t('Performance over time')}</h2><Link to="/history">{t('View history')} <IconChevron /></Link></div>
    {trends.length ? <div className="dash-metrics">{trends.map(points => {
      const latest = points[0]!, previous = points[1];
      const shown = points.slice(0, 12).reverse();
      const delta = previous ? latest.value - previous.value : null;
      return <section className="dash-metric" key={`${latest.session.report.exerciseId}:${latest.metric}`}>
        <div className="dash-section-head"><h3>{latest.session.report.name}</h3><Link to={`/results/${latest.session.id}`} aria-label={`${t('Open report')}: ${latest.session.report.name}`}><IconChevron /></Link></div>
        <div className="dash-reading">{format(latest.value, latest.unit)} <small>{latest.unit}</small></div>
        <p className="dash-comparison">{delta === null ? t(latest.session.report.validity?.protocolId && latest.session.report.validity.modelVersion ? 'Your first comparable baseline' : 'Protocol or engine version not recorded') : `${delta > 0 ? '+' : ''}${format(delta, latest.unit)} ${latest.unit} since ${dateOf(previous!.session)}`}</p>
        {shown.length > 1 ? <Trend values={shown.map(p => p.value)} unit={latest.unit} name={latest.session.report.name} /> : <div className="dash-trend-empty">{t('Repeat the same assessment protocol to see your trend.')}</div>}
        <div className="dash-metric-bottom"><small>{dateOf(latest.session)} · {points.length} {t(points.length > 1 ? 'comparable readings' : 'recorded reading')}</small><Link to={`/history?exercise=${encodeURIComponent(latest.session.report.exerciseId)}`}>{t('History')}</Link></div>
        {shown.length > 1 && <details className="dash-data"><summary>{t('View readings')}</summary><table><caption>{latest.session.report.name} · {latest.unit}</caption><thead><tr><th>{t('Date')}</th><th>{t('Result')}</th></tr></thead><tbody>{shown.map(p => <tr key={p.session.id}><td><Link to={`/results/${p.session.id}`}>{dateOf(p.session)}</Link></td><td>{format(p.value, p.unit)} {p.unit}</td></tr>)}</tbody></table></details>}
      </section>;
    })}</div> : <section className="dash-empty"><IconHistory /><div><h3>{t('Your history starts with one assessment.')}</h3><p>{t('Your results and graphs appear here after an eligible camera or video session. Demos stay in History so practice never becomes a performance claim.')}</p><Link to="/history">{t('Open history')} <IconChevron /></Link></div></section>}
    <div className="dash-lower">
      <section className="dash-recent"><div className="dash-section-head"><h2>{t('Recent sessions')}</h2><Link to="/history">{t('See all')} <IconChevron /></Link></div>
        {all.length ? <div className="dash-session-list">{[...all].sort((a, b) => Date.parse(b.report.startedAt) - Date.parse(a.report.startedAt)).slice(0, 4).map(s => {
          const m = metricOf(s), eligible = isEligibleSession(s);
          return <Link key={s.id} to={`/results/${s.id}`}><div><b>{exerciseById(s.report.exerciseId)?.name ?? s.report.name}</b><small>{dateOf(s)} · {s.source === 'demo' ? t('Practice demo') : eligible ? t('Eligible session') : t('Needs review')}</small></div><span>{eligible && m ? `${format(m.value, m.unit)} ${m.unit}` : t('View report')}</span><IconChevron /></Link>;
        })}</div> : <p className="dash-empty-text">{t('Nothing recorded yet. Try a guided test, or watch a demo before using your camera.')}</p>}
      </section>
      <section className="dash-coach"><IconSparkle /><h2>{t('Know what to work on next.')}</h2><p>{averageForm !== null ? `${t('Average form this week')}: ${averageForm}/100. ` : ''}{t('Your local coach explains saved reports and gives practical next steps. It works on your device.')}</p><button className="btn press" onClick={() => openAssistant({ kind: 'progress' })}>{t('Ask about my progress')} <IconChevron /></button></section>
    </div>
    <div className="dash-section-head dash-heading"><h2>{t('Beyond the session')}</h2><Link to="/integrations">{t('Data & connections')} <IconChevron /></Link></div>
    <nav className="dash-wellness" aria-label={t('Wellness records')}>{[
      ['/sleep', 'Sleep', 'Record your nights and find your rhythm.'], ['/vitals', 'Vitals', 'Resting heart rate and HRV, when measured.'], ['/body', 'Body', 'Follow your own measurements over time.'], ['/nutrition', 'Nutrition', 'Keep a simple record of meals and nutrients.'], ['/journal', 'Journal', 'Notice how you feel alongside your training.'], ['/blood-records', 'Blood records', 'Keep your own lab readings in one place.'],
    ].map(([to, title, copy]) => <Link key={to} to={to!}><b>{t(title!)}</b><p>{t(copy!)}</p><span>{t('Open')} <IconChevron /></span></Link>)}</nav>
    <p className="dash-disclaimer">{t('Performance trends compare retained eligible sessions with the same exercise, recorded protocol and engine version. Reps use standard depth targets. Graph points show the last recorded readings, evenly spaced. Camera measurements are screening estimates. Your records support reflection and do not replace a clinician or coach.')}</p>
  </main>;
}
