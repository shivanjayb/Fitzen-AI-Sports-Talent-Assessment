import { exerciseById, summarizeFuture } from '@fitzen/engines';
import type { AssistantContext } from './openAssistant';
import { getHistory, getProfile, getSession, isEligibleSession, measureOf, toAthlete } from './store';

export function localAdvice(c: AssistantContext, topic: string): string {
  if (c.kind === 'help') {
    // Typed questions from the Ask bar arrive as 'help': route the ones this local coach can answer from saved sessions.
    if (/progress|improv|better|often|frequen|next|how am i|my (?:sessions?|results?|scores?)/i.test(topic)) return localAdvice({ kind: 'progress' }, topic);
    if (/video|clip|upload/i.test(topic)) return 'Choose an exercise, then Analyse video. Use a clip under 100 MB and 2 minutes, filmed at hip height with the whole body visible. The clip stays on your device. Authenticity flags need human review.';
    if (/colou?r|green|amber|red\b/i.test(topic)) return 'Green means within the exercise target band, amber is moderate, red needs attention. Grey or missing checks cannot be assessed. These bands are screening rules, still awaiting real-athlete calibration.';
    const unknown = topic.trim() && !/record|jump|camera|set ?up|start|test|how do i/i.test(topic)
      ? 'I am Fitzen’s on-device coach, so I can only answer from your saved sessions and how the app works. Try asking how to record a test, how to analyse a video, what the colours mean, or how you are progressing.\n\n' : '';
    return unknown + 'Choose a test and read Set up. Keep the whole body visible, camera 2–3 m away at hip height, and use the specified view. For the hands-on-hips countermovement jump, keep your hands on your hips throughout. Hold still for the framing check and countdown, then jump and land in the same place. Stop for pain, dizziness or illness.';
  }
  const history = getHistory().filter(isEligibleSession);
  if (c.kind === 'result') {
    const s = getSession(c.sessionId);
    if (!s || !isEligibleSession(s)) return 'This session is a demo, flagged, or has insufficient evidence. It cannot support a performance recommendation. Check framing and tracking, then record the same protocol again.';
    const r = s.report, m = measureOf(r);
    const a = toAthlete(getProfile());
    const future = a ? summarizeFuture(a, r, history.map((x) => x.report).reverse(), null) : null;
    return [
      `## ${r.name}
${m ? `${m.value.toFixed(m.unit === 'reps' ? 0 : 1)} ${m.unit}. ` : ''}Form ${r.formScore}/100; tracking ${r.trackedPct.toFixed(0)}%.`,
      ...r.insights.slice(0, 5).map((x) => `- **${x.title}**: ${x.detail}`),
      ...(future?.actions.slice(0, 3).map((x) => `- **${x.title}**: ${x.detail}`) ?? ['Complete your Profile to use the existing nutrition and recovery guidance.']),
      'Retest the same protocol, camera view and conditions. Compare observed results; improvements are not guaranteed.',
    ].join('\n\n');
  }
  const selected = c.kind === 'leaderboard' ? history.filter((s) => s.report.exerciseId === c.exerciseId) : history;
  if (!selected.length) return 'No eligible real assessments yet. Start with a guided test; demos and flagged or unassessed results do not count.';
  if (/often|frequen|how many/i.test(topic)) {
    const since = Date.now() - 28 * 864e5, n = selected.filter((s) => Date.parse(s.report.startedAt) >= since).length;
    return `${n} eligible session${n === 1 ? '' : 's'} in the last 4 weeks (about ${(n / 4).toFixed(1)} a week). Most athletes progress with 2–4 focused sessions a week plus rest days; keep the same test and camera setup so retests compare fairly.`;
  }
  const latest = selected[0]!, same = selected.filter((s) => s.report.exerciseId === latest.report.exerciseId);
  const values = same.map((s) => measureOf(s.report)).filter((x) => x !== null);
  const newest = values[0], oldest = values[values.length - 1];
  return `${selected.length} eligible retained sessions. Latest test: ${exerciseById(latest.report.exerciseId)?.name ?? latest.report.name}.` +
    (newest && oldest ? `

Same-test change: ${oldest.value.toFixed(1)} → ${newest.value.toFixed(1)} ${newest.unit} across ${same.length} retained sessions. This is observed change, not proof of a training effect.` : '') +
    '\n\nOpen the latest report to review measured faults. Pick one technique cue, keep the camera and protocol consistent, and retest after your training block. Cloud rankings are self-reported until independently verified.';
}
