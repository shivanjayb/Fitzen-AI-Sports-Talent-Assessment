import { t } from './language';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { exerciseById, standardReps } from '@fitzen/engines';
import { getHistory, isEligibleSession, measureOf, SYNCED, type SavedSession } from './store';
import { Thumb } from './Figure';
import { PageHeader } from './Shell';
import { IconFlag, IconSparkle } from './icons';
import { openAssistant } from './openAssistant';

/** Repetition comparisons use catalog targets even when practice ranges were personalized. */
const measured = (s: SavedSession) => {
  const m = measureOf(s.report);
  if (m?.metric !== 'reps') return m;
  const value = standardReps(s.report);
  return value === null ? null : { ...m, value };
};
const valueLabel = (n: number) => Number(n.toFixed(1));

export default function History() {
  const [params, setParams] = useSearchParams();
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    window.addEventListener(SYNCED, update);
    return () => window.removeEventListener(SYNCED, update);
  }, []);
  const h = getHistory().slice().sort((a, b) => new Date(b.report.startedAt).getTime() - new Date(a.report.startedAt).getTime());
  const exercise = params.get('exercise') ?? 'all';
  const status = params.get('status') ?? 'all';
  const exercises = [...new Map(h.map((s) => [s.report.exerciseId, s.report.name])).entries()];
  const selected = exercise === 'all' ? undefined : exerciseById(exercise);
  const list = h.filter((s) => (exercise === 'all' || s.report.exerciseId === exercise) && (status === 'all' || (status === 'eligible' ? isEligibleSession(s) : status === 'demo' ? s.source === 'demo' : s.source !== 'demo' && !isEligibleSession(s))));
  const eligible = h.filter((s) => s.report.exerciseId === exercise && isEligibleSession(s) && measured(s));
  const latest = eligible[0];
  const latestMetric = latest ? measured(latest) : null;
  const compatible = latest && latestMetric ? eligible.filter((s) => !!s.report.validity && s.report.validity.protocolId === latest.report.validity?.protocolId && s.report.validity.modelVersion === latest.report.validity?.modelVersion && measured(s)?.metric === latestMetric.metric).slice(0, 12).reverse() : [];
  const first = compatible[0], previous = compatible.at(-2);
  const firstMetric = first ? measured(first) : null, previousMetric = previous ? measured(previous) : null;
  const byDay = new Map<string, typeof h>();
  for (const s of list) {
    const d = new Date(s.report.startedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };
  const values = compatible.map((s) => measured(s)!.value);
  const min = Math.min(...values), max = Math.max(...values);
  const points = values.map((v, i) => `${20 + i / Math.max(1, values.length - 1) * 560},${135 - (v - min) / (max - min || 1) * 110}`);

  return (
    <main className="page quiet-history">
      <PageHeader title={t('History')} back />
      <p className="muted">{t('Every attempt, its report and your progress. Demo and incomplete attempts stay separate from performance trends.')}</p>
      <div className="history-toolbar">
        <label>{t('Exercise')}<select value={exercise} onChange={(e) => updateFilter('exercise', e.target.value)}><option value="all">{t('All exercises')}</option>{selected && !exercises.some(([id]) => id === exercise) && <option value={exercise}>{t(selected.name)}</option>}{exercises.map(([id, name]) => <option key={id} value={id}>{t(name)}</option>)}</select></label>
        <label>{t('Attempts')}<select value={status} onChange={(e) => updateFilter('status', e.target.value)}><option value="all">{t('All attempts')}</option><option value="eligible">{t('Measured assessments')}</option><option value="demo">{t('Demos')}</option><option value="review">{t('Incomplete or needs review')}</option></select></label>
        {h.length > 0 && <button className="btn press" onClick={() => openAssistant({ kind: 'progress' })}><IconSparkle />{t('Ask local coach')}</button>}
      </div>
      {selected && <section className="history-comparison" aria-label={t('Exercise progress')}>
        <div className="training-library-head"><h2>{t(selected.name)}</h2><Link to={`/exercise/${selected.id}`} className="btn">{t('Train again')}</Link></div>
        {latestMetric ? <>
          <dl className="history-stats"><div><dt>{t('Latest measured')}</dt><dd>{valueLabel(latestMetric.value)} <small>{latestMetric.unit}</small></dd></div><div><dt>{t('Since previous')}</dt><dd>{previousMetric ? `${latestMetric.value - previousMetric.value > 0 ? '+' : ''}${valueLabel(latestMetric.value - previousMetric.value)} ${latestMetric.unit}` : '—'}</dd></div><div><dt>{t('Since first shown')}</dt><dd>{firstMetric && compatible.length > 1 ? `${latestMetric.value - firstMetric.value > 0 ? '+' : ''}${valueLabel(latestMetric.value - firstMetric.value)} ${latestMetric.unit}` : '—'}</dd></div></dl>
          {compatible.length > 1 ? <figure className="history-trend"><svg viewBox="0 0 600 160" role="img" aria-label={t('Last {n} measured attempts, oldest to newest', { n: compatible.length })}><path d="M20 140H580" stroke="currentColor" opacity=".15" /><polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" />{points.map((p, i) => { const [cx, cy] = p.split(','); return <circle key={compatible[i]!.id} cx={cx} cy={cy} r="4"><title>{new Date(compatible[i]!.report.startedAt).toLocaleDateString()}: {valueLabel(values[i]!)} {latestMetric.unit}</title></circle>; })}</svg><figcaption><span>{new Date(first!.report.startedAt).toLocaleDateString()}</span><span>{new Date(latest!.report.startedAt).toLocaleDateString()}</span></figcaption></figure> : <p className="muted">{t('Complete one more comparable assessment to see a trend.')}</p>}
          <p className="history-note">{t('Compared within the same exercise, recorded protocol and engine version. Reps use standard depth targets. These are screening estimates; camera setup and effort can affect each attempt.')}</p>
        </> : <p className="muted">{t('No measured assessment for this exercise yet. Demo and incomplete attempts appear below when available.')}</p>}
      </section>}
      {!list.length && <div className="empty"><div className="big"><IconFlag /></div><h2>{t(h.length ? 'No attempts match these filters.' : 'Your progress begins with one attempt.')}</h2><p>{t('Complete an assessment to keep its report and measurements here.')}</p><Link to={selected ? `/exercise/${selected.id}` : '/app'} className="btn primary">{t('Start training')}</Link></div>}
      {[...byDay].map(([day, sessions]) => <section key={day}>
        <h2 className="section-title">{day}<small>{sessions.length}</small></h2>
        <div className="list">{sessions.map((s) => {
          const r = s.report, ex = exerciseById(r.exerciseId), eligible = isEligibleSession(s), metric = eligible ? measured(s) : null;
          const sub = r.reps ? `${r.reps.count} ${t('reps')} · ${r.reps.valid} ${t('correct')}` : r.hold ? `${r.hold.bestSec.toFixed(1)} s ${t('hold')}` : `${r.events?.length ?? 0} ${t('attempts')}`;
          return <Link key={s.id} to={`/results/${s.id}`} className="glass press list-item history-record">
            {ex ? <Thumb def={ex} /> : <div className="ex-glyph">•</div>}
            <div className="history-record-copy"><b>{t(r.name)}</b><p className="muted">{sub} · {Math.round(r.durationSec)} s</p><span className={`history-status ${eligible ? 'measured' : ''}`}>{t(s.source === 'demo' ? 'Demo · excluded from trends' : eligible ? 'Measured assessment' : 'Incomplete or needs review · excluded from trends')}{s.source === 'video' && ` · ${t('Video')}`}</span></div>
            <div className="history-record-value">{metric && <b>{valueLabel(metric.value)} <small>{metric.unit}</small></b>}<span className={`grade ${r.grade}`}>{r.grade}</span></div>
          </Link>;
        })}</div>
      </section>)}
      {h.length > 0 && <p className="history-note">{t('History is available on this device. Sign in from Profile to back up eligible reports; pending changes sync when a connection is available.')}</p>}
    </main>
  );
}
