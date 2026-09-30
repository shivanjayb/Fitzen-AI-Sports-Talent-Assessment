import { Link, useNavigate, useParams } from 'react-router-dom';
import { exerciseById, type SessionReport } from '@fitzen/engines';
import { deleteSession, getSession, glow, type SavedSession } from './store';
import { IconAlert, IconBack, IconCheck, IconFolder, IconShare, IconStop } from './icons';

const f = (x: number | undefined, d = 1) => (x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
const Z = { good: 'var(--good)', ok: 'var(--ok)', bad: 'var(--bad)' };

function AngleChart({ r }: { r: SessionReport }) {
  const s = r.series;
  if (s.length < 2) return <p className="faint">Not enough tracked frames to chart.</p>;
  const W = 640, H = 200, pad = 28;
  const ex = exerciseById(r.exerciseId);
  const drv = ex?.reps?.driver ?? ex?.checks[0]?.angle;
  const band = ex?.checks.find((c) => c.angle === drv && (c.when === 'bottom' || c.when === 'hold' || c.when === 'release'))?.good;
  const vs = s.map((p) => p.v);
  const lo = Math.min(...vs, band?.[0] ?? Infinity) - 5, hi = Math.max(...vs, band?.[1] ?? -Infinity) + 5;
  const t1 = s[s.length - 1]!.t, t0 = s[0]!.t;
  const X = (t: number) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - pad - 8);
  const Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - pad - 8);
  const d = s.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Angle over time">
      <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent-2)" stopOpacity=".35" /><stop offset="1" stopColor="var(--accent-2)" stopOpacity="0" /></linearGradient></defs>
      {band && <rect x={pad} width={W - pad - 8} y={Y(band[1])} height={Math.max(2, Y(band[0]) - Y(band[1]))} fill="var(--good)" opacity=".13" />}
      {[lo, (lo + hi) / 2, hi].map((v) => <text key={v} x={2} y={Y(v) + 3}>{Math.round(v)}°</text>)}
      <path d={`${d}L${X(t1)},${H - pad}L${X(t0)},${H - pad}Z`} fill="url(#lg)" />
      <path d={d} fill="none" stroke="var(--accent-2)" strokeWidth="2.2" strokeLinejoin="round" />
      {r.reps?.list.map((rep) => <circle key={rep.index} cx={X(rep.endMs / 1000 - (rep.concentricMs / 1000))} cy={Y(rep.extreme)} r="4.5" fill={rep.valid ? 'var(--good)' : 'var(--bad)'} />)}
      <text x={pad} y={H - 8}>0 s</text><text x={W - 40} y={H - 8}>{t1.toFixed(0)} s</text>
    </svg>
  );
}

function RepChart({ r }: { r: SessionReport }) {
  const reps = r.reps?.list ?? [];
  if (!reps.length) return null;
  const W = 640, H = 170, bw = Math.min(46, (W - 40) / reps.length - 6);
  const max = Math.max(...reps.map((x) => x.durationMs)) || 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rep tempo">
      {reps.map((x, i) => {
        const X = 20 + i * (bw + 6), hE = (x.eccentricMs / max) * (H - 40), hC = (x.concentricMs / max) * (H - 40);
        return (
          <g key={x.index}>
            <rect x={X} y={H - 22 - hE - hC} width={bw} height={hC} rx="5" fill={x.valid ? 'var(--good)' : 'var(--bad)'} opacity=".9" />
            <rect x={X} y={H - 22 - hE} width={bw} height={hE} rx="5" fill={x.valid ? 'var(--good)' : 'var(--bad)'} opacity=".45" />
            <text x={X + bw / 2} y={H - 8} textAnchor="middle">{x.index}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Integrity 'fail' / forensic 'strong' → red, 'warn' → amber, 'info' → neutral. Every item is a reason to look, not proof.
const LEVEL = { info: 'info', warn: 'warn', fail: 'bad', strong: 'bad' } as const;
const evidenceText = (e: Record<string, number>) =>
  Object.entries(e).map(([k, v]) => `${k} ${Number.isInteger(v) ? v : v.toFixed(3)}`).join(' · ');

/** Integrity verdict warn/fail, or any strong forensic flag (e.g. C2PA says AI-generated), earns the top banner. */
function needsBanner(s: SavedSession): 'warn' | 'bad' | null {
  if (s.integrity?.verdict === 'fail' || s.forensics?.flags.some((x) => x.severity === 'strong')) return 'bad';
  return s.integrity?.verdict === 'warn' ? 'warn' : null;
}

function Authenticity({ s }: { s: SavedSession }) {
  if (s.source === 'camera') return <div className="insight good"><div className="ic"><IconCheck /></div><div><b>Recorded live on this device</b><p>Frames came straight from this device's camera during the session, so no upload checks apply.</p></div></div>;
  if (s.source !== 'video') return null;
  const { integrity: ig, forensics: fx } = s;
  if (!ig && !fx) return <div className="insight info"><div className="ic"><IconAlert /></div><div><b>No authenticity report</b><p>This clip was analysed before authenticity checks were added.</p></div></div>;
  const md = fx?.metadata;
  const aiC2pa = fx?.flags.some((x) => x.code === 'c2pa-ai-generated');
  const flags = [
    ...(ig?.flags ?? []).map((x) => ({ ...x, src: 'Motion physics', ev: evidenceText(x.evidence) })),
    ...(fx?.flags ?? []).map((x) => ({ ...x, src: 'File metadata', ev: x.evidence })),
  ];
  return (
    <section className="glass panel">
      {ig && (
        <div className="row between" style={{ marginBottom: 10 }}>
          <b>Motion plausibility</b>
          <span className="tag" style={{ color: ig.verdict === 'ok' ? 'var(--good)' : ig.verdict === 'warn' ? 'var(--ok)' : 'var(--bad)' }}>
            {ig.verdict === 'ok' ? 'No concerns found' : ig.verdict === 'warn' ? 'Worth a look' : 'Strong concerns'} · {ig.score}/100
          </span>
        </div>
      )}
      <div className="kv" style={{ marginBottom: 12 }}>
        <div><span>Frame rate</span><b className="num">{md?.nominalFps ? `${f(md.nominalFps, 2)} fps` : '—'}</b><small>{md?.vfr ? 'variable frame rate' : md?.nominalFps ? 'constant' : 'not in container'}{ig?.metrics.fps ? ` · analysed ${f(ig.metrics.fps, 1)} fps` : ''}</small></div>
        <div><span>Encoder</span><b style={{ fontSize: '.9rem' }}>{md?.encoderStrings.length ? md.encoderStrings.slice(0, 3).join(', ') : 'none written'}</b><small>{fx?.format.toUpperCase() ?? '—'}{md?.majorBrand ? ` · brand ${md.majorBrand}` : ''}</small></div>
        <div><span>C2PA content credentials</span><b>{!md ? '—' : aiC2pa ? 'Says AI-generated' : md.c2pa ? 'Present' : 'None'}</b><small>{md?.c2pa ? 'signature not verified here' : 'most phone clips have none'}</small></div>
        <div><span>Created</span><b className="num" style={{ fontSize: '.9rem' }}>{md?.creationTime ? new Date(md.creationTime).toLocaleString() : '—'}</b><small>container claim, easily edited</small></div>
      </div>
      <div className="list">
        {flags.length ? flags.map((x, k) => (
          <div key={k} className={`insight ${LEVEL[x.severity]}`}>
            <div className="ic">{x.severity === 'info' ? <IconCheck /> : x.severity === 'warn' ? <IconAlert /> : <IconStop />}</div>
            <div><b>{x.message}</b><p className="faint" style={{ fontSize: '.8rem' }}>{x.src} · {x.code}{x.ev ? ` · ${x.ev}` : ''}</p></div>
          </div>
        )) : <div className="insight good"><div className="ic"><IconCheck /></div><div><b>No flags raised</b><p>Nothing unusual in the motion physics or file metadata.</p></div></div>}
      </div>
      <p className="faint" style={{ fontSize: '.78rem', marginTop: 12, lineHeight: 1.5 }}>
        These are warnings, not verdicts. Metadata can be stripped or forged, and tracking glitches, camera movement or
        re-encoding by a messaging app can trip the motion checks on a genuine clip. A coach should review flagged clips.
      </p>
    </section>
  );
}

export default function Results() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const saved = getSession(id);
  if (!saved) return <main className="page"><div className="empty"><div className="big"><IconFolder /></div>Session not found.<br /><br /><Link className="btn" to="/app">Back to training</Link></div></main>;
  const r = saved.report;
  const banner = needsBanner(saved);
  const ex = exerciseById(r.exerciseId);
  const rp = r.reps;

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }));
    a.download = `fitzen-${r.exerciseId}-${r.startedAt.slice(0, 10)}.json`;
    a.click();
  };

  const headline = rp ? `${rp.count} reps · ${rp.valid} correct` : r.hold ? `${f(r.hold.bestSec)} s best hold` :
    r.events?.length ? (r.events.some((e) => e.jumpHeightCm !== undefined) ? `${f(Math.max(...r.events.map((e) => e.jumpHeightCm ?? 0)))} cm best jump` : `${r.events.length} attempts`) : 'No attempts detected';

  const noise = Object.values(r.angles).map((a) => a.noise);
  const precision = noise.length ? noise.reduce((a, b) => a + b, 0) / noise.length : NaN;

  return (
    <main className="page">
      <div className="row between no-print">
        <button className="btn glass press" onClick={() => nav('/app')}><IconBack /> Train</button>
        <div className="row">
          <button className="btn glass press" onClick={() => window.print()}>Print report</button>
          <button className="btn icon glass press" onClick={exportJson} aria-label="Export JSON"><IconShare /></button>
        </div>
      </div>

      {banner && (
        <div className={`insight ${banner}`} role="alert" style={{ marginTop: 14 }}>
          <div className="ic">{banner === 'bad' ? <IconStop /> : <IconAlert />}</div>
          <div><b>{banner === 'bad' ? 'This clip needs checking before the results are trusted' : 'Some checks on this clip look unusual'}</b>
            <p>See Authenticity below for each reason. These are warnings, not proof the clip was altered.</p></div>
        </div>
      )}

      <section className="glass result-hero" onPointerMove={glow}>
        <div className={`grade ${r.grade}`}>{r.grade}</div>
        <div>
          <div className="faint" style={{ fontSize: '.8rem', fontWeight: 600 }}>{new Date(r.startedAt).toLocaleString()} · {saved.source === 'demo' ? 'Demo athlete' : saved.source === 'video' ? 'Video analysis' : 'Live camera'}</div>
          <h1 className="large-title" style={{ fontSize: '2rem' }}>{r.name}</h1>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{headline}</div>
          <div className="muted" style={{ fontSize: '.9rem' }}>Form score <b style={{ color: 'var(--text)' }}>{r.formScore}</b>/100</div>
        </div>
      </section>

      <h2 className="section-title">Measurements</h2>
      <div className="kv">
        <div><span>Duration</span><b className="num">{f(r.durationSec)} s</b></div>
        {rp && (<>
          <div><span>Reps</span><b className="num">{rp.count}</b><small>{rp.valid} correct · {rp.partial} partial{rp.rejected ? ` · ${rp.rejected} rejected` : ''}</small></div>
          <div><span>Cadence</span><b className="num">{f(rp.perMin)}/min</b><small>{f(rp.perSec, 2)} reps/s</small></div>
          <div><span>Tempo</span><b className="num">{f(rp.avgEccentricSec)}–{f(rp.avgConcentricSec)}</b><small>eccentric–concentric s</small></div>
          <div><span>Time under tension</span><b className="num">{f(rp.tutSec)} s</b></div>
          <div><span>Range of motion</span><b className="num">{f(rp.romMean, 0)}°</b><small>± {f(rp.romSd)}° SD</small></div>
          <div><span>Consistency</span><b className="num">{f(rp.consistencyCv, 0)}%</b><small>ROM coefficient of variation</small></div>
          <div><span>Fatigue</span><b className="num">{rp.fatigueSlopePct > 0 ? '+' : ''}{f(rp.fatigueSlopePct, 0)}%</b><small>rep duration drift</small></div>
        </>)}
        {r.hold && (<>
          <div><span>Best hold</span><b className="num">{f(r.hold.bestSec)} s</b><small>goal {r.hold.targetSec} s</small></div>
          <div><span>Total in position</span><b className="num">{f(r.hold.totalSec)} s</b></div>
        </>)}
        {r.events?.map((e) => (
          <div key={e.index}><span>Attempt {e.index}</span>
            <b className="num">{e.jumpHeightCm !== undefined ? `${f(e.jumpHeightCm)} cm` : e.releaseAngle !== undefined ? `${f(e.releaseAngle, 0)}°` : `${Math.round(e.score * 100)}%`}</b>
            <small>{e.flightMs !== undefined ? `flight ${Math.round(e.flightMs)} ms` : e.peakSpeed !== undefined ? `peak ${f(e.peakSpeed)} body-h/s` : ''}{e.releaseAngle !== undefined && e.jumpHeightCm !== undefined ? ` · take-off ${f(e.releaseAngle, 0)}°` : ''}</small>
          </div>
        ))}
        <div><span>Angle precision</span><b className="num">±{f(precision)}°</b><small>frame noise (1 SD)</small></div>
        <div><span>Tracking</span><b className="num">{f(r.trackedPct, 0)}%</b><small>{f(r.fps, 0)} fps · {r.frames} frames</small></div>
        {r.kcal !== null && <div><span>Energy</span><b className="num">{f(r.kcal)} kcal</b><small>MET {ex?.met}</small></div>}
      </div>

      <h2 className="section-title">How to do better</h2>
      <div className="list">
        {r.insights.length ? r.insights.map((i, k) => (
          <div key={k} className={`insight ${i.level}`}>
            <div className="ic">{i.level === 'good' ? <IconCheck /> : i.level === 'warn' ? <IconAlert /> : <IconStop />}</div>
            <div><b>{i.title}</b><p>{i.detail}</p></div>
          </div>
        )) : <div className="insight good"><div className="ic"><IconCheck /></div><div><b>Nothing to fix</b><p>All measured joints stayed in range.</p></div></div>}
      </div>

      <div className="two-col" style={{ marginTop: 14 }}>
        <section className="glass panel">
          <div className="row between"><b>{rp?.driverLabel ?? 'Angle'} over time</b><span className="faint" style={{ fontSize: '.78rem' }}>green band = target</span></div>
          <AngleChart r={r} />
        </section>
        {rp && rp.count > 0 && (
          <section className="glass panel">
            <div className="row between"><b>Rep tempo</b><span className="faint" style={{ fontSize: '.78rem' }}>light = lowering · solid = lifting</span></div>
            <RepChart r={r} />
          </section>
        )}
      </div>

      <h2 className="section-title">Joint-by-joint form</h2>
      <section className="glass panel">
        <div className="zone-legend" style={{ marginBottom: 6 }}><span><i style={{ background: Z.good }} />Correct</span><span><i style={{ background: Z.ok }} />Moderate</span><span><i style={{ background: Z.bad }} />Incorrect</span></div>
        {r.checks.map((c, i) => (
          <div key={i} className="check-row">
            <div>
              <b style={{ fontSize: '.93rem' }}>{c.label}</b> <span className="tag">{c.when}</span>
              <div className="faint" style={{ fontSize: '.8rem', marginTop: 3 }}>target {c.good[0]}–{c.good[1]} · measured avg {f(c.mean, 0)} · {c.samples} samples</div>
            </div>
            <div>
              <div className="bar"><i style={{ width: `${c.pctGood}%`, background: Z.good }} /><i style={{ width: `${c.pctOk}%`, background: Z.ok }} /><i style={{ width: `${c.pctBad}%`, background: Z.bad }} /></div>
              <div className="faint num" style={{ fontSize: '.72rem', marginTop: 4, textAlign: 'right' }}>{c.samples ? `${Math.round(c.pctGood)}% / ${Math.round(c.pctOk)}% / ${Math.round(c.pctBad)}%` : 'not reached'}</div>
            </div>
          </div>
        ))}
      </section>

      <h2 className="section-title">Angle statistics</h2>
      <section className="glass panel" style={{ overflowX: 'auto' }}>
        <table className="data num">
          <thead><tr><th>Angle</th><th>Mean</th><th>SD</th><th>Min</th><th>Max</th><th>Noise ±</th>{Object.keys(r.symmetry).length > 0 && <th>L/R diff</th>}</tr></thead>
          <tbody>{Object.entries(r.angles).map(([k, a]) => (
            <tr key={k}><td>{a.label}</td><td>{f(a.mean)}</td><td>{f(a.sd)}</td><td>{f(a.min)}</td><td>{f(a.max)}</td><td>{f(a.noise, 2)}</td>{Object.keys(r.symmetry).length > 0 && <td>{r.symmetry[k] !== undefined ? f(r.symmetry[k]) : ''}</td>}</tr>
          ))}</tbody>
        </table>
      </section>

      {rp && rp.list.length > 0 && (<>
        <h2 className="section-title">Every rep</h2>
        <section className="glass panel" style={{ overflowX: 'auto' }}>
          <table className="data num">
            <thead><tr><th>#</th><th>Time</th><th>Down</th><th>Up</th><th>Extreme</th><th>ROM</th><th>Score</th><th>Notes</th></tr></thead>
            <tbody>{rp.list.map((x) => (
              <tr key={x.index}>
                <td><span style={{ color: x.valid ? Z.good : Z.bad }}>●</span> {x.index}</td>
                <td>{f(x.durationMs / 1000)} s</td><td>{f(x.eccentricMs / 1000)}</td><td>{f(x.concentricMs / 1000)}</td>
                <td>{f(x.extreme, 0)}°</td><td>{f(x.rom, 0)}°</td><td>{Math.round(x.score * 100)}</td>
                <td style={{ fontFamily: 'var(--font)', color: 'var(--text-2)' }}>{x.fullRange ? '' : 'Short range. '}{x.faults.join(' · ')}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      </>)}

      {(saved.source === 'video' || saved.source === 'camera') && (<>
        <h2 className="section-title">Authenticity</h2>
        <Authenticity s={saved} />
      </>)}

      <p className="faint" style={{ fontSize: '.78rem', marginTop: 24, lineHeight: 1.5 }}>
        Method: 2D joint angles from on-device BlazePose landmarks (x scaled by frame aspect), {saved.integrity || saved.forensics
          ? 'zero-phase 6 Hz Butterworth filtered (uploaded clip, every native frame; angle noise is measured after this filter)'
          : 'One Euro filtered'}; reps by Schmitt trigger with a
        minimum rep time; jump height h = g·t²/8 from toe-off to contact. Angle noise is the SD of raw angles about a 5-frame moving average.
        Single-camera measurements are screening estimates, not clinical measurements.
      </p>

      <div className="row no-print" style={{ marginTop: 18, gap: 10 }}>
        {ex && <Link className="btn primary press" to={`/train/${ex.id}?src=${saved.source === 'demo' ? 'demo' : 'camera'}`}>Go again</Link>}
        <button className="btn press" onClick={() => { deleteSession(id); nav('/history'); }}>Delete</button>
      </div>
    </main>
  );
}
