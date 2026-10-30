import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/app/wellnessStore.ts', import.meta.url), 'utf8');
async function store({ owner = 'guest', failStorage = false, client = null } = {}) {
  const state = { owner, disk: new Map(), client };
  const rewritten = source.replace(/import \{ isMissingSchema, storageOwner, supabase \} from '..\/lib\/supabase';/, `const storageOwner = () => globalThis.__wellnessTest.owner; const supabase = globalThis.__wellnessTest.client; const isMissingSchema = (e) => e?.code === '42P01';`);
  globalThis.__wellnessTest = state;
  globalThis.localStorage = { getItem: (k) => state.disk.get(k) ?? null, setItem: (k, v) => { if (failStorage) throw Error('full'); state.disk.set(k, v); }, removeItem: (k) => state.disk.delete(k) };
  const compiled = ts.transpileModule(rewritten, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${Math.random()}`);
  return { state, api };
}
const input = (patch = {}) => ({ kind: 'body', date: '2026-01-01', title: 'Morning', note: '', unit: '', values: { weight: 72 }, ...patch });

test('wellness validation rejects invalid dates, nonfinite values, out-of-range and missing required measurements', async () => {
  const { api } = await store();
  for (const value of [input({ date: '2026-02-30' }), input({ date: '2099-01-01' }), input({ values: { weight: NaN } }), input({ values: { weight: 0 } }), input({ values: { unknown: 5 } }), input({ kind: '__proto__', values: { rhr: 55 } }), input({ values: JSON.parse('{"__proto__":4}') }), input({ kind: 'sleep', values: {} }), input({ kind: 'journal', values: { mood: 2.5 } }), input({ kind: 'blood-records', values: { value: 5, low: 9, high: 2 }, unit: 'mmol/L' })]) assert.ok(api.validateWellness(value));
  assert.equal(api.validateWellness(input()), null);
  assert.equal(api.validateWellness(input({ kind: 'sleep', values: { hours: 0 } })), null);
});
test('create, edit, delete and undo preserve record identity and monotonic revisions', async () => {
  const { api } = await store();
  const first = api.saveWellnessRecord(input());
  const edited = api.saveWellnessRecord(input({ id: first.id, values: { weight: 73 } }));
  assert.equal(api.getWellnessRecords().length, 1);
  assert.equal(edited.id, first.id); assert.ok(edited.updatedAt > first.updatedAt);
  api.deleteWellnessRecord(first.id); assert.equal(api.getWellnessRecords().length, 0);
  api.restoreWellnessRecord(edited); assert.equal(api.getWellnessRecords()[0].values.weight, 73);
});
test('guest and accounts stay isolated and stale actions cannot mutate the next account', async () => {
  const { api, state } = await store();
  const record = api.saveWellnessRecord(input());
  state.owner = 'account-a'; assert.deepEqual(api.getWellnessRecords(), []);
  assert.throws(() => api.saveWellnessRecord(input(), 'guest'), /account changed/);
  assert.throws(() => api.deleteWellnessRecord(record.id, 'guest'), /account changed/);
  assert.throws(() => api.restoreWellnessRecord(record, 'guest'), /account changed/);
  api.saveWellnessRecord(input({ values: { weight: 81 } }));
  state.owner = 'guest'; assert.equal(api.getWellnessRecords()[0].values.weight, 72);
});
test('storage failure preserves this tab and clearly reports that it is not persistent', async () => {
  const { api } = await store({ failStorage: true });
  api.saveWellnessRecord(input());
  assert.equal(api.getWellnessRecords().length, 1); assert.match(api.getWellnessSyncStatus(), /until this tab closes/);
});
test('missing schema retains pending changes and reports setup required', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'a' } } } }) }, from: () => ({ upsert: async () => ({ error: { code: '42P01' } }) }) };
  const { api, state } = await store({ owner: 'a', client });
  api.saveWellnessRecord(input()); await api.syncWellness();
  assert.match(api.getWellnessSyncStatus(), /database update/);
  assert.equal(JSON.parse(state.disk.get('fitzen.wellness.v1.a')).pending.length, 1);
});
test('account switch during a request never imports remote records into another owner', async () => {
  let resolve; const gate = new Promise((r) => resolve = r);
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'a' } } } }) }, from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: async () => { await gate; return { data: [{ id: 'remote', kind: 'body', recorded_on: '2026-01-01', title: 'A', note: '', unit: '', values: { weight: 99 }, updated_at: '2026-01-01T00:00:00Z' }], error: null }; } }) }) }) }) };
  const { api, state } = await store({ owner: 'a', client });
  const syncing = api.syncWellness(); await new Promise((r) => setTimeout(r, 0)); state.owner = 'b'; resolve(); await syncing;
  assert.deepEqual(api.getWellnessRecords(), []); assert.equal(state.disk.has('fitzen.wellness.v1.b'), false);
});
test('purge only removes the active owner and leaves another account and guest records intact', async () => {
  const { api, state } = await store();
  api.saveWellnessRecord(input()); state.owner = 'a'; api.saveWellnessRecord(input());
  await api.purgeWellnessRecords(); assert.deepEqual(api.getWellnessRecords(), []);
  state.owner = 'guest'; assert.equal(api.getWellnessRecords().length, 1);
});
test('edits made during an upload remain pending and receive a second successful sync pass', async () => {
  let resolve, pushes = []; const gate = new Promise((r) => resolve = r);
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'a' } } } }) }, from: () => ({
    upsert: async (rows) => { pushes.push(rows); if (pushes.length === 1) await gate; return { error: null }; },
    select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }),
  }) };
  const { api, state } = await store({ owner: 'a', client });
  const first = api.saveWellnessRecord(input());
  await new Promise((r) => setTimeout(r, 0));
  api.saveWellnessRecord(input({ id: first.id, values: { weight: 73 } }));
  resolve(); await api.syncWellness(); await new Promise((r) => setTimeout(r, 10));
  assert.equal(pushes.length, 2); assert.equal(pushes[1][0].values.weight, 73);
  assert.deepEqual(JSON.parse(state.disk.get('fitzen.wellness.v1.a')).pending, []);
});
