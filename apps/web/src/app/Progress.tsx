import { t } from './language';
import { Link } from 'react-router-dom';
import { bestJumpCm, evaluateBadges, exerciseById, projectGrowth, type AthleteStats } from '@fitzen/engines';
import type { CSSProperties } from 'react';
import { getHistory, getProfile, isEligibleSession, measureOf, normOf, toAthlete, type SavedSession } from './store';
import { GrowthChart } from './Results';
import { IconChevron, IconPodium } from './icons';
import { PageHeader } from './Shell';
import { Thumb } from './Figure';
import Rings from './Rings';
import TrainingGoal from './TrainingGoal';

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

const MEDAL: Record<string, [string, string]> = { bronze: ['#c77b3c', '#7a3f12'], silver: ['#c7ccd6', '#5d6472'], gold: ['#ffd60a', '#b07a00'], platinum: ['#9be7ff', '#3a6fd8'] };
const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
const sub = (s: SavedSession) => s.report.reps ? `${s.report.reps.count} reps` : s.report.hold ? `${s.report.hold.bestSec.toFixed(1)} s hold` : `${s.report.events?.length ?? 0} attempts`;

export default function Progress() {
  const h = getHistory().filter(isEligibleSession);
  const p = getProfile(), a = toAthlete(p);
  if (!h.length) return (
    <main className="page">
      <PageHeader kicker={today()} title={t('Summary')} />
      <section className="activity-card">
        <div>
          <h3>Activity</h3>
          <div className="ring-stat"><span>Training days</span><b className="num">0/3<small> this week</small></b></div>
          <div className="ring-stat"><span>Level 1</span><b className="num">0<small> XP</small></b></div>
          <div className="ring-stat"><span>Badges</span><b className="num">0</b></div>
        </div>
        <Rings values={[0, 0, 0]} size={148} />
      </section>
      <section className="glass panel" style={{ marginTop: 12 }}>
        <b>Close your first ring</b>
        <p className="muted" style={{ margin: '4px 0 14px' }}>No eligible real sessions yet. Demos, unassessed and flagged results do not count. Train once to start your streak.</p>
        <Link to="/app" className="btn primary press">Start training</Link>
      </section>
      <TrainingGoal />
    </main>
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
      <PageHeader kicker={today()} title={t('Summary')} />

      <div className="summary-top">
      <section className="activity-card">
        <div>
          <h3>Activity</h3>
          <div className="ring-stat"><span>Training days</span><b className="num">{weeks[0]}/3<small> this week</small></b></div>
          <div className="ring-stat"><span>Level {lv}</span><b className="num">{xp - prev}/{next - prev}<small> XP</small></b></div>
          <div className="ring-stat"><span>Badges</span><b className="num">{earned}/{badges.length}</b></div>
        </div>
        <Rings values={[weeks[0]! / 3, (xp - prev) / (next - prev), earned / badges.length]} size={148} />
      </section>

      <div className="tiles">
        <div className="tile move"><span>Streak</span><small>{st.activeDays} active days in total</small><b className="num">{st.streakDays}<small> days</small></b></div>
        <div className="tile exercise"><span>Best form</span><small>out of 100</small><b className="num">{st.bestMovementQuality}</b></div>
        <div className="tile stand"><span>Consistency</span><small>Aim for 3+ days a week</small>
          <div className="mini-bars" aria-label={`Training days over the last four weeks: ${[...weeks].reverse().join(', ')}`}>
            {[...weeks].reverse().map((n, i) => <i key={i} className={n >= 3 ? '' : 'low'} style={{ height: `${Math.max(8, Math.min(7, n) / 7 * 100)}%`, animationDelay: `${i * 80}ms` }} />)}
          </div>
        </div>
        <Link to="/history" className="tile yellow press"><span>Sessions</span><small>retained on this device</small><b className="num">{h.length}</b></Link>
      </div>
      </div>
      <p className="faint" style={{ fontSize: '.8125rem', margin: '10px 2px 0' }}>Based on up to 60 retained, eligible real sessions. Demos, unassessed and flagged results do not count.</p>

      <h2 className="section-title">Sessions<Link className="see-all" to="/history">Show More</Link></h2>
      <div className="rows">
        {h.slice(0, 3).map((s) => {
          const ex = exerciseById(s.report.exerciseId);
          return (
            <Link key={s.id} to={`/results/${s.id}`} className="session-row">
              {ex && <Thumb def={ex} size={46} />}
              <span style={{ minWidth: 0 }}><b>{s.report.name}</b><small>{new Date(s.report.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {sub(s)}</small></span>
              <span className="score num">{s.report.formScore}</span>
              <IconChevron />
            </Link>
          );
        })}
      </div>

      <h2 className="section-title">Awards<small>{earned} earned</small></h2>
      <div className="awards">
        {badges.slice(0, 16).map((b) => {
          const [m1, m2] = MEDAL[b.tier] ?? MEDAL.bronze!;
          return (
            <div key={b.id} className={`medal ${b.earned ? '' : 'locked'}`} style={{ '--m1': m1, '--m2': m2 } as CSSProperties} title={b.description}>
              <i aria-hidden>{b.name.slice(0, 1)}</i>
              <b>{b.name}</b>
              <small>{b.earned ? b.tier : `${Math.round(b.progress * 100)}%`}</small>
            </div>
          );
        })}
      </div>

      <TrainingGoal />

      <div className="summary-grid">
        <div>
          <h2 className="section-title">Where you rank</h2>
          <section className="glass panel">
            {!a ? <p className="muted" style={{ margin: 0 }}>Add age, sex, height and weight in <Link to="/profile">Profile</Link> to compare with published norms.</p>
              : ladders.length ? ladders.map(({ s, v, unit, norm }) => (
                <div key={s.report.exerciseId} className="check-row">
                  <div><b style={{ fontSize: '.93rem' }}>{s.report.name}</b> <span className="tag">{norm!.band}</span>
                    <div className="faint" style={{ fontSize: '.78rem', marginTop: 3 }}>best {v.toFixed(unit === 'reps' ? 0 : 1)} {unit} · vs {a.sex === 'male' ? 'boys' : 'girls'} aged {a.ageYears}, {norm!.reference}</div></div>
                  <div>
                    {norm!.percentile !== null
                      ? <><div className="bar"><i style={{ width: `${norm!.percentile}%`, background: 'var(--exercise)' }} /></div><div className="faint num" style={{ fontSize: '.72rem', marginTop: 4, textAlign: 'right' }}>≈ P{Math.round(norm!.percentile)}</div></>
                      : <div className="faint" style={{ fontSize: '.78rem', textAlign: 'right' }}>band only</div>}
                  </div>
                </div>
              )) : <p className="muted" style={{ margin: 0 }}>None of your tests has a verified norm yet. Record a vertical jump (13 y+) or push-ups (15–29 y).</p>}
            <p className="faint" style={{ fontSize: '.76rem', marginBottom: 0 }}>Percentiles compare you with a published reference sample, not with other Fitzen users. Indian Khelo India / Fit India tables are not built in yet.</p>
          </section>

          <h2 className="section-title">Leaderboards</h2>
          <nav className="rows">
            <Link to="/compete"><span className="ic"><IconPodium /></span><span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>Compete</b><br /><small className="muted">Rank against your group, {p.city || 'your city'}, {p.state || 'your state'} and India. Needs a free account.</small></span><IconChevron /></Link>
          </nav>
        </div>

        <div>
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
          <div className="rows">
            {[...pbs.values()].map(({ s, v, unit }) => (
              <Link key={s.id} to={`/results/${s.id}`}>
                <span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{s.report.name}</b><br /><small className="muted">{new Date(s.report.startedAt).toLocaleDateString()}</small></span>
                <b className="num" style={{ fontFamily: 'var(--rounded)', color: 'var(--exercise)' }}>{v.toFixed(unit === 'reps' ? 0 : 1)} {unit}</b>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
