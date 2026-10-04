/**
 * Accounts (Supabase Auth, email magic link) and the signed-in user's profile row.
 * Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app stays local-only and `supabase` is null.
 * Schema and privacy rules: supabase/migrations/002_compete.sql.
 */
import { createClient, type User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// implicit flow: a magic link opened on another device (a parent's phone) still signs in; PKCE would need this browser.
export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'implicit', persistSession: true } }) : null;

/** Current user, kept in sync with sign-in / sign-out. */
export function useUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return user;
}

export const accessToken = async (): Promise<string | null> =>
  (await supabase?.auth.getSession())?.data.session?.access_token ?? null;

/** Row of public.profiles. */
export interface Account {
  id: string; display_name: string; birth_year: number; sex: 'male' | 'female' | null;
  city: string | null; state: string | null; country: string;
  public_boards: boolean; parent_email: string | null; parent_consent_at: string | null;
}

export const isMinor = (birthYear: number) => new Date().getFullYear() - birthYear < 18;

/** The signed-in user's profile row, or null when signed out / not created yet / accounts not configured. */
export async function getAccount(): Promise<Account | null> {
  if (!supabase) return null;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', s.session.user.id).maybeSingle();
  return (data as Account | null) ?? null;
}
