import { t, setupFor } from './language';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { EXERCISES, exerciseById, type Check, type ExerciseDef } from '@fitzen/engines';
import { IconBack, IconCamera, IconCheck, IconPlay, IconSearch, IconShare, IconUpload } from './icons';
import { setPendingVideo } from './pendingVideo';
import Figure, { FigureArt } from './Figure';
import { ExerciseCard, LEVEL, catLabel } from './Home';
import { LESSONS, lessonSearchUrl } from './lessons';

const MODE = { reps: 'Reps', hold: 'Hold', event: 'Power' } as const;
const KEY: Check['when'][] = ['bottom', 'hold', 'release', 'active'];

function rangeOf(ex: ExerciseDef, c: Check) {
  const a = ex.angles.find((x) => x.id === c.angle);
  const unit = a?.kind === 'spread' ? '× shoulders' : '°';
  return { label: a?.label ?? c.angle, range: `${c.good[0]}–${c.good[1]}${unit}` };
}

/** Three key poses of the movement, captioned with the engine's own coaching cues. */
function stepsOf(ex: ExerciseDef) {
  const titles = ex.mode === 'hold' ? ['Set up', 'Move into it', 'Hold'] : ex.mode === 'event'
    ? (ex.event?.trigger === 'jump' ? ['Ready', 'Load', 'Take off'] : ['Ready', 'Wind up', 'Release'])
    : ex.reps?.start === 'low' ? ['Start', 'Lift with control', 'Top'] : ['Start', 'Lower with control', 'Bottom'];
  const start = ex.checks.find((c) => c.when === 'top' || c.when === 'any');
  const key = ex.checks.find((c) => KEY.includes(c.when));
  const used = new Set<string>();
  const pick = (...xs: Array<string | undefined>) => { const s = xs.find((x) => x && !used.has(x)) ?? ''; used.add(s); return s; };
  const s3 = pick(key?.cue, ex.setup[ex.setup.length - 1]);
  const s1 = pick(start?.cue, ex.setup[1], ex.setup[0]);
  const s2 = pick(ex.setup[ex.setup.length - 1], ex.setup[1], 'Move smoothly; every joint is tracked.');
  return [
    { frame: 'start' as const, title: titles[0]!, text: s1, target: start ? rangeOf(ex, start) : null },
    { frame: 'mid' as const, title: titles[1]!, text: s2, target: null },
    { frame: 'key' as const, title: titles[2]!, text: s3, target: key ? rangeOf(ex, key) : null },
  ];
}

function Lesson({ ex }: { ex: ExerciseDef }) {
  const l = LESSONS[ex.id];
  const [on, setOn] = useState(false);
  if (!l) return (
    <nav className="rows"><a href={lessonSearchUrl(ex.name)} target="_blank" rel="noopener noreferrer"><span className="ic"><IconSearch /></span>Find a {ex.name} lesson on YouTube<IconShare /></a></nav>
  );
  return (<>
    <div className="lesson">
      {on
        ? <iframe src={`https://www.youtube-nocookie.com/embed/${l.v}?autoplay=1&rel=0&playsinline=1`} title={l.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : <button className="lesson-facade" onClick={() => setOn(true)} aria-label={`Play video lesson: ${l.title}`}>
          <div className="art"><FigureArt def={ex} frame="mid" w={960} h={540} /></div>
          <span className="play"><svg viewBox="0 0 24 24" aria-hidden><path d="M7 4v16l13-8z" /></svg></span>
          <span className="lesson-meta"><small>YouTube · {l.channel}</small><b>{l.title}</b></span>
        </button>}
    </div>
    <p className="lesson-note">Loads from YouTube in privacy-enhanced mode only when you tap play, and needs internet. Third-party coaching content; Fitzen measures your own form.</p>
  </>);
}

export default function Exercise() {
  const { id = '' } = useParams();
  const ex = exerciseById(id);
  const nav = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (location.hash === '#lesson') requestAnimationFrame(() => document.getElementById('lesson')?.scrollIntoView({ block: 'start' })); }, [id]);
  if (!ex) return <Navigate to="/app" replace />;

  const go = (src: 'camera' | 'demo' | 'video') => nav(`/train/${ex.id}?src=${src}`);
  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${ex.name} · Fitzen`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* dismissed */ }
  };
  const target = ex.mode === 'reps' && ex.reps ? `${ex.reps.start === 'high' ? '≤' : '≥'} ${ex.reps.target}°` :
    ex.mode === 'hold' ? `${ex.hold?.targetSec ?? 30} s` : ex.event?.releaseAngle ? `${ex.event.releaseAngle.good[0]}–${ex.event.releaseAngle.good[1]}°` : ex.event?.trigger === 'jump' ? 'Max height' : 'Peak speed';
  const targetLabel = ex.mode === 'reps' && ex.reps ? `${ex.angles.find((a) => a.id === ex.reps!.driver)?.label ?? 'Joint'} at depth` : ex.mode === 'hold' ? 'Hold target' : ex.event?.releaseAngle ? 'Release angle' : 'Measures';
  const more = EXERCISES.filter((e) => e.category === ex.category && e.id !== ex.id);

  return (
    <main className="page detail" data-cat={ex.category}>
      <div className="detail-nav">
        <button className="round glassy press" onClick={() => (history.length > 1 ? nav(-1) : nav('/app'))} aria-label={t('Back')}><IconBack /></button>
        <button className="round glassy press" onClick={share} aria-label={copied ? 'Link copied' : 'Share'}>{copied ? <IconCheck /> : <IconShare />}</button>
      </div>

      <section className="detail-hero">
        <Figure def={ex} />
        <div className="detail-title">
          <span className="feat-kicker">{catLabel(ex.category)}</span>
          <h1>{t(ex.name)}</h1>
          <div className="meta-line">
            <span>{MODE[ex.mode]}</span><span>{ex.camera === 'side' ? 'Side view' : 'Front view'}</span><span>{LEVEL[ex.difficulty]}</span>
          </div>
          <div className="detail-actions on-media">
            <button className="btn primary block press" onClick={() => go('camera')}><IconCamera /> {t("Let's Go")}</button>
            <div className="pair">
              <button className="btn press" onClick={() => file.current?.click()}><IconUpload /> {t('Analyse video')}</button>
              <button className="btn press" onClick={() => go('demo')}><IconPlay /> {t('Watch demo')}</button>
            </div>
          </div>
        </div>
      </section>
      <input ref={file} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPendingVideo(f); go('video'); } }} />

      <div className="detail-grid">
        <div>
          <p className="lede">{ex.summary}</p>
          <div className="facts">
            <div><span>{t('Camera')}</span><b>{ex.camera === 'side' ? 'Side-on' : 'Facing'}</b></div>
            <div><span>{targetLabel}</span><b>{target}</b></div>
            <div><span>Joint checks</span><b>{ex.checks.length}</b></div>
            <div><span>Effort</span><b>{ex.met} MET</b></div>
          </div>

          <h2 className="section-title">{t('How to do it')}</h2>
          <div className="howto">
            {stepsOf(ex).map((s, i) => (
              <article key={s.frame} className="step-card">
                <div className="art"><FigureArt def={ex} frame={s.frame} w={480} h={360} /></div>
                <div className="txt">
                  <span className="n">Step {i + 1}</span>
                  <b>{s.title}</b>
                  <p>{s.text}</p>
                  {s.target && <span className="target">{s.target.label} {s.target.range}</span>}
                </div>
              </article>
            ))}
          </div>

          <h2 className="section-title" id="lesson" style={{ scrollMarginTop: 80 }}>{t('Video lesson')}</h2>
          <Lesson ex={ex} />
        </div>

        <div>
          <h2 className="section-title">{t('Set up')}</h2>
          <ol className="steps">{setupFor(ex).map((s, i) => <li key={i}>{s}</li>)}</ol>

          <h2 className="section-title">{t('What we measure')}</h2>
          <div className="measure">
            {ex.checks.map((c, i) => {
              const r = rangeOf(ex, c);
              return <div key={i}><span className="when">{c.when}</span><span>{r.label}<span className="cue">{c.cue}</span></span><b className="num z-good">{r.range}</b></div>;
            })}
          </div>
          <div className="zone-legend" style={{ marginTop: 12 }}><span><i style={{ background: 'var(--good)' }} />Correct</span><span><i style={{ background: 'var(--ok)' }} />Moderate</span><span><i style={{ background: 'var(--bad)' }} />Fix it</span></div>

          <h2 className="section-title">Equipment</h2>
          <div className="pills">{(ex.equipment.length ? ex.equipment : ['none needed']).map((m) => <span key={m}>{m}</span>)}</div>
          <h2 className="section-title">Muscles</h2>
          <div className="pills">{ex.muscles.map((m) => <span key={m}>{m}</span>)}</div>
        </div>
      </div>

      {more.length > 0 && <><h2 className="section-title">More Like This</h2><div className="shelf">{more.map((e) => <ExerciseCard key={e.id} ex={e} />)}</div></>}
    </main>
  );
}
