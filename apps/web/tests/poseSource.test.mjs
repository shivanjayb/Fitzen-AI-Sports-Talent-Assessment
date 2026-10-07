import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/pose/poseSource.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace("await import('@mediapipe/tasks-vision')", 'globalThis.__poseVision'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { CameraPoseSource, VideoFilePoseSource, MAX_VIDEO_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let frameLoop;
const originals = new Map(['navigator', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', '__poseVision'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
afterEach(() => { for (const [k, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; } });
function setup({ getUserMedia = async () => stream(), create = async () => model() } = {}) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia } } });
  globalThis.window = globalThis;
  globalThis.requestAnimationFrame = cb => { frameLoop = cb; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.__poseVision = { FilesetResolver: { forVisionTasks: async () => ({}) }, PoseLandmarker: { createFromOptions: create } };
}
function stream() { const track = { stopped: 0, stop() { this.stopped++; } }; return { track, getTracks: () => [track] }; }
function model() { return { closed: 0, close() { this.closed++; }, detectForVideo() { return { landmarks: [] }; } }; }
function video() {
  const listeners = new Map();
  return { srcObject: null, readyState: 2, duration: 1, videoWidth: 640, currentTime: 0,
    play: async () => {}, pause() {}, load() {}, removeAttribute() {},
    addEventListener(k, fn) { listeners.set(k, fn); }, removeEventListener(k) { listeners.delete(k); },
    dispatch(k) { listeners.get(k)?.(); }, listeners };
}
function callbacks() { return { frames: [], errors: [], statuses: [], onFrame(f) { this.frames.push(f); }, onStatus(s) { this.statuses.push(s); }, onError(e) { this.errors.push(e); } }; }
const tick = () => new Promise(r => setImmediate(r));

test('camera stops stream granted after cancellation without attaching it', async () => {
  const pending = deferred(), media = stream(), v = video(), cb = callbacks();
  setup({ getUserMedia: () => pending.promise });
  const source = new CameraPoseSource(cb), started = source.start(v);
  source.stop(); pending.resolve(media); await started;
  assert.equal(media.track.stopped, 1); assert.equal(v.srcObject, null); assert.deepEqual(cb.errors, []);
});
test('camera closes a model that finishes loading after stop', async () => {
  const pending = deferred(), m = model(), media = stream(); setup({ create: () => pending.promise, getUserMedia: async () => media });
  const cb = callbacks(), source = new CameraPoseSource(cb), started = source.start(video());
  await tick(); source.stop(); pending.resolve(m); await started;
  assert.equal(m.closed, 1); assert.equal(media.track.stopped, 1); assert.ok(!cb.statuses.includes('Tracking'));
});
test('camera play rejection cleans stream and reports an error without rejecting start', async () => {
  const media = stream(), v = video(), cb = callbacks(); v.play = async () => { throw Error('play'); }; setup({ getUserMedia: async () => media });
  await new CameraPoseSource(cb).start(v); assert.equal(media.track.stopped, 1); assert.equal(v.srcObject, null); assert.equal(cb.errors.length, 1);
});
test('camera emits empty landmarks for unsuccessful detections', async () => {
  setup(); const cb = callbacks(), source = new CameraPoseSource(cb); await source.start(video()); frameLoop(); source.stop();
  assert.equal(cb.frames.length, 1); assert.deepEqual(cb.frames[0].landmarks, []);
});
test('video closes a late model without starting decoding', async () => {
  const pending = deferred(), m = model(), cb = callbacks(), v = video(); setup({ create: () => pending.promise });
  const source = new VideoFilePoseSource(cb, new File(['clip'], 'test.mp4')), started = source.start(v);
  await tick(); source.stop(); pending.resolve(m); await started; assert.equal(m.closed, 1); assert.equal(v.src, undefined); assert.deepEqual(cb.errors, []);
});
test('video cancellation during a seek settles start and removes listeners', async () => {
  const m = model(), cb = callbacks(), v = video(); setup({ create: async () => m });
  const source = new VideoFilePoseSource(cb, new File(['clip'], 'test.mp4')), started = source.start(v);
  await tick(); assert.ok(v.listeners.has('seeked')); source.stop(); await started;
  assert.equal(m.closed, 1); assert.equal(v.listeners.size, 0); assert.deepEqual(cb.frames, []); assert.deepEqual(cb.errors, []);
});
test('video cancellation while metadata loads settles start without error', async () => {
  const cb = callbacks(), v = video(); v.readyState = 0; setup();
  const source = new VideoFilePoseSource(cb, new File(['clip'], 'test.mp4')), started = source.start(v);
  await tick(); source.stop(); await started; assert.equal(v.onloadedmetadata, null); assert.equal(v.onerror, null); assert.deepEqual(cb.errors, []);
});
test('oversized and overlong videos fail before processing', async () => {
  let creates = 0; setup({ create: async () => { creates++; return model(); } }); const cb = callbacks();
  await new VideoFilePoseSource(cb, { size: MAX_VIDEO_BYTES + 1 }).start(video()); assert.equal(creates, 0);
  const v = video(); v.duration = 121; await new VideoFilePoseSource(cb, new File(['clip'], 'test.mp4')).start(v);
  assert.equal(cb.errors.length, 2); assert.equal(v.listeners.size, 0);
});
test('video retains no-pose frames for tracking coverage and closes resources on completion', async () => {
  const m = model(), cb = callbacks(), v = video(); v.duration = 0.02; setup({ create: async () => m });
  Object.defineProperty(v, 'currentTime', { get() { return 0; }, set() { queueMicrotask(() => v.dispatch('seeked')); } });
  const source = new VideoFilePoseSource(cb, new File(['clip'], 'test.mp4')); await source.start(v);
  assert.equal(cb.frames.length, 1); assert.deepEqual(cb.frames[0].landmarks, []); assert.equal(source.frames.length, 1); assert.equal(m.closed, 1); assert.ok(cb.statuses.includes('Video complete'));
});
test('video detection failure is reported and cleaned without an unhandled start rejection', async () => {
  const m = model(), cb = callbacks(), v = video(); v.duration = 0.02; m.detectForVideo = () => { throw Error('GPU lost'); }; setup({ create: async () => m });
  Object.defineProperty(v, 'currentTime', { get() { return 0; }, set() { queueMicrotask(() => v.dispatch('seeked')); } });
  await new VideoFilePoseSource(cb, new File(['clip'], 'test.mp4')).start(v);
  assert.equal(cb.errors.length, 1); assert.equal(m.closed, 1); assert.ok(!cb.statuses.includes('Video complete'));
});
test('restarting camera cannot revive the older pending acquisition', async () => {
  const pending = deferred(), stale = stream(), current = stream(), m = model(); let calls = 0;
  setup({ getUserMedia: () => ++calls === 1 ? pending.promise : Promise.resolve(current), create: async () => m });
  const source = new CameraPoseSource(callbacks()), firstVideo = video(), secondVideo = video(), first = source.start(firstVideo);
  await source.start(secondVideo); pending.resolve(stale); await first;
  assert.equal(stale.track.stopped, 1); assert.equal(current.track.stopped, 0); assert.equal(firstVideo.srcObject, null); assert.equal(secondVideo.srcObject, current);
  source.stop(); assert.equal(current.track.stopped, 1); assert.equal(m.closed, 1);
});
test('video preserves portrait aspect after completion releases decoded media', async () => {
  const cb = callbacks(), v = video(); v.duration = 0.02; v.videoWidth = 900; v.videoHeight = 1600;
  v.load = () => { v.videoWidth = 0; v.videoHeight = 0; }; setup();
  Object.defineProperty(v, 'currentTime', { get() { return 0; }, set() { queueMicrotask(() => v.dispatch('seeked')); } });
  const source = new VideoFilePoseSource(cb, new File(['clip'], 'test.mp4')); await source.start(v);
  assert.equal(v.videoWidth, 0); assert.equal(source.aspect, 900 / 1600);
});
