import { useEffect, useState } from 'react';
import { Shell } from '../components/Shell';
import { Chip, Skeleton } from '../components/ui';
import { api, type BadgeWithDate } from '../lib/api';
import { formatDate } from '../lib/format';

const TIER_TONES = { bronze: 'neutral', silver: 'neutral', gold: 'warning', platinum: 'accent' } as const;
const GLYPHS: Record<string, string> = {
  rocket: '🚀', flame: '🔥', 'trending-up': '📈', zap: '⚡', bolt: '💪',
  scale: '⚖️', target: '🎯', calendar: '📅', award: '🏆', sparkles: '✨',
  star: '⭐', dumbbell: '🏋️', muscle: '🦾', crown: '👑', shield: '🛡️', trophy: '🏆',
};

type CategoryFilter = 'all' | 'jump' | 'pushup' | 'squat' | 'power' | 'quality' | 'streak';

export default function BadgesPage() {
  const [badges, setBadges] = useState<BadgeWithDate[] | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('squat');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    api.badges().then(({ badges }) => setBadges(badges)).catch(() => setBadges([]));
  }, []);

  const safeBadges = Array.isArray(badges) ? badges : [];
  const earned = safeBadges.filter((b) => b?.earned);

  const filteredBadges = safeBadges.filter((b) => {
    const matchesCategory = activeCategory === 'all' || (b as unknown as { category?: string }).category === activeCategory;
    const matchesSearch =
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <Shell
      title="Achievement Trophy Room"
      actions={badges ? <Chip tone="accent">🏆 {earned.length} / {badges.length} Unlocked</Chip> : undefined}
    >
      {/* Category Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div className="fz-segment" role="tablist" aria-label="Badge category filter">
            <button role="tab" aria-selected={activeCategory === 'all'} className={activeCategory === 'all' ? 'active' : ''} onClick={() => setActiveCategory('all')}>All ({badges?.length ?? 50})</button>
            <button role="tab" aria-selected={activeCategory === 'jump'} className={activeCategory === 'jump' ? 'active' : ''} onClick={() => setActiveCategory('jump')}>🚀 Jump</button>
            <button role="tab" aria-selected={activeCategory === 'pushup'} className={activeCategory === 'pushup' ? 'active' : ''} onClick={() => setActiveCategory('pushup')}>💪 Push-Up</button>
            <button role="tab" aria-selected={activeCategory === 'squat'} className={activeCategory === 'squat' ? 'active' : ''} onClick={() => setActiveCategory('squat')}>🏋️ Squats</button>
            <button role="tab" aria-selected={activeCategory === 'power'} className={activeCategory === 'power' ? 'active' : ''} onClick={() => setActiveCategory('power')}>⚡ Power</button>
            <button role="tab" aria-selected={activeCategory === 'quality'} className={activeCategory === 'quality' ? 'active' : ''} onClick={() => setActiveCategory('quality')}>🎯 Form</button>
            <button role="tab" aria-selected={activeCategory === 'streak'} className={activeCategory === 'streak' ? 'active' : ''} onClick={() => setActiveCategory('streak')}>🔥 Streaks</button>
          </div>

          <input
            type="search"
            placeholder="Search 50 badges..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              fontSize: 'var(--text-sm)',
              width: '220px',
            }}
          />
        </div>
      </div>

      {!badges ? (
        <div className="fz-card"><Skeleton height={260} /></div>
      ) : filteredBadges?.length === 0 ? (
        <div className="fz-card" style={{ textAlign: 'center', padding: 'var(--space-5)' }}>
          <p style={{ color: 'var(--ink-mid)' }}>No badges match your search or filter.</p>
        </div>
      ) : (
        <div className="fz-badge-grid">
          {filteredBadges?.map((badge) => (
            <div key={badge.id} className={`fz-card fz-badge-card${badge.earned ? '' : ' fz-badge-card--locked'}`}>
              <div className="fz-badge-card__glyph" aria-hidden>{GLYPHS[badge.icon] ?? '🏅'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', justifyContent: 'space-between' }}>
                <h4>{badge.name}</h4>
                <Chip tone={TIER_TONES[badge.tier]}>{badge.tier}</Chip>
              </div>
              <p>{badge.description}</p>
              {badge.earned ? (
                <Chip tone="success">Earned{badge.earnedAt ? ` · ${formatDate(badge.earnedAt)}` : ''}</Chip>
              ) : (
                <div className="fz-meter" aria-label={`${Math.round(badge.progress * 100)}% progress`}>
                  <div className="fz-meter__track">
                    <div className="fz-meter__fill" style={{ width: `${badge.progress * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
