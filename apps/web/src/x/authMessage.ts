/** Plain-language text for Supabase Auth failures. lib/auth.ts rethrows some errors as bare Error(message), so match code, status and message. */
export type AuthProblem = 'unconfirmed' | 'rate-limit' | 'offline' | null;

export function authProblem(err: unknown): AuthProblem {
  const e = (err ?? {}) as { code?: string; status?: number; message?: string; name?: string };
  const m = e.message ?? '';
  if (e.code === 'email_not_confirmed' || /email not confirmed/i.test(m)) return 'unconfirmed';
  if (e.status === 429 || /^over_.*rate_limit$/.test(e.code ?? '') || /rate limit|only request this after/i.test(m)) return 'rate-limit';
  if (e.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed/i.test(m)) return 'offline';
  return null;
}

export function authMessage(err: unknown, fallback = 'Could not sign in. Check your connection and try again.'): string {
  const wait = /after (\d+) seconds?/i.exec((err as { message?: string } | null)?.message ?? '')?.[1];
  switch (authProblem(err)) {
    case 'unconfirmed': return 'Confirm your email first: open the link we sent you, then sign in. No email? Resend it below.';
    case 'rate-limit': return wait ? `Too many attempts. Wait ${wait} seconds, then try again.` : 'Too many attempts. Wait a minute, then try again.';
    case 'offline': return 'You appear to be offline. Check your connection and try again.';
    default: return err instanceof Error && err.message ? err.message : fallback;
  }
}
