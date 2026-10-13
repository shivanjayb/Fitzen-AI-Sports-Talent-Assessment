const COLORS = ['var(--move)', 'var(--exercise)', 'var(--stand)'];

/** Three concentric progress rings, outer to inner; each value is a 0–1 fraction (clamped). */
export default function Rings({ values, size = 112 }: { values: number[]; size?: number }) {
  return (
    <svg className="rings" viewBox="0 0 120 120" width={size} height={size} aria-hidden>
      {values.slice(0, 3).map((v, i) => {
        const r = 52 - i * 15, c = 2 * Math.PI * r;
        return (
          <g key={i} stroke={COLORS[i]}>
            <circle cx="60" cy="60" r={r} opacity="0.22" />
            <circle cx="60" cy="60" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, v || 0)))} transform="rotate(-90 60 60)" />
          </g>
        );
      })}
    </svg>
  );
}
