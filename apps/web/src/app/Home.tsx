import { t } from './language';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES, EXERCISES, standardReps, type Category, type ExerciseDef } from '@fitzen/engines';
import { getHistory, isEligibleSession, measureOf, SYNCED } from './store';
import { IconChevron, IconSearch } from './icons';
import { ExerciseArt } from './Figure';
import './training-quiet.css';

const MODE = { reps: 'Repetitions', hold: 'Hold', event: 'Power' } as const;
export const LEVEL = ['', 'Beginner', 'Intermediate', 'Advanced'] as const;
export const catLabel = (c: Category) => t(CATEGORIES.find((x) => x.id === c)?.label ?? c);
const PICKS = ['bodyweight-squat', 'countermovement-jump', 'push-up', 'standing-broad-jump', 'plank', 'bench-press', 'power-clean', 'tree-pose'];
const CATS: Category[] = ['calisthenics', 'athletics', 'yoga', 'gym', 'olympic', 'throws', 'sai', 'mobility'];

/** Keep the approved exercise-card structure; its actions use Fitzen's actual routes. */
export function ExerciseCard({ ex }: { ex: ExerciseDef }) {
  const history = getHistory().filter((s) => s.report.exerciseId === ex.id);
  const latest = history.find(isEligibleSession);
  const measured = latest ? measureOf(latest.report) : null;
  const standard = latest && measured?.metric === 'reps' ? standardReps(latest.report) : null;
  const metric = measured?.metric === 'reps' ? (standard === null ? null : { ...measured, value: standard }) : measured;
  return <article className="panel exercise" data-cat={ex.category}>
    <Link to={`/exercise/${ex.id}`} className="exercise-select" aria-label={`${t('Prepare')} ${t(ex.name)}`}>
      <div className="exercise-art has-photo" aria-hidden="true"><ExerciseArt def={ex} /><span className="art-label">{ex.mode === 'hold' ? `${ex.hold?.targetSec ?? 30}s hold` : t(MODE[ex.mode])}</span></div>
      <div className="exercise-body"><h3>{t(ex.name)}</h3><p>{catLabel(ex.category)} · {ex.view === 'front' ? t('Front view') : ex.view === 'side' ? t('Side view') : t('Full body')}</p><div className="row"><span className="tag">{ex.equipment.length ? ex.equipment.map((x) => t(x)).join(', ') : t('No equipment')}</span><span className="exercise-start">{t('Start')} ↗</span></div></div>
    </Link>
    <div className="exercise-card-actions"><Link to={`/history?exercise=${encodeURIComponent(ex.id)}`} aria-label={t('History for {name}', { name: ex.name })}>{t('History')} · {history.length}</Link><small>{metric ? `${t('Latest')} ${Number(metric.value.toFixed(1))} ${metric.unit}` : t('No sessions yet')}</small></div>
  </article>;
}

export default function Home({ search = false }: { search?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [, refresh] = useState(0);
  useEffect(() => { const update = () => refresh(n => n + 1); window.addEventListener(SYNCED, update); return () => window.removeEventListener(SYNCED, update); }, []);
  const category = params.get('type') ?? 'all', query = params.get('q') ?? '', mode = params.get('mode') ?? 'all';
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (!value || value === 'all') next.delete(key); else next.set(key, value); setParams(next, { replace: true }); };
  const needle = query.trim().toLocaleLowerCase();
  const list = [...EXERCISES].sort((a, b) => { const ai = PICKS.indexOf(a.id), bi = PICKS.indexOf(b.id); return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi); }).filter(e => (category === 'all' || e.category === category) && (mode === 'all' || e.mode === mode) && (!needle || [e.name, t(e.name), catLabel(e.category), ...e.muscles, ...e.equipment].some(v => v.toLocaleLowerCase().includes(needle))));
  return <main className="page quiet-train" id="assess">
    <div className="page-head"><div><h1>{t('Find your movement.')}</h1><p>{t('Gym lifts, athletics, yoga and more. One camera. One movement engine.')}</p></div><Link className="btn light" to="/guided">{t('Guided assessment')} <IconChevron /></Link></div>
    <div className="library-toolbar"><div className="segments" role="group" aria-label={t('Exercise category')}><button aria-pressed={category === 'all'} onClick={() => update('type', 'all')}>{t('All movements')}</button>{CATS.map(c => <button key={c} aria-pressed={category === c} onClick={() => update('type', c)}>{catLabel(c)}</button>)}</div><input className="search" autoFocus={search} value={query} onChange={e => update('q', e.target.value)} type="search" aria-label={t('Search movements')} placeholder={t('Search movements…')} /></div>
    <div className="catalog-note"><span>{EXERCISES.length} {t('movements')} · {CATEGORIES.length} {t('disciplines in the working app')}</span><span>{t('Camera · Local video · Demonstrator')}</span></div>
    <details className="movement-options"><summary>{t('Measurement filter')}{mode !== 'all' ? ` · ${t(MODE[mode as keyof typeof MODE] ?? 'All types')}` : ''}</summary><label>{t('Measure')}<select value={mode} onChange={e => update('mode', e.target.value)}><option value="all">{t('All types')}</option>{(['reps', 'hold', 'event'] as const).map(m => <option key={m} value={m}>{t(MODE[m])}</option>)}</select></label></details>
    {list.length ? <div className="grid" id="exercise-grid">{list.map(ex => <ExerciseCard key={ex.id} ex={ex} />)}</div> : <div className="empty"><IconSearch /><h2>{t('No movements found.')}</h2><p>{t('Try another name or choose all movements.')}</p><button className="btn light" onClick={() => setParams({}, { replace: true })}>{t('Clear filters')}</button></div>}
    <p className="photo-credit">{t('Exercise photos: free-exercise-db and credited Wikimedia Commons sources. Missing images use the on-device demonstrator.')}</p><div className="subtle-rule" /><div className="row between"><p className="small">{t('The complete Fitzen exercise catalogue.')}</p><Link className="text-btn" to="/validation">{t('Coach validation')} <IconChevron /></Link></div>
  </main>;
}
