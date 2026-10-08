import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EXERCISES, exerciseById } from '@fitzen/engines';
import { getAccount, supabase, useUser, type Account } from '../lib/supabase';
import { getHistory } from './store';
import { openAssistant } from './openAssistant';
import { IconPodium } from './icons';

type Scope = 'group' | 'city' | 'state' | 'country' | 'world';
interface Row { rank: number; display_name: string; value: number; form_score: number; metric: 'reps' | 'holdSec' | 'jumpHeightCm'; is_me: boolean }
interface Group { id: string; name: string; invite_code: string; owner: string }
const SCOPES: Array<[Scope, string]> = [['group', 'Group'], ['city', 'City'], ['state', 'State'], ['country', 'India'], ['world', 'World']];
const UNIT = { reps: 'reps', holdSec: 's', jumpHeightCm: 'cm' } as const;
const errMsg = (e: unknown) => (e as { message?: string })?.message || 'Something went wrong. Check your connection and try again.';

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty"><div className="big"><IconPodium /></div>{children}</div>;
}

export default function Compete() {
  const user = useUser();
  const [acct, setAcct] = useState<Account | null | undefined>(undefined);
  const [ex, setEx] = useState(() => getHistory().find((s) => s.source !== 'demo')?.report.exerciseId ?? 'sai-vertical-jump');
  const [scope, setScope] = useState<Scope>('city');
  const [sort, setSort] = useState<'value' | 'form'>('value');
  const [groups, setGroups] = useState<Group[]>([]);
  const [grp, setGrp] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { let live = true; void getAccount().then((a) => live && setAcct(a)).catch(() => { if (live) setErr('Could not load your account. Check your connection and reload.'); }); return () => { live = false; }; }, [user?.id]);

  const loadGroups = async () => {
    const { data } = await supabase!.from('groups').select('id, name, invite_code, owner').order('created_at');
    const g = (data ?? []) as Group[];
    setGroups(g);
    setGrp((cur) => (cur && g.some((x) => x.id === cur) ? cur : g[0]?.id ?? null));
  };
  useEffect(() => { if (acct) void loadGroups(); }, [acct]);

  useEffect(() => {
    if (!acct || (scope === 'group' && !grp)) { setRows(null); return; }
    let live = true;
    setRows(null); setErr('');
    void supabase!.rpc('leaderboard', { exercise: ex, scope, grp: scope === 'group' ? grp : null, sort, lim: 50 }).then(({ data, error }) => {
      if (!live) return;
      if (error) setErr(errMsg(error)); else setRows(((data ?? []) as Row[]).map((r) => ({ ...r, rank: Number(r.rank) })));
    });
    return () => { live = false; };
  }, [acct, ex, scope, grp, sort]);

  const head = <><p className="subtitle">Leaderboards and groups</p><h1 className="large-title">Compete</h1></>;
  if (!supabase) return <main className="page">{head}<Empty>Accounts aren't switched on yet, so there is no one to rank against. Your sessions still count on <Link to="/progress">Progress</Link>.</Empty></main>;
  if (acct === undefined) return <main className="page">{head}{err ? <p role="alert">{err}</p> : <div className="spinner" style={{ marginTop: 40 }} aria-label="Loading" />}</main>;
  if (!user || !acct) return (
    <main className="page">{head}
      <Empty>{user ? 'Save your account details to join leaderboards and groups.' : 'Sign in to compare your scores with friends, your city, your state and India.'}<br /><br />
        <Link to={user ? '/profile#account' : '/auth?next=%2Fcompete'} className="btn primary">{user ? 'Finish my account' : 'Sign in'}</Link></Empty>
    </main>
  );

  const name = exerciseById(ex)?.name ?? ex;
  const fmt = (r: Row) => `${r.value.toFixed(r.metric === 'reps' ? 0 : 1)} ${UNIT[r.metric]}`;
  const others = rows?.filter((r) => !r.is_me).length ?? 0;
  const where = { group: 'this group', city: acct.city || 'your city', state: acct.state || 'your state', country: acct.country, world: 'the world' }[scope];

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      {head}
      <section className="glass panel" style={{ display: 'grid', gap: 12, marginTop: 18 }}>
        <label className="field"><span>Exercise</span>
          <select value={ex} onChange={(e) => setEx(e.target.value)}>{EXERCISES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </label>
        <div className="chips" role="group" aria-label="Who to compare with" style={{ padding: 0, flexWrap: 'wrap' }}>
          {SCOPES.map(([s, l]) => <button key={s} className={`chip ${scope === s ? 'on' : ''}`} aria-pressed={scope === s} onClick={() => setScope(s)}>{l === 'India' && acct.country !== 'India' ? acct.country : l}</button>)}
        </div>
        {scope === 'group' && groups.length > 1 && (
          <label className="field"><span>Group</span><select value={grp ?? ''} onChange={(e) => setGrp(e.target.value)}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        )}
        <div className="row between"><b style={{ fontSize: '.92rem' }}>Rank by</b>
          <div className="segmented glass" role="group" aria-label="Rank by">
            {([['value', 'Performance'], ['form', 'Accuracy']] as const).map(([v, l]) => <button key={v} className={sort === v ? 'on' : ''} aria-pressed={sort === v} onClick={() => setSort(v)}>{l}</button>)}
          </div>
        </div>
      </section>

      <h2 className="section-title">{name}<small>{where}</small></h2>
      {scope === 'group' && !groups.length ? <p className="muted">You're not in a group yet. Create one or join with a code below.</p>
        : err ? <section className="glass panel" role="alert"><p style={{ margin: 0 }}>{err[0]!.toUpperCase() + err.slice(1)}.</p>{/profile/.test(err) && <p style={{ marginBottom: 0 }}><Link to="/profile#account">Open your account</Link></p>}</section>
        : !rows ? <div className="spinner" aria-label="Loading leaderboard" />
        : !rows.length ? <Empty>No scores for {name} in {where} yet. Record it with the camera or a video to post the first one.<br /><br /><Link to={`/train/${ex}`} className="btn primary">Train {name}</Link></Empty>
        : (<>
          <ol className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label={`${name} leaderboard`}>
            {rows.map((r, i) => (<li key={`${r.rank}-${i}`}>
              {i > 0 && r.rank > rows[i - 1]!.rank + 1 && <div className="faint" aria-hidden style={{ textAlign: 'center', padding: '0 0 10px' }}>⋯</div>}
              <div className="glass list-item" aria-current={r.is_me ? 'true' : undefined} style={r.is_me ? { boxShadow: 'inset 0 0 0 1.5px var(--accent)' } : undefined}>
                <b className="num" style={{ minWidth: 34, fontFamily: 'var(--display)', fontSize: '1.3rem', color: r.rank <= 3 ? 'var(--accent)' : undefined }}>{r.rank}</b>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ overflowWrap: 'anywhere' }}>{r.display_name}{r.is_me && <span className="tag" style={{ marginLeft: 8 }}>You</span>}</b>
                  <div className="muted num" style={{ fontSize: '.82rem' }}>form {r.form_score}/100</div>
                </div>
                <b className="num">{sort === 'form' ? `${r.form_score}` : fmt(r)}</b>
              </div>
            </li>))}
          </ol>
          {!others && <p className="muted" style={{ fontSize: '.9rem' }}>Nobody else is on this board yet.{scope === 'group' ? ' Share your group code below.' : ' Invite friends or try a wider area.'}</p>}
          {!rows.some((r) => r.is_me) && <p className="muted" style={{ fontSize: '.9rem' }}>You're not on this board yet: record {name} with the camera or a video while signed in.</p>}
          <button className="btn glass press block" style={{ marginTop: 12 }} onClick={() => openAssistant({ kind: 'leaderboard', exerciseId: ex, scope,
            rows: rows.map((r) => ({ rank: r.rank, name: r.display_name, value: r.value, formScore: r.form_score, isMe: r.is_me })) }, 'How can I climb this leaderboard?')}>Ask AI how to climb</button>
        </>)}
      <p className="faint" style={{ fontSize: '.76rem' }}>Each person's best session counts. Under-18s appear on public boards only after a parent confirms, and only as initials. Scores are single-camera estimates.</p>

      <Groups me={acct.id} groups={groups} reload={loadGroups} />
    </main>
  );
}

function Groups({ me, groups, reload }: { me: string; groups: Group[]; reload: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [roster, setRoster] = useState<Array<{ display_name: string; is_owner: boolean; is_me: boolean }>>([]);

  const run = async (f: () => Promise<string>) => {
    setBusy(true); setMsg('');
    try { setMsg(await f()); await reload(); } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };
  const share = async (g: Group) => {
    const text = `Join my Fitzen group "${g.name}" with code ${g.invite_code}: ${location.origin}/compete`;
    try {
      if (navigator.share) await navigator.share({ title: 'Fitzen group', text });
      else { await navigator.clipboard.writeText(text); setMsg(`Invite for ${g.name} copied.`); }
    } catch { /* share sheet dismissed */ }
  };
  const toggle = async (g: Group) => {
    if (open === g.id) { setOpen(null); return; }
    setOpen(g.id); setRoster([]);
    const { data } = await supabase!.rpc('group_roster', { g: g.id });
    setRoster((data ?? []) as typeof roster);
  };

  return (<>
    <h2 className="section-title">Groups <small>{groups.length}</small></h2>
    <div className="list">
      {groups.map((g) => (
        <section key={g.id} className="glass panel" style={{ display: 'grid', gap: 10 }}>
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}><b style={{ overflowWrap: 'anywhere' }}>{g.name}</b><div className="muted" style={{ fontSize: '.85rem' }}>Code <b className="num" style={{ letterSpacing: '.08em' }}>{g.invite_code}</b></div></div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn glass press" onClick={() => void share(g)}>Invite</button>
              <button className="btn glass press" aria-expanded={open === g.id} onClick={() => void toggle(g)}>Members</button>
            </div>
          </div>
          {open === g.id && (<>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{roster.map((m, i) => <li key={i}>{m.display_name}{m.is_owner ? ' · owner' : ''}{m.is_me ? ' · you' : ''}</li>)}</ul>
            {g.owner === me
              ? <button className="btn danger" disabled={busy} onClick={() => confirm(`Delete "${g.name}" for everyone?`) && void run(async () => {
                  const { error } = await supabase!.from('groups').delete().eq('id', g.id); if (error) throw error; return `Deleted ${g.name}.`;
                })}>Delete group</button>
              : <button className="btn glass press" disabled={busy} onClick={() => void run(async () => {
                  const { error } = await supabase!.from('group_members').delete().eq('group_id', g.id).eq('user_id', me); if (error) throw error; return `You left ${g.name}.`;
                })}>Leave group</button>}
          </>)}
        </section>
      ))}
    </div>
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 10 }}>
      <form className="glass panel" style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); void run(async () => {
        const { data, error } = await supabase!.from('groups').insert({ name: name.trim() }).select('name, invite_code').single();
        if (error) throw error;
        setName('');
        return `Created ${data.name}. Share code ${data.invite_code} with your team.`;
      }); }}>
        <label className="field"><span>New group name</span><input required maxLength={40} value={name} placeholder="e.g. School athletics team" onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn primary" disabled={busy || !name.trim()}>Create group</button>
      </form>
      <form className="glass panel" style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); void run(async () => {
        const { error } = await supabase!.rpc('join_group', { code: code.trim() });
        if (error) throw error;
        setCode('');
        return 'Joined. Pick Group above to see the board.';
      }); }}>
        <label className="field"><span>Invite code</span><input required maxLength={12} autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button className="btn glass press" disabled={busy || !code.trim()}>Join group</button>
      </form>
    </div>
    {msg && <p role="status" aria-live="polite" className="muted" style={{ fontSize: '.9rem' }}>{msg}</p>}
  </>);
}
