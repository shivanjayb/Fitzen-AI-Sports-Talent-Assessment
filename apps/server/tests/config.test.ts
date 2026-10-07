import { afterEach, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.ts';

afterEach(() => vi.unstubAllEnvs());
it('requires a private database configuration outside tests and does not fall back to client keys', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://client-project.invalid');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'client-anon-key');
  expect(() => loadConfig()).toThrow('SUPABASE_URL and SUPABASE_SECRET_KEY');
});
it('rejects missing or weak production JWT secrets', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('FITZEN_JWT_SECRET', '');
  expect(() => loadConfig()).toThrow('at least 32');
  vi.stubEnv('FITZEN_JWT_SECRET', 'known-short-key');
  expect(() => loadConfig()).toThrow('at least 32');
});
it('uses only explicitly isolated dummy persistence in tests', () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  // Empty settings are missing settings, not valid configuration.
  vi.stubEnv('SUPABASE_URL', undefined);
  vi.stubEnv('SUPABASE_SECRET_KEY', undefined);
  const a = loadConfig(), b = loadConfig();
  expect(a.supabaseUrl).toBe('https://test.supabase.invalid');
  expect(a.supabaseKey).toBe('test-only-key');
  expect(a.jwtSecret).not.toBe(b.jwtSecret);
});
