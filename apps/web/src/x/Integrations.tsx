import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Dialog, Icon, PageHead, Soon, toast } from './ui';
import './account.css';

const soon = (what: string) => () => toast(`${what} is coming soon.`);

function Source({ dark, logo, hot, name, small, children, meta, action }: {
  dark?: boolean; logo: ReactNode; hot?: boolean; name: string; small: string; children: ReactNode; meta?: string; action: ReactNode;
}) {
  return <Card tone={dark ? 'dark' : 'light'} className="x-source">
    <div className="x-source-head">
      <span className={`x-source-logo${hot ? ' hot' : ''}`} aria-hidden>{logo}</span>
      <span className="x-source-name"><h2>{name}</h2><small>{small}</small></span>
      <Soon />
    </div>
    <p>{children}</p>
    {meta && <p className="x-source-meta">{meta}</p>}
    {action}
  </Card>;
}

const later = (label: string, what = label) => <button type="button" className="x-btn ghost" aria-disabled="true" onClick={soon(what)}>{label}</button>;

/** Copies the Xeyo import dialog's look only. The file control is disabled, so no file is ever read. */
function ImportDialog({ which, onClose }: { which: 'apple' | 'fitbit' | null; onClose: () => void }) {
  const apple = which === 'apple';
  return <Dialog open={!!which} onClose={onClose} wide kicker="Integrations / Import measurements" title={apple ? 'Your Apple Health data.' : 'Your Fitbit data.'}>
    <p className="x-dialog-lead">{apple
      ? 'In the iPhone Health app, open your profile → Export All Health Data. You will be able to choose export.zip or export.xml here.'
      : 'Export your Fitbit / Google Health data through Google Takeout. You will be able to choose the archive, or individual heart-rate, sleep, HRV, weight or body-fat JSON/CSV files.'}</p>
    <div className="x-import-note"><strong>File import · Coming soon</strong>
      <p>When this arrives, it will import a snapshot, not automatic synchronization. Files will be read on your device; only supported measurements are kept.</p></div>
    <label className="x-upload-zone" onClick={soon(apple ? 'Apple Health import' : 'Fitbit import')}>
      <span><Icon name="upload" /></span>
      <span>Choose your health export</span>
      <input type="file" disabled aria-describedby="x-import-soon" />
      <Soon />
    </label>
    {!apple && <label className="x-field" style={{ marginTop: 14 }}>Weight unit, if your file does not include it
      <select disabled defaultValue="file"><option value="file">Use units in file</option><option>Kilograms (kg)</option><option>Pounds (lb)</option></select></label>}
    <div className="x-dialog-footer"><span id="x-import-soon">Nothing is uploaded. Import is not available yet.</span>
      <button type="button" className="x-btn" aria-disabled="true" onClick={soon('Importing measurements')}>Import measurements</button></div>
  </Dialog>;
}

export default function Integrations() {
  const [dlg, setDlg] = useState<'apple' | 'fitbit' | null>(null);
  return <div>
    <PageHead title="Integrations" subtitle="Your account. Your measurements. Your choice." />
    <div className="x-sources">
      <Source dark hot logo="W" name="WHOOP" small="Would sync each time you open Fitzen"
        action={<button type="button" className="x-btn accent" aria-disabled="true" onClick={soon('Connecting WHOOP')}>Connect WHOOP</button>}>
        Recovery, sleep, resting heart rate, HRV, blood oxygen and respiratory rate. Includes skin temperature, sleep stages, efficiency and consistency. Imports up to 90 days.
      </Source>
      <Source logo="⌘" name="Apple Watch / Health" small="File import" meta="Automatic sync needs an iPhone companion app."
        action={<button type="button" className="x-btn ghost" onClick={() => setDlg('apple')}><Icon name="upload" />Import Apple Health</button>}>
        Import Apple Watch sleep stages, heart rate, HRV, blood oxygen, breathing, wrist temperature, steps and activity-ring energy, plus scale measurements, from your iPhone Health export.
      </Source>
      <Source logo="G" name="Fitbit / Google Health" small="File import" meta="Automatic sync needs an approved Google Health app."
        action={<button type="button" className="x-btn ghost" onClick={() => setDlg('fitbit')}><Icon name="upload" />Import Fitbit data</button>}>
        Import recorded heart rate, sleep, HRV, weight and body-fat measurements from your data export.
      </Source>
      <Source logo={<Icon name="watch" />} name="Garmin" small="Garmin Connect" meta="Needs an approved Garmin Connect developer integration."
        action={later('Connect Garmin')}>
        Heart rate, HRV status, sleep, Body Battery, steps, training load and activities from your Garmin watch.
      </Source>
      <Source logo={<Icon name="watch" />} name="Samsung Health" small="Galaxy Watch" meta="Needs an Android companion app with Health Connect."
        action={later('Connect Samsung Health')}>
        Sleep, heart rate, blood oxygen, steps and body composition from your Galaxy Watch, through Health Connect.
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
      <section className="x-card x-source-note">
        <h3>Measured. Always clear.</h3>
        <p>Every reading keeps its source and date. Wearable connections are coming soon; until then, your records come from Fitzen’s camera assessments and the entries you add yourself. Nutrition logs do not measure glucose, inflammation or water retention.</p>
      </section>
    </div>
    <ImportDialog which={dlg} onClose={() => setDlg(null)} />
  </div>;
}
