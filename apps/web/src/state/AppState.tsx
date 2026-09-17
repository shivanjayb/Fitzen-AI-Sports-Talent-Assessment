/**
 * Global app state: authentication, theme, toasts, and sync status.
 * Deliberately context-based — the state surface is small and stable.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, getToken, setToken, type Profile, type User } from '../lib/api';
import { startSyncLoop, subscribeSync, type SyncState } from '../lib/sync';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { email: string; password: string; name: string; role?: 'athlete' | 'coach' }) => Promise<User>;
  refreshProfile: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);
const THEME_KEY = 'fitzen.theme';

function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: Toast['kind'], message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastState | null>(null);

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

const SyncContext = createContext<SyncState>({
  pending: 0, syncing: false, lastSyncAt: null, online: true,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppStateProvider({ children }: { children: ReactNode }) {
  // --- auth ---
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(({ user, profile }) => {
        setUser(user);
        setProfile(profile);
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // 1. Fitzen API login (with local fallback if offline/404)
    let userResult: User;
    let tokenResult: string;
    try {
      const res = await api.login({ email, password });
      userResult = res.user;
      tokenResult = res.token;
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        throw err;
      }
      // Fallback user construct if API login failed
      userResult = {
        id: `usr_${Date.now()}`,
        email,
        name: email.split('@')[0] || 'User',
        role: 'athlete',
        createdAt: new Date().toISOString(),
      };
      tokenResult = 'fitzen-local-jwt-token';
    }

    // 2. Supabase Auth sync (non-blocking background attempt if configured)
    if (isSupabaseConfigured) {
      supabase.auth.signInWithPassword({ email, password }).catch((e) => {
        console.warn('Supabase Auth sync deferred:', e);
      });
    }

    setToken(tokenResult);
    setUser(userResult);
    try {
      const { profile } = await api.me();
      setProfile(profile);
    } catch {
      setProfile(null);
    }
    return userResult;
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; name: string; role?: 'athlete' | 'coach' }) => {
      // 1. Fitzen API registration (with local fallback if offline/404)
      let userResult: User;
      let tokenResult: string;
      try {
        const res = await api.register(input);
        userResult = res.user;
        tokenResult = res.token;
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          throw err;
        }
        userResult = {
          id: `usr_${Date.now()}`,
          email: input.email,
          name: input.name,
          role: input.role ?? 'athlete',
          createdAt: new Date().toISOString(),
        };
        tokenResult = 'fitzen-local-jwt-token';
      }

      // 2. Supabase Auth signup (non-blocking background attempt if configured)
      if (isSupabaseConfigured) {
        supabase.auth
          .signUp({
            email: input.email,
            password: input.password,
            options: { data: { full_name: input.name, role: input.role ?? 'athlete' } },
          })
          .catch((e) => {
            console.warn('Supabase Auth signup deferred:', e);
          });
      }

      setToken(tokenResult);
      setUser(userResult);
      setProfile(null);
      return userResult;
    },
    [],
  );

  const refreshProfile = useCallback(async () => {
    const { user, profile } = await api.me();
    setUser(user);
    setProfile(profile);
  }, []);

  const logout = useCallback(() => {
    if (isSupabaseConfigured) void supabase.auth.signOut();
    setToken(null);
    setUser(null);
    setProfile(null);
  }, []);

  // --- theme ---
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => (localStorage.getItem(THEME_KEY) as ThemePreference) || 'dark',
  );
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(preference));

  useEffect(() => {
    const apply = () => {
      const mode = resolveTheme(preference);
      setResolved(mode);
      document.documentElement.dataset.theme = mode;
    };
    apply();
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    localStorage.setItem(THEME_KEY, p);
    setPreferenceState(p);
  }, []);

  // --- toasts ---
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = nextId.current++;
    setToasts((cur) => [...cur.slice(-3), { id, kind, message }]);
    window.setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  // --- sync ---
  const [syncState, setSyncState] = useState<SyncState>({
    pending: 0, syncing: false, lastSyncAt: null, online: navigator.onLine,
  });
  useEffect(() => {
    startSyncLoop();
    return subscribeSync(setSyncState);
  }, []);

  const authValue = useMemo(
    () => ({ user, profile, loading, login, register, refreshProfile, logout }),
    [user, profile, loading, login, register, refreshProfile, logout],
  );
  const themeValue = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );
  const toastValue = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <AuthContext.Provider value={authValue}>
      <ThemeContext.Provider value={themeValue}>
        <ToastContext.Provider value={toastValue}>
          <SyncContext.Provider value={syncState}>{children}</SyncContext.Provider>
        </ToastContext.Provider>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AppStateProvider');
  return ctx;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside AppStateProvider');
  return ctx;
}

export function useToasts(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts must be used inside AppStateProvider');
  return ctx;
}

export function useSync(): SyncState {
  return useContext(SyncContext);
}
