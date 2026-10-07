import { expect, it } from 'vitest';
import { parseEnvelope } from '../src/services/assessmentService.ts';
const metrics = {
  jumpHeightM: .3, jumpHeightCiLow: .29, jumpHeightCiHigh: .31, flightTimeS: .5,
  peakPowerW: 1000, relativePowerWkg: 15, symmetryScore: 90, movementQuality: 90,
  confidence: .9, effectiveFps: 30, countermovementDepth: .1, qualityFlags: [],
};
const envelope = (m: unknown) => ({ signed: { signature: 'sig', payloadHash: 'hash', payload: {
  clientId: 'test-client-1', athleteId: 'athlete', test: 'vertical_jump', capturedAt: '2026-10-07T00:00:00Z', metrics: m,
} } });
it.each([NaN, Infinity, '30', null, undefined])('rejects malformed signed numbers without silently coercing %s', (value) => {
  expect(() => parseEnvelope(envelope({ ...metrics, jumpHeightM: value }), 'athlete')).toThrow('finite number');
});
it('rejects null payloads and malformed optional metrics', () => {
  expect(() => parseEnvelope({ signed: { payload: null } }, 'athlete')).toThrow('missing the signed payload');
  expect(() => parseEnvelope(envelope({ ...metrics, validReps: NaN }), 'athlete')).toThrow('finite number');
});
it('preserves the original signed payload exactly', () => {
  const body = envelope(metrics);
  expect(parseEnvelope(body, 'athlete').signed).toBe(body.signed);
});
