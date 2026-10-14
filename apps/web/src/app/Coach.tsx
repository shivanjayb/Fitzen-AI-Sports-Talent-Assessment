/**
 * Coach portal: apply to coach, run squads (invite code), read each athlete's full session reports with a
 * genuine / needs review / suspect verdict and its evidence, and manage API keys. Data rules: migration 004.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { exerciseById, responseProfile, type SessionReport } from '@fitzen/engines';
import { getAccount, publicApi, supabase, useUser, type Account } from '../lib/supabase';
import { measureOf, type SavedSession, type Verdict } from './store';
import { PageHeader } from './Shell';

interface Squad { id: string; name: string; invite_code: string }
interface Athlete { athlete: string; display_name: string; minor: boolean; visible: boolean; sessions_30d: number; avg_form: number | null; genuine: number; review: number; suspect: number; last_at: string | null }
interface Row { id: string; exercise_id: string; source: 'camera' | 'video'; started_at: string; verdict: Verdict; form_score: number; data: SavedSession }
interface Key { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }

const errText = (e: unknown) => (e as { message?: string })?.message || 'Something went wrong. Check your connection and try again.';
export const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  genuine: { label: 'Genuine', cls: 'z-good' }, review: { label: 'Needs review', cls: 'z-ok' }, suspect: { label: 'Suspect', cls: 'z-bad' },
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function Coach() {
  const user = useUser();
  const [acct, setAcct] = useState<Account | null | undefined>(undefined);
  const [err, setErr] = useState('');
  useEffect(() => { let live = true; void getAccount().then((a) => live && setAcct(a), (e) => live && setErr(errText(e))); return () => { live = false; }; }, [user?.id]);

  const head = <PageHeader kicker="Coaches" title="Coach portal" back />;
  if (!supabase) return <main className="page">{head}<p className="muted">Online accounts are not switched on yet, so the coach portal is unavailable. Athletes can still train on this device.</p></main>;
  if (!user) return <main className="page">{head}<section className="glass panel"><p style={{ marginTop: 0 }}>Sign in with your coach account to see your squads.</p><Link className="btn primary" to="/auth?next=%2Fcoach">Coach sign-in</Link></section></main>;
  if (acct === undefined) return <main className="page">{head}{err ? <p role="alert">{err}</p> : <div className="spinner" aria-label="Loading" />}</main>;
  if (!acct) return <main className="page">{head}<section className="glass panel"><p style={{ marginTop: 0 }}>Create your account details first (name and birth year).</p><Link className="btn primary" to="/profile#account">Finish my account</Link></section></main>;
  return <main className="page" style={{ maxWidth: 980 }}>{head}{acct.role === 'coach' || acct.role === 'admin' ? <><Squads /><ApiKeys /></> : <Apply />}</main>;
}

function Apply() {
  const [status, setStatus] = useState<string | null | undefined>(undefined);
  const [org, setOrg] = useState(''); const [note, setNote] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void supabase!.from('coach_requests').select('status').maybeSingle().then(({ data }) => setStatus((data as { status: string } | null)?.status ?? null)); }, []);
  if (status === undefined) return <div className="spinner" aria-label="Loading" />;
  if (status === 'pending') return <section className="glass panel"><b>Application received</b><p className="muted" style={{ marginBottom: 0 }}>An admin will review it. Come back here once you're approved to create squads.</p></section>;
  return (
    <form className="glass panel" style={{ display: 'grid', gap: 12 }} onSubmit={(e) => {
      e.preventDefault(); setBusy(true); setMsg('');
      void supabase!.rpc('request_coach', { organisation: org, note }).then(({ data, error }) => {
        if (error) setMsg(errText(error)); else setStatus(data as string);
        setBusy(false);
      });
    }}>
      <b>Apply to coach{status === 'rejected' ? ' again' : ''}</b>
      <p className="muted" style={{ margin: 0 }}>Coaches create squads, see their athletes' full reports and whether each session looks genuine. An admin approves every coach. Coaches must be 18+.</p>
      {status === 'rejected' && <p role="status" style={{ margin: 0 }}>Your last application was not approved. You can add more detail and apply again.</p>}
      <label className="field"><span>School, club or academy</span><input required minLength={2} maxLength={80} value={org} onChange={(e) => setOrg(e.target.value)} /></label>
      <label className="field"><span>Anything that helps us verify you (optional)</span><textarea maxLength={400} rows={3} value={note} placeholder="e.g. NIS certificate number, school staff ID" onChange={(e) => setNote(e.target.value)} /></label>
      {msg && <p role="alert" style={{ margin: 0 }}>{msg}</p>}
      <button className="btn primary" disabled={busy || org.trim().length < 2}>Send application</button>
    </form>
  );
}

function Squads() {
  const [squads, setSquads] = useState<Squad[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState(''); const [msg, setMsg] = useState('');
  const load = async () => {
    const { data: me } = await supabase!.auth.getUser();
    const { data, error } = await supabase!.from('groups').select('id, name, invite_code').eq('kind', 'squad').eq('owner', me.user!.id).order('created_at');
    if (error) { setMsg(errText(error)); return; }
    setSquads(data as Squad[]);
    setSel((cur) => cur ?? (data as Squad[])[0]?.id ?? null);
  };
  useEffect(() => { void load(); }, []);
  const squad = squads?.find((s) => s.id === sel);
  return (<>
    <h2 className="section-title">Squads</h2>
    {squads === null ? <div className="spinner" aria-label="Loading squads" /> : (
      <>
        {squads.length > 0 && <div className="chips">{squads.map((s) => <button key={s.id} className={`chip ${s.id === sel ? 'on' : ''}`} onClick={() => setSel(s.id)}>{s.name}</button>)}</div>}
        <form className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); void supabase!.from('groups').insert({ name: name.trim(), kind: 'squad' }).select('id').single().then(({ data, error }) => {
          if (error) { setMsg(errText(error)); return; }
          setName(''); setSel((data as { id: string }).id); void load();
        }); }}>
          <label className="field" style={{ flex: 1 }}><span>New squad</span><input required maxLength={40} value={name} placeholder="e.g. U16 Sprint Squad" onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn glass press" disabled={!name.trim()}>Create</button>
        </form>
      </>
    )}
    {msg && <p role="alert">{msg}</p>}
    {squads?.length === 0 && <p className="muted">Create a squad, then share its invite code. Athletes join from Compete → Invite code. Joining is their consent to share full reports with you; under-18s appear only after a parent confirms, and always as initials.</p>}
    {squad && <Roster key={squad.id} squad={squad} />}
  </>);
}

function Roster({ squad }: { squad: Squad }) {
  const [rows, setRows] = useState<Athlete[] | null>(null);
  const [open, setOpen] = useState<Athlete | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { void supabase!.rpc('squad_athletes', { g: squad.id }).then(({ data, error }) => error ? setErr(errText(error)) : setRows(data as Athlete[])); }, [squad.id]);
  const n = rows?.length ?? 0;
  const suspect = rows?.reduce((p, r) => p + Number(r.suspect), 0) ?? 0;
  const active = rows?.filter((r) => Number(r.sessions_30d) > 0).length ?? 0;
  return (<>
    <section className="glass panel" style={{ marginTop: 12 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div><b>{squad.name}</b><div className="muted" style={{ fontSize: '.85rem' }}>Invite code <b className="num" style={{ letterSpacing: '.08em' }}>{squad.invite_code}</b></div></div>
        <button className="btn glass press" onClick={() => void navigator.clipboard?.writeText(`Join my Fitzen squad "${squad.name}" with code ${squad.invite_code}: ${location.origin}/compete`)}>Copy invite</button>
      </div>
      <div className="kv" style={{ marginTop: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div><span>Athletes</span><b className="num">{n}</b></div>
        <div><span>Active</span><b className="num">{active}</b><small>last 30 days</small></div>
        <div><span>Suspect</span><b className="num" style={suspect ? { color: 'var(--bad)' } : { color: 'var(--text)' }}>{suspect}</b><small>sessions</small></div>
      </div>
    </section>
    {err && <p role="alert">{err}</p>}
    {rows === null && !err ? <div className="spinner" aria-label="Loading athletes" /> : (
      <div className="rows" style={{ marginTop: 10 }}>
        {rows?.map((r) => (
          <button key={r.athlete} className="session-row" style={{ width: '100%', textAlign: 'left' }} disabled={!r.visible} onClick={() => setOpen(r)}>
            <span style={{ minWidth: 0 }}><b>{r.display_name}</b>
              <small>{r.visible ? `${r.sessions_30d} sessions (30 d) · avg form ${r.avg_form ?? '—'} · last ${day(r.last_at)}` : 'Under 18: waiting for a parent to confirm sharing'}</small></span>
            {r.visible && <span className="num" style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}><span className="z-good">{r.genuine}✓</span> <span className="z-ok">{r.review}?</span> <span className="z-bad">{r.suspect}✗</span></span>}
          </button>
        ))}
        {rows?.length === 0 && <p className="muted">No athletes yet. Share the invite code.</p>}
      </div>
    )}
    {open && <AthleteReports squad={squad.id} athlete={open} close={() => setOpen(null)} />}
  </>);
}

function AthleteReports({ squad, athlete, close }: { squad: string; athlete: Athlete; close: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { void supabase!.rpc('athlete_sessions', { g: squad, athlete: athlete.athlete, lim: 100 }).then(({ data, error }) => error ? setErr(errText(error)) : setRows(data as Row[])); }, [squad, athlete.athlete]);
  const resp = rows ? responseProfile(rows.filter((r) => r.verdict !== 'suspect').map((r) => r.data.report)) : [];
  return (
    <section className="glass panel" style={{ marginTop: 12 }} aria-label={`${athlete.display_name} reports`}>
      <div className="row between"><b>{athlete.display_name}</b><button className="btn glass press" onClick={close}>Close</button></div>
      {err && <p role="alert">{err}</p>}
      {resp.length > 0 && <p className="muted" style={{ fontSize: '.85rem' }}>Responding best to {resp.filter((x) => x.response === 'responding').map((x) => x.name).join(', ') || 'nothing yet'}{resp.some((x) => x.response === 'declining') ? ` · dropping on ${resp.filter((x) => x.response === 'declining').map((x) => x.name).join(', ')}` : ''}.</p>}
      {rows === null && !err ? <div className="spinner" aria-label="Loading reports" /> : rows?.length === 0 ? <p className="muted">No synced sessions yet.</p> : (
        <div className="rows">{rows?.map((r) => <Report key={r.id} row={r} />)}</div>
      )}
    </section>
  );
}

function Report({ row }: { row: Row }) {
  const s = row.data, r: SessionReport = s.report;
  const m = measureOf(r), v = VERDICT[row.verdict];
  const evidence = [
    ...(s.integrity?.flags ?? []).map((f) => `Physics: ${f.message}`),
    ...(s.forensics?.flags ?? []).filter((f) => f.severity !== 'info').map((f) => `Video file: ${f.message}`),
    ...(r.mismatched ?? []).slice(0, 3).map((x) => `Wrong movement: ${x.reason}`),
    ...(r.trackedPct < 60 ? [`Body tracked only ${Math.round(r.trackedPct)} % of the time`] : []),
    ...(r.assessmentStatus === 'insufficient-evidence' ? ['Not enough clear movement to assess'] : []),
  ];
  return (
    <details className="session-row" style={{ display: 'block' }}>
      <summary style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', listStyle: 'none' }}>
        <span style={{ minWidth: 0, flex: 1 }}><b>{exerciseById(row.exercise_id)?.name ?? r.name}</b>
          <small>{day(row.started_at)} · {row.source} · {m ? `${m.value} ${m.unit}` : 'no headline'} · form {row.form_score}</small></span>
        <span className={`tag ${v.cls}`}>{v.label}</span>
      </summary>
      <div style={{ padding: '8px 0 4px', fontSize: '.85rem' }}>
        {evidence.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{evidence.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted" style={{ margin: 0 }}>No integrity, video-file or movement flags. Tracked {Math.round(r.trackedPct)} % of frames.</p>}
        {s.integrity && <p className="faint" style={{ margin: '6px 0 0' }}>Physics plausibility {s.integrity.score}/100 ({s.integrity.verdict}).</p>}
        {r.insights.slice(0, 2).map((x, i) => <p key={i} style={{ margin: '6px 0 0' }}><b>{x.title}.</b> <span className="muted">{x.detail}</span></p>)}
        <p className="faint" style={{ margin: '6px 0 0' }}>Verdicts are screening signals from the athlete's device, not proof. Watch the athlete live before acting on a suspect result.</p>
      </div>
    </details>
  );
}

function ApiKeys() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [name, setName] = useState(''); const [fresh, setFresh] = useState(''); const [msg, setMsg] = useState('');
  const load = () => void supabase!.from('api_keys').select('id, name, prefix, created_at, last_used_at, revoked_at').order('created_at', { ascending: false }).then(({ data, error }) => error ? setMsg(errText(error)) : setKeys(data as Key[]));
  useEffect(load, []);
  const curl = `curl -X POST '${publicApi.url}/rest/v1/rpc/api_squad_report' \\\n  -H 'apikey: ${publicApi.key}' -H 'Content-Type: application/json' \\\n  -d '{"api_key": "${fresh || 'fz_…'}"}'`;
  return (<>
    <h2 className="section-title">API keys<small>for your own tools</small></h2>
    <section className="glass panel" style={{ display: 'grid', gap: 12 }}>
      <form className="row" style={{ gap: 8, alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); setMsg(''); void supabase!.rpc('create_api_key', { name: name.trim() }).then(({ data, error }) => {
        if (error) { setMsg(errText(error)); return; }
        setFresh(data as string); setName(''); load();
      }); }}>
        <label className="field" style={{ flex: 1 }}><span>Key name</span><input required maxLength={40} value={name} placeholder="e.g. Squad sheet" onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn primary" disabled={!name.trim()}>Create key</button>
      </form>
      {fresh && <div role="status"><b>Copy this key now. It won't be shown again.</b><div className="row" style={{ gap: 8, marginTop: 6 }}><code className="num" style={{ overflowWrap: 'anywhere', flex: 1 }}>{fresh}</code><button className="btn glass press" onClick={() => void navigator.clipboard?.writeText(fresh)}>Copy</button></div></div>}
      {msg && <p role="alert" style={{ margin: 0 }}>{msg}</p>}
      <div className="rows">
        {keys?.map((k) => (
          <div key={k.id} className="session-row">
            <span style={{ minWidth: 0, flex: 1 }}><b>{k.name}</b><small className="num">{k.prefix}… · created {day(k.created_at)} · last used {day(k.last_used_at)}</small></span>
            {k.revoked_at ? <span className="tag">Revoked</span> : <button className="btn danger" onClick={() => { if (confirm(`Revoke "${k.name}"? Tools using it stop working.`)) void supabase!.rpc('revoke_api_key', { key_id: k.id }).then(load); }}>Revoke</button>}
          </div>
        ))}
      </div>
      <details><summary className="muted" style={{ cursor: 'pointer' }}>How to use a key</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.78rem', overflowWrap: 'anywhere' }}>{curl}</pre>
        <p className="faint" style={{ fontSize: '.8rem' }}>Returns your squads, athletes (minors as initials, only after parent consent) and their last 90 days of sessions with verdicts. Keep keys secret: anyone with a key can read this data until you revoke it.</p>
      </details>
    </section>
  </>);
}
