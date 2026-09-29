import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import Shell, { Aurora } from './app/Shell';
import Home from './app/Home';
import Landing from './app/Landing';
import { applyTheme, getTheme } from './app/Profile';

// Email/password auth is removed for now (the old Auth/Dashboard pages remain in
// src/pages for when it returns). Everything below runs locally with no account.
const Session = lazy(() => import('./app/Session'));
const Results = lazy(() => import('./app/Results'));
const History = lazy(() => import('./app/History'));
const Profile = lazy(() => import('./app/Profile'));

applyTheme(getTheme());

/** Every route change starts at the top (the browser keeps the old scroll otherwise). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const Loading = () => <div className="app"><Aurora /><div className="page"><div className="spinner" style={{ marginTop: '40vh' }} /></div></div>;

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route element={<Shell />}>
              <Route path="/app" element={<Home />} />
              <Route path="/history" element={<History />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/results/:id" element={<Results />} />
            </Route>
            <Route path="/train/:id" element={<Session />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
