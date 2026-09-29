import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, EXERCISES, MotionSession, exerciseById, simulateExercise, type LiveState, type PoseFrame, type SessionReport, type Zone } from '@fitzen/engines';
import Pictogram from './Pictogram';
import { Aurora } from './Shell';
import './landing.css';

/** Sports the hero athlete cycles through. */
const REEL = [
  { id: 'back-squat', sport: 'Gym' },
  { id: 'javelin-release', sport: 'Throws' },
  { id: 'push-up', sport: 'Calisthenics' },
  { id: 'countermovement-jump', sport: 'Athletics' },
  { id: 'power-clean', sport: 'Olympic lifts' },
  { id: 'sai-sit-up', sport: 'SAI battery' },
] as const;

const ZONE: Record<Zone, string> = { good: '#34d27b', ok: '#f5c542', bad: '#ff5a4e' };
const ZONE_WORD: Record<Zone, string> = { good: 'Correct', ok: 'Almost', bad: 'Fix it' };
const LIMBS: Array<[number, number, number]> = [
  [23, 25, 1], [25, 27, 1], [24, 26, 1], [26, 28, 1], [27, 31, 0.7], [28, 32, 0.7],
  [11, 13, 0.8], [13, 15, 0.75], [12, 14, 0.8], [14, 16, 0.75],
];

const Arrow = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function Wordmark() {
  return (
    <span className="lp-mark" aria-label="Fitzen" translate="no">
      <svg viewBox="0 0 28 28" width="24" height="24" aria-hidden>
        <circle cx="17" cy="5.5" r="3.2" fill="var(--lime)" />
        <path d="M17 9.5 13 16l5 3.5-2 6.5M13 16l-6 1.5M15.5 12.5l6 1" stroke="currentColor" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      FITZEN
    </span>
  );
}

/** A button that leans toward the pointer. Runs outside React state (transform only). */
function Magnetic({ to, children, className = '' }: { to: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0;
    const tick = () => {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      if (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1) raf = requestAnimationFrame(tick); else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * 0.25; ty = (e.clientY - (r.top + r.height / 2)) * 0.35; kick();
    };
    const leave = () => { tx = 0; ty = 0; kick(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, []);
  return <Link ref={ref} to={to} className={`lp-cta ${className}`}>{children}</Link>;
}

/**
 * Telestrator: the real engine reading the synthetic athlete, drawn like a
 * broadcast analysis — strobe trail, solid body, zone-coloured joints and
 * leader-line callouts.
 */
function draw(cv: HTMLCanvasElement, f: PoseFrame, trail: PoseFrame[], l: LiveState, labels: Record<string, string>, s: number, dpr: number) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const P = (fr: PoseFrame, i: number) => ({ x: fr.landmarks[i]!.x * W, y: fr.landmarks[i]!.y * H });
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Floor + contact shadow
  const feet = [27, 28, 31, 32].map((i) => P(f, i));
  const floorY = Math.max(...feet.map((p) => p.y)) + 6 * s;
  const cx = feet.reduce((a, p) => a + p.x, 0) / feet.length;
  const g = ctx.createRadialGradient(cx, floorY, 0, cx, floorY, 180 * s);
  g.addColorStop(0, 'rgba(200,241,53,0.18)'); g.addColorStop(1, 'rgba(200,241,53,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - 200 * s, floorY - 30 * s, 400 * s, 60 * s);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5 * s;
  ctx.beginPath(); ctx.moveTo(W * 0.08, floorY); ctx.lineTo(W * 0.92, floorY); ctx.stroke();

  // Strobe trail (older = fainter)
  trail.forEach((fr, k) => {
    const a = 0.04 + (k / trail.length) * 0.16;
    ctx.strokeStyle = `rgba(200,241,53,${a})`;
    for (const [i, j, w] of LIMBS) {
      const p = P(fr, i), q = P(fr, j);
      ctx.lineWidth = 12 * w * s; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
  });

  // Torso
  const sh = [P(f, 11), P(f, 12)], hp = [P(f, 23), P(f, 24)];
  ctx.fillStyle = 'rgba(244,244,242,0.9)';
  ctx.strokeStyle = 'rgba(244,244,242,0.9)'; ctx.lineWidth = 22 * s;
  ctx.beginPath(); ctx.moveTo(sh[0]!.x, sh[0]!.y); ctx.lineTo(sh[1]!.x, sh[1]!.y); ctx.lineTo(hp[1]!.x, hp[1]!.y); ctx.lineTo(hp[0]!.x, hp[0]!.y); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Limbs, tinted where judged
  for (const [i, j, w] of LIMBS) {
    const p = P(f, i), q = P(f, j);
    const z = l.boneZones[`${Math.min(i, j)}-${Math.max(i, j)}`];
    ctx.strokeStyle = z ? ZONE[z] : 'rgba(244,244,242,0.9)';
    ctx.lineWidth = 16 * w * s;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  // Head
  const nose = P(f, 0), mid = { x: (sh[0]!.x + sh[1]!.x) / 2, y: (sh[0]!.y + sh[1]!.y) / 2 };
  const hr = Math.max(16 * s, Math.hypot(nose.x - mid.x, nose.y - mid.y) * 0.42);
  ctx.fillStyle = 'rgba(244,244,242,0.95)';
  ctx.beginPath(); ctx.arc(nose.x + (nose.x - mid.x) * 0.15, nose.y + (nose.y - mid.y) * 0.15, hr, 0, Math.PI * 2); ctx.fill();

  // Joints + callouts
  const calls: Array<{ x: number; y: number; z: Zone; v: number; label: string }> = [];
  for (const [id, chain] of Object.entries(l.anchors)) {
    const r = l.angles[id];
    if (!r?.zone || chain.length !== 3) continue;
    const a = P(f, chain[0]!), b = P(f, chain[1]!), c = P(f, chain[2]!);
    const t1 = Math.atan2(a.y - b.y, a.x - b.x), t2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = t2 - t1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    ctx.fillStyle = ZONE[r.zone] + '40'; ctx.strokeStyle = ZONE[r.zone]; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, 38 * s, t1, t1 + d, d < 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(b.x, b.y, 38 * s, t1, t1 + d, d < 0); ctx.stroke();
    ctx.fillStyle = '#0b0b0c'; ctx.beginPath(); ctx.arc(b.x, b.y, 9 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ZONE[r.zone]; ctx.lineWidth = 4 * s; ctx.stroke();
    calls.push({ x: b.x, y: b.y, z: r.zone, v: r.value, label: labels[id] ?? id });
  }
  calls.sort((p, q) => p.y - q.y);
  const colX = W - 36 * s;
  const gap = 96 * s;
  const top = Math.max(120 * s, Math.min(...calls.map((c) => c.y), H) - 20 * s);
  calls.forEach((c, k) => {
    const ly = top + k * gap;
    ctx.strokeStyle = ZONE[c.z]; ctx.lineWidth = 1.5 * s; ctx.setLineDash([5 * s, 5 * s]);
    ctx.beginPath(); ctx.moveTo(c.x + 12 * s, c.y); ctx.lineTo(colX - 150 * s, ly); ctx.lineTo(colX - 136 * s, ly); ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ZONE[c.z];
    ctx.font = `800 ${Math.max(58 * s, 30 * dpr)}px "Barlow Condensed", sans-serif`;
    ctx.fillText(`${Math.round(c.v)}°`, colX, ly + 14 * s);
    ctx.fillStyle = 'rgba(244,244,242,0.72)';
    ctx.font = `600 ${Math.max(17 * s, 11 * dpr)}px "Barlow", sans-serif`;
    ctx.fillText(`${c.label.toUpperCase()} · ${ZONE_WORD[c.z].toUpperCase()}`, colX, ly + 38 * s);
  });
}

function Telestrator({ index, paused }: { index: number; paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<{ count: number; valid: number; extra: string }>({ count: 0, valid: 0, extra: '' });
  const def = exerciseById(REEL[index]!.id)!;
  const [size, setSize] = useState(0);
  useEffect(() => {
    let t = 0;
    const on = () => { clearTimeout(t); t = window.setTimeout(() => setSize(window.innerWidth), 200); };
    window.addEventListener('resize', on);
    return () => { clearTimeout(t); window.removeEventListener('resize', on); };
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const box = cv.parentElement!.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(box.width * dpr) || 1000, H = Math.round(box.height * dpr) || 900;
    const sc = dpr * Math.min(1, box.height / 700);
    cv.width = W; cv.height = H;
    const aspect = W / H;
    const frames = simulateExercise(def, { reps: 8, aspect, ground: 0.88, seed: index + 3 });
    const labels = Object.fromEntries(def.angles.map((a) => [a.id, a.label]));
    let session = new MotionSession(def);
    const trail: PoseFrame[] = [];
    let raf = 0, i = 0, t0 = performance.now(), lastDraw = 0, lastTrail = 0, lastHud = 0;
    const reduce = paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const show = (f: PoseFrame, l: LiveState) => {
      draw(cv, f, trail, l, labels, sc, dpr);
      const e = l.events[l.events.length - 1];
      setHud({ count: def.mode === 'event' ? l.events.length : l.reps, valid: l.validReps, extra: e?.jumpHeightCm !== undefined ? `${e.jumpHeightCm.toFixed(1)} cm` : e?.releaseAngle !== undefined ? `${Math.round(e.releaseAngle)}° release` : '' });
    };
    if (reduce) {
      // Still frame: replay the first rep so the engine judges it, then show its most telling pose.
      const f0 = frames[0]!.landmarks;
      let best = 0, bestD = -1;
      frames.slice(0, Math.floor(frames.length / 3)).forEach((fr, k) => {
        const d = [15, 16, 23, 25, 27].reduce((acc, j) => acc + (fr.landmarks[j]!.x - f0[j]!.x) ** 2 + (fr.landmarks[j]!.y - f0[j]!.y) ** 2, 0);
        if (d > bestD) { bestD = d; best = k; }
      });
      let l = session.push(frames[0]!, aspect);
      for (let k = 1; k <= best; k++) l = session.push(frames[k]!, aspect);
      show(frames[best]!, l);
      return;
    }
    const step = (now: number) => {
      const el = now - t0;
      let f: PoseFrame | null = null;
      while (i < frames.length && frames[i]!.timestampMs <= el) f = frames[i++]!;
      if (i >= frames.length) { i = 0; t0 = now; session = new MotionSession(def); trail.length = 0; }
      if (f) {
        const fr = { ...f, timestampMs: t0 + f.timestampMs };
        const l = session.push(fr, aspect);
        if (now - lastTrail > 60) { trail.push(f); if (trail.length > 9) trail.shift(); lastTrail = now; }
        if (now - lastDraw > 16) { draw(cv, f, trail, l, labels, sc, dpr); lastDraw = now; }
        if (now - lastHud > 120) { show(f, l); lastHud = now; }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [def, index, size, paused]);

  return (
    <div className="lp-tele">
      <canvas ref={canvas} aria-label={`Demo athlete performing ${def.name}. Joints are coloured green for correct, amber for almost, red for fix it.`} />
      <div className="lp-tele-hud" aria-live="polite">
        <span className="lp-tele-name">{def.name}</span>
        <span className="lp-tele-count">{hud.count}</span>
        <span className="lp-tele-sub">{def.mode === 'event' ? (hud.extra || 'attempts') : `reps · ${hud.valid} correct`}</span>
      </div>
      <span className="lp-tele-note">Synthetic demo athlete · real Fitzen engine</span>
    </div>
  );
}

function ExerciseRail({ cat }: { cat: string | null }) {
  const pool = cat ? EXERCISES.filter((e) => e.category === cat) : EXERCISES;
  const fill = pool.length < 14 ? [...pool, ...pool, ...pool] : pool;
  return (
    <div className="lp-rail" key={cat ?? 'all'}>
      <div className="lp-rail-track">
        {[...fill, ...fill].map((e, k) => (
          <Link key={`${e.id}-${k}`} to={`/train/${e.id}?src=demo`} className="lp-tile" aria-hidden={k >= fill.length} tabIndex={k >= fill.length ? -1 : undefined}>
            <Pictogram def={e} size={56} />
            <span className="lp-tile-name">{e.name}</span>
            <span className="lp-tile-meta">{e.mode === 'reps' ? 'Reps' : e.mode === 'hold' ? 'Hold' : 'Power'} · {e.camera === 'side' ? 'side view' : 'front view'}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function useSampleReport(): SessionReport {
  return useMemo(() => {
    const def = exerciseById('back-squat')!;
    const s = new MotionSession(def, { weightKg: 62 });
    for (const f of simulateExercise(def, { reps: 6, seed: 11 })) s.push(f);
    return s.finish();
  }, []);
}

/** Adds `.in` when the element scrolls into view; content is visible without it. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { el.classList.add('in'); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

const WORDS = ['Back squat', 'Javelin', 'Push-up', 'Sprint start', 'Power clean', 'Tree pose', 'Bench press', 'Shot put', 'Pull-up', 'Broad jump', 'Deadlift', 'Plank', 'Sit-and-reach', 'Snatch'];

export default function Landing() {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const [pulse, setPulse] = useState(0);
  const [cat, setCat] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const report = useSampleReport();
  const rp = report.reps!;
  const counts = CATEGORIES.map((c) => ({ ...c, n: EXERCISES.filter((e) => e.category === c.id).length }));
  const reportRef = useInView<HTMLDivElement>();

  useEffect(() => {
    document.documentElement.classList.add('js');
    return () => document.documentElement.classList.remove('js');
  }, []);
  useEffect(() => {
    if (!auto || paused) return;
    const t = window.setTimeout(() => { setIndex((i) => (i + 1) % REEL.length); setPulse((p) => p + 1); }, 9000);
    return () => clearTimeout(t);
  }, [auto, index, paused]);
  const pick = (k: number) => { setAuto(false); setIndex(k); setPulse((p) => p + 1); };

  return (
    <div className={`lp ${paused ? 'lp-paused' : ''}`}>
      <Aurora />
      <div className="lp-progress" aria-hidden />
      <a href="#main" className="lp-skip">Skip to content</a>
      <header className="lp-nav">
        <Link to="/" aria-label="Fitzen home"><Wordmark /></Link>
        <nav aria-label="Sections">
          <a href="#library">Exercises</a>
          <a href="#how">How it works</a>
          <a href="#mission">Why Fitzen</a>
        </nav>
        <Link to="/app" className="lp-nav-cta">Try now</Link>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <h1 className="lp-h1">
              <span key={`a${pulse}`} className="lp-h1-a">Every sport.</span>
              <span className="lp-h1-b">One coach.</span>
            </h1>
            <p className="lp-lede">
              Point your phone at yourself. Fitzen reads {EXERCISES.length} exercises joint by joint and colours every angle green, amber or red as you move.
              <span className="lp-lede-more"> Then it hands you a coach’s report on exactly what to fix.</span>
            </p>
            <div className="lp-cta-row">
              <Magnetic to="/app">Try now <Arrow /></Magnetic>
              <Link to={`/train/${REEL[index]!.id}?src=demo`} className="lp-link">Watch the {REEL[index]!.sport.toLowerCase()} demo</Link>
            </div>
            <div className="lp-switch" role="tablist" aria-label="Switch sport">
              {REEL.map((r, k) => (
                <button key={r.id} role="tab" aria-selected={k === index} className={k === index ? 'on' : ''} onClick={() => pick(k)}>
                  {r.sport}
                  {k === index && auto && !paused && <i className="lp-switch-timer" />}
                </button>
              ))}
            </div>
            <button className="lp-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path d="M7 4v16l13-8z" fill="currentColor" /></svg> : <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" /></svg>}
              {paused ? 'Play motion' : 'Pause motion'}
            </button>
            <ul className="lp-facts">
              <li>No sign-up</li>
              <li>Runs on your phone</li>
              <li>Video never uploaded</li>
            </ul>
          </div>
          <Telestrator index={index} paused={paused} />
        </section>

        <div className="lp-kinetic" aria-hidden>
          <div className="lp-kinetic-track">
            {[...WORDS, ...WORDS].map((w, k) => <span key={k} className={k % 2 ? 'outline' : ''}>{w}</span>)}
          </div>
        </div>

        <section id="library" className="lp-library">
          <div className="lp-wrap lp-library-head">
            <h2 className="lp-h2">{EXERCISES.length} exercises.<br />Gym floor to athletics track.</h2>
            <div className="lp-filters" role="group" aria-label="Filter exercises by category">
              <button className={cat === null ? 'on' : ''} aria-pressed={cat === null} onClick={() => setCat(null)}>All <b>{EXERCISES.length}</b></button>
              {counts.map((c) => (
                <button key={c.id} className={cat === c.id ? 'on' : ''} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label} <b>{c.n}</b></button>
              ))}
            </div>
          </div>
          <ExerciseRail cat={cat} />
          <p className="lp-wrap lp-hint">Tap any exercise to watch the demo athlete do it.</p>
        </section>

        <section id="how" className="lp-how lp-wrap">
          <h2 className="lp-h2">Phone to feedback<br />in three moves.</h2>
          <div className="lp-stack">
            <article className="lp-panel" style={{ ['--i' as string]: 0 }}>
              <div>
                <span className="lp-panel-n">1</span>
                <h3>Prop your phone</h3>
                <p>Two to three metres away, side-on or facing, whole body in frame. Fitzen tells you when it can see you, then counts you in.</p>
              </div>
              <svg className="lp-panel-art" viewBox="0 0 220 180" aria-hidden>
                <rect x="60" y="14" width="100" height="152" rx="18" fill="none" stroke="currentColor" strokeOpacity=".3" strokeWidth="2" strokeDasharray="7 7" />
                <circle cx="110" cy="46" r="11" fill="var(--lime)" />
                <path d="M110 58v42M110 70 88 90M110 70l22 20M110 100l-16 44M110 100l16 44" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
              </svg>
            </article>
            <article className="lp-panel" style={{ ['--i' as string]: 1 }}>
              <div>
                <span className="lp-panel-n">2</span>
                <h3>Move</h3>
                <p>Every joint that matters lights up live. You hear your rep count, and a cue the moment your form slips.</p>
              </div>
              <ul className="lp-zones" aria-label="Colour key">
                <li className="good"><b>94°</b><span>Knee · correct</span></li>
                <li className="ok"><b>112°</b><span>Knee · almost</span></li>
                <li className="bad"><b>138°</b><span>Knee · fix it</span></li>
              </ul>
            </article>
            <article className="lp-panel" style={{ ['--i' as string]: 2 }}>
              <div>
                <span className="lp-panel-n">3</span>
                <h3>Read your report</h3>
                <p>Time, reps per minute, range of motion, tempo, time under tension, fatigue, and a list of what to fix next session.</p>
              </div>
              <dl className="lp-mini">
                <div><dt>Grade</dt><dd className="lime">{report.grade}</dd></div>
                <div><dt>Reps</dt><dd>{rp.count}<small>/{rp.valid} correct</small></dd></div>
                <div><dt>Tempo</dt><dd>{rp.avgEccentricSec.toFixed(1)}<small>s down</small></dd></div>
              </dl>
            </article>
          </div>
        </section>

        <section className="lp-report lp-wrap">
          <div className="lp-report-copy">
            <h2 className="lp-h2">Not a score.<br />A coach’s notes.</h2>
            <p className="lp-body">This report was computed on this page a moment ago, by the same engine the app runs, from the demo athlete’s squats. Yours comes from your own camera.</p>
            <Magnetic to="/app" className="lp-cta-ghost">Get your report <Arrow /></Magnetic>
          </div>
          <div ref={reportRef} className="lp-sheet">
            <div className="lp-sheet-head">
              <span className="lp-sheet-grade">{report.grade}</span>
              <div><b>Back squat</b><span>{rp.count} reps · {rp.valid} correct · form {report.formScore}/100</span></div>
            </div>
            <dl className="lp-sheet-stats">
              <div><dt>Cadence</dt><dd>{rp.perMin.toFixed(1)}<small>/min</small></dd></div>
              <div><dt>Range</dt><dd>{Math.round(rp.romMean)}°<small>±{rp.romSd.toFixed(0)}</small></dd></div>
              <div><dt>Under tension</dt><dd>{rp.tutSec.toFixed(1)}<small>s</small></dd></div>
            </dl>
            <div className="lp-sheet-bars">
              {report.checks.slice(0, 4).map((c, k) => (
                <div key={k} className="lp-sheet-bar" style={{ ['--d' as string]: `${k * 90}ms` }}>
                  <span>{c.label}<small>{c.when === 'bottom' ? ' at depth' : c.when === 'top' ? ' standing' : ''}</small></span>
                  <div className="lp-bar"><i className="g" style={{ width: `${c.pctGood}%` }} /><i className="o" style={{ width: `${c.pctOk}%` }} /><i className="b" style={{ width: `${c.pctBad}%` }} /></div>
                  <em>{Math.round(c.pctGood)}%</em>
                </div>
              ))}
            </div>
            <ul className="lp-sheet-tips">
              {report.insights.slice(0, 2).map((i, k) => <li key={k} className={i.level}><b>{i.title}</b>{i.detail}</li>)}
            </ul>
          </div>
        </section>

        <section id="mission" className="lp-mission lp-wrap">
          <p className="lp-quote">Talent lives in every district. <mark>Now the tryout does too.</mark></p>
          <div className="lp-mission-grid">
            <p className="lp-body">
              The Sports Authority of India asked for a way to assess young athletes anywhere with nothing but a phone (Smart India Hackathon, SIH25073).
              Fitzen is our answer: a sports-science lab in your pocket that works in a village as well as a stadium, with no equipment and no account.
            </p>
            <ul className="lp-pillars">
              <li><b>Private by design</b>Pose tracking runs on your phone. Your video is never uploaded.</li>
              <li><b>Honest numbers</b>Every figure is measured, and the report says when the camera can’t see well enough.</li>
              <li><b>Made for Khelo India’s scale</b>Runs in an ordinary phone’s browser. Nothing to install.</li>
            </ul>
          </div>
          <p className="lp-fine">A final-year project by the CSD department, K. K. Wagh Institute, Nashik. Not an official SAI product.</p>
        </section>

        <section className="lp-final">
          <h2 className="lp-final-h">Your turn.</h2>
          <p className="lp-body">Pick an exercise. Press start. See yourself the way a coach does.</p>
          <Magnetic to="/app" className="lp-cta-lg">Try Fitzen now <Arrow /></Magnetic>
        </section>
      </main>

      <footer className="lp-foot lp-wrap">
        <Wordmark />
        <span>M. P. Deshmukh (guide) · Shivanjay Bajpai · Deepasha Sakhare · Aryan Sukhwal · Kadamb Sonawane</span>
      </footer>
    </div>
  );
}
