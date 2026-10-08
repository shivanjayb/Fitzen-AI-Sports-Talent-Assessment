import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assessDiet, maturityOffset, type DietPattern } from '@fitzen/engines';
import { getHistory, getProfile, INDIAN_STATES, saveProfile, toAthlete, syncHistory, importGuestHistory, type Profile as P } from './store';
import { getAccount, isMinor, supabase, useUser, type Account as Acct } from '../lib/supabase';
import { applyTheme, getTheme, THEME, type Theme } from './theme';
import Offline from './Offline';
import { getLanguage, setLanguage, type Language } from './language';
import { signOut } from '../lib/auth';

function Stepper({ label, value, set, min = 0, max = 10, step = 1, unit = '' }: { label: string; value: number; set: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  return (
    <div className="row between">
      <span style={{ fontSize: '.92rem' }}>{label}</span>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn icon glass press" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => set(Math.max(min, value - step))}>−</button>
        <b className="num" style={{ minWidth: 44, textAlign: 'center' }}>{value}{unit}</b>
        <button className="btn icon glass press" aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  );
}

export default function Profile() {
  const [p, setP] = useState<P>(getProfile());
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => { setSaveFailed(!saveProfile(p)); }, [p]);
  useEffect(() => { applyTheme(theme); try { localStorage.setItem(THEME, theme); } catch { /* private mode */ } }, [theme]);
  const num = (k: 'weightKg' | 'heightCm' | 'age' | 'sittingHeightCm') => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value ? Number(e.target.value) : null });
  const diet = (k: keyof P['diet']) => (v: number) => setP({ ...p, diet: { ...p.diet, [k]: v } });
  const a = toAthlete(p);
  const d = a ? assessDiet(a) : null;
  const mat = a ? maturityOffset(a) : null;

  return (
    <main className="page" style={{ maxWidth: 640 }}>
      <p className="subtitle">No account needed</p>
      <h1 className="large-title">Profile</h1>
      <label className="field" style={{ marginTop: 14 }}><span>Language / भाषा</span><select value={getLanguage()} onChange={(e) => setLanguage(e.target.value as Language)}><option value="en">English</option><option value="hi">हिन्दी — मुख्य मूल्यांकन निर्देश</option></select></label>
      <Offline />
      {saveFailed && <p role="alert">Device storage is unavailable. Profile changes last only until this tab closes.</p>}
      <section className="glass panel" style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        <label className="field"><span>Name</span><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <label className="field"><span>Weight (kg)</span><input type="number" inputMode="decimal" value={p.weightKg ?? ''} onChange={num('weightKg')} /></label>
          <label className="field"><span>Height (cm)</span><input type="number" inputMode="decimal" value={p.heightCm ?? ''} onChange={num('heightCm')} /></label>
          <label className="field"><span>Age</span><input type="number" inputMode="numeric" value={p.age ?? ''} onChange={num('age')} /></label>
        </div>
        <div className="row between"><b>Sex</b>
          <div className="segmented glass">{(['male', 'female'] as const).map((x) => <button key={x} className={p.sex === x ? 'on' : ''} onClick={() => setP({ ...p, sex: x })}>{x === 'male' ? 'Boy' : 'Girl'}</button>)}</div>
        </div>
        <label className="field"><span>Sitting height (cm, optional: improves the growth-spurt estimate)</span><input type="number" inputMode="decimal" value={p.sittingHeightCm ?? ''} onChange={num('sittingHeightCm')} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <label className="field"><span>Village / city</span><input value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></label>
          <label className="field"><span>State</span><select value={p.state} onChange={(e) => setP({ ...p, state: e.target.value })}><option value="">Choose…</option>{INDIAN_STATES.map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
        <label className="field"><span>Main sport</span><input value={p.sport} placeholder="e.g. athletics, kabaddi, hockey" onChange={(e) => setP({ ...p, sport: e.target.value })} /></label>
        <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>Used for your BMI, diet targets, norms and growth estimates. Everything stays on this device.</p>
      </section>

      <h2 className="section-title">Training & sleep</h2>
      <section className="glass panel" style={{ display: 'grid', gap: 12 }}>
        <Stepper label="Training days a week" value={p.trainingDaysPerWeek} set={(v) => setP({ ...p, trainingDaysPerWeek: v })} max={7} />
        <Stepper label="Sleep per night" value={p.sleepHours} set={(v) => setP({ ...p, sleepHours: v })} min={3} max={12} step={0.5} unit=" h" />
        <div className="row between"><span style={{ fontSize: '.92rem' }}>Have a coach?</span>
          <div className="segmented glass">{[true, false].map((v) => <button key={String(v)} className={p.hasCoach === v ? 'on' : ''} onClick={() => setP({ ...p, hasCoach: v })}>{v ? 'Yes' : 'No'}</button>)}</div>
        </div>
      </section>

      <h2 className="section-title">Diet</h2>
      <section className="glass panel" style={{ display: 'grid', gap: 12 }}>
        <div className="chips" style={{ padding: 0, flexWrap: 'wrap' }}>
          {(['vegetarian', 'eggetarian', 'non-vegetarian', 'vegan'] as DietPattern[]).map((x) => <button key={x} className={`chip ${p.diet.pattern === x ? 'on' : ''}`} onClick={() => setP({ ...p, diet: { ...p.diet, pattern: x } })}>{x[0]!.toUpperCase() + x.slice(1)}</button>)}
        </div>
        <Stepper label="Meals a day" value={p.diet.mealsPerDay} set={diet('mealsPerDay')} min={1} max={6} />
        <Stepper label="Dal / egg / paneer / meat servings" value={p.diet.proteinServingsPerDay} set={diet('proteinServingsPerDay')} max={8} />
        <Stepper label="Milk / curd (glass or bowl)" value={p.diet.milkServingsPerDay} set={diet('milkServingsPerDay')} max={6} />
        <Stepper label="Fruit & vegetable servings" value={p.diet.fruitVegServingsPerDay} set={diet('fruitVegServingsPerDay')} max={10} />
      </section>

      {d ? (<>
        <h2 className="section-title">Body & nutrition</h2>
        <div className="kv">
          <div><span>BMI</span><b className="num">{d.bmi.bmi}</b><small>{d.bmi.category}{d.bmi.zScore !== undefined ? ` · z ${d.bmi.zScore}` : ''}</small></div>
          <div><span>Protein target</span><b className="num">{d.proteinNeedG.target} g</b><small>{d.proteinNeedG.low}–{d.proteinNeedG.high} g/day</small></div>
          <div><span>Protein now (est.)</span><b className="num">{d.proteinIntakeG} g</b><small>{d.proteinGapG ? `${d.proteinGapG} g short` : 'target met'}</small></div>
          <div><span>Energy</span><b className="num" style={{ fontSize: '1.3rem' }}>{d.energyKcal.low}–{d.energyKcal.high}</b><small>kcal/day estimate</small></div>
          {mat && <div><span>Growth spurt</span><b className="num">{mat.offsetYears > 0 ? '+' : ''}{mat.offsetYears.toFixed(1)} y</b><small>from peak height velocity ± {mat.seYears} y ({mat.method})</small></div>}
        </div>
        {d.suggestions.length > 0 && (
          <section className="glass panel" style={{ marginTop: 10 }}>
            <b>Easy ways to close the protein gap</b>
            <div className="list" style={{ marginTop: 8 }}>{d.suggestions.map((x) => <div key={x.food} className="row between"><span>{x.portions}× {x.food} <span className="faint">({x.portion})</span></span><b className="num">+{x.proteinG} g</b></div>)}</div>
          </section>
        )}
        <ul className="faint" style={{ fontSize: '.8rem', lineHeight: 1.5, paddingLeft: 18 }}>
          {d.notes.map((n) => <li key={n}>{n}</li>)}
          <li>BMI: {d.bmi.reference}. Protein: {d.proteinNeedG.basis}. {d.energyKcal.basis}.</li>
        </ul>
      </>) : <p className="faint" style={{ fontSize: '.85rem', marginTop: 14 }}>Add age, height and weight to see BMI, protein and energy targets.</p>}

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
      <Account p={p} />
    </main>
  );
}

type Draft = Omit<Acct, 'id' | 'parent_consent_at' | 'birth_year'> & { birth_year: string };

/** Optional account: only needed for leaderboards and groups. */
function Account({ p }: { p: P }) {
  const user = useUser();
  const [acct, setAcct] = useState<Acct | null | undefined>(undefined); // undefined = loading
  const [d, setD] = useState<Draft | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getAccount().then((a) => {
      if (!live) return;
      setAcct(a);
      setD(a ? { ...a, birth_year: String(a.birth_year) } : {
        display_name: p.name, birth_year: p.age ? String(new Date().getFullYear() - p.age) : '', sex: p.sex,
        city: p.city, state: p.state, country: 'India', public_boards: false, parent_email: '',
      });
    }).catch(() => { if (live) setMsg('Could not load your account. Check your connection, then reload this page.'); });
    return () => { live = false; };
  }, [user?.id]); // prefill once per sign-in, not on every local edit

  const run = async (f: () => Promise<string>) => {
    setBusy(true); setMsg('');
    try { setMsg(await f()); } catch (e) { setMsg((e as { message?: string })?.message || 'Something went wrong. Check your connection and try again.'); }
    setBusy(false);
  };

  if (!supabase) return (<>
    <h2 className="section-title">Account</h2>
    <section className="glass panel"><p className="muted" style={{ margin: 0 }}>Online accounts are being configured. Your local sessions stay on this device.</p><Link to="/auth" className="btn glass press" style={{ marginTop: 14 }}>Account sign-in</Link></section>
  </>);

  const status = msg && <p role="status" aria-live="polite" className="muted" style={{ margin: 0, fontSize: '.88rem' }}>{msg}</p>;

  if (!user) return (<>
    <h2 className="section-title">Account <small>optional</small></h2>
    <section className="glass panel" style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0 }}>Sign in to join leaderboards and groups. No password: we email you a link.</p>
      <Link className="btn primary" to="/auth?next=%2Fprofile">Sign in or create an account</Link>
      {status}
    </section>
  </>);

  const logout = <button className="btn glass press" disabled={busy} onClick={() => void run(async () => { await signOut(supabase); return 'Signed out on this device.'; })}>Sign out</button>;
  if (acct === undefined || !d) return (<><h2 className="section-title">Account</h2>{msg ? <section className="glass panel"><p role="alert">{msg}</p><button className="btn glass" onClick={() => location.reload()}>Retry</button>{logout}</section> : <div className="spinner" aria-label="Loading account" />}</>);

  const by = Number(d.birth_year);
  const minor = by > 1900 && isMinor(by);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const savedParent = acct?.parent_email && acct.parent_email.toLowerCase() === (d.parent_email ?? '').trim().toLowerCase();

  const save = () => run(async () => {
    const parent = d.parent_email?.trim() || null;
    if (!Number.isInteger(by) || by < 1920 || by > new Date().getFullYear()) return 'Enter a valid birth year.';
    if (minor && !parent) return 'Age 18 or younger: add a parent or guardian email first.';
    if (parent && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent)) return 'Enter a valid parent or guardian email.';
    if (parent && parent.toLowerCase() === user.email?.toLowerCase()) return 'The parent email must be different from your own.';
    const row = { display_name: d.display_name.trim(), birth_year: by, sex: d.sex, city: d.city?.trim() || null, state: d.state || null,
      country: d.country.trim() || 'India', public_boards: d.public_boards, parent_email: parent };
    // Insert first time, update after: an upsert would try to update `id`, which the schema forbids.
    const q = acct ? supabase!.from('profiles').update(row).eq('id', user.id) : supabase!.from('profiles').insert(row);
    const { data, error } = await q.select().single();
    if (error) throw error;
    setAcct(data as Acct);
    return 'Saved.';
  });

  return (<>
    <h2 className="section-title" id="account">Account <small>{user.email}</small></h2>
    <section className="glass panel" style={{ display: 'grid', gap: 14 }}>
      {!acct && <p style={{ margin: 0 }}>Signed in. Check these details, then save to join leaderboards and groups.</p>}
      <label className="field"><span>Name shown to others</span><input required maxLength={40} value={d.display_name} onChange={(e) => set('display_name', e.target.value)} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <label className="field"><span>Birth year</span><input type="number" inputMode="numeric" min={1920} max={new Date().getFullYear()} value={d.birth_year} onChange={(e) => set('birth_year', e.target.value)} /></label>
        <label className="field"><span>Country</span><input maxLength={60} value={d.country} onChange={(e) => set('country', e.target.value)} /></label>
        <label className="field"><span>Village / city</span><input maxLength={60} value={d.city ?? ''} onChange={(e) => set('city', e.target.value)} /></label>
        <label className="field"><span>State</span><select value={d.state ?? ''} onChange={(e) => set('state', e.target.value)}><option value="">Choose…</option>{INDIAN_STATES.map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      <label className="row between" style={{ alignItems: 'flex-start', gap: 14 }}>
        <span><b>Show me on public leaderboards</b>
          <span className="faint" style={{ display: 'block', fontSize: '.8rem', marginTop: 2 }}>Off: only your groups see your scores. On: people in your city, state, country and the world can see your name{minor ? ' (as initials, because you are under 18)' : ''} and your best scores.</span></span>
        <input type="checkbox" role="switch" checked={d.public_boards} onChange={(e) => set('public_boards', e.target.checked)} style={{ width: 24, height: 24, flex: 'none' }} />
      </label>
      {minor && (
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="field"><span>Parent or guardian email (required under 18)</span><input type="email" required value={d.parent_email ?? ''} onChange={(e) => set('parent_email', e.target.value)} /></label>
          <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>
            {acct?.parent_consent_at ? `Guardian mailbox confirmed on ${new Date(acct.parent_consent_at).toLocaleDateString()}. Public boards use initials for year-only ages up to 18.`
              : 'A guardian must approve public sharing. Email confirmation checks mailbox ownership; guardian verification is still required before a public youth release. Until then only your groups see you.'}
          </p>
          {!acct?.parent_consent_at && (
            <button className="btn glass press" disabled={busy || !savedParent} onClick={() => run(async () => {
              const { error } = await supabase!.auth.signInWithOtp({ email: acct!.parent_email!, options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/consent?child=${user.id}` } });
              if (error) throw error;
              return `Consent link sent to ${acct!.parent_email}. Ask your parent to open it.`;
            })}>{savedParent ? 'Send consent link to parent' : 'Save the parent email first'}</button>
          )}
        </div>
      )}
      <button className="btn primary" disabled={busy || !d.display_name.trim() || !(by >= 1920)} onClick={save}>{acct ? 'Save changes' : 'Create my account'}</button>
      {status}
      <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>What we upload: for each camera or video session, only the exercise, your best number, your form score and the date. Never video, never your camera feed. Demo runs are not uploaded.</p>
    </section>
    <div style={{ marginTop: 14 }}>{logout}</div>
    {acct && (
      <section className="glass panel" style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        <button className="btn glass press" disabled={busy} onClick={() => run(async () => {
          const res = await syncHistory();
          return `Synced ${res.uploaded} session(s). ${res.pending} change(s) waiting for retry. Demo, unassessed and flagged sessions are excluded.`;
        })}>Sync pending sessions and deletions</button>
        <button className="btn glass press" disabled={busy} onClick={() => {
          if (!confirm('Copy this device’s guest sessions into your account? Only continue if these assessments belong to you. Guest copies remain on this device.')) return;
          setMsg(importGuestHistory() ? 'Guest sessions copied. Use Sync to upload eligible results.' : 'Could not save the import. Free device storage and retry.');
        }}>Import my guest sessions</button>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn danger" disabled={busy} onClick={() => {
            if (!confirm('Delete your account data? Your uploaded scores, groups you own and memberships are removed. Sessions on this phone stay.')) return;
            void run(async () => {
              const { error } = await supabase!.from('profiles').delete().eq('id', user.id);
              if (error) throw error;
              setAcct(null);
              return 'Account data deleted.';
            });
          }}>Delete account data</button>
        </div>
      </section>
    )}
  </>);
}
