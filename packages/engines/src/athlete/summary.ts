/** "What to do better + future scope": merges report insights, diet, readiness and projection into the top 5 actions. */
import type { SessionReport } from '../motion/engine.js';
import { assessDiet } from './body.js';
import { percentileFor } from './norms.js';
import { bestJumpCm, projectGrowth, type GrowthProjection } from './projection.js';
import type { ReadinessResult } from './readiness.js';
import type { AthleteProfile } from './types.js';

export interface FutureAction { priority: number; area: 'form' | 'diet' | 'sleep' | 'training' | 'recovery' | 'body'; title: string; detail: string }
export interface FutureSummary { actions: FutureAction[]; futureScope: string[]; projection: GrowthProjection; disclaimer: string }

export function summarizeFuture(p: AthleteProfile, report: SessionReport, history: SessionReport[], ready?: ReadinessResult | null): FutureSummary {
  const all: FutureAction[] = [];
  const add = (priority: number, area: FutureAction['area'], title: string, detail: string) => all.push({ priority, area, title, detail });
  const diet = assessDiet(p);

  if (ready?.safety) add(100, 'recovery', 'Talk to someone you trust', ready.safety);
  else if (ready && (ready.level === 'rest' || ready.level === 'caution')) add(70, 'recovery', 'Recover before pushing', ready.message);

  report.insights.filter((i) => i.level !== 'good').slice(0, 2).forEach((i, k) => add(i.level === 'bad' ? 90 - k : 75 - k, 'form', i.title, i.detail));

  if (diet.proteinGapG > 0) {
    const foods = diet.suggestions.map((s) => `${s.portions}× ${s.food.toLowerCase()} (${s.portion})`).join(', ');
    add(60 + Math.min(20, diet.proteinGapG / 2), 'diet', `Add ~${diet.proteinGapG} g protein a day`, `Target ${diet.proteinNeedG.target} g (${diet.proteinNeedG.basis}). Easy adds: ${foods}.`);
  }
  if (diet.bmi.category !== 'normal') add(65, 'body', `BMI ${diet.bmi.bmi}: ${diet.bmi.category}`, diet.notes[0] ?? `Reference: ${diet.bmi.reference}.`);
  if (p.sleepHours < diet.sleepTargetH.low) add(55 + 5 * (diet.sleepTargetH.low - p.sleepHours), 'sleep', `Sleep ${diet.sleepTargetH.low}–${diet.sleepTargetH.high} h`, `You sleep ${p.sleepHours} h. Growth and recovery happen in deep sleep — fix a bedtime and keep the phone away.`);
  if (p.trainingDaysPerWeek < 3) add(68, 'training', 'Train 3 days a week', 'Three short sessions (jumps, push-ups, core) beat one long one. Consistency drives most of the projected gain.');
  if (diet.fruitVegTargetServings > p.diet.fruitVegServingsPerDay) add(40, 'diet', 'Eat 5 servings of fruit & vegetables', 'Seasonal local produce is fine — guava, banana, amla, greens.');
  if (!p.hasCoach) add(35, 'training', 'Find a coach or SAI centre', 'Share your Fitzen report with a school PE teacher or the nearest Khelo India / SAI centre for a proper plan.');

  const projection = projectGrowth(p, [...history.filter((h) => h.startedAt !== report.startedAt), report]);
  const futureScope: string[] = [];
  for (const m of projection.metrics) {
    const at = m.points[m.points.length - 1];
    if (!at) continue;
    futureScope.push(`Jump in ${at.week} weeks: ${at.current.low}–${at.current.high} cm with current habits, ${at.plan.low}–${at.plan.high} cm if you follow the plan (now ${m.baseline} cm).`);
    const planMid = (at.plan.low + at.plan.high) / 2;
    const now = percentileFor(m.exerciseId, 'jumpHeightCm', m.baseline, p.ageYears, p.sex);
    const then = percentileFor(m.exerciseId, 'jumpHeightCm', planMid, p.ageYears + at.week / 52, p.sex);
    if (now?.percentile != null && then?.percentile != null) futureScope.push(`That moves you from about the ${Math.round(now.percentile)}th to the ${Math.round(then.percentile)}th percentile of the reference group (${now.reference}).`);
  }
  if (projection.talent) futureScope.push(projection.talent.summary);
  if (!bestJumpCm(report) && !projection.metrics.length) futureScope.push('Record a vertical jump to unlock a growth projection and talent signal.');

  return {
    actions: all.sort((a, b) => b.priority - a.priority).slice(0, 5).map((a) => ({ ...a, priority: Math.round(a.priority) })),
    futureScope,
    projection,
    disclaimer: 'Estimates from published research and your own data, shown as ranges. Not a medical or selection decision.',
  };
}
