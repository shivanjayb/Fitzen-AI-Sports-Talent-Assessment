/**
 * Per-person exercise ranges. Catalog bands describe a typical healthy adult; real people reach different depths for
 * body reasons, not effort. This widens a copy of the definition toward the easier side, only where the body limits
 * it, and never touches alignment/safety checks or release angles (physics, not anatomy).
 *
 *  - Range of motion (driver angle at the bottom of each rep and the rep target):
 *    BMI (WHO adult Asian cut-offs / WHO 2007 BMI-for-age z) — soft-tissue contact ends flexion earlier;
 *    age ≥ 45 — joint ROM falls with age (Soucie et al. 2011, Haemophilia 17:500, normal joint ROM by age);
 *    training level — beginners lack mobility and motor control for full depth on day one.
 *  - Trunk lean on knee-dominant lifts: long legs relative to the trunk (Cormic index = sitting height / stature)
 *    force more forward lean to keep balance over the feet (Fry et al. 2003, J Strength Cond Res 17:629).
 *  - Biometric bias: after 3+ sessions the target follows the person's own usual depth, 3° past it, so it keeps
 *    them progressing instead of failing every rep or never being challenged.
 * Height enters through BMI and the Cormic index. Diet changes recovery and body composition advice, not joint angles.
 * ponytail: tolerances are coaching judgement from the cited directions, not fitted values; calibrate on real users.
 */
import { bmiAssessment } from '../athlete/body.js';
import type { SessionReport } from './engine.js';
import { exerciseById } from './catalog/index.js';
import type { ExerciseDef, Range } from './types.js';

export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';
export interface BodyContext {
  ageYears?: number | null; sex?: 'male' | 'female'; heightCm?: number | null; weightKg?: number | null;
  sittingHeightCm?: number | null; level?: TrainingLevel;
  /** This person's usual driver angle at the bottom of a rep (from usualExtreme). */
  usualExtreme?: number | null;
}
/** shiftDeg: how far the rep target moved from the catalog target (0 = standard). */
export interface Personalized { def: ExerciseDef; shiftDeg: number; leanDeg: number; reasons: string[] }

const MAX_ROM = 15;
const MAX_BIAS = 25;

export function personalize(def: ExerciseDef, ctx: BodyContext): Personalized {
  const reasons: string[] = [];
  let rom = 0;
  const { ageYears: age, heightCm: h, weightKg: w } = ctx;
  if (age && h && w && ctx.sex) {
    const b = bmiAssessment({ ageYears: age, sex: ctx.sex, heightCm: h, weightKg: w });
    const add = b.category === 'obese' ? 8 : b.category === 'overweight' ? 4 : 0;
    if (add) { rom += add; reasons.push(`BMI ${b.bmi} (${b.category}): soft tissue limits end range, +${add}°`); }
  }
  if (age && age >= 45) { const add = age >= 60 ? 8 : 4; rom += add; reasons.push(`Age ${age}: joint range falls with age, +${add}°`); }
  const lv = ctx.level ? { beginner: 6, intermediate: 2, advanced: 0 }[ctx.level] : 0;
  if (lv) { rom += lv; reasons.push(`${ctx.level === 'beginner' ? 'Beginner' : 'Intermediate'}: building mobility, +${lv}°`); }
  rom = Math.min(rom, MAX_ROM);

  const cormic = h && ctx.sittingHeightCm && ctx.sittingHeightCm < h ? ctx.sittingHeightCm / h : null;
  const driver = def.angles.find((a) => a.id === def.reps?.driver);
  const kneeLed = driver?.kind === 'joint' && driver.joint === 'knee';
  const leanDeg = kneeLed && cormic !== null && cormic < 0.51 ? 6 : 0;
  if (leanDeg) reasons.push(`Long legs for your trunk (sitting/standing ${cormic!.toFixed(2)}): more forward lean is normal, +${leanDeg}°`);

  const out: ExerciseDef = structuredClone(def);
  const r = out.reps;
  if (r) {
    const s = r.start === 'high' ? 1 : -1;
    // Deepest target allowed: never past the catalog target, never so shallow that it overlaps the rep entry.
    let target = r.target + s * rom;
    const u = ctx.usualExtreme;
    const biased = u == null ? null : u - 3 * s;
    if (biased !== null && s * biased > s * target) {
      target = s * (biased - r.target) > MAX_BIAS ? r.target + s * MAX_BIAS : biased;
      reasons.push(`Your usual depth is ${Math.round(u!)}°: target set 3° past it`);
    }
    target = s * Math.min(s * target, Math.max(s * r.enter - 10, s * r.target));
    const shift = target - r.target;
    r.target = Math.round(target);
    if (shift) for (const c of out.checks) if (c.angle === r.driver && c.when === 'bottom') {
      // s = 1: depth is a low angle, so the easier edge is the upper bound.
      c.good = ease(c.good, shift); c.ok = ease(c.ok, shift);
    }
    if (leanDeg) for (const c of out.checks) {
      const a = out.angles.find((x) => x.id === c.angle);
      if (a?.kind === 'segment' && a.segment === 'trunk') { c.good = [c.good[0], c.good[1] + leanDeg]; c.ok = [c.ok[0], c.ok[1] + leanDeg]; }
    }
  }
  if (out.hold && ctx.level && ctx.level !== 'advanced') {
    const k = ctx.level === 'beginner' ? 0.5 : 0.75;
    out.hold.targetSec = Math.max(10, Math.round((out.hold.targetSec * k) / 5) * 5);
    reasons.push(`${ctx.level === 'beginner' ? 'Beginner' : 'Intermediate'} hold goal ${out.hold.targetSec} s (standard ${def.hold!.targetSec} s)`);
  }
  if (out.event) reasons.push('Release and take-off angles are physics, so they stay standard');
  return { def: out, shiftDeg: r ? Math.abs(r.target - def.reps!.target) : 0, leanDeg, reasons };
}

/** Move the easier edge of a band by `shift` (positive raises the upper edge, negative lowers the lower edge). */
const ease = ([a, b]: Range, shift: number): Range => (shift > 0 ? [a, b + shift] : [a + shift, b]);

/** Median driver angle at the bottom of reps over the last 5 sessions of this exercise; null with < 3 sessions. */
export function usualExtreme(def: ExerciseDef, history: SessionReport[]): number | null {
  const mine = history.filter((h) => h.exerciseId === def.id && h.reps?.list.length).slice(0, 5);
  if (mine.length < 3) return null;
  const xs = mine.flatMap((h) => h.reps!.list.map((x) => x.extreme)).sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)] ?? null;
}

/** Reps that meet the standard catalog target: leaderboards stay comparable when personal ranges are on. */
export function standardReps(r: SessionReport): number | null {
  const rule = exerciseById(r.exerciseId)?.reps;
  if (!r.reps || !rule) return null;
  const s = rule.start === 'high' ? 1 : -1;
  return r.reps.list.filter((x) => x.valid && s * x.extreme <= s * rule.target).length;
}

export type Response = 'responding' | 'plateau' | 'declining';
export interface ExerciseResponse { exerciseId: string; name: string; sessions: number; changePct: number; formChange: number; response: Response }

/** Reps, hold seconds, best jump cm, or mean throw score (0–100). */
const headline = (r: SessionReport) => {
  if (r.reps) return r.reps.valid;
  if (r.hold) return r.hold.bestSec;
  const ev = r.events ?? [];
  const jump = Math.max(0, ...ev.map((e) => e.jumpHeightCm ?? 0));
  return jump || (ev.length ? (100 * ev.reduce((p, e) => p + e.score, 0)) / ev.length : 0);
};

/** How each exercise is working for this person: % change in their headline number, first → latest third of sessions. */
export function responseProfile(history: SessionReport[]): ExerciseResponse[] {
  const by = new Map<string, SessionReport[]>();
  for (const h of history) by.set(h.exerciseId, [...(by.get(h.exerciseId) ?? []), h]);
  const out: ExerciseResponse[] = [];
  for (const [id, xs] of by) {
    if (xs.length < 3) continue;
    const old = [...xs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const n = Math.max(1, Math.floor(old.length / 3));
    const avg = (rs: SessionReport[], f: (r: SessionReport) => number) => rs.reduce((p, r) => p + f(r), 0) / rs.length;
    const first = avg(old.slice(0, n), headline), last = avg(old.slice(-n), headline);
    const changePct = first > 0 ? Math.round(((last - first) / first) * 100) : last > 0 ? 100 : 0;
    const formChange = Math.round(avg(old.slice(-n), (r) => r.formScore) - avg(old.slice(0, n), (r) => r.formScore));
    const response: Response = changePct >= 5 || (changePct > -5 && formChange >= 5) ? 'responding' : changePct <= -5 ? 'declining' : 'plateau';
    out.push({ exerciseId: id, name: old[0]!.name, sessions: xs.length, changePct, formChange, response });
  }
  return out.sort((a, b) => b.changePct - a.changePct);
}
