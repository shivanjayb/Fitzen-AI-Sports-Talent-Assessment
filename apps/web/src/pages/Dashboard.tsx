import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Chip, EmptyState, ProgressRing, Skeleton, Stat, Meter } from '../components/ui';
import { TrendChart, Bars } from '../components/charts';
import { api, OfflineError, type AssessmentRecord, type AthleteStats, type CoachingBrief, type PotentialResult } from '../lib/api';
import { cacheGet, cachePut } from '../lib/idb';
import { formatHeight, formatDate } from '../lib/format';
import { useAuth } from '../state/AppState';

interface DashboardData {
  stats: AthleteStats;
  potential: PotentialResult | null;
  assessments: AssessmentRecord[];
  brief: CoachingBrief | null;
}

async function loadDashboard(): Promise<DashboardData> {
  try {
    const [{ stats, potential }, { assessments }] = await Promise.all([
      api.stats(),
      api.listAssessments(),
    ]);
    let brief: CoachingBrief | null = null;
    try {
      brief = (await api.aiBrief()).brief;
    } catch { /* brief is enhancement-only */ }
    const data = { stats, potential, assessments, brief };
    await cachePut('dashboard', data);
    return data;
  } catch (err) {
    if (err instanceof OfflineError) {
      const cached = await cacheGet<DashboardData>('dashboard');
      if (cached) return cached.value;
    }
    throw err;
  }
}

import { HumanModel3D } from '../components/HumanModel3D';

export default function DashboardPage() {
  const { user } = useAuth();
  if (user?.role !== 'athlete') return <NonAthleteDashboard />;
  return <AthleteDashboard />;
}


function AthleteDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<'jump' | 'pushup' | 'squat'>('squat');

  useEffect(() => {
    loadDashboard().then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) {
    return (
      <Shell title="Dashboard">
        <EmptyState title="Couldn't load your dashboard" body={error} />
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell title="Dashboard">
        <div className="fz-grid fz-grid--stats">
          {[0, 1, 2, 3].map((i) => (
            <div className="fz-card" key={i}><Skeleton height={64} /></div>
          ))}
        </div>
      </Shell>
    );
  }

  const { stats, potential, assessments = [], brief } = data;
  const verified = (assessments || []).filter((a) => a?.integrity === 'verified');

  const pushupAssessments = verified.filter((a) => a.test === 'pushup');
  const squatAssessments = verified.filter((a) => a.test === 'squat');
  const jumpAssessments = verified.filter((a) => a.test === 'vertical_jump' || !a.test);

  const bestPushups = pushupAssessments.length
    ? Math.max(...pushupAssessments.map((a) => a.metrics.validReps ?? 0))
    : 0;

  const bestSquats = squatAssessments.length
    ? Math.max(...squatAssessments.map((a) => a.metrics.validReps ?? 0))
    : 0;

  const selectedAssessments =
    chartMetric === 'pushup'
      ? pushupAssessments
      : chartMetric === 'squat'
      ? (squatAssessments.length ? squatAssessments : verified)
      : jumpAssessments;

  const series = [...selectedAssessments]
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .map((a) => {
      const val =
        chartMetric === 'jump'
          ? a.metrics.jumpHeightM * 100
          : a.metrics.validReps ?? 0;
      return {
        x: new Date(a.capturedAt).getTime(),
        y: val,
        ciLow: chartMetric === 'jump' ? a.metrics.jumpHeightCiLow * 100 : val * 0.9,
        ciHigh: chartMetric === 'jump' ? a.metrics.jumpHeightCiHigh * 100 : val * 1.1,
        label: formatDate(a.capturedAt),
      };
    });

  const firstName = user?.name.split(' ')[0] ?? 'Athlete';

  return (
    <Shell
      title={`Hey, ${firstName}`}
      actions={<Link to="/assess" className="fz-btn fz-btn--primary">New assessment</Link>}
    >
      {stats.assessmentCount === 0 ? (
        <EmptyState
          title="Your baseline is waiting"
          body="Run your first camera assessment to unlock stats, potential scoring and the leaderboard."
          action={<Link to="/assess" className="fz-btn fz-btn--primary fz-btn--lg">Start first assessment</Link>}
        />
      ) : (
        <>
          {/* 3D Cybernetic Holographic Human Muscle Model Hero Section */}
          <section
            className="fz-card fz-animate-in"
            style={{
              marginBottom: 'var(--space-5)',
              background: 'radial-gradient(ellipse at center top, rgba(0, 240, 255, 0.12) 0%, rgba(13, 20, 36, 0.95) 75%)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              boxShadow: '0 8px 32px rgba(0, 240, 255, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <div>
                <span className="fz-kicker" style={{ color: '#00f0ff', letterSpacing: '0.1em' }}>
                  CYBERNETIC ANATOMY DIAGNOSTICS
                </span>
                <h2 style={{ margin: '0.2rem 0', fontSize: 'var(--text-xl)', fontWeight: 800 }}>
                  3D Holographic Squat Muscle Analysis
                </h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mid)', margin: 0 }}>
                  Hover over active muscle hotspots to inspect targeted biomechanical diagnostics, weakness flags, and squat form improvement guides.
                </p>
              </div>
              <Chip tone="accent">Interactive 3D WebGL</Chip>
            </div>

            <HumanModel3D
              assessments={assessments}
              potential={potential}
              selectedExercise={chartMetric}
              onSelectExercise={setChartMetric}
            />
          </section>

          <div className="fz-grid fz-grid--stats fz-animate-in">
            <div className="fz-card"><Stat label="Best Squats" value={bestSquats > 0 ? `${bestSquats} reps` : '—'} accent sub="reps performed" /></div>
            <div className="fz-card"><Stat label="Best Form Accuracy" value={stats.bestMovementQuality > 0 ? `${Math.round(stats.bestMovementQuality)}%` : '—'} sub="biometric score" /></div>
            <div className="fz-card"><Stat label="Leg Symmetry" value={stats.bestSymmetryScore > 0 ? `${Math.round(stats.bestSymmetryScore)}%` : '—'} sub="bilateral balance" /></div>
            <div className="fz-card"><Stat label="Total Assessments" value={stats.assessmentCount} sub={`${stats.activeDays} active days`} /></div>
          </div>


          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--space-4) 0 var(--space-2)' }}>
            <div className="fz-section-title" style={{ margin: 0 }}>
              <h2>Performance Trend</h2>
              <Chip>Verified Squat Assessments</Chip>
            </div>
            <div className="fz-segment" role="tablist">
              <button role="tab" aria-selected={chartMetric === 'squat'} className={chartMetric === 'squat' ? 'active' : ''} onClick={() => setChartMetric('squat')}>🏋️ Squats</button>
            </div>
          </div>

          <div className="fz-card fz-card--flush" style={{ padding: 'var(--space-4)' }}>
            {series.length >= 2 ? (
              <TrendChart
                points={series}
                yFormat={(v) => (chartMetric === 'jump' ? `${v.toFixed(0)}cm` : `${Math.round(v)} reps`)}
                ariaLabel="Exercise metric over time"
              />
            ) : (
              <EmptyState title={`Two ${chartMetric.replace('_', ' ')} assessments unlock the trend`} body="Run another assessment to see your progress curve." />
            )}
          </div>

          <div className="fz-grid fz-grid--two" style={{ marginTop: 'var(--space-5)' }}>
            <section className="fz-card">
              <span className="fz-kicker">Potential analysis</span>
              {potential ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-around', margin: 'var(--space-5) 0' }}>
                    <ProgressRing value={potential.currentPerformance} label="Current" />
                    <ProgressRing value={potential.potentialScore} label="Potential" />
                    <ProgressRing value={potential.confidenceScore} label="Confidence" />
                  </div>
                  <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    <Meter label="Explosiveness" value={potential.components.explosiveness} />
                    <Meter label="Movement quality" value={potential.components.movementQuality} />
                    <Meter label="Consistency" value={potential.components.consistency} />
                    <Meter label="Maturity headroom" value={potential.components.maturityHeadroom} />
                  </div>
                  <div style={{ marginTop: 'var(--space-4)' }}>
                    {potential.insights.slice(0, 3).map((insight) => (
                      <div key={insight.factor + insight.message} className={`fz-insight fz-insight--${insight.kind}`}>
                        <div className="fz-insight__icon" aria-hidden>
                          {insight.kind === 'strength' ? '▲' : insight.kind === 'opportunity' ? '◆' : '●'}
                        </div>
                        <div>
                          <strong>{insight.factor}</strong>
                          <p>{insight.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ color: 'var(--ink-mid)', marginTop: 'var(--space-3)' }}>
                  Potential scoring unlocks after your first verified assessment.
                </p>
              )}
            </section>

            <section style={{ display: 'grid', gap: 'var(--space-4)', alignContent: 'start' }}>
              {brief ? (
                <div className="fz-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="fz-kicker">Coach's brief</span>
                    <Chip tone="accent">{brief.source === 'claude' ? 'AI · Claude' : 'Auto'}</Chip>
                  </div>
                  <p style={{ margin: 'var(--space-3) 0', fontSize: 'var(--text-sm)', color: 'var(--ink-mid)', lineHeight: 1.65 }}>
                    {brief.brief}
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {brief.focusAreas.map((area) => <Chip key={area}>{area}</Chip>)}
                  </div>
                </div>
              ) : null}

              <div className="fz-card">
                <span className="fz-kicker">Score profile</span>
                <Bars
                  ariaLabel="Component scores"
                  data={potential ? [
                    { label: 'Power', value: potential.components.power },
                    { label: 'Coord', value: potential.components.coordination },
                    { label: 'Consist', value: potential.components.consistency },
                    { label: 'Anthro', value: potential.components.anthropometric },
                    { label: 'Explos', value: potential.components.explosiveness },
                  ] : []}
                />
              </div>
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}

/** Coach and admin land on their team/overview views. */
function NonAthleteDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.adminOverview>>['overview'] | null>(null);
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof api.coachRoster>>['roster'] | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      api.adminOverview().then((r) => setOverview(r.overview)).catch(() => undefined);
    }
    api.coachRoster().then((r) => setRoster(r.roster)).catch(() => undefined);
  }, [user?.role]);

  return (
    <Shell title={user?.role === 'admin' ? 'Platform overview' : 'Coach dashboard'}>
      {user?.role === 'admin' && overview ? (
        <div className="fz-grid fz-grid--stats fz-animate-in" style={{ marginBottom: 'var(--space-5)' }}>
          <div className="fz-card"><Stat label="Athletes" value={overview.athletes} sub={`${overview.users} total users`} /></div>
          <div className="fz-card"><Stat label="Assessments" value={overview.assessments} accent /></div>
          <div className="fz-card"><Stat label="Verified" value={overview.verified} sub={`${overview.tampered} flagged tampered`} /></div>
          <div className="fz-card"><Stat label="Badges awarded" value={overview.badgesAwarded} /></div>
        </div>
      ) : null}

      <div className="fz-section-title"><h2>Your athletes</h2><Link to="/team" className="fz-btn fz-btn--ghost">Full roster</Link></div>
      {roster && roster.length > 0 ? (
        <div className="fz-card fz-card--flush">
          <table className="fz-table">
            <thead>
              <tr><th>Athlete</th><th>Sport</th><th>Best jump</th><th>Sessions</th><th>Streak</th></tr>
            </thead>
            <tbody>
              {roster.slice(0, 8).map((athlete) => (
                <tr key={athlete.id}>
                  <td><Link to={`/team/${athlete.id}`} style={{ fontWeight: 650 }}>{athlete.name}</Link></td>
                  <td>{athlete.sport ?? '—'}</td>
                  <td>{formatHeight(athlete.stats.bestJumpHeightM)}</td>
                  <td>{athlete.stats.assessmentCount}</td>
                  <td>{athlete.stats.streakDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No athletes assigned yet" body="Athletes appear here when their profile lists you as coach." />
      )}
    </Shell>
  );
}
