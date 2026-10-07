/**
 * Accounts (Supabase Auth, email magic link) and the signed-in user's profile row.
 * Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app stays local-only and `supabase` is null.
 * Schema and privacy rules: supabase/migrations/002_compete.sql.
 */
import { createClient, type User } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// implicit flow: a magic link opened on another device (a parent's phone) still signs in; PKCE would need this browser.
export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'implicit', persistSession: true } }) : null;

/** Current user, kept in sync with sign-in / sign-out. */
let identity: { ready: boolean; user: User | null } = { ready: !supabase, user: null };
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const updateIdentity = (user: User | null) => {
  identity = { ready: true, user };
  listeners.forEach((f) => f());
};
if (supabase) {
  let revision = 0;
  supabase.auth.onAuthStateChange((_e, s) => { revision++; updateIdentity(s?.user ?? null); });
  const initial = revision;
  void supabase.auth.getSession().then(({ data }) => {
    if (revision === initial) updateIdentity(data.session?.user ?? null);
  }, () => { if (revision === initial) updateIdentity(null); });
}
export const storageOwner = () => identity.user?.id ?? 'guest';
export const useIdentity = () => useSyncExternalStore(subscribe, () => identity);
export const useUser = (): User | null => useIdentity().user;

export const accessToken = async (): Promise<string | null> =>
  (await supabase?.auth.getSession())?.data.session?.access_token ?? null;

/** Row of public.profiles. */
export interface Account {
  id: string; display_name: string; birth_year: number; sex: 'male' | 'female' | null;
  city: string | null; state: string | null; country: string;
  public_boards: boolean; parent_email: string | null; parent_consent_at: string | null;
}

// With year-only data adulthood is not established until the entire eighteenth-birthday year has passed.
export const isMinor = (birthYear: number) => !Number.isInteger(birthYear) || new Date().getFullYear() - birthYear <= 18;

/** The signed-in user's profile row, or null when signed out / not created yet / accounts not configured. */
export async function getAccount(): Promise<Account | null> {
  if (!supabase) return null;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', s.session.user.id).maybeSingle();
  return (data as Account | null) ?? null;
}
