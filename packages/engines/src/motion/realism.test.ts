/**
 * Realism stress harness: the demo athlete (puppet) perturbed the way a real camera + MediaPipe perturbs it, through the
 * live engine (One Euro, movement check on). Prints, per exercise and perturbation, what was counted and which gate
 * blocked it. Diagnostic only: no assertions on the table, so it never blocks CI.
 * Run: npx vitest run src/motion/realism.test.ts
 */
import { it } from 'vitest';
import type { PoseFrame } from '../jump/types.js';
import { EXERCISES } from './catalog/index.js';
import { MotionSession } from './engine.js';
import { simulateExercise } from './puppet.js';
import type { ExerciseDef } from './types.js';

const ASPECT = 16 / 9;
type LM = PoseFrame['landmarks'][number];
type Tf = (f: PoseFrame[], def: ExerciseDef) => PoseFrame[];

let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const isL = (i: number) => i >= 11 && i % 2 === 1;
const isR = (i: number) => i >= 12 && i % 2 === 0;
const map = (fs: PoseFrame[], g: (lm: LM, i: number, f: PoseFrame, k: number) => LM): PoseFrame[] =>
  fs.map((f, k) => ({ ...f, landmarks: f.landmarks.map((lm, i) => g(lm, i, f, k)) }));

/** Turn the body θ° about the vertical axis through the mid-hip (x-compression + L/R depth separation for side views). */
const yaw = (deg: number): Tf => (fs, def) => {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return map(fs, (lm, i, f) => {
    const hx = ((f.landmarks[23]!.x + f.landmarks[24]!.x) / 2) * ASPECT;
    const side = def.camera === 'side';
    const d = side ? (isL(i) ? 0.012 : isR(i) ? -0.012 : 0) : 0; // puppet's own side-view depth offset
    const w = side ? (i >= 23 ? 0.055 : 0.075) * (isL(i) ? 1 : isR(i) ? -1 : 0) : 0; // half hip / shoulder width
    const X = hx + (lm.x * ASPECT - d - hx) * c + w * s;
    return { ...lm, x: X / ASPECT };
  });
};
const noise = (sd: number): Tf => (fs) => map(fs, (lm) => ({ ...lm, x: lm.x + (gauss() * sd) / ASPECT, y: lm.y + gauss() * sd }));
const DISTAL = new Set([15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32]);
/** Feet/ankles/wrists visibility U(lo,hi), plus 5 % dropouts to 0.1. */
const distalVis = (lo: number, hi: number): Tf => (fs) => map(fs, (lm, i) => DISTAL.has(i) ? { ...lm, visibility: rnd() < 0.05 ? 0.1 : lo + (hi - lo) * rnd() } : lm);
/** Real side view: the far (right) side is occluded. */
const farVis = (lo: number, hi: number): Tf => (fs, def) => def.camera !== 'side' ? fs : map(fs, (lm, i) => isR(i) ? { ...lm, visibility: lo + (hi - lo) * rnd() } : lm);
/** Athlete's right side toward the camera: swap L/R labels (pickSide must switch from its 'left' default). */
const rightNear: Tf = (fs) => fs.map((f) => ({ ...f, landmarks: f.landmarks.map((_, i) => f.landmarks[isL(i) ? i + 1 : isR(i) ? i - 1 : i]!) }));
const mirror: Tf = (fs) => map(fs, (lm) => ({ ...lm, x: 1 - lm.x }));
const tempo = (k: number): Tf => (fs) => fs.map((f) => ({ ...f, timestampMs: f.timestampMs * k }));
const offCentre: Tf = (fs) => map(fs, (lm) => ({ ...lm, x: 0.25 + (lm.x - 0.5) * 0.6, y: 0.3 + (lm.y - 0.5) * 0.6 }));
const zLike: Tf = (fs) => map(fs, (lm) => ({ ...lm, z: gauss() * 0.3 }));
/** Partial ROM: every landmark 85 % of the way from the start pose. */
const rom = (k: number): Tf => (fs) => map(fs, (lm, i) => { const a = fs[0]!.landmarks[i]!; return { ...lm, x: a.x + (lm.x - a.x) * k, y: a.y + (lm.y - a.y) * k }; });
/** Body proportions: shins and forearms 15 % longer (distal points slide along the segment). */
const limbs: Tf = (fs) => fs.map((f) => {
  const l = f.landmarks.map((p) => ({ ...p }));
  for (const [prox, dist, rest] of [[25, 27, [29, 31]], [26, 28, [30, 32]], [13, 15, [17, 19, 21]], [14, 16, [18, 20, 22]]] as const) {
    const dx = (l[dist]!.x - l[prox]!.x) * 0.15, dy = (l[dist]!.y - l[prox]!.y) * 0.15;
    for (const j of [dist, ...rest]) { l[j]!.x += dx; l[j]!.y += dy; }
  }
  return { ...f, landmarks: l };
});
const chain = (...t: Tf[]): Tf => (fs, d) => t.reduce((a, f) => f(a, d), fs);

const PERTURB: Array<[string, Tf]> = [
  ['base', (f) => f],
  ['noise1', noise(0.01)],
  ['noise2', noise(0.02)],
  ['distalVis', distalVis(0.3, 0.7)],
  ['farVis', farVis(0.2, 0.6)],
  ['feetVis', (fs) => map(fs, (lm, i) => i >= 27 ? { ...lm, visibility: 0.3 + 0.4 * rnd() } : lm)],
  ['flicker3', (fs) => map(fs, (lm, i, _f, k) => i >= 27 && (k * 7919) % 100 < 3 ? { ...lm, visibility: 0.2 } : lm)],
  ['rightNear', chain(rightNear, farVis(0.75, 0.9))],
  ['yaw20', yaw(20)],
  ['yaw45', yaw(45)],
  ['yaw90', yaw(90)],
  ['rom85', rom(0.85)],
  ['fast', tempo(0.6)],
  ['slow', tempo(1.7)],
  ['mirror', mirror],
  ['offCtr', offCentre],
  ['limbs', limbs],
  ['zLike', zLike],
  ['REAL', chain(yaw(20), rom(0.9), noise(0.008), farVis(0.4, 0.8), distalVis(0.45, 0.95))],
];

interface Out { n: number; gate: string }
function run(def: ExerciseDef, frames: PoseFrame[], baseline?: number): Out {
  const s = new MotionSession(def);
  let untracked = 0;
  const framing = new Map<string, number>();
  for (const f of frames) {
    const l = s.push(f, ASPECT);
    if (!l.tracking) { untracked++; framing.set(l.framing!, (framing.get(l.framing!) ?? 0) + 1); }
  }
  const r = s.finish();
  const n = def.mode === 'reps' ? r.reps?.count ?? 0 : def.mode === 'hold' ? Math.round(r.hold?.totalSec ?? 0) : (r.events ?? []).filter((e) => !e.faults.some((x) => /doesn't|beyond|left the camera|Body position/.test(x))).length;
  const pctU = untracked / frames.length;
  const mism = r.mismatched.length;
  let gate = '';
  if (baseline !== undefined && n < Math.max(1, Math.round(baseline * 0.5))) {
    if (pctU > 0.15) gate = `F(${Math.round(pctU * 100)}%:${[...framing].sort((a, b) => b[1] - a[1])[0]![0].slice(0, 22)})`;
    else if (mism) gate = `M:${r.mismatched[0]!.reason.replace(def.name, '').slice(0, 34)}`;
    else if (r.reps?.rejected) gate = `T(minRep x${r.reps.rejected})`;
    else gate = def.mode === 'hold' ? 'Z(hold bands)' : def.mode === 'event' ? 'E(no trigger)' : 'D(driver never crossed)';
  }
  return { n, gate };
}

// Diagnostic, ~17 s: run with REALISM=1 npm test -w @fitzen/engines
it.skipIf(!process.env.REALISM)('realism stress table', () => {
  const lines: string[] = [];
  const fails: Record<string, number> = {};
  const gates: Record<string, Record<string, number>> = {};
  for (const def of EXERCISES) {
    seed = 12345;
    const frames = simulateExercise(def, { reps: 6, seed: 3, aspect: ASPECT });
    const base = run(def, frames).n;
    const cells: string[] = [];
    for (const [name, tf] of PERTURB) {
      const o = run(def, tf(frames, def), base);
      cells.push(`${name}=${o.n}${o.gate ? ' ' + o.gate : ''}`);
      if (o.gate) {
        fails[name] = (fails[name] ?? 0) + 1;
        const g = o.gate.slice(0, 1);
        (gates[name] ??= {})[g] = (gates[name]![g] ?? 0) + 1;
      }
    }
    lines.push(`${def.id} [${def.camera}/${def.mode}] ${cells.filter((c) => c.includes(' ') || c.startsWith('base')).join(' | ')}`);
  }
  console.log(lines.join('\n'));
  console.log('\nFAILS per perturbation (of 90; F=framing M=movement-mismatch D=driver never crossed Z=hold bands T=minRep E=no event):');
  for (const [name] of PERTURB) console.log(`${name.padEnd(10)} ${String(fails[name] ?? 0).padStart(3)}  ${JSON.stringify(gates[name] ?? {})}`);
}, 600_000);
