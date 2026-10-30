import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { readiness } from '@fitzen/engines';
import { PageHeader } from './Shell';
import { getHistory, getProfile, saveProfile, isEligibleSession, SYNCED } from './store';
import { storageOwner, supabase, useIdentity } from '../lib/supabase';
import { t } from './language';
import { deleteWellnessRecord, getWellnessRecords, getWellnessSyncStatus, restoreWellnessRecord, saveWellnessRecord, subscribeWellness, syncWellness, wellnessToday, type WellnessKind, type WellnessRecord } from './wellnessStore';
import './wellness.css';
import { download } from './download';

interface Field { key: string; label: string; unit: string; min: number; max: number; required?: boolean; step?: number }
const fields: Record<WellnessKind, Field[]> = {
  vitals: [{ key: 'rhr', label: 'Resting heart rate', unit: 'bpm', min: 25, max: 240 }, { key: 'hrv', label: 'Heart rate variability', unit: 'ms', min: 1, max: 400 }],
  sleep: [{ key: 'hours', label: 'Time asleep', unit: 'hours', min: 0, max: 24, required: true }],
  body: [{ key: 'weight', label: 'Weight', unit: 'kg', min: 15, max: 350 }, { key: 'bodyfat', label: 'Body fat', unit: '%', min: 1, max: 75 }],
  nutrition: [{ key: 'calories', label: 'Energy', unit: 'kcal', min: 0, max: 10000, required: true }, { key: 'protein', label: 'Protein', unit: 'g', min: 0, max: 1000 }, { key: 'carbs', label: 'Carbohydrate', unit: 'g', min: 0, max: 2000 }, { key: 'fat', label: 'Fat', unit: 'g', min: 0, max: 1000 }],
  journal: [{ key: 'mood', label: 'How do you feel?', unit: '1 = low · 5 = great', min: 1, max: 5, required: true, step: 1 }],
  'blood-records': [{ key: 'value', label: 'Result', unit: 'as reported', min: 0, max: 1000000, required: true }, { key: 'low', label: 'Reference range: low', unit: 'optional', min: 0, max: 1000000 }, { key: 'high', label: 'Reference range: high', unit: 'optional', min: 0, max: 1000000 }],
};
const copy: Record<WellnessKind, { title: string; intro: string; record: string }> = {
  vitals: { title: 'Vitals', intro: 'Keep your resting measurements together. Add a reading from your device; your camera does not measure these.', record: 'Vital reading' },
  sleep: { title: 'Sleep', intro: 'A clearer picture of your rest, one night at a time. Record hours actually asleep, rather than time in bed.', record: 'Sleep record' },
  body: { title: 'Body', intro: 'Follow your own measurements over time. These records do not change your assessment profile unless you choose to update it.', record: 'Body measurement' },
  nutrition: { title: 'Nutrition', intro: 'A simple food log for the meals you record. Enter values from a label or trusted source; missing meals are not zero intake.', record: 'Meal' },
  journal: { title: 'Journal', intro: 'Check in with yourself. A short note can help you understand how training and everyday life feel.', record: 'Daily check-in' },
  'blood-records': { title: 'Blood records', intro: 'Keep results exactly as your lab reports them. Compare the same test and unit; these records do not diagnose or interpret results.', record: 'Lab result' },
};
const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function Trend({ records, field }: { records: WellnessRecord[]; field: Field }) {
  const points = [...records].reverse().filter((r) => r.values[field.key] !== undefined).slice(-30);
  if (!points.length) return <p className="muted">{t('No recorded values yet.')}</p>;
  const latest = points[points.length - 1]!, first = points[0]!, delta = latest.values[field.key]! - first.values[field.key]!;
  const ys = points.map((r) => r.values[field.key]!), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const xs = points.map((r) => Date.parse(`${r.date}T12:00:00`)), xspan = Math.max(...xs) - Math.min(...xs) || 1;
  return <section className="well-trend">
    <div className="well-trend-head"><h3>{t(field.label)}</h3><strong>{number(latest.values[field.key]!)} <small>{field.unit}</small></strong></div>
    {points.length > 1 ? <><svg viewBox="0 0 540 110" role="img" aria-label={`${field.label}: ${points.map((r) => `${formatDate(r.date)} ${r.values[field.key]} ${field.unit}`).join('; ')}`}><polyline points={points.map((r, i) => `${12 + (xs[i]! - Math.min(...xs)) / xspan * 516},${96 - (r.values[field.key]! - lo) / span * 78}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />{points.map((r, i) => <circle key={r.id} cx={12 + (xs[i]! - Math.min(...xs)) / xspan * 516} cy={96 - (r.values[field.key]! - lo) / span * 78} r="3.5" fill="currentColor" />)}</svg><div className="well-chart-labels"><span>{formatDate(first.date)}</span><span>{formatDate(latest.date)}</span></div><p className="muted">{delta > 0 ? '+' : ''}{number(delta)} {field.unit} {t('since the first value shown')} · {points.length} {t('readings')}. {t('Lines connect recorded values; missing days are not estimated.')}</p></> : <p className="muted">{t('Add another reading to see change over time.')} · {formatDate(latest.date)}</p>}
  </section>;
}

function Recovery() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const changed = () => refresh(n => n + 1);
    window.addEventListener(SYNCED, changed);
    return () => window.removeEventListener(SYNCED, changed);
  }, []);
  const checkins = getHistory().filter((s) => isEligibleSession(s) && s.readiness);
  const last = checkins[0], ready = last?.readiness ? readiness(last.readiness) : null;
  return <main className="page wellness"><PageHeader title={t('Recovery')} /><p className="well-intro">{t('How you feel matters alongside your performance. Your check-ins and recorded sleep stay in context, without an invented recovery percentage.')}</p>
    <section className="well-panel">{ready ? <><h2>{t('Latest training check-in')}</h2><div className="well-recovery-level">{ready.level}</div><p>{ready.message}</p><p className="muted">{new Date(last!.report.startedAt).toLocaleDateString()} · Hooper {ready.hooper}/28 · {last!.report.name}</p>{ready.safety && <p role="note">{ready.safety}</p>}<Link className="btn" to={`/results/${last!.id}`}>{t('Open session')}</Link></> : <><h2>{t('Start with how you feel')}</h2><p className="muted">{t('After a real assessment, add your sleep quality, stress, fatigue, soreness and mood to your report. Your latest check-in will appear here.')}</p><Link className="btn primary" to="/guided">{t('Start an assessment')}</Link></>}</section>
    <div className="well-link-row"><Link to="/sleep">{t('Sleep history')} →</Link><Link to="/journal">{t('Your journal')} →</Link><Link to="/history">{t('Training history')} →</Link></div>
    {checkins.length > 0 && <section><h2 className="section-title">{t('Check-in history')}</h2><div className="well-records">{checkins.map((s) => { const result = readiness(s.readiness!); return <Link key={s.id} to={`/results/${s.id}`} className="well-record"><span><b>{s.report.name}</b><small>{new Date(s.report.startedAt).toLocaleDateString()} · {result.level}</small></span><strong>{result.hooper}<small>/28</small></strong></Link>; })}</div></section>}
    <p className="well-footnote">{t('Hooper level bands are a Fitzen training convention, not a medical or mental-health assessment.')}</p>
  </main>;
}
function exportCSV() {
  const rows = [['date', 'type', 'name', 'unit', 'values', 'notes'], ...getWellnessRecords().map((r) => [r.date, r.kind, r.title, r.unit, JSON.stringify(r.values), r.note])];
  const csv = rows.map((row) => row.map((cell) => `"${(/^[\s]*[=+@-]/.test(String(cell)) ? `'${cell}` : String(cell)).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download('fitzen-wellness.csv', csv, 'text/csv;charset=utf-8');
}
function Integrations() {
  const identity = useIdentity();
  const [, bump] = useState(0);
  useEffect(() => subscribeWellness(() => bump((n) => n + 1)), []);
  return <main className="page wellness"><PageHeader title={t('Connections')} /><p className="well-intro">{t('Know where your information comes from and where it is saved.')}</p>
    <section className="well-panel"><div className="well-trend-head"><h2>{t('Fitzen account')}</h2><span className="well-source">{identity.user ? t('Signed in') : t('On this device')}</span></div><p>{identity.user ? t('Assessment reports use the existing account backup. Wellness records have a separate private sync queue.') : t('Your records work without an account. Guest records stay separate when you sign in.')}</p><p role="status" className="muted">{getWellnessSyncStatus()}</p>{identity.user ? <button className="btn" onClick={() => void syncWellness()}>{t('Retry wellness sync')}</button> : <Link className="btn" to="/auth?next=/integrations">{t('Sign in')}</Link>}{!supabase && <p className="well-footnote">{t('Account services are not configured in this build.')}</p>}</section>
    <section className="well-panel"><h2>{t('Your camera')}</h2><p>{t('Motion analysis runs on your device. No camera video is sent to a wellness service.')}</p><Link to="/app">{t('Browse assessments')} →</Link></section>
    <section className="well-panel"><h2>{t('Wearables and lab imports')}</h2><p className="muted">{t('Apple Health, Fitbit, WHOOP and automatic lab imports are not connected in this version. Add readings manually from their original source.')}</p><div className="well-link-row"><Link to="/vitals">{t('Add vital readings')} →</Link><Link to="/blood-records">{t('Add lab result')} →</Link></div></section>
    <section className="well-panel"><h2>{t('Export your records')}</h2><p className="muted">{t('Download the manual wellness records currently available on this device. No video or credentials are included.')}</p><button className="btn" onClick={() => download('fitzen-wellness.json', JSON.stringify({ exportedAt: new Date().toISOString(), records: getWellnessRecords() }, null, 2), 'application/json')}>{t('Export JSON')}</button> <button className="btn" onClick={exportCSV}>{t('Export CSV')}</button></section>
    <section className="well-panel"><h2>{t('Local coach')}</h2><p className="muted">{t('The existing coach uses your Fitzen records on this device. Hosted AI and voice services are not connected.')}</p></section>
  </main>;
}

export default function Wellness({ kind }: { kind: WellnessKind | 'integrations' | 'recovery' }) {
  const identity = useIdentity();
  const renderedOwner = storageOwner();
  const [, bump] = useState(0), [editing, setEditing] = useState<WellnessRecord | null>(null), [open, setOpen] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [undo, setUndo] = useState<WellnessRecord | null>(null), [days, setDays] = useState(30), [lab, setLab] = useState('');
  const form = useRef<HTMLFormElement>(null), addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => subscribeWellness(() => bump((n) => n + 1)), []);
  useEffect(() => {
    setOpen(false); setEditing(null); setUndo(null); setError(''); setNotice('');
    void syncWellness();
    const retry = () => void syncWellness(); window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [identity.user?.id, kind]);
  useEffect(() => { if (open) form.current?.querySelector<HTMLInputElement>('input')?.focus(); }, [open]);
  if (kind === 'integrations') return <Integrations />;
  if (kind === 'recovery') return <Recovery />;
  const config = copy[kind], all = getWellnessRecords().filter((r) => r.kind === kind);
  const cutoff = new Date(`${wellnessToday()}T12:00:00`); cutoff.setDate(cutoff.getDate() - days + 1);
  const windowRecords = all.filter((r) => new Date(`${r.date}T12:00:00`) >= cutoff);
  const labKeys = [...new Set(all.map((r) => `${r.title}\u0000${r.unit}`))];
  const selectedLab = labKeys.includes(lab) ? lab : labKeys[0] ?? '';
  const records = kind === 'blood-records' ? windowRecords.filter((r) => `${r.title}\u0000${r.unit}` === selectedLab) : windowRecords;
  const dailyTotals = new Map<string, WellnessRecord>();
  if (kind === 'nutrition') for (const record of records) {
    const day = dailyTotals.get(record.date) ?? { ...record, id: record.date, title: 'Logged daily total', values: {} };
    for (const [key, value] of Object.entries(record.values)) day.values[key] = (day.values[key] ?? 0) + value;
    dailyTotals.set(record.date, day);
  }
  const trendRecords = kind === 'nutrition' ? [...dailyTotals.values()] : records;
  const close = () => { setOpen(false); setEditing(null); setError(''); addButton.current?.focus(); };
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget), values: Record<string, number> = {};
    for (const field of fields[kind as WellnessKind]) { const raw = String(data.get(field.key) ?? '').trim(); if (raw) values[field.key] = Number(raw); }
    try {
      const record = saveWellnessRecord({ ...(editing ? { id: editing.id } : {}), kind: kind as WellnessKind, date: String(data.get('date')), title: String(data.get('title')), note: String(data.get('note') ?? ''), unit: kind === 'blood-records' ? String(data.get('unit') ?? '') : '', values }, renderedOwner);
      let message = t('Record saved.');
      if (kind === 'body' && data.get('profileWeight') === 'on' && record.values.weight !== undefined) {
        if (!saveProfile({ ...getProfile(), weightKg: record.values.weight })) message += ` ${t('Your profile update is only available until this tab closes because device storage is blocked.')}`;
        else message += ` ${t('Assessment profile weight updated.')}`;
      }
      setNotice(message); setUndo(null); close();
    } catch (err) { setError(err instanceof Error ? err.message : t('The record could not be saved. Please try again.')); }
  }
  const nutritionTotals = kind === 'nutrition' ? all.filter((r) => r.date === wellnessToday()).reduce((out, r) => ({ calories: out.calories + (r.values.calories ?? 0), protein: out.protein + (r.values.protein ?? 0) }), { calories: 0, protein: 0 }) : null;
  return <main className="page wellness"><PageHeader title={t(config.title)} /><p className="well-intro">{t(config.intro)}</p>
    <div className="well-toolbar"><div className="well-period" role="group" aria-label={t('History period')}>{[7, 30, 90].map((n) => <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>{n} {t('days')}</button>)}</div><button ref={addButton} className="btn primary" onClick={() => { setEditing(null); setError(''); setOpen(true); }}>{t('Add')} {t(config.record).toLowerCase()}</button></div>
    <div className="well-sync"><span role="status">{getWellnessSyncStatus()}</span>{identity.user && <button onClick={() => void syncWellness()}>{t('Retry sync')}</button>}</div>
    {notice && <p className="well-feedback" role="status">{notice}{undo && <button onClick={() => { try { restoreWellnessRecord(undo, renderedOwner); setNotice(t('Record restored.')); setUndo(null); } catch (err) { setNotice(err instanceof Error ? err.message : t('Could not restore this record.')); } }}>{t('Undo')}</button>}</p>}
    {open && <section className="well-panel well-editor" aria-labelledby="well-editor-title"><div className="well-trend-head"><h2 id="well-editor-title">{editing ? t('Edit record') : `${t('Add')} ${t(config.record).toLowerCase()}`}</h2><button className="btn" type="button" onClick={close}>{t('Cancel')}</button></div><form ref={form} key={editing?.id ?? 'new'} onSubmit={submit}>
      <div className="well-fields"><label>{t('Date')}<input name="date" type="date" required max={wellnessToday()} defaultValue={editing?.date ?? wellnessToday()} /></label><label>{t(kind === 'blood-records' ? 'Test name' : kind === 'nutrition' ? 'Meal name' : 'Name')}<input name="title" required maxLength={100} defaultValue={editing?.title ?? (kind === 'blood-records' || kind === 'nutrition' ? '' : config.record)} placeholder={kind === 'nutrition' ? t('For example, breakfast') : kind === 'blood-records' ? t('As written on your report') : undefined} /></label>
      {fields[kind].map((field) => <label key={field.key}>{t(field.label)} <small>{field.unit}</small><input name={field.key} type="number" inputMode="decimal" min={field.min} max={field.max} step={field.step ?? 'any'} required={field.required} defaultValue={editing?.values[field.key] ?? ''} /></label>)}
      {kind === 'blood-records' && <label>{t('Unit')}<input name="unit" required maxLength={30} defaultValue={editing?.unit ?? ''} placeholder={t('Use the exact unit on the report')} /></label>}</div>
      <label className="well-note">{t('Notes')} <small>{t('optional')}</small><textarea name="note" maxLength={1000} rows={3} defaultValue={editing?.note ?? ''} placeholder={t('Source, context, or anything you want to remember')} /></label>
      {kind === 'body' && <label className="well-checkbox"><input name="profileWeight" type="checkbox" />{t('Also use this weight in my assessment profile')}</label>}
      {error && <p className="well-error" role="alert">{error}</p>}<button className="btn primary" type="submit">{t('Save record')}</button><p className="well-footnote">{t('Manual entry. Only the information you enter is saved; no file or image is uploaded.')}</p>
    </form></section>}
    {!all.length ? <section className="well-empty"><span aria-hidden className="well-empty-line" /><h2>{t('Your history starts here')}</h2><p>{t('Add your first record to see your own information and changes over time. Missing readings stay empty.')}</p><button className="btn" onClick={() => addButton.current?.click()}>{t('Add your first record')}</button></section> : <>
      {nutritionTotals && all.some((r) => r.date === wellnessToday()) && <section className="well-panel"><h2>{t('Recorded today')}</h2><div className="well-totals"><strong>{number(nutritionTotals.calories)} <small>kcal</small></strong><strong>{number(nutritionTotals.protein)} <small>g {t('protein')}</small></strong></div><p className="muted">{t('Totals include logged meals only. They are not your daily requirement or estimated full intake.')}</p></section>}
      {kind === 'blood-records' && <label className="well-lab-filter">{t('Compare test and unit')}<select value={selectedLab} onChange={(e) => setLab(e.target.value)}>{labKeys.map((key) => { const [title, unit] = key.split('\u0000'); return <option key={key} value={key}>{title} · {unit}</option>; })}</select></label>}
      {!records.length ? <section className="well-panel"><p>{t('No records in this period. Choose a longer period or add a reading.')}</p></section> : <div className="well-trends">{fields[kind].filter((f) => !['low', 'high'].includes(f.key) && records.some((r) => r.values[f.key] !== undefined)).map((field) => <Trend key={field.key} records={trendRecords} field={kind === 'blood-records' ? { ...field, label: records[0]!.title, unit: records[0]!.unit } : field} />)}</div>}
      <section><h2 className="section-title">{t('History')}<small>{records.length} {t('records')}</small></h2><div className="well-records">{records.map((r) => <article className="well-record" key={r.id}><div className="well-record-main"><h3>{r.title}</h3><small>{formatDate(r.date)} · {t('Manual entry')}</small><div className="well-record-values">{fields[kind].filter((f) => r.values[f.key] !== undefined).map((f) => <span key={f.key}>{t(f.label)}: <b>{number(r.values[f.key]!)}</b> {kind === 'blood-records' ? r.unit : f.unit}</span>)}</div>{r.note && <p>{r.note}</p>}</div><div className="well-record-actions"><button onClick={() => { setEditing(r); setError(''); setOpen(true); window.scrollTo({ top: 0, behavior: 'auto' }); }}>{t('Edit')}</button><button onClick={() => { try { deleteWellnessRecord(r.id, renderedOwner); setUndo(r); setNotice(t('Record removed. You can undo this action.')); } catch (err) { setNotice(err instanceof Error ? err.message : t('This record could not be removed.')); } }}>{t('Remove')}</button></div></article>)}</div></section>
    </>}
    <p className="well-footnote">{kind === 'journal' ? t('Your journal is personal context, not a mental-health assessment.') : kind === 'blood-records' ? t('Reference ranges differ between labs and people. Discuss results with a qualified clinician.') : t('Measurements are personal records. Changes alone do not establish health, fitness or a diagnosis.')}</p>
    <Link className="well-back" to="/home">← {t('Back to overview')}</Link>
  </main>;
}
