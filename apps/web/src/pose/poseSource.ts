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

import { simulateJump, simulatePushupSession, simulateSquatSession, type PoseFrame } from '@fitzen/engines';


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

    let lastVideoTime = -1;
    const loop = () => {
      if (this.stopped || !this.landmarker) return;
      if (video.currentTime !== lastVideoTime && video.videoWidth > 0) {
        lastVideoTime = video.currentTime;
        const nowMs = performance.now();
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
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.rafId);
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

  constructor(callbacks: PoseSourceCallbacks, file: File, model: PoseModel = 'lite') {
    this.callbacks = callbacks;
    this.file = file;
    this.model = model;
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

    // Seek-based decoding: step the timeline at a fixed 30 fps and run the
    // landmarker on each decoded frame. Unlike realtime playback this is
    // deterministic, immune to background-tab/power-saving pauses, and works
    // at full quality even on devices too slow to keep up in real time.
    const SAMPLE_FPS = 30;
    const step = 1 / SAMPLE_FPS;
    const duration = video.duration;

    const seekTo = (t: number) =>
      new Promise<boolean>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve(true);
        };
        video.addEventListener('seeked', onSeeked);
        window.setTimeout(() => {
          video.removeEventListener('seeked', onSeeked);
          resolve(video.readyState >= 2);
        }, 2000);
        video.currentTime = Math.min(t, Math.max(0, duration - 0.001));
      });

    let lastPct = -1;
    for (let t = 0; t < duration; t += step) {
      if (this.stopped || !this.landmarker) return;
      const ok = await seekTo(t);
      if (!ok || video.videoWidth === 0) continue;
      const result = this.landmarker.detectForVideo(video, Math.round(t * 1000));
      const lm = result.landmarks?.[0];
      if (lm && lm.length >= 33) {
        this.callbacks.onFrame({
          timestampMs: t * 1000,
          landmarks: lm.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
            visibility: p.visibility ?? 0.9,
          })),
        });
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

export interface SimulationOptions {

  jumpHeightM?: number;
  athleteHeightCm: number;
  fps?: number;
  exerciseType?: 'vertical_jump' | 'pushup' | 'squat';
}

export class SimulationPoseSource implements PoseSource {
  readonly kind = 'simulation' as const;
  private callbacks: PoseSourceCallbacks;
  private options: SimulationOptions;
  private timer = 0;
  private stopped = false;

  constructor(callbacks: PoseSourceCallbacks, options: SimulationOptions) {
    this.callbacks = callbacks;
    this.options = options;
  }

  async start(): Promise<void> {
    this.stopped = false;
    const fps = this.options.fps ?? 30;
    const type = this.options.exerciseType ?? 'squat';

    let frames: PoseFrame[] = [];
    if (type === 'pushup') {
      frames = simulatePushupSession({ targetReps: 5, fps, includeFormError: true });
    } else if (type === 'squat') {
      frames = simulateSquatSession({ targetReps: 5, fps, includeFormError: true });
    } else {
      const jumpHeight = this.options.jumpHeightM ?? 0.34 + Math.random() * 0.18;
      frames = simulateJump({
        jumpHeightM: jumpHeight,
        athleteHeightCm: this.options.athleteHeightCm,
        fps,
        asymmetry: Math.random() * 0.25,
        seed: Math.floor(Math.random() * 100000),
        noise: 0.004,
      });
    }

    this.callbacks.onStatus('Guided demo running');

    const startWall = performance.now();
    let index = 0;
    const tick = () => {
      if (this.stopped) return;
      const elapsed = performance.now() - startWall;
      while (index < frames.length && frames[index]!.timestampMs <= elapsed) {
        const frame = frames[index]!;
        this.callbacks.onFrame({ ...frame, timestampMs: startWall + frame.timestampMs });
        index++;
      }
      if (index >= frames.length) {
        this.callbacks.onStatus('Demo complete');
        return;
      }
      this.timer = window.setTimeout(tick, 1000 / fps);
    };
    tick();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
