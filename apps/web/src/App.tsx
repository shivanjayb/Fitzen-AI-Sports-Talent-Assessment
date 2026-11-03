import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import XShell from './x/XShell';
import Home from './app/Home';
import XHome from './x/Home';
import Landing from './app/Landing';
import { applyTheme, getTheme } from './app/theme';
import { useIdentity } from './lib/supabase';
import { syncHistory } from './app/store';
import { syncWellness } from './app/wellnessStore';
import { useLanguage } from './app/language';

// Assessments work locally. Optional accounts sync profiles and reports; video stays on-device.
const Session = lazy(() => import('./app/Session'));
const Results = lazy(() => import('./app/Results'));
const Coach = lazy(() => import('./app/Coach'));
const Admin = lazy(() => import('./app/Admin'));
const History = lazy(() => import('./app/History'));
const Progress = lazy(() => import('./app/Progress'));
const Compete = lazy(() => import('./app/Compete'));
const Consent = lazy(() => import('./app/Consent'));
const Validation = lazy(() => import('./app/Validation'));
const Guided = lazy(() => import('./app/Guided'));
const Auth = lazy(() => import('./app/Auth'));
const Dashboard = lazy(() => import('./app/Dashboard'));
const Exercise = lazy(() => import('./app/Exercise'));
const X = Object.fromEntries((['Train', 'Reports', 'Vitals', 'Sleep', 'Body', 'Nutrition', 'Journal', 'Labs', 'Profile', 'Integrations', 'Privacy'] as const)
  .map((k) => [k, lazy(() => import(`./x/${k}.tsx`))])) as Record<string, React.LazyExoticComponent<() => JSX.Element>>;

applyTheme(getTheme());

/** Every route change starts at the top (the browser keeps the old scroll otherwise). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const Loading = () => <div className="app"><div className="page"><div className="spinner" style={{ marginTop: '40vh' }} /></div></div>;

export default function App() {
  const identity = useIdentity();
  const language = useLanguage();
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    if (!identity.ready || !identity.user) return;
    const retry = () => { void syncHistory(); void syncWellness(); };
    retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [identity.ready, identity.user?.id]);
  if (!identity.ready) return <Loading />;
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<Loading />}>
          <Routes key={`${identity.user?.id ?? 'guest'}:${language}`}>
            <Route path="/" element={<Landing />} />
            <Route element={<XShell />}>
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<Auth />} />
              <Route path="/home" element={<XHome />} />
              {([['/train', 'Train'], ['/reports', 'Reports'], ['/vitals', 'Vitals'], ['/sleep', 'Sleep'], ['/body', 'Body'], ['/nutrition', 'Nutrition'], ['/journal', 'Journal'],
                ['/blood-records', 'Labs'], ['/profile', 'Profile'], ['/integrations', 'Integrations'], ['/privacy', 'Privacy']] as const).map(([path, k]) => { const C = X[k]!; return <Route key={path} path={path} element={<C />} />; })}
              <Route path="/recovery" element={<Navigate to="/vitals" replace />} />
              <Route path="/app" element={<Home />} />
              <Route path="/search" element={<Home search />} />
              <Route path="/exercise/:id" element={<Exercise />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/compete" element={<Compete />} />
              <Route path="/history" element={<History />} />
              <Route path="/validation" element={<Validation />} />
              <Route path="/guided" element={<Guided />} />
              <Route path="/results/:id" element={<Results />} />
              <Route path="/coach" element={<Coach />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/dashboard-old" element={<Dashboard />} />
            </Route>
            <Route path="/train/:id" element={<Session />} />
            <Route path="/consent" element={<Consent />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
