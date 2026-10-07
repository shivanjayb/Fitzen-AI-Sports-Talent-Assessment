import { describe, expect, it } from 'vitest';
import { GYM } from './gym.js';
import { CALISTHENICS } from './calisthenics.js';

// Rep rules must be internally consistent: a rep starts past `enter`, ends past `exit`, and the full-range
// `target` must be scorable green by the driver's own bottom check.
describe('gym + calisthenics rep rules', () => {
  for (const d of [...GYM, ...CALISTHENICS]) {
    if (!d.reps) continue;
    const r = d.reps;
    it(d.id, () => {
      const s = r.start === 'high' ? 1 : -1;
      expect(s * r.exit).toBeGreaterThan(s * r.enter);
      expect(s * r.enter).toBeGreaterThan(s * r.target);
      const bottom = d.checks.find((c) => c.angle === r.driver && c.when === 'bottom');
      expect(bottom, 'driver needs a bottom check').toBeDefined();
      expect(r.target).toBeGreaterThanOrEqual(bottom!.good[0]);
      expect(r.target).toBeLessThanOrEqual(bottom!.good[1]);
    });
  }
});
