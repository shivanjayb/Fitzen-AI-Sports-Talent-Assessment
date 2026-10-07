import { t, setupFor } from './language';
import { Link, useSearchParams } from 'react-router-dom';
import { exerciseById } from '@fitzen/engines';
import { BATTERY } from './battery';
import { getHistory, isEligibleSession } from './store';

export default function Guided() {
  const [params] = useSearchParams();
  const run = params.get('run') ?? crypto.randomUUID();
  const requested = Number(params.get('step') ?? 0);
  const step = Number.isInteger(requested) && requested >= 0 && requested < BATTERY.length ? requested : 0;
  const ex = exerciseById(BATTERY[step]!)!;
  const history = getHistory();
  const completed = BATTERY.filter((id) => history.some((s) => s.batteryRun === run && s.report.exerciseId === id && isEligibleSession(s)));
  return <main className="page" style={{ maxWidth: 680 }}>
    <p className="subtitle">Guided assessment · {step + 1} of {BATTERY.length}</p>
    <h1 className="large-title">{t(ex.name)}</h1>
    <p className="muted">A local screening battery, not an official SAI assessment. Stop for pain, dizziness or illness. Rest until comfortable between tests; you can stop or resume from a saved report.</p>
    <section className="glass panel">
      <b>{t('Follow this protocol')}</b><ol className="steps">{setupFor(ex).map((x) => <li key={x}>{x}</li>)}</ol>
      <p>Whole body visible · {ex.camera === 'side' ? 'side-on' : 'front view'} · camera at hip height, 2–3 m away. A stable framing check and countdown precede capture. Tracking interruptions break continuous attempts.</p>
      <Link className="btn primary" to={`/train/${ex.id}?src=camera&battery=${encodeURIComponent(run)}`}>{t('Start this test')}</Link>
    </section>
    <p className="faint">{completed.length}/{BATTERY.length} eligible tests recorded for this run. No-attempt and flagged results are retained for inspection but do not count.</p>
    <div className="chips">{BATTERY.map((id, i) => <Link key={id} className={`chip ${i === step ? 'on' : ''}`} to={`/guided?run=${encodeURIComponent(run)}&step=${i}`}>{i + 1}. {exerciseById(id)?.name}{completed.includes(id) ? ' ✓' : ''}</Link>)}</div>
    <Link to="/app" className="btn">{t('Back to exercise library')}</Link>
  </main>;
}
