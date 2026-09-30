// Fitzen OneEuro vs the authors' reference (casiez/OneEuroFilter, Python, BSD-3-Clause).
// Fixtures produced by fixtures/gen_oneeuro.py with the same params as FILTER.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FILTER, OneEuro } from '../engine.js';

const load = (n: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/oneEuro_${n}.json`, import.meta.url), 'utf8')) as {
    params: { mincutoff: number; beta: number; dcutoff: number }; tMs: number[]; x: number[]; y: number[];
  };

describe('OneEuro matches reference implementation', () => {
  for (const name of ['uniform30', 'jitter30']) {
    it(name, () => {
      const fx = load(name);
      expect(fx.params).toEqual({ mincutoff: FILTER.minCutoff, beta: FILTER.beta, dcutoff: FILTER.dCutoff });
      expect(fx.x.length).toBe(300);
      const f = new OneEuro();
      const err = Math.max(...fx.x.map((v, i) => Math.abs(f.filter(v, fx.tMs[i]!) - fx.y[i]!)));
      console.log(`${name}: max |fitzen - reference| = ${err.toExponential(3)}`);
      expect(err).toBeLessThan(1e-9);
    });
  }
});
