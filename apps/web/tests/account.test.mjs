import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const load = async (path, replace = (s) => s) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const js = replace(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};

const { authMessage, authProblem } = await load('../src/x/authMessage.ts');

test('sign-in errors become plain, actionable text', () => {
  // lib/auth.ts rethrows non-credential sign-in errors as a bare Error(message): the code is lost.
  assert.equal(authProblem(new Error('Email not confirmed')), 'unconfirmed');
  assert.equal(authProblem({ code: 'email_not_confirmed', message: 'x' }), 'unconfirmed');
  assert.match(authMessage(new Error('Email not confirmed')), /Resend/);
  assert.match(authMessage({ status: 429, message: 'For security purposes, you can only request this after 37 seconds.' }), /Wait 37 seconds/);
  assert.match(authMessage({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), /Wait a minute/);
  assert.match(authMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), /offline/);
  const wrong = 'Wrong email or password. Forgot it? Use an email link instead, then set a new password in Profile.';
  assert.equal(authMessage(new Error(wrong)), wrong);
  assert.equal(authMessage(null), 'Could not sign in. Check your connection and try again.');
  assert.equal(authMessage('boom', 'Could not send the link.'), 'Could not send the link.');
});

const day = 864e5;
const session = (daysAgo, value = 30) => ({ report: { exerciseId: 'push-up', name: 'Push-up', startedAt: new Date(Date.now() - daysAgo * day).toISOString(), value } });
let history = [];
globalThis.__store = { history: () => history };
const { localAdvice } = await load('../src/app/assistantContext.ts', (js) => js
  .replace(/import \{[^}]*\} from '@fitzen\/engines';/, "const exerciseById = (id) => ({ name: id }); const summarizeFuture = () => null;")
  .replace(/import \{[^}]*\} from '\.\/store';/, `const s = globalThis.__store;
    const getHistory = () => s.history(), getProfile = () => ({}), getSession = () => null, isEligibleSession = () => true,
      measureOf = (r) => ({ value: r.value, unit: 'reps' }), toAthlete = () => null;`));

test('local coach answers empty history without crashing', () => {
  history = [];
  for (const kind of ['progress', 'leaderboard']) assert.match(localAdvice({ kind, exerciseId: 'push-up', scope: 'world', rows: [] }, ''), /No eligible real assessments/);
  assert.match(localAdvice({ kind: 'result', sessionId: 'missing' }, ''), /cannot support/);
  assert.match(localAdvice({ kind: 'help' }, ''), /Choose a test/);
});

test('typed Ask-bar questions are routed, not answered with unrelated setup text', () => {
  history = [session(1, 32), session(10, 30), session(40, 25)];
  assert.match(localAdvice({ kind: 'help' }, 'how am I progressing?'), /3 eligible retained sessions/);
  assert.match(localAdvice({ kind: 'help' }, 'Am I training often enough?'), /2 eligible sessions in the last 4 weeks \(about 0\.5 a week\)/);
  assert.match(localAdvice({ kind: 'help' }, 'what does the red color mean'), /Green means/);
  const unknown = localAdvice({ kind: 'help' }, 'what is the capital of France');
  assert.match(unknown, /only answer from your saved sessions/);
  assert.doesNotMatch(localAdvice({ kind: 'help' }, 'How do I record a jump?'), /only answer/);
});
