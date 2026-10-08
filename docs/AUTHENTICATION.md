# Authentication deployment

Fitzen uses Supabase Auth email magic links. First sign-in creates the Auth user; the athlete then saves the separate account profile. Local assessments remain available without signing in. Guest history is imported only through the explicit Profile action.

## Configure the provider

Use a new Fitzen Supabase project. Do not migrate the legacy live project. The project must be active before authentication can work.

1. For profiles, groups and result sync, apply `supabase/migrations/002_compete.sql`, then `003_audit_hardening.sql` and `004_auth_function_permissions.sql` to the new project. Authentication alone does not require these tables, but account onboarding does.
2. Enable Email authentication and signups in Supabase. Configure a production SMTP sender before inviting users; verify delivery and provider rate limits.
3. Set the Site URL to `https://fitzen-ai.vercel.app`. Allow redirects to `https://fitzen-ai.vercel.app/auth/callback`, `/profile` (older links), and `/consent` (guardian links). Add exact callback URLs for any other verified production aliases. For local QA allow `http://localhost:5174/auth/callback` and `/consent`. Preview links need their own allowed redirect URLs.
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

## Connected deployment (2026-10-09)

Project `rmaheshfcwbwspgujghe` is active on the Free plan in Tokyo (`ap-northeast-1`). Migrations 002/003/004 are applied. Production and preview environment variables use the enabled modern publishable key. The production Site URL and the five exact production/local redirects above are saved. Arbitrary preview redirects are not allowlisted. Vercel deployment `dpl_3GvNc9mcZiMoKdF5qYZwS2t3zjVf` is ready and its sign-in form is enabled. Custom SMTP is not configured; real email delivery and account onboarding have not yet been verified. All app tables have RLS; remaining security-advisor warnings describe the intentional authenticated RPC access ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).
