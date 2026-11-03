import { useEffect, useState, type FormEvent } from 'react';
import { getWellnessRecords, saveWellnessRecord, subscribeWellness, validateWellness, wellnessToday } from '../app/wellnessStore';
import { Card, CardHead, Dialog, Icon, PageHead, Soon, Stat, toast } from './ui';
import { fmt, shortDate, useSampleMode } from './sample';
import './nutrition.css';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
interface Meal { id: string; title: string; note: string; calories: number; protein: number; carbs: number; fat: number; sample?: boolean }
const SAMPLE: Meal[] = [
  { id: 's1', title: 'Greek yogurt with berries and granola', note: 'Breakfast', calories: 340, protein: 26, carbs: 45, fat: 12, sample: true },
  { id: 's2', title: 'Chicken wrap', note: 'Lunch', calories: 520, protein: 34, carbs: 52, fat: 18, sample: true },
  { id: 's3', title: 'Salmon, rice and greens', note: 'Dinner', calories: 640, protein: 42, carbs: 45, fat: 21, sample: true },
];
const soon = () => toast('AI meal logging is coming soon.');
const dayDate = (d: string) => new Date(`${d}T12:00:00`);

export default function Nutrition() {
  const sample = useSampleMode();
  const today = wellnessToday();
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState(false);
  const [records, setRecords] = useState(getWellnessRecords);
  useEffect(() => subscribeWellness(() => setRecords(getWellnessRecords())), []);

  const meals: Meal[] = [
    ...(sample && day === today ? SAMPLE : []),
    ...records.filter((r) => r.kind === 'nutrition' && r.date === day).reverse().map((r) => ({
      id: r.id, title: r.title, note: r.note, calories: r.values.calories ?? 0, protein: r.values.protein ?? 0, carbs: r.values.carbs ?? 0, fat: r.values.fat ?? 0,
    })),
  ];
  const sum = (k: 'calories' | 'protein' | 'carbs' | 'fat') => meals.reduce((a, m) => a + m[k], 0);
  const grams = { protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat') };
  const energy = grams.protein * 4 + grams.carbs * 4 + grams.fat * 9;
  const share = (g: number, perGram: number) => energy ? Math.round((g * perGram / energy) * 100) : 0;
  const label = shortDate(dayDate(day));

  return <>
    <PageHead title="Nutrition" subtitle="A conversation about what nourishes you.">
      <label className="x-nutrition-day">
        <span>Viewing</span>
        <input type="date" aria-label="Nutrition day" value={day} max={today} onChange={(e) => { if (e.target.value && e.target.value <= today) setDay(e.target.value); }} />
      </label>
      <button className="x-btn ghost" onClick={() => setAdding(true)}><Icon name="plus" />Add manually</button>
    </PageHead>

    <div className="x-nutrition-grid">
      <Card className="x-nutrition-chat">
        <CardHead title="What’s on your plate?"><Soon /></CardHead>
        <p className="x-nutrition-lead">Tell me in your own words. I’ll take care of the numbers.</p>
        <div className="x-nutrition-conversation">
          <div className="x-nutrition-welcome">
            <button className="x-nutrition-talk" aria-label="Voice notes are coming soon" onClick={soon}><span className="x-orb" /></button>
            <h3>Good food. One simple conversation.</h3>
            <p>“I had a chicken bowl with rice and avocado.”</p>
          </div>
        </div>
        <form className="x-nutrition-composer" onSubmit={(e) => { e.preventDefault(); soon(); }}>
          <button type="button" className="x-nutrition-attach" aria-label="Attach a meal photo (coming soon)" title="Attach a meal photo" onClick={soon}><Icon name="camera" /></button>
          <textarea aria-label="Message your nutrition companion" placeholder="I ate…" rows={1} disabled />
          <button type="button" className="x-nutrition-talk is-small" aria-label="Voice notes are coming soon" onClick={soon}><span className="x-orb" /></button>
          <button type="submit" className="x-nutrition-send" aria-label="Send meal"><Icon name="arrow" /></button>
        </form>
        <div className="x-nutrition-connect">
          <button className="x-btn" onClick={() => setAdding(true)}>Add a meal manually</button>
          <p>Or <button className="x-text-button" onClick={() => toast('AI connections are coming soon.')}>connect your AI</button> to describe meals in your own words.</p>
        </div>
      </Card>

      <Card tone="dark" className="x-nutrition-balance">
        <CardHead title={<>Daily balance <span className="x-nutrition-muted">· {meals.length} {meals.length === 1 ? 'entry' : 'entries'}</span></>} />
        <Stat value={fmt(sum('calories'))} unit="/kcal" big={44} />
        <span className="x-caption">{day === today ? 'Today' : label} · estimated from your logged meals</span>
        <div className="x-nutrition-macros">
          <Macro name="Protein" grams={grams.protein} pct={share(grams.protein, 4)} color="var(--x-accent)" />
          <Macro name="Carbs" grams={grams.carbs} pct={share(grams.carbs, 4)} color="var(--x-violet)" />
          <Macro name="Fat" grams={grams.fat} pct={share(grams.fat, 9)} color="var(--x-blue)" />
        </div>
      </Card>

      <Card className="x-nutrition-log">
        <CardHead title={<>Food journal <span className="x-nutrition-muted">· {label}</span></>} />
        {meals.length ? <ul className="x-nutrition-meals" aria-label={`Meals for ${label}`}>
          {meals.map((m) => <li key={m.id} className="x-nutrition-meal">
            <span className="x-nutrition-meal-icon"><Icon name="nutrition" /></span>
            <span className="x-nutrition-meal-copy"><b>{m.title}</b><small>{m.note} · {fmt(m.protein)} g protein</small></span>
            <span className="x-nutrition-kcal"><b>{fmt(m.calories)}</b><small>kcal</small></span>
            {m.sample && <span className="x-badge">Sample</span>}
          </li>)}
        </ul> : <p className="x-empty x-nutrition-empty">No meals logged for {label}. Add one manually to start your food journal.</p>}
      </Card>

      <Card className="x-nutrition-fuel">
        <CardHead title="Fuel for training"><Soon /></CardHead>
        <p className="x-empty">Meal timing matched to your training days: carbs a few hours before a session, protein soon after.</p>
      </Card>
    </div>

    {adding && <AddMeal day={day} onClose={() => setAdding(false)} onSaved={(d) => { setDay(d); setAdding(false); }} />}
  </>;
}

/** 6x4 dot matrix; filled share of 24 dots, column by column from the left, bottom to top. */
function Macro({ name, grams, pct, color }: { name: string; grams: number; pct: number; color: string }) {
  const filled = Math.round((pct / 100) * 24);
  return <div className="x-nutrition-macro">
    <svg viewBox="0 0 41 27" width={47} height={31} role="img" aria-label={`${name}: ${pct}% of energy`}>
      {Array.from({ length: 24 }, (_, k) => {
        const c = Math.floor(k / 4), r = 3 - (k % 4);
        return <circle key={k} cx={2.3 + c * 7.28} cy={2.3 + r * 7.47} r={2.3} fill={k < filled ? color : '#ffffff14'} />;
      })}
    </svg>
    <span><b>{fmt(grams)}<small>g</small></b><small>{name} · {pct}%</small></span>
  </div>;
}

const mealNow = () => { const h = new Date().getHours(); return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 18 ? 'Snack' : 'Dinner'; };
const num = (s: string) => s.trim() === '' ? NaN : Number(s);

function AddMeal({ day, onClose, onSaved }: { day: string; onClose: () => void; onSaved: (day: string) => void }) {
  const [f, setF] = useState({ what: '', meal: mealNow(), day, kcal: '', protein: '0', carbs: '0', fat: '0' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setError(''); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.what.trim()) return setError('Add what you ate.');
    if (!f.kcal.trim()) return setError('Add the meal’s calories.');
    const input = { kind: 'nutrition' as const, date: f.day, title: f.what, note: f.meal, unit: 'kcal',
      values: { calories: num(f.kcal), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) } };
    const problem = validateWellness(input);
    if (problem) return setError(problem);
    try { saveWellnessRecord(input); toast('Meal added to your food journal.'); onSaved(f.day); }
    catch (err) { setError(err instanceof Error ? err.message : 'This meal could not be saved.'); }
  };
  const numberField = (label: string, k: 'kcal' | 'protein' | 'carbs' | 'fat') =>
    <label className="x-field">{label}<input type="number" inputMode="decimal" min={0} max={10000} step="any" value={f[k]} required={k === 'kcal'} onChange={set(k)} /></label>;
  return <Dialog open onClose={onClose} kicker="Nutrition" title="Add a meal">
    <form className="x-nutrition-form" onSubmit={submit} noValidate>
      <p className="x-nutrition-dialog-lead">Enter what you know. Values from a label or another app work best.</p>
      <label className="x-field">What you ate<input value={f.what} maxLength={100} placeholder="e.g. Greek yogurt with berries" required onChange={set('what')} /></label>
      <div className="x-form-grid">
        <label className="x-field">Meal<select value={f.meal} onChange={set('meal')}>{MEALS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="x-field">Day<input type="date" value={f.day} max={wellnessToday()} required onChange={set('day')} /></label>
        {numberField('Calories (kcal)', 'kcal')}
        {numberField('Protein (g)', 'protein')}
        {numberField('Carbs (g)', 'carbs')}
        {numberField('Fat (g)', 'fat')}
      </div>
      {error && <p className="x-nutrition-error" role="alert">{error}</p>}
      <div className="x-nutrition-dialog-foot"><span>Saved to your food journal.</span><button className="x-btn" type="submit">Add meal</button></div>
    </form>
  </Dialog>;
}
