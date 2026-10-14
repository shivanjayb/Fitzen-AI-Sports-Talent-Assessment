import type { CSSProperties } from 'react';

const COLORS = ['var(--ring-move, #fa114f)', 'var(--ring-exercise, #92e82a)', 'var(--ring-stand, #00d9ff)'];

const TICKS = Array.from({ length: 36 }, (_, i) => i * 10);

/**
 * Three concentric progress rings, outer to inner; each value is a 0–1 fraction (clamped). Rings fill on mount and
 * pulse when closed. Fitzen's own touch: a protractor dial (a tick every 10°, longer every 90°) and a joint-angle
 * glyph in the centre, because every number in the app comes from measured joint angles.
 */
export default function Rings({ values, size = 112 }: { values: number[]; size?: number }) {
  return (
    <svg className="rings" viewBox="-7 -7 134 134" width={size} height={size} role="img" aria-label={`Rings: ${values.slice(0, 3).map((v) => `${Math.round(Math.min(1, Math.max(0, v || 0)) * 100)}%`).join(', ')}`}>
      {values.slice(0, 3).map((v, i) => {
        const r = 52 - i * 15, c = 2 * Math.PI * r, f = Math.min(1, Math.max(0, v || 0));
        return (
          <g key={i} stroke={COLORS[i]}>
            <circle cx="60" cy="60" r={r} opacity="0.25" />
            {f > 0 && <circle className={f >= 1 ? 'closed' : 'val'} cx="60" cy="60" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - f)} transform="rotate(-90 60 60)" style={{ '--c': c } as CSSProperties} />}
          </g>
        );
      })}
      <g className="dial" aria-hidden>
        {TICKS.map((a) => <line key={a} x1="60" y1={a % 90 ? -3.5 : -6} x2="60" y2="-0.5" transform={`rotate(${a} 60 60)`} />)}
        <path className="joint" d="M51.5 64.5 60 60l9.5 1.5" />
        <path className="arc" d="M56 62a4.5 4.5 0 0 1 8.4-1.3" />
        <circle className="dot" cx="60" cy="60" r="2.6" />
      </g>
    </svg>
  );
}
