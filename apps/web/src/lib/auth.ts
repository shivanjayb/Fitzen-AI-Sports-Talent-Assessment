import type { SupabaseClient } from '@supabase/supabase-js';

/** Only known app routes may be a post-login destination. Never accept an external URL. */
export function authDestination(value: string | null): string {
  if (!value || !/^\/(app|profile|progress|history|compete|guided|validation|consent|coach|admin)(?:[?#]|$)/.test(value) || /[\\\r\n]/.test(value)) return '/profile';
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

const checkEmail = (email: string) => {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
};

export async function requestSignIn(client: SupabaseClient | null, email: string, origin: string, next: string): Promise<void> {
  if (!client) throw new Error('Online accounts are not configured yet. You can continue training as a guest.');
  const normalized = checkEmail(email);
  const redirect = new URL('/auth/callback', origin);
  redirect.searchParams.set('next', authDestination(next));
  const { error } = await client.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true, emailRedirectTo: redirect.href } });
  if (error) throw error;
}

/** Email + password, alongside the magic link. create = true makes the account (Supabase emails a confirmation link). */
export async function passwordAuth(client: SupabaseClient | null, email: string, password: string, create: boolean, origin: string, next: string): Promise<'signed-in' | 'confirm-email'> {
  if (!client) throw new Error('Online accounts are not configured yet. You can continue training as a guest.');
  const normalized = checkEmail(email);
  if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
  if (!create) {
    const { error } = await client.auth.signInWithPassword({ email: normalized, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password. Forgot it? Use an email link instead, then set a new password in Profile.' : error.message);
    return 'signed-in';
  }
  const redirect = new URL('/auth/callback', origin);
  redirect.searchParams.set('next', authDestination(next));
  const { data, error } = await client.auth.signUp({ email: normalized, password, options: { emailRedirectTo: redirect.href } });
  if (error) throw error;
  // Supabase answers an existing address with a placeholder user (no identities) and sends no email.
  if (data.user && data.user.identities?.length === 0) throw new Error('This email already has a Fitzen account. Tap Sign in, or use Email link if you never set a password.');
  return data.session ? 'signed-in' : 'confirm-email';
}

/** Set or change the password of the signed-in account (e.g. after signing in with an email link). */
export async function setPassword(client: SupabaseClient | null, password: string): Promise<void> {
  if (!client) return;
  if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut(client: SupabaseClient | null): Promise<void> {
  if (!client) return;
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}
