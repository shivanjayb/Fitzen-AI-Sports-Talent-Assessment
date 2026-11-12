import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EXERCISES, exerciseById, type DietPattern } from '@fitzen/engines';
import Figure from '../app/Figure';
import { getHistory, getProfile, importGuestHistory, INDIAN_STATES, measureOf, saveProfile, SYNCED, syncHistory, type Profile as P } from '../app/store';
import { getWellnessRecords, purgeWellnessRecords } from '../app/wellnessStore';
import { getAccount, isMinor, isMissingSchema, supabase, useIdentity, type Account as Acct } from '../lib/supabase';
import { setPassword, signOut } from '../lib/auth';
import { Card, Dialog, Icon, Marker, PageHead, Soon, toast } from './ui';
import './account.css';

const DEMO = exerciseById('goblet-squat') ?? EXERCISES[0]!;
const VIEW_KEY = 'fitzen-body-view';
type View = 'digital' | 'stats';
const VIEW_NAME: Record<View, string> = { digital: 'Digital human', stats: 'Just the statistics' };
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'stats' ? 'stats' : 'digital'; } catch { return 'digital'; } };
const soon = (what: string) => () => toast(`${what} is coming soon.`);

/* ---------- export (user-initiated local download) ---------- */
// Leading = + - @ would run as a formula in spreadsheets; prefix text cells so exports are safe to open.
const cell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportData(kind: 'csv' | 'json') {
  const sessions = getHistory(), wellness = getWellnessRecords();
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === 'json') return download(`fitzen-export-${stamp}.json`, 'application/json', JSON.stringify({ exportedAt: new Date().toISOString(), sessions, wellness }, null, 2));
  const rows: unknown[][] = [['type', 'date', 'name', 'source', 'value', 'unit', 'details']];
  for (const s of sessions) {
    const m = measureOf(s.report);
    rows.push(['assessment', s.report.startedAt.slice(0, 10), s.report.name, s.source, m?.value, m?.unit, `form score ${Math.round(s.report.formScore)}`]);
  }
  for (const r of wellness) rows.push([r.kind, r.date, r.title, 'manual entry', Object.entries(r.values).map(([k, v]) => `${k}=${v}`).join('; '), r.unit, r.note]);
  download(`fitzen-export-${stamp}.csv`, 'text/csv', rows.map((r) => r.map(cell).join(',')).join('\r\n'));
}

/* ---------- small parts ---------- */
function Row({ title, state, children, actions }: { title: string; state?: ReactNode; children: ReactNode; actions: ReactNode }) {
  return <div className="x-account-row">
    <div className="x-account-copy"><h3>{title}{state}</h3><p>{children}</p></div>
    <div className="x-account-actions">{actions}</div>
  </div>;
}

function Stepper({ label, value, set, min = 0, max = 10, step = 1, unit = '' }: { label: string; value: number; set: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  return <div className="x-choice"><span>{label}</span><div>
    <button type="button" className="x-icon-btn small" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => set(Math.max(min, value - step))}>−</button>
    <b className="num" style={{ minWidth: 44, textAlign: 'center', alignSelf: 'center' }}>{value}{unit}</b>
    <button type="button" className="x-icon-btn small" aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(Math.min(max, value + step))}>+</button>
  </div></div>;
}

function Choice<T extends string | boolean>({ label, hint, value, options, set }: { label: string; hint?: string; value: T; options: readonly (readonly [T, string])[]; set: (v: T) => void }) {
  return <div className="x-choice" role="group" aria-label={label}>
    <span>{label}{hint && <small>{hint}</small>}</span>
    <div>{options.map(([v, name]) => <button key={String(v)} type="button" className="x-chip" aria-pressed={value === v} onClick={() => set(v)}>{name}</button>)}</div>
  </div>;
}

const numField = (v: string) => v ? Number(v) : null;

/* ---------- AI settings (D4): look only, never stores a key ---------- */
const PROVIDERS = ['OpenAI', 'Claude · Anthropic', 'Gemini · Google', 'OpenRouter', 'Mistral · Mistral AI', 'Groq', 'Grok · xAI', 'DeepSeek'];
function AiSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Dialog open={open} onClose={onClose} kicker="Settings / AI" title="Your AI">
    <p className="x-dialog-lead">Connect any supported provider with your own API key to power chat and journal reflections. <Soon /></p>
    <div className="x-dialog-form">
      <label className="x-field">AI provider<select disabled defaultValue="OpenAI">{PROVIDERS.map((p) => <option key={p}>{p}</option>)}</select></label>
      <p className="x-mini-note">Bring-your-own-key AI is not available in Fitzen yet. Fitzen’s coach runs on your device today.</p>
      <label className="x-field">Secret API key<input type="password" disabled placeholder="Paste your provider’s API key" autoComplete="off" /></label>
      <span className="x-field">Model<span className="x-model-row"><input className="x-input" disabled defaultValue="gpt-4.1-mini" aria-label="Model" />
        <button type="button" className="x-btn ghost" aria-disabled="true" onClick={soon('Finding models')}>Find my models</button></span></span>
      <p className="x-mini-note" role="status">Keys are never stored. This screen shows what is planned.</p>
    </div>
    <div className="x-dialog-footer"><span>Nothing here is saved.</span><button type="button" className="x-btn" aria-disabled="true" onClick={soon('Connecting your AI')}>Verify &amp; connect</button></div>
    <section className="x-ai-extra"><h3>Portraits and voice notes</h3><p>Planned for a later release, with its own optional key.</p>
      <button type="button" className="x-btn ghost small" aria-disabled="true" onClick={soon('Portraits and voice notes')}>Add an OpenAI key</button></section>
  </Dialog>;
}

/* ---------- onboarding / preferences (O1) ---------- */
const STEPS = ['Your perspective', 'A little about you', 'Your community'];
function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [view, setView] = useState<View>(readView());
  const [d, setD] = useState<P>(getProfile());
  const [err, setErr] = useState('');
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); }, [step]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  const next = () => {
    setErr('');
    if (step === 0) { try { localStorage.setItem(VIEW_KEY, view); } catch { setErr('Device storage is blocked, so this view lasts only until you reload.'); } }
    else if (!saveProfile(d)) return setErr('Device storage is unavailable. Free some space and try again.');
    if (step < 2) setStep(step + 1); else { toast('Preferences saved.'); onClose(); }
  };
  const titles = ['How would you like to see yourself?', 'A little about you.', 'Your community.'];
  const leads = ['Choose a view for your Home and Body pages. You can change it anytime.',
    'Used for your BMI, diet targets, norms and growth estimates. Saved on this device.',
    'Where you train and who with. Used for local leaderboards when you choose to join them.'];
  return <div className="x-onboard" role="dialog" aria-modal="true" aria-labelledby="x-onboard-title">
    <header className="x-onboard-top">
      <span className="x-brand"><span className="x-orb" aria-hidden /><span className="x-brand-name" translate="no">Fitzen</span></span>
      <button type="button" className="x-btn ghost small" onClick={onClose}>Back to workspace</button>
    </header>
    <div className="x-onboard-grid">
      <section className="x-onboard-art" aria-hidden>
        <span className="x-onboard-caption">Illustrative figure</span>
        <div className="x-account-figure"><Figure def={DEMO} /></div>
        <div className="x-glass-panel">
          <h2>Make this space yours.</h2>
          <ol className="x-onboard-steps">{STEPS.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined}><b>0{i + 1}</b>{s}</li>)}</ol>
        </div>
      </section>
      <section className="x-card x-onboard-card">
        <form className="x-onboard-inner" onSubmit={(e) => { e.preventDefault(); next(); }}>
          <div className="x-card-head"><Marker /><span>Step {step + 1} of 3</span></div>
          <h1 id="x-onboard-title" ref={head} tabIndex={-1} style={{ outline: 0 }}>{titles[step]}</h1>
          <p>{leads[step]}</p>
          {step === 0 && <fieldset className="x-onboard-options"><legend className="sr-only">Dashboard representation</legend>
            <label className="x-onboard-option" onClick={soon('Your own portrait')}>
              <input type="radio" name="view" value="photo" disabled /><span className="x-onboard-check" aria-hidden />
              <span className="x-onboard-option-art photo"><Icon name="camera" /></span>
              <strong>Your own portrait <Soon /></strong><span className="copy">Your likeness, rendered in the Fitzen style from a photo.</span>
            </label>
            <label className="x-onboard-option">
              <input type="radio" name="view" value="digital" checked={view === 'digital'} onChange={() => setView('digital')} /><span className="x-onboard-check" aria-hidden />
              <span className="x-onboard-option-art"><div className="x-account-figure" style={{ left: 0, width: '100%' }}><Figure def={DEMO} playing={false} /></div></span>
              <strong>Digital human</strong><span className="copy">Fitzen’s animated demonstrator figure. No photo needed.</span>
            </label>
            <label className="x-onboard-option">
              <input type="radio" name="view" value="stats" checked={view === 'stats'} onChange={() => setView('stats')} /><span className="x-onboard-check" aria-hidden />
              <span className="x-onboard-option-art" aria-hidden><i style={{ height: 48 }} /><i style={{ height: 78 }} /><i style={{ height: 58 }} /><i style={{ height: 92 }} /></span>
              <strong>Just the statistics</strong><span className="copy">Your measurements take the whole stage.</span>
            </label>
          </fieldset>}
          {step === 1 && <div className="x-dialog-form">
            <label className="x-field">Name<input value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
            <div className="x-form-grid">
              <label className="x-field">Age<input type="number" inputMode="numeric" min={5} max={100} value={d.age ?? ''} onChange={(e) => setD({ ...d, age: numField(e.target.value) })} /></label>
              <label className="x-field">Height (cm)<input type="number" inputMode="decimal" value={d.heightCm ?? ''} onChange={(e) => setD({ ...d, heightCm: numField(e.target.value) })} /></label>
              <label className="x-field">Weight (kg)<input type="number" inputMode="decimal" value={d.weightKg ?? ''} onChange={(e) => setD({ ...d, weightKg: numField(e.target.value) })} /></label>
              <label className="x-field">Sitting height (cm, optional)<input type="number" inputMode="decimal" value={d.sittingHeightCm ?? ''} onChange={(e) => setD({ ...d, sittingHeightCm: numField(e.target.value) })} /></label>
            </div>
            <Choice label="Sex" value={d.sex} options={[['male', 'Boy'], ['female', 'Girl']] as const} set={(sex) => setD({ ...d, sex })} />
          </div>}
          {step === 2 && <div className="x-dialog-form">
            <div className="x-form-grid">
              <label className="x-field">Village / city<input value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} /></label>
              <label className="x-field">State<select value={d.state} onChange={(e) => setD({ ...d, state: e.target.value })}><option value="">Choose…</option>{INDIAN_STATES.map((x) => <option key={x}>{x}</option>)}</select></label>
            </div>
            <label className="x-field">Main sport<input value={d.sport} placeholder="e.g. athletics, kabaddi, hockey" onChange={(e) => setD({ ...d, sport: e.target.value })} /></label>
            <Choice label="Have a coach?" value={d.hasCoach} options={[[true, 'Yes'], [false, 'No']] as const} set={(hasCoach) => setD({ ...d, hasCoach })} />
            <p className="x-mini-note">Age-group comparisons with other Fitzen athletes <Soon /></p>
          </div>}
          <div role="alert" className="x-account-status">{err}</div>
          <footer className="x-onboard-actions">
            <span>{step === 0 ? 'Your choice is saved on this device.' : 'Saved on this device, and to your account when signed in.'}</span>
            <div>{step > 0 && <button type="button" className="x-btn ghost" onClick={() => setStep(step - 1)}>Back</button>}
              <button className="x-btn">{step < 2 ? 'Continue' : 'Finish'} <Icon name="arrow" /></button></div>
          </footer>
        </form>
      </section>
    </div>
  </div>;
}

/* ---------- Fitzen athlete profile ---------- */
function AthleteProfile() {
  const [d, setD] = useState<P>(getProfile());
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const f = () => { if (!dirty) setD(getProfile()); };
    window.addEventListener(SYNCED, f); return () => window.removeEventListener(SYNCED, f);
  }, [dirty]);
  const set = (patch: Partial<P>) => { setD({ ...d, ...patch }); setDirty(true); setMsg(''); };
  const diet = (k: keyof P['diet']) => (v: number) => set({ diet: { ...d.diet, [k]: v } });
  const num = (k: 'weightKg' | 'heightCm' | 'age' | 'sittingHeightCm') => (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: numField(e.target.value) });
  const save = () => {
    if (saveProfile(d)) { setDirty(false); setMsg('Saved.'); toast('Athlete profile saved.'); }
    else setMsg('Device storage is unavailable. Changes last only until this tab closes.');
  };
  return <section className="x-card x-account-full" aria-labelledby="x-athlete">
    <h2 id="x-athlete"><Marker />Athlete profile</h2>
    <p className="x-account-note" style={{ marginTop: 0 }}>Used for your BMI, diet targets, norms, depth ranges and growth estimates.</p>
    <form className="x-account-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <fieldset><legend><Icon name="user" size={16} />Basics</legend>
        <div className="x-form-grid three">
          <label className="x-field">Name<input value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
          <label className="x-field">Age<input type="number" inputMode="numeric" value={d.age ?? ''} onChange={num('age')} /></label>
          <Choice label="Sex" value={d.sex} options={[['male', 'Boy'], ['female', 'Girl']] as const} set={(sex) => set({ sex })} />
        </div>
      </fieldset>
      <fieldset><legend><Icon name="body" size={16} />Body</legend>
        <div className="x-form-grid three">
          <label className="x-field">Height (cm)<input type="number" inputMode="decimal" value={d.heightCm ?? ''} onChange={num('heightCm')} /></label>
          <label className="x-field">Weight (kg)<input type="number" inputMode="decimal" value={d.weightKg ?? ''} onChange={num('weightKg')} /></label>
          <label className="x-field">Sitting height (cm, optional)<input type="number" inputMode="decimal" value={d.sittingHeightCm ?? ''} onChange={num('sittingHeightCm')} /></label>
        </div>
        <p className="x-mini-note">Sitting height improves the growth-spurt estimate.</p>
      </fieldset>
      <fieldset><legend><Icon name="train" size={16} />Sport</legend>
        <div className="x-form-grid three">
          <label className="x-field">Main sport<input value={d.sport} placeholder="e.g. athletics, kabaddi, hockey" onChange={(e) => set({ sport: e.target.value })} /></label>
          <label className="x-field">Village / city<input value={d.city} onChange={(e) => set({ city: e.target.value })} /></label>
          <label className="x-field">State<select value={d.state} onChange={(e) => set({ state: e.target.value })}><option value="">Choose…</option>{INDIAN_STATES.map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
        <Choice label="Experience" value={d.level} options={[['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']] as const} set={(level) => set({ level })} />
        <Choice label="Personal ranges" hint="Depth targets fitted to your BMI, age, build, experience and usual depth. Leaderboards always use standard ranges." value={d.personalRanges} options={[[true, 'On'], [false, 'Off']] as const} set={(personalRanges) => set({ personalRanges })} />
        <Stepper label="Training days a week" value={d.trainingDaysPerWeek} set={(v) => set({ trainingDaysPerWeek: v })} max={7} />
        <Stepper label="Sleep per night" value={d.sleepHours} set={(v) => set({ sleepHours: v })} min={3} max={12} step={0.5} unit=" h" />
        <Choice label="Have a coach?" value={d.hasCoach} options={[[true, 'Yes'], [false, 'No']] as const} set={(hasCoach) => set({ hasCoach })} />
        <Choice label="Diet" value={d.diet.pattern} options={(['vegetarian', 'eggetarian', 'non-vegetarian', 'vegan'] as DietPattern[]).map((x) => [x, x[0]!.toUpperCase() + x.slice(1)] as const)} set={(pattern) => set({ diet: { ...d.diet, pattern } })} />
        <Stepper label="Meals a day" value={d.diet.mealsPerDay} set={diet('mealsPerDay')} min={1} max={6} />
        <Stepper label="Dal / egg / paneer / meat servings" value={d.diet.proteinServingsPerDay} set={diet('proteinServingsPerDay')} max={8} />
        <Stepper label="Milk / curd (glass or bowl)" value={d.diet.milkServingsPerDay} set={diet('milkServingsPerDay')} max={6} />
        <Stepper label="Fruit & vegetable servings" value={d.diet.fruitVegServingsPerDay} set={diet('fruitVegServingsPerDay')} max={10} />
      </fieldset>
      <fieldset><legend><Icon name="camera" size={16} />Camera &amp; voice</legend>
        <Choice label="Pose model" hint="Heavier is more accurate, but slower." value={d.model} options={[['lite', 'Lite'], ['full', 'Full'], ['heavy', 'Heavy']] as const} set={(model) => set({ model })} />
        <Choice label="Voice coaching" hint="Spoken rep counts and cues." value={d.voice} options={[[true, 'On'], [false, 'Off']] as const} set={(voice) => set({ voice })} />
      </fieldset>
      <div className="x-account-foot">
        <span role="status" className="x-account-status">{msg || 'Saved on this device and privately backed up when you sign in.'}</span>
        <button className="x-btn" disabled={!dirty}>Save</button>
      </div>
    </form>
  </section>;
}

/* ---------- account linking: copied from app/Profile.tsx (leaderboards, guardian, password, sync, delete) ---------- */
type Draft = Omit<Acct, 'id' | 'parent_consent_at' | 'birth_year'> & { birth_year: string };
function AccountCard() {
  const { user } = useIdentity();
  const [acct, setAcct] = useState<Acct | null | undefined>(undefined);
  const [d, setD] = useState<Draft | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const p = getProfile();
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
  if (!supabase || !user) return null;
  const status = <p role="status" aria-live="polite" className="x-account-status">{msg}</p>;
  if (acct === undefined || !d) return <section className="x-card x-account-full"><h2><Marker />Account &amp; leaderboards</h2>
    {msg ? <>{status}<div className="x-account-actions" style={{ justifyContent: 'flex-start' }}><button className="x-btn ghost" onClick={() => location.reload()}>Retry</button></div></> : <p className="x-account-note">Loading your account…</p>}</section>;

  const by = Number(d.birth_year);
  const minor = by > 1900 && isMinor(by);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const savedParent = acct?.parent_email && acct.parent_email.toLowerCase() === (d.parent_email ?? '').trim().toLowerCase();
  const save = () => run(async () => {
    const parent = d.parent_email?.trim() || null;
    if (!d.display_name.trim()) return 'Add the name shown to others.';
    if (!Number.isInteger(by) || by < 1920 || by > new Date().getFullYear()) return 'Add your birth year (for example 2008).';
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

  return <section className="x-card x-account-full" id="account" aria-labelledby="x-acct">
    <h2 id="x-acct"><Marker />{acct ? 'Account & leaderboards' : 'Finish your account'}</h2>
    {!acct && <p className="x-account-note" style={{ marginTop: 0 }}>You’re signed in. Add the name others see and your birth year (it keeps under-18s protected), then choose <b>Finish my account</b>. This unlocks leaderboards, groups and coaches.</p>}
    <form className="x-account-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="x-form-grid">
        <label className="x-field">Name shown to others<input required maxLength={40} value={d.display_name} onChange={(e) => set('display_name', e.target.value)} /></label>
        <label className="x-field">Birth year<input type="number" inputMode="numeric" min={1920} max={new Date().getFullYear()} value={d.birth_year} onChange={(e) => set('birth_year', e.target.value)} /></label>
        <label className="x-field">Country<input maxLength={60} value={d.country} onChange={(e) => set('country', e.target.value)} /></label>
        <label className="x-field">Village / city<input maxLength={60} value={d.city ?? ''} onChange={(e) => set('city', e.target.value)} /></label>
        <label className="x-field">State<select value={d.state ?? ''} onChange={(e) => set('state', e.target.value)}><option value="">Choose…</option>{INDIAN_STATES.map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      <label className="x-choice"><span>Show me on public leaderboards<small>{minor ? 'Off: only your groups see your scores. On: people in your city, state, country and the world can see your name (as initials, because you are under 18) and your best scores.' : 'Off: only your groups see your scores. On: people in your city, state, country and the world can see your name and your best scores.'}</small></span>
        <input type="checkbox" role="switch" checked={d.public_boards} onChange={(e) => set('public_boards', e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--x-accent)' }} /></label>
      {minor && <div className="x-dialog-form">
        <label className="x-field">Parent or guardian email (required under 18)<input type="email" required value={d.parent_email ?? ''} onChange={(e) => set('parent_email', e.target.value)} /></label>
        <p className="x-mini-note">{acct?.parent_consent_at ? `Guardian mailbox confirmed on ${new Date(acct.parent_consent_at).toLocaleDateString()}. Public boards use initials for year-only ages up to 18.`
          : 'A guardian must approve public sharing. Email confirmation checks mailbox ownership; guardian verification is still required before a public youth release. Until then only your groups see you.'}</p>
        {!acct?.parent_consent_at && <button type="button" className="x-btn ghost" style={{ justifySelf: 'start' }} disabled={busy || !savedParent} onClick={() => run(async () => {
          const { error } = await supabase!.auth.signInWithOtp({ email: acct!.parent_email!, options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/consent?child=${user.id}` } });
          if (error) throw error;
          return `Consent link sent to ${acct!.parent_email}. Ask your parent to open it.`;
        })}>{savedParent ? 'Send consent link to parent' : 'Save the parent email first'}</button>}
      </div>}
      <div className="x-account-foot">
        <span>Leaderboards get only the exercise, your best number, your form score and the date. Never video.</span>
        <button className="x-btn" disabled={busy}>{acct ? 'Save changes' : 'Finish my account'}</button>
      </div>
    </form>
    {status}
    <form className="x-model-row" style={{ marginTop: 18, alignItems: 'flex-end' }} onSubmit={(e) => {
      e.preventDefault();
      const input = e.currentTarget.elements.namedItem('pw') as HTMLInputElement;
      void run(async () => { await setPassword(supabase, input.value); input.value = ''; return 'Password saved. Use it to sign in on any device.'; });
    }}>
      <label className="x-field" style={{ flex: 1 }}>Set a password (sign in anywhere without an email link)<input name="pw" type="password" minLength={8} maxLength={72} autoComplete="new-password" required /></label>
      <button className="x-btn ghost" style={{ height: 44 }} disabled={busy}>Save password</button>
    </form>
    <div className="x-account-actions" style={{ justifyContent: 'flex-start', marginTop: 18 }}>
      {acct && <button type="button" className="x-btn ghost" disabled={busy} onClick={() => run(async () => {
        const res = await syncHistory();
        return `Synced ${res.uploaded} session(s). ${res.pending} change(s) waiting for retry. Demo, unassessed and flagged sessions are excluded.`;
      })}>Sync pending sessions</button>}
      {acct && <button type="button" className="x-btn ghost" disabled={busy} onClick={() => {
        if (!confirm('Copy this device’s guest sessions into your account? Only continue if these assessments belong to you. Guest copies remain on this device.')) return;
        setMsg(importGuestHistory() ? 'Guest sessions copied. Use Sync to upload eligible results.' : 'Could not save the import. Free device storage and retry.');
      }}>Import my guest sessions</button>}
      <Link className="x-btn ghost" to="/coach">{acct?.role === 'coach' || acct?.role === 'admin' ? 'Open coach portal' : 'Coach portal'}</Link>
      {acct?.role === 'admin' && <Link className="x-btn ghost" to="/admin">Admin portal</Link>}
      {/* Wellness, sessions and the profile copy sync before "Finish my account", so deletion never waits for a public profile. */}
      <button type="button" className="x-btn ghost x-account-danger" disabled={busy} onClick={() => {
        if (!confirm('Delete your account data? Your wellness records, uploaded scores, synced reports, groups you own and memberships are removed. Assessment sessions on this phone stay.')) return;
        void run(async () => {
          await purgeWellnessRecords();
          for (const t of ['sessions', 'athlete_data'] as const) { const { error } = await supabase!.from(t).delete().eq('user_id', user.id); if (error && !isMissingSchema(error)) throw error; }
          const { error } = await supabase!.from('profiles').delete().eq('id', user.id);
          if (error) throw error;
          setAcct(null);
          return 'Account data deleted.';
        });
      }}>Delete account data</button>
    </div>
  </section>;
}

/* ---------- page ---------- */
export default function Profile() {
  const { ready, user } = useIdentity();
  const [ai, setAi] = useState(false);
  const [onboard, setOnboard] = useState(false);
  const [rev, setRev] = useState(0);
  const [busy, setBusy] = useState(false);
  const view = readView();
  const age = getProfile().age;
  // Bumping rev re-reads the view and age, and remounts the athlete form with the saved profile.
  const closeOnboard = () => { setOnboard(false); setRev((r) => r + 1); };

  return <div>
    <PageHead title="Profile" subtitle="Your preferences, connections and data." />
    <div className="x-account-grid">
      <section className="x-card x-account-settings" aria-labelledby="x-settings">
        <h2 id="x-settings"><Marker />Settings</h2>
        <Row title="Chat & reflections" state={<Soon />} actions={<button type="button" className="x-btn" onClick={() => setAi(true)}>Connect a chat AI</button>}>
          Connect ChatGPT, Claude, Gemini, Grok, Mistral, DeepSeek, Groq or OpenRouter with your own API key for Ask Fitzen and journal reflections.</Row>
        <Row title="Portraits & voice" state={<Soon />} actions={<button type="button" className="x-btn ghost" aria-disabled="true" onClick={soon('Portraits and voice notes')}>Add OpenAI key</button>}>
          Add your own OpenAI key to create your portrait and transcribe voice notes.</Row>
        <Row title="Account" actions={!supabase ? <span className="x-account-state off"><i />Device only</span>
          : user ? <span className="x-account-state"><i />Signed in</span>
          : <Link className="x-btn ghost" to="/auth?next=%2Fprofile">Sign in</Link>}>
          {!supabase ? 'Online accounts are not configured on this build. Everything stays on this device.'
            : !ready ? 'Checking your sign-in…' : user ? user.email ?? 'Signed in' : 'Sign in to keep your profile and sessions on every device, and to join leaderboards, groups and coaches.'}</Row>
        <Row title="Connected sources" actions={<Link className="x-btn ghost" to="/integrations">Manage sources</Link>}>Manage what comes into your health profile.</Row>
        <Row title="Export your data" actions={<>
          <button type="button" className="x-btn ghost" onClick={() => exportData('csv')}>CSV</button>
          <button type="button" className="x-btn ghost" onClick={() => exportData('json')}>JSON</button></>}>
          Download your assessment sessions and wellness records from this device. CSV opens in any spreadsheet.</Row>
        <Row title="Privacy & data use" actions={<Link className="x-btn ghost" to="/privacy">Read details</Link>}>Understand how your camera, records and account data are handled.</Row>
        <Row title="Sign out" actions={<button type="button" className="x-btn ghost" disabled={!user || busy} onClick={async () => {
          setBusy(true);
          try { await signOut(supabase); toast('Signed out on this device.'); } catch { toast('Could not sign out. Check your connection and try again.'); }
          setBusy(false);
        }}>Sign out</button>}>{user ? 'End your session on this device.' : 'You are using Fitzen as a guest on this device.'}</Row>
      </section>

      <Card tone="orange" className="x-account-view">
        <div className="x-account-figure"><Figure def={DEMO} /></div>
        <div className="x-glass-panel">
          <span>Profile &amp; view</span>
          <h2>{VIEW_NAME[view]}</h2>
          <p>{age ? `${age} years` : 'Age not set'} · Peer comparisons are coming soon. Change your view, age or details anytime.</p>
          <button type="button" className="x-btn ghost small" onClick={() => setOnboard(true)}>Edit preferences</button>
        </div>
      </Card>

      <section className="x-card x-account-photos" aria-labelledby="x-photos">
        <div className="x-card-head"><Marker /><h2 id="x-photos">Portrait photos</h2><span className="x-spacer" /><Soon /></div>
        <p>Private reference photos for your portrait, kept apart from your records. Portrait generation is not available yet, so no photos are stored.</p>
      </section>

      <section className="x-card x-account-full" aria-labelledby="x-peers">
        <div className="x-card-head"><Marker /><h2 id="x-peers">Age-group comparison</h2><span className="x-spacer" /><Soon /></div>
        <div className="x-account-peers">
          <div className="x-account-intro"><span>Your private comparison with Fitzen athletes your age.</span>
            <button type="button" className="x-btn ghost small" aria-disabled="true" onClick={soon('Comparison preferences')}>Comparison preferences <Icon name="arrow" /></button></div>
          <div className="x-well x-account-summary">
            <div><span>Your age group</span><b>{age ? (age < 18 ? 'Under 18' : age < 30 ? '18–29' : `${Math.floor(age / 10) * 10}–${Math.floor(age / 10) * 10 + 9}`) : '—'}</b><small>{age ? 'years' : 'add your age'}</small></div>
            <p style={{ margin: 0 }}>Last 30 days · Same source and measurement<br />At least 7 recorded days per person</p>
          </div>
          <div className="x-well"><h3>Start with your own signals.</h3><p>A comparison needs at least 7 days of your own recorded data, and enough athletes in your group. This is coming in a later release.</p></div>
          <div className="x-well"><h3>Context, not competition.</h3><p>Comparisons will use participating Fitzen athletes, not the general population. Small-group results stay hidden, and sources and units are never mixed.</p></div>
        </div>
      </section>

      <AthleteProfile key={rev} />
      <AccountCard />
    </div>
    <AiSettings open={ai} onClose={() => setAi(false)} />
    {onboard && <Onboarding onClose={closeOnboard} />}
  </div>;
}
