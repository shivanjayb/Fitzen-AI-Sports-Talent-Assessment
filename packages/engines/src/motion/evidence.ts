/**
 * Evidence quality and plain-language summary of a session report.
 *
 * Pure functions over a finished `SessionReport`, so reports saved before this module existed are read the same way.
 * Capture quality (could the camera measure it?) is kept apart from form quality (was it done well?): a poor capture
 * lowers trust in the numbers, never the athlete's score.
 */
import type { ExerciseDef } from './types.js';
import { isAssessedReport, type CheckStat, type SessionReport } from './engine.js';
import type { ViewSummary } from './viewAngle.js';

export type EvidenceLevel = 'strong' | 'limited' | 'insufficient';
export interface EvidenceFactor {
  id: 'tracking' | 'gap' | 'frameRate' | 'plane' | 'view' | 'noise' | 'sample' | 'match';
  label: string;
  status: 'good' | 'warn' | 'bad';
  /** Measured value, ready to show. */
  value: string;
  /** What to change next time; only set when status is not good. */
  advice?: string;
}
export interface Evidence {
  level: EvidenceLevel;
  /** Fair to compare with other attempts of the same exercise and protocol. */
  comparable: boolean;
  factors: EvidenceFactor[];
}

const grade3 = (x: number, good: number, warn: number, higherIsBetter = true): EvidenceFactor['status'] =>
  (higherIsBetter ? x >= good : x <= good) ? 'good' : (higherIsBetter ? x >= warn : x <= warn) ? 'warn' : 'bad';

/**
 * 1 SD of flight-time jump height from frame timing alone. Take-off and landing each fall uniformly inside one frame
 * interval Δ (SD Δ/√12 each, so Δ/√6 for the flight time); h = g·t²/8 gives σ_h = g·t·σ_t/4. Sub-frame fitting can
 * beat this, so it is an upper guide, not a claim of accuracy against a force plate.
 */
export function jumpTimingErrorCm(flightMs: number, fps: number): number {
  if (!(flightMs > 0) || !(fps > 0)) return NaN;
  return 100 * 9.81 * (flightMs / 1000) * (1 / fps / Math.sqrt(6)) / 4;
}

export function assessEvidence(def: ExerciseDef | undefined, r: SessionReport, viewAngle?: ViewSummary | null): Evidence {
  const view = def?.camera === 'front' ? 'facing the camera' : 'side-on to the camera';
  const factors: EvidenceFactor[] = [];
  const add = (f: EvidenceFactor) => factors.push(f.status === 'good' ? { ...f, advice: undefined } : f);

  add({ id: 'tracking', label: 'Body tracked', status: grade3(r.trackedPct, 90, 70), value: `${Math.round(r.trackedPct)}% of frames`,
    advice: 'Keep your whole body in the frame for the whole attempt, 2–3 m from the camera.' });
  const gap = r.validity?.longestGapMs;
  if (gap !== undefined && Number.isFinite(gap)) add({ id: 'gap', label: 'Longest tracking gap', status: grade3(gap, 500, 1500, false), value: `${(gap / 1000).toFixed(1)} s`,
    advice: 'Something hid you from the camera. Clear the space and prop the phone so it cannot move.' });
  // A jump's flight lasts ~0.4–0.6 s, so timing needs more frames than a 2 s rep does.
  const need = r.mode === 'event' ? 30 : 15;
  if (r.fps > 0) add({ id: 'frameRate', label: 'Frame rate', status: grade3(r.fps, need * 0.95, need * 0.6), value: `${Math.round(r.fps)} fps`,
    advice: r.mode === 'event' ? 'Fast movements need 30 fps or more. Close other apps, use better light, or film with the camera app and upload the clip.'
      : 'The device processed frames slowly. Close other apps or choose the Lite pose model in Profile.' });
  add({ id: 'plane', label: 'Movement in view plane', status: grade3(r.foreshortenedPct, 10, 30, false), value: `${Math.round(100 - r.foreshortenedPct)}% of frames`,
    advice: `Limbs pointed toward or away from the camera, where a single camera cannot measure the angle. Stand ${view}.` });
  // Wide bands: depth is BlazePose's weakest axis, so only a clear turn away from the needed view is marked.
  if (viewAngle) add({ id: 'view', label: viewAngle.expected === 'side' ? 'Side-on to the camera' : 'Facing the camera', status: grade3(viewAngle.errorDeg, 20, 35, false),
    value: `about ${Math.round(viewAngle.errorDeg)}° off`, advice: `You were turned about ${Math.round(viewAngle.errorDeg)}° away from the view this exercise needs, which makes single-camera angles read wrong. Stand ${view}.` });
  const noise = Object.values(r.angles).map((a) => a.noise).filter((x) => Number.isFinite(x));
  if (noise.length) {
    const n = noise.reduce((a, b) => a + b, 0) / noise.length;
    add({ id: 'noise', label: 'Angle steadiness', status: grade3(n, 2, 5, false), value: `±${n.toFixed(1)}°`,
      advice: 'Landmarks jittered. Use brighter, even light, plain fitted clothing and a steady phone.' });
  }
  const done = r.reps ? r.reps.count : r.hold ? r.hold.totalSec : r.events?.length ?? 0;
  add(r.reps ? { id: 'sample', label: 'Completed reps', status: grade3(done, 3, 1), value: String(done), advice: 'Three or more reps give a steadier picture of your technique.' }
    : r.hold ? { id: 'sample', label: 'Time in position', status: grade3(done, 5, 1), value: `${done.toFixed(1)} s`, advice: 'Hold the position for at least five seconds so stability can be measured.' }
    : { id: 'sample', label: 'Attempts', status: grade3(done, 2, 1), value: String(done), advice: 'Two or more attempts show whether the result repeats.' });
  const wrong = r.mismatched?.length ?? 0;
  add({ id: 'match', label: 'Matched the exercise', status: wrong === 0 ? 'good' : wrong > done ? 'bad' : 'warn', value: wrong ? `${wrong} not counted` : 'Yes',
    advice: `Some movements did not look like ${r.name} and were left out. Do one exercise per attempt.` });

  const bad = factors.filter((f) => f.status === 'bad').length, warn = factors.filter((f) => f.status === 'warn').length;
  const level: EvidenceLevel = !isAssessedReport(r) ? 'insufficient' : bad > 0 || warn >= 2 ? 'limited' : 'strong';
  const blocking = factors.some((f) => f.status === 'bad' && (f.id === 'tracking' || f.id === 'frameRate' || f.id === 'match' || f.id === 'view'));
  return { level, comparable: level !== 'insufficient' && !blocking, factors };
}

export interface ReportSummary {
  /** One sentence: the outcome. */
  verdict: string;
  /** What the report measured, in plain words. */
  measured: string;
  strengths: string[];
  /** The single most useful thing to change, or null when nothing measurable needs fixing. */
  focus: { title: string; detail: string } | null;
  /** What to do in the next session. */
  next: string;
}

const unitOf = (c: CheckStat) => (/width|spread/i.test(c.label) ? '×' : '°');

export function summarizeReport(def: ExerciseDef | undefined, r: SessionReport, evidence = assessEvidence(def, r)): ReportSummary {
  const measured = r.mode === 'reps' ? `Rep count, depth, tempo and ${r.checks.length} joint checks from ${Math.round(r.durationSec)} s of movement.`
    : r.mode === 'hold' ? `Time held in position and how steady ${r.checks.length} joint checks stayed.`
    : `Each attempt's ${r.events?.some((e) => e.jumpHeightCm !== undefined) ? 'flight time and jump height' : 'release'} plus ${r.checks.length} joint checks.`;
  if (evidence.level === 'insufficient') {
    const why = evidence.factors.find((f) => f.status !== 'good');
    return { verdict: 'The camera could not measure this attempt.', measured, strengths: [],
      focus: { title: 'Set up for a usable attempt', detail: why?.advice ?? 'Show your whole body, 2–3 m from the camera, in good light.' },
      next: 'Retake it. This attempt is not scored and does not count toward progress.' };
  }

  const scored = r.checks.filter((c) => c.samples > 0);
  const strengths: string[] = [];
  const rp = r.reps;
  if (rp && rp.count >= 3 && rp.partial === 0) strengths.push(`Every rep reached full ${rp.driverLabel.toLowerCase()} range`);
  if (rp && rp.count >= 3 && rp.consistencyCv <= 8) strengths.push('Range was consistent rep to rep');
  if (rp && rp.count >= 3 && rp.avgEccentricSec >= 1.5) strengths.push('Controlled lowering phase');
  if (r.hold && r.hold.bestSec >= r.hold.targetSec) strengths.push(`Reached the ${r.hold.targetSec} s hold target`);
  for (const c of [...scored].sort((a, b) => b.pctGood - a.pctGood)) if (c.pctGood >= 85 && strengths.length < 3) strengths.push(`${c.label} stayed in the target range`);

  // One focus only: the fault that cost the most score, else range, else tempo.
  const weight = (c: CheckStat) => def?.checks.find((d) => d.angle === c.angle && d.when === c.when)?.weight ?? 1;
  const worst = [...scored].sort((a, b) => weight(b) * (b.pctBad + 0.4 * b.pctOk) - weight(a) * (a.pctBad + 0.4 * a.pctOk))[0];
  let focus: ReportSummary['focus'] = null;
  if (worst && (worst.pctBad >= 25 || worst.pctBad + worst.pctOk >= 40)) {
    focus = { title: worst.cue, detail: `${worst.label} averaged ${Math.round(worst.mean)}${unitOf(worst)} against a target of ${worst.good[0]}–${worst.good[1]}${unitOf(worst)}, and was in range ${Math.round(worst.pctGood)}% of the time.${worst.why ? ` ${worst.why}` : ''}` };
  } else if (rp && rp.count > 0 && rp.partial / rp.count > 0.2) {
    focus = { title: 'Reach full range on every rep', detail: `${rp.partial} of ${rp.count} reps stopped short of ${def?.reps?.start === 'low' ? '≥' : '≤'} ${rp.target}° ${rp.driverLabel.toLowerCase()}. Slow down or lighten the load until each rep gets there.` };
  } else if (rp && rp.count >= 3 && rp.avgEccentricSec < 1) {
    focus = { title: 'Slow the lowering phase', detail: `It averaged ${rp.avgEccentricSec.toFixed(1)} s. Aim for about 2 s down so the muscle, not momentum, does the work.` };
  } else if (r.hold && r.hold.bestSec < r.hold.targetSec) {
    focus = { title: 'Build the hold time', detail: `Best hold was ${r.hold.bestSec.toFixed(1)} s of a ${r.hold.targetSec} s target. Add 5–10 s per session.` };
  }

  const count = rp ? `${rp.valid} of ${rp.count} reps met the standard` : r.hold ? `Best hold ${r.hold.bestSec.toFixed(1)} s` : (() => {
    const best = Math.max(0, ...(r.events ?? []).map((e) => e.jumpHeightCm ?? 0));
    return best > 0 ? `Best jump ${best.toFixed(1)} cm` : `${r.events?.length ?? 0} attempt${r.events?.length === 1 ? '' : 's'} measured`;
  })();
  const quality = r.formScore >= 85 ? 'with strong technique' : r.formScore >= 70 ? 'with sound technique and one clear thing to fix' : 'and technique needs work before adding load or speed';
  const verdict = `${count}, ${quality}.${evidence.level === 'limited' ? ' Capture quality was limited, so treat the numbers as approximate.' : ''}`;
  const next = evidence.level === 'limited' ? `Retake with a better setup to confirm: ${(evidence.factors.find((f) => f.status === 'bad') ?? evidence.factors.find((f) => f.status === 'warn'))?.advice ?? 'keep your whole body in view.'}`
    : focus ? `Next session, work on one thing: ${focus.title.toLowerCase()}. Then retest under the same setup to see if it changed.`
    : r.mode === 'reps' ? 'Technique held up. Progress by adding 1–2 reps or a small amount of load, then retest.'
    : r.mode === 'hold' ? 'Target reached. Extend the hold by 10–15 s or move to a harder variation.'
    : 'Repeat under the same setup on another day to see whether the result holds.';
  return { verdict, measured, strengths, focus, next };
}
