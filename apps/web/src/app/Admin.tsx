/** Admin portal: platform analytics, coach approvals and roles. Every call is admin-checked in SQL (migration 004). */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { exerciseById } from '@fitzen/engines';
import { getAccount, supabase, useUser, type Account } from '../lib/supabase';
import { PageHeader } from './Shell';

interface Stats {
  accounts: number; profiles: number; minors: number; coaches: number; admins: number; squads: number; pending_coaches: number;
  sessions_7d: number; sessions_30d: number; active_30d: number; verdicts_30d: Record<string, number>; top_exercises_30d: Array<{ exercise_id: string; sessions: number }>;
}
interface UserRow { id: string; display_name: string; role: 'athlete' | 'coach' | 'admin'; minor: boolean; created_at: string; sessions: number; coach_request: string | null; organisation: string | null }
const errText = (e: unknown) => (e as { message?: string })?.message || 'Something went wrong. Check your connection and try again.';

export default function Admin() {
  const user = useUser();
  const [acct, setAcct] = useState<Account | null | undefined>(undefined);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => { let live = true; void getAccount().then((a) => live && setAcct(a), (e) => live && setMsg(errText(e))); return () => { live = false; }; }, [user?.id]);
  const admin = acct?.role === 'admin';
  const loadStats = () => void supabase!.rpc('admin_stats').then(({ data, error }) => error ? setMsg(errText(error)) : setStats(data as Stats));
  const loadUsers = (search = q) => void supabase!.rpc('admin_users', { q: search, lim: 100 }).then(({ data, error }) => error ? setMsg(errText(error)) : setUsers(data as UserRow[]));
  useEffect(() => { if (admin) { loadStats(); loadUsers(''); } }, [admin]);
  const act = (p: PromiseLike<{ error: unknown }>) => void p.then(({ error }) => { if (error) setMsg(errText(error)); else { setMsg(''); loadStats(); loadUsers(); } });

  const head = <PageHeader kicker="Admins" title="Admin portal" back />;
  if (!supabase) return <main className="page">{head}<p className="muted">Online accounts are not switched on yet.</p></main>;
  if (!user) return <main className="page">{head}<Link className="btn primary" to="/auth?next=%2Fadmin">Admin sign-in</Link></main>;
  if (acct === undefined) return <main className="page">{head}{msg ? <p role="alert">{msg}</p> : <div className="spinner" aria-label="Loading" />}</main>;
  if (!admin) return <main className="page">{head}<section className="glass panel"><p style={{ margin: 0 }}>This page is for Fitzen admins. Coaches use the <Link to="/coach">coach portal</Link>.</p></section></main>;

  const pending = users?.filter((u) => u.coach_request === 'pending') ?? [];
  const v = stats?.verdicts_30d ?? {};
  const vTotal = (v.genuine ?? 0) + (v.review ?? 0) + (v.suspect ?? 0);
  return (
    <main className="page" style={{ maxWidth: 980 }}>
      {head}
      {msg && <p role="alert">{msg}</p>}
      {stats ? (<>
        <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="tile move"><span>Accounts</span><small>{stats.profiles} with a profile · {stats.minors} under 18</small><b className="num">{stats.accounts}</b></div>
          <div className="tile exercise"><span>Active</span><small>trained in the last 30 days</small><b className="num">{stats.active_30d}</b></div>
          <div className="tile stand"><span>Sessions</span><small>{stats.sessions_7d} in the last 7 days</small><b className="num">{stats.sessions_30d}<small> /30 d</small></b></div>
          <div className="tile yellow"><span>Coaches</span><small>{stats.squads} squads · {stats.pending_coaches} waiting</small><b className="num">{stats.coaches}</b></div>
        </div>
        <section className="glass panel" style={{ marginTop: 12 }}>
          <b>Session verdicts, last 30 days</b>
          {vTotal ? <div className="verdict-bar" role="img" aria-label={`Genuine ${v.genuine ?? 0}, needs review ${v.review ?? 0}, suspect ${v.suspect ?? 0}`}>
            {(['genuine', 'review', 'suspect'] as const).map((k) => <i key={k} className={`v-${k}`} style={{ flexGrow: v[k] ?? 0 }} />)}
          </div> : <p className="muted">No sessions yet.</p>}
          <p className="faint" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>{v.genuine ?? 0} genuine · {v.review ?? 0} need review · {v.suspect ?? 0} suspect</p>
          {stats.top_exercises_30d.length > 0 && <p className="muted" style={{ fontSize: '.85rem', marginBottom: 0 }}>Most trained: {stats.top_exercises_30d.map((t) => `${exerciseById(t.exercise_id)?.name ?? t.exercise_id} (${t.sessions})`).join(', ')}</p>}
        </section>
      </>) : <div className="spinner" aria-label="Loading stats" />}

      <h2 className="section-title">Coach applications<small>{pending.length} waiting</small></h2>
      <div className="rows">
        {pending.map((u) => (
          <div key={u.id} className="session-row" style={{ flexWrap: 'wrap' }}>
            <span style={{ minWidth: 0, flex: '1 1 100%' }}><b>{u.display_name}</b><small>{u.organisation} · joined {new Date(u.created_at).toLocaleDateString()}</small></span>
            <button className="btn primary" onClick={() => act(supabase!.rpc('review_coach', { target: u.id, approve: true }))}>Approve</button>
            <button className="btn glass press" onClick={() => act(supabase!.rpc('review_coach', { target: u.id, approve: false }))}>Reject</button>
          </div>
        ))}
        {pending.length === 0 && <p className="muted">No applications waiting.</p>}
      </div>

      <h2 className="section-title">People</h2>
      <form className="row" style={{ gap: 8, alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); loadUsers(q); }}>
        <label className="field" style={{ flex: 1 }}><span>Search by display name</span><input value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="btn glass press">Search</button>
      </form>
      <div className="rows" style={{ marginTop: 10 }}>
        {users?.map((u) => (
          <div key={u.id} className="session-row">
            <span style={{ minWidth: 0, flex: 1 }}><b>{u.display_name}</b><small>{u.minor ? 'Under 18 · ' : ''}{u.sessions} synced sessions · since {new Date(u.created_at).toLocaleDateString()}</small></span>
            {u.id === user.id ? <span className="tag">You · admin</span> : (
              <select className="role-select" aria-label={`Role for ${u.display_name}`} value={u.role} disabled={u.minor} onChange={(e) => {
                if (confirm(`Make ${u.display_name} ${e.target.value === 'athlete' ? 'an athlete' : `a${e.target.value === 'admin' ? 'n' : ''} ${e.target.value}`}?`)) act(supabase!.rpc('set_role', { target: u.id, new_role: e.target.value }));
              }}>{(['athlete', 'coach', 'admin'] as const).map((r) => <option key={r} value={r}>{r[0]!.toUpperCase() + r.slice(1)}</option>)}</select>
            )}
          </div>
        ))}
      </div>
      <p className="faint" style={{ fontSize: '.8rem' }}>Under-18s are shown as initials and can't be given coach or admin roles. Admins can't change their own role.</p>
    </main>
  );
}
