import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Assistant from '../app/Assistant';
import { openAssistant } from '../app/openAssistant';
import { getProfile, syncHistory } from '../app/store';
import { syncWellness } from '../app/wellnessStore';
import { supabase, useIdentity } from '../lib/supabase';
import { signOut } from '../lib/auth';
import { ExploreProvider, Icon, Toast, toast, type IconName } from './ui';
import { setSampleMode, useSampleMode } from './sample';
import './xeyo.css';
import './legacy.css';
import './fitzen.css';

const NAV: Array<{ to: string; label: string; icon: IconName; also?: RegExp } | 'sep'> = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/train', label: 'Train', icon: 'train', also: /^\/(app|exercise|search|guided)/ },
  { to: '/reports', label: 'Reports', icon: 'reports', also: /^\/(history|results|progress|compete)/ },
  'sep',
  { to: '/vitals', label: 'Vitals', icon: 'vitals' },
  { to: '/body', label: 'Body', icon: 'body' },
  { to: '/nutrition', label: 'Nutrition', icon: 'nutrition' },
  { to: '/journal', label: 'Journal', icon: 'journal' },
  { to: '/sleep', label: 'Sleep', icon: 'sleep' },
  { to: '/blood-records', label: 'Blood records', icon: 'labs' },
];

const HEALTH = /^\/(vitals|body|nutrition|journal|sleep|blood-records|integrations)/;
const TABS: Array<{ to: string; label: string; icon: IconName; match: RegExp }> = [
  { to: '/home', label: 'Home', icon: 'home', match: /^\/home/ },
  { to: '/train', label: 'Train', icon: 'train', match: /^\/(train|app|exercise|search|guided)/ },
  { to: '/reports', label: 'Reports', icon: 'reports', match: /^\/(reports|history|results|progress|compete)/ },
  { to: '/vitals', label: 'Health', icon: 'heart', match: HEALTH },
  { to: '/profile', label: 'Profile', icon: 'user', match: /^\/(profile|privacy|coach|admin)/ },
];

/** Home listens for this to enter dashboard edit mode. */
export const CUSTOMIZE_EVENT = 'fitzen:customize';
const stamp = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function XShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const identity = useIdentity();
  const sample = useSampleMode();
  const menu = useRef<HTMLDetailsElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [updated, setUpdated] = useState(stamp);
  const [ask, setAsk] = useState('');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('x-root');
    return () => document.documentElement.classList.remove('x-root');
  }, []);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [loc.pathname]);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && menu.current?.open) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, []);

  const refresh = async () => {
    setSyncing(true);
    try { await Promise.all([syncHistory(), syncWellness()]); } catch { /* offline: keep local records */ }
    setSyncing(false); setUpdated(stamp());
    toast(identity.user ? 'Saved records refreshed. Manage sources to connect a wearable.' : 'Records on this device refreshed. Sign in to sync them.');
  };
  const name = getProfile().name.trim() || identity.user?.email?.split('@')[0] || 'Guest';
  const isHome = loc.pathname === '/home';

  return <div className="x">
    <div className="x-frame" data-section={HEALTH.test(loc.pathname) ? 'health' : undefined}>
      <header className="x-topbar">
        <Link to="/home" className="x-brand" aria-label="Fitzen — home" style={{ textDecoration: 'none' }}>
          <span className="x-orb" aria-hidden /><span className="x-brand-name" translate="no">Fitzen</span>
        </Link>
        <nav ref={navRef} className="x-nav" aria-label="Sections">
          {NAV.map((n, k) => n === 'sep' ? <span key={k} className="x-nav-sep" aria-hidden />
            : <NavLink key={n.to} to={n.to} title={n.label} data-main={k < 3 ? '' : undefined} aria-current={loc.pathname === n.to || n.also?.test(loc.pathname) ? 'page' : undefined}>
              <Icon name={n.icon} /><span>{n.label}</span>
            </NavLink>)}
        </nav>
        <div className="x-topbar-end">
          {sample && <span className="x-demo-pill" role="status" title="You’re exploring made-up wellness readings. Your training sessions and reports are real.">
            <b>Sample data</b><span className="sr-only">. Wellness readings are made up until a wearable is connected.</span>
            <button className="x-text-button" style={{ fontSize: 12 }} onClick={() => { setSampleMode(false); toast('Sample data hidden. Your own records are shown.'); }}>Exit</button>
          </span>}
          <form className="x-ask" role="search" onSubmit={(e) => { e.preventDefault(); openAssistant({ kind: 'help' }, ask.trim() || undefined); setAsk(''); }}>
            <Icon name="search" />
            <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask Fitzen about any metric…" aria-label="Ask Fitzen about your training and health" autoComplete="off" maxLength={4000} />
          </form>
          {isHome && <button className="x-icon-btn" aria-label="Customize your dashboard" onClick={() => window.dispatchEvent(new Event(CUSTOMIZE_EVENT))}><Icon name="pencil" /></button>}
          <button className={`x-icon-btn${syncing ? ' is-syncing' : ''}`} aria-label="Refresh data" title={`Records updated ${updated}`} disabled={syncing} onClick={refresh}><Icon name="refresh" /></button>
          <span className="sr-only" role="status">{syncing ? 'Updating your data…' : `Records updated ${updated}`}</span>
          <details ref={menu} className="x-menu">
            <summary className="x-icon-btn" aria-label="Account menu"><Icon name="menu" /></summary>
            <div className="x-popover">
              <div className="who"><span className="x-avatar">{name[0]!.toUpperCase()}</span><span style={{ minWidth: 0 }}><b>{name}</b><small>{identity.user?.email ?? 'Saved on this device'}</small></span></div>
              <Link to="/profile"><Icon name="user" />Profile</Link>
              <Link to="/integrations"><Icon name="link" />Integrations</Link>
              <Link to="/privacy"><Icon name="shield" />Privacy &amp; data</Link>
              {identity.user
                ? <button className="x-signout" onClick={async () => { await signOut(supabase); nav('/home'); toast('Signed out.'); }}><Icon name="signout" />Sign out</button>
                : <Link to="/auth" className="x-signout"><Icon name="signout" />Sign in</Link>}
            </div>
          </details>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} style={{ outline: 0, flex: 1 }}>
        {!online && <div className="fz-offline" role="status"><i aria-hidden />Offline. Assessments and reports still work on this device; syncing resumes when you reconnect.</div>}
        <ExploreProvider><div key={loc.pathname} className="fz-view"><Outlet /></div></ExploreProvider>
      </main>
      <nav className="fz-tabs" aria-label="Main">
        {TABS.map((x) => <Link key={x.to} to={x.to} aria-current={x.match.test(loc.pathname) ? 'page' : undefined}><Icon name={x.icon} /><span>{x.label}</span></Link>)}
      </nav>
    </div>
    <Toast />
    <Assistant />
  </div>;
}
