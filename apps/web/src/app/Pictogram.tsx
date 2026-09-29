import { simulateExercise, type ExerciseDef } from '@fitzen/engines';

const BONES: Array<[number, number]> = [[11, 13], [13, 15], [11, 23], [23, 25], [25, 27], [27, 31], [11, 12], [23, 24], [12, 14], [14, 16], [24, 26], [26, 28], [28, 32]];
const cache = new Map<string, string>();

/** SVG path of the exercise's most characteristic pose (frame furthest from the start). */
function pathFor(def: ExerciseDef): { d: string; head: [number, number] } {
  const frames = simulateExercise(def, { reps: 2, seed: 1 });
  const f0 = frames[0]!.landmarks;
  let best = frames[0]!, bestD = -1;
  for (const f of frames) {
    let d = 0;
    for (const i of [15, 16, 23, 25, 27]) d += (f.landmarks[i]!.x - f0[i]!.x) ** 2 * 3.16 + (f.landmarks[i]!.y - f0[i]!.y) ** 2;
    if (d > bestD) { bestD = d; best = f; }
  }
  const pts = best.landmarks.map((p) => ({ x: p.x * (16 / 9), y: p.y }));
  const used = [0, ...BONES.flat()];
  const xs = used.map((i) => pts[i]!.x), ys = used.map((i) => pts[i]!.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = 80 / Math.max(maxX - minX, maxY - minY, 1e-3);
  const T = (i: number) => [50 + (pts[i]!.x - (minX + maxX) / 2) * sc, 50 + (pts[i]!.y - (minY + maxY) / 2) * sc] as [number, number];
  const d = BONES.map(([a, b]) => { const p = T(a), q = T(b); return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`; }).join('');
  return { d, head: T(0) };
}

export default function Pictogram({ def, size = 50 }: { def: ExerciseDef; size?: number }) {
  let key = cache.get(def.id);
  if (!key) { const p = pathFor(def); key = JSON.stringify(p); cache.set(def.id, key); }
  const { d, head } = JSON.parse(key) as { d: string; head: [number, number] };
  return (
    <div className="ex-glyph" style={{ width: size, height: size, borderRadius: size * 0.32 }} aria-hidden>
      <svg viewBox="0 0 100 100" width={size * 0.82} height={size * 0.82}>
        <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-2)" /></linearGradient></defs>
        <path d={d} stroke="url(#pg)" strokeWidth="7" strokeLinecap="round" fill="none" />
        <circle cx={head[0]} cy={head[1]} r="7" fill="url(#pg)" />
      </svg>
    </div>
  );
}
