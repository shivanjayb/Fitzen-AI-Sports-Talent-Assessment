import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, useUser } from '../lib/supabase';
import { Aurora } from './Shell';

/** /consent?child=<uuid>: a parent confirms, from their own email, that their under-18 child may appear on public boards. */
export default function Consent() {
  const child = new URLSearchParams(location.search).get('child') ?? '';
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(child);
  const user = useUser();
  const [checked, setChecked] = useState(false); // session restored from storage or from the magic-link URL
  const [req, setReq] = useState<{ display_name: string; birth_year: number; consented: boolean } | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void supabase?.auth.getSession().then(() => setChecked(true)); }, []);
  useEffect(() => {
    if (!user || !valid) return;
    let live = true;
    setReq(undefined);
    void supabase!.rpc('consent_request', { child }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setMsg(error.message); setReq(null); } else setReq((data as NonNullable<typeof req>[] | null)?.[0] ?? null);
    });
    return () => { live = false; };
  }, [user?.id, child, valid]);

  const run = async (f: () => Promise<string>) => {
    setBusy(true); setMsg('');
    try { setMsg(await f()); } catch (e) { setMsg((e as { message?: string })?.message || 'Something went wrong. Check your connection and try again.'); }
    setBusy(false);
  };

  let body: React.ReactNode;
  if (!supabase) body = <p>Accounts aren't switched on yet, so there is nothing to confirm.</p>;
  else if (!valid) body = <p>This link is incomplete. Ask your child to send the consent link again from their Fitzen profile.</p>;
  else if (!checked) body = <div className="spinner" aria-label="Checking sign-in" />;
  else if (!user) body = (
    <form style={{ display: 'grid', gap: 12 }} onSubmit={(e) => { e.preventDefault(); void run(async () => {
      const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: location.href } });
      if (error) throw error;
      return `Check ${email.trim()} and open the link there to continue.`;
    }); }}>
      <p style={{ margin: 0 }}>Your child asked for your permission to appear on Fitzen's public leaderboards. To confirm it is really you, sign in with the email address your child entered. We email you a link; no password.</p>
      <label className="field"><span>Your email</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
    </form>
  );
  else if (req === undefined) body = <div className="spinner" aria-label="Loading request" />;
  else if (!req) body = (<>
    <p>We couldn't find a request for <b>{user.email}</b>. The link only works for the parent email your child entered in Fitzen, and a child can't confirm for themselves.</p>
    <p className="muted">If you signed in with a different email, sign out and open the link again from the right inbox.</p>
    <button className="btn glass press" onClick={() => void supabase!.auth.signOut()}>Sign out</button>
  </>);
  else if (req.consented) body = <>
    <p>You confirmed public leaderboard sharing for <b>{req.display_name}</b>. <Link to="/">Open Fitzen</Link></p>
    <button className="btn danger" disabled={busy} onClick={() => run(async () => {
      const { data, error } = await supabase!.rpc('revoke_parent_consent', { child });
      if (error) throw error;
      if (!data) return 'The request changed; reload this page.';
      setReq({ ...req, consented: false });
      return 'Public sharing consent revoked.';
    })}>Withdraw public sharing consent</button>
  </>;
  else body = (<>
    <p style={{ marginTop: 0 }}><b>{req.display_name}</b> (born {req.birth_year}) wants to appear on Fitzen's public leaderboards.</p>
    <ul style={{ paddingLeft: 18, lineHeight: 1.55 }}>
      <li>Others see only their <b>initials</b>, their best score and form score per exercise, and where they rank in their city, state, country and the world. Never their full name, email, age, photos or video.</li>
      <li>Video never leaves their phone. Fitzen stores only the exercise, the headline number, a form score and the date.</li>
      <li>Return to this link to withdraw public sharing consent yourself. This permission is only for public leaderboards, not for AI processing.</li>
      <li>Email sign-in verifies control of this mailbox. It does not independently verify adulthood or guardian status; further verification is required before a public youth release.</li>
    </ul>
    <button className="btn primary block" disabled={busy} onClick={() => run(async () => {
      const { data, error } = await supabase!.rpc('give_parent_consent', { child });
      if (error) throw error;
      if (!data) return 'This could not be confirmed. The request may have changed; ask your child to send a new link.';
      setReq({ ...req, consented: true });
      return 'Confirmed.';
    })}>I am the parent or guardian and I agree</button>
  </>);

  return (
    <div className="app">
      <Aurora />
      <main className="page" style={{ maxWidth: 560 }}>
        <p className="subtitle">Fitzen</p>
        <h1 className="large-title">Parent consent</h1>
        <section className="glass panel" style={{ marginTop: 18 }}>
          {body}
          {msg && <p role="status" aria-live="polite" className="muted" style={{ marginBottom: 0 }}>{msg}</p>}
        </section>
      </main>
    </div>
  );
}
