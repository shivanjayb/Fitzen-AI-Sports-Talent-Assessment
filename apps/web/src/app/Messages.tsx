/**
 * Coach <-> athlete requests and chat (migration 010). The side that did not send a request accepts or declines it;
 * after that both can message and the coach can open the athlete's synced session reports.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { exerciseById } from '@fitzen/engines';
import { supabase, useUser } from '../lib/supabase';
import { PageHeader } from './Shell';
import { Report, type Row } from './Coach';
import { t } from './language';
import './social.css';

export interface Conn { id: string; i_am: 'coach' | 'athlete'; other_name: string; status: 'pending' | 'accepted' | 'declined'; started_by_me: boolean; exercise_id: string | null; created_at: string; last_body: string | null; last_at: string | null; last_mine: boolean | null }
interface Msg { id: number; sender: string; body: string; created_at: string }
const errText = (e: unknown) => (e as { message?: string })?.message || 'Something went wrong. Check your connection and try again.';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Requests waiting for the signed-in user's answer; used for the menu badge. */
export async function pendingRequests(): Promise<number> {
  if (!supabase) return 0;
  const { data } = await supabase.rpc('my_connections');
  return ((data ?? []) as Conn[]).filter((c) => c.status === 'pending' && !c.started_by_me).length;
}

export default function Messages() {
  const user = useUser();
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await supabase!.rpc('my_connections');
    if (error) { setErr(errText(error)); return; }
    setErr(''); setConns(data as Conn[]);
    setSel((cur) => cur ?? (data as Conn[])[0]?.id ?? null);
  }, []);
  // ponytail: polling every 6 s while the page is open; switch to Supabase Realtime if chats get busy.
  useEffect(() => {
    if (!supabase || !user) return;
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 6000);
    return () => clearInterval(id);
  }, [user?.id, load]);

  const head = <PageHeader kicker={t('Coaches and athletes')} title={t('Messages')} back />;
  if (!supabase) return <main className="page">{head}<p className="muted">{t('Online accounts are not switched on in this build, so messages are unavailable.')}</p></main>;
  if (!user) return <main className="page">{head}<section className="glass panel"><p style={{ marginTop: 0 }}>{t('Sign in to message a coach or your athletes.')}</p><Link className="btn primary" to="/auth?next=%2Fmessages">{t('Sign in')}</Link></section></main>;
  const cur = conns?.find((c) => c.id === sel) ?? null;
  return (
    <main className="page" style={{ maxWidth: 1040 }}>{head}
      {err && <p role="alert">{err}</p>}
      {conns === null && !err ? <div className="spinner" aria-label={t('Loading')} /> : conns?.length === 0 ? (
        <div className="empty"><h2>{t('No conversations yet')}</h2><p>{t('Open any session report and choose “Ask a coach” to send a request. Coaches can invite athletes from the talent board in the Coach portal.')}</p><Link className="btn primary" to="/reports">{t('Open my reports')}</Link></div>
      ) : (
        <div className="msg">
          <div className="msg-list" role="list">
            {conns?.map((c) => <button key={c.id} role="listitem" className="msg-item" aria-current={c.id === sel} onClick={() => setSel(c.id)}>
              <b>{c.other_name} <span className="faint" style={{ fontWeight: 400 }}>· {t(c.i_am === 'coach' ? 'athlete' : 'coach')}</span></b>
              {c.status !== 'accepted' && <span className="tag">{t(c.status === 'declined' ? 'Declined' : c.started_by_me ? 'Waiting for reply' : 'New request')}</span>}
              <small>{c.last_body ? `${c.last_mine ? 'You: ' : ''}${c.last_body}` : t('No messages yet')}</small>
            </button>)}
          </div>
          {cur && <Thread key={cur.id} conn={cur} me={user.id} reload={load} />}
        </div>
      )}
    </main>
  );
}

function Thread({ conn, me, reload }: { conn: Conn; me: string; reload: () => Promise<void> }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reports, setReports] = useState<Row[] | null>(null);
  const [showReports, setShowReports] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const load = useCallback(async () => {
    const { data, error } = await supabase!.from('messages').select('id, sender, body, created_at').eq('connection_id', conn.id).order('id').limit(500);
    if (error) { setErr(errText(error)); return; }
    setMsgs(data as Msg[]);
  }, [conn.id]);
  useEffect(() => { void load(); const id = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5000); return () => clearInterval(id); }, [load]);
  useEffect(() => { if (msgs.length !== count.current) { count.current = msgs.length; end.current?.scrollIntoView({ block: 'nearest' }); } }, [msgs.length]);

  const act = async (f: () => PromiseLike<{ error: unknown }>) => { setBusy(true); setErr(''); const { error } = await f(); if (error) setErr(errText(error)); await reload(); await load(); setBusy(false); };
  const send = () => { const body = text.trim(); if (!body) return; setText(''); void act(() => supabase!.from('messages').insert({ connection_id: conn.id, body })); };
  const openReports = async () => {
    setShowReports((v) => !v);
    if (reports) return;
    const { data, error } = await supabase!.rpc('connection_sessions', { c: conn.id, lim: 60 });
    if (error) setErr(errText(error)); else setReports(data as Row[]);
  };
  const about = conn.exercise_id ? exerciseById(conn.exercise_id)?.name : null;

  return (
    <section className="glass panel msg-thread" aria-label={`Conversation with ${conn.other_name}`}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8, paddingBottom: 10 }}>
        <div><b>{conn.other_name}</b>{about && <div className="muted" style={{ fontSize: '.85rem' }}>{t('About')} {about}</div>}</div>
        <div className="row" style={{ gap: 8 }}>
          {conn.i_am === 'coach' && conn.status === 'accepted' && <button className="btn glass press" aria-expanded={showReports} onClick={() => void openReports()}>{t(showReports ? 'Hide reports' : 'Session reports')}</button>}
          <button className="btn glass press" disabled={busy} onClick={() => confirm(`End this conversation with ${conn.other_name}? Messages are deleted for both of you${conn.i_am === 'athlete' ? ' and the coach loses access to your reports' : ''}.`) && void act(() => supabase!.from('connections').delete().eq('id', conn.id))}>{t('End')}</button>
        </div>
      </div>
      {showReports && <div className="rows" style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 10 }}>
        {reports === null ? <div className="spinner" aria-label={t('Loading reports')} /> : reports.length === 0 ? <p className="muted">{t('No synced sessions yet. Reports appear after the athlete trains while signed in.')}</p> : reports.map((r) => <Report key={r.id} row={r} />)}
      </div>}
      <div className="msg-scroll" aria-live="polite">
        {msgs.map((m) => <div key={m.id} className={`msg-b ${m.sender === me ? 'me' : ''}`}>{m.body}<time dateTime={m.created_at}>{when(m.created_at)}</time></div>)}
        <div ref={end} />
      </div>
      {err && <p role="alert" style={{ margin: '0 0 8px' }}>{err}</p>}
      {conn.status === 'pending' && !conn.started_by_me ? (
        <div className="msg-send" style={{ flexWrap: 'wrap' }}>
          <p className="muted" style={{ margin: 0, flex: '1 1 240px', fontSize: '.88rem' }}>{t(conn.i_am === 'athlete' ? 'Accepting lets this coach message you and open your session reports. You can end it any time.' : 'Accepting opens a chat and lets you see this athlete’s session reports.')}</p>
          <button className="btn primary" disabled={busy} onClick={() => void act(() => supabase!.rpc('answer_connection', { c: conn.id, accept: true }))}>{t('Accept')}</button>
          <button className="btn glass" disabled={busy} onClick={() => void act(() => supabase!.rpc('answer_connection', { c: conn.id, accept: false }))}>{t('Decline')}</button>
        </div>
      ) : conn.status !== 'accepted' ? <p className="muted msg-send" style={{ margin: 0 }}>{t(conn.status === 'declined' ? 'This request was declined.' : 'Waiting for them to accept. You can chat once they do.')}</p> : (
        <form className="msg-send" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="sr-only" htmlFor="msg-box">{t('Message')}</label>
          <textarea id="msg-box" rows={1} maxLength={2000} value={text} placeholder={t('Write a message')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <button className="btn primary" disabled={busy || !text.trim()}>{t('Send')}</button>
        </form>
      )}
    </section>
  );
}
