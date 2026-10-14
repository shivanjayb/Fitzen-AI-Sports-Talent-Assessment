import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FitzenMark, IconBack, IconPeople, IconRings, IconRun, IconSearch, IconSparkle } from './icons';
import Assistant from './Assistant';
import { openAssistant } from './openAssistant';
import { getProfile } from './store';
import { t as translate } from './language';

// Three tabs (Summary, Train, Compete) with search in its own glass button.
const TABS = [
  { to: '/progress', label: 'Summary', icon: <IconRings /> },
  { to: '/app', label: 'Train', icon: <IconRun /> },
  { to: '/compete', label: 'Compete', icon: <IconPeople /> },
];

/** Large-title header: optional kicker or back chevron, coach and profile buttons on the right. */
export function PageHeader({ title, kicker, back, children }: { title: ReactNode; kicker?: ReactNode; back?: boolean; children?: ReactNode }) {
  const nav = useNavigate();
  const name = getProfile().name.trim();
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'F';
  return (
    <header className="page-head">
      <div className="page-head-text">
        {back && <button className="back-link" onClick={() => (history.length > 1 ? nav(-1) : nav('/app'))}><IconBack />{translate('Back')}</button>}
        {kicker && <p className="subtitle">{kicker}</p>}
        <h1 className="large-title">{title}</h1>
      </div>
      <div className="head-actions">
        {children}
        <button className="head-btn glassy press" onClick={() => openAssistant()} aria-label="Open local coach"><IconSparkle /></button>
        <Link to="/profile" className="avatar press" aria-label="Profile">{initials}</Link>
      </div>
    </header>
  );
}

export default function Shell() {
  const loc = useLocation();
  const bar = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number; opacity: number }>({ left: 6, width: 0, opacity: 0 });
  useLayoutEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('a.active');
    setPill(el ? { left: el.offsetLeft, width: el.offsetWidth, opacity: 1 } : (p) => ({ ...p, opacity: 0 }));
  }, [loc.pathname]);
  return (
    <div className="app">
      <Link to="/" className="app-brand no-print" aria-label="Fitzen home" translate="no"><FitzenMark size={22} />FITZEN</Link>
      <Outlet />
      <div className="tabdock no-print">
        <nav ref={bar} className="tabbar glassy" aria-label="Main">
          <span className="tab-pill" style={pill} />
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive || (t.to === '/app' && /^\/(exercise|guided|validation)/.test(loc.pathname)) ? 'active' : '')}>
              {t.icon}<span>{translate(t.label)}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink to="/search" className={({ isActive }) => `tab-search glassy press ${isActive ? 'active' : ''}`} aria-label="Search exercises"><IconSearch /></NavLink>
      </div>
      <Assistant />
    </div>
  );
}
