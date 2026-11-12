import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { deleteWellnessRecord, getWellnessRecords, restoreWellnessRecord, saveWellnessRecord, saveWellnessRecords, subscribeWellness, validateWellness, wellnessToday, type WellnessRecord } from '../app/wellnessStore';
import { Card, CardHead, Dialog, Icon, PageHead, Soon, Stat, toast } from './ui';
import { MEALS, MealEstimate, mealNow } from './food/MealEstimate';
import { parseMeal, type Food } from './food/nutrition';
import { fmt, shortDate, useSampleMode } from './sample';
import './nutrition.css';

interface Meal { id: string; title: string; note: string; calories: number; protein: number; carbs: number; fat: number; sample?: boolean }
const SAMPLE: Meal[] = [
  { id: 's1', title: 'Greek yogurt with berries and granola', note: 'Breakfast', calories: 340, protein: 26, carbs: 45, fat: 12, sample: true },
  { id: 's2', title: 'Chicken wrap', note: 'Lunch', calories: 520, protein: 34, carbs: 52, fat: 18, sample: true },
  { id: 's3', title: 'Salmon, rice and greens', note: 'Dinner', calories: 640, protein: 42, carbs: 45, fat: 21, sample: true },
];
const soon = () => toast('Voice notes are coming soon. Type what you ate or snap a photo.');
const dayDate = (d: string) => new Date(`${d}T12:00:00`);
const prevDay = (d: string) => { const x = dayDate(d); x.setDate(x.getDate() - 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const MAX_PHOTO = 25e6; // larger files are camera RAW or panoramas; decoding them can exhaust a phone's memory

export default function Nutrition() {
  const sample = useSampleMode();
  const today = wellnessToday();
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState<Meal | true | null>(null);
  const [records, setRecords] = useState(getWellnessRecords);
  const [estimate, setEstimate] = useState<{ photo?: File; start?: { food: Food; servings: number }[]; unmatched?: string[] } | null>(null);
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const closeEstimate = useCallback(() => setEstimate(null), []);
  const describe = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return toast('Type what you ate, e.g. “2 roti and dal”.');
    const { items, unmatched } = parseMeal(text);
    if (!items.length) return toast('No foods recognised. Try simpler names, search, or add the meal manually.');
    setEstimate({ start: items, unmatched });
  };
  useEffect(() => subscribeWellness(() => setRecords(getWellnessRecords())), []);

  const logged = (d: string) => records.filter((r) => r.kind === 'nutrition' && r.date === d);
  const yesterday = logged(prevDay(day));
  const remove = (m: Meal) => {
    const record = records.find((r) => r.id === m.id); if (!record) return;
    try { deleteWellnessRecord(record.id); toast('Meal deleted.', { label: 'Undo', run: () => { try { restoreWellnessRecord(record); } catch (e) { toast(e instanceof Error ? e.message : 'Could not restore.'); } } }); }
    catch (e) { toast(e instanceof Error ? e.message : 'This meal could not be deleted.'); }
  };
  const copyYesterday = () => {
    try {
      const made = saveWellnessRecords(yesterday.map(({ kind, title, note, unit, values }: WellnessRecord) => ({ kind, date: day, title, note, unit, values })));
      toast(`Copied ${made.length} meal${made.length === 1 ? '' : 's'} from ${shortDate(dayDate(prevDay(day)))}.`, { label: 'Undo', run: () => made.forEach((r) => deleteWellnessRecord(r.id)) });
    } catch (e) { toast(e instanceof Error ? e.message : 'Meals could not be copied.'); }
  };

  const meals: Meal[] = [
    ...(sample && day === today ? SAMPLE : []),
    ...logged(day).reverse().map((r) => ({
      id: r.id, title: r.title, note: r.note, calories: r.values.calories ?? 0, protein: r.values.protein ?? 0, carbs: r.values.carbs ?? 0, fat: r.values.fat ?? 0,
    })),
  ];
  const sum = (k: 'calories' | 'protein' | 'carbs' | 'fat') => meals.reduce((a, m) => a + m[k], 0);
  const grams = { protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat') };
  const energy = grams.protein * 4 + grams.carbs * 4 + grams.fat * 9;
  const share = (g: number, perGram: number) => energy ? Math.round((g * perGram / energy) * 100) : 0;
  const label = shortDate(dayDate(day));
  const vitals = records.find((r) => r.kind === 'vitals' && r.date === day && (r.values.burned ?? r.values.active) !== undefined);
  const burned = vitals ? (vitals.values.burned ?? vitals.values.active ?? 0) : null;
  const burnLabel = vitals?.values.burned !== undefined ? 'burned' : 'active energy'; // active alone excludes resting energy, so don't call it total burn

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
        <CardHead title="What’s on your plate?" />
        <p className="x-nutrition-lead">Snap a photo or type what you ate. Numbers come from a food table, and you check the portion before saving.</p>
        <div className="x-nutrition-conversation">
          <div className="x-nutrition-welcome">
            <button className="x-nutrition-talk" aria-label="Voice notes are coming soon" onClick={soon}><span className="x-orb" /></button>
            <h3>Good food. One simple conversation.</h3>
            <p>“2 roti, dal and a bowl of curd.”</p>
          </div>
        </div>
        <form className="x-nutrition-composer" onSubmit={describe}>
          <button type="button" className="x-nutrition-attach" aria-label="Snap or upload a meal photo" title="Snap or upload a meal photo" onClick={() => fileRef.current?.click()}><Icon name="camera" /></button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => {
            const photo = e.target.files?.[0]; e.target.value = '';
            if (photo && photo.size > MAX_PHOTO) toast('This photo is over 25 MB. Take a new photo or choose a smaller one.');
            else if (photo?.type.startsWith('image/')) setEstimate({ photo }); else if (photo) toast('Choose an image file.');
          }} />
          <textarea aria-label="What you ate" placeholder="I ate…" rows={1} value={text} maxLength={500} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
          <button type="button" className="x-nutrition-talk is-small" aria-label="Voice notes are coming soon" onClick={soon}><span className="x-orb" /></button>
          <button type="submit" className="x-nutrition-send" aria-label="Send meal"><Icon name="arrow" /></button>
        </form>
        <div className="x-nutrition-connect">
          <button className="x-btn" onClick={() => setAdding(true)}>Add a meal manually</button>
          <button className="x-btn ghost" onClick={() => setEstimate({})}><Icon name="search" />Search food</button>
        </div>
      </Card>

      <Card tone="dark" className="x-nutrition-balance">
        <CardHead title={<>Daily balance <span className="x-nutrition-muted">· {meals.length} {meals.length === 1 ? 'entry' : 'entries'}</span></>} />
        <Stat value={fmt(sum('calories'))} unit="/kcal" big={44} />
        <span className="x-caption">{day === today ? 'Today' : label} · estimated from your logged meals</span>
        {burned !== null && <span className="x-caption">Eaten {fmt(sum('calories'))} vs {burnLabel} {fmt(burned)} kcal · {sum('calories') >= burned ? `${fmt(sum('calories') - burned)} over` : `${fmt(burned - sum('calories'))} under`}</span>}
        <div className="x-nutrition-macros">
          <Macro name="Protein" grams={grams.protein} pct={share(grams.protein, 4)} color="var(--x-accent)" />
          <Macro name="Carbs" grams={grams.carbs} pct={share(grams.carbs, 4)} color="var(--x-violet)" />
          <Macro name="Fat" grams={grams.fat} pct={share(grams.fat, 9)} color="var(--x-blue)" />
        </div>
      </Card>

      <Card className="x-nutrition-log">
        <CardHead title={<>Food journal <span className="x-nutrition-muted">· {label}</span></>}>
          {yesterday.length > 0 && <button type="button" className="x-text-button" onClick={copyYesterday}>Copy previous day</button>}
        </CardHead>
        {meals.length ? <ul className="x-nutrition-meals" aria-label={`Meals for ${label}`}>
          {meals.map((m) => <li key={m.id} className="x-nutrition-meal">
            <span className="x-nutrition-meal-icon"><Icon name="nutrition" /></span>
            <span className="x-nutrition-meal-copy"><b>{m.title}</b><small>{m.note} · {fmt(m.protein)} g protein</small></span>
            <span className="x-nutrition-kcal"><b>{fmt(m.calories)}</b><small>kcal</small></span>
            {m.sample ? <span className="x-badge">Sample</span> : <>
              <button type="button" className="x-icon-btn small" aria-label={`Edit ${m.title}`} title="Edit or change portion" onClick={() => setAdding(m)}><Icon name="pencil" /></button>
              <button type="button" className="x-icon-btn small" aria-label={`Delete ${m.title}`} title="Delete" onClick={() => remove(m)}><Icon name="close" /></button>
            </>}
          </li>)}
        </ul> : <p className="x-empty x-nutrition-empty">No meals logged for {label}. Add one manually to start your food journal.</p>}
      </Card>

      <Card className="x-nutrition-fuel">
        <CardHead title="Fuel for training"><Soon /></CardHead>
        <p className="x-empty">Meal timing matched to your training days: carbs a few hours before a session, protein soon after.</p>
      </Card>
    </div>

    {estimate && <MealEstimate day={day} {...estimate} onClose={closeEstimate} onSaved={(d) => { setDay(d); setEstimate(null); setText(''); }} />}
    {adding && <AddMeal day={day} edit={adding === true ? undefined : adding} onClose={() => setAdding(null)} onSaved={(d) => { setDay(d); setAdding(null); }} />}
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

const num = (s: string) => s.trim() === '' ? NaN : Number(s);

const str = (n: number) => String(Math.round(n * 10) / 10);
/** Add a meal, or edit a saved one: its values can be typed or scaled by a portion factor from what was saved. */
function AddMeal({ day, edit, onClose, onSaved }: { day: string; edit?: Meal; onClose: () => void; onSaved: (day: string) => void }) {
  const [f, setF] = useState(edit
    ? { what: edit.title, meal: (MEALS as readonly string[]).includes(edit.note) ? edit.note : mealNow(), day, kcal: str(edit.calories), protein: str(edit.protein), carbs: str(edit.carbs), fat: str(edit.fat) }
    : { what: '', meal: mealNow(), day, kcal: '', protein: '0', carbs: '0', fat: '0' });
  const [portion, setPortion] = useState('1');
  const scale = (v: string) => {
    setPortion(v); const k = Number(v);
    if (edit && k > 0) setF({ ...f, kcal: str(edit.calories * k), protein: str(edit.protein * k), carbs: str(edit.carbs * k), fat: str(edit.fat * k) });
  };
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setError(''); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.what.trim()) return setError('Add what you ate.');
    if (!f.kcal.trim()) return setError('Add the meal’s calories.');
    const input = { id: edit?.id, kind: 'nutrition' as const, date: f.day, title: f.what, note: f.meal, unit: 'kcal',
      values: { calories: num(f.kcal), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) } };
    const problem = validateWellness(input);
    if (problem) return setError(problem);
    try { saveWellnessRecord(input); toast(edit ? 'Meal updated.' : 'Meal added to your food journal.'); onSaved(f.day); }
    catch (err) { setError(err instanceof Error ? err.message : 'This meal could not be saved.'); }
  };
  const numberField = (label: string, k: 'kcal' | 'protein' | 'carbs' | 'fat') =>
    <label className="x-field">{label}<input type="number" inputMode="decimal" min={0} max={10000} step="any" value={f[k]} required={k === 'kcal'} onChange={set(k)} /></label>;
  return <Dialog open onClose={onClose} kicker="Nutrition" title={edit ? 'Edit meal' : 'Add a meal'}>
    <form className="x-nutrition-form" onSubmit={submit} noValidate>
      <p className="x-nutrition-dialog-lead">Enter what you know. Values from a label or another app work best.</p>
      <label className="x-field">What you ate<input value={f.what} maxLength={100} placeholder="e.g. Greek yogurt with berries" required onChange={set('what')} /></label>
      <div className="x-form-grid">
        <label className="x-field">Meal<select value={f.meal} onChange={set('meal')}>{MEALS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="x-field">Day<input type="date" value={f.day} max={wellnessToday()} required onChange={set('day')} /></label>
        {edit && <label className="x-field">Portion (× as saved)<input type="number" inputMode="decimal" min={0.1} max={10} step={0.25} value={portion} onChange={(e) => scale(e.target.value)} /></label>}
        {numberField('Calories (kcal)', 'kcal')}
        {numberField('Protein (g)', 'protein')}
        {numberField('Carbs (g)', 'carbs')}
        {numberField('Fat (g)', 'fat')}
      </div>
      {error && <p className="x-nutrition-error" role="alert">{error}</p>}
      <div className="x-nutrition-dialog-foot"><span>Saved to your food journal.</span><button className="x-btn" type="submit">{edit ? 'Save changes' : 'Add meal'}</button></div>
    </form>
  </Dialog>;
}
