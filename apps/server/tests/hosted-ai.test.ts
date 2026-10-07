import { afterEach, expect, it, vi } from 'vitest';
import { POST } from '../../../api/ai.ts';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('keeps youth-app hosted advice off before authentication or provider calls, even when configured', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'dummy-test-key');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://accounts.invalid');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'dummy-anon-key');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const response = await POST(new Request('https://fitzen.invalid/api/ai', {
    method: 'POST', headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify({ messages: [{ role: 'user', text: 'My personal measurements' }], context: 'age: 14' }),
  }));
  expect(response.status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
