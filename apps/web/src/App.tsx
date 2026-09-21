import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppStateProvider, useAuth } from './state/AppState';
import { ErrorBoundary } from './components/ErrorBoundary';

const AuthPage = lazy(() => import('./pages/Auth'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const AssessPage = lazy(() => import('./pages/Assess'));
const HistoryPage = lazy(() => import('./pages/History'));
const LeaderboardPage = lazy(() => import('./pages/Leaderboard'));
const BadgesPage = lazy(() => import('./pages/Badges'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const TeamPage = lazy(() => import('./pages/Team'));

function PageLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0c0e12',
        color: '#f2f4f8',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        gap: '1rem',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#94a3b8' }}>Loading Fitzen...</span>
    </div>
  );
}

function Protected({ children, roles }: { children: ReactNode; roles?: Array<'athlete' | 'coach' | 'admin'> }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <PageLoader />;
  }
  if (!user) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <AuthPage />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
              <Route path="/assess" element={<Protected roles={['athlete']}><AssessPage /></Protected>} />
              <Route path="/history" element={<Protected roles={['athlete']}><HistoryPage /></Protected>} />
              <Route path="/leaderboard" element={<Protected><LeaderboardPage /></Protected>} />
              <Route path="/badges" element={<Protected roles={['athlete']}><BadgesPage /></Protected>} />
              <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
              <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
              <Route path="/team" element={<Protected roles={['coach', 'admin']}><TeamPage /></Protected>} />
              <Route path="/team/:athleteId" element={<Protected roles={['coach', 'admin']}><TeamPage /></Protected>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppStateProvider>
    </ErrorBoundary>
  );
}
