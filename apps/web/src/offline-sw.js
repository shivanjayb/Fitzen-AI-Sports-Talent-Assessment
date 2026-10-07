const APP = 'fitzen-static-__BUILD_ID__';
const POSE = 'fitzen-pose-v1';
const ASSETS = __OFFLINE_ASSETS__;
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm/';
const models = ['lite', 'full', 'heavy'];
const poseUrls = (model) => [
  ...['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'].map((x) => WASM + x),
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${model}/float16/1/pose_landmarker_${model}.task`,
];
const allowedPose = new Set(models.flatMap(poseUrls));
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('fitzen-static-') && key !== APP) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(fetch(request).catch(async () => (await caches.open(APP)).match('/index.html')));
    return;
  }
  const isPose = allowedPose.has(url.href);
  if (!isPose && !(url.origin === self.location.origin && ASSETS.includes(url.pathname))) return;
  event.respondWith((async () => {
    const cache = await caches.open(isPose ? POSE : APP);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') await cache.put(request, response.clone());
    return response;
  })());
});
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_POSE' || !models.includes(event.data.model)) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(POSE);
      await cache.addAll(poseUrls(event.data.model));
      event.ports[0]?.postMessage({ ok: true });
    } catch { event.ports[0]?.postMessage({ ok: false }); }
  })());
});
