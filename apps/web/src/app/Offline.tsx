import { t } from './language';
import { useEffect, useState } from 'react';
import { getProfile } from './store';

export default function Offline() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState<boolean | null>(null);
  const model = getProfile().model;
  // The worker caches the model on first use, so a device that has run one camera session is usually ready already.
  const check = () => { if ('caches' in window) void caches.match(`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${model}/float16/1/pose_landmarker_${model}.task`).then((r) => setReady(!!r), () => setReady(null)); };
  useEffect(check, [model]);
  const prepare = async () => {
    setBusy(true); setMessage('Downloading the selected pose model and runtime…');
    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) throw Error('No active worker');
      const channel = new MessageChannel();
      const ok = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 120_000);
        channel.port1.onmessage = (e) => { clearTimeout(timer); channel.port1.close(); resolve(e.data?.ok === true); };
        registration.active!.postMessage({ type: 'CACHE_POSE', model: getProfile().model }, [channel.port2]);
      });
      check();
      setMessage(ok ? 'App and selected model are cached. Check a camera assessment in airplane mode before relying on offline use.' : 'Download did not complete. Stay online, free storage if needed, and retry.');
    } catch { setMessage('Offline preparation is unavailable. Reload this build and retry while online.'); }
    setBusy(false);
  };
  return <section className="glass panel" style={{ marginTop: 18 }}>
    <div className="row between"><b>{t('Offline assessment')}</b>{ready !== null && <span className={`tag ${ready ? 'z-good' : 'z-ok'}`}>{ready ? 'Ready offline' : 'Needs download'}</span>}</div>
    <p className="muted">{t("Download your selected model while online. Changing pose model requires preparing that model again. Sessions recorded offline are analysed on this device and sync to your account when you are back online.")}</p>
    {import.meta.env.PROD && 'serviceWorker' in navigator ? <button className="btn" disabled={busy} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Prepare this device for offline use'}</button> : <p className="faint">{t("Offline caching is available in the production build on HTTPS or localhost.")}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
