import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const load = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};

const { c2paFlags } = await load('../src/app/c2pa.ts');

const store = (state, sourceType, failure = []) => ({
  active_manifest: 'urn:m1',
  validation_state: state,
  validation_results: { activeManifest: { success: [], informational: [], failure } },
  manifests: {
    'urn:m1': {
      claim_generator_info: [{ name: 'Example Generator' }],
      signature_info: { issuer: 'Example CA' },
      assertions: sourceType ? [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created', digitalSourceType: sourceType }] } }] : [],
    },
  },
});
const codes = (flags) => flags.map((f) => `${f.code}:${f.severity}`);

test('a validly signed AI-generated clip is a strong flag naming the signer', () => {
  const flags = c2paFlags(store('Valid', 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'));
  assert.deepEqual(codes(flags), ['c2pa-ai-generated:strong']);
  assert.match(flags[0].message, /Example CA/);
  assert.match(flags[0].evidence, /trainedAlgorithmicMedia/);
});

test('a hash mismatch means the clip changed after signing: strong tamper flag', () => {
  const flags = c2paFlags(store('Invalid', 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture', [{ code: 'assertion.bmffHash.mismatch' }]));
  assert.deepEqual(codes(flags), ['c2pa-tampered:strong']);
});

test('other validation failures only warn: the claims cannot be trusted', () => {
  assert.deepEqual(codes(c2paFlags(store('Invalid', undefined, [{ code: 'claimSignature.missing' }]))), ['c2pa-invalid:warn']);
});

test('a valid camera capture is informational, and screen recordings warn', () => {
  assert.deepEqual(codes(c2paFlags(store('Valid', 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture'))), ['c2pa-verified:info']);
  assert.deepEqual(codes(c2paFlags(store('Trusted', 'http://cv.iptc.org/newscodes/digitalsourcetype/screenCapture'))), ['c2pa-screen-capture:warn', 'c2pa-verified:info']);
});
