import { useEffect, useState } from 'react';
import { assessDiet, maturityOffset, type DietPattern } from '@fitzen/engines';
import { getProfile, INDIAN_STATES, saveProfile, toAthlete, type Profile as P } from './store';

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
  const num = (k: 'weightKg' | 'heightCm' | 'age' | 'sittingHeightCm') => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value ? Number(e.target.value) : null });
  const diet = (k: keyof P['diet']) => (v: number) => setP({ ...p, diet: { ...p.diet, [k]: v } });
  const a = toAthlete(p);
  const d = a ? assessDiet(a) : null;
  const mat = a ? maturityOffset(a) : null;

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
      <p className="faint" style={{ fontSize: '.78rem', marginTop: 20 }}>Sign-in and cloud sync are paused in this build; sessions are kept locally.</p>
    </main>
  );
}
