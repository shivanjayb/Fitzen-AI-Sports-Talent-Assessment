import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replaceAll('import.meta.env', 'globalThis.__identityEnv'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/import .* from '@supabase\/supabase-js';/, 'const createClient = globalThis.__identityCreateClient;')
  .replace(/import .* from 'react';/, 'const useSyncExternalStore = (_subscribe, snapshot) => snapshot();');
let count = 0;
async function load({ configured = true, initial = Promise.resolve({ data: { session: null } }), queryError = null } = {}) {
  let notify;
  globalThis.__identityEnv = configured ? { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' } : {};
  globalThis.__identityCreateClient = (_url, _key, options) => {
    assert.equal(options.auth.persistSession, true);
    return {
      auth: { onAuthStateChange: (f) => { notify = f; }, getSession: () => initial },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: queryError }) }) }) }),
    };
  };
  const api = await import(`data:text/javascript;base64,${Buffer.from(compiled + `\n// instance ${++count}`).toString('base64')}`);
  return { ...api, notify: (...args) => notify(...args) };
}
const tick = () => new Promise((r) => setImmediate(r));

test('unconfigured authentication exposes guest state immediately', async () => {
  const api = await load({ configured: false });
  assert.deepEqual(api.useIdentity(), { ready: true, user: null });
  assert.equal(api.storageOwner(), 'guest');
});
test('a late initial session cannot overwrite a newer sign-in or account switch', async () => {
  let resolve;
  const initial = new Promise((r) => { resolve = r; });
  const api = await load({ initial });
  assert.equal(api.useIdentity().ready, false);
  api.notify('SIGNED_IN', { user: { id: 'new-athlete' } });
  resolve({ data: { session: { user: { id: 'old-athlete' } } } }); await tick();
  assert.equal(api.storageOwner(), 'new-athlete');
  api.notify('SIGNED_IN', { user: { id: 'other-athlete' } });
  assert.equal(api.storageOwner(), 'other-athlete');
  api.notify('SIGNED_OUT', null);
  assert.equal(api.storageOwner(), 'guest');
});
test('stored sessions restore the correct account namespace', async () => {
  const api = await load({ initial: Promise.resolve({ data: { session: { user: { id: 'returning-athlete' } } } }) });
  await tick(); assert.equal(api.useIdentity().ready, true); assert.equal(api.storageOwner(), 'returning-athlete');
});
test('failed initial restore releases the loading state for guest use', async () => {
  const initial = new Promise((_resolve, reject) => setImmediate(() => reject(Error('Offline'))));
  const api = await load({ initial }); await tick();
  assert.deepEqual(api.useIdentity(), { ready: true, user: null });
});
test('profile queries expose schema/network errors rather than treating them as a new account', async () => {
  const api = await load({ initial: Promise.resolve({ data: { session: { user: { id: 'athlete' } } } }), queryError: Error('profiles unavailable') });
  await assert.rejects(api.getAccount(), /profiles unavailable/);
});
