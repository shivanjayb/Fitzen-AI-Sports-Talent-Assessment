import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FitzenMark, IconBack, IconPeople, IconRings, IconRun, IconSearch, IconSparkle, IconHistory, IconChevron } from './icons';
import Assistant from './Assistant';
import { openAssistant } from './openAssistant';
import { getProfile, SYNCED } from './store';
import { useIdentity } from '../lib/supabase';
import { t } from './language';

const MAIN = [
  { to: '/home', label: 'Home', icon: <IconRings /> },
  { to: '/app', label: 'Train', icon: <IconRun /> },
  { to: '/history', label: 'History', icon: <IconHistory /> },
];
const MORE = [
  { label: 'Your health', links: [['/recovery', 'Recovery'], ['/vitals', 'Vitals'], ['/sleep', 'Sleep'], ['/body', 'Body'], ['/nutrition', 'Nutrition'], ['/journal', 'Journal'], ['/blood-records', 'Blood records']] },
  { label: 'Your training', links: [['/progress', 'Progress & goals'], ['/guided', 'Guided assessment'], ['/compete', 'Compete'], ['/validation', 'Coach validation']] },
  { label: 'Your account', links: [['/profile', 'Profile & settings'], ['/integrations', 'Data & connections'], ['/coach', 'Coach portal'], ['/admin', 'Admin portal']] },
];

export function PageHeader({ title, kicker, back, children }: { title: ReactNode; kicker?: ReactNode; back?: boolean; children?: ReactNode }) {
  const nav = useNavigate();
  return <header className="page-head"><div className="page-head-text">
    {back && <button className="back-link" onClick={() => (history.length > 1 ? nav(-1) : nav('/home'))}><IconBack />{t('Back')}</button>}
    <h1 className="large-title">{title}</h1>{kicker && <p className="subtitle">{kicker}</p>}
  </div>{children && <div className="head-actions">{children}</div>}</header>;
}

export default function Shell() {
  const loc = useLocation();
  const identity = useIdentity();
  const more = useRef<HTMLDetailsElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [, refresh] = useState(0);
  useEffect(() => {
    if (more.current) more.current.open = false;
    content.current?.focus({ preventScroll: true });
  }, [loc.pathname]);
  useEffect(() => {
    const connection = () => setOnline(navigator.onLine);
    const changed = () => refresh((n) => n + 1);
    window.addEventListener('online', connection); window.addEventListener('offline', connection); window.addEventListener(SYNCED, changed);
    const close = (e: PointerEvent) => { if (more.current && !more.current.contains(e.target as Node)) more.current.open = false; };
    document.addEventListener('pointerdown', close);
    return () => { window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener(SYNCED, changed); document.removeEventListener('pointerdown', close); };
  }, []);
  const initials = getProfile().name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'F';
  const secondary = !MAIN.some((x) => x.to === loc.pathname) && !/^\/(exercise|guided|search)/.test(loc.pathname);
  return <div className="app quiet-app">
    <a className="skip-link" href="#main-content">{t('Skip to content')}</a>
    <header className="quiet-top no-print">
      <Link to="/home" className="quiet-brand" translate="no"><FitzenMark size={28} /><span>fitzen<span className="brand-period">.</span></span></Link>
      <span className="quiet-purpose">{t('Your everyday performance')}</span>
      <div className="quiet-utilities">
        <Link to="/integrations" className="quiet-status"><i className={online ? 'online' : ''} />{t(!online ? 'Offline' : identity.user ? 'Account' : 'On this device')}</Link>
        <button className="head-btn press" onClick={() => openAssistant()} aria-label={t('Open local coach')}><IconSparkle /></button>
        <Link to="/profile" className="avatar press" aria-label={t('Profile')}>{initials}</Link>
      </div>
    </header>
    <nav className="quiet-nav no-print" aria-label={t('Main')}><div className="quiet-nav-inner">
      {MAIN.map((tab) => <NavLink key={tab.to} to={tab.to} className={({ isActive }) => isActive || (tab.to === '/app' && /^\/(exercise|guided|search)/.test(loc.pathname)) ? 'active' : ''}>{tab.icon}<span>{t(tab.label)}</span></NavLink>)}
      <NavLink to="/progress" className="desktop-destination"><IconRings /><span>{t('Progress')}</span></NavLink>
      <NavLink to="/compete" className="desktop-destination"><IconPeople /><span>{t('Compete')}</span></NavLink>
      <details ref={more} className={`quiet-more ${secondary ? 'selected' : ''}`} onKeyDown={(e) => { if (e.key === 'Escape' && more.current) { more.current.open = false; more.current.querySelector('summary')?.focus(); } }}>
        <summary><IconChevron /><span>{t('More')}</span></summary>
        <div className="quiet-menu">{MORE.map((group) => <section key={group.label}><h2>{t(group.label)}</h2>{group.links.map(([to, label]) => <NavLink key={to} to={to!}>{t(label!)}</NavLink>)}</section>)}</div>
      </details>
      <Link to="/search" className="quiet-search desktop-destination" aria-label={t('Search exercises')}><IconSearch /><span>{t('Search')}</span></Link>
    </div></nav>
    <div ref={content} id="main-content" tabIndex={-1}><Outlet /></div>
    <footer className="quiet-footer no-print"><span>{t('Built for every starting point.')}</span><span>{t('Camera processing stays on your device.')} <Link to="/integrations">{t('Your data')}</Link></span></footer>
    <Assistant />
  </div>;
}
