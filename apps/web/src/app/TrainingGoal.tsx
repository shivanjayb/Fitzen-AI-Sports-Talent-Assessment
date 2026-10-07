import { t } from './language';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exerciseById } from '@fitzen/engines';
import { BATTERY } from './battery';
import { getGoal, getHistory, isEligibleSession, measureOf, saveGoal } from './store';

export default function TrainingGoal() {
  const [goal, setGoal] = useState(getGoal);
  const [exerciseId, setExercise] = useState(goal?.exerciseId ?? BATTERY[0]!);
  const [target, setTarget] = useState(goal?.target.toString() ?? '');
  const [date, setDate] = useState(goal?.date ?? new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  const history = getHistory().filter(isEligibleSession);
  const unit = exerciseId === 'countermovement-jump' ? 'cm' : exerciseId === 'plank' ? 's' : 'reps';
  const latest = goal ? history.find((s) => s.report.exerciseId === goal.exerciseId) : null;
  const observed = latest ? measureOf(latest.report) : null;
  return <section className="glass panel" style={{ marginTop: 18 }}>
    <b>{t('Training goal and retest')}</b>
    {goal && <p>{exerciseById(goal.exerciseId)?.name}: target {goal.target} {goal.unit} by {goal.date}. Baseline {goal.baseline ?? 'not recorded'}; latest {observed?.value.toFixed(1) ?? 'not recorded'} {goal.unit}. <Link to={`/guided?step=${Math.max(0, BATTERY.indexOf(goal.exerciseId))}`}>Retest the same protocol</Link></p>}
    <p className="muted">Choose your own goal with a coach. Review the latest report's technique cues; targets are intentions, not predicted gains.</p>
    <form style={{ display: 'grid', gap: 12 }} onSubmit={(e) => {
      e.preventDefault(); const n = Number(target);
      const cap = unit === 'cm' ? 120 : unit === 's' ? 3600 : 500;
      if (!target.trim() || !Number.isFinite(n) || n < 0 || n > cap || !date) return;
      const baseline = history.find((s) => s.report.exerciseId === exerciseId);
      const next = { exerciseId, target: n, unit, date, createdAt: new Date().toISOString(), baseline: baseline ? measureOf(baseline.report)?.value ?? null : null };
      const persisted = saveGoal(next); setGoal(next);
      setMessage(persisted ? 'Goal saved on this device.' : 'Storage unavailable. This goal lasts only for this tab.');
    }}>
      <label className="field"><span>Test</span><select value={exerciseId} onChange={(e) => { setExercise(e.target.value); setTarget(''); }}>{BATTERY.map((id) => <option key={id} value={id}>{exerciseById(id)?.name}</option>)}</select></label>
      <label className="field"><span>Target ({unit})</span><input required type="number" min="0" max={unit === 'cm' ? 120 : unit === 's' ? 3600 : 500} step="any" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
      <label className="field"><span>Retest date</span><input required type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <button className="btn primary">{t('Save goal')}</button>{message && <p role="status">{message}</p>}
    </form>
  </section>;
}
