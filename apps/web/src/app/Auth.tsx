import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase, useIdentity } from '../lib/supabase';
import { authDestination, callbackError, passwordAuth, requestSignIn } from '../lib/auth';

export default function Auth() {
  const loc = useLocation();
  const navigate = useNavigate();
  const identity = useIdentity();
  const next = authDestination(new URLSearchParams(loc.search).get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const coach = next === '/coach' || next === '/admin';
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(() => callbackError(loc.search, loc.hash));
  const [seconds, setSeconds] = useState(0);
  const callback = loc.pathname === '/auth/callback';

  useEffect(() => {
    // Supabase has finished consuming the fragment before App exposes this route.
    if (loc.hash) window.history.replaceState(null, '', loc.pathname + loc.search);
    if (identity.ready && identity.user && !error) navigate(next, { replace: true });
  }, [identity.ready, identity.user, error, next, navigate, loc.hash, loc.pathname, loc.search]);
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  return <main className="page" style={{ maxWidth: 520 }}>
    <h1 className="large-title">{sent ? 'Check your inbox' : coach ? 'Coach & admin sign-in' : 'Sign in to Fitzen'}</h1>
    <p className="muted">{coach ? 'See your squad’s reports and whether each session looks genuine. New coaches sign up here, then apply in the Coach portal.' : 'One account on every device: your profile, sessions and groups follow you. Your camera feed stays on this device.'}</p>
    {!supabase ? <section className="glass panel" style={{ marginTop: 20 }}>
      <p role="status">Online accounts are being configured. You can use every local assessment as a guest.</p>
    </section> : <form className="glass panel" style={{ display: 'grid', gap: 16, marginTop: 20 }} onSubmit={(e) => {
      e.preventDefault();
      if (busy || (mode === 'link' && seconds)) return;
      const create = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'create';
      setBusy(true); setError(null);
      const done = mode === 'link'
        ? requestSignIn(supabase, email, location.origin, next).then(() => { setSent(true); setSeconds(60); })
        : passwordAuth(supabase, email, password, create, location.origin, next).then((r) => { if (r === 'confirm-email') setSent(true); });
      void done.catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not sign in. Check your connection and try again.');
      }).finally(() => setBusy(false));
    }}>
      <div className="segmented glass" role="tablist" aria-label="Sign-in method">{(['password', 'link'] as const).map((m) => <button type="button" role="tab" aria-selected={mode === m} key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setError(null); setSent(false); }}>{m === 'password' ? 'Password' : 'Email link'}</button>)}</div>
      {callback && !identity.user && !error && !sent && <p role="status" className="muted" style={{ margin: 0 }}>This link did not create a session. Request a new link to continue.</p>}
      <p style={{ margin: 0 }}>{sent ? `If delivery is available, a link is on its way to ${email.trim()}. Check spam too. Open it to finish ${mode === 'password' ? 'creating your account' : 'signing in'}.` : mode === 'password' ? 'Sign in with your email and password, or create an account.' : 'Enter your email. We’ll send a secure sign-in link. Your first sign-in creates an account.'}</p>
      <label className="field"><span>Email address</span><input type="email" required maxLength={254} autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false); }} disabled={busy} /></label>
      {error && <p role="alert" style={{ margin: 0 }}>{error}</p>}
      {mode === 'password' && <label className="field"><span>Password (8+ characters)</span><input type="password" required minLength={8} maxLength={72} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /></label>}
      {mode === 'link'
        ? <button className="btn primary" disabled={busy || seconds > 0}>{busy ? 'Sending…' : seconds ? `Request another link in ${seconds}s` : sent ? 'Send another link' : 'Email me a sign-in link'}</button>
        : <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}><button className="btn primary" value="signin" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button><button className="btn glass press" value="create" disabled={busy}>Create account</button></div>}
      <p className="faint" style={{ margin: 0, fontSize: '.82rem' }}>{mode === 'link' ? 'Use the link once. No password needed.' : 'Forgot your password? Use an email link, then set a new one in Profile.'} Guest assessments are imported only when you choose to copy them in Profile.</p>
    </form>}
    <div className="row" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
      <Link className="btn glass press" to="/app">Continue as guest</Link>
      {!coach && <Link className="btn glass press" to="/auth?next=%2Fcoach">I’m a coach</Link>}
    </div>
  </main>;
}
