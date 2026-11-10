import type { ImageClassificationOutput, ProgressInfo } from '@huggingface/transformers';

// ponytail: loaded from jsDelivr (pinned to the installed version) instead of bundled, so the 21 MB ONNX runtime is not precached by the service worker for every user.
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

export const MODEL = 'onnx-community/swin-finetuned-food101-ONNX';
export type WorkerIn = { id: number; image: Blob };
export type WorkerOut =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'result'; id: number; labels: { label: string; score: number }[] }
  | { type: 'error'; id: number; message: string };

const post = (m: WorkerOut) => postMessage(m);
const progress_callback = (p: ProgressInfo) => { if (p.status === 'progress') post({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); };
type Gpu = { gpu?: { requestAdapter(): Promise<unknown> } };

const load = async () => {
  const { env, pipeline, RawImage } = await (import(/* @vite-ignore */ CDN) as Promise<typeof import('@huggingface/transformers')>);
  env.allowLocalModels = false;
  const gpu = await (navigator as Navigator & Gpu).gpu?.requestAdapter().catch(() => null);
  const make = (device: 'webgpu' | 'wasm') => pipeline('image-classification', MODEL, { device, dtype: 'q8', progress_callback });
  return { RawImage, classify: await (gpu ? make('webgpu').catch(() => make('wasm')) : make('wasm')) };
};
let classifier: ReturnType<typeof load> | null = null;

onmessage = async ({ data }: MessageEvent<WorkerIn>) => {
  try {
    classifier ??= load();
    const { RawImage, classify } = await classifier;
    const out = await classify(await RawImage.fromBlob(data.image), { top_k: 3 });
    post({ type: 'result', id: data.id, labels: (out as ImageClassificationOutput).map(({ label, score }) => ({ label, score })) });
  } catch (e) {
    classifier = null;
    post({ type: 'error', id: data.id, message: e instanceof Error ? e.message : String(e) });
  }
};
