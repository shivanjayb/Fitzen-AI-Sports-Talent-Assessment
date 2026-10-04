/** Compact, data-only context for the AI assistant. Never includes video, full name or account details. */
import { exerciseById, mentalReport, readiness, summarizeFuture } from '@fitzen/engines';
import type { AssistantContext } from './openAssistant';
import { getHistory, getProfile, measureOf, normOf, toAthlete } from './store';

const MAX = 12_000;
// Round floats so the JSON stays small.
const round = (_k: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v);

function profile() {
  const p = getProfile();
  const first = p.name.trim().split(/\s+/)[0];
  return {
    firstName: first && first !== 'Athlete' ? first : undefined, age: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg,
    sport: p.sport || undefined, city: p.city || undefined, state: p.state || undefined, diet: p.diet,
    sleepHours: p.sleepHours, trainingDaysPerWeek: p.trainingDaysPerWeek, hasCoach: p.hasCoach,
  };
}

export function buildContext(c: AssistantContext, route: string): string {
  if (c.kind === 'help') return JSON.stringify({ kind: 'help', route }); // no personal data
  const hist = getHistory();
  const a = toAthlete(getProfile());
  let data: unknown;

  if (c.kind === 'result') {
    const s = hist.find((x) => x.id === c.sessionId);
    if (!s) return JSON.stringify({ kind: 'result', route, error: 'Session not found on this device.' });
    const { series: _s, reps, ...r } = s.report;
    const ready = s.readiness ? readiness(s.readiness) : null;
    const past = hist.map((x) => x.report).reverse();
    const fut = a ? summarizeFuture(a, s.report, past, ready) : null;
    data = {
      source: s.source,
      exercise: { ...r, target: exerciseById(r.exerciseId)?.reps?.target },
      reps: reps && {
        ...reps, mismatched: reps.mismatched.slice(0, 5),
        // ponytail: first 30 reps only; enough to show drift and faults.
        list: reps.list.slice(0, 30).map((x) => ({ i: x.index, durMs: x.durationMs, eccMs: x.eccentricMs, conMs: x.concentricMs, rom: x.rom, full: x.fullRange, score: x.score, valid: x.valid, faults: x.faults })),
      },
      integrity: s.integrity && { score: s.integrity.score, verdict: s.integrity.verdict, flags: s.integrity.flags.map((f) => `${f.severity}: ${f.message}`) },
      forensics: s.forensics && { format: s.forensics.format, flags: s.forensics.flags.map((f) => `${f.severity}: ${f.message}`) },
      readiness: ready && { ...ready, input: s.readiness },
      mind: mentalReport(s.report, ready, past),
      norm: normOf(s.report, a) ?? (a ? 'no verified norm for this test/age' : 'profile incomplete (age, height, weight needed)'),
      plan: fut && { actions: fut.actions, futureScope: fut.futureScope, talent: fut.projection.talent, drivers: fut.projection.drivers, disclaimer: fut.disclaimer },
    };
  } else {
    const ex = c.kind === 'leaderboard' ? c.exerciseId : null;
    const sessions = hist.filter((s) => !ex || s.report.exerciseId === ex).slice(0, 15).map((s) => {
      const m = measureOf(s.report);
      return { date: s.report.startedAt.slice(0, 10), exercise: s.report.name, source: s.source, grade: s.report.grade, formScore: s.report.formScore, measure: m && `${m.value} ${m.unit}` };
    });
    const pbs: Record<string, string> = {};
    const best: Record<string, number> = {};
    for (const s of hist) {
      const m = measureOf(s.report);
      if (m && m.value > (best[s.report.name] ?? -1)) { best[s.report.name] = m.value; pbs[s.report.name] = `${m.value} ${m.unit}`; }
    }
    const days = new Set(hist.map((s) => new Date(s.report.startedAt).toDateString()));
    let streak = 0; const d = new Date();
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
    while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    data = c.kind === 'leaderboard'
      ? { exerciseId: c.exerciseId, scope: c.scope, rows: c.rows.slice(0, 50).map(({ name: _n, ...r }) => r) /* other athletes' names stay out */, myHistoryForThisExercise: sessions }
      : { totalSessions: hist.length, streakDays: streak, personalBests: pbs, recentSessions: sessions };
  }
  return JSON.stringify({ kind: c.kind, route, today: new Date().toISOString().slice(0, 10), profile: profile(), data }, round).slice(0, MAX); // ponytail: hard cut; the endpoint allows 16 KB
}
