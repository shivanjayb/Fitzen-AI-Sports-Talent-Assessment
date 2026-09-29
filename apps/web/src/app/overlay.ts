/**
 * Live skeleton renderer: bones and joints tinted by form zone, angle arcs
 * and value pills at every measured joint.
 */
import type { LiveState, PoseFrame, Zone } from '@fitzen/engines';

const BONES: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [15, 19], [16, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 31], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 32], [28, 30], [30, 32],
];
const COLORS: Record<Zone, string> = { good: '#30d158', ok: '#ffd60a', bad: '#ff453a' };

export function drawOverlay(canvas: HTMLCanvasElement, frame: PoseFrame | null, live: LiveState | null, mirror: boolean): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!frame) return;
  const s = Math.max(1, Math.min(W, H) / 540);
  const P = (i: number) => {
    const p = frame.landmarks[i];
    return p ? { x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H, v: p.visibility ?? 1 } : null;
  };
  const zoneBone = (a: number, b: number) => live?.boneZones[`${Math.min(a, b)}-${Math.max(a, b)}`];

  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    const p = P(a), q = P(b);
    if (!p || !q || p.v < 0.3 || q.v < 0.3) continue;
    const z = zoneBone(a, b);
    ctx.strokeStyle = z ? COLORS[z] : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = (z ? 7 : 4) * s;
    ctx.shadowColor = z ? COLORS[z] : 'transparent';
    ctx.shadowBlur = z ? 18 * s : 0;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // Head
  const nose = P(0);
  if (nose && nose.v > 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(nose.x, nose.y, 6 * s, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 11; i <= 32; i++) {
    if (i >= 17 && i <= 22) continue;
    const p = P(i);
    if (!p || p.v < 0.3) continue;
    const z = live?.jointZones[i];
    ctx.fillStyle = z ? COLORS[z] : '#fff';
    ctx.beginPath(); ctx.arc(p.x, p.y, (z ? 7 : 4.5) * s, 0, Math.PI * 2); ctx.fill();
    if (z) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2 * s; ctx.stroke(); }
  }

  if (!live) return;
  // Angle arcs + pills at each measured joint
  ctx.font = `700 ${13 * s}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [id, chain] of Object.entries(live.anchors)) {
    const r = live.angles[id];
    if (!r || chain.length < 2) continue;
    const color = r.zone ? COLORS[r.zone] : 'rgba(255,255,255,0.8)';
    let lx: number, ly: number;
    if (chain.length === 3) {
      const a = P(chain[0]!), b = P(chain[1]!), c = P(chain[2]!);
      if (!a || !b || !c) continue;
      const t1 = Math.atan2(a.y - b.y, a.x - b.x), t2 = Math.atan2(c.y - b.y, c.x - b.x);
      let d = t2 - t1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const R = 26 * s;
      ctx.fillStyle = color + '33'; ctx.strokeStyle = color; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, R, t1, t1 + d, d < 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(b.x, b.y, R, t1, t1 + d, d < 0); ctx.stroke();
      const mid = t1 + d / 2 + Math.PI; // label on the outside of the angle
      lx = b.x + Math.cos(mid) * 44 * s; ly = b.y + Math.sin(mid) * 44 * s;
    } else {
      const a = P(chain[0]!), b = P(chain[1]!);
      if (!a || !b) continue;
      lx = (a.x + b.x) / 2 + 34 * s; ly = (a.y + b.y) / 2;
    }
    const text = `${Math.round(r.value)}°`;
    const w = ctx.measureText(text).width + 16 * s, h = 22 * s;
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    ctx.beginPath(); ctx.roundRect(lx - w / 2, ly - h / 2, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5 * s; ctx.stroke();
    ctx.fillStyle = color; ctx.fillText(text, lx, ly + 0.5);
  }
}
