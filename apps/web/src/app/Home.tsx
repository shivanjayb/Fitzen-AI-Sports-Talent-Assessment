import { t } from './language';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, EXERCISES, exerciseById, type Category, type ExerciseDef } from '@fitzen/engines';
import { getHistory, getProfile, isEligibleSession } from './store';
import { IconFlame, IconPlay, IconSearch, IconUser } from './icons';
import ExerciseSheet from './ExerciseSheet';
import Pictogram from './Pictogram';
import Rings from './Rings';

const MODE_LABEL = { reps: 'Reps', hold: 'Hold', event: 'Power' } as const;

export function ExerciseCard({ ex, onOpen }: { ex: ExerciseDef; onOpen: (e: ExerciseDef) => void }) {
  return (
    <button className="press ex-card" data-cat={ex.category} onClick={() => onOpen(ex)} aria-label={`Open ${ex.name}`}>
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
  const history = getHistory().filter(isEligibleSession);

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
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <p className="subtitle">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="large-title">{t(greet)}, {profile.name.split(' ')[0]}</h1>
        </div>
        <Link to="/profile" className="avatar press" aria-label="Profile"><IconUser /></Link>
      </div>

      <section className="glass hero activity">
        <Rings values={[week.length / 3, (avg ?? 0) / 100, streak / 7]} />
        <div className="hero-stats">
          <div className="hero-stat"><span>{t('Sessions this week')}</span><b className="num">{week.length}<small>/3</small></b></div>
          <div className="hero-stat"><span>{t('Avg form score')}</span><b className="num">{avg ?? '—'}<small>/100</small></b></div>
          <div className="hero-stat"><span>{t('Day streak')}</span><b className="num">{streak}<IconFlame /></b></div>
        </div>
      </section>
      {last && <button className="btn block press" style={{ marginTop: 10 }} onClick={() => setOpen(last)}><IconPlay /> Go again: {last.name}</button>}

      <Link to="/guided" className="feature press">
        <span className="feature-kicker">{t('Guided assessment')}</span>
        <b>Jump, squat, push-up, plank</b>
        <p>Four consistent tests with protocol, framing check and an eligible attempt. {EXERCISES.length} exercises measured on your device; video never leaves it.</p>
        <span className="btn primary">{t('Start guided assessment')}</span>
      </Link>
      <Link className="see-all" style={{ display: 'inline-block', marginTop: 10 }} to="/validation">{t('Coach validation')} ›</Link>
      <label className="glass search">
        <IconSearch />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search squat, javelin, glutes…')} aria-label="Search exercises" />
      </label>

      <div className="chips" role="tablist">
        <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>

      {(cat === 'all' && !q ? CATEGORIES : [{ id: cat, label: q ? 'Results' : CATEGORIES.find((c) => c.id === cat)?.label ?? '', icon: '' }]).map((c) => {
        const shelf = cat === 'all' && !q;
        const items = shelf ? list.filter((e) => e.category === c.id) : list;
        if (!items.length) return null;
        return (
          <section key={c.id}>
            <h2 className="section-title">{c.label}{shelf ? <button className="see-all" onClick={() => setCat(c.id as Category)}>See All</button> : <small>{items.length}</small>}</h2>
            <div className={shelf ? 'shelf' : 'grid'}>{items.map((e) => <ExerciseCard key={e.id} ex={e} onOpen={setOpen} />)}</div>
          </section>
        );
      })}
      {!list.length && <div className="empty"><div className="big"><IconSearch /></div>No exercise matches “{q}”.</div>}

      {open && <ExerciseSheet ex={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
