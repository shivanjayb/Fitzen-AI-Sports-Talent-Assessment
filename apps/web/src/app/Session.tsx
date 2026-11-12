import { getLanguage, t } from './language';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MotionSession, ViewAngleTracker, analyseIntegrity, exerciseById, filtfiltLandmarks, inspectContainer, simulateExercise, uploadCutoffHz, type ForensicsReport, type LiveState, type PoseFrame } from '@fitzen/engines';
import { CameraPoseSource, VideoFilePoseSource, MAX_VIDEO_BYTES, type PoseSource } from '../pose/poseSource';
import { playRepCompletedSound } from '../lib/audioFeedback';
import { drawOverlay } from './overlay';
import { drawAthlete } from './Figure';
import { getProfile, personalFor, saveSession } from './store';
import { getPendingVideo, setPendingVideo } from './pendingVideo';
import { placementFor } from './placement';
import { IconAlert, IconBulb, IconCamera, IconCheck, IconClose, IconFlip, IconVolume } from './icons';
import './capture.css';

// Demo canvas matches the screen's shape so the figure is never cropped.
const DEMO_H = 900;
const screenRatio = typeof window === 'undefined' ? NaN : window.innerWidth / window.innerHeight;
// A hidden tab or zero-height viewport gives NaN/Infinity, which would blank the demo canvas.
const DEMO_W = Math.round(DEMO_H * (Number.isFinite(screenRatio) && screenRatio > 0 ? Math.max(0.5, Math.min(2, screenRatio)) : 16 / 9));
const DEMO_GROUND = DEMO_W < DEMO_H ? 0.74 : 0.86;

/**
 * Capture states. Only `active` feeds the assessment engine, so timers, counts and the report always agree:
 * loading → framing → countdown → active ⇄ paused → analysing → results; `interrupted` ends a continuous attempt.
 */
type Stage = 'loading' | 'framing' | 'countdown' | 'active' | 'paused' | 'interrupted' | 'analysing' | 'error';
type Src = 'camera' | 'video' | 'demo';

/** Replays the synthetic athlete in real time through the PoseSource interface. */
class PuppetSource implements PoseSource {
  readonly kind = 'simulation' as const;
  private timer = 0;
  constructor(private frames: PoseFrame[], private onFrame: (f: PoseFrame) => void, private onDone: () => void) {}
  async start() {
    const t0 = performance.now();
    let i = 0;
    const tick = () => {
      const el = performance.now() - t0;
      while (i < this.frames.length && this.frames[i]!.timestampMs <= el) this.onFrame({ ...this.frames[i]!, timestampMs: t0 + this.frames[i++]!.timestampMs });
      if (i >= this.frames.length) { this.onDone(); return; }
      this.timer = window.setTimeout(tick, 16);
    };
    tick();
  }
  stop() { clearTimeout(this.timer); }
}

const say = (text: string, on: boolean) => {
  if (!on || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t(text));
  u.lang = `${getLanguage()}-IN`;
  u.rate = 1.08;
  window.speechSynthesis.speak(u);
};

function Ring({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 64 64" aria-label={label}>
      <circle className="track" cx="32" cy="32" r={r} />
      <circle className="val" cx="32" cy="32" r={r} stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} />
      <text x="32" y="33">{label}</text>
    </svg>
  );
}

const Silhouette = () => (
  <svg className="silhouette" viewBox="0 0 100 220" fill="none" stroke="white" strokeWidth="2" strokeDasharray="5 5">
    <circle cx="50" cy="20" r="14" />
    <path d="M50 34v76M50 50 22 90M50 50l28 40M50 110l-20 100M50 110l20 100" />
  </svg>
);

/** Setup checks shown before the countdown. `ok: null` = not known yet. Only "body" gates the start; the rest advise. */
interface SetupCheck { id: string; label: string; ok: boolean | null; fix?: string }
const dist = (a: { x: number; y: number }, b: { x: number; y: number }, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
function setupChecks(f: PoseFrame, l: LiveState, aspect: number, side: boolean, fps: number, needFps: number, luma: number | null, yaw: { ok: boolean } | null): SetupCheck[] {
  const p = f.landmarks;
  const seen = (i: number) => (p[i]?.visibility ?? 0) >= 0.5;
  const torso = [11, 12, 23, 24].every(seen);
  let distance: SetupCheck = { id: 'distance', label: 'Distance', ok: null };
  let view: SetupCheck = { id: 'view', label: side ? 'Side-on to the camera' : 'Facing the camera', ok: null };
  if (torso) {
    const vis = p.filter((q) => (q.visibility ?? 0) >= 0.5);
    const span = Math.max(Math.max(...vis.map((q) => q.y)) - Math.min(...vis.map((q) => q.y)), (Math.max(...vis.map((q) => q.x)) - Math.min(...vis.map((q) => q.x))));
    distance = span < 0.4 ? { ...distance, ok: false, fix: 'Come closer' } : span > 0.95 ? { ...distance, ok: false, fix: 'Step back' } : { ...distance, ok: true };
    // Shoulder width over torso length: about 0.6–0.8 seen from the front, near 0 from the side.
    const mid = (a: number, b: number) => ({ x: (p[a]!.x + p[b]!.x) / 2, y: (p[a]!.y + p[b]!.y) / 2 });
    const ratio = dist(p[11]!, p[12]!, aspect) / Math.max(1e-3, dist(mid(11, 12), mid(23, 24), aspect));
    // Prefer the 3D yaw estimate; fall back to the 2D shoulder ratio when world landmarks are missing.
    view = { ...view, ok: yaw ? yaw.ok : side ? ratio < 0.45 : ratio > 0.4, fix: side ? 'Turn sideways to the camera' : 'Turn to face the camera' };
  }
  return [
    { id: 'body', label: 'Whole body in view', ok: l.tracking, fix: l.framing ?? undefined },
    distance, view,
    { id: 'light', label: 'Enough light', ok: luma === null ? null : luma >= 45, fix: 'Add light or face a window' },
    { id: 'speed', label: 'Smooth tracking', ok: fps ? fps >= needFps * 0.8 : null, fix: 'Close other apps; tracking is slow' },
  ];
}

const zoneColor = (score: number) => (score >= 85 ? 'var(--good)' : score >= 65 ? 'var(--ok)' : 'var(--bad)');
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export default function Session() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const src = (params.get('src') ?? 'camera') as Src;
  const batteryRun = params.get('battery') ?? undefined;
  const catalogDef = exerciseById(id);
  // The guided battery is a standard test: personal ranges only apply to free training.
  const def = useMemo(() => catalogDef && !batteryRun ? personalFor(catalogDef)?.def ?? catalogDef : catalogDef, [catalogDef, batteryRun]);
  const nav = useNavigate();
  const profile = useRef(getProfile()).current;
  const selectedVideo = useRef(getPendingVideo());

  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<PoseSource | null>(null);
  const session = useRef<MotionSession | null>(null);
  const probe = useRef<MotionSession | null>(null);
  const stageRef = useRef<Stage>('loading');
  const okSince = useRef<number | null>(null);
  const badSince = useRef<number | null>(null);
  const prev = useRef({ reps: 0, events: 0, cue: '' as string | null, wrong: 0 });
  const forensics = useRef<ForensicsReport | undefined>(undefined);

  const [stage, setStageState] = useState<Stage>('loading');
  const [status, setStatus] = useState('Starting…');
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [count, setCount] = useState(3);
  const [voice, setVoice] = useState(profile.voice);
  const [facing, setFacing] = useState<'user' | 'environment'>(def?.camera === 'front' ? 'user' : 'environment');
  const [flash, setFlash] = useState<{ k: number; c: string } | null>(null);
  const [setup, setSetup] = useState<SetupCheck[]>([]);
  const [steady, setSteady] = useState(0);
  const [lostFor, setLostFor] = useState(0);
  const [fps, setFps] = useState(0);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // A jump's flight is ~0.5 s: ask the camera for 60 fps and expect 30; reps and holds are fine at half that.
  const needFps = def?.mode === 'event' ? 30 : 15;
  const fpsRef = useRef({ last: 0, ema: 0 });
  const luma = useRef<{ at: number; v: number | null; cv: HTMLCanvasElement | null }>({ at: 0, v: null, cv: null });
  const lastTracked = useRef(0);
  const lastSpoke = useRef(0);
  const lostSaid = useRef(false);
  // Paused time is removed from the timestamps the engine sees, so tempo, hold time and gaps exclude the break.
  const offset = useRef(0);
  const pauseTs = useRef<number | null>(null);
  const disp = useRef<PoseFrame['landmarks']>([]);
  // Background view-angle detection: runs on every frame, records only while measuring.
  const viewTracker = useRef<ViewAngleTracker | null>(null);
  const [view, setView] = useState<{ yawDeg: number; errorDeg: number; ok: boolean } | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  // Holds, jumps, throws and the guided battery are one continuous attempt: a break invalidates it. Free rep practice may pause.
  const continuous = !!batteryRun || def?.mode !== 'reps';
  const voiceRef = useRef(voice); voiceRef.current = voice;

  const setStage = (s: Stage) => { stageRef.current = s; setStageState(s); };
  const mirror = src === 'camera' && facing === 'user';

  const finish = useCallback(() => {
    const v = video.current;
    const aspect = source.current instanceof VideoFilePoseSource ? source.current.aspect : (v?.videoWidth || 16) / (v?.videoHeight || 9);
    source.current?.stop();
    const s = session.current;
    if (!s || !def) { nav(-1); return; }
    let report = s.finish();
    let extra = {};
    if (src === 'video' && source.current instanceof VideoFilePoseSource) {
      // Offline: the live pass above was only a preview. Re-analyse the whole clip with zero-phase filtering
      // (no One Euro lag) and check the RAW landmarks for physical plausibility.
      const raw = source.current.frames;
      const offline = new MotionSession(def, { weightKg: profile.weightKg ?? undefined, smoothing: 'none' });
      for (const f of filtfiltLandmarks(raw, uploadCutoffHz(def))) offline.push(f, aspect);
      report = offline.finish();
      extra = { integrity: analyseIntegrity(raw, { aspect, statureCm: profile.heightCm ?? undefined, mode: def.mode }), forensics: forensics.current };
    }
    const sid = crypto.randomUUID();
    const viewSummary = viewTracker.current?.summary() ?? undefined;
    const persisted = saveSession({ id: sid, report, source: src, batteryRun, ...(viewSummary ? { view: viewSummary } : {}), ...extra });
    session.current = null;
    nav(`/results/${sid}`, { replace: true, state: { checkin: true, storageFailed: !persisted } });
  }, [nav, src, def, batteryRun, profile.weightKg, profile.heightCm]);

  const beginActive = useCallback(() => {
    if (!def) return;
    session.current = new MotionSession(def, { weightKg: profile.weightKg ?? undefined });
    prev.current = { reps: 0, events: 0, cue: null, wrong: 0 };
    lastTracked.current = 0; lostSaid.current = false; setLostFor(0); offset.current = 0; pauseTs.current = null; viewTracker.current?.reset();
    setStage('active');
    say(def.mode === 'hold' ? 'Hold it' : 'Go', voiceRef.current);
  }, [def, profile.weightKg]);

  const onFrame = useCallback((f: PoseFrame) => {
    if (!def) return;
    const cv = canvas.current;
    const v = video.current;
    const W = src === 'demo' ? DEMO_W : v?.videoWidth || 1280;
    const H = src === 'demo' ? DEMO_H : v?.videoHeight || 720;
    if (cv && (cv.width !== W || cv.height !== H)) { cv.width = W; cv.height = H; }
    const aspect = W / H;
    const st = stageRef.current;
    // Measured frame rate (EMA of frame intervals): what the engine actually receives, not what the camera claims.
    const fr = fpsRef.current;
    const dt = f.timestampMs - fr.last;
    if (fr.last && dt > 0 && dt < 1000) fr.ema = fr.ema ? fr.ema + 0.1 * (1000 / dt - fr.ema) : 1000 / dt;
    fr.last = f.timestampMs;
    // Scene brightness once a second from a 32×18 copy of the frame (Rec. 601 luma). Stays on the device.
    const lu = luma.current;
    if (src === 'camera' && v && v.videoWidth && f.timestampMs - lu.at > 1000) {
      lu.at = f.timestampMs;
      try {
        lu.cv ??= Object.assign(document.createElement('canvas'), { width: 32, height: 18 });
        const c2 = lu.cv.getContext('2d', { willReadFrequently: true });
        if (c2) {
          c2.drawImage(v, 0, 0, 32, 18);
          const d = c2.getImageData(0, 0, 32, 18).data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
          lu.v = sum / (d.length / 4);
        }
      } catch { lu.v = null; }
      setFps(Math.round(fr.ema));
    }
    if (src !== 'demo') {
      viewTracker.current ??= new ViewAngleTracker(def);
      const vw = viewTracker.current.push(f.world, st === 'active');
      // Re-render the status pill only when it would read differently.
      setView((prev) => !vw ? null : prev && prev.ok === vw.ok && Math.abs(prev.errorDeg - vw.errorDeg) < 5 ? prev : vw);
    }
    let l: LiveState;
    if (st === 'active' && session.current) {
      if (pauseTs.current !== null) { offset.current += f.timestampMs - pauseTs.current; pauseTs.current = null; }
      l = session.current.push(offset.current ? { ...f, timestampMs: f.timestampMs - offset.current } : f, aspect);
      const p = prev.current;
      if (l.mismatchedReps > p.wrong) {
        // Different exercise detected: not counted — alert with a red flash, buzz and voice (the cue carries the reason).
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([60, 80, 60]);
        setFlash({ k: Date.now(), c: 'var(--bad)' });
        say(`Not counted. ${l.mismatch ?? `That doesn't look like ${def.name}`}`, voiceRef.current);
      }
      if (l.reps > p.reps) {
        const rep = l.lastRep!;
        playRepCompletedSound();
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(rep.valid ? 30 : [40, 60, 40]);
        setFlash({ k: Date.now(), c: rep.valid ? 'var(--good)' : 'var(--bad)' });
        say(rep.valid ? String(l.reps) : `${l.reps}. ${rep.faults[0] ?? 'Full range'}`, voiceRef.current);
      }
      if (l.events.length > p.events) {
        const e = l.events[l.events.length - 1]!;
        setFlash({ k: Date.now(), c: e.score >= 0.75 ? 'var(--good)' : e.score >= 0.5 ? 'var(--ok)' : 'var(--bad)' });
        say(e.jumpHeightCm !== undefined ? `${Math.round(e.jumpHeightCm)} centimetres` : e.releaseAngle !== undefined ? `Release ${Math.round(e.releaseAngle)} degrees` : 'Good', voiceRef.current);
      }
      // One spoken correction every 3 s at most: a stream of cues is noise the athlete cannot act on mid-rep.
      if (l.cue && l.cue !== p.cue && l.reps === p.reps && l.mismatchedReps === p.wrong && f.timestampMs - lastSpoke.current > 3000) { lastSpoke.current = f.timestampMs; say(l.cue, voiceRef.current); }
      prev.current = { reps: l.reps, events: l.events.length, cue: l.cue, wrong: l.mismatchedReps };
      // Tracking loss: after 1.2 s tell the athlete what to fix; counting resumes by itself when they are back in view.
      if (l.tracking || !lastTracked.current) lastTracked.current = f.timestampMs;
      const lost = src === 'camera' ? f.timestampMs - lastTracked.current : 0;
      setLostFor(lost > 1200 ? lost : 0);
      if (lost > 1200 && !lostSaid.current) { lostSaid.current = true; say(l.framing ?? 'Step back into the frame', voiceRef.current); }
      if (lost === 0 && lostSaid.current) { lostSaid.current = false; say('Tracking again', voiceRef.current); }
    } else {
      if (st === 'paused') pauseTs.current ??= f.timestampMs;
      probe.current ??= new MotionSession(def);
      l = probe.current.push(f, aspect);
      // Real cameras dip below the visibility bar for single frames; only 300 ms of bad framing counts as leaving the frame.
      if (l.tracking) badSince.current = null; else badSince.current ??= f.timestampMs;
      const lost = badSince.current !== null && f.timestampMs - badSince.current > 300;
      if (st === 'countdown' && lost && src === 'camera') { okSince.current = null; setStage('framing'); }
      if (st === 'loading' || st === 'framing') {
        if (st === 'loading') setStage('framing');
        if (!lost) {
          okSince.current ??= f.timestampMs;
          if (f.timestampMs - okSince.current > 1500) setStage('countdown');
        } else okSince.current = null;
        setSteady(okSince.current === null ? 0 : Math.min(1, (f.timestampMs - okSince.current) / 1500));
        if (src === 'camera') setSetup(setupChecks(f, l, aspect, def.camera === 'side', fr.ema, needFps, lu.v, viewTracker.current?.push(null, false) ?? null));
      }
    }
    // Display-only smoothing of the drawn skeleton (EMA, ~1 frame lag). The engine above always receives the raw landmarks.
    let shown = f;
    if (src === 'camera' && f.landmarks.length) {
      const d = disp.current;
      disp.current = d.length === f.landmarks.length ? f.landmarks.map((q, i) => ({ ...q, x: d[i]!.x + 0.55 * (q.x - d[i]!.x), y: d[i]!.y + 0.55 * (q.y - d[i]!.y) })) : f.landmarks;
      shown = { ...f, landmarks: disp.current };
    } else disp.current = [];
    if (cv) drawOverlay(cv, shown, l, mirror, src === 'demo' ? (ctx, fr) => drawAthlete(ctx, fr.landmarks, DEMO_GROUND, def) : undefined);
    setLive(l);
  }, [def, src, mirror, needFps]);

  // Source lifecycle
  useEffect(() => {
    if (!def) return;
    source.current?.stop();
    session.current = null; probe.current = null; okSince.current = null; badSince.current = null;
    setStage('loading'); setError(null); setLive(null); setSetup([]); setSteady(0); setLostFor(0);
    fpsRef.current = { last: 0, ema: 0 }; luma.current.v = null;
    const cb = {
      onFrame: (f: PoseFrame) => onFrameRef.current(f),
      onStatus: (s: string) => {
        setStatus(s);
        if (src === 'video' && s === 'Video complete') finishRef.current();
      },
      onError: (m: string) => { setError(m); setStage('error'); },
    };
    if (src === 'camera') source.current = new CameraPoseSource(cb, { facingMode: facing, model: profile.model, fps: def.mode === 'event' ? 60 : 30 });
    else if (src === 'video') {
      const file = selectedVideo.current;
      setPendingVideo(null);
      if (!file) { setError('No video selected.'); setStage('error'); return; }
      if (file.size > MAX_VIDEO_BYTES) { setError('Choose a video under 100 MB and 2 minutes. Trim a copy on your device first.'); setStage('error'); return; }
      let cancelled = false;
      setStatus('Reading video file…');
      void (async () => {
        // Read the bytes once for container forensics; its frame rate drives the sampling rate.
        try { forensics.current = inspectContainer(await file.arrayBuffer(), { fileName: file.name, lastModified: file.lastModified }); }
        catch { forensics.current = undefined; } // unreadable/huge file: analyse anyway, the report just has no container facts
        if (cancelled) return;
        source.current = new VideoFilePoseSource(cb, file, profile.model, forensics.current?.metadata.nominalFps);
        beginActive();
        void source.current.start(video.current);
      })();
      return () => { cancelled = true; source.current?.stop(); };
    } else {
      setStage('countdown');
      return () => source.current?.stop();
    }
    void source.current.start(video.current);
    return () => source.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, src, facing, retry]);

  // Keep the screen awake while capturing, and say so when the tab was hidden (the camera delivers no frames then).
  useEffect(() => {
    if (src === 'demo') return;
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null, gone = false;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock;
    const hold = () => { void wl?.request('screen').then((x) => { if (gone) void x.release(); else lock = x; }, () => undefined); };
    const onVis = () => {
      if (document.visibilityState === 'visible') { hold(); return; }
      // The camera delivers no frames while hidden. Practice reps pause; a continuous attempt cannot be stitched back together.
      if (stageRef.current === 'active' && src === 'camera') { setStage(continuous ? 'interrupted' : 'paused'); if (!continuous) { setNotice('Paused because the screen was hidden.'); window.setTimeout(() => setNotice(null), 5000); } }
      else if (stageRef.current === 'countdown' && src === 'camera') { okSince.current = null; setStage('framing'); }
    };
    hold();
    document.addEventListener('visibilitychange', onVis);
    return () => { gone = true; document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => undefined); };
  }, [src, continuous]);

  const onFrameRef = useRef(onFrame); onFrameRef.current = onFrame;
  const finishRef = useRef(finish); finishRef.current = finish;

  // Countdown → active
  useEffect(() => {
    if (stage !== 'countdown') return;
    setCount(3);
    say('Ready', voiceRef.current);
    let n = 3;
    const t = window.setInterval(() => {
      n -= 1;
      if (n > 0) { setCount(n); return; }
      clearInterval(t);
      beginActive();
      if (src === 'demo' && def) {
        source.current = new PuppetSource(simulateExercise(catalogDef ?? def, { reps: 6, aspect: DEMO_W / DEMO_H, ground: DEMO_GROUND }), (f) => onFrameRef.current(f), () => finishRef.current());
        void source.current.start(null);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [stage, beginActive, src, def]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const pause = () => { if (stageRef.current === 'active') { setStage('paused'); say('Paused', voiceRef.current); } };
  const resume = () => { if (stageRef.current === 'paused') { setStage('active'); say('Go', voiceRef.current); } };
  /** Discard this attempt and set up again. Nothing from it is saved. */
  const retake = () => {
    setConfirmExit(false);
    session.current = null; probe.current = null; okSince.current = null; badSince.current = null; pauseTs.current = null; offset.current = 0;
    setLive(null); setLostFor(0);
    if (src === 'demo') { source.current?.stop(); setStage('countdown'); } else setStage('framing');
  };
  const end = () => { setStage('analysing'); window.setTimeout(() => finishRef.current(), 250); };
  const leave = () => { source.current?.stop(); nav(-1); };
  const hasData = !!live && (live.reps > 0 || live.holdMs > 500 || live.events.length > 0);
  const close = () => { if ((stageRef.current === 'active' || stageRef.current === 'paused') && hasData) setConfirmExit(true); else leave(); };

  if (!def) return <div className="stage"><div className="center-card glass">{t("Exercise not found.")} <button className="btn" onClick={() => nav('/app')}>{t("Back")}</button></div></div>;

  const angles = def.angles.map((a) => ({ a, r: live?.angles[a.id] })).filter((x) => x.r);
  const lastEvent = live?.events[live.events.length - 1];
  const cueZone = live?.checkZones.includes('bad') ? 'bad' : 'ok';
  const running = stage === 'active' || stage === 'paused';
  const place = placementFor(def);
  // Camera problems and technique advice are different messages: never coach form on a body the camera cannot see.
  const cueKind = live?.framing || !live?.tracking ? 'camera' : 'form';

  return (
    <div className={`stage ${src === 'video' ? 'contain' : ''} st-${stage}`} data-cat={def.category}>
      {src === 'demo' ? <div className="demo-bg" /> : <video ref={video} playsInline muted autoPlay style={mirror ? { transform: 'scaleX(-1)' } : undefined} />}
      <canvas ref={canvas} />
      <div className="vignette" />
      {flash && <div key={flash.k} className="flash" style={{ boxShadow: `inset 0 0 120px 20px ${flash.c}` }} />}

      <div className="hud">
        <div className="hud-top">
          <button className="btn icon glass press" onClick={close} aria-label={t(running ? 'Cancel attempt' : 'Close')}><IconClose /></button>
          <div className="hud-title glass">
            <span>{t(def.name)}</span>
            {src === 'demo' && <span className="tag">DEMO</span>}
            {view && stage !== 'loading' && <span className={`cap-view ${view.ok ? 'ok' : 'no'}`} title={t('Estimated from 3D landmarks')}>{t(def.camera === 'side' ? 'Side view' : 'Front view')} {view.ok ? '✓' : `${Math.round(view.errorDeg)}° ${t('off')}`}</span>}
            {running && <span className={`cap-state ${stage}`} role="status"><i aria-hidden />{t(stage === 'paused' ? 'Paused' : src === 'video' ? 'Analysing' : 'Measuring')}</span>}
            <span className="num">{mmss(running ? live?.tMs ?? 0 : 0)}</span>
          </div>
          <button className="btn icon glass press" onClick={() => setVoice((x) => !x)} aria-label={t(voice ? 'Mute voice' : 'Unmute voice')} aria-pressed={voice}><IconVolume off={!voice} /></button>
          {src === 'camera' && !running && stage !== 'analysing' && <button className="btn icon glass press" onClick={() => setFacing((x) => (x === 'user' ? 'environment' : 'user'))} aria-label={t('Switch camera')}><IconFlip /></button>}
        </div>

        {notice && <div className="cap-notice glass" role="status">{t(notice)}</div>}
        {stage === 'active' && src === 'camera' && fps > 0 && fps < needFps * 0.6 && lostFor === 0 && <div className="cap-notice glass" role="status">{t('Slow tracking ({n} fps): results will be less precise', { n: fps })}</div>}
        {stage === 'active' && lostFor === 0 && view && !view.ok && live?.tracking && !live.cue && <div className="cue glass ok" role="status"><IconCamera /><small>{t('Camera')}</small>{t(def.camera === 'side' ? 'Turn side-on to the camera' : 'Turn to face the camera')}</div>}
        {stage === 'active' && lostFor === 0 && live?.cue && <div key={live.cue} className={`cue glass ${cueKind === 'camera' ? 'ok' : cueZone}`} role="status">
          {cueKind === 'camera' ? <IconCamera /> : cueZone === 'bad' ? <IconAlert /> : <IconBulb />}<small>{t(cueKind === 'camera' ? 'Camera' : 'Form')}</small>{t(live.cue)}
        </div>}

        {(stage === 'active' || stage === 'countdown') && angles.length > 0 && (
          <div className="hud-angles">
            {angles.slice(0, 4).map(({ a, r }) => (
              <div key={a.id} className={`angle-chip glass ${r!.zone ? `z-${r!.zone}` : ''}`}>
                <i /><span>{t(a.label)}</span><b className="num">{a.kind === 'spread' ? `${r!.value.toFixed(2)}×` : `${Math.round(r!.value)}°`}</b>
              </div>
            ))}
          </div>
        )}

        {running && (
          <div className="hud-bottom cap-dock">
            <div key={`${live?.reps}-${live?.events.length}`} className="counter glass pulse">
              {def.mode === 'reps' && (<>
                <div><div className="lbl">{t("Reps")}</div><div className="big">{live?.reps ?? 0}</div></div>
                <div><div className="sub z-good">{t('{n} correct', { n: live?.validReps ?? 0 })}</div><div className="sub" style={{ opacity: 0.6 }}>{t(stage === 'paused' ? 'Paused' : live?.phase === 'active' ? 'Working…' : 'Ready')}</div></div>
                <Ring value={live?.progress ?? 0} color="var(--accent-2)" label={`${Math.round((live?.progress ?? 0) * 100)}`} />
              </>)}
              {def.mode === 'hold' && (<>
                <div><div className="lbl">{t("Hold")}</div><div className="big">{((live?.holdMs ?? 0) / 1000).toFixed(1)}<small style={{ fontSize: '1.2rem' }}>s</small></div></div>
                <div className="sub">{live?.phase === 'hold' ? <span className="z-good">{t("In position")}</span> : <span className="z-bad">{t("Get into position")}</span>}<br /><span style={{ opacity: 0.6 }}>{t('Goal {n}s', { n: def.hold?.targetSec ?? 0 })}</span></div>
                <Ring value={live?.progress ?? 0} color="#bf5af2" label={`${Math.round((live?.progress ?? 0) * 100)}%`} />
              </>)}
              {def.mode === 'event' && (<>
                <div><div className="lbl">{t("Attempts")}</div><div className="big">{live?.events.length ?? 0}</div></div>
                <div className="sub">
                  {lastEvent ? (lastEvent.jumpHeightCm !== undefined ? <b style={{ fontSize: '1.5rem' }}>{lastEvent.jumpHeightCm.toFixed(1)} cm</b>
                    : lastEvent.releaseAngle !== undefined ? <b className={lastEvent.releaseZone ? `z-${lastEvent.releaseZone}` : ''} style={{ fontSize: '1.5rem' }}>{t('{n}° release', { n: Math.round(lastEvent.releaseAngle) })}</b> : <b>{t("Detected")}</b>) : <span style={{ opacity: 0.7 }}>{t("Perform the movement")}</span>}
                </div>
              </>)}
            </div>
            {src !== 'video' && <div className="cap-controls" role="group" aria-label={t('Attempt controls')}>
              <button className="cap-btn glass press" onClick={retake}>{t('Restart')}</button>
              {src === 'camera' && !continuous && <button className="cap-btn glass press" onClick={stage === 'paused' ? resume : pause} aria-pressed={stage === 'paused'}>{t(stage === 'paused' ? 'Resume' : 'Pause')}</button>}
              <button className="cap-btn finish press" onClick={end}>{t('Finish')}</button>
            </div>}
          </div>
        )}
      </div>

      {stage === 'loading' && <div className="center-card glass" role="status"><div className="spinner" /><b>{t(status.replace(/ \d+%$/, ''))}{status.match(/ \d+%$/)?.[0]}</b>
        <p className="cap-hint">{t(src === 'camera' ? 'Allow camera access when your browser asks. The pose model runs on this device; nothing is uploaded.' : 'Pose model runs on this device. Nothing is uploaded.')}</p>
        {typeof navigator !== 'undefined' && !navigator.onLine && <p className="cap-hint">{t('You are offline. Tracking starts only if the pose model was loaded on this device before.')}</p>}
      </div>}
      {stage === 'analysing' && <div className="center-card glass" role="status"><div className="spinner" /><b>{t('Building your report…')}</b><p className="cap-hint">{t('Measurements only. No video was saved.')}</p></div>}
      {stage === 'active' && lostFor > 0 && (
        <div className="cap-lost glass" role="alert">
          <IconCamera />
          <b>{t('Tracking paused')}</b>
          <p>{t(live?.framing ?? 'Step back into the frame')}</p>
          <small>{t('Counting resumes when you are back in view. Nothing is lost.')}</small>
        </div>
      )}
      {stage === 'paused' && <div className="cap-lost glass" role="status">
        <b>{t('Paused')}</b>
        <p>{t('Rest, then resume. Paused time is left out of your tempo and totals.')}</p>
        <div className="cap-sheet-actions"><button className="btn primary" onClick={resume} autoFocus>{t('Resume')}</button><button className="btn" onClick={end}>{t('Finish')}</button></div>
      </div>}
      {stage === 'interrupted' && <div className="cap-lost glass" role="alertdialog" aria-label={t('Attempt interrupted')}>
        <IconAlert />
        <b>{t('Attempt interrupted')}</b>
        <p>{t(def.mode === 'hold' ? 'The screen was hidden, so the hold could not be timed without a gap.' : 'The screen was hidden, so part of this attempt was not seen.')}</p>
        <small>{t(batteryRun ? 'A standard test must be one continuous attempt. Restart it so the result is comparable.' : 'Restart for a clean result, or finish with what was measured before the break.')}</small>
        <div className="cap-sheet-actions"><button className="btn primary" onClick={retake} autoFocus>{t('Restart attempt')}</button>{!batteryRun && hasData && <button className="btn" onClick={end}>{t('Finish with what was measured')}</button>}<button className="btn" onClick={leave}>{t('Cancel')}</button></div>
      </div>}
      {confirmExit && <div className="cap-lost glass" role="alertdialog" aria-label={t('Discard this attempt?')}>
        <b>{t('Discard this attempt?')}</b>
        <p>{t('What was measured so far will not be saved.')}</p>
        <div className="cap-sheet-actions"><button className="btn primary" onClick={() => { setConfirmExit(false); end(); }} autoFocus>{t('Finish and save instead')}</button><button className="btn danger" onClick={leave}>{t('Discard')}</button><button className="btn" onClick={() => setConfirmExit(false)}>{t('Keep going')}</button></div>
      </div>}
      {stage === 'framing' && (() => {
        // One instruction at a time: the first failed check, in priority order.
        const fix = setup.find((c) => c.ok === false);
        return (<>
          {!live?.tracking && <Silhouette />}
          <div className="cap-setup glass">
            <b className="cap-setup-lead" role="status" aria-live="polite">{t(fix?.fix ?? live?.framing ?? (steady > 0 ? 'Hold still…' : 'Step into the frame'))}</b>
            <div className="cap-progress" role="progressbar" aria-label={t('Ready check')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(steady * 100)}><i style={{ transform: `scaleX(${steady})` }} /></div>
            {setup.length > 0 && live?.tracking ? <ul className="cap-checks">
              {setup.map((c) => <li key={c.id} className={c.ok === true ? 'ok' : c.ok === false ? 'no' : ''}><span aria-hidden>{c.ok === true ? <IconCheck /> : c.ok === false ? <IconAlert /> : <i />}</span>{t(c.label)}<span className="sr-only">{c.ok === true ? t(' — ok') : c.ok === false ? t(' — needs fixing') : ''}</span></li>)}
            </ul> : <ol className="cap-place">{place.steps.map((x) => <li key={x}>{t(x)}</li>)}</ol>}
            <p className="cap-hint">{t('The countdown starts on its own once you are in position. Live video is not recorded or uploaded; only joint measurements are saved.')}</p>
          </div>
        </>);
      })()}
      {stage === 'countdown' && <div className="countdown" role="status" aria-live="assertive"><span key={count}>{count}</span><small>{t(def.mode === 'hold' ? 'Get into position' : def.mode === 'event' ? 'One attempt at a time' : 'Start from the top position')}</small></div>}
      {stage === 'error' && (
        <div className="center-card glass" role="alert">
          <div className="ic-lg"><IconCamera /></div>
          <b>{t(error ?? '')}</b>
          <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
            {src === 'camera' && <button className="btn primary" onClick={() => setRetry((n) => n + 1)}>{t('Retry')}</button>}
            <button className="btn" onClick={() => nav(`/exercise/${def.id}`, { replace: true })}>{t('Upload a video or see other options')}</button>
            <button className="btn" onClick={() => nav(`/train/${def.id}?src=demo`, { replace: true })}>{t("Watch the demo instead")}</button>
            <button className="btn" onClick={() => nav(-1)}>{t("Back")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
