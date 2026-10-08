import type { SupabaseClient } from '@supabase/supabase-js';

/** Only known app routes may be a post-login destination. Never accept an external URL. */
export function authDestination(value: string | null): string {
  if (!value || !/^\/(app|profile|progress|history|compete|guided|validation|consent)(?:[?#]|$)/.test(value) || /[\\\r\n]/.test(value)) return '/profile';
  return value;
}

export function callbackError(search: string, hash: string): string | null {
  const params = [new URLSearchParams(search), new URLSearchParams(hash.replace(/^#/, ''))];
  const error = params.map((p) => p.get('error_code') || p.get('error')).find(Boolean);
  if (!error) return null;
  return error === 'otp_expired' || error === 'access_denied'
    ? 'This sign-in link has expired or has already been used. Request a new link below.'
    : 'We could not complete sign-in. Request a new link and try again.';
}

export async function requestSignIn(client: SupabaseClient | null, email: string, origin: string, next: string): Promise<void> {
  if (!client) throw new Error('Online accounts are not configured yet. You can continue training as a guest.');
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Enter a valid email address.');
  const redirect = new URL('/auth/callback', origin);
  redirect.searchParams.set('next', authDestination(next));
  const { error } = await client.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true, emailRedirectTo: redirect.href } });
  if (error) throw error;
}

export async function signOut(client: SupabaseClient | null): Promise<void> {
  if (!client) return;
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}
