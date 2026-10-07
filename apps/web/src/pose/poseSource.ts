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
  private stream: MediaStream | null = null;
  private rafId = 0;
  private video: HTMLVideoElement | null = null;
  private landmarker: import('@mediapipe/tasks-vision').PoseLandmarker | null = null;
  private generation = 0;

  constructor(private callbacks: PoseSourceCallbacks, private opts: Partial<{ facingMode: 'user' | 'environment'; model: PoseModel }> = {}) {}

  async start(video: HTMLVideoElement | null): Promise<void> {
    this.stop();
    const run = this.generation;
    if (!video) { this.callbacks.onError('Camera source requires a video element'); return; }
    this.callbacks.onStatus('Requesting camera…');
    let stage = 'camera';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.opts.facingMode ?? 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (run !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      this.video = video;
      video.srcObject = stream;
      await video.play();
      if (run !== this.generation) return;
      stage = 'model';
      this.callbacks.onStatus('Loading pose model…');
      const landmarker = await createLandmarker(this.opts.model);
      if (run !== this.generation) { landmarker.close(); return; }
      this.landmarker = landmarker;
      this.callbacks.onStatus('Tracking');

      // Prefer capture timestamps over display time; enforce MediaPipe's monotonic clock.
      const rvfc = typeof video.requestVideoFrameCallback === 'function';
      let lastVideoTime = -1;
      let lastTs = -Infinity;
      const loop = (_now?: number, meta?: { captureTime?: number }) => {
        if (run !== this.generation || !this.landmarker) return;
        try {
          if ((rvfc || video.currentTime !== lastVideoTime) && video.videoWidth > 0) {
            lastVideoTime = video.currentTime;
            const nowMs = Math.max(meta?.captureTime ?? performance.now(), lastTs + 0.001);
            lastTs = nowMs;
            const lm = this.landmarker.detectForVideo(video, nowMs).landmarks?.[0];
            this.callbacks.onFrame({ timestampMs: nowMs, landmarks: lm && lm.length >= 33
              ? lm.map(p => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0.9 })) : [] });
          }
          if (run === this.generation) schedule();
        } catch {
          this.stop();
          this.callbacks.onError('Pose tracking stopped unexpectedly. Please try again.');
        }
      };
      const schedule = () => {
        this.rafId = rvfc ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(() => loop());
      };
      schedule();
    } catch {
      if (run !== this.generation) return;
      this.stop();
      this.callbacks.onError(stage === 'camera'
        ? 'Camera unavailable or permission denied. You can still use Guided Demo mode.'
        : 'Could not load the pose model (first load needs a network connection).');
    }
  }

  stop(): void {
    this.generation++;
    if (this.video && typeof this.video.cancelVideoFrameCallback === 'function') this.video.cancelVideoFrameCallback(this.rafId);
    else cancelAnimationFrame(this.rafId);
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    this.video = null;
  }
}

/** Bound memory use for retained raw landmarks and file inspection. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 120;

export class VideoFilePoseSource implements PoseSource {
  readonly kind = 'video' as const;
  private callbacks: PoseSourceCallbacks;
  private file: File;
  private landmarker: import('@mediapipe/tasks-vision').PoseLandmarker | null = null;
  private generation = 0;
  private cancelWait: (() => void) | null = null;
  private objectUrl: string | null = null;
  private video: HTMLVideoElement | null = null;

  private model: PoseModel;
  private nativeFps: number | undefined;
  private videoAspect = 16 / 9;
  get aspect(): number { return this.videoAspect; }
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
    this.stop();
    const run = this.generation;
    this.frames.length = 0;
    if (!video) { this.callbacks.onError('Video source requires a video element'); return; }
    if (this.file.size > MAX_VIDEO_BYTES) { this.callbacks.onError('Choose a video smaller than 100 MB.'); return; }
    this.video = video;
    try { await this.process(video, run); }
    catch {
      if (run !== this.generation) return;
      this.stop();
      this.callbacks.onError('Could not process this video. Try a shorter MP4 (H.264) or WebM clip.');
    }
  }

  private async process(video: HTMLVideoElement, run: number): Promise<void> {
    this.callbacks.onStatus('Loading pose model…');
    try {
      const landmarker = await createLandmarker(this.model);
      if (run !== this.generation) { landmarker.close(); return; }
      this.landmarker = landmarker;
    } catch {
      if (run !== this.generation) return;
      this.callbacks.onError(
        'Could not load the pose model (first load needs a network connection).',
      );
      this.stop();
      return;
    }
    if (run !== this.generation) return;

    this.objectUrl = URL.createObjectURL(this.file);
    video.srcObject = null;
    video.src = this.objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const metadataOk = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        window.clearTimeout(timer);
        video.onloadedmetadata = null;
        video.onerror = null;
        this.cancelWait = null;
        resolve(ok);
      };
      const timer = window.setTimeout(() => done(video.readyState >= 1), 8000);
      this.cancelWait = () => done(false);
      video.onloadedmetadata = () => done(true);
      video.onerror = () => done(false);
      if (video.readyState >= 1) done(true);
    });
    if (run !== this.generation) return;
    if (!metadataOk || !Number.isFinite(video.duration) || video.duration <= 0) {
      this.callbacks.onError('Could not read this video file — try MP4 (H.264) or WebM.');
      this.stop();
      return;
    }

    if (video.duration > MAX_VIDEO_SECONDS) {
      this.callbacks.onError('Choose a video no longer than 2 minutes.');
      this.stop();
      return;
    }

    this.videoAspect = video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;

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
        let frameCallback = 0;
        let fallbackTimer = 0;
        const finish = (v: number | null) => {
          if (done) return;
          done = true;
          window.clearTimeout(timeout);
          window.clearTimeout(fallbackTimer);
          if (frameCallback) video.cancelVideoFrameCallback(frameCallback);
          video.removeEventListener('seeked', onSeeked);
          this.cancelWait = null;
          resolve(v);
        };
        // After 'seeked' the new frame is composited and rvfc fires with its mediaTime. If it does not fire within
        // 250 ms (e.g. the seek landed on the frame already shown, or a background tab), fall back to the start of the
        // native frame containing currentTime (the mid-frame seek target): the same PTS rvfc reports for a clip starting
        // at 0, so mixing the two never adds a half-frame step to dt.
        const grid = () => Math.floor(video.currentTime * native) / native;
        const onSeeked = () => {
          if (!rvfc) { finish(grid()); return; }
          frameCallback = video.requestVideoFrameCallback((_now, meta) => finish(meta.mediaTime));
          fallbackTimer = window.setTimeout(() => finish(grid()), 250);
        };
        video.addEventListener('seeked', onSeeked);
        const timeout = window.setTimeout(() => finish(video.readyState >= 2 ? grid() : null), 2000);
        this.cancelWait = () => finish(null);
        video.currentTime = Math.min(t, Math.max(0, duration - 0.001));
      });

    let lastPct = -1;
    let lastMs = -Infinity;
    // Seek to the middle of a native frame so the decoder lands unambiguously on it. (Not step/2: when decimating by an
    // even factor that is exactly a frame boundary, and the decoder may show either neighbour.)
    for (let t = 0.5 / native; t < duration; t += step) {
      if (run !== this.generation || !this.landmarker) return;
      const mediaTime = await seekTo(t);
      if (run !== this.generation || !this.landmarker) return;
      if (mediaTime === null || video.videoWidth === 0) continue;
      const ms = mediaTime * 1000;
      if (ms <= lastMs) continue; // rvfc says this is a frame we already analysed (VFR clip, sub-frame step)
      lastMs = ms;
      const result = this.landmarker.detectForVideo(video, ms);
      const lm = result.landmarks?.[0];
      const frame: PoseFrame = {
        timestampMs: ms,
        landmarks: lm && lm.length >= 33
          ? lm.map(p => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0.9 })) : [],
      };
      this.frames.push(frame);
      this.callbacks.onFrame(frame);
      if (run !== this.generation) return;
      const pct = Math.floor((t / duration) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        this.callbacks.onStatus(`Processing video… ${pct}%`);
      }
    }
    if (run === this.generation) {
      this.stop();
      this.callbacks.onStatus('Video complete');
    }
  }

  stop(): void {
    this.generation++;
    this.cancelWait?.();
    this.cancelWait = null;
    this.landmarker?.close();
    this.landmarker = null;
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.video = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
