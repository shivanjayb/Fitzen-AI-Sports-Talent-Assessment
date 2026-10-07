import { useState } from 'react';
import { getHistory, getSession, isEligibleSession, measureOf, saveReference, type SavedSession } from './store';
import { download } from './download';

export function ReferenceCheck({ sessionId }: { sessionId: string }) {
  const s = getSession(sessionId);
  const m = s && isEligibleSession(s) ? measureOf(s.report) : null;
  const [value, setValue] = useState(s?.reference?.value.toString() ?? '');
  const [method, setMethod] = useState(s?.reference?.method ?? '');
  const [notes, setNotes] = useState(s?.reference?.notes ?? '');
  const [message, setMessage] = useState('');
  if (!s || !m) return null;
  return <details className="glass panel" style={{ marginTop: 14 }}>
    <summary>Coach validation: add a ground-truth measurement</summary>
    <p className="muted">Measure the same attempt with your reference instrument or coach count. This entry stays on this device and is excluded from public rankings.</p>
    <form style={{ display: 'grid', gap: 12 }} onSubmit={(e) => {
      e.preventDefault();
      const n = Number(value);
      if (!value.trim() || !Number.isFinite(n) || n < 0 || !method.trim()) return;
      setMessage(saveReference(sessionId, { value: n, unit: m.unit, method: method.trim(), notes: notes.trim() })
        ? 'Reference saved. Open Coach validation to export paired data.' : 'Storage is unavailable. Export JSON now; this entry lasts only for this tab.');
    }}>
      <label className="field"><span>Reference value ({m.unit})</span><input required type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} /></label>
      <label className="field"><span>Reference method / instrument</span><input required maxLength={100} placeholder="e.g. jump mat, coach rep count" value={method} onChange={(e) => setMethod(e.target.value)} /></label>
      <label className="field"><span>Attempt notes (optional)</span><input maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <button className="btn primary" type="submit">Save reference</button>
      {message && <p role="status">{message}</p>}
    </form>
  </details>;
}

const quote = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
export function validationCsv(history: SavedSession[]): string {
  const rows = history.filter((s) => isEligibleSession(s) && s.reference).map((s) => {
    const m = measureOf(s.report)!;
    return [s.id, s.report.startedAt, s.report.exerciseId, s.report.validity?.protocolId ?? 'legacy-unspecified', s.source,
      m.metric, m.value, m.unit, s.reference!.value, s.reference!.unit, s.reference!.method, s.reference!.notes,
      s.report.trackedPct, s.report.validity?.longestGapMs, s.report.validity?.modelVersion, s.report.assessmentStatus];
  });
  return [['session_id', 'date', 'exercise', 'protocol', 'source', 'metric', 'estimate', 'unit', 'reference', 'reference_unit', 'reference_method', 'notes', 'tracked_pct', 'longest_gap_ms', 'model_version', 'status'], ...rows].map((r) => r.map(quote).join(',')).join('\r\n');
}

export default function Validation() {
  const pairs = getHistory().filter((s) => isEligibleSession(s) && s.reference && measureOf(s.report)?.unit === s.reference.unit);
  const groups = new Map<string, SavedSession[]>();
  for (const s of pairs) {
    const key = `${s.report.validity?.protocolId ?? `legacy:${s.report.exerciseId}`} · ${s.reference!.method} · ${s.reference!.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return <main className="page">
    <p className="subtitle">Local research tools</p><h1 className="large-title">Coach validation</h1>
    <p className="muted">Add a reference to a real session's report, then compare identical protocols and reference methods here. Only your retained eligible sessions are used; no video leaves this device.</p>
    <button className="btn primary" disabled={!pairs.length} onClick={() => download('fitzen-validation.csv', validationCsv(pairs), 'text/csv;charset=utf-8')}>Export paired CSV</button>
    {!pairs.length && <p>No paired measurements yet. Open a report and add its ground-truth measurement.</p>}
    {[...groups].map(([name, sessions]) => {
      const d = sessions.map((s) => measureOf(s.report)!.value - s.reference!.value);
      const bias = d.reduce((a, b) => a + b, 0) / d.length;
      const rmse = Math.sqrt(d.reduce((a, b) => a + b * b, 0) / d.length);
      const sd = d.length > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - bias) ** 2, 0) / (d.length - 1)) : 0;
      return <section key={name} className="glass panel" style={{ marginTop: 18 }}>
        <b>{name}</b><p>{d.length} paired attempt(s)</p>
        {d.length >= 3 ? <div className="kv">
          <div><span>Mean bias</span><b>{bias.toFixed(2)}</b></div><div><span>RMSE</span><b>{rmse.toFixed(2)}</b></div>
          <div><span>Approximate 95% limits of agreement</span><b>{(bias - 1.96 * sd).toFixed(2)} to {(bias + 1.96 * sd).toFixed(2)}</b></div>
        </div> : <p className="muted">Collect at least 3 paired attempts to display descriptive agreement statistics.</p>}
      </section>;
    })}
    <p className="faint">Repeated attempts are not independent athletes. These are descriptive pilot statistics in the stated units, not clinical validation or confidence intervals. Plan an appropriately sampled study before publishing accuracy claims; ICC requires a defined repeated-measurement design.</p>
  </main>;
}
