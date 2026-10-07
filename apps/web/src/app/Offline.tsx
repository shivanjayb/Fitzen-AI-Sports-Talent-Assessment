import { t } from './language';
import { useState } from 'react';
import { getProfile } from './store';

export default function Offline() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
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
      setMessage(ok ? 'App and selected model are cached. Check a camera assessment in airplane mode before relying on offline use.' : 'Download did not complete. Stay online, free storage if needed, and retry.');
    } catch { setMessage('Offline preparation is unavailable. Reload this build and retry while online.'); }
    setBusy(false);
  };
  return <section className="glass panel" style={{ marginTop: 18 }}>
    <b>{t('Offline assessment')}</b>
    <p className="muted">Download your selected model while online. Changing pose model requires preparing that model again. Accounts and cloud sync still need a connection.</p>
    {import.meta.env.PROD && 'serviceWorker' in navigator ? <button className="btn" disabled={busy} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Prepare this device for offline use'}</button> : <p className="faint">Offline caching is available in the production build on HTTPS or localhost.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
