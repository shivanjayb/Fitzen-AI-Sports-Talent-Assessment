import { t } from './language';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES, EXERCISES, exerciseById, type Category, type ExerciseDef } from '@fitzen/engines';
import { getHistory, isEligibleSession } from './store';
import { IconChevron, IconFlag, IconHistory, IconSearch, IconTrophy } from './icons';
import { ExerciseArt } from './Figure';
import { PageHeader } from './Shell';
import { LESSONS } from './lessons';

const MODE = { reps: 'Reps', hold: 'Hold', event: 'Power' } as const;
export const LEVEL = ['', 'Beginner', 'Intermediate', 'Advanced'] as const;
export const catLabel = (c: Category) => t(CATEGORIES.find((x) => x.id === c)?.label ?? c);
const badgeOf = (ex: ExerciseDef) => ex.mode === 'hold' ? `${t('Hold')} · ${ex.hold?.targetSec ?? 30} s` : t(MODE[ex.mode]);
/** Representative exercise drawn on each workout-type tile. */
const TYPE_ART: Record<Category, string> = {
  gym: 'back-squat', calisthenics: 'push-up', athletics: 'sprint-start-set', throws: 'fast-bowling-delivery',
  olympic: 'split-jerk', sai: 'sai-vertical-jump', yoga: 'warrior-i', mobility: 'deep-squat-hold',
};

/** Workout card: artwork with a mode badge, title, then type and level. */
export function ExerciseCard({ ex }: { ex: ExerciseDef }) {
  return (
    <Link to={`/exercise/${ex.id}`} className="ex-card press" data-cat={ex.category}>
      <div className="art">
        <ExerciseArt def={ex} />
        <span className="badge">{badgeOf(ex)}</span>
      </div>
      <div className="ex-name">{ex.name}</div>
      <div className="ex-meta">{catLabel(ex.category)} · {t(LEVEL[ex.difficulty])}</div>
    </Link>
  );
}

interface Slide { ex: ExerciseDef; kicker: string; title: string; text: string; go: string; more?: string }

function Featured({ slides }: { slides: Slide[] }) {
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false);
  const to = (n: number) => { const el = box.current; if (el) el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' }); };
  useEffect(() => {
    if (held || slides.length < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setTimeout(() => to((i + 1) % slides.length), 7000);
    return () => clearTimeout(id);
  }, [i, held, slides.length]);
  return (
    <section aria-roledescription="carousel" aria-label={t("Featured")} onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <div ref={box} className="featured" onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>
        {slides.map((s, n) => (
          <article key={s.title} className="feat" data-cat={s.ex.category} aria-roledescription="slide" aria-label={`${n + 1} of ${slides.length}`}>
            <ExerciseArt def={s.ex} play={n === i} w={800} h={640} />
            <div className="feat-body on-media">
              <span className="feat-kicker">{s.kicker}</span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
              <div className="row">
                <button className="btn primary press" onClick={() => nav(s.go)}>{t("Let's Go")}</button>
                {s.more && <button className="btn press" onClick={() => nav(s.more!)}>{t("Details")}</button>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="pager">{slides.map((s, n) => <button key={s.title} className={n === i ? 'on' : ''} onClick={() => to(n)} aria-label={`Show slide ${n + 1}`} aria-current={n === i} />)}</div>
    </section>
  );
}

const byId = (id: string) => exerciseById(id) ?? EXERCISES[0]!;
const LESSON_PICKS = ['back-squat', 'push-up', 'countermovement-jump', 'fast-bowling-delivery', 'power-clean', 'warrior-ii', 'pull-up', 'sai-sit-and-reach', 'boxing-straight-punch', 'deep-squat-hold'];
const Cards = ({ list, shelf = true }: { list: ExerciseDef[]; shelf?: boolean }) => <div className={shelf ? 'shelf' : 'grid'}>{list.map((e) => <ExerciseCard key={e.id} ex={e} />)}</div>;

/** Lesson cards open the exercise page at its video lesson. */
const LessonShelf = ({ list }: { list: ExerciseDef[] }) => (
  <div className="shelf lessons">
    {list.map((ex) => (
      <Link key={ex.id} to={`/exercise/${ex.id}#lesson`} className="ex-card press" data-cat={ex.category}>
        <div className="art"><ExerciseArt def={ex} /><span className="play small" aria-hidden><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z" /></svg></span></div>
        <div className="ex-name">{LESSONS[ex.id]!.title}</div>
        <div className="ex-meta">{LESSONS[ex.id]!.channel} · {ex.name}</div>
      </Link>
    ))}
  </div>
);

function TypePage({ type }: { type: Category }) {
  const [mode, setMode] = useState<ExerciseDef['mode'] | 'all'>('all');
  const all = EXERCISES.filter((e) => e.category === type);
  const list = all.filter((e) => mode === 'all' || e.mode === mode);
  const modes = (['reps', 'hold', 'event'] as const).filter((m) => all.some((e) => e.mode === m));
  return (
    <main className="page" data-cat={type}>
      <PageHeader title={catLabel(type)} back />
      <p className="muted" style={{ margin: '6px 0 0' }}>{t('{n} exercises, each measured joint by joint.', { n: all.length })}</p>
      {modes.length > 1 && (
        <div className="chips" role="group" aria-label={t("Filter")}>
          <button className={`chip ${mode === 'all' ? 'on' : ''}`} aria-pressed={mode === 'all'} onClick={() => setMode('all')}>{t('All')}</button>
          {modes.map((m) => <button key={m} className={`chip ${mode === m ? 'on' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>{t(MODE[m])}</button>)}
        </div>
      )}
      <div style={{ marginTop: 18 }}><Cards list={list} shelf={false} /></div>
    </main>
  );
}

function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? EXERCISES.filter((e) => e.name.toLowerCase().includes(s) || e.muscles.some((m) => m.toLowerCase().includes(s)) || catLabel(e.category).toLowerCase().includes(s) || e.equipment.some((x) => x.toLowerCase().includes(s))) : [];
  }, [q]);
  return (
    <main className="page">
      <PageHeader title={t('Search')} />
      <label className="search">
        <IconSearch />
        <input autoFocus type="search" value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} placeholder={t('Search squat, javelin, glutes…')} aria-label={t("Search exercises")} />
      </label>
      {!q && <>
        <h2 className="section-title">{t("Browse")}</h2>
        <div className="types">{CATEGORIES.map((c) => <TypeTile key={c.id} type={c.id} />)}</div>
      </>}
      {q && (list.length
        ? <><h2 className="section-title">{t("Results")}<small>{list.length}</small></h2><Cards list={list} shelf={false} /></>
        : <div className="empty"><div className="big"><IconSearch /></div>{t('No exercise matches “{q}”.', { q })}</div>)}
    </main>
  );
}

function TypeTile({ type }: { type: Category }) {
  const [, setParams] = useSearchParams();
  const nav = useNavigate();
  const n = EXERCISES.filter((e) => e.category === type).length;
  return (
    <button className="type-tile press" data-cat={type} onClick={() => (location.pathname === '/app' ? setParams({ type }) : nav(`/app?type=${type}`))}>
      <div className="art"><ExerciseArt def={byId(TYPE_ART[type])} /></div>
      <span className="label"><b>{catLabel(type)}</b><small>{n} {t('exercises')}</small></span>
    </button>
  );
}

export default function Home({ search = false }: { search?: boolean }) {
  const [params] = useSearchParams();
  const type = params.get('type') as Category | null;
  const history = getHistory().filter(isEligibleSession);
  if (search) return <SearchPage />;
  if (type && CATEGORIES.some((c) => c.id === type)) return <TypePage type={type} />;

  const recent = [...new Set(history.map((s) => s.report.exerciseId))].map((id) => exerciseById(id)).filter((e): e is ExerciseDef => !!e).slice(0, 10);
  const last = recent[0];
  const slides: Slide[] = [
    { ex: byId('countermovement-jump'), kicker: t('Guided assessment'), title: t('Jump, squat, push-up, plank'), text: t('Four tests with a protocol, a framing check and an eligible attempt. Measured on your device; video never leaves it.'), go: '/guided' },
    last
      ? { ex: last, kicker: t('Go again'), title: last.name, text: last.summary, go: `/train/${last.id}?src=camera`, more: `/exercise/${last.id}` }
      : { ex: byId('back-squat'), kicker: t('Featured'), title: 'Back Squat', text: byId('back-squat').summary, go: '/train/back-squat?src=camera', more: '/exercise/back-squat' },
    { ex: byId('fast-bowling-delivery'), kicker: t('Throws & Strikes'), title: t('Fast bowling'), text: t('Front-knee brace, arm path and trunk flexion, read from your own delivery.'), go: '/train/fast-bowling-delivery?src=camera', more: '/exercise/fast-bowling-delivery' },
    { ex: byId('warrior-i'), kicker: t('Yoga'), title: 'Warrior I', text: byId('warrior-i').summary, go: '/train/warrior-i?src=camera', more: '/exercise/warrior-i' },
  ];
  const lessons = LESSON_PICKS.map(byId).filter((e) => LESSONS[e.id]);

  return (
    <main className="page">
      <PageHeader title={t('Train')} />
      <Featured slides={slides} />

      {recent.length > 0 && <><h2 className="section-title">{t("Recently Trained")}</h2><Cards list={recent} /></>}

      <h2 className="section-title">{t("Workout Types")}</h2>
      <div className="types">{CATEGORIES.map((c) => <TypeTile key={c.id} type={c.id} />)}</div>

      {lessons.length > 0 && <><h2 className="section-title">{t("Learn the Technique")}<small>{t("video lessons")}</small></h2><LessonShelf list={lessons} /></>}

      {CATEGORIES.map((c) => (
        <section key={c.id}>
          <h2 className="section-title">{c.label}<Link className="see-all" to={`/app?type=${c.id}`}>{t('See All')}</Link></h2>
          <Cards list={EXERCISES.filter((e) => e.category === c.id)} />
        </section>
      ))}

      <h2 className="section-title">{t("More")}</h2>
      <nav className="rows" aria-label={t("More")}>
        <Link to="/guided"><span className="ic"><IconFlag /></span>{t('Guided assessment')}<IconChevron /></Link>
        <Link to="/history"><span className="ic"><IconHistory /></span>{t('History')}<IconChevron /></Link>
        <Link to="/validation"><span className="ic"><IconTrophy /></span>{t('Coach validation')}<IconChevron /></Link>
      </nav>
    </main>
  );
}
