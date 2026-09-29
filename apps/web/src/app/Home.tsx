import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, EXERCISES, exerciseById, type Category, type ExerciseDef } from '@fitzen/engines';
import { getHistory, getProfile, glow } from './store';
import { IconFlame, IconPlay, IconSearch, IconUser } from './icons';
import ExerciseSheet from './ExerciseSheet';
import Pictogram from './Pictogram';

const MODE_LABEL = { reps: 'Reps', hold: 'Hold', event: 'Power' } as const;

export function ExerciseCard({ ex, onOpen }: { ex: ExerciseDef; onOpen: (e: ExerciseDef) => void }) {
  return (
    <button className="glass press ex-card" onPointerMove={glow} onClick={() => onOpen(ex)} aria-label={`Open ${ex.name}`}>
      <Pictogram def={ex} />
      <div className="ex-name">{ex.name}</div>
      <div className="ex-meta">
        <span className={`tag ${ex.mode}`}>{MODE_LABEL[ex.mode]}</span>
        <span className="tag">{ex.camera === 'side' ? 'Side view' : 'Front view'}</span>
        <span className="dots" aria-label={`Difficulty ${ex.difficulty} of 3`}>{[1, 2, 3].map((d) => <i key={d} className={d <= ex.difficulty ? 'on' : ''} />)}</span>
      </div>
    </button>
  );
}

export default function Home() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [open, setOpen] = useState<ExerciseDef | null>(null);
  const profile = getProfile();
  const history = getHistory();

  const week = history.filter((s) => Date.now() - Date.parse(s.report.startedAt) < 7 * 864e5);
  const avg = week.length ? Math.round(week.reduce((a, s) => a + s.report.formScore, 0) / week.length) : null;
  const streak = useMemo(() => {
    const days = new Set(history.map((s) => new Date(s.report.startedAt).toDateString()));
    let n = 0; const d = new Date();
    while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }, [history]);
  const last = history[0] ? exerciseById(history[0].report.exerciseId) : undefined;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return EXERCISES.filter((e) => (cat === 'all' || e.category === cat) &&
      (!s || e.name.toLowerCase().includes(s) || e.muscles.some((m) => m.toLowerCase().includes(s)) || e.category.includes(s)));
  }, [q, cat]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <main className="page">
      <div className="row between">
        <div>
          <Link to="/" className="home-brand" aria-label="Fitzen home" translate="no">FITZEN</Link>
          <p className="subtitle">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="large-title">{greet}, {profile.name.split(' ')[0]}</h1>
        </div>
        <Link to="/profile" className="btn icon glass press" aria-label="Profile"><IconUser /></Link>
      </div>

      <section className="glass hero" onPointerMove={glow}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>Your movement lab</div>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.9rem', maxWidth: 440 }}>
              {EXERCISES.length} exercises, measured joint-by-joint on your device. Video never leaves your phone.
            </p>
          </div>
          {last && <button className="btn primary press" onClick={() => setOpen(last)}><IconPlay /> Go again</button>}
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><b className="num">{week.length}</b><span>Sessions this week</span></div>
          <div className="hero-stat"><b className="num">{avg ?? '—'}</b><span>Avg form score</span></div>
          <div className="hero-stat"><b className="num">{streak}<IconFlame /></b><span>Day streak</span></div>
        </div>
      </section>

      <label className="glass search">
        <IconSearch />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search squat, javelin, glutes…" aria-label="Search exercises" />
      </label>

      <div className="chips" role="tablist">
        <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>

      {(cat === 'all' && !q ? CATEGORIES : [{ id: cat, label: q ? 'Results' : CATEGORIES.find((c) => c.id === cat)?.label ?? '', icon: '' }]).map((c) => {
        const items = cat === 'all' && !q ? list.filter((e) => e.category === c.id) : list;
        if (!items.length) return null;
        return (
          <section key={c.id}>
            <h2 className="section-title">{c.label}<small>{items.length}</small></h2>
            <div className="grid">{items.map((e) => <ExerciseCard key={e.id} ex={e} onOpen={setOpen} />)}</div>
          </section>
        );
      })}
      {!list.length && <div className="empty"><div className="big"><IconSearch /></div>No exercise matches “{q}”.</div>}

      {open && <ExerciseSheet ex={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
