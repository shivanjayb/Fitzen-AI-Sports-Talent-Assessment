/**
 * Pose frame sources.
 *
 * `CameraPoseSource` runs MediaPipe PoseLandmarker on-device against the
 * phone/laptop camera (WASM, GPU-accelerated where available; model file is
 * cached by the browser after first load so subsequent runs work offline).
 *
 * `VideoFilePoseSource` processes a pre-recorded clip (e.g. shot with the
 * phone's own camera app) by playing it back and running the same landmarker
 * over each decoded frame, using the video's own timeline for physics-true
 * timestamps.
 *
 * `SimulationPoseSource` replays a physically-accurate synthesized jump
 * through the exact same interface — the entire capture → analyze → sign →
 * sync pipeline is exercisable with no camera and no network.
 */

import type { PoseFrame } from '@fitzen/engines';


export interface PoseSourceCallbacks {
  onFrame: (frame: PoseFrame) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
}

export interface PoseSource {
  /** Attach to a <video> element (camera/file) or drive a fake clock (simulation). */
  start(video: HTMLVideoElement | null): Promise<void>;
  stop(): void;
  readonly kind: 'camera' | 'simulation' | 'video';
}

/** Shared MediaPipe loader (camera + video-file sources). */
export type PoseModel = 'lite' | 'full' | 'heavy';

async function createLandmarker(model: PoseModel = 'lite'): Promise<import('@mediapipe/tasks-vision').PoseLandmarker> {
  const vision = await import('@mediapipe/tasks-vision');
  const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
  return vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL(model), delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

const MEDIAPIPE_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const POSE_MODEL_URL = (m: PoseModel) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`;

export class CameraPoseSource implements PoseSource {
  readonly kind = 'camera' as const;
  private callbacks: PoseSourceCallbacks;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private video: HTMLVideoElement | null = null;
  private landmarker: import('@mediapipe/tasks-vision').PoseLandmarker | null = null;
  private stopped = false;
  private opts: { facingMode: 'user' | 'environment'; model: PoseModel };

  constructor(callbacks: PoseSourceCallbacks, opts: Partial<{ facingMode: 'user' | 'environment'; model: PoseModel }> = {}) {
    this.callbacks = callbacks;
    this.opts = { facingMode: 'environment', model: 'lite', ...opts };
  }

  async start(video: HTMLVideoElement | null): Promise<void> {
    if (!video) throw new Error('Camera source requires a video element');
    this.stopped = false;
    this.callbacks.onStatus('Requesting camera…');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.opts.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch {
      this.callbacks.onError(
        'Camera unavailable or permission denied. You can still use Guided Demo mode.',
      );
      return;
    }
    video.srcObject = this.stream;
    await video.play();

    this.callbacks.onStatus('Loading pose model…');
    try {
      this.landmarker = await createLandmarker(this.opts.model);
    } catch {
      this.callbacks.onError(
        'Could not load the pose model (first load needs a network connection).',
      );
      this.stop();
      return;
    }
    if (this.stopped) return;
    this.callbacks.onStatus('Tracking');

    // Stamp frames with the camera capture time (requestVideoFrameCallback metadata.captureTime), not the rAF
    // time, which adds up to one display interval of jitter to every dt. WICG video-rvfc. rAF is the fallback.
    const rvfc = typeof video.requestVideoFrameCallback === 'function';
    let lastVideoTime = -1;
    let lastTs = -Infinity;
    const loop = (_now?: number, meta?: { captureTime?: number }) => {
      if (this.stopped || !this.landmarker) return;
      if ((rvfc || video.currentTime !== lastVideoTime) && video.videoWidth > 0) {
        lastVideoTime = video.currentTime;
        const nowMs = Math.max(meta?.captureTime ?? performance.now(), lastTs + 0.001); // detectForVideo needs monotonic time
        lastTs = nowMs;
        const result = this.landmarker.detectForVideo(video, nowMs);
        const lm = result.landmarks?.[0];
        if (lm && lm.length >= 33) {
          this.callbacks.onFrame({
            timestampMs: nowMs,
            landmarks: lm.map((p) => ({
              x: p.x,
              y: p.y,
              z: p.z,
              visibility: p.visibility ?? 0.9,
            })),
          });
        }
      }
      schedule();
    };
    const schedule = () => {
      if (rvfc) this.rafId = video.requestVideoFrameCallback(loop);
      else this.rafId = requestAnimationFrame(() => loop());
    };
    this.video = video;
    schedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.video && typeof this.video.cancelVideoFrameCallback === 'function') this.video.cancelVideoFrameCallback(this.rafId);
    else cancelAnimationFrame(this.rafId);
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

export class VideoFilePoseSource implements PoseSource {
  readonly kind = 'video' as const;
  private callbacks: PoseSourceCallbacks;
  private file: File;
  private landmarker: import('@mediapipe/tasks-vision').PoseLandmarker | null = null;
  private rafId = 0;
  private stopped = false;
  private objectUrl: string | null = null;
  private video: HTMLVideoElement | null = null;

  private model: PoseModel;
  private nativeFps: number | undefined;
  /** Every detected frame, in order (raw landmarks, no smoothing) — for offline filtering and integrity checks. */
  readonly frames: PoseFrame[] = [];

  /** `nativeFps`: the container's frame rate (inspectContainer → metadata.nominalFps); 30 when unknown. */
  constructor(callbacks: PoseSourceCallbacks, file: File, model: PoseModel = 'lite', nativeFps?: number) {
    this.callbacks = callbacks;
    this.file = file;
    this.model = model;
    this.nativeFps = nativeFps;
  }

  async start(video: HTMLVideoElement | null): Promise<void> {
    if (!video) throw new Error('Video source requires a video element');
    this.stopped = false;
    this.video = video;

    this.callbacks.onStatus('Loading pose model…');
    try {
      this.landmarker = await createLandmarker(this.model);
    } catch {
      this.callbacks.onError(
        'Could not load the pose model (first load needs a network connection).',
      );
      this.stop();
      return;
    }
    if (this.stopped) return;

    this.objectUrl = URL.createObjectURL(this.file);
    video.srcObject = null;
    video.src = this.objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const metadataOk = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => resolve(ok);
      video.onloadedmetadata = () => done(true);
      video.onerror = () => done(false);
      window.setTimeout(() => done(video.readyState >= 1), 8000);
    });
    if (!metadataOk || !Number.isFinite(video.duration) || video.duration <= 0) {
      this.callbacks.onError('Could not read this video file — try MP4 (H.264) or WebM.');
      this.stop();
      return;
    }

    // Seek-based decoding: step the timeline once per native frame and run the landmarker on each decoded frame.
    // Unlike realtime playback this is deterministic, immune to background-tab/power-saving pauses, and works at
    // full quality on devices too slow to keep up in real time. Sampling at the container's own rate uses every
    // real frame: at a fixed 30 fps a 60 fps clip loses half its frames and a 25 fps clip gets duplicates, and
    // flight-time jump height quantises to 1/fps. Above MAX_FPS we take every k-th frame so samples still land
    // on real frames. MAX_FPS 120: a 240 fps slow-mo clip would otherwise cost ~2× the landmarker time for
    // little gain (flight-time quantisation 1/120 s ≈ 8 ms ≈ 1 cm at 40 cm jumps, h = g·t²/8 → dh = g·t·dt/4).
    const MAX_FPS = 120;
    const native = this.nativeFps && this.nativeFps >= 1 && this.nativeFps <= 1000 ? this.nativeFps : 30;
    const SAMPLE_FPS = native / Math.ceil(native / MAX_FPS);
    const step = 1 / SAMPLE_FPS;
    const duration = video.duration;
    // requestVideoFrameCallback reports the presented frame's exact mediaTime (WICG video-rvfc). Without it
    // we fall back to currentTime (the seek target), which is off by up to half a frame.
    const rvfc = typeof video.requestVideoFrameCallback === 'function';

    const seekTo = (t: number) =>
      new Promise<number | null>((resolve) => {
        let done = false;
        const finish = (v: number | null) => { if (!done) { done = true; video.removeEventListener('seeked', onSeeked); resolve(v); } };
        // After 'seeked' the new frame is composited and rvfc fires with its mediaTime. If it does not fire within
        // 250 ms (e.g. the seek landed on the frame already shown), fall back to currentTime, i.e. the seek target.
        const onSeeked = () => {
          if (!rvfc) { finish(video.currentTime); return; }
          video.requestVideoFrameCallback((_now, meta) => finish(meta.mediaTime));
          window.setTimeout(() => finish(video.currentTime), 250);
        };
        video.addEventListener('seeked', onSeeked);
        window.setTimeout(() => finish(video.readyState >= 2 ? video.currentTime : null), 2000);
        video.currentTime = Math.min(t, Math.max(0, duration - 0.001));
      });

    let lastPct = -1;
    let lastMs = -Infinity;
    // Seek to the middle of each frame interval so the decoder lands unambiguously on one frame.
    for (let t = step / 2; t < duration; t += step) {
      if (this.stopped || !this.landmarker) return;
      const mediaTime = await seekTo(t);
      if (mediaTime === null || video.videoWidth === 0) continue;
      const ms = mediaTime * 1000;
      if (ms <= lastMs) continue; // rvfc says this is a frame we already analysed (VFR clip, sub-frame step)
      lastMs = ms;
      const result = this.landmarker.detectForVideo(video, ms);
      const lm = result.landmarks?.[0];
      if (lm && lm.length >= 33) {
        const frame: PoseFrame = {
          timestampMs: ms,
          landmarks: lm.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
            visibility: p.visibility ?? 0.9,
          })),
        };
        this.frames.push(frame);
        this.callbacks.onFrame(frame);
      }
      const pct = Math.floor((t / duration) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        this.callbacks.onStatus(`Processing video… ${pct}%`);
      }
    }
    if (!this.stopped) this.callbacks.onStatus('Video complete');
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.rafId);
    this.landmarker?.close();
    this.landmarker = null;
    this.video?.pause();
    this.video = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
