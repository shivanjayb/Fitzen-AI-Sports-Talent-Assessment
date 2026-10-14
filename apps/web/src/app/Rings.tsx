import type { CSSProperties } from 'react';

const COLORS = ['var(--ring-move, #fa114f)', 'var(--ring-exercise, #92e82a)', 'var(--ring-stand, #00d9ff)'];

/** Three concentric activity rings, outer to inner; each value is a 0–1 fraction (clamped). Rings fill on mount and pulse when closed. */
export default function Rings({ values, size = 112 }: { values: number[]; size?: number }) {
  return (
    <svg className="rings" viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Rings: ${values.slice(0, 3).map((v) => `${Math.round(Math.min(1, Math.max(0, v || 0)) * 100)}%`).join(', ')}`}>
      {values.slice(0, 3).map((v, i) => {
        const r = 52 - i * 15, c = 2 * Math.PI * r, f = Math.min(1, Math.max(0, v || 0));
        return (
          <g key={i} stroke={COLORS[i]}>
            <circle cx="60" cy="60" r={r} opacity="0.25" />
            {f > 0 && <circle className={f >= 1 ? 'closed' : 'val'} cx="60" cy="60" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - f)} transform="rotate(-90 60 60)" style={{ '--c': c } as CSSProperties} />}
          </g>
        );
      })}
    </svg>
  );
}
