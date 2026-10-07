import { t } from './language';
import { Link } from 'react-router-dom';
import { exerciseById } from '@fitzen/engines';
import { getHistory, glow } from './store';
import Pictogram from './Pictogram';
import { IconFlag, IconSparkle } from './icons';
import { openAssistant } from './openAssistant';

export default function History() {
  const h = getHistory();
  const byDay = new Map<string, typeof h>();
  for (const s of h) {
    const d = new Date(s.report.startedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  return (
    <main className="page">
      <p className="subtitle">Stored on this device</p>
      <h1 className="large-title">{t('History')}</h1>
      {h.length > 0 && <button className="btn glass press" style={{ marginTop: 12 }} onClick={() => openAssistant({ kind: 'progress' })}><IconSparkle /> Ask AI about my progress</button>}
      {!h.length && <div className="empty"><div className="big"><IconFlag /></div>No sessions yet.<br /><br /><Link to="/app" className="btn primary">Start training</Link></div>}
      {[...byDay].map(([day, list]) => (
        <section key={day}>
          <h2 className="section-title">{day}<small>{list.length}</small></h2>
          <div className="list">
            {list.map((s) => {
              const r = s.report, ex = exerciseById(r.exerciseId);
              const sub = r.reps ? `${r.reps.count} reps · ${r.reps.valid} correct` : r.hold ? `${r.hold.bestSec.toFixed(1)} s hold` : `${r.events?.length ?? 0} attempts`;
              return (
                <Link key={s.id} to={`/results/${s.id}`} className="glass press list-item" onPointerMove={glow}>
                  {ex ? <Pictogram def={ex} /> : <div className="ex-glyph">•</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{r.name}</b>
                    <div className="muted" style={{ fontSize: '.85rem' }}>{sub} · {Math.round(r.durationSec)} s{s.source === 'demo' ? ' · demo' : ''}</div>
                  </div>
                  <div className={`grade ${r.grade}`}>{r.grade}</div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
