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

const load = async () => {
  const { env, pipeline, RawImage } = await (import(/* @vite-ignore */ CDN) as Promise<typeof import('@huggingface/transformers')>);
  env.allowLocalModels = false;
  // q8 = model_quantized.onnx, 93 MB vs 352 MB fp32 with near-identical top-1 on Food-101. WASM only: WebGPU int8 kernels are patchy and fail at inference time.
  return { RawImage, classify: await pipeline('image-classification', MODEL, { device: 'wasm', dtype: 'q8', progress_callback }) };
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
