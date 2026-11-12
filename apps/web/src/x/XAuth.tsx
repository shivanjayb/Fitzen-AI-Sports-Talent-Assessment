import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { exerciseById, EXERCISES } from '@fitzen/engines';
import { FigureArt } from '../app/Figure';
import { supabase, useIdentity } from '../lib/supabase';
import { authDestination, callbackError, passwordAuth, requestSignIn } from '../lib/auth';
import { Icon, Marker } from './ui';
import { setSampleMode } from './sample';
import { authMessage, authProblem } from './authMessage';
import './xeyo.css';
import './auth.css';
import './fitzen.css';

const FIGURE = exerciseById('warrior-ii') ?? EXERCISES[0]!;

/** Xeyo-style sign-in: orange portrait card on top, "Welcome back." form below. Accounts are Supabase email + password. */
export default function XAuth() {
  const loc = useLocation();
  const navigate = useNavigate();
  const identity = useIdentity();
  const next = authDestination(new URLSearchParams(loc.search).get('next'));
  const [create, setCreate] = useState(new URLSearchParams(loc.search).get('mode') === 'create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [resend, setResend] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(() => callbackError(loc.search, loc.hash));

  useEffect(() => {
    document.documentElement.classList.add('x-root');
    return () => document.documentElement.classList.remove('x-root');
  }, []);
  useEffect(() => {
    // Supabase has already consumed the URL fragment by the time this route renders.
    if (loc.hash) window.history.replaceState(null, '', loc.pathname + loc.search);
    if (identity.ready && identity.user && !error) navigate(next, { replace: true });
  }, [identity.ready, identity.user, error, next, navigate, loc.hash, loc.pathname, loc.search]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setNotice(''); setResend(false);
    passwordAuth(supabase, email, password, create, location.origin, next)
      .then((r) => { if (r === 'confirm-email') { setNotice(`Check ${email.trim()} for a confirmation link, then sign in.`); setResend(true); } })
      .catch((err: unknown) => { setError(authMessage(err)); setResend(authProblem(err) === 'unconfirmed'); })
      .finally(() => setBusy(false));
  };
  const resendConfirmation = () => {
    setBusy(true); setError(null);
    const redirect = new URL('/auth/callback', location.origin);
    redirect.searchParams.set('next', next);
    supabase!.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: redirect.href } })
      .then(({ error: err }) => { if (err) throw err; setNotice(`Confirmation email sent again to ${email.trim()}. Check spam too.`); })
      .catch((err: unknown) => setError(authMessage(err, 'Could not resend the email.')))
      .finally(() => setBusy(false));
  };
  const forgot = () => {
    if (!email.trim()) { setError('Enter your email address first, then choose “Forgot password?”.'); return; }
    setBusy(true); setError(null);
    requestSignIn(supabase, email, location.origin, '/profile')
      .then(() => setNotice(`A sign-in link is on its way to ${email.trim()}. Set a new password in Profile after you sign in.`))
      .catch((err: unknown) => setError(authMessage(err, 'Could not send the link.')))
      .finally(() => setBusy(false));
  };

  return <div className="x x-auth">
    <header className="x-auth-top"><Link to="/" className="x-brand" style={{ textDecoration: 'none' }}><img className="x-logo" src="/brand/mark-64.png" alt="" width="30" height="30" /><span className="x-brand-name" translate="no">fit<b>zen</b></span></Link></header>
    <section className="x-auth-hero x-tile orange" aria-hidden>
      <div className="x-auth-figure"><FigureArt def={FIGURE} w={520} h={520} /></div>
      <div className="x-auth-panel">
        <p>A little more clarity.<br />A stronger you.</p>
        <ul><li>Live camera coaching</li><li>Offline video analysis</li><li>Verified reports</li></ul>
      </div>
    </section>
    <main className="x-auth-card x-card">
      <div className="x-auth-form">
        <div className="x-dialog-kicker" style={{ marginBottom: 6 }}><Marker />{create ? 'Create account' : 'Sign in'}</div>
        <h1>{create ? 'Welcome to Fitzen.' : 'Welcome back.'}</h1>
        <p className="x-auth-sub">{create ? 'Your sessions, reports and records, private to your account.' : 'Your training, measured clearly, starts here.'}</p>
        {!supabase ? <p className="x-empty" role="status">Online accounts are not configured in this build. You can still use every assessment on this device.</p>
          : <form onSubmit={submit} className="x-auth-fields">
            <label className="x-field"><span>Email address</span>
              <input type="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></label>
            <label className="x-field"><span>Password</span>
              <span className="x-auth-pw">
                <input type={show ? 'text' : 'password'} required minLength={8} maxLength={72} autoComplete={create ? 'new-password' : 'current-password'} placeholder={create ? 'At least 8 characters' : 'Your password'} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
                <button type="button" className="x-text-button" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}<span className="sr-only"> password</span></button>
              </span></label>
            {error && <p className="x-auth-error" role="alert">{error}</p>}
            {notice && <p className="x-auth-notice" role="status">{notice}</p>}
            {resend && email.trim() && <button type="button" className="x-text-button x-auth-resend" onClick={resendConfirmation} disabled={busy}>Resend confirmation email</button>}
            <button className="x-btn x-auth-submit" disabled={busy}>{busy ? 'Please wait…' : create ? 'Create account' : 'Sign in'}<Icon name="arrow" /></button>
          </form>}
        <div className="x-auth-links">
          <button className="x-text-button" onClick={() => { setCreate(!create); setError(null); setNotice(''); setResend(false); }}>{create ? 'I already have an account' : 'Create an account'}</button>
          {!create && supabase && <button className="x-text-button" onClick={forgot} disabled={busy}>Forgot password?</button>}
        </div>
        <div className="x-auth-guest">
          <Link className="x-btn ghost small" to="/home" onClick={() => setSampleMode(true)}>Explore the demo</Link>
          <Link className="x-btn ghost small" to="/train">Continue as guest</Link>
        </div>
      </div>
    </main>
  </div>;
}
