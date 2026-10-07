import { t } from './language';
/** Local deterministic coaching; athlete data never leaves the device. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { localAdvice } from './assistantContext';
import { IconClose, IconSparkle } from './icons';
import { ASSISTANT_EVENT, type AssistantContext, type AssistantOpen } from './openAssistant';

const STARTERS: Record<AssistantContext['kind'], string[]> = {
  help: ['How do I record a jump?', 'How do I analyse a video?', 'What do the colours mean?'],
  result: ['Review my session', 'What needs attention?', 'How do I improve?'],
  progress: ['How am I progressing?', 'What should I train next?', 'Am I training often enough?'],
  leaderboard: ['Where do I stand?', 'How do I climb this board?'],
};
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
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<AssistantContext>({ kind: 'help' });
  const [answer, setAnswer] = useState('');
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); opener.current?.focus(); };
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<AssistantOpen>).detail;
      opener.current = document.activeElement as HTMLElement | null;
      setCtx(d.context); setAnswer(localAdvice(d.context, d.prompt ?? '')); setOpen(true);
    };
    window.addEventListener(ASSISTANT_EVENT, on);
    return () => window.removeEventListener(ASSISTANT_EVENT, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    const wasInert = root?.inert;
    if (root) root.inert = true;
    sheet.current?.querySelector<HTMLElement>('button')?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab') return;
      const f = [...(sheet.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') ?? [])];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); if (root) root.inert = wasInert ?? false; };
  }, [open]);
  return (<>
    {!open && <button ref={fab} className="btn primary press ai-fab no-print" onClick={() => {
      opener.current = fab.current; setCtx({ kind: 'help' }); setAnswer(localAdvice({ kind: 'help' }, '')); setOpen(true);
    }} aria-label="Open local coach"><IconSparkle /><span>{t('Local coach')}</span></button>}
    {open && createPortal(<>
      <div className="scrim" onClick={close} />
      <div ref={sheet} className="sheet glass ai-sheet" role="dialog" aria-modal="true" aria-labelledby="coach-title">
        <div className="row between">
          <div><h2 id="coach-title" style={{ margin: 0 }}>{t('Fitzen local coach')}</h2><p className="faint">Guidance from your measurements. No account or internet needed.</p></div>
          <button className="btn icon glass" onClick={close} aria-label="Close"><IconClose /></button>
        </div>
        <div className="chips">{STARTERS[ctx.kind].map((s) => <button key={s} className="chip" onClick={() => setAnswer(localAdvice(ctx, s))}>{t(s)}</button>)}</div>
        <div className="ai-log" role="status" aria-live="polite"><Md text={answer} /></div>
        <p className="faint">Rule-based guidance stays on this device. Screening estimates, not medical advice or a selection decision.</p>
      </div>
    </>, document.body)}
  </>);
}
