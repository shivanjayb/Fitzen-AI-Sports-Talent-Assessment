import { Link } from 'react-router-dom';
import { bestJumpCm, evaluateBadges, exerciseById, projectGrowth, type AthleteStats } from '@fitzen/engines';
import { getHistory, getProfile, measureOf, normOf, toAthlete, type SavedSession } from './store';
import { GrowthChart } from './Results';
import { IconFlag } from './icons';

const day = (s: SavedSession) => new Date(s.report.startedAt).toDateString();
const PUSH = /push-up/, SQUAT = /squat/;

/** Map local history onto the badge engine's stats. */
function statsOf(h: SavedSession[], weightKg: number | null): AthleteStats {
  const days = new Set(h.map(day));
  let streak = 0; const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // streak survives until the end of today
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  const jumps = [...h].reverse().map((s) => bestJumpCm(s.report)).filter((x): x is number => x !== null);
  let best = 0, improve = 0;
  for (const j of jumps) { if (best && j > best) improve = Math.max(improve, j - best); best = Math.max(best, j); }
  const reps = (re: RegExp) => Math.max(0, ...h.filter((s) => re.test(s.report.exerciseId) && s.report.reps).map((s) => s.report.reps!.valid));
  const sym = h.map((s) => Object.values(s.report.symmetry)).filter((v) => v.length).map((v) => 100 - 4 * (v.reduce((a, b) => a + b, 0) / v.length)); // Fitzen mapping, as in projection
  const kinds = [jumps.length > 0, reps(PUSH) > 0, reps(SQUAT) > 0].filter(Boolean).length;
  return {
    assessmentCount: h.length, bestJumpHeightM: best / 100,
    // Sayers et al. 1999 peak power, per kg.
    bestRelativePowerWkg: weightKg && best ? Math.max(0, (60.7 * best + 45.3 * weightKg - 2055) / weightKg) : 0,
    bestSymmetryScore: Math.max(0, ...sym), bestMovementQuality: Math.max(0, ...h.map((s) => s.report.formScore)),
    activeDays: days.size, streakDays: streak, bestImprovementM: improve / 100,
    bestPushups: reps(PUSH), bestSquats: reps(SQUAT), completedTestTypes: kinds,
  };
}

// ponytail: XP/level is a Fitzen game convention (10 per session + form bonus), not a performance measure.
const xpOf = (h: SavedSession[]) => h.reduce((a, s) => a + 10 + Math.round(s.report.formScore / 5), 0);
const levelOf = (xp: number) => Math.floor(Math.sqrt(xp / 50)) + 1;

export default function Progress() {
  const h = getHistory();
  const p = getProfile(), a = toAthlete(p);
  if (!h.length) return (
    <main className="page"><p className="subtitle">Streaks, badges, rankings</p><h1 className="large-title">Progress</h1>
      <div className="empty"><div className="big"><IconFlag /></div>No sessions yet. Train once to start your streak.<br /><br /><Link to="/app" className="btn primary">Start training</Link></div></main>
  );

  const st = statsOf(h, p.weightKg);
  const xp = xpOf(h), lv = levelOf(xp), next = 50 * lv * lv, prev = 50 * (lv - 1) ** 2;
  const weeks = [0, 1, 2, 3].map((w) => new Set(h.filter((s) => { const age = (Date.now() - Date.parse(s.report.startedAt)) / 6048e5; return age >= w && age < w + 1; }).map(day)).size);
  const badges = evaluateBadges(st).sort((x, y) => Number(y.earned) - Number(x.earned) || y.progress - x.progress);
  const earned = badges.filter((b) => b.earned).length;

  // Personal best per exercise (h is newest-first; keep the best).
  const pbs = new Map<string, { s: SavedSession; v: number; unit: string }>();
  for (const s of h) {
    const m = measureOf(s.report);
    if (!m) continue;
    const cur = pbs.get(s.report.exerciseId);
    if (!cur || m.value > cur.v) pbs.set(s.report.exerciseId, { s, v: m.value, unit: m.unit });
  }
  const ladders = [...pbs.values()].map((x) => ({ ...x, norm: normOf(x.s.report, a) })).filter((x) => x.norm);
  const proj = a ? projectGrowth(a, [...h].reverse().map((s) => s.report)) : null;

  return (
    <main className="page">
      <p className="subtitle">Streaks, badges, rankings</p>
      <h1 className="large-title">Progress</h1>

      <div className="kv" style={{ marginTop: 18 }}>
        <div><span>Streak</span><b className="num">{st.streakDays} d</b><small>{st.activeDays} active days total</small></div>
        <div><span>Level {lv}</span><b className="num">{xp} XP</b><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${((xp - prev) / (next - prev)) * 100}%`, background: 'var(--accent)' }} /></div><small>{next - xp} XP to level {lv + 1}</small></div>
        <div><span>Badges</span><b className="num">{earned}/{badges.length}</b></div>
        <div><span>Best form</span><b className="num">{st.bestMovementQuality}</b><small>out of 100</small></div>
      </div>

      <h2 className="section-title">Weekly consistency</h2>
      <section className="glass panel">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, alignItems: 'end', height: 90 }}>
          {[...weeks].reverse().map((n, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ height: `${Math.min(7, n) * 9 + 4}px`, borderRadius: 8, background: n >= 3 ? 'var(--good)' : 'var(--accent-2)' }} />
              <small className="faint">{i === 3 ? 'this wk' : `${3 - i} wk ago`} · {n} d</small>
            </div>
          ))}
        </div>
        <p className="faint" style={{ fontSize: '.8rem', marginBottom: 0 }}>Aim for 3+ training days a week (green); that is what the growth plan assumes.</p>
      </section>

      <h2 className="section-title">Where you rank</h2>
      <section className="glass panel">
        {!a ? <p className="muted" style={{ margin: 0 }}>Add age, sex, height and weight in <Link to="/profile">Profile</Link> to compare with published norms.</p>
          : ladders.length ? ladders.map(({ s, v, unit, norm }) => (
            <div key={s.report.exerciseId} className="check-row">
              <div><b style={{ fontSize: '.93rem' }}>{s.report.name}</b> <span className="tag">{norm!.band}</span>
                <div className="faint" style={{ fontSize: '.78rem', marginTop: 3 }}>best {v.toFixed(unit === 'reps' ? 0 : 1)} {unit} · vs {a.sex === 'male' ? 'boys' : 'girls'} aged {a.ageYears}, {norm!.reference}</div></div>
              <div>
                {norm!.percentile !== null
                  ? <><div className="bar"><i style={{ width: `${norm!.percentile}%`, background: 'var(--accent)' }} /></div><div className="faint num" style={{ fontSize: '.72rem', marginTop: 4, textAlign: 'right' }}>≈ P{Math.round(norm!.percentile)}</div></>
                  : <div className="faint" style={{ fontSize: '.78rem', textAlign: 'right' }}>band only</div>}
              </div>
            </div>
          )) : <p className="muted" style={{ margin: 0 }}>None of your tests has a verified norm yet. Record a vertical jump (13 y+) or push-ups (15–29 y).</p>}
        <p className="faint" style={{ fontSize: '.76rem', marginBottom: 0 }}>Percentiles compare you with a published reference sample, not with other Fitzen users. Indian Khelo India / Fit India tables are not built in yet.</p>
      </section>

      <h2 className="section-title">Leaderboards</h2>
      <section className="glass panel">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {[p.city || 'Your city', p.state || 'Your state', 'India'].map((x) => <span key={x} className="tag">{x}</span>)}
        </div>
        <p style={{ marginBottom: 0 }}>Live city, state and national rankings unlock when accounts and sync are switched on. Fitzen keeps your sessions on this phone today, so there is no one to rank against yet, and we won't show made-up players.</p>
      </section>

      {proj && proj.metrics.length > 0 && (<>
        <h2 className="section-title">Expected growth <small>estimates</small></h2>
        {proj.metrics.map((m) => {
          const at = m.points[m.points.length - 1]!;
          return (
            <section key={m.exerciseId} className="glass panel">
              <b>{exerciseById(m.exerciseId)?.name ?? m.exerciseId}: {m.baseline} cm now</b>
              <p className="muted" style={{ margin: '4px 0', fontSize: '.9rem' }}>In {at.week} weeks: {at.current.low}–{at.current.high} cm with current habits, {at.plan.low}–{at.plan.high} cm if you follow the plan.</p>
              <GrowthChart m={m} />
              {proj.talent && <p style={{ fontSize: '.9rem' }}>{proj.talent.summary}</p>}
              <p className="faint" style={{ fontSize: '.76rem', margin: 0 }}>{m.basis}. Ranges, not promises.</p>
            </section>
          );
        })}
      </>)}

      <h2 className="section-title">Personal bests</h2>
      <div className="list">
        {[...pbs.values()].map(({ s, v, unit }) => (
          <Link key={s.id} to={`/results/${s.id}`} className="glass press list-item">
            <div style={{ flex: 1 }}><b>{s.report.name}</b><div className="muted" style={{ fontSize: '.85rem' }}>{new Date(s.report.startedAt).toLocaleDateString()}</div></div>
            <b className="num">{v.toFixed(unit === 'reps' ? 0 : 1)} {unit}</b>
          </Link>
        ))}
      </div>

      <h2 className="section-title">Badges <small>{earned} earned</small></h2>
      <div className="kv">
        {badges.slice(0, 12).map((b) => (
          <div key={b.id} style={{ opacity: b.earned ? 1 : 0.6 }}>
            <span>{b.tier}</span><b style={{ fontSize: '1rem' }}>{b.name}</b><small>{b.description}</small>
            {!b.earned && <div className="bar" style={{ marginTop: 6, height: 6 }}><i style={{ width: `${b.progress * 100}%`, background: 'var(--accent-2)' }} /></div>}
          </div>
        ))}
      </div>
    </main>
  );
}
