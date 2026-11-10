import { useCallback, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Dialog, Icon, PageHead, Soon, toast } from './ui';
import { bluetooth, restingHeartRate, rmssd, startLiveHr, stopLiveHr } from './wearables/heartRate';
import { useLiveHeartRate } from './wearables/useLiveHeartRate';
import { addHistory, importHistory, MAX_BYTES, readExports, saveDays, saveToday, undoImport } from './wearables/importer';
import { CSV_TEMPLATE } from './wearables/parse';
import './account.css';

type Vendor = 'apple' | 'fitbit' | 'whoop' | 'garmin' | 'samsung';
const VENDORS: Record<Vendor, { name: string; record: string; how: string; accept: string; lb?: boolean }> = {
  apple: { name: 'Apple Health', record: 'Apple Health import', accept: '.zip,.xml',
    how: 'On your iPhone, open Health → your profile picture → Export All Health Data, then move export.zip to this device. Choose export.zip, or the export.xml inside it.' },
  fitbit: { name: 'Fitbit', record: 'Fitbit import', accept: '.zip,.json,.csv', lb: true,
    how: 'Download your Fitbit data with Google Takeout. Choose the .zip, or individual files such as heart_rate-*.json, resting_heart_rate-*.json, steps-*.json, sleep-*.json, weight-*.json and the daily HRV or SpO2 summary CSVs.' },
  whoop: { name: 'WHOOP', record: 'WHOOP import', accept: '.zip,.csv',
    how: 'Request a data export in the WHOOP app. Choose the .zip or physiological_cycles.csv: recovery, strain, resting heart rate, HRV, blood oxygen, breathing rate and sleep stages are read.' },
  garmin: { name: 'Garmin', record: 'Garmin import', accept: '.csv,.zip',
    how: 'In Garmin Connect on the web, open a report (steps, resting heart rate, HRV status, sleep or weight) and export it as CSV. You can choose several files at once.' },
  samsung: { name: 'Samsung Health', record: 'Samsung Health import', accept: '.zip,.csv',
    how: 'In Samsung Health, open Settings → Download personal data. Files with a date column and steps, heart rate, sleep or weight are read; others are listed as skipped. Copy anything that is skipped into the CSV template.' },
};

function Source({ dark, logo, hot, name, small, children, meta, soon, action }: {
  dark?: boolean; logo: ReactNode; hot?: boolean; name: string; small: string; children: ReactNode; meta?: string; soon?: boolean; action: ReactNode;
}) {
  return <Card tone={dark ? 'dark' : 'light'} className="x-source">
    <div className="x-source-head">
      <span className={`x-source-logo${hot ? ' hot' : ''}`} aria-hidden>{logo}</span>
      <span className="x-source-name"><h2>{name}</h2><small>{small}</small></span>
      {soon && <Soon label="Sync coming soon" />}
    </div>
    <p>{children}</p>
    {meta && <p className="x-source-meta">{meta}</p>}
    <div className="x-source-actions">{action}</div>
  </Card>;
}

const later = (label: string) => <button type="button" className="x-btn ghost" aria-disabled="true" onClick={() => toast(`${label} needs a vendor developer account and is coming soon. Import a file instead.`)}>{label}</button>;
const importBtn = (label: string, open: () => void, dark?: boolean) => <button type="button" className={`x-btn${dark ? ' accent' : ' ghost'}`} onClick={open}><Icon name="upload" />{label}</button>;

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'fitzen-health-template.csv' });
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ImportDialog({ which, onClose, onImported }: { which: Vendor | null; onClose: () => void; onImported: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [lb, setLb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const v = which ? VENDORS[which] : null;
  const close = () => { if (busy) return; setFiles([]); setStatus(''); onClose(); };
  const pick = (list: FileList | null) => {
    const all = [...(list ?? [])], big = all.filter((f) => f.size > MAX_BYTES);
    setFiles(all.filter((f) => f.size <= MAX_BYTES));
    setStatus(big.length ? `${big.map((f) => f.name).join(', ')} ${big.length > 1 ? 'are' : 'is'} over 2 GB and cannot be read in the browser.` : '');
  };
  const run = async () => {
    if (!v || !files.length) return;
    setBusy(true);
    try {
      const read = await readExports(files, lb, (f) => setStatus(`Reading on this device… ${Math.round(f * 100)}%`));
      setStatus('Saving measurements…');
      const saved = await saveDays(read.days, v.record, (f) => setStatus(`Saving measurements… ${Math.round(f * 100)}%`));
      if (saved.ids.length) { addHistory({ title: v.record, files: read.used, days: saved.days, labels: saved.labels, ids: saved.ids }); onImported(); }
      setFiles([]);
      setStatus((saved.days ? `Imported ${saved.days} day${saved.days === 1 ? '' : 's'}: ${saved.labels.join(', ')}.` : 'No supported measurements were found in these files.')
        + (read.skipped.length ? ` Skipped: ${read.skipped.join(', ')}.` : ''));
    } catch (e) {
      setStatus(`Import stopped: ${e instanceof Error ? e.message : 'the file could not be read.'}`);
    } finally { setBusy(false); }
  };
  return <Dialog open={!!v} onClose={close} wide kicker="Integrations / Import measurements" title={`Your ${v?.name ?? ''} data.`}>
    <p className="x-dialog-lead">{v?.how}</p>
    <div className="x-import-note"><strong>Read on your device</strong>
      <p>This imports a snapshot, not automatic sync. Files are read in this browser and never uploaded; only supported daily measurements are kept. Importing the same file again updates those days instead of duplicating them.</p></div>
    <label className="x-upload-zone">
      <span><Icon name="upload" /></span>
      <span>{files.length ? files.map((f) => f.name).join(', ') : 'Choose your health export'}</span>
      <input type="file" multiple accept={v?.accept} disabled={busy} onChange={(e) => pick(e.target.files)} />
    </label>
    {v?.lb && <label className="x-field" style={{ marginTop: 14 }}>Weight unit in your Fitbit weight files
      <select value={lb ? 'lb' : 'kg'} disabled={busy} onChange={(e) => setLb(e.target.value === 'lb')}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></label>}
    <p className="x-import-status" role="status">{status}</p>
    <div className="x-dialog-footer">
      {which !== 'apple' ? <button type="button" className="x-btn ghost" onClick={downloadTemplate}>Download CSV template</button> : <span />}
      <button type="button" className="x-btn" disabled={busy || !files.length} onClick={run}>{busy ? 'Importing…' : 'Import measurements'}</button>
    </div>
  </Dialog>;
}

function LiveCard({ onImport }: { onImport: () => void }) {
  const hr = useLiveHeartRate();
  const [msg, setMsg] = useState('');
  const supported = !!bluetooth();
  const rest = restingHeartRate(hr.samples), hrv = rmssd(hr.rr);
  const secs = hr.samples.length > 1 ? Math.round((hr.samples[hr.samples.length - 1]!.t - hr.samples[0]!.t) / 1000) : 0;
  const save = async (values: Record<string, number>, what: string) => {
    try { await saveToday('Bluetooth heart rate', values); setMsg(`${what} saved for today.`); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return <Card tone="dark" className="x-source">
    <div className="x-source-head">
      <span className="x-source-logo hot" aria-hidden><Icon name="heart" /></span>
      <span className="x-source-name"><h2>Bluetooth watch or strap</h2><small>Live heart rate · {supported ? 'Available in this browser' : 'Not available in this browser'}</small></span>
      {hr.status === 'live' && <span className="x-badge">Live</span>}
    </div>
    {!supported ? <>
      <p>This browser cannot use Bluetooth. Safari on iPhone and iPad does not support Web Bluetooth, and Apple Watch does not broadcast heart rate to other apps. Use Chrome or Edge on a computer or Android phone, or import your Apple Health export instead.</p>
      <div className="x-source-actions">{importBtn('Import a file instead', onImport, true)}</div>
    </> : hr.status === 'live' ? <>
      <div className="x-live-hr" aria-label={hr.bpm ? `${hr.bpm} beats per minute` : 'Waiting for a reading'}>
        <span className="x-live-heart" style={hr.bpm ? { animationDuration: `${60 / hr.bpm}s` } : undefined} aria-hidden><Icon name="heart" /></span>
        <b>{hr.bpm ?? '–'}</b><small>bpm · {hr.device} · {secs}s recorded</small>
      </div>
      <p>Resting heart rate uses your lowest steady minute; sit still for a few minutes first. {hr.rr.length ? 'HRV (RMSSD) needs a minute of clean beat-to-beat data.' : 'This device does not send beat-to-beat intervals, so HRV cannot be measured.'}</p>
      <div className="x-source-actions">
        <button type="button" className="x-btn accent" disabled={rest === null} onClick={() => rest !== null && save({ rhr: rest }, `Resting heart rate ${rest} bpm`)}>Save resting heart rate{rest !== null ? ` (${rest})` : ''}</button>
        {hr.rr.length > 0 && <button type="button" className="x-btn ghost" disabled={hrv === null} onClick={() => hrv !== null && save({ hrv }, `HRV ${hrv} ms`)}>Save HRV{hrv !== null ? ` (${hrv} ms)` : ''}</button>}
        <button type="button" className="x-btn ghost" onClick={stopLiveHr}>Disconnect</button>
      </div>
    </> : <>
      <p>Pair any watch or chest strap that broadcasts heart rate: Garmin (turn on “Broadcast heart rate”), Polar, Wahoo, Coros, many Amazfit and Huawei models, and most HR straps. Your browser will ask which device to use; that prompt only appears on https or localhost.</p>
      {hr.status === 'error' && <p className="x-source-meta">Could not connect: {hr.error} Make sure broadcast is on and the device is not paired to another app.</p>}
      <div className="x-source-actions">
        <button type="button" className="x-btn accent" disabled={hr.status === 'connecting'} onClick={() => void startLiveHr()}>{hr.status === 'connecting' ? 'Connecting…' : 'Connect a Bluetooth watch or strap'}</button>
      </div>
    </>}
    <p className="x-import-status" role="status">{msg}</p>
  </Card>;
}

export default function Integrations() {
  const [dlg, setDlg] = useState<Vendor | null>(null);
  const [history, setHistory] = useState(importHistory);
  const refresh = useCallback(() => setHistory(importHistory()), []);
  const close = useCallback(() => setDlg(null), []);
  const undo = (id: string) => { undoImport(id); refresh(); toast('Import removed.'); };
  return <div>
    <PageHead title="Integrations" subtitle="Your account. Your measurements. Your choice." />
    <div className="x-sources">
      <LiveCard onImport={() => setDlg('apple')} />
      <Source logo="⌘" name="Apple Watch / Health" small="File import" meta="Automatic sync needs an iPhone companion app."
        action={importBtn('Import Apple Health', () => setDlg('apple'))}>
        Sleep stages, heart rate, resting heart rate, HRV, blood oxygen, breathing rate, steps, active and total energy, and weight from your iPhone Health export.
      </Source>
      <Source dark hot soon logo="W" name="WHOOP" small="File import" meta="Automatic sync needs a WHOOP developer account."
        action={<>{importBtn('Import WHOOP export', () => setDlg('whoop'), true)}{later('Connect WHOOP')}</>}>
        Recovery, strain, resting heart rate, HRV, blood oxygen, breathing rate and sleep stages from your WHOOP data export.
      </Source>
      <Source soon logo="G" name="Fitbit / Google Health" small="File import" meta="Automatic sync needs an approved Google Health app."
        action={<>{importBtn('Import Fitbit data', () => setDlg('fitbit'))}{later('Connect Fitbit')}</>}>
        Heart rate, resting heart rate, steps, calories, sleep stages, HRV, blood oxygen, weight and body fat from your Google Takeout export.
      </Source>
      <Source soon logo={<Icon name="watch" />} name="Garmin" small="CSV import" meta="Automatic sync needs a Garmin Connect developer account."
        action={<>{importBtn('Import Garmin CSV', () => setDlg('garmin'))}{later('Connect Garmin')}</>}>
        Steps, resting heart rate, HRV, sleep and weight from Garmin Connect report exports. For live heart rate, use Broadcast heart rate with the Bluetooth card.
      </Source>
      <Source soon logo={<Icon name="watch" />} name="Samsung Health" small="CSV import" meta="Automatic sync needs an Android companion app with Health Connect."
        action={<>{importBtn('Import Samsung CSV', () => setDlg('samsung'))}{later('Connect Samsung Health')}</>}>
        Steps, heart rate, sleep and weight from Samsung Health’s personal data download, or any CSV that follows the Fitzen template.
      </Source>
      <Card className="x-source">
        <div className="x-source-head">
          <span className="x-source-logo hot" aria-hidden><Icon name="camera" /></span>
          <span className="x-source-name"><h2>On-device camera</h2><small>Built in · Available now</small></span>
          <span className="x-badge">Live</span>
        </div>
        <p>Fitzen’s own source. Pose detection runs in your browser while you train or analyse a video: the camera feed and video files never leave your device. Only the results, such as reps, jump height and form score, are saved.</p>
        <p className="x-source-meta">The pose model downloads on first use and is cached for offline sessions.</p>
        <Link className="x-btn" to="/train">Start an assessment</Link>
      </Card>
      {history.length > 0 && <section className="x-card x-source-note">
        <h3>Recent imports</h3>
        <ul className="x-import-history">
          {history.map((h) => <li key={h.id}>
            <span><b>{h.title}</b> · {new Date(h.at).toLocaleDateString()} · {h.days} day{h.days === 1 ? '' : 's'}: {h.labels.join(', ')}<small>{h.files.join(', ')}</small></span>
            <button type="button" className="x-btn ghost" onClick={() => undo(h.id)}>Undo this import</button>
          </li>)}
        </ul>
      </section>}
      <section className="x-card x-source-note">
        <h3>Measured. Always clear.</h3>
        <p>Every reading keeps its source and date. Imports and Bluetooth readings are processed on this device and saved to your records; cloud sync with WHOOP, Fitbit, Garmin and Samsung needs vendor developer accounts and is not available yet. Nutrition logs do not measure glucose, inflammation or water retention.</p>
      </section>
    </div>
    <ImportDialog which={dlg} onClose={close} onImported={refresh} />
  </div>;
}
