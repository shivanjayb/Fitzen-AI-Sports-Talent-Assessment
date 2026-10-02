import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MotionSession, analyseIntegrity, exerciseById, filtfiltLandmarks, inspectContainer, simulateExercise, type ForensicsReport, type LiveState, type PoseFrame } from '@fitzen/engines';
import { CameraPoseSource, VideoFilePoseSource, type PoseSource } from '../pose/poseSource';
import { playRepCompletedSound } from '../lib/audioFeedback';
import { drawOverlay } from './overlay';
import { getProfile, saveSession } from './store';
import { IconAlert, IconBulb, IconCamera, IconClose, IconFlip, IconVolume } from './icons';

let pendingVideo: File | null = null;
export const setPendingVideo = (f: File) => { pendingVideo = f; };

// Demo canvas matches the screen's shape so the figure is never cropped.
const DEMO_H = 900;
const DEMO_W = typeof window === 'undefined' ? 1600 : Math.round(DEMO_H * Math.max(0.5, Math.min(2, window.innerWidth / window.innerHeight)));

type Stage = 'loading' | 'framing' | 'countdown' | 'active' | 'error';
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
  const u = new SpeechSynthesisUtterance(text);
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

const zoneColor = (score: number) => (score >= 85 ? 'var(--good)' : score >= 65 ? 'var(--ok)' : 'var(--bad)');
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export default function Session() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const src = (params.get('src') ?? 'camera') as Src;
  const def = exerciseById(id);
  const nav = useNavigate();
  const profile = useRef(getProfile()).current;

  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<PoseSource | null>(null);
  const session = useRef<MotionSession | null>(null);
  const probe = useRef<MotionSession | null>(null);
  const stageRef = useRef<Stage>('loading');
  const okSince = useRef<number | null>(null);
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
  const voiceRef = useRef(voice); voiceRef.current = voice;

  const setStage = (s: Stage) => { stageRef.current = s; setStageState(s); };
  const mirror = src === 'camera' && facing === 'user';

  const finish = useCallback(() => {
    const v = video.current;
    const aspect = (v?.videoWidth || 16) / (v?.videoHeight || 9);
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
      for (const f of filtfiltLandmarks(raw)) offline.push(f, aspect);
      report = offline.finish();
      extra = { integrity: analyseIntegrity(raw, { aspect, statureCm: profile.heightCm ?? undefined, mode: def.mode }), forensics: forensics.current };
    }
    const sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    saveSession({ id: sid, report, source: src, ...extra });
    session.current = null;
    nav(`/results/${sid}`, { replace: true, state: { checkin: true } });
  }, [nav, src, def, profile.weightKg, profile.heightCm]);

  const beginActive = useCallback(() => {
    if (!def) return;
    session.current = new MotionSession(def, { weightKg: profile.weightKg ?? undefined });
    prev.current = { reps: 0, events: 0, cue: null, wrong: 0 };
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
    let l: LiveState;
    if (st === 'active' && session.current) {
      l = session.current.push(f, aspect);
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
      if (l.cue && l.cue !== p.cue && l.reps === p.reps && l.mismatchedReps === p.wrong) say(l.cue, voiceRef.current);
      prev.current = { reps: l.reps, events: l.events.length, cue: l.cue, wrong: l.mismatchedReps };
    } else {
      probe.current ??= new MotionSession(def);
      l = probe.current.push(f, aspect);
      if (st === 'loading' || st === 'framing') {
        if (st === 'loading') setStage('framing');
        if (l.tracking) {
          okSince.current ??= f.timestampMs;
          if (f.timestampMs - okSince.current > 1000) setStage('countdown');
        } else okSince.current = null;
      }
    }
    if (cv) drawOverlay(cv, f, l, mirror);
    setLive(l);
  }, [def, src, mirror]);

  // Source lifecycle
  useEffect(() => {
    if (!def) return;
    const cb = {
      onFrame: (f: PoseFrame) => onFrameRef.current(f),
      onStatus: (s: string) => {
        setStatus(s);
        if (src === 'video' && s === 'Video complete') finishRef.current();
      },
      onError: (m: string) => { setError(m); setStage('error'); },
    };
    if (src === 'camera') source.current = new CameraPoseSource(cb, { facingMode: facing, model: profile.model });
    else if (src === 'video') {
      const file = pendingVideo;
      if (!file) { setError('No video selected.'); setStage('error'); return; }
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
  }, [def, src, facing]);

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
        source.current = new PuppetSource(simulateExercise(def, { reps: 6, aspect: DEMO_W / DEMO_H, ground: DEMO_W < DEMO_H ? 0.74 : 0.86 }), (f) => onFrameRef.current(f), () => finishRef.current());
        void source.current.start(null);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [stage, beginActive, src, def]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (!def) return <div className="stage"><div className="center-card glass">Exercise not found. <button className="btn" onClick={() => nav('/app')}>Back</button></div></div>;

  const angles = def.angles.map((a) => ({ a, r: live?.angles[a.id] })).filter((x) => x.r);
  const lastEvent = live?.events[live.events.length - 1];
  const cueZone = live?.checkZones.includes('bad') ? 'bad' : 'ok';

  return (
    <div className={`stage ${src === 'video' ? 'contain' : ''}`}>
      {src === 'demo' ? <div className="demo-bg" /> : <video ref={video} playsInline muted autoPlay style={mirror ? { transform: 'scaleX(-1)' } : undefined} />}
      <canvas ref={canvas} />
      <div className="vignette" />
      {flash && <div key={flash.k} className="flash" style={{ boxShadow: `inset 0 0 120px 20px ${flash.c}` }} />}

      <div className="hud">
        <div className="hud-top">
          <button className="btn icon glass press" onClick={() => { source.current?.stop(); nav(-1); }} aria-label="Close"><IconClose /></button>
          <div className="hud-title glass">
            <span>{def.name}</span>
            {src === 'demo' && <span className="tag">DEMO</span>}
            <span className="num">{mmss(stage === 'active' ? live?.tMs ?? 0 : 0)}</span>
          </div>
          <button className="btn icon glass press" onClick={() => setVoice((x) => !x)} aria-label={voice ? 'Mute voice' : 'Unmute voice'}><IconVolume off={!voice} /></button>
          {src === 'camera' && <button className="btn icon glass press" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Switch camera"><IconFlip /></button>}
        </div>

        {stage === 'active' && live?.cue && <div key={live.cue} className={`cue glass ${cueZone}`}>{live.framing ? <IconCamera /> : cueZone === 'bad' ? <IconAlert /> : <IconBulb />} {live.cue}</div>}

        {(stage === 'active' || stage === 'countdown' || stage === 'framing') && angles.length > 0 && (
          <div className="hud-angles">
            {angles.map(({ a, r }) => (
              <div key={a.id} className={`angle-chip glass ${r!.zone ? `z-${r!.zone}` : ''}`}>
                <i /><span>{a.label}</span><b className="num">{a.kind === 'spread' ? `${r!.value.toFixed(2)}×` : `${Math.round(r!.value)}°`}</b>
              </div>
            ))}
          </div>
        )}

        {stage === 'active' && (
          <div className="hud-bottom">
            <div key={`${live?.reps}-${live?.events.length}`} className="counter glass pulse">
              {def.mode === 'reps' && (<>
                <div><div className="lbl">Reps</div><div className="big">{live?.reps ?? 0}</div></div>
                <div><div className="sub z-good">{live?.validReps ?? 0} correct</div><div className="sub" style={{ opacity: 0.6 }}>{live?.phase === 'active' ? 'Working…' : 'Ready'}</div></div>
                <Ring value={live?.progress ?? 0} color="var(--accent-2)" label={`${Math.round((live?.progress ?? 0) * 100)}`} />
              </>)}
              {def.mode === 'hold' && (<>
                <div><div className="lbl">Hold</div><div className="big">{((live?.holdMs ?? 0) / 1000).toFixed(1)}<small style={{ fontSize: '1.2rem' }}>s</small></div></div>
                <div className="sub">{live?.phase === 'hold' ? <span className="z-good">In position</span> : <span className="z-bad">Get into position</span>}<br /><span style={{ opacity: 0.6 }}>Goal {def.hold?.targetSec}s</span></div>
                <Ring value={live?.progress ?? 0} color="#bf5af2" label={`${Math.round((live?.progress ?? 0) * 100)}%`} />
              </>)}
              {def.mode === 'event' && (<>
                <div><div className="lbl">Attempts</div><div className="big">{live?.events.length ?? 0}</div></div>
                <div className="sub">
                  {lastEvent ? (lastEvent.jumpHeightCm !== undefined ? <b style={{ fontSize: '1.5rem' }}>{lastEvent.jumpHeightCm.toFixed(1)} cm</b>
                    : lastEvent.releaseAngle !== undefined ? <b className={lastEvent.releaseZone ? `z-${lastEvent.releaseZone}` : ''} style={{ fontSize: '1.5rem' }}>{Math.round(lastEvent.releaseAngle)}° release</b> : <b>Detected</b>) : <span style={{ opacity: 0.7 }}>Perform the movement</span>}
                </div>
              </>)}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <div className="glass" style={{ borderRadius: 999, padding: 4 }}><Ring value={(live?.score ?? 100) / 100} color={zoneColor(live?.score ?? 100)} label={`${live?.score ?? 100}`} /></div>
              {src !== 'video' && <button className="btn danger press" onClick={finish}>End</button>}
            </div>
          </div>
        )}
      </div>

      {stage === 'loading' && <div className="center-card glass"><div className="spinner" /><b>{status}</b><p className="muted" style={{ color: 'rgba(255,255,255,.7)', fontSize: '.88rem' }}>Pose model runs on this device. Nothing is uploaded.</p></div>}
      {stage === 'framing' && (<>
        <Silhouette />
        <div className="center-card glass" style={{ top: 'auto', bottom: 40, transform: 'translateX(-50%)' }}>
          <b>{live?.framing ?? 'Hold still…'}</b>
          <p style={{ margin: '6px 0 0', fontSize: '.86rem', opacity: 0.75 }}>{def.camera === 'side' ? 'Stand side-on to the camera' : 'Face the camera'} · whole body visible · 2–3 m away</p>
        </div>
      </>)}
      {stage === 'countdown' && <div className="countdown"><span key={count}>{count}</span></div>}
      {stage === 'error' && (
        <div className="center-card glass">
          <div className="ic-lg"><IconCamera /></div>
          <b>{error}</b>
          <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
            <button className="btn primary" onClick={() => nav(`/train/${def.id}?src=demo`, { replace: true })}>Watch the demo instead</button>
            <button className="btn" onClick={() => nav(-1)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
