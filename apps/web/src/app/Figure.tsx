import { useEffect, useRef, useState } from 'react';
import { simulateExercise, type ExerciseDef } from '@fitzen/engines';

/**
 * The exercise demonstrator: the engine's synthetic athlete (the same one the demo mode measures),
 * drawn as a shaded, dressed human instead of a stick figure. One full rep / hold / attempt loops.
 */

type P = { x: number; y: number };
type Pose = P[];
const FPS = 30, ASPECT = 16 / 9;

interface Clip { frames: Pose[]; key: number; box: { x0: number; x1: number; y0: number; floor: number } }
const clips = new Map<string, Clip>();

/** One seamless cycle of the puppet's routine (frame counts mirror puppet.ts' schedule). */
function clipOf(def: ExerciseDef): Clip {
  const hit = clips.get(def.id);
  if (hit) return hit;
  const all = simulateExercise(def, { reps: def.mode === 'reps' ? 2 : 1, seed: 1, fps: FPS, aspect: ASPECT })
    .map((f) => f.landmarks.map((p) => ({ x: p.x * ASPECT, y: p.y })));
  const mv = (s: number) => Math.max(1, Math.round(s * FPS)), hd = (s: number) => Math.ceil(s * FPS - 1e-9);
  // ponytail: slices assume puppet.ts' timings; if those change the loop seam may jump slightly.
  let frames = all;
  if (def.mode === 'reps') { const s = hd(1.2), rs = 2.4; frames = all.slice(s, s + mv(rs * 0.55) + hd(0.15) + mv(rs * 0.4) + hd(0.35)); }
  else if (def.mode === 'hold') { const s = hd(1.2) + mv(1.2); frames = [...all.slice(hd(0.5), s + 75), ...all.slice(all.length - mv(1) - hd(0.8))]; }
  else frames = all.slice(hd(0.6));
  const f0 = frames[0]!;
  let key = 0, best = -1;
  frames.forEach((f, i) => {
    let d = 0;
    for (const j of [15, 16, 23, 25, 27]) d += (f[j]!.x - f0[j]!.x) ** 2 + (f[j]!.y - f0[j]!.y) ** 2;
    if (d > best) { best = d; key = i; }
  });
  const used = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, floor = -Infinity;
  for (const f of frames) for (const j of used) { const p = f[j]!; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); floor = Math.max(floor, p.y); }
  const c = { frames, key, box: { x0, x1, y0, floor } };
  clips.set(def.id, c);
  return c;
}

// ── Drawing ──────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const SKIN: RGB = [176, 116, 82], HAIR: RGB = [28, 20, 16], TOP: RGB = [242, 242, 244], SHORTS: RGB = [40, 40, 46], SHOE: RGB = [166, 255, 0];
const rgb = ([r, g, b]: RGB, k = 1) => `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
const LIGHT = { x: -0.55, y: -0.83 };

/** Tapered capsule between two circles, shaded across its width like a cylinder lit from the top left. */
function limb(ctx: CanvasRenderingContext2D, a: P, ra: number, b: P, rb: number, c: RGB, dim: number) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < Math.abs(ra - rb) + 0.5) { ctx.beginPath(); ctx.arc(a.x, a.y, Math.max(ra, rb), 0, 7); ctx.fillStyle = rgb(c, dim); ctx.fill(); return; }
  const th = Math.atan2(dy, dx), ph = Math.acos((ra - rb) / d);
  ctx.beginPath();
  ctx.arc(a.x, a.y, ra, th + ph, th - ph + 2 * Math.PI);
  ctx.arc(b.x, b.y, rb, th - ph, th + ph);
  ctx.closePath();
  let nx = -dy / d, ny = dx / d;
  if (nx * LIGHT.x + ny * LIGHT.y < 0) { nx = -nx; ny = -ny; }
  const r = Math.max(ra, rb), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const g = ctx.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
  g.addColorStop(0, rgb(c, dim * 1.22)); g.addColorStop(0.35, rgb(c, dim)); g.addColorStop(0.8, rgb(c, dim * 0.78)); g.addColorStop(1, rgb(c, dim * 0.6));
  ctx.fillStyle = g;
  ctx.fill();
}

/** Sphere shaded from the top left (head, hands). */
function ball(ctx: CanvasRenderingContext2D, c: P, r: number, col: RGB, dim: number) {
  const g = ctx.createRadialGradient(c.x + LIGHT.x * r * 0.45, c.y + LIGHT.y * r * 0.45, r * 0.1, c.x, c.y, r);
  g.addColorStop(0, rgb(col, dim * 1.25)); g.addColorStop(0.6, rgb(col, dim)); g.addColorStop(1, rgb(col, dim * 0.66));
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 7); ctx.fillStyle = g; ctx.fill();
}

const lerpP = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function drawPose(ctx: CanvasRenderingContext2D, w: number, h: number, pose: Pose, clip: Clip) {
  const { x0, x1, y0, floor } = clip.box;
  const s = Math.min((w * 0.74) / Math.max(x1 - x0, 1e-3), (h * 0.74) / Math.max(floor - y0, 1e-3));
  const ox = w / 2 - ((x0 + x1) / 2) * s, oy = h * 0.88 - floor * s;
  body(ctx, (i) => ({ x: pose[i]!.x * s + ox, y: pose[i]!.y * s + oy }), floor * s + oy);
}

/** Draws the athlete in place over a demo session (landmarks in normalised image coordinates). */
export function drawAthlete(ctx: CanvasRenderingContext2D, lm: ReadonlyArray<{ x: number; y: number }>, ground: number) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  body(ctx, (i) => ({ x: lm[i]!.x * W, y: lm[i]!.y * H }), ground * H);
}

function body(ctx: CanvasRenderingContext2D, T: (i: number) => P, fy: number) {
  const sh = lerpP(T(11), T(12), 0.5), hip = lerpP(T(23), T(24), 0.5), nose = T(0);
  const L = Math.hypot(nose.x - sh.x, nose.y - sh.y) || 1, U = L / 0.11; // puppet's head offset is 0.11 body units
  const ux = (nose.x - sh.x) / L, uy = (nose.y - sh.y) / L;

  // Floor shadow, shrinking as the athlete leaves the ground.
  const feet = lerpP(T(27), T(28), 0.5), lift = Math.max(0, fy - Math.max(T(31).y, T(32).y, T(29).y));
  const sw = U * 0.42 * Math.max(0.35, 1 - lift / (U * 0.6));
  const sg = ctx.createRadialGradient(feet.x, fy, 0, feet.x, fy, sw);
  sg.addColorStop(0, 'rgba(0,0,0,0.42)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.translate(feet.x, fy); ctx.scale(1, 0.16); ctx.translate(-feet.x, -fy);
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(feet.x, fy, sw, 0, 7); ctx.fill(); ctx.restore();

  const arm = (o: number, dim: number) => {
    const S = T(11 + o), E = T(13 + o), W = T(15 + o), H = T(19 + o);
    limb(ctx, E, U * 0.026, W, U * 0.019, SKIN, dim);
    ball(ctx, H, U * 0.024, SKIN, dim * 0.95);
    limb(ctx, S, U * 0.036, E, U * 0.027, SKIN, dim);
    limb(ctx, S, U * 0.044, lerpP(S, E, 0.42), U * 0.038, TOP, dim); // sleeve
  };
  const leg = (o: number, dim: number) => {
    const Hp = T(23 + o), K = T(25 + o), A = T(27 + o), He = T(29 + o), Ft = T(31 + o);
    limb(ctx, K, U * 0.036, A, U * 0.023, SKIN, dim);
    limb(ctx, Hp, U * 0.056, K, U * 0.038, SKIN, dim);
    limb(ctx, Hp, U * 0.064, lerpP(Hp, K, 0.55), U * 0.05, SHORTS, dim); // shorts
    limb(ctx, lerpP(He, A, 0.3), U * 0.026, Ft, U * 0.018, SHOE, dim);
  };

  arm(1, 0.62); leg(1, 0.62); // far side (right, landmarks 12/14/…), in shade
  const top = { x: sh.x - ux * U * 0.02, y: sh.y - uy * U * 0.02 };
  limb(ctx, top, U * 0.071, hip, U * 0.064, TOP, 1);
  limb(ctx, lerpP(top, hip, 0.82), U * 0.068, hip, U * 0.066, SHORTS, 1); // waistband
  const hc = { x: sh.x + ux * U * 0.13, y: sh.y + uy * U * 0.13 }, hr = U * 0.064;
  limb(ctx, sh, U * 0.03, hc, U * 0.028, SKIN, 0.9);
  leg(0, 1);
  // Head with hair towards the back (the puppet faces +x along the body's forward axis).
  const fx = -uy, fy2 = ux;
  ball(ctx, hc, hr, SKIN, 1);
  ctx.save(); ctx.beginPath(); ctx.arc(hc.x, hc.y, hr, 0, 7); ctx.clip();
  ctx.beginPath(); ctx.arc(hc.x - fx * hr * 0.42 + ux * hr * 0.3, hc.y - fy2 * hr * 0.42 + uy * hr * 0.3, hr * 1.02, 0, 7); ctx.fillStyle = rgb(HAIR); ctx.fill();
  ctx.restore();
  arm(0, 1);
}

function paint(canvas: HTMLCanvasElement, pose: Pose, clip: Clip) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPose(ctx, canvas.width, canvas.height, pose, clip);
}

// ── Static artwork (cards) ───────────────────────────────────────────────
const arts = new Map<string, string>();
/** Data URL of the exercise's most characteristic pose, rendered once per exercise and frame. */
export function figureArt(def: ExerciseDef, frame: 'key' | 'start' | 'mid' = 'key', w = 480, h = 360): string {
  const id = `${def.id}:${frame}:${w}x${h}`;
  let url = arts.get(id);
  if (url) return url;
  const clip = clipOf(def), c = document.createElement('canvas');
  c.width = w; c.height = h;
  const i = frame === 'start' ? 0 : frame === 'mid' ? Math.round(clip.key / 2) : clip.key;
  paint(c, clip.frames[i]!, clip);
  url = c.toDataURL('image/png');
  arts.set(id, url);
  return url;
}

/** Renders `onVisible` children only once the element nears the viewport. */
export function useNearViewport<T extends Element>(margin = '300px') {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (!('IntersectionObserver' in window)) { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near] as const;
}

/** Card artwork: one pose as a lazily rendered image. */
export function FigureArt({ def, frame = 'key', w, h }: { def: ExerciseDef; frame?: 'key' | 'start' | 'mid'; w?: number; h?: number }) {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  return <div ref={ref} className="figure">{near && <img src={figureArt(def, frame, w, h)} alt="" draggable={false} />}</div>;
}

/** Square thumbnail for lists. */
export const Thumb = ({ def, size = 50 }: { def: ExerciseDef; size?: number }) => (
  <div className="ex-glyph art" data-cat={def.category} style={{ width: size, height: size }} aria-hidden><FigureArt def={def} w={240} h={240} /></div>
);

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Live demonstrator: loops one rep, pauses off-screen and under Reduce Motion. */
export default function Figure({ def, playing = true }: { def: ExerciseDef; playing?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const clip = clipOf(def);
    let visible = true, raf = 0, t0 = performance.now();
    const size = () => {
      const r = el.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(r.width * dpr)); el.height = Math.max(1, Math.round(r.height * dpr));
    };
    const draw = (i: number) => paint(el, clip.frames[i]!, clip);
    const still = () => draw(clip.key);
    const tick = (now: number) => {
      draw(Math.max(0, Math.floor(((now - t0) / 1000) * FPS)) % clip.frames.length); // rAF time can precede t0
      raf = requestAnimationFrame(tick);
    };
    const run = () => { cancelAnimationFrame(raf); if (playing && visible && !reduced() && !document.hidden) { t0 = performance.now(); raf = requestAnimationFrame(tick); } else still(); };
    size(); run();
    const ro = new ResizeObserver(() => { size(); run(); });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; run(); });
    io.observe(el);
    document.addEventListener('visibilitychange', run);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', run); };
  }, [def.id, playing]);
  // The wrapper takes the layout box; a canvas sized by insets alone would grow with its own pixel buffer.
  return <div className="figure-live"><canvas ref={canvas} role="img" aria-label={`Animated demonstration of ${def.name}`} /></div>;
}
