import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase, useIdentity } from '../lib/supabase';
import { authDestination, callbackError, requestSignIn } from '../lib/auth';

export default function Auth() {
  const loc = useLocation();
  const navigate = useNavigate();
  const identity = useIdentity();
  const next = authDestination(new URLSearchParams(loc.search).get('next'));
  const [email, setEmail] = useState('');
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
    <h1 className="large-title">{sent ? 'Check your inbox' : 'Sign in to Fitzen'}</h1>
    <p className="muted">Join groups and keep your results under your account. Your camera feed stays on this device.</p>
    {!supabase ? <section className="glass panel" style={{ marginTop: 20 }}>
      <p role="status">Online accounts are being configured. You can use every local assessment as a guest.</p>
    </section> : <form className="glass panel" style={{ display: 'grid', gap: 16, marginTop: 20 }} onSubmit={(e) => {
      e.preventDefault();
      if (busy || seconds) return;
      setBusy(true); setError(null);
      void requestSignIn(supabase, email, location.origin, next).then(() => {
        setSent(true); setSeconds(60);
      }).catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not send the link. Check your connection and try again.');
      }).finally(() => setBusy(false));
    }}>
      {callback && !identity.user && !error && !sent && <p role="status" className="muted" style={{ margin: 0 }}>This link did not create a session. Request a new link to continue.</p>}
      <p style={{ margin: 0 }}>{sent ? `If delivery is available, a link is on its way to ${email.trim()}. Check spam too. Open it to finish signing in.` : 'Enter your email. We’ll send a secure sign-in link. Your first sign-in creates an account.'}</p>
      <label className="field"><span>Email address</span><input type="email" required maxLength={254} autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false); }} disabled={busy} /></label>
      {error && <p role="alert" style={{ margin: 0 }}>{error}</p>}
      <button className="btn primary" disabled={busy || seconds > 0}>{busy ? 'Sending…' : seconds ? `Request another link in ${seconds}s` : sent ? 'Send another link' : 'Email me a sign-in link'}</button>
      <p className="faint" style={{ margin: 0, fontSize: '.82rem' }}>Use the link once. No password needed. Guest assessments are imported only when you choose to copy them in Profile.</p>
    </form>}
    <Link className="btn glass press" style={{ marginTop: 16 }} to="/app">Continue as guest</Link>
  </main>;
}
