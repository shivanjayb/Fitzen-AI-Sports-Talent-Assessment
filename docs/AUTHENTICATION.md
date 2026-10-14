# Authentication deployment

Fitzen uses Supabase Auth with email + password or an email magic link (same account either way). First sign-in creates the Auth user; the athlete then saves the separate account profile. Local assessments remain available without signing in. Guest history is imported only through the explicit Profile action.

## Configure the provider

Use a new Fitzen Supabase project. Do not migrate the legacy live project. The project must be active before authentication can work.

1. For profiles, groups and result sync, apply `supabase/migrations/002_compete.sql`, then `003_audit_hardening.sql`, then `004_portals_sync.sql` (roles, cross-device sync, coach squads, API keys, admin) to the new project. Run `supabase/tests/run.sh` locally first. Authentication alone does not require these tables, but account onboarding does.
   - Make yourself the first admin once, in the SQL editor: `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');` (create your account profile in the app first). Admins then approve coaches at `/admin`.
2. Enable Email authentication and signups in Supabase, with "Confirm email" on (password sign-ups then confirm by link). Minimum password length 8. Configure a production SMTP sender before inviting users; verify delivery and provider rate limits.
3. Set the Site URL to `https://fitzen-ai.vercel.app`. Coaches use `/auth?next=/coach`; `/coach` and `/admin` are allowed return routes. Allow redirects to `https://fitzen-ai.vercel.app/auth/callback`, `/profile` (older links), and `/consent` (guardian links). Add exact callback URLs for any other verified production aliases. For local QA allow `http://localhost:5174/auth/callback` and `/consent`. Preview links need their own allowed redirect URLs.
4. In Vercel project `fitzen`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for production and preview, then redeploy. The existing `VITE_SUPABASE_ANON_KEY` is supported as a legacy fallback. Never use a service-role or secret key in a `VITE_` variable.

The implicit browser flow supports opening emailed links on a different device. Supabase consumes the one-use token, persists/refreshed sessions are handled by its SDK, and `/auth/callback` returns only to allowed Fitzen routes. Callback fragments are removed after SDK initialization. Tokens are never sent to hosted AI or stored in the service-worker cache.

## Verify before announcing sign-in as live

- New and returning users receive a link, sign in, and reach the intended page.
- Expired/reused links show recovery; request failures and resend cooldown are clear.
- Refresh restores the session; sign-out on this device and account switching isolate local histories.
- First account-profile creation and subsequent edits work with migration 003 column grants; failures offer retry instead of an endless spinner.
- Guest import remains explicit; pending sync/deletion retries work after reconnecting.
- Public sharing stays opt-in. Guardian email confirmation alone does not establish verified parental identity; complete that release requirement before public youth sharing.

Automated authentication tests cover redirects, email normalization, provider errors, sign-out scope, initial-session races and account namespace changes. They do not establish real email delivery or provider configuration.

## Coach API keys

Coaches create keys at `/coach` (shown once). Tools call `POST <VITE_SUPABASE_URL>/rest/v1/rpc/api_squad_report` with header `apikey: <publishable key>` and body `{"api_key": "fz_..."}`. Only the SHA-256 of a key is stored. Keys return the coach's squads, visible athletes (minors as initials, only after parent consent) and their last 90 days of sessions. Add rate limiting at the edge (Supabase or a proxy) before publishing the API widely.
