/**
 * Two ways to get a review of one session: an AI coach (Google Gemini through the ai-coach edge function, numbers
 * only) and a real coach (request + chat, migration 010). Without an account or a configured key the AI review falls
 * back to the on-device summary, and says so.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { assessEvidence, exerciseById, summarizeReport } from '@fitzen/engines';
import { supabase, useUser } from '../lib/supabase';
import { getHistory, getProfile, isEligibleSession, measureOf, type SavedSession } from './store';
import { IconSparkle } from './icons';
import { t } from './language';
import './social.css';

const r1 = (x: number | undefined) => (x === undefined || !Number.isFinite(x) ? undefined : Math.round(x * 10) / 10);
/** A session in a few numbers: what a coach would read off the report. No names, no video. */
function brief(s: SavedSession) {
  const r = s.report, m = measureOf(r);
  return {
    date: r.startedAt.slice(0, 10), exercise: r.name, result: m ? `${r1(m.value)} ${m.unit}` : 'not scored', formScore: r.formScore,
    reps: r.reps && { count: r.reps.count, toStandard: r.reps.valid, partial: r.reps.partial, loweringSec: r1(r.reps.avgEccentricSec), liftingSec: r1(r.reps.avgConcentricSec), rangeDeg: r1(r.reps.romMean), velocityLossPct: r1(r.reps.velocityLossPct) },
    hold: r.hold && { bestSec: r1(r.hold.bestSec), targetSec: r.hold.targetSec },
    attempts: r.events?.slice(0, 6).map((e) => ({ jumpCm: r1(e.jumpHeightCm), releaseDeg: r1(e.releaseAngle), quality: Math.round(e.score * 100) })),
  };
}
export function reviewContext(s: SavedSession) {
  const r = s.report, ex = exerciseById(r.exerciseId), ev = assessEvidence(ex, r, s.view), p = getProfile();
  const others = getHistory().filter((x) => x.id !== s.id && isEligibleSession(x)).sort((a, b) => b.report.startedAt.localeCompare(a.report.startedAt));
  const seen = new Set<string>([r.exerciseId]);
  return {
    athlete: { age: p.age, heightCm: p.heightCm, weightKg: p.weightKg },
    current: { ...brief(s), source: s.source, evidence: ev.level, captureProblems: ev.factors.filter((f) => f.status !== 'good').map((f) => `${f.label}: ${f.value}`),
      checks: r.checks.filter((c) => c.samples > 0).map((c) => ({ joint: c.label, when: c.when, target: `${c.good[0]}-${c.good[1]}`, average: r1(c.mean), inRangePct: Math.round(c.pctGood), outOfRangePct: Math.round(c.pctBad), cue: c.cue })),
      leftRightDifferenceDeg: Object.values(r.symmetry).map(r1) },
    previousSameExercise: others.filter((x) => x.report.exerciseId === r.exerciseId).slice(0, 5).map(brief),
    latestOtherExercises: others.filter((x) => !seen.has(x.report.exerciseId) && seen.add(x.report.exerciseId)).slice(0, 6).map(brief),
  };
}

interface CoachRow { id: string; display_name: string; organisation: string | null; temporary: boolean }

export default function Review({ session }: { session: SavedSession }) {
  const user = useUser();
  const [ai, setAi] = useState<{ state: 'idle' | 'busy' | 'done'; text?: string; note?: string }>({ state: 'idle' });
  const [coaches, setCoaches] = useState<CoachRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [coach, setCoach] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const r = session.report;

  const local = (why: string) => {
    const ex = exerciseById(r.exerciseId), s = summarizeReport(ex, r, assessEvidence(ex, r, session.view));
    setAi({ state: 'done', note: why, text: [s.verdict, s.strengths.length ? `Going well: ${s.strengths.join('; ')}.` : '', s.focus ? `Fix next: ${s.focus.title}. ${s.focus.detail}` : '', s.next].filter(Boolean).join('\n\n') });
  };
  const askAi = async () => {
    const age = getProfile().age;
    if (!supabase || !user) { local('On-device summary. Sign in to get a written AI review.'); return; }
    if (age !== null && age < 18) { local('On-device summary. AI reviews are for adults: a parent’s consent does not cover AI processing.'); return; }
    setAi({ state: 'busy' });
    try {
      const { data, error } = await supabase.functions.invoke('ai-coach', { body: { context: reviewContext(session) } });
      const text = (data as { text?: string } | null)?.text;
      if (error || !text) throw error ?? new Error('empty');
      setAi({ state: 'done', text });
    } catch (e) {
      const status = (e as { context?: { status?: number } } | null)?.context?.status;
      local(status === 429 ? 'On-device summary. You have used today’s AI reviews; they reset tomorrow.' : status === 503 || status === 404 ? 'On-device summary. The AI coach is not switched on for this app yet.' : 'On-device summary. The AI coach could not be reached; try again when you are online.');
    }
  };
  const openCoaches = async () => {
    setOpen(true); setMsg(null);
    if (coaches || !supabase || !user) return;
    const { data, error } = await supabase.rpc('coach_directory');
    if (error) setMsg({ ok: false, text: 'Could not load coaches. Check your connection and try again.' }); else { setCoaches(data as CoachRow[]); setCoach((data as CoachRow[])[0]?.id ?? ''); }
  };
  const send = async () => {
    setBusy(true); setMsg(null);
    const m = measureOf(r);
    const opening = `${note.trim() || 'Could you review this session?'}\n\n${r.name}, ${new Date(r.startedAt).toLocaleDateString()}: ${m ? `${r1(m.value)} ${m.unit}, ` : ''}form ${r.formScore}/100.`;
    const { error } = await supabase!.rpc('ask_coach', { coach, note: opening, exercise: r.exerciseId });
    setBusy(false);
    setMsg(error ? { ok: false, text: (error.message || 'Could not send the request.').replace(/^./, (c) => c.toUpperCase()) + '.' } : { ok: true, text: 'Request sent. When the coach accepts, you can chat and they can see your session reports.' });
    if (!error) setNote('');
  };

  return (
    <section className="glass panel no-print rv" aria-labelledby="rv-title">
      <h2 id="rv-title"><IconSparkle /> {t('Get this session reviewed')}</h2>
      <div className="rv-grid">
        <div className="rv-option">
          <b>{t('AI coach')}</b>
          <p className="muted">{t('Reads this report, your earlier attempts and your other exercises, then tells you what changed and what to fix. Sends numbers only to Google Gemini: no video, name or email.')}</p>
          <button className="btn primary press" disabled={ai.state === 'busy'} onClick={() => void askAi()}>{t(ai.state === 'busy' ? 'Reading your report…' : ai.state === 'done' ? 'Ask again' : 'Ask the AI coach')}</button>
        </div>
        <div className="rv-option">
          <b>{t('A real coach')}</b>
          <p className="muted">{t('Pick a coach and send a request. Once they accept, you chat directly and they can open your session reports and history.')}</p>
          <button className="btn glass press" aria-expanded={open} onClick={() => void openCoaches()}>{t('Ask a coach')}</button>
        </div>
      </div>
      {ai.state === 'done' && <div className="rv-answer" role="status">
        {ai.note && <small className="faint">{t(ai.note)}</small>}
        {ai.text!.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        {!ai.note && <small className="faint">{t('Written by an AI from single-camera estimates. It can be wrong; a coach who watches you train knows more.')}</small>}
      </div>}
      {open && <div className="rv-answer">
        {!supabase || !user ? <p>{t('Sign in to ask a coach.')} <Link to={`/auth?next=${encodeURIComponent(`/results/${session.id}`)}`}>{t('Sign in')}</Link></p>
          : session.source === 'demo' ? <p>{t('This is a demo session. Record your own attempt to ask a coach about it.')}</p>
          : coaches === null ? (msg ? null : <div className="spinner" aria-label={t('Loading coaches')} />)
          : coaches.length === 0 ? <p>{t('No coaches have joined yet. Invite yours to open the Coach portal from their Profile.')}</p>
          : <form className="rv-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <label className="field"><span>{t('Coach')}</span>
              <select value={coach} onChange={(e) => setCoach(e.target.value)}>{coaches.map((c) => <option key={c.id} value={c.id}>{c.display_name}{c.organisation ? ` · ${c.organisation}` : ''}{c.temporary ? ' · temporary coach' : ''}</option>)}</select></label>
            <label className="field"><span>{t('Your question (optional)')}</span><textarea rows={2} maxLength={600} value={note} placeholder={t('e.g. My knees cave in on the last reps. What should I change?')} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="row" style={{ flexWrap: 'wrap' }}><button className="btn primary" disabled={busy || !coach}>{t(busy ? 'Sending…' : 'Send request')}</button><Link className="btn glass" to="/messages">{t('Open messages')}</Link></div>
          </form>}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'z-good' : 'z-bad'}>{msg.text}</p>}
      </div>}
    </section>
  );
}
