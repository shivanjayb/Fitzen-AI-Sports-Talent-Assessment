import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconHistory, IconTrain, IconTrophy, IconUser } from './icons';

const TABS = [
  { to: '/app', label: 'Train', icon: <IconTrain /> },
  { to: '/progress', label: 'Progress', icon: <IconTrophy /> },
  { to: '/history', label: 'History', icon: <IconHistory /> },
  { to: '/profile', label: 'Profile', icon: <IconUser /> },
];

export function Aurora() {
  return (<><div className="aurora" aria-hidden><i /><i /><i /><i /></div><div className="grain" aria-hidden /></>);
}

export default function Shell() {
  const loc = useLocation();
  const bar = useRef<HTMLElement>(null);
  const [pill, setPill] = useState({ left: 6, width: 0 });
  useLayoutEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('a.active');
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [loc.pathname]);
  return (
    <div className="app">
      <Aurora />
      <Outlet />
      <nav ref={bar} className="tabbar glass" aria-label="Main">
        <span className="tab-pill" style={pill} />
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/app'} className={({ isActive }) => (isActive ? 'active' : '')}>
            {t.icon}{t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
