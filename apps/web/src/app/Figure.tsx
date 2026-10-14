import { useEffect, useRef, useState } from 'react';
import { puppetProps, simulateExercise, type ExerciseDef, type Prop } from '@fitzen/engines';
import { photoOf } from './photos';

/**
 * The exercise demonstrator: the engine's synthetic athlete (the same one the demo mode measures),
 * drawn as a shaded, dressed human instead of a stick figure. One full rep / hold / attempt loops.
 */

type P = { x: number; y: number };
type Pose = P[];
const FPS = 30, ASPECT = 16 / 9;

interface Clip { frames: Pose[]; key: number; box: { x0: number; x1: number; y0: number; floor: number }; props: Prop[]; front: boolean }
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
  const f0 = frames[0]!, throwing = def.event?.trigger === 'wristPeak';
  let key = 0, best = -1;
  frames.forEach((f, i) => {
    // Throws: the release (fastest hand); everything else: the pose furthest from the start.
    let d = 0;
    if (throwing) { const g = frames[Math.max(0, i - 1)]!; for (const j of [15, 16]) d = Math.max(d, (f[j]!.x - g[j]!.x) ** 2 + (f[j]!.y - g[j]!.y) ** 2); }
    else for (const j of [15, 16, 23, 25, 27]) d += (f[j]!.x - f0[j]!.x) ** 2 + (f[j]!.y - f0[j]!.y) ** 2;
    if (d > best) { best = d; key = i; }
  });
  const used = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, floor = -Infinity;
  for (const f of frames) for (const j of used) { const p = f[j]!; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); floor = Math.max(floor, p.y); }
  const c = { frames, key, box: { x0, x1, y0, floor }, props: puppetProps(def), front: def.camera === 'front' };
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
  body(ctx, (i) => ({ x: pose[i]!.x * s + ox, y: pose[i]!.y * s + oy }), floor * s + oy, clip.front, clip.props);
}

/** Draws the athlete in place over a demo session (landmarks in normalised image coordinates). */
export function drawAthlete(ctx: CanvasRenderingContext2D, lm: ReadonlyArray<{ x: number; y: number }>, ground: number, def?: ExerciseDef) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  body(ctx, (i) => ({ x: lm[i]!.x * W, y: lm[i]!.y * H }), ground * H, def?.camera === 'front', def ? puppetProps(def) : []);
}

// ── Equipment ─────────────────────────────────────────────────────────────
const IRON: RGB = [58, 62, 72], PAD: RGB = [44, 48, 58], WOOD: RGB = [156, 116, 76], STEEL: RGB = [196, 200, 208];
const BACK: Prop[] = ['bench', 'incline-bench', 'bench-shoulders', 'bench-rear-foot', 'bench-hands', 'box', 'bar', 'parallel-bars', 'wall', 'wall-front', 'mat', 'blocks', 'reach-box'];

function equipment(ctx: CanvasRenderingContext2D, T: (i: number) => P, U: number, fy: number, props: Prop[], front: boolean, layer: 'back' | 'hands') {
  const box = (x: number, y: number, w: number, h: number, c: RGB, r = U * 0.012) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgb(c, 1.25)); g.addColorStop(1, rgb(c, 0.8));
    ctx.beginPath(); ctx.roundRect(x, y, w, Math.max(1, h), r); ctx.fillStyle = g; ctx.fill();
  };
  const line = (a: P, b: P, w: number, c: RGB) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.strokeStyle = rgb(c); ctx.stroke(); };
  const sh = lerpP(T(11), T(12), 0.5), hip = lerpP(T(23), T(24), 0.5), hands = lerpP(T(19), T(20), 0.5);
  const lo = (...ys: number[]) => Math.max(...ys);
  for (const p of props) {
    if ((layer === 'back') !== BACK.includes(p)) continue;
    switch (p) {
      case 'bench': { const top = lo(sh.y, hip.y) + U * 0.06, x = Math.min(sh.x, hip.x) - U * 0.08, w = Math.abs(sh.x - hip.x) + U * 0.2; box(x + U * 0.05, top, U * 0.04, fy - top, IRON); box(x + w - U * 0.09, top, U * 0.04, fy - top, IRON); box(x, top, w, U * 0.05, PAD); break; }
      case 'incline-bench': { const n = { x: -(hip.y - sh.y), y: hip.x - sh.x }, k = (U * 0.075) / (Math.hypot(n.x, n.y) || 1), off = (q: P) => ({ x: q.x + n.x * k * Math.sign(n.y || 1), y: q.y + n.y * k * Math.sign(n.y || 1) });
        const a = off(sh), b = off(hip); line(lerpP(a, b, 0.45), { x: lerpP(a, b, 0.45).x, y: fy }, U * 0.035, IRON); line({ x: b.x, y: b.y }, { x: b.x, y: fy }, U * 0.035, IRON); line(a, b, U * 0.06, PAD); break; }
      case 'bench-shoulders': { const top = sh.y + U * 0.06; box(sh.x - U * 0.22, top, U * 0.3, fy - top, PAD); break; }
      case 'bench-rear-foot': { const f = T(32).x < T(31).x ? T(32) : T(31), top = f.y + U * 0.015; box(f.x - U * 0.2, top, U * 0.3, fy - top, PAD); break; }
      case 'bench-hands': { const top = Math.min(T(15).y, T(16).y) + U * 0.02; box(hands.x - U * 0.24, top, U * 0.34, fy - top, PAD); break; }
      case 'box': { const x = Math.max(T(31).x, T(32).x) + U * 0.22; box(x, fy - U * 0.28, U * 0.36, U * 0.28, WOOD); break; }
      case 'bar': { const y = Math.min(T(15).y, T(16).y) - U * 0.01, a = Math.min(T(15).x, T(16).x) - U * 0.3, b = Math.max(T(15).x, T(16).x) + U * 0.3; line({ x: a, y: 0 }, { x: a, y }, U * 0.03, IRON); line({ x: b, y: 0 }, { x: b, y }, U * 0.03, IRON); line({ x: a, y }, { x: b, y }, U * 0.022, STEEL); break; }
      case 'parallel-bars': { const y = Math.max(T(15).y, T(16).y) + U * 0.01, a = hands.x - U * 0.4, b = hands.x + U * 0.4; line({ x: a + U * 0.05, y }, { x: a + U * 0.05, y: fy }, U * 0.03, IRON); line({ x: b - U * 0.05, y }, { x: b - U * 0.05, y: fy }, U * 0.03, IRON); line({ x: a, y }, { x: b, y }, U * 0.026, STEEL); break; }
      case 'wall': { const x = Math.min(sh.x, hip.x) - U * 0.075; box(x - U * 0.12, 0, U * 0.12, fy, [120, 124, 136], 0); break; }
      case 'wall-front': { const x = Math.max(T(25).x, T(26).x) + U * 0.05; box(x, 0, U * 0.12, fy, [120, 124, 136], 0); break; }
      case 'mat': { const xs = [11, 12, 23, 24, 27, 28, 31, 32, 0].map((i) => T(i).x); box(Math.min(...xs) - U * 0.1, fy - U * 0.012, Math.max(...xs) - Math.min(...xs) + U * 0.2, U * 0.02, [70, 92, 160], U * 0.01); break; }
      case 'blocks': for (const i of [31, 32]) box(T(i).x - U * 0.1, fy - U * 0.05, U * 0.12, U * 0.05, IRON); break;
      case 'reach-box': { const x = Math.max(T(31).x, T(32).x); box(x, fy - U * 0.17, U * 0.2, U * 0.17, WOOD); break; }
      case 'barbell': case 'barbell-hips':
        if (front) { const y = hands.y, a = Math.min(T(15).x, T(16).x) - U * 0.25, b = Math.max(T(15).x, T(16).x) + U * 0.25; line({ x: a, y }, { x: b, y }, U * 0.02, STEEL); box(a - U * 0.03, y - U * 0.12, U * 0.05, U * 0.24, IRON); box(b - U * 0.02, y - U * 0.12, U * 0.05, U * 0.24, IRON); }
        else { ball(ctx, hands, U * 0.11, IRON, 0.9); ctx.beginPath(); ctx.arc(hands.x, hands.y, U * 0.02, 0, 7); ctx.fillStyle = rgb(STEEL); ctx.fill(); }
        break;
      case 'dumbbell': case 'dumbbells': for (const i of p === 'dumbbell' ? [19] : [20, 19]) ball(ctx, T(i), U * 0.045, IRON, i === 20 && !front ? 0.62 : 1); break;
      case 'kettlebell': { const h = T(19); ball(ctx, { x: h.x, y: h.y + U * 0.06 }, U * 0.055, IRON, 1); break; }
      case 'medicine-ball': ball(ctx, { x: hands.x + U * 0.04, y: hands.y }, U * 0.075, [150, 60, 40], 1); break;
      case 'basketball': { const h = T(19); ball(ctx, { x: h.x + U * 0.02, y: h.y - U * 0.06 }, U * 0.065, [224, 110, 32], 1); break; }
      case 'shot': ball(ctx, T(20), U * 0.04, IRON, 1.1); break;
      case 'cricket-ball': ball(ctx, T(20), U * 0.022, [180, 30, 30], 1.1); break;
      case 'discus': { const h = T(20); ctx.beginPath(); ctx.ellipse(h.x, h.y, U * 0.06, U * 0.02, 0, 0, 7); ctx.fillStyle = rgb(IRON, 1.2); ctx.fill(); break; }
      case 'javelin': { const e = T(14), h = T(16), d = Math.hypot(h.x - e.x, h.y - e.y) || 1, v = { x: (h.x - e.x) / d, y: (h.y - e.y) / d };
        line({ x: h.x - v.x * U * 0.7, y: h.y - v.y * U * 0.7 }, { x: h.x + v.x * U * 0.7, y: h.y + v.y * U * 0.7 }, U * 0.012, STEEL); break; }
      case 'racket': { const e = T(13), h = T(19), d = Math.hypot(h.x - e.x, h.y - e.y) || 1, v = { x: (h.x - e.x) / d, y: (h.y - e.y) / d }, c = { x: h.x + v.x * U * 0.28, y: h.y + v.y * U * 0.28 };
        line(h, { x: h.x + v.x * U * 0.17, y: h.y + v.y * U * 0.17 }, U * 0.014, IRON); ctx.beginPath(); ctx.ellipse(c.x, c.y, U * 0.11, U * 0.075, Math.atan2(v.y, v.x), 0, 7); ctx.lineWidth = U * 0.012; ctx.strokeStyle = rgb(IRON); ctx.stroke(); break; }
      case 'gloves': for (const i of [20, 19]) ball(ctx, T(i), U * 0.045, [190, 30, 40], i === 20 && !front ? 0.62 : 1); break;
      case 'dowel': { const nose = T(0), u = { x: nose.x - hip.x, y: nose.y - hip.y }, d = Math.hypot(u.x, u.y) || 1, b = { x: (u.y / d) * U * 0.09, y: (-u.x / d) * U * 0.09 };
        line({ x: hip.x + b.x - u.x * 0.15, y: hip.y + b.y - u.y * 0.15 }, { x: nose.x + b.x + u.x * 0.25, y: nose.y + b.y + u.y * 0.25 }, U * 0.018, WOOD); break; }
    }
  }
}

function body(ctx: CanvasRenderingContext2D, T: (i: number) => P, fy: number, front = false, props: Prop[] = []) {
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

  equipment(ctx, T, U, fy, props, front, 'back');

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

  // Side-on: the far (right) limbs sit in shade behind the body. Facing: both sides lit, wider torso, hair on top.
  const far = front ? 0.94 : 0.62, w = front ? 1.45 : 1;
  arm(1, far); leg(1, far);
  if (front) leg(0, 1);
  const top = { x: sh.x - ux * U * 0.02, y: sh.y - uy * U * 0.02 };
  limb(ctx, top, U * 0.071 * w, hip, U * 0.064 * w, TOP, 1);
  limb(ctx, lerpP(top, hip, 0.82), U * 0.068 * w, hip, U * 0.066 * w, SHORTS, 1); // waistband
  const hc = { x: sh.x + ux * U * 0.13, y: sh.y + uy * U * 0.13 }, hr = U * 0.064;
  limb(ctx, sh, U * 0.03, hc, U * 0.028, SKIN, 0.9);
  if (!front) leg(0, 1);
  // Hair towards the back of the head (side-on, facing +x) or across the top (facing the camera).
  const fx = front ? 0 : -uy, fy2 = front ? 0 : ux;
  ball(ctx, hc, hr, SKIN, 1);
  ctx.save(); ctx.beginPath(); ctx.arc(hc.x, hc.y, hr, 0, 7); ctx.clip();
  ctx.beginPath(); ctx.arc(hc.x - fx * hr * 0.42 + ux * hr * (front ? 0.55 : 0.3), hc.y - fy2 * hr * 0.42 + uy * hr * (front ? 0.55 : 0.3), hr * 1.02, 0, 7); ctx.fillStyle = rgb(HAIR); ctx.fill();
  ctx.restore();
  arm(0, 1);
  equipment(ctx, T, U, fy, props, front, 'hands');
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

/**
 * Exercise artwork: a real photo of a person doing it (start and end positions crossfade when `play`, or on hover
 * in cards), else the drawn demonstrator (animated when `play`).
 */
export function ExerciseArt({ def, frame = 'key', play = false, w, h }: { def: ExerciseDef; frame?: 'key' | 'start' | 'mid'; play?: boolean; w?: number; h?: number }) {
  const p = photoOf(def.id);
  if (!p) return play ? <Figure def={def} /> : <FigureArt def={def} frame={frame} w={w} h={h} />;
  const frames = frame === 'start' ? p.frames.slice(0, 1) : p.frames;
  return (
    <div className={`photo${frames.length > 1 ? ' two' : ''}${play ? ' cycle' : ''}${p.tall ? ' tall' : ''}`}>
      {frames.map((src) => <img key={src} src={src} alt="" draggable={false} loading={play ? 'eager' : 'lazy'} decoding="async" />)}
    </div>
  );
}

/** Square thumbnail for lists. */
export const Thumb = ({ def, size = 50 }: { def: ExerciseDef; size?: number }) => (
  <div className="ex-glyph art" data-cat={def.category} style={{ width: size, height: size }} aria-hidden><ExerciseArt def={def} w={240} h={240} /></div>
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
