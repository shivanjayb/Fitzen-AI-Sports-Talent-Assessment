import { t } from './language';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES, EXERCISES, exerciseById, standardReps, type Category, type ExerciseDef } from '@fitzen/engines';
import { getHistory, isEligibleSession, measureOf, SYNCED } from './store';
import { IconChevron, IconFlag, IconHistory, IconSearch, IconTrophy } from './icons';
import { ExerciseArt } from './Figure';
import { PageHeader } from './Shell';
import './training-quiet.css';

const MODE = { reps: 'Reps', hold: 'Hold', event: 'Power' } as const;
export const LEVEL = ['', 'Beginner', 'Intermediate', 'Advanced'] as const;
export const catLabel = (c: Category) => t(CATEGORIES.find((x) => x.id === c)?.label ?? c);
const badgeOf = (ex: ExerciseDef) => ex.mode === 'hold' ? `${t('Hold')} · ${ex.hold?.targetSec ?? 30} s` : t(MODE[ex.mode]);

/** The same exercise card leads to setup and its own recorded history. */
export function ExerciseCard({ ex }: { ex: ExerciseDef }) {
  const latest = getHistory().find((s) => s.report.exerciseId === ex.id && isEligibleSession(s));
  const measured = latest ? measureOf(latest.report) : null;
  const standard = latest && measured?.metric === 'reps' ? standardReps(latest.report) : null;
  const metric = measured?.metric === 'reps' ? (standard === null ? null : { ...measured, value: standard }) : measured;
  return (
    <article className="training-card" data-cat={ex.category}>
      <Link to={`/exercise/${ex.id}`} className="ex-card press">
        <div className="art"><ExerciseArt def={ex} /><span className="badge">{badgeOf(ex)}</span></div>
        <div className="training-card-copy">
          <h3 className="ex-name">{t(ex.name)}</h3>
          <p className="ex-meta">{catLabel(ex.category)} · {t(LEVEL[ex.difficulty])}</p>
          <p className="training-equipment">{ex.equipment.length ? ex.equipment.map((x) => t(x)).join(', ') : t('No equipment')}</p>
        </div>
      </Link>
      <div className="training-card-foot">
        <span>{metric ? `${t(metric.metric === 'reps' ? 'Standard' : 'Latest')}: ${Number(metric.value.toFixed(1))} ${metric.unit}` : t('No assessment yet')}</span>
        <Link to={`/history?exercise=${encodeURIComponent(ex.id)}`} aria-label={t('History for {name}', { name: ex.name })}>{t('History')}<IconChevron /></Link>
      </div>
    </article>
  );
}

export default function Home({ search = false }: { search?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    window.addEventListener(SYNCED, update);
    return () => window.removeEventListener(SYNCED, update);
  }, []);
  const category = params.get('type') ?? 'all';
  const query = params.get('q') ?? '';
  const mode = params.get('mode') ?? 'all';
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };
  const allHistory = getHistory().filter(isEligibleSession);
  const recent = [...new Set(allHistory.map((s) => s.report.exerciseId))].map(exerciseById).filter((e): e is ExerciseDef => !!e).slice(0, 3);
  const needle = query.trim().toLocaleLowerCase();
  const list = EXERCISES.filter((e) => (category === 'all' || e.category === category) && (mode === 'all' || e.mode === mode) &&
    (!needle || [e.name, t(e.name), catLabel(e.category), ...e.muscles, ...e.equipment].some((v) => v.toLocaleLowerCase().includes(needle))));
  const filtered = category !== 'all' || !!query || mode !== 'all';

  return (
    <main className="page quiet-train">
      <PageHeader title={t(search ? 'Search exercises' : 'Train')}>
        <Link to="/history" className="btn training-history"><IconHistory />{t('History')}</Link>
      </PageHeader>
      {!search && <section className="training-start">
        <div>
          <h2>{t(allHistory.length ? 'Make your next attempt count.' : 'Your first assessment starts here.')}</h2>
          <p>{t('Jump, squat, push-up and plank. Four guided tests, with a camera check before each one.')}</p>
          <div className="row"><Link to="/guided" className="btn primary press"><IconFlag />{t(allHistory.length ? 'Start guided assessment' : 'Start your first assessment')}</Link><span className="muted">{t('No account needed. Video stays on your device.')}</span></div>
        </div>
        <div className="training-protocol" aria-label={t('Four guided tests')}><span>{t('Jump')}</span><span>{t('Squat')}</span><span>{t('Push-up')}</span><span>{t('Plank')}</span></div>
      </section>}

      {!search && !filtered && recent.length > 0 && <section aria-labelledby="recent-title">
        <h2 className="section-title" id="recent-title">{t('Continue training')}<Link to="/history" className="see-all">{t('View history')}</Link></h2>
        <div className="training-grid recent-grid">{recent.map((e) => <ExerciseCard key={e.id} ex={e} />)}</div>
      </section>}

      <section aria-labelledby="library-title" className="training-library">
        <div className="training-library-head"><div><h2 id="library-title">{t('Movement library')}</h2><p className="muted">{t('Find your movement. Learn the setup. Measure your form.')}</p></div>
          <label className="search"><IconSearch /><input autoFocus={search} type="search" value={query} onChange={(e) => updateFilter('q', e.target.value)} placeholder={t('Search exercises or equipment')} aria-label={t('Search exercises')} /></label>
        </div>
        <div className="training-filters">
          <div className="chips" role="group" aria-label={t('Exercise categories')}>
            <button className={`chip ${category === 'all' ? 'on' : ''}`} aria-pressed={category === 'all'} onClick={() => updateFilter('type', 'all')}>{t('All movements')}</button>
            {CATEGORIES.map((c) => <button key={c.id} className={`chip ${category === c.id ? 'on' : ''}`} aria-pressed={category === c.id} onClick={() => updateFilter('type', c.id)}>{catLabel(c.id)}</button>)}
          </div>
          <label className="training-mode">{t('Measure')}<select value={mode} onChange={(e) => updateFilter('mode', e.target.value)}><option value="all">{t('All types')}</option>{(['reps', 'hold', 'event'] as const).map((m) => <option key={m} value={m}>{t(MODE[m])}</option>)}</select></label>
        </div>
        <p className="training-count" role="status">{t('{n} exercises', { n: list.length })}{filtered && <button className="training-reset" onClick={() => setParams({}, { replace: true })}>{t('Clear filters')}</button>}</p>
        {list.length ? <div className="training-grid">{list.map((e) => <ExerciseCard key={e.id} ex={e} />)}</div> : <div className="empty"><IconSearch /><h3>{t('No matching exercises')}</h3><p>{t('Try another name or clear the filters to browse every movement.')}</p><button className="btn" onClick={() => setParams({}, { replace: true })}>{t('Clear filters')}</button></div>}
      </section>

      <nav className="rows training-tools" aria-label={t('Training tools')}>
        <Link to="/validation"><span className="ic"><IconTrophy /></span>{t('Coach validation')}<IconChevron /></Link>
      </nav>
    </main>
  );
}
