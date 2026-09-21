import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  analyzeJump,
  analyzePushups,
  analyzeSquats,
  appendAuditEntry,
  calculate3DVectorAngle,
  createExerciseFSM,
  signAssessment,
  type AuditEntry,
  type ExerciseAnalysisResult,
  type JumpAnalysis,
  type Landmark3D,
  type PoseFrame,
} from '@fitzen/engines';
import { Shell } from '../components/Shell';
import { Button, Chip, Meter, ProgressRing } from '../components/ui';
import { drawPoseOverlay } from '../pose/overlay';
import { detectHandGesture, type HandGesture } from '../pose/gestureDetector';
import { playAssessmentStartSound, playRepCompletedSound } from '../lib/audioFeedback';
import {
  CameraPoseSource,
  SimulationPoseSource,
  VideoFilePoseSource,
  type PoseSource,
} from '../pose/poseSource';
import { getDeviceKeyPair } from '../lib/deviceKeys';
import { enqueueAssessment } from '../lib/sync';
import { useAuth, useSync, useToasts } from '../state/AppState';
import { formatHeight } from '../lib/format';
import type { AssessmentPayload } from '../lib/api';

type Stage = 'setup' | 'starting' | 'countdown' | 'recording' | 'set_break' | 'analyzing' | 'result' | 'failed';
type TestKind = 'vertical_jump' | 'pushup' | 'squat';

export default function AssessPage() {
  const { user, profile } = useAuth();
  const sync = useSync();
  const { push } = useToasts();
  const navigate = useNavigate();

  const [testKind, setTestKind] = useState<TestKind>('squat');
  const [mode, setMode] = useState<'camera' | 'video' | 'simulation'>('camera');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('setup');
  const [status, setStatus] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [jumpResult, setJumpResult] = useState<JumpAnalysis | null>(null);
  const [exerciseResult, setExerciseResult] = useState<ExerciseAnalysisResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [activeGesture, setActiveGesture] = useState<HandGesture>(null);
  const [endingCountdown, setEndingCountdown] = useState<number | null>(null);
  const [currentSetIndex, setCurrentSetIndex] = useState(1);
  const [stageAspectRatio, setStageAspectRatio] = useState<string | number>('16 / 9');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<PoseSource | null>(null);
  const framesRef = useRef<PoseFrame[]>([]);
  const allSessionFramesRef = useRef<PoseFrame[]>([]);
  const recordingRef = useRef(false);
  const endingRef = useRef(false);
  const gestureDebounceRef = useRef<{ gesture: HandGesture; count: number }>({ gesture: null, count: 0 });
  const liveFsmRef = useRef<ReturnType<typeof createExerciseFSM> | null>(null);
  const stageRef = useRef<Stage>('setup');
  stageRef.current = stage;

  const stopSource = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    recordingRef.current = false;
  }, []);

  useEffect(() => stopSource, [stopSource]);

  const finishRecording = useCallback(async () => {
    recordingRef.current = false;
    const capturedKind = sourceRef.current?.kind ?? 'camera';
    stopSource();
    setStage('analyzing');
    const frames = [...allSessionFramesRef.current, ...framesRef.current];

    if (!profile) return;
    if (frames.length === 0 && capturedKind === 'video') {
      setFailure(
        'No person was detected in that video. Make sure the athlete is fully visible, well lit, and fills a good part of the frame.'
      );
      setStage('failed');
      return;
    }

    // Past session baseline mock for improvement comparison
    const pastBaseline = {
      validReps: 4,
      formAccuracyPercent: 80.0,
      avgAsymmetryDeg: 12.0,
    };

    const res = analyzeSquats(frames, pastBaseline);
    setExerciseResult(res);
    setJumpResult(null);

    try {
      const keys = await getDeviceKeyPair();
      const m = res.metrics;
      const payload: AssessmentPayload = {
        clientId: crypto.randomUUID(),
        athleteId: user!.id,
        test: 'squat',
        capturedAt: new Date().toISOString(),
        metrics: {
          jumpHeightM: 0,
          jumpHeightCiLow: 0,
          jumpHeightCiHigh: 0,
          flightTimeS: 0,
          peakPowerW: 0,
          relativePowerWkg: 0,
          symmetryScore: Math.round(Math.max(0, 100 - m.avgMaxAsymmetryDeg * 3)),
          movementQuality: Math.round(m.formAccuracyPercent),
          confidence: 0.95,
          effectiveFps: 30,
          countermovementDepth: 0,
          qualityFlags: res.pointsToImprove,
          validReps: m.validReps,
          totalAttempts: m.totalAttempts,
          formAccuracyPercent: m.formAccuracyPercent,
          avgAsymmetryDeg: m.avgMaxAsymmetryDeg,
        },
      };
      const signed = await signAssessment(payload, keys);
      let trail: AuditEntry[] = [];
      trail = await appendAuditEntry(trail, 'captured', { source: capturedKind, frames: frames.length, fps: 30 });
      trail = await appendAuditEntry(trail, 'analyzed', { test: 'squat', validReps: m.validReps });
      trail = await appendAuditEntry(trail, 'signed', { keyFingerprint: signed.keyFingerprint });
      await enqueueAssessment({ signed, auditTrail: trail });
      push('success', navigator.onLine ? 'Squat assessment signed and uploaded.' : 'Squat assessment signed and queued.');
    } catch {
      push('error', 'Could not queue assessment.');
    }
    setStage('result');
  }, [profile, push, stopSource, user]);

  const triggerEndSetWithCountdown = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    for (const n of [3, 2, 1]) {
      setEndingCountdown(n);
      setStatus(`Ending Set ${currentSetIndex} in ${n}s...`);
      await sleep(1000);
    }
    setEndingCountdown(null);
    endingRef.current = false;
    allSessionFramesRef.current.push(...framesRef.current);
    framesRef.current = [];
    recordingRef.current = false;
    setStage('set_break');
    setStatus(`Set ${currentSetIndex} Completed! Take a rest or choose next option.`);
  }, [currentSetIndex]);

  const triggerEndSessionWithCountdown = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    for (const n of [3, 2, 1]) {
      setEndingCountdown(n);
      setStatus(`Finishing Assessment in ${n}s...`);
      await sleep(1000);
    }
    setEndingCountdown(null);
    endingRef.current = false;
    void finishRecording();
  }, [finishRecording]);

  const startNextSet = useCallback(async () => {
    const nextIndex = currentSetIndex + 1;
    setCurrentSetIndex(nextIndex);
    setStage('countdown');
    setStatus(`Preparing for Set ${nextIndex}...`);
    for (const n of [3, 2, 1]) {
      setCountdown(n);
      await sleep(800);
    }
    liveFsmRef.current = createExerciseFSM({
      exerciseType: 'squat',
      downAngleThreshold: 95,
      upAngleThreshold: 160,
      maxAsymmetryDeg: 15,
    });
    playAssessmentStartSound();
    recordingRef.current = true;
    setStage('recording');
    setStatus(`Recording Set ${nextIndex}`);
  }, [currentSetIndex]);

  const begin = useCallback(async () => {
    if (!profile) return;
    setFailure(null);
    setJumpResult(null);
    setExerciseResult(null);
    framesRef.current = [];
    allSessionFramesRef.current = [];
    setFrameCount(0);
    setCurrentSetIndex(1);
    endingRef.current = false;
    setEndingCountdown(null);
    gestureDebounceRef.current = { gesture: null, count: 0 };
    liveFsmRef.current = createExerciseFSM({
      exerciseType: 'squat',
      downAngleThreshold: 95,
      upAngleThreshold: 160,
      maxAsymmetryDeg: 15,
    });

    const callbacks = {
      onFrame: (frame: PoseFrame) => {
        const canvas = canvasRef.current;
        if (canvas) {
          const video = videoRef.current;
          const w = video && video.videoWidth > 0 ? video.videoWidth : 960;
          const h = video && video.videoHeight > 0 ? video.videoHeight : 720;
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;
          if (w > 0 && h > 0) {
            const ar = `${w} / ${h}`;
            setStageAspectRatio((prev) => (prev !== ar ? ar : prev));
          }
          drawPoseOverlay(canvas, frame, recordingRef.current ? 'RECORDING' : 'READY');
        }

        // Gesture Recognition & 3-Frame Debounce
        const rawGesture = detectHandGesture(frame);
        if (rawGesture === gestureDebounceRef.current.gesture) {
          gestureDebounceRef.current.count++;
        } else {
          gestureDebounceRef.current = { gesture: rawGesture, count: 1 };
        }

        const confirmedGesture = gestureDebounceRef.current.count >= 3 ? rawGesture : null;
        setActiveGesture(confirmedGesture);

        // Gesture Actions during Set Break
        if (stageRef.current === 'set_break') {
          if (confirmedGesture === 'thumbs_up') {
            void startNextSet();
          } else if (confirmedGesture === 'thumbs_down') {
            void triggerEndSessionWithCountdown();
          }
        }

        // Thumbs Down trigger during recording: Start 3-second wrap up countdown before finishing
        if (confirmedGesture === 'thumbs_down' && recordingRef.current && !endingRef.current) {
          void triggerEndSessionWithCountdown();
        }

        if (recordingRef.current) {
          framesRef.current.push(frame);
          setFrameCount(framesRef.current.length);

          if (liveFsmRef.current && frame.landmarks && frame.landmarks.length >= 29) {
            const l1 = frame.landmarks[23];
            const l2 = frame.landmarks[25];
            const l3 = frame.landmarks[27];
            const r1 = frame.landmarks[24];
            const r2 = frame.landmarks[26];
            const r3 = frame.landmarks[28];

            if (l1 && l2 && l3 && r1 && r2 && r3) {
              const leftAngle = calculate3DVectorAngle(
                { x: l1.x, y: l1.y, z: l1.z, visibility: l1.visibility },
                { x: l2.x, y: l2.y, z: l2.z, visibility: l2.visibility },
                { x: l3.x, y: l3.y, z: l3.z, visibility: l3.visibility }
              );
              const rightAngle = calculate3DVectorAngle(
                { x: r1.x, y: r1.y, z: r1.z, visibility: r1.visibility },
                { x: r2.x, y: r2.y, z: r2.z, visibility: r2.visibility },
                { x: r3.x, y: r3.y, z: r3.z, visibility: r3.visibility }
              );

              if (leftAngle.isValid && rightAngle.isValid) {
                const fsmRes = liveFsmRef.current.processFrame({
                  timestampMs: frame.timestampMs,
                  leftAngleDeg: leftAngle.angleDeg,
                  rightAngleDeg: rightAngle.angleDeg,
                  visibilityScore: Math.min(leftAngle.minVisibilityScore, rightAngle.minVisibilityScore),
                });

                if (fsmRes.repCompleted) {
                  playRepCompletedSound();
                }
              }
            }
          }
        }
      },
      onStatus: (message: string) => {
        setStatus(message);
        if (message === 'Demo complete' || message === 'Video complete') void finishRecording();
      },
      onError: (message: string) => {
        setFailure(message);
        setStage('failed');
        stopSource();
      },
    };

    if (mode === 'camera') {
      const source: PoseSource = new CameraPoseSource(callbacks);
      sourceRef.current = source;
      await source.start(videoRef.current);
      if (stageRef.current === 'failed') return;

      setStage('countdown');
      for (const n of [3, 2, 1]) {
        setCountdown(n);
        await sleep(900);
      }
      playAssessmentStartSound();
      recordingRef.current = true;
      setStage('recording');
    } else if (mode === 'video') {
      if (!videoFile) {
        setFailure('Choose a video file first.');
        setStage('failed');
        return;
      }
      playAssessmentStartSound();
      recordingRef.current = true;
      setStage('recording');
      const source: PoseSource = new VideoFilePoseSource(callbacks, videoFile);
      sourceRef.current = source;
      await source.start(videoRef.current);
    } else {
      setStage('countdown');
      for (const n of [3, 2, 1]) {
        setCountdown(n);
        await sleep(350);
      }
      recordingRef.current = true;
      setStage('recording');
      const source: PoseSource = new SimulationPoseSource(callbacks, {
        athleteHeightCm: profile.heightCm,
        exerciseType: 'squat',
      });
      sourceRef.current = source;
      await source.start(videoRef.current);
    }
  }, [finishRecording, mode, profile, stopSource, videoFile]);

  if (!profile) {
    return (
      <Shell title="Assess">
        <div className="fz-card fz-animate-in" style={{ maxWidth: 560 }}>
          <h2>Complete your athlete profile first</h2>
          <p style={{ color: 'var(--ink-mid)', margin: 'var(--space-3) 0 var(--space-4)' }}>
            Assessment processing requires your height and mass for scaling and biometric analysis.
          </p>
          <Button onClick={() => navigate('/settings')}>Set up profile</Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Squat Motion Assessment">
      <div className="fz-grid fz-grid--two">
        <section>
          {/* Active Assessment Indicator */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <span className="fz-kicker" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Assessment Focus</span>
            <Chip tone="accent">🏋️ Squats (Depth &amp; Bilateral Balance)</Chip>
          </div>

          <div className="fz-assess-stage" style={{ aspectRatio: stageAspectRatio }}>
            <video
              ref={videoRef}
              playsInline
              muted
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth > 0 && v.videoHeight > 0) {
                  setStageAspectRatio(`${v.videoWidth} / ${v.videoHeight}`);
                }
              }}
              style={{ display: mode !== 'simulation' ? 'block' : 'none' }}
            />
            {mode === 'simulation' || stage === 'setup' ? (
              <div className="fz-assess-stage__placeholder">
                {stage === 'setup' ? (
                  <>
                    <svg width="52" height="52" viewBox="0 0 32 32" aria-hidden>
                      <path d="M9 24 L16 7 L19 15 L23 15" stroke="var(--volt)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p>
                      {mode === 'camera'
                        ? 'Position the camera ~3 m away with full body visible.'
                        : mode === 'video'
                          ? videoFile ? `Ready to process “${videoFile.name}”.` : 'Choose a video recorded on any device.'
                          : `Guided demo mode synthesizes a 3D ${testKind.replace('_', ' ')} assessment.`}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
            {stage === 'set_break' && (
              <div
                className="fz-assess-stage__placeholder"
                style={{
                  background: 'rgba(5, 12, 24, 0.94)',
                  backdropFilter: 'blur(12px)',
                  zIndex: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-4)',
                }}
              >
                <div style={{ fontSize: '2.5rem' }}>⏸️</div>
                <h3 style={{ margin: 0, color: 'var(--volt)', fontSize: '1.25rem' }}>
                  Set {currentSetIndex} Complete!
                </h3>
                <p style={{ margin: 0, color: 'var(--ink-high)', fontSize: '0.92rem', textAlign: 'center' }}>
                  {frameCount} frames recorded for Set {currentSetIndex}. Rest or choose your next step:
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Button size="lg" onClick={() => void startNextSet()}>
                    ➕ Start Set {currentSetIndex + 1} (👍 Thumbs Up)
                  </Button>
                  <Button variant="ghost" size="lg" onClick={() => void triggerEndSessionWithCountdown()}>
                    🏁 End Session & Analyze (👎 Thumbs Down)
                  </Button>
                </div>
              </div>
            )}
            <canvas ref={canvasRef} />
            {stage === 'countdown' ? <div className="fz-countdown">{countdown}</div> : null}
            {endingCountdown !== null ? <div className="fz-countdown" style={{ color: '#ff6b6b' }}>{endingCountdown}</div> : null}
            <div className="fz-assess-hud">
              {stage !== 'setup' && <Chip>{status || 'Preparing…'}</Chip>}
              {stage === 'recording' && <Chip>Set {currentSetIndex} • {frameCount} frames captured</Chip>}
              {stage === 'set_break' && <Chip tone="accent">Set {currentSetIndex} Intermission</Chip>}
              {endingCountdown !== null && <Chip tone="warning">👎 Ending in {endingCountdown}s...</Chip>}
              {activeGesture === 'thumbs_up' && <Chip tone="accent">👍 Thumbs Up Detected</Chip>}
              {activeGesture === 'thumbs_down' && <Chip tone="warning">👎 Thumbs Down Detected</Chip>}
              {!sync.online && <Chip>Offline — results will queue</Chip>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
            {(stage === 'setup' || stage === 'result' || stage === 'failed') && (
              <>
                <div className="fz-segment" role="tablist" aria-label="Capture mode">
                  <button role="tab" aria-selected={mode === 'camera'} className={mode === 'camera' ? 'active' : ''} onClick={() => setMode('camera')}>Live camera</button>
                  <button role="tab" aria-selected={mode === 'video'} className={mode === 'video' ? 'active' : ''} onClick={() => setMode('video')}>Upload video</button>
                  <button role="tab" aria-selected={mode === 'simulation'} className={mode === 'simulation' ? 'active' : ''} onClick={() => setMode('simulation')}>Guided demo</button>
                </div>
                {mode === 'video' ? (
                  <label className="fz-btn fz-btn--ghost" style={{ cursor: 'pointer' }}>
                    {videoFile ? `📼 ${shortName(videoFile.name)}` : 'Choose video…'}
                    <input type="file" accept="video/*" className="fz-visually-hidden" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
                  </label>
                ) : null}
                <Button size="lg" onClick={() => void begin()} disabled={mode === 'video' && !videoFile}>
                  {stage === 'setup' ? (mode === 'video' ? 'Process video' : 'Start assessment') : 'Go again'}
                </Button>
              </>
            )}
            {stage === 'recording' && (
              <>
                <Button size="lg" variant="ghost" onClick={() => void triggerEndSetWithCountdown()}>
                  ⏸️ Finish Set {currentSetIndex} & Rest
                </Button>
                <Button size="lg" onClick={() => void triggerEndSessionWithCountdown()}>
                  🏁 End Session & Analyze
                </Button>
              </>
            )}
            {stage === 'analyzing' && <Chip tone="accent">Analyzing 3D angles &amp; form…</Chip>}
          </div>

          {stage === 'failed' && failure ? (
            <div className="fz-error" style={{ marginTop: 'var(--space-4)' }}>{failure}</div>
          ) : null}
        </section>

        <aside>
          {stage === 'result' ? (
            exerciseResult ? (
              <ExerciseResultCard result={exerciseResult} />
            ) : jumpResult ? (
              <ResultCard result={jumpResult} />
            ) : null
          ) : (
            <div className="fz-card">
              <span className="fz-kicker">Assessment Protocol</span>
              <div className="fz-steps" style={{ marginTop: 'var(--space-3)' }}>
                <div className="fz-step"><span className="fz-step__num">1</span>Position full body in frame (facing or side-on).</div>
                <div className="fz-step"><span className="fz-step__num">2</span>Our 3D vector geometry engine measures knee &amp; hip joint angles at 60 FPS.</div>
                <div className="fz-step"><span className="fz-step__num">3</span>FSM fraud engine enforces parallel squat depth (&lt;= 95°) &amp; leg balance in real time.</div>
                <div className="fz-step"><span className="fz-step__num">4</span>Detailed feedback highlights specific <strong>Points to Improve</strong> &amp; <strong>Past Progress</strong>.</div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function ExerciseResultCard({ result }: { result: ExerciseAnalysisResult }) {
  const m = result.metrics;
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});

  const toggleCheck = (id: string) => {
    setCheckedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(checkedMap).filter(Boolean).length;
  const totalCheckItems = result.improvementChecklist?.length ?? 0;

  return (
    <div className="fz-card fz-animate-in" style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {/* Rep Count & Accuracy Header */}
      <div>
        <span className="fz-kicker">{result.exerciseName}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
          <span style={{ fontSize: '2.8rem', fontWeight: 800, color: 'var(--volt)', lineHeight: 1 }}>{m.totalAttempts}</span>
          <span style={{ color: 'var(--ink-high)', fontSize: '1.2rem', fontWeight: 700 }}>
            Reps Performed <span style={{ color: 'var(--ink-mid)', fontWeight: 400, fontSize: '0.95rem' }}>({m.formAccuracyPercent.toFixed(1)}% Accuracy)</span>
          </span>
        </div>
      </div>

      {/* Detailed Rep Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', background: 'rgba(255, 255, 255, 0.03)', padding: 'var(--space-3)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ffffff' }}>{m.totalAttempts}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-mid)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reps Performed</div>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--volt)' }}>{m.validReps}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-mid)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valid Reps</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--volt)' }}>{m.formAccuracyPercent.toFixed(1)}%</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-mid)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rep Accuracy</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', margin: 'var(--space-2) 0' }}>
        <ProgressRing value={m.formAccuracyPercent} label="Form Accuracy" size={96} stroke={7} />
        <ProgressRing value={Math.max(0, 100 - m.avgMaxAsymmetryDeg * 3)} label="Symmetry" size={96} stroke={7} />
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <Meter label="Form Accuracy (%)" value={m.formAccuracyPercent} max={100} />
        <Meter label="Avg Limb Asymmetry (°)" value={m.avgMaxAsymmetryDeg} max={25} />
      </div>

      {/* DEDICATED SECTION: Check for Improvements */}
      <div style={{ padding: 'var(--space-4)', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 10, border: '1px solid rgba(200, 241, 53, 0.25)', display: 'grid', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--volt)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span>🔍 Check for Improvements</span>
          </h3>
          {totalCheckItems > 0 && (
            <Chip tone={completedCount === totalCheckItems ? 'accent' : 'neutral'}>
              {completedCount} / {totalCheckItems} Reviewed
            </Chip>
          )}
        </div>

        {/* Form Quality & Biometric Check Items */}
        {result.improvementChecklist && result.improvementChecklist.length > 0 && (
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {result.improvementChecklist.map((item) => {
              const isChecked = !!checkedMap[item.id];
              const statusBg =
                item.status === 'pass'
                  ? 'rgba(200, 241, 53, 0.15)'
                  : item.status === 'warning'
                  ? 'rgba(255, 193, 7, 0.15)'
                  : 'rgba(244, 67, 54, 0.15)';
              const statusColor =
                item.status === 'pass'
                  ? 'var(--volt)'
                  : item.status === 'warning'
                  ? '#ffc107'
                  : '#f44336';
              const statusLabel =
                item.status === 'pass' ? '✓ PASS' : item.status === 'warning' ? '⚠️ WARNING' : '❌ ACTION NEEDED';

              return (
                <div
                  key={item.id}
                  onClick={() => toggleCheck(item.id)}
                  style={{
                    padding: 'var(--space-3)',
                    background: isChecked ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 8,
                    border: `1px solid ${isChecked ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.08)'}`,
                    cursor: 'pointer',
                    opacity: isChecked ? 0.7 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--volt)' }}
                      />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isChecked ? 'var(--ink-mid)' : '#ffffff', textDecoration: isChecked ? 'line-through' : 'none' }}>
                        {item.name}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: statusBg, color: statusColor }}>
                      {statusLabel}
                    </span>
                  </div>
                  <p style={{ margin: 'var(--space-1) 0 0 24px', fontSize: '0.82rem', color: 'var(--ink-mid)' }}>
                    {item.detail}
                  </p>
                  <p style={{ margin: '4px 0 0 24px', fontSize: '0.82rem', color: statusColor, fontWeight: 500 }}>
                    💡 Tip: {item.recommendation}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Actionable Points to Improve List */}
        {result.pointsToImprove.length > 0 && (
          <div style={{ padding: 'var(--space-3)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 8, border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
            <h4 style={{ margin: '0 0 var(--space-2)', color: 'var(--volt)', fontSize: '0.88rem' }}>🎯 Specific Recommendations</h4>
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', display: 'grid', gap: 'var(--space-1)', fontSize: '0.85rem', color: 'var(--ink-mid)' }}>
              {result.pointsToImprove.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Multi-Set Breakdown & Set Improvements */}
        {result.setAnalysis && result.setAnalysis.sets.length > 0 && (
          <div style={{ padding: 'var(--space-3)', background: 'rgba(0, 240, 255, 0.05)', borderRadius: 8, border: '1px solid rgba(0, 240, 255, 0.2)' }}>
            <h4 style={{ margin: '0 0 var(--space-2)', color: '#00f0ff', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📊 Multi-Set Breakdown ({result.setAnalysis.totalSets} Set{result.setAnalysis.totalSets > 1 ? 's' : ''})</span>
            </h4>
            <div style={{ display: 'grid', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
              {result.setAnalysis.sets.map((setRec) => (
                <div key={setRec.setIndex} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--ink-mid)', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: 4 }}>
                  <span style={{ fontWeight: 600, color: '#ffffff' }}>Set {setRec.setIndex}</span>
                  <span>{setRec.repsCount} reps performed</span>
                  <span style={{ color: 'var(--volt)', fontWeight: 600 }}>{setRec.accuracyPercent}% accuracy</span>
                  <span>{setRec.durationSec}s</span>
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-mid)', fontStyle: 'italic' }}>
              💡 {result.setAnalysis.summaryText}
            </p>
          </div>
        )}

        {/* Session Progress Delta */}
        <div style={{ padding: 'var(--space-3)', background: 'rgba(200, 241, 53, 0.06)', borderRadius: 8, border: '1px solid rgba(200, 241, 53, 0.2)' }}>
          <h4 style={{ margin: '0 0 var(--space-1)', color: '#ffffff', fontSize: '0.88rem' }}>📈 Session Progress vs Baseline</h4>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-mid)' }}>{result.pastImprovement.summaryText}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Link className="fz-btn fz-btn--ghost" to="/history">View history</Link>
        <Link className="fz-btn fz-btn--ghost" to="/dashboard">Dashboard</Link>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: JumpAnalysis }) {
  const m = result.metrics;
  return (
    <div className="fz-card fz-animate-in">
      <div className="fz-result-hero">
        <span className="fz-kicker">Jump height</span>
        <div className="fz-result-hero__value">{formatHeight(m.jumpHeight.value)}</div>
        <div className="fz-result-hero__ci">
          95% CI {formatHeight(Math.max(0, m.jumpHeight.ci95[0]))} – {formatHeight(m.jumpHeight.ci95[1])}
          {' · '}flight {m.flightTime.value.toFixed(3)}s
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', margin: 'var(--space-4) 0' }}>
        <ProgressRing value={m.symmetryScore} label="Symmetry" size={96} stroke={7} />
        <ProgressRing value={m.movementQuality} label="Quality" size={96} stroke={7} />
        <ProgressRing value={m.confidence * 100} label="Confidence" size={96} stroke={7} />
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <Meter label="Peak power (W)" value={m.peakPowerW} max={Math.max(3000, m.peakPowerW)} />
        <Meter label="Relative power (W/kg)" value={m.relativePowerWkg} max={80} />
      </div>
      {m.qualityFlags.length > 0 ? (
        <div style={{ marginTop: 'var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}>
          {m.qualityFlags.map((flag) => (
            <Chip key={flag} tone="warning">{flag}</Chip>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}>
        <Link className="fz-btn fz-btn--ghost" to="/history">View history</Link>
        <Link className="fz-btn fz-btn--ghost" to="/dashboard">Dashboard</Link>
      </div>
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function shortName(name: string): string {
  return name.length > 22 ? `${name.slice(0, 19)}…` : name;
}
