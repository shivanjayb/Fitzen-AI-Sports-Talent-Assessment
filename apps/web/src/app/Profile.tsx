import { useEffect, useState } from 'react';
import { getProfile, saveProfile, type Profile as P } from './store';

type Theme = 'light' | 'dark';
const THEME = 'fitzen.theme';
export function applyTheme(t: Theme) {
  if (t === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
export const getTheme = (): Theme => { try { return localStorage.getItem(THEME) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } };

export default function Profile() {
  const [p, setP] = useState<P>(getProfile());
  const [theme, setTheme] = useState<Theme>(getTheme());
  useEffect(() => { saveProfile(p); }, [p]);
  useEffect(() => { applyTheme(theme); try { localStorage.setItem(THEME, theme); } catch { /* private mode */ } }, [theme]);
  const num = (k: 'weightKg' | 'heightCm' | 'age') => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value ? Number(e.target.value) : null });

  return (
    <main className="page" style={{ maxWidth: 640 }}>
      <p className="subtitle">No account needed</p>
      <h1 className="large-title">Profile</h1>
      <section className="glass panel" style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        <label className="field"><span>Name</span><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <label className="field"><span>Weight (kg)</span><input type="number" inputMode="decimal" value={p.weightKg ?? ''} onChange={num('weightKg')} /></label>
          <label className="field"><span>Height (cm)</span><input type="number" inputMode="decimal" value={p.heightCm ?? ''} onChange={num('heightCm')} /></label>
          <label className="field"><span>Age</span><input type="number" inputMode="numeric" value={p.age ?? ''} onChange={num('age')} /></label>
        </div>
        <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>Weight is used only for the energy estimate. Everything stays on this device.</p>
      </section>

      <h2 className="section-title">Preferences</h2>
      <section className="glass panel" style={{ display: 'grid', gap: 16 }}>
        <div className="row between"><b>Appearance</b>
          <div className="segmented glass">{(['dark', 'light'] as Theme[]).map((t) => <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}</div>
        </div>
        <div className="row between"><div><b>Pose model</b><div className="faint" style={{ fontSize: '.8rem' }}>Heavier = more accurate, slower</div></div>
          <div className="segmented glass">{(['lite', 'full', 'heavy'] as const).map((m) => <button key={m} className={p.model === m ? 'on' : ''} onClick={() => setP({ ...p, model: m })}>{m[0]!.toUpperCase() + m.slice(1)}</button>)}</div>
        </div>
        <div className="row between"><div><b>Voice coaching</b><div className="faint" style={{ fontSize: '.8rem' }}>Spoken rep counts and cues</div></div>
          <div className="segmented glass">{[true, false].map((v) => <button key={String(v)} className={p.voice === v ? 'on' : ''} onClick={() => setP({ ...p, voice: v })}>{v ? 'On' : 'Off'}</button>)}</div>
        </div>
      </section>
      <p className="faint" style={{ fontSize: '.78rem', marginTop: 20 }}>Sign-in and cloud sync are paused in this build; sessions are kept locally.</p>
    </main>
  );
}
