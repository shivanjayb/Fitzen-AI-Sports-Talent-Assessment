import { useEffect, useState, type FormEvent } from 'react';
import { getWellnessRecords, saveWellnessRecord, subscribeWellness, validateWellness, wellnessToday, type WellnessRecord } from '../app/wellnessStore';
import { Card, CardHead, Dialog, Icon, PageHead, Soon, toast } from './ui';
import './labs.css';

const num = (v: number) => v.toLocaleString('en-GB', { maximumFractionDigits: 3 });
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Compares only against the range the person typed in; no range means no flag. */
function flagOf(r: WellnessRecord): { text: string; out: boolean } {
  const { value, low, high } = r.values;
  if (value === undefined || (low === undefined && high === undefined)) return { text: 'No range', out: false };
  if (low !== undefined && value < low) return { text: 'Low', out: true };
  if (high !== undefined && value > high) return { text: 'High', out: true };
  return { text: 'In range', out: false };
}
const rangeOf = ({ low, high }: Record<string, number>) =>
  low !== undefined && high !== undefined ? `${num(low)} – ${num(high)}` : low !== undefined ? `≥ ${num(low)}` : high !== undefined ? `≤ ${num(high)}` : '—';

function AddResult({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [error, setError] = useState('');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim();
    const values: Record<string, number> = {};
    for (const k of ['value', 'low', 'high'] as const) if (text(k) !== '') values[k] = Number(text(k));
    const input = { kind: 'blood-records' as const, date: text('date'), title: text('test'), unit: text('unit'), values,
      note: [text('lab'), text('notes')].filter(Boolean).join(' · ') };
    const problem = validateWellness(input);
    if (problem) { setError(problem); return; }
    try { saveWellnessRecord(input); toast(`${input.title} saved to your blood records.`); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'This result could not be saved.'); }
  };
  return <Dialog open={open} onClose={() => { setError(''); onClose(); }} kicker="Health records" title="Add a blood result">
    <p className="x-labs-lead">Copy the numeric value and unit exactly from your laboratory report.</p>
    <form className="x-labs-form" onSubmit={submit} onChange={() => setError('')}>
      <div className="x-form-grid">
        <label className="x-field">Test name<input name="test" placeholder="e.g. Ferritin" maxLength={100} required /></label>
        <label className="x-field">Collection date<input name="date" type="date" defaultValue={wellnessToday()} max={wellnessToday()} required /></label>
        <label className="x-field">Result<input name="value" type="number" step="any" min={0} inputMode="decimal" required /></label>
        <label className="x-field">Unit<input name="unit" placeholder="e.g. ng/mL" maxLength={30} required /></label>
        <label className="x-field">Lower reference limit (optional)<input name="low" type="number" step="any" min={0} inputMode="decimal" /></label>
        <label className="x-field">Upper reference limit (optional)<input name="high" type="number" step="any" min={0} inputMode="decimal" /></label>
      </div>
      <label className="x-field">Laboratory (optional)<input name="lab" maxLength={200} /></label>
      <label className="x-field">Notes (optional)<textarea name="notes" maxLength={780} /></label>
      {error && <p className="x-labs-error" role="alert">{error}</p>}
      <div className="x-labs-foot"><span>Saved privately to your account.</span><button type="submit" className="x-btn">Save result</button></div>
    </form>
  </Dialog>;
}

function UploadReport({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Dialog open={open} onClose={onClose} kicker="Private records" title="Add a lab report">
    <p className="x-labs-lead">Your original report will be stored privately. Automatic interpretation is not enabled.</p>
    <div className="x-labs-zone" aria-disabled="true">
      <span className="x-labs-zone-icon"><Icon name="upload" /></span>
      <span>Choose a PDF or image</span>
      <Soon label="Uploads coming soon" />
    </div>
    <p className="x-labs-mini">PDF, JPEG, PNG or WebP, up to 10 MB. Uploaded to your account’s private storage.</p>
    <div className="x-labs-foot"><span>Visible only to your account</span><button className="x-btn" disabled title="Report uploads are coming soon">Upload privately</button></div>
  </Dialog>;
}

export default function Labs() {
  const [, bump] = useState(0);
  useEffect(() => subscribeWellness(() => bump((n) => n + 1)), []);
  const [dialog, setDialog] = useState<'add' | 'upload' | null>(null);
  const close = () => setDialog(null);
  const add = () => setDialog('add');
  const upload = () => setDialog('upload');
  const results = getWellnessRecords().filter((r) => r.kind === 'blood-records');

  return <>
    <PageHead title="Blood records" subtitle="Blood results and original reports, saved to your private account.">
      <button className="x-btn" onClick={add}><Icon name="plus" />Add blood result</button>
      <button className="x-btn ghost" onClick={upload}><Icon name="upload" />Upload report</button>
    </PageHead>
    <div className="x-labs-grid">
      <Card className="x-labs-panel x-labs-results">
        <CardHead title={<>Blood results{results.length > 0 && <span className="x-labs-muted"> · {results.length}</span>}</>} />
        {results.length ? <div className="x-labs-table-wrap"><table className="x-labs-table">
          <thead><tr><th scope="col">Test</th><th scope="col">Date</th><th scope="col">Result</th><th scope="col">Reference</th><th scope="col"><span className="sr-only">Flag</span></th></tr></thead>
          <tbody>{results.map((r) => { const flag = flagOf(r); return <tr key={r.id}>
            <th scope="row">{r.title}{r.note && <small>{r.note}</small>}</th>
            <td className="num">{day(r.date)}</td>
            <td className="num"><b>{num(r.values.value!)}</b> <small>{r.unit}</small></td>
            <td className="num">{rangeOf(r.values)}</td>
            <td><span className={`x-badge${flag.out ? ' x-labs-out' : ''}`}>{flag.text}</span></td>
          </tr>; })}</tbody>
        </table></div> : <div className="x-labs-empty">
          <p>Your results, over time. Add the value, unit and reference range exactly as printed by your laboratory.</p>
          <button className="x-btn" onClick={add}><Icon name="plus" />Add a blood result</button>
        </div>}
        <p className="x-labs-note">Reference flags compare your entry with the range you provide. They are not a diagnosis. Values in different units are kept separate.</p>
      </Card>

      <div className="x-labs-side">
        <Card tone="dark" className="x-labs-summary">
          <CardHead title="Your blood work" />
          <p className="x-labs-summary-lead">Start with your latest report. Enter values as printed, or upload the PDF to keep it beside them.</p>
          <div className="x-labs-summary-actions">
            <button className="x-btn small x-labs-on-dark" onClick={add}><Icon name="plus" />Add blood result</button>
          </div>
          <ul className="x-labs-soon">
            <li><span>Automatic interpretation (not enabled)</span><Soon /></li>
            <li><span>Blood markers will feed athlete readiness in a future update.</span><Soon /></li>
          </ul>
        </Card>

        <Card className="x-labs-panel x-labs-docs">
          <CardHead title="Lab documents"><Soon /></CardHead>
          <div className="x-labs-empty">
            <p>A home for your health history. Upload a PDF or image of a report; only your account can access it.</p>
            <button className="x-btn ghost" onClick={upload}><Icon name="upload" />Upload a report</button>
          </div>
        </Card>
      </div>
    </div>
    <AddResult open={dialog === 'add'} onClose={close} />
    <UploadReport open={dialog === 'upload'} onClose={close} />
  </>;
}
