import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import Shell, { Aurora } from './app/Shell';
import Home from './app/Home';
import Landing from './app/Landing';
import { applyTheme, getTheme } from './app/theme';
import { useIdentity } from './lib/supabase';
import { syncHistory } from './app/store';
import { useLanguage } from './app/language';

// Sessions stay on this device. Optional accounts (Supabase magic link, src/lib/supabase.ts) add leaderboards and groups.
const Session = lazy(() => import('./app/Session'));
const Results = lazy(() => import('./app/Results'));
const History = lazy(() => import('./app/History'));
const Profile = lazy(() => import('./app/Profile'));
const Progress = lazy(() => import('./app/Progress'));
const Compete = lazy(() => import('./app/Compete'));
const Consent = lazy(() => import('./app/Consent'));
const Validation = lazy(() => import('./app/Validation'));
const Guided = lazy(() => import('./app/Guided'));

applyTheme(getTheme());

/** Every route change starts at the top (the browser keeps the old scroll otherwise). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const Loading = () => <div className="app"><Aurora /><div className="page"><div className="spinner" style={{ marginTop: '40vh' }} /></div></div>;

export default function App() {
  const identity = useIdentity();
  const language = useLanguage();
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    if (!identity.ready || !identity.user) return;
    const retry = () => { void syncHistory(); };
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
            <Route element={<Shell />}>
              <Route path="/app" element={<Home />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/compete" element={<Compete />} />
              <Route path="/history" element={<History />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/validation" element={<Validation />} />
              <Route path="/guided" element={<Guided />} />
              <Route path="/results/:id" element={<Results />} />
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
