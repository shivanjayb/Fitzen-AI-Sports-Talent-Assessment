import { useEffect, useId, useState, type FormEvent } from 'react';
import { saveWellnessRecord, validateWellness, wellnessToday } from '../../app/wellnessStore';
import { Dialog, Icon, toast } from '../ui';
import { fmt } from '../sample';
import { foodById, scaleFood, searchFoods, totalPortions, type Food } from './nutrition';
import { recognizeFood, type Download, type Prediction } from './recognize';

export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export const mealNow = () => { const h = new Date().getHours(); return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 18 ? 'Snack' : 'Dinner'; };
export const UNSURE = 0.35;
type Item = { key: number; food: Food; servings: number };
let keys = 0;
const item = (food: Food, servings = 1): Item => ({ key: ++keys, food, servings });
const mb = (n: number) => (n / 1e6).toFixed(0);

export function MealEstimate({ day, photo, start = [], unmatched = [], onClose, onSaved }: {
  day: string; photo?: File; start?: { food: Food; servings: number }[]; unmatched?: string[];
  onClose: () => void; onSaved: (day: string) => void;
}) {
  const [items, setItems] = useState<Item[]>(() => start.map((s) => item(s.food, s.servings)));
  const [meal, setMeal] = useState<string>(mealNow);
  const [date, setDate] = useState(day);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [predictions, setPredictions] = useState<Prediction[] | null>(null);
  const [status, setStatus] = useState(photo ? 'Preparing the food model…' : '');
  const listId = useId();

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    let live = true;
    recognizeFood(photo, (d: Download) => { if (live && d.total) setStatus(`Downloading the food model (one time): ${Math.round((d.loaded / d.total) * 100)}% of ${mb(d.total)} MB`); })
      .then((p) => {
        if (!live) return;
        setPredictions(p);
        setStatus((p[0]?.score ?? 0) >= UNSURE ? '' : 'Not sure what this is. Pick the closest match or search below.');
        const top = p[0] && p[0].score >= UNSURE ? foodById(p[0].label) : undefined;
        if (top) setItems((cur) => cur.length ? cur : [item(top)]);
      })
      .catch(() => { if (live) setStatus('Could not run food recognition on this device. Search for the food below instead.'); });
    return () => { live = false; URL.revokeObjectURL(url); };
  }, [photo]);

  const predicted = new Set(predictions?.map((p) => p.label));
  const pick = (food: Food) => { setItems((cur) => [...cur.filter((i) => !predicted.has(i.food.id)), item(food)]); setError(''); };
  const add = (food: Food) => { setItems((cur) => [...cur, item(food)]); setQuery(''); setError(''); };
  const update = (key: number, servings: number) => setItems((cur) => cur.map((i) => i.key === key ? { ...i, servings } : i));
  const remove = (key: number) => setItems((cur) => cur.filter((i) => i.key !== key));
  const total = totalPortions(items);
  const results = searchFoods(query);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!items.length) return setError('Pick at least one food.');
    if (items.some((i) => !(i.servings > 0))) return setError('Each portion must be more than zero.');
    const title = items.map((i) => i.servings === 1 ? i.food.name : `${fmt(Math.round(i.servings * 100) / 100)}× ${i.food.name}`).join(', ');
    const input = { kind: 'nutrition' as const, date, title: title.length > 100 ? `${title.slice(0, 99)}…` : title, note: meal, unit: 'kcal', values: total };
    const problem = validateWellness(input);
    if (problem) return setError(problem);
    try { saveWellnessRecord(input); toast('Meal added to your food journal.'); onSaved(date); }
    catch (err) { setError(err instanceof Error ? err.message : 'This meal could not be saved.'); }
  };

  return <Dialog open onClose={onClose} kicker="Nutrition" title={photo ? 'Estimate from a photo' : 'Check and save your meal'} wide>
    <form className="x-nutrition-form" onSubmit={submit} noValidate>
      {photo && <div className="x-food-photo">
        {preview && <img src={preview} alt="Your meal photo" />}
        <div className="x-food-predict">
          {status && <p className="x-food-status" role="status">{status}</p>}
          {predictions && <div className="x-food-chips" role="group" aria-label="Best guesses from the photo">
            {predictions.map((p) => { const f = foodById(p.label); return f && <button type="button" key={p.label} className="x-chip"
              aria-pressed={items.some((i) => i.food.id === p.label)} onClick={() => pick(f)}>{f.name} · {Math.round(p.score * 100)}%</button>; })}
          </div>}
          <p className="x-food-honest">Estimated from a photo · portion adjustable. One photo cannot measure how much is on the plate, so check the portion.</p>
        </div>
      </div>}

      {unmatched.length > 0 && <p className="x-food-honest" role="status">Not found in the food table: {unmatched.join(', ')}. Search for them below or add them manually.</p>}

      <label className="x-field">Search food
        <input type="search" value={query} placeholder="e.g. roti, dal, paneer, pizza" aria-controls={listId} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {query.trim() && <ul id={listId} className="x-food-results" aria-label="Matching foods">
        {results.length ? results.map((f) => <li key={f.id}><button type="button" onClick={() => add(f)}>
          <b>{f.name}</b><small>{f.serving} · {f.grams} g · {f.kcal} kcal</small><Icon name="plus" />
        </button></li>) : <li className="x-food-none">No match. Try another name or add the meal manually.</li>}
      </ul>}

      {items.length > 0 && <ul className="x-food-items" aria-label="Foods in this meal">
        {items.map((i) => { const p = scaleFood(i.food, i.servings); return <li key={i.key} className="x-food-item">
          <div className="x-food-item-head"><b>{i.food.name}</b><span>{fmt(p.calories)} kcal · P {p.protein} · C {p.carbs} · F {p.fat} g</span>
            <button type="button" className="x-text-button" aria-label={`Remove ${i.food.name}`} onClick={() => remove(i.key)}><Icon name="close" size={14} /></button></div>
          <div className="x-food-portion">
            <label>Servings <small>(1 = {i.food.serving})</small>
              <input type="range" min={0.25} max={3} step={0.25} value={Math.min(3, Math.max(0.25, i.servings))} aria-valuetext={`${i.servings} servings`}
                onChange={(e) => update(i.key, Number(e.target.value))} />
            </label>
            <output>{fmt(Math.round(i.servings * 100) / 100)}×</output>
            <label className="x-field x-food-grams">Grams
              <input type="number" inputMode="decimal" min={1} max={5000} step="any" value={Math.round(i.servings * i.food.grams)}
                onChange={(e) => { const g = Number(e.target.value); if (g > 0) update(i.key, g / i.food.grams); }} />
            </label>
          </div>
        </li>; })}
      </ul>}

      <div className="x-form-grid">
        <label className="x-field">Meal<select value={meal} onChange={(e) => setMeal(e.target.value)}>{MEALS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="x-field">Day<input type="date" value={date} max={wellnessToday()} required onChange={(e) => { if (e.target.value) setDate(e.target.value); }} /></label>
      </div>
      <p className="x-food-total" aria-live="polite"><b>{fmt(total.calories)} kcal</b> · Protein {total.protein} g · Carbs {total.carbs} g · Fat {total.fat} g</p>
      {error && <p className="x-nutrition-error" role="alert">{error}</p>}
      <div className="x-nutrition-dialog-foot"><span>Typical values from USDA and Indian food tables. Your portion and recipe may differ.</span><button className="x-btn" type="submit">Save meal</button></div>
    </form>
  </Dialog>;
}
