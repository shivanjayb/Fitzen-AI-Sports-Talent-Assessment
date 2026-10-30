# Quiet Performance application integration

Branch: `codex/quiet-performance-integration` (2026-10-30). The original HTML concept remains in this directory, unchanged. Application entry: `/home`; Train remains `/app`; existing URLs stay supported.

## Connected application behavior

- Shared responsive shell, system typography, warm canvas/graphite/ember colors, light default with retained dark preference, keyboard navigation and four phone destinations: Home, Train, History, More.
- Home reads account-scoped saved assessment reports and dated wellness records. Missing signals remain empty; demos never populate performance trends. Comparisons use the same exercise, metric, recorded protocol and engine version, with standard-depth repetitions.
- Train searches all 90 real exercise definitions. Exercise pages retain camera, local video, synthetic demo, lesson, setup, personal-range and measurement actions. Global and exercise-specific history link to the actual saved report and chart series. The incorrect bodyweight-squat barbell photo is replaced by the existing equipment-correct drawn demonstrator.
- Existing Results, Progress/goals, Profile, authentication, groups/competition, local coach and Coach/Admin access continue using their existing services. Reports add a compatible previous-assessment comparison and exercise-history link.
- Recovery uses recorded post-session readiness inputs. Sleep, vitals, body, meals, journal and lab records have real dated manual entry, validation, edit, remove/undo, period filtering and measured-value graphs. Nutrition charts aggregate logged meals by day; lab comparisons separate test names and units. Body weight updates the assessment profile only on explicit opt-in.
- Guest wellness records persist locally. Account wellness records have their own private offline queue, account-switch guards, deletion tombstones, stale-write protection, retry, CSV/JSON export and integration with account-data removal. Guest records never import silently.

## Backend setup boundary

The application continues to use Supabase Auth/PostgREST for the existing account path. The separate legacy Node API is not substituted for it. New wellness cloud sync requires `supabase/migrations/007_wellness_records.sql` on an approved staging database before account-to-account-device testing. This branch does **not** apply it to the live project. If it is missing, records remain local and the UI explains setup is needed.

Wearable OAuth, hosted AI, speech services, automatic lab/file imports and generated portraits from the HTML simulation are not implemented services. Connections says so explicitly. Manual records and existing on-device coaching are functional; no fake credentials, fixture health data or simulated OAuth successes are shipped into the application.

## Verification

- Production web build and TypeScript pass.
- Web tests: 34 pass, including eight wellness validation/persistence/account-isolation/queue tests.
- Server tests: 34 pass (temporary localhost listener permission required).
- New migration 007 executed successfully in an isolated PGlite PostgreSQL runtime with the existing auth stub; wellness SQL assertions passed for value constraints, owner-only RLS, anonymous rejection, stale updates, deletion tombstones and auth-user cascade. The full migration sequence and live Supabase behavior are not certified by this focused check.
- Existing engine suite: 219/221 pass, two failures in realism and ground-truth accuracy, plus three worker reporting timeouts. No engine source changes in this integration. These are unresolved release limitations, not a green application-wide gate.
- Browser: Home desktop and phone, Train search, exercise detail/demo to stored Results, demo excluded from History/performance, sleep create/reload/dashboard update, manual record edit/remove/undo, navigation and narrow-width checks. Camera hardware, real-user cloud sign-in/cross-device delivery, wearable APIs and real-athlete accuracy remain unverified.

Use `npm run dev -w @fitzen/web -- --port 5184 --host 127.0.0.1` from this branch for an isolated local review. No deployment or live database writes were performed.
