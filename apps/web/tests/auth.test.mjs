import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { authDestination, callbackError, requestSignIn, passwordAuth, signOut } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('sign-in destinations reject external, encoded and unknown routes', () => {
  for (const path of [null, '//evil.example', 'https://evil.example', '/auth', '/auth/callback', '/profile/../../evil', '/profile\\evil', '/%2f%2fevil', '/profile\n']) assert.equal(authDestination(path), '/profile');
  for (const path of ['/compete', '/profile#account', '/guided?run=123', '/consent?child=uuid']) assert.equal(authDestination(path), path);
});
test('callback errors never display provider-supplied descriptions', () => {
  assert.match(callbackError('', '#error=access_denied&error_description=secret'), /expired/);
  assert.match(callbackError('?error_code=otp_expired', ''), /expired/);
  assert.match(callbackError('?error=server_error&error_description=secret', ''), /could not/);
  assert.equal(callbackError('?next=%2Fcompete', '#access_token=secret'), null);
});
test('email sign-in normalizes input and sends a same-origin callback with a safe destination', async () => {
  let payload;
  const client = { auth: { signInWithOtp: async (p) => { payload = p; return { error: null }; } } };
  await requestSignIn(client, ' Athlete@Example.com ', 'https://fitzen.vercel.app', '/compete');
  assert.deepEqual(payload, { email: 'athlete@example.com', options: { shouldCreateUser: true, emailRedirectTo: 'https://fitzen.vercel.app/auth/callback?next=%2Fcompete' } });
  await requestSignIn(client, 'athlete@example.com', 'https://fitzen.vercel.app', '//evil.example');
  assert.equal(new URL(payload.options.emailRedirectTo).searchParams.get('next'), '/profile');
});
test('unconfigured or invalid email sign-in fails before any network request', async () => {
  await assert.rejects(requestSignIn(null, 'athlete@example.com', 'https://fitzen.vercel.app', '/profile'), /not configured/);
  const client = { auth: { signInWithOtp: () => { throw Error('Network must not run'); } } };
  await assert.rejects(requestSignIn(client, 'bad-email', 'https://fitzen.vercel.app', '/profile'), /valid email/);
});
test('sign-in network and rate-limit failures propagate for recovery', async () => {
  for (const failure of [Error('Rate limited'), Error('Network unavailable')]) {
    const client = { auth: { signInWithOtp: async () => ({ error: failure }) } };
    await assert.rejects(requestSignIn(client, 'athlete@example.com', 'https://fitzen.vercel.app', '/profile'), (e) => e === failure);
  }
});
test('sign-out is scoped to this device and surfaces failures', async () => {
  let scope;
  const client = { auth: { signOut: async (p) => { scope = p.scope; return { error: null }; } } };
  await signOut(client); assert.equal(scope, 'local');
  await signOut(null);
  await assert.rejects(signOut({ auth: { signOut: async () => ({ error: Error('Offline') }) } }), /Offline/);
});

test('password sign-in and sign-up validate before the network and keep a safe callback', async () => {
  const calls = [];
  const client = { auth: {
    signInWithPassword: async (p) => { calls.push(['in', p]); return { error: p.password === 'right-pass' ? null : { message: 'Invalid login credentials' } }; },
    signUp: async (p) => { calls.push(['up', p]); return { data: { session: null }, error: null }; },
  } };
  await assert.rejects(passwordAuth(client, 'a@b.co', 'short', false, 'https://f.app', '/coach'), /8 characters/);
  await assert.rejects(passwordAuth(client, 'nope', 'long-enough', false, 'https://f.app', '/coach'), /valid email/);
  assert.equal(calls.length, 0);
  assert.equal(await passwordAuth(client, ' A@B.co ', 'right-pass', false, 'https://f.app', '/coach'), 'signed-in');
  await assert.rejects(passwordAuth(client, 'a@b.co', 'wrong-pass', false, 'https://f.app', '/coach'), /Wrong email or password/);
  assert.equal(await passwordAuth(client, 'a@b.co', 'long-enough', true, 'https://f.app', '//evil'), 'confirm-email');
  assert.equal(calls.at(-1)[1].options.emailRedirectTo, 'https://f.app/auth/callback?next=%2Fprofile');
  assert.equal(authDestination('/admin'), '/admin');
});

test('sign-up with an address that already has an account explains instead of claiming an email was sent', async () => {
  const client = { auth: { signUp: async () => ({ data: { user: { id: 'x', identities: [] }, session: null }, error: null }) } };
  await assert.rejects(passwordAuth(client, 'a@b.co', 'long-enough', true, 'https://f.app', '/profile'), /already has a Fitzen account/);
});
