import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Chip, EmptyState, IntegrityChip, ProgressRing, Skeleton, Stat } from '../components/ui';
import { Sparkline } from '../components/charts';
import { api } from '../lib/api';
import { formatDateTime, formatHeight, initials } from '../lib/format';

export default function TeamPage() {
  const { athleteId } = useParams();
  if (athleteId) return <AthleteDetail athleteId={athleteId} />;
  return <Roster />;
}

function Roster() {
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof api.coachRoster>>['roster'] | null>(null);

  useEffect(() => {
    api.coachRoster().then((r) => setRoster(r.roster)).catch(() => setRoster([]));
  }, []);

  return (
    <Shell title="Team">
      {!roster ? (
        <div className="fz-card"><Skeleton height={220} /></div>
      ) : roster.length === 0 ? (
        <EmptyState title="No athletes assigned" body="Athletes appear here when their profile lists you as coach." />
      ) : (
        <div className="fz-card fz-card--flush">
          <table className="fz-table">
            <thead>
              <tr><th>Athlete</th><th>Sport</th><th>Region</th><th>Best jump</th><th>Power</th><th>Sessions</th><th>Consistency</th></tr>
            </thead>
            <tbody>
              {roster.map((athlete) => (
                <tr key={athlete.id}>
                  <td>
                    <Link to={`/team/${athlete.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', fontWeight: 650 }}>
                      <span className="fz-avatar" style={{ width: 28, height: 28, fontSize: '0.6rem' }}>{initials(athlete.name)}</span>
                      {athlete.name}
                    </Link>
                  </td>
                  <td>{athlete.sport ?? '—'}</td>
                  <td>{athlete.region ?? '—'}</td>
                  <td style={{ fontWeight: 700 }}>{formatHeight(athlete.stats.bestJumpHeightM)}</td>
                  <td>{athlete.stats.bestRelativePowerWkg.toFixed(1)} W/kg</td>
                  <td>{athlete.stats.assessmentCount}</td>
                  <td>
                    {athlete.stats.jumpCv <= 0.06
                      ? <Chip tone="success">Stable</Chip>
                      : athlete.stats.jumpCv <= 0.11
                        ? <Chip tone="warning">Variable</Chip>
                        : <Chip tone="danger">Erratic</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function AthleteDetail({ athleteId }: { athleteId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.coachAthlete>> | null>(null);
  const [brief, setBrief] = useState<string | null>(null);

  useEffect(() => {
    api.coachAthlete(athleteId).then(setData).catch(() => undefined);
    api.aiBrief(athleteId).then((r) => setBrief(r.brief.brief)).catch(() => undefined);
  }, [athleteId]);

  if (!data) {
    return <Shell title="Athlete"><div className="fz-card"><Skeleton height={280} /></div></Shell>;
  }

  const jumpSeries = [...(Array.isArray(data.assessments) ? data.assessments : [])]
    .filter((a) => a?.integrity === 'verified')
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .map((a) => a.metrics.jumpHeightM * 100);

  return (
    <Shell title={data.user.name} actions={<Link className="fz-btn fz-btn--ghost" to="/team">← Team</Link>}>
      <div className="fz-grid fz-grid--stats fz-animate-in">
        <div className="fz-card"><Stat label="Best jump" value={formatHeight(data.stats.bestJumpHeightM)} accent /></div>
        <div className="fz-card"><Stat label="Sessions" value={data.stats.assessmentCount} sub={`${data.stats.activeDays} active days`} /></div>
        <div className="fz-card"><Stat label="Trend" value={<Sparkline values={jumpSeries} />} sub="verified jumps" /></div>
        <div className="fz-card"><Stat label="Avg confidence" value={`${Math.round(data.stats.avgConfidence * 100)}%`} /></div>
      </div>

      <div className="fz-grid fz-grid--two" style={{ marginTop: 'var(--space-5)' }}>
        <section className="fz-card fz-card--flush">
          <table className="fz-table">
            <thead><tr><th>Date</th><th>Jump</th><th>Power</th><th>Quality</th><th>Integrity</th></tr></thead>
            <tbody>
              {data.assessments.map((a) => (
                <tr key={a.id}>
                  <td>{formatDateTime(a.capturedAt)}</td>
                  <td style={{ fontWeight: 700 }}>{formatHeight(a.metrics.jumpHeightM)}</td>
                  <td>{a.metrics.relativePowerWkg.toFixed(1)} W/kg</td>
                  <td>{Math.round(a.metrics.movementQuality)}</td>
                  <td><IntegrityChip integrity={a.integrity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ display: 'grid', gap: 'var(--space-4)', alignContent: 'start' }}>
          {data.potential ? (
            <div className="fz-card">
              <span className="fz-kicker">Potential</span>
              <div style={{ display: 'flex', justifyContent: 'space-around', margin: 'var(--space-4) 0' }}>
                <ProgressRing value={data.potential.currentPerformance} label="Current" size={92} stroke={7} />
                <ProgressRing value={data.potential.potentialScore} label="Potential" size={92} stroke={7} />
                <ProgressRing value={data.potential.confidenceScore} label="Confidence" size={92} stroke={7} />
              </div>
              {data.potential.insights.slice(0, 3).map((insight) => (
                <div key={insight.factor + insight.message} className={`fz-insight fz-insight--${insight.kind}`}>
                  <div className="fz-insight__icon" aria-hidden>
                    {insight.kind === 'strength' ? '▲' : insight.kind === 'opportunity' ? '◆' : '●'}
                  </div>
                  <div><strong>{insight.factor}</strong><p>{insight.message}</p></div>
                </div>
              ))}
            </div>
          ) : null}
          {brief ? (
            <div className="fz-card">
              <span className="fz-kicker">Coaching brief</span>
              <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--ink-mid)', lineHeight: 1.65 }}>{brief}</p>
            </div>
          ) : null}
        </section>
      </div>
    </Shell>
  );
}
