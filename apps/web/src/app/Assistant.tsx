/** Floating "Ask Fitzen AI" button + bottom-sheet chat. Rendered once in Shell; open from anywhere via openAssistant(). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { accessToken, getAccount, isMinor, supabase, useUser, type Account } from '../lib/supabase';
import { buildContext } from './assistantContext';
import { IconAlert, IconClose, IconSparkle } from './icons';
import { ASSISTANT_EVENT, type AssistantContext, type AssistantOpen } from './openAssistant';

type Msg = { role: 'user' | 'model'; text: string };
const CONSENT = 'fitzen.aiConsent';
const keyOf = (c: AssistantContext) => (c.kind === 'result' ? `r:${c.sessionId}` : c.kind === 'leaderboard' ? `l:${c.exerciseId}:${c.scope}` : c.kind);
const STARTERS: Record<AssistantContext['kind'], string[]> = {
  help: ['How do I record a jump?', 'How do I analyse a video?', 'What do the colours mean?'],
  result: ['Give me a scouting report', 'Why did I lag?', 'How do I improve?'],
  progress: ['How am I progressing?', 'What should I train next?', 'Am I training often enough?'],
  leaderboard: ['Where do I stand?', 'How do I climb this board?'],
};
const ABOUT: Record<AssistantContext['kind'], string> = { help: 'App help', result: 'About this session', progress: 'About your progress', leaderboard: 'About this leaderboard' };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

// Minimal safe markdown: paragraphs, headings, bullet/numbered lists, **bold**. No HTML injection possible.
const inline = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));
function Md({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let items: string[] = [], ordered = false;
  const flush = () => {
    if (!items.length) return;
    const li = items.map((t, i) => <li key={i}>{inline(t)}</li>);
    out.push(ordered ? <ol key={out.length}>{li}</ol> : <ul key={out.length}>{li}</ul>);
    items = [];
  };
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    const b = /^[-*•]\s+(.*)/.exec(l), n = /^\d+[.)]\s+(.*)/.exec(l), h = /^#{1,4}\s+(.*)/.exec(l);
    if (b || n) { if (items.length && ordered !== !!n) flush(); ordered = !!n; items.push((b ?? n)![1]!); continue; }
    flush();
    if (h) out.push(<h3 key={out.length}>{inline(h[1]!.replace(/\*\*/g, ''))}</h3>);
    else if (l) out.push(<p key={out.length}>{inline(l)}</p>);
  }
  flush();
  return <>{out}</>;
}

export default function Assistant() {
  const user = useUser();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<AssistantContext>({ kind: 'help' });
  const [convos, setConvos] = useState<Record<string, Msg[]>>({});
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [consent, setConsent] = useState(() => read(CONSENT) === 'yes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const pending = useRef<string | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const fab = useRef<HTMLButtonElement>(null);

  const msgs = convos[keyOf(ctx)] ?? [];
  // Same rule as api/ai.ts: a saved account profile, and under-18s need parent consent; otherwise app help only.
  const personalOk = account ? !isMinor(account.birth_year) || Boolean(account.parent_consent_at) : false;
  const gate = !supabase || !user ? 'signin' : !consent ? 'consent' : ctx.kind !== 'help' && account === undefined ? 'checking' : ctx.kind !== 'help' && !personalOk ? 'minor' : 'ready';

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<AssistantOpen>).detail;
      opener.current = document.activeElement as HTMLElement | null;
      setCtx(d.context); setError(null); setOpen(true);
      pending.current = d.prompt ?? null;
    };
    window.addEventListener(ASSISTANT_EVENT, on);
    return () => window.removeEventListener(ASSISTANT_EVENT, on);
  }, []);

  useEffect(() => { if (open && user) void getAccount().then(setAccount, () => setAccount(null)); }, [open, user]);

  const close = () => { setOpen(false); pending.current = null; (opener.current ?? fab.current)?.focus(); };

  async function ask(history: Msg[]) {
    const k = keyOf(ctx);
    setConvos((c) => ({ ...c, [k]: history }));
    setBusy(true); setError(null);
    try {
      const token = await accessToken();
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ messages: history.slice(-19), context: buildContext(ctx, loc.pathname) }),
      });
      const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!r.ok || !j.text) throw new Error(j.error ?? `The assistant is unavailable (${r.status}).`);
      setConvos((c) => ({ ...c, [k]: [...history, { role: 'model', text: j.text! }] }));
    } catch (e) {
      setError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'No connection. Check your internet and retry.');
    } finally { setBusy(false); }
  }
  const send = (text: string) => { const t = text.trim().slice(0, 2000); if (t && !busy) { setDraft(''); void ask([...msgs, { role: 'user', text: t }]); } };

  // Auto-send a prefilled prompt once the gates pass.
  useEffect(() => {
    if (open && gate === 'ready' && pending.current) { const p = pending.current; pending.current = null; send(p); }
  });

  // Focus into the sheet on open; Esc closes; Tab stays inside.
  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>('textarea, button.primary, a.btn, button')?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab' || !sheet.current) return;
      const f = [...sheet.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled])')];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, gate]);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs.length, busy, error]);

  const agree = () => { try { localStorage.setItem(CONSENT, 'yes'); } catch { /* private mode: consent lasts this visit */ } setConsent(true); };

  return (<>
    {!open && (
      <button ref={fab} className="btn primary press ai-fab no-print" onClick={() => { opener.current = fab.current; setCtx({ kind: 'help' }); setError(null); setOpen(true); }} aria-label="Ask Fitzen AI">
        <IconSparkle /><span>Ask AI</span>
      </button>
    )}
    {open && createPortal(<>
      <div className="scrim" onClick={close} />
      <div ref={sheet} className="sheet glass ai-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-title">
        <div className="row between">
          <div><h2 id="ai-title" style={{ margin: 0 }}>Fitzen AI</h2><div className="faint" style={{ fontSize: '.8rem', fontWeight: 600 }}>{ABOUT[ctx.kind]}</div></div>
          <button className="btn icon glass press" onClick={close} aria-label="Close"><IconClose /></button>
        </div>

        {gate === 'signin' && (
          <div className="ai-gate">
            <p>The assistant runs on Fitzen&rsquo;s server, so it needs a free account, even for questions about the app.</p>
            {supabase ? <Link to="/profile" className="btn primary block press" onClick={close}>Sign in on Profile</Link>
              : <p className="muted">Accounts are not set up in this build, so the assistant is off.</p>}
          </div>
        )}

        {gate === 'consent' && (
          <div className="ai-gate">
            <b>Before your first question</b>
            <p>To answer, Fitzen sends your question to <b>Google Gemini</b>. For questions about a session, your progress or a leaderboard it also sends the numbers from those screens (reps, joint angles, form checks, scores, readiness) and your profile basics (first name, age, sex, height, weight, sport, city/state, diet, sleep, training days).</p>
            <p><b>Your video and camera feed are never sent.</b> Other athletes&rsquo; names are never sent.</p>
            <p className="muted">This uses Google&rsquo;s free tier, where Google may use prompts and answers to improve its products and people may review them. Don&rsquo;t type anything you want kept private.</p>
            <div className="row"><button className="btn primary press" onClick={agree}>I agree, continue</button><button className="btn glass press" onClick={close}>Not now</button></div>
          </div>
        )}

        {gate === 'checking' && <div className="ai-gate" role="status"><div className="spinner" />Checking your account…</div>}

        {gate === 'minor' && (
          <div className="ai-gate">
            <p>{account ? 'You are under 18, so a parent needs to approve before your results and profile are shared with the AI.' : 'Save your account details in Profile first (under-18s also need a parent’s approval) before your results are shared with the AI.'}</p>
            <p className="muted">Until then you can still ask how the app works. Nothing personal is sent.</p>
            <div className="row"><button className="btn primary press" onClick={() => setCtx({ kind: 'help' })}>Ask about the app</button><Link to="/profile" className="btn glass press" onClick={close}>Open Profile</Link></div>
          </div>
        )}

        {gate === 'ready' && (<>
          <div ref={log} className="ai-log" role="log" aria-live="polite" aria-busy={busy}>
            {!msgs.length && !busy && <p className="muted" style={{ margin: '4px 0 0' }}>Ask anything about {ctx.kind === 'help' ? 'using Fitzen' : ABOUT[ctx.kind].toLowerCase().replace('about ', '')}. Answers use only your measured data.</p>}
            {msgs.map((m, i) => <div key={i} className={`ai-msg ${m.role}`}>{m.role === 'model' ? <Md text={m.text} /> : m.text}</div>)}
            {busy && <div className="ai-msg model muted" role="status"><span className="ai-dots" aria-hidden><i /><i /><i /></span> Thinking…</div>}
            {error && (
              <div className="insight bad" role="alert"><div className="ic"><IconAlert /></div>
                <div><p>{error}</p><button className="btn glass press" style={{ marginTop: 8, minHeight: 38, padding: '8px 16px' }} onClick={() => void ask(msgs)}>Retry</button></div></div>
            )}
          </div>
          {!msgs.length && <div className="chips" style={{ paddingTop: 4 }}>{STARTERS[ctx.kind].map((s) => <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>}
          <form className="ai-compose" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={1} placeholder="Ask in any language…" aria-label="Your question"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
            <button className="btn primary press" type="submit" disabled={busy || !draft.trim()}>Send</button>
          </form>
          <p className="faint" style={{ fontSize: '.72rem', margin: '8px 2px 0' }}>AI can be wrong. Screening estimates, not medical advice.</p>
        </>)}
      </div>
    </>, document.body)}
  </>);
}
