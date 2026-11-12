import type { WorkerIn, WorkerOut } from './classify.worker';

export type Prediction = { label: string; score: number };
export type Download = { loaded: number; total: number };

let worker: Worker | null = null;
let next = 0;
const files = new Map<string, Download>();

/** Lazily starts the on-device Food-101 classifier worker; the model downloads once and is then served from the browser Cache API. */
export function recognizeFood(image: Blob, onDownload: (d: Download) => void): Promise<Prediction[]> {
  worker ??= new Worker(new URL('./classify.worker.ts', import.meta.url), { type: 'module' });
  const w = worker, id = ++next;
  return new Promise((resolve, reject) => {
    const listen = ({ data }: MessageEvent<WorkerOut>) => {
      if (data.type === 'progress') {
        files.set(data.file, { loaded: data.loaded, total: data.total });
        const all = [...files.values()];
        onDownload({ loaded: all.reduce((a, f) => a + f.loaded, 0), total: all.reduce((a, f) => a + f.total, 0) });
        return;
      }
      if (data.id !== id) return;
      w.removeEventListener('message', listen); w.removeEventListener('error', crash);
      if (data.type === 'result') resolve(data.labels); else reject(Error(data.message));
    };
    // A crashed worker (out of memory, blocked script) never answers; reject and start a fresh one next time.
    const crash = () => { w.removeEventListener('message', listen); if (worker === w) { worker.terminate(); worker = null; files.clear(); } reject(Error('The food model stopped unexpectedly.')); };
    w.addEventListener('message', listen);
    w.addEventListener('error', crash, { once: true });
    w.postMessage({ id, image } satisfies WorkerIn);
  });
}
