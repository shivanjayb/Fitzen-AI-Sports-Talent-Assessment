import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EXERCISES, exerciseById } from '@fitzen/engines';
import { getAccount, supabase, useUser, type Account } from '../lib/supabase';
import './social.css';
import { getHistory } from './store';
import { openAssistant } from './openAssistant';
import { IconPodium } from './icons';
import { PageHeader } from './Shell';
import { t } from './language';

type Scope = 'group' | 'city' | 'state' | 'country' | 'world';
interface Row { rank: number; display_name: string; value: number; form_score: number; metric: 'reps' | 'holdSec' | 'jumpHeightCm'; is_me: boolean }
interface Group { id: string; name: string; invite_code: string; owner: string }
type Board = 'exercise' | 'consistency' | 'stamina' | 'form';
const BOARDS: Array<[Board, string, string]> = [['exercise', 'One exercise', ''], ['consistency', 'Consistency', 'Days trained in the last 30 days'], ['stamina', 'Stamina', 'Minutes of measured movement in the last 30 days'], ['form', 'Technique', 'Average form score over the last 30 days (3+ sessions)']];
const BOARD_UNIT: Record<Exclude<Board, 'exercise'>, string> = { consistency: 'days', stamina: 'min', form: '/100' };
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
  const [board, setBoard] = useState<Board>('exercise');
  const [sameClass, setSameClass] = useState(false);
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
    const g = scope === 'group' ? grp : null;
    void (board === 'exercise' ? supabase!.rpc('leaderboard', { exercise: ex, scope, grp: g, sort, lim: 50, same_class: sameClass })
      : supabase!.rpc('activity_board', { kind: board, scope, grp: g, same_class: sameClass, lim: 50 })).then(({ data, error }) => {
      if (!live) return;
      if (error) setErr(errMsg(error));
      // Activity boards have no per-exercise metric: `sessions` is shown in place of the form score.
      else setRows(((data ?? []) as Array<Row & { sessions?: number }>).map((r) => ({ ...r, rank: Number(r.rank), form_score: r.form_score ?? Number(r.sessions ?? 0) })));
    });
    return () => { live = false; };
  }, [acct, ex, scope, grp, sort, board, sameClass]);

  const head = <PageHeader kicker={t("Leaderboards and groups")} title={t('Compete')} />;
  if (!supabase) return <main className="page">{head}<Empty>{t("Accounts aren't switched on yet, so there is no one to rank against. Your sessions still count on")} <Link to="/progress">{t("Progress")}</Link>.</Empty></main>;
  if (acct === undefined) return <main className="page">{head}{err ? <p role="alert">{err}</p> : <div className="spinner" style={{ marginTop: 40 }} aria-label={t("Loading")} />}</main>;
  if (!user || !acct) return (
    <main className="page">{head}
      <Empty>{user ? 'Save your account details to join leaderboards and groups.' : 'Sign in to compare your scores with friends, your city, your state and India.'}<br /><br />
        <Link to={user ? '/profile#account' : '/auth?next=%2Fcompete'} className="btn primary">{user ? 'Finish my account' : 'Sign in'}</Link></Empty>
    </main>
  );

  const name = board === 'exercise' ? exerciseById(ex)?.name ?? ex : BOARDS.find((b) => b[0] === board)![1];
  const fmt = (r: Row) => board === 'exercise' ? `${r.value.toFixed(r.metric === 'reps' ? 0 : 1)} ${UNIT[r.metric]}` : `${Number(r.value.toFixed(1))} ${BOARD_UNIT[board]}`;
  const others = rows?.filter((r) => !r.is_me).length ?? 0;
  const where = { group: t('this group'), city: acct.city || t('your city'), state: acct.state || t('your state'), country: acct.country || t('your country'), world: t('the world') }[scope];

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      {head}
      <section className="glass panel" style={{ display: 'grid', gap: 12, marginTop: 18 }}>
        <div className="chips" role="group" aria-label={t("Leaderboard")} style={{ padding: 0, flexWrap: 'wrap' }}>
          {BOARDS.map(([b, l]) => <button key={b} className={`chip ${board === b ? 'on' : ''}`} aria-pressed={board === b} onClick={() => setBoard(b)}>{t(l)}</button>)}
        </div>
        {board === 'exercise' ? <label className="field"><span>{t("Exercise")}</span>
          <select value={ex} onChange={(e) => setEx(e.target.value)}>{EXERCISES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </label> : <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>{t(BOARDS.find((b) => b[0] === board)![2])}. {t('Counts sessions recorded while signed in.')}</p>}
        <div className="chips" role="group" aria-label={t("Who to compare with")} style={{ padding: 0, flexWrap: 'wrap' }}>
          {SCOPES.map(([s, l]) => <button key={s} className={`chip ${scope === s ? 'on' : ''}`} aria-pressed={scope === s} onClick={() => setScope(s)}>{l === 'India' && acct.country !== 'India' ? acct.country : l}</button>)}
        </div>
        {scope === 'group' && groups.length > 1 && (
          <label className="field"><span>{t("Group")}</span><select value={grp ?? ''} onChange={(e) => setGrp(e.target.value)}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        )}
        <label className="row" style={{ gap: 10, cursor: 'pointer' }}><input type="checkbox" checked={sameClass} onChange={(e) => setSameClass(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span><b style={{ fontSize: '.92rem' }}>{t("Only my size class")}</b><br /><span className="muted" style={{ fontSize: '.82rem' }}>{t("People within the same 10 kg weight band and 10 cm height band as you")}</span></span></label>
        {board === 'exercise' && <div className="row between"><b style={{ fontSize: '.92rem' }}>{t("Rank by")}</b>
          <div className="segmented glass" role="group" aria-label={t("Rank by")}>
            {([['value', 'Performance'], ['form', 'Accuracy']] as const).map(([v, l]) => <button key={v} className={sort === v ? 'on' : ''} aria-pressed={sort === v} onClick={() => setSort(v)}>{l}</button>)}
          </div>
        </div>}
      </section>

      <h2 className="section-title">{name}<small>{where}</small></h2>
      {scope === 'group' && !groups.length ? <p className="muted">{t("You're not in a group yet. Create one or join with a code below.")}</p>
        : err ? <section className="glass panel" role="alert"><p style={{ margin: 0 }}>{err[0]!.toUpperCase() + err.slice(1)}.</p>{/profile/.test(err) && <p style={{ marginBottom: 0 }}><Link to={/height/.test(err) ? '/profile' : '/profile#account'}>{t(/height/.test(err) ? "Open your profile" : "Open your account")}</Link></p>}</section>
        : !rows ? <div className="spinner" aria-label={t("Loading leaderboard")} />
        : !rows.length ? <Empty>{t('No scores for {name} in {where} yet. Record it with the camera or a video to post the first one.', { name, where })}<br /><br /><Link to={board === 'exercise' ? `/exercise/${ex}` : '/train'} className="btn primary">{board === 'exercise' ? t('Train {name}', { name }) : t('Start training')}</Link></Empty>
        : (<>
          <ol className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label={`${name} leaderboard`}>
            {rows.map((r, i) => (<li key={`${r.rank}-${i}`}>
              {i > 0 && r.rank > rows[i - 1]!.rank + 1 && <div className="faint" aria-hidden style={{ textAlign: 'center', padding: '0 0 10px' }}>⋯</div>}
              <div className="glass list-item" aria-current={r.is_me ? 'true' : undefined} style={r.is_me ? { boxShadow: 'inset 0 0 0 1.5px var(--accent)' } : undefined}>
                <b className="num" style={{ minWidth: 34, fontFamily: 'var(--display)', fontSize: '1.3rem', color: r.rank <= 3 ? 'var(--accent)' : undefined }}>{r.rank}</b>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ overflowWrap: 'anywhere' }}>{r.display_name}{r.is_me && <span className="tag" style={{ marginLeft: 8 }}>{t("You")}</span>}</b>
                  <div className="muted num" style={{ fontSize: '.82rem' }}>{board === 'exercise' ? t('form {n}/100', { n: r.form_score }) : t('{n} sessions', { n: r.form_score })}</div>
                </div>
                <b className="num">{board === 'exercise' && sort === 'form' ? `${r.form_score}` : fmt(r)}</b>
              </div>
            </li>))}
          </ol>
          {!others && <p className="muted" style={{ fontSize: '.9rem' }}>{t(scope === 'group' ? 'Nobody else is on this board yet. Share your group code below.' : 'Nobody else is on this board yet. Invite friends or try a wider area.')}</p>}
          {!rows.some((r) => r.is_me) && <p className="muted" style={{ fontSize: '.9rem' }}>{board === 'exercise' ? t("You're not on this board yet: record {name} with the camera or a video while signed in.", { name }) : t("You're not on this board yet: record a session with the camera or a video while signed in.")}</p>}
          {board === 'exercise' && <button className="btn glass press block" style={{ marginTop: 12 }} onClick={() => openAssistant({ kind: 'leaderboard', exerciseId: ex, scope,
            rows: rows.map((r) => ({ rank: r.rank, name: r.display_name, value: r.value, formScore: r.form_score, isMe: r.is_me })) }, 'How can I climb this leaderboard?')}>{t("Ask the guide how to climb")}</button>}
        </>)}
      <p className="faint" style={{ fontSize: '.76rem' }}>{t("Each person's best session counts. Under-18s appear on public boards only after a parent confirms, and only as initials. Scores are single-camera estimates.")}</p>

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
  const [pending, setPending] = useState<Array<{ user_id: string; display_name: string }>>([]);

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
    const [{ data }, req] = await Promise.all([supabase!.rpc('group_roster', { g: g.id }), g.owner === me ? supabase!.rpc('group_pending', { g: g.id }) : Promise.resolve({ data: [] })]);
    setRoster((data ?? []) as typeof roster);
    setPending((req.data ?? []) as typeof pending);
  };

  return (<>
    <h2 className="section-title">{t("Friend groups")} <small>{groups.length}</small></h2>
    <div className="list">
      {groups.map((g) => (
        <section key={g.id} className="glass panel" style={{ display: 'grid', gap: 10 }}>
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}><b style={{ overflowWrap: 'anywhere' }}>{g.name}</b><div className="muted" style={{ fontSize: '.85rem' }}>{t("Code")} <b className="num" style={{ letterSpacing: '.08em' }}>{g.invite_code}</b></div></div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn glass press" onClick={() => void share(g)}>{t("Invite")}</button>
              <button className="btn glass press" aria-expanded={open === g.id} onClick={() => void toggle(g)}>{t("Members")}</button>
            </div>
          </div>
          {open === g.id && (<>
            {pending.length > 0 && <div style={{ display: 'grid', gap: 8 }}><b style={{ fontSize: '.9rem' }}>{t('Requests to join')} <span className="fz-dot">{pending.length}</span></b>
              {pending.map((p) => <div key={p.user_id} className="row between" style={{ gap: 8, flexWrap: 'wrap' }}><span>{p.display_name}</span><span className="row" style={{ gap: 8 }}>
                {[true, false].map((ok) => <button key={String(ok)} className={`btn ${ok ? 'primary' : 'glass'}`} disabled={busy} onClick={() => void run(async () => {
                  const { error } = await supabase!.rpc('review_join', { g: g.id, u: p.user_id, approve: ok }); if (error) throw error;
                  setPending((x) => x.filter((y) => y.user_id !== p.user_id)); if (ok) setRoster((x) => [...x, { display_name: p.display_name, is_owner: false, is_me: false }]);
                  return ok ? `${p.display_name} joined ${g.name}.` : `Declined ${p.display_name}.`;
                })}>{t(ok ? 'Accept' : 'Decline')}</button>)}</span></div>)}
            </div>}
            <ul style={{ margin: 0, paddingLeft: 18 }}>{roster.map((m, i) => <li key={i}>{m.display_name}{m.is_owner ? ' · owner' : ''}{m.is_me ? ' · you' : ''}</li>)}</ul>
            {g.owner === me
              ? <button className="btn danger" disabled={busy} onClick={() => confirm(`Delete "${g.name}" for everyone?`) && void run(async () => {
                  const { error } = await supabase!.from('groups').delete().eq('id', g.id); if (error) throw error; return `Deleted ${g.name}.`;
                })}>{t("Delete group")}</button>
              : <button className="btn glass press" disabled={busy} onClick={() => void run(async () => {
                  const { error } = await supabase!.from('group_members').delete().eq('group_id', g.id).eq('user_id', me); if (error) throw error; return `You left ${g.name}.`;
                })}>{t("Leave group")}</button>}
          </>)}
        </section>
      ))}
    </div>
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 10 }}>
      <form className="glass panel" style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); void run(async () => {
        const { data, error } = await supabase!.from('groups').insert({ name: name.trim() }).select('name, invite_code').single();
        if (error) throw error;
        setName('');
        return `Created ${data.name}. Tap Invite to send the code to friends on WhatsApp or any app; you accept each request under Members.`;
      }); }}>
        <label className="field"><span>{t("New group name")}</span><input required maxLength={40} value={name} placeholder={t("e.g. School athletics team")} onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn primary" disabled={busy || !name.trim()}>{t("Create group")}</button>
      </form>
      <form className="glass panel" style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); void run(async () => {
        const { data, error } = await supabase!.rpc('request_join', { code: code.trim() });
        if (error) throw error;
        setCode('');
        return `${data as string}. You will appear on the group board once they accept.`;
      }); }}>
        <label className="field"><span>{t("Invite code")}</span><input required maxLength={12} autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button className="btn glass press" disabled={busy || !code.trim()}>{t("Ask to join")}</button>
        <p className="faint" style={{ margin: 0, fontSize: '.78rem' }}>{t("Codes from a coach join their squad: that shares your full session reports with the coach (under-18s only after a parent confirms). Leave any time.")}</p>
      </form>
    </div>
    {msg && <p role="status" aria-live="polite" className="muted" style={{ fontSize: '.9rem' }}>{msg}</p>}
  </>);
}
