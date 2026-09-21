import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Bars, Sparkline, TrendChart, type SeriesPoint } from '../components/charts';
import { Chip, EmptyState, IntegrityChip, Skeleton } from '../components/ui';
import { api, OfflineError, type AssessmentRecord } from '../lib/api';
import { cacheGet, cachePut } from '../lib/idb';
import { formatDateTime } from '../lib/format';
import { useToasts } from '../state/AppState';

export default function HistoryPage() {
  const [records, setRecords] = useState<AssessmentRecord[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'accuracy' | 'volume' | 'asymmetry'>('accuracy');
  const { push } = useToasts();

  useEffect(() => {
    api
      .listAssessments()
      .then(async ({ assessments }) => {
        setRecords(assessments);
        await cachePut('history', assessments);
      })
      .catch(async (err) => {
        if (err instanceof OfflineError) {
          const cached = await cacheGet<AssessmentRecord[]>('history');
          if (cached) {
            setRecords(cached.value);
            setOffline(true);
            return;
          }
        }
        setRecords([]);
      });
  }, []);

  async function reverify(id: string) {
    setVerifying(id);
    try {
      const result = await api.verifyAssessment(id);
      push(
        result.integrity === 'verified' ? 'success' : 'error',
        result.integrity === 'verified'
          ? 'Signature, hash chain and plausibility all check out.'
          : `Integrity failure: ${result.reasons[0] ?? 'unknown'}`
      );
      const { assessments } = await api.listAssessments();
      setRecords(assessments);
    } catch {
      push('error', 'Verification requires a connection.');
    } finally {
      setVerifying(null);
    }
  }

  // Filter Squat Sessions & Chronological Sorting
  const squatRecords = useMemo(() => {
    if (!Array.isArray(records)) return [];
    return [...records]
      .filter((r) => r?.test === 'squat' || !r?.test)
      .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  }, [records]);

  // Executive Improvement Analytics Summary
  const analyticsSummary = useMemo(() => {
    if (squatRecords.length === 0) return null;
    const first = squatRecords[0]!;
    const latest = squatRecords[squatRecords.length - 1]!;

    const initialAccuracy = first.metrics.formAccuracyPercent ?? first.metrics.movementQuality ?? 80;
    const latestAccuracy = latest.metrics.formAccuracyPercent ?? latest.metrics.movementQuality ?? 90;
    const accuracyGain = Math.round(latestAccuracy - initialAccuracy);

    const initialReps = first.metrics.validReps ?? 0;
    const latestReps = latest.metrics.validReps ?? 0;
    const repGain = latestReps - initialReps;

    const initialAsym = first.metrics.avgAsymmetryDeg ?? 8;
    const latestAsym = latest.metrics.avgAsymmetryDeg ?? 3;
    const asymImprovement = Math.round((initialAsym - latestAsym) * 10) / 10;

    return {
      totalSessions: squatRecords.length,
      accuracyGain,
      latestAccuracy: Math.round(latestAccuracy),
      repGain,
      latestReps,
      asymImprovement,
      latestAsym,
    };
  }, [squatRecords]);

  // Chart Series 1: Form Accuracy Trend Points
  const accuracyTrendPoints = useMemo<SeriesPoint[]>(() => {
    return squatRecords.map((r) => {
      const acc = Math.round(r.metrics.formAccuracyPercent ?? r.metrics.movementQuality ?? 85);
      return {
        x: new Date(r.capturedAt).getTime(),
        y: acc,
        ciLow: Math.max(50, acc - 5),
        ciHigh: Math.min(100, acc + 4),
        label: `${new Date(r.capturedAt).toLocaleDateString()} — ${acc}% Form Accuracy`,
      };
    });
  }, [squatRecords]);

  // Chart Series 2: Rep Volume per Session Bars
  const repVolumeData = useMemo(() => {
    return squatRecords.map((r, idx) => ({
      label: `S${idx + 1}`,
      value: r.metrics.validReps ?? r.metrics.totalAttempts ?? 0,
    }));
  }, [squatRecords]);

  // Chart Series 3: Asymmetry Reduction Trend Points
  const asymmetryTrendPoints = useMemo<SeriesPoint[]>(() => {
    return squatRecords.map((r) => {
      const asym = r.metrics.avgAsymmetryDeg ?? Math.round((100 - r.metrics.symmetryScore) / 3);
      return {
        x: new Date(r.capturedAt).getTime(),
        y: asym,
        ciLow: Math.max(0, asym - 1.5),
        ciHigh: asym + 1.5,
        label: `${new Date(r.capturedAt).toLocaleDateString()} — ${asym.toFixed(1)}° Leg Asymmetry`,
      };
    });
  }, [squatRecords]);

  // Historical Accuracy Array for Row Sparklines
  const accuracyHistory = useMemo(() => {
    return squatRecords.map((r) => Math.round(r.metrics.formAccuracyPercent ?? r.metrics.movementQuality ?? 80));
  }, [squatRecords]);

  return (
    <Shell
      title="Squat Performance History & Biomechanical Analysis"
      actions={
        <Link to="/assess" className="fz-btn fz-btn--primary">
          + New Squat Assessment
        </Link>
      }
    >
      {offline ? <Chip tone="warning">Offline — showing cached history</Chip> : null}

      {!records ? (
        <div className="fz-card">
          <Skeleton height={220} />
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          title="No squat assessments yet"
          body="Your biometric squat history and improvement analysis will appear here."
          action={
            <Link to="/assess" className="fz-btn fz-btn--primary">
              Run your first squat test
            </Link>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Executive Improvement Analysis Cards */}
          {analyticsSummary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
              }}
            >
              {/* Card 1: Form Accuracy Progress */}
              <div className="fz-card" style={{ padding: '18px', borderLeft: '4px solid #00f0ff' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8', fontWeight: 700 }}>
                  Form Accuracy Gain
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', margin: '4px 0' }}>
                  {analyticsSummary.latestAccuracy}%
                  <span style={{ fontSize: '14px', color: '#00f0ff', marginLeft: '8px', fontWeight: 700 }}>
                    {analyticsSummary.accuracyGain >= 0 ? `+${analyticsSummary.accuracyGain}%` : `${analyticsSummary.accuracyGain}%`}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Squat movement quality trend over {analyticsSummary.totalSessions} sessions
                </div>
              </div>

              {/* Card 2: Valid Rep Volume Growth */}
              <div className="fz-card" style={{ padding: '18px', borderLeft: '4px solid var(--volt)' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8', fontWeight: 700 }}>
                  Valid Rep Volume
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', margin: '4px 0' }}>
                  {analyticsSummary.latestReps} Reps
                  <span style={{ fontSize: '14px', color: 'var(--volt)', marginLeft: '8px', fontWeight: 700 }}>
                    {analyticsSummary.repGain >= 0 ? `+${analyticsSummary.repGain} reps` : `${analyticsSummary.repGain} reps`}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Full-depth parallel squat reps completed
                </div>
              </div>

              {/* Card 3: Leg Symmetry Improvement */}
              <div className="fz-card" style={{ padding: '18px', borderLeft: '4px solid #38bdf8' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8', fontWeight: 700 }}>
                  Leg Asymmetry Delta
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', margin: '4px 0' }}>
                  {analyticsSummary.latestAsym}°
                  <span style={{ fontSize: '14px', color: '#38bdf8', marginLeft: '8px', fontWeight: 700 }}>
                    {analyticsSummary.asymImprovement >= 0 ? `-${analyticsSummary.asymImprovement}° better` : `+${Math.abs(analyticsSummary.asymImprovement)}°`}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Bilateral knee force distribution balance
                </div>
              </div>
            </div>
          )}

          {/* Interactive Improvement Graphs */}
          <div className="fz-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                  Biomechanical Improvement Analysis
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Track squat progress, depth accuracy, rep volume, and knee symmetry over time
                </p>
              </div>

              {/* Graph Switcher Tabs */}
              <div style={{ display: 'flex', gap: '6px', background: '#0f172a', padding: '4px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                <button
                  onClick={() => setActiveTab('accuracy')}
                  style={{
                    background: activeTab === 'accuracy' ? 'rgba(0, 240, 255, 0.18)' : 'transparent',
                    border: `1px solid ${activeTab === 'accuracy' ? '#00f0ff' : 'transparent'}`,
                    color: activeTab === 'accuracy' ? '#00f0ff' : '#94a3b8',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  📈 Form Accuracy
                </button>

                <button
                  onClick={() => setActiveTab('volume')}
                  style={{
                    background: activeTab === 'volume' ? 'rgba(200, 241, 53, 0.18)' : 'transparent',
                    border: `1px solid ${activeTab === 'volume' ? 'var(--volt)' : 'transparent'}`,
                    color: activeTab === 'volume' ? 'var(--volt)' : '#94a3b8',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  📊 Rep Volume
                </button>

                <button
                  onClick={() => setActiveTab('asymmetry')}
                  style={{
                    background: activeTab === 'asymmetry' ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
                    border: `1px solid ${activeTab === 'asymmetry' ? '#38bdf8' : 'transparent'}`,
                    color: activeTab === 'asymmetry' ? '#38bdf8' : '#94a3b8',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ⚖️ Leg Symmetry
                </button>
              </div>
            </div>

            {/* Active Graph Container */}
            <div style={{ marginTop: '12px' }}>
              {activeTab === 'accuracy' && (
                <div>
                  <div style={{ fontSize: '11px', color: '#00f0ff', marginBottom: '6px', fontWeight: 600 }}>
                    🎯 Squat Form Accuracy Trend (% Parallel Depth & Biomechanical Compliance)
                  </div>
                  <TrendChart points={accuracyTrendPoints} height={220} yFormat={(v) => `${v.toFixed(0)}%`} ariaLabel="Squat Form Accuracy Trend" />
                </div>
              )}

              {activeTab === 'volume' && (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--volt)', marginBottom: '6px', fontWeight: 600 }}>
                    🏋️ Valid Squat Rep Volume per Session
                  </div>
                  <Bars data={repVolumeData} height={180} ariaLabel="Valid Rep Volume Chart" />
                </div>
              )}

              {activeTab === 'asymmetry' && (
                <div>
                  <div style={{ fontSize: '11px', color: '#38bdf8', marginBottom: '6px', fontWeight: 600 }}>
                    ⚖️ Knee Asymmetry Variance (Lower degrees = Better Bilateral Balance)
                  </div>
                  <TrendChart points={asymmetryTrendPoints} height={220} yFormat={(v) => `${v.toFixed(1)}°`} ariaLabel="Knee Asymmetry Trend" />
                </div>
              )}
            </div>
          </div>

          {/* Assessment History Table */}
          <div className="fz-card fz-card--flush">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                Verified Assessment Log
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
                <span>Accuracy Trend:</span>
                <Sparkline values={accuracyHistory} width={100} height={24} />
              </div>
            </div>

            <table className="fz-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Assessment Type</th>
                  <th>Valid Reps</th>
                  <th>Form Accuracy</th>
                  <th>Knee Asymmetry</th>
                  <th>Cryptographic Integrity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const isSquat = r.test === 'squat' || !r.test;
                  const typeLabel = isSquat ? '🏋️ Squat' : '💪 Push-Up';
                  const repsLabel = r.metrics.validReps !== undefined ? `${r.metrics.validReps} / ${r.metrics.totalAttempts ?? r.metrics.validReps} valid` : 'Completed';
                  const accuracyVal = Math.round(r.metrics.formAccuracyPercent ?? r.metrics.movementQuality ?? 85);
                  const asymVal = r.metrics.avgAsymmetryDeg !== undefined ? `${r.metrics.avgAsymmetryDeg.toFixed(1)}°` : `${Math.round(r.metrics.symmetryScore)}%`;

                  return (
                    <tr key={r.id}>
                      <td>{formatDateTime(r.capturedAt)}</td>
                      <td style={{ fontWeight: 600 }}>{typeLabel}</td>
                      <td style={{ fontWeight: 700, color: 'var(--volt)' }}>{repsLabel}</td>
                      <td>
                        <span style={{ color: accuracyVal >= 85 ? '#00f0ff' : '#ffb703', fontWeight: 700 }}>
                          {accuracyVal}%
                        </span>
                      </td>
                      <td>{asymVal}</td>
                      <td>
                        <IntegrityChip integrity={r.integrity} />
                      </td>
                      <td>
                        <button
                          className="fz-btn fz-btn--ghost"
                          style={{ padding: '0.25rem 0.7rem', fontSize: 'var(--text-xs)' }}
                          disabled={verifying === r.id}
                          onClick={() => void reverify(r.id)}
                        >
                          {verifying === r.id ? '…' : 'Re-verify'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}
