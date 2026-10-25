# Fitzen: persistent project context

Saved 2026-10-25 after a source walkthrough on `main` at `e955929`. This is a recall map, not a claim that every line or deployed service has been verified. Read `PROJECT_STATE.md` first for current status and the latest Log; recheck source before changing behavior.

## Why this file exists

The owner asked Codex to understand the project and remember it across sessions (2026-10-25). Keep useful context in this repository, alongside the existing shared handoff, so it survives chat resets and is available to other accounts. This does not depend on model memory or a hosted memory service. Update this map when architecture changes; keep historical decisions in the shared Log.

## Purpose and boundaries

Fitzen is a final-year CSD project at K. K. Wagh Institute, Nashik, responding to SIH25073: accessible sports talent assessment for young athletes, especially those with only a phone and no coach. It is not an official or endorsed SAI product. The intended experience is: choose an exercise, position the camera, perform it, receive measured feedback, and understand how to improve.

Core commitments from `PROJECT_STATE.md` and the project instructions:

- Pose inference and video processing stay on the device. Optional accounts sync structured profiles and reports, never video.
- Local assessment requires no account. Offline camera inference requires the model/WASM assets to have been prepared first.
- Numbers are screening estimates. Synthetic accuracy tests do not establish real-athlete accuracy or talent-selection validity.
- Practice personalization and standard assessment must stay distinguishable; public scores use catalog-standard rep targets.
- Never fabricate users, endorsements, validation results or official protocol equivalence.
- Never write to live Supabase, handle credentials, deploy to production or rewrite history without the required authorization. Follow the current project instructions if these rules change.
- Use the smallest justified implementation. Retain validation, error handling, privacy and accessibility.

## Architecture to recall

TypeScript npm-workspaces monorepo, Node >=22.5. Three workspaces: `packages/engines`, `apps/web`, `apps/server`. Root scripts build engines before consumers.

| Area | Actual responsibility and entry points |
|---|---|
| Exercise definitions | `packages/engines/src/motion/types.ts` defines `ExerciseDef`: camera view, angles, phase-specific checks, bands, cues, and rep/hold/event rules. `catalog/index.ts` combines gym, calisthenics, sport and wellness definitions into 90 exercises across eight categories. |
| Shared motion engine | `motion/engine.ts`: `MotionSession.push(frame, aspect)` produces live state; `finish()` produces `SessionReport`. Shared behavior interprets exercise data. |
| Capture | `apps/web/src/pose/poseSource.ts`: cancellable camera and local-video sources, MediaPipe Pose Landmarker, 33 landmarks, GPU -> CPU fallback, lite/full/heavy models. |
| Session orchestration | `apps/web/src/app/Session.tsx`: framing -> countdown -> active -> report; owns source cleanup, overlays, voice/haptics and saving. Camera, local video and synthetic demo converge here. |
| Persistence | `apps/web/src/app/store.ts`: account-scoped localStorage, 60 retained reports, volatile fallback if storage fails, cloud backup, pending retries/deletions, explicit guest import, goals, readiness and reference measurements. |
| Current cloud path | Web uses Supabase Auth/PostgREST directly (`src/lib/supabase.ts`, `lib/auth.ts`). SQL migrations 002-006 implement account/privacy policies, rankings, portals, sync and owner-admin bootstrap. |
| Separate server | `apps/server` retains JWT/password auth, signed-assessment ingestion/verification, statistics, badges and potential scoring. Current web assessment does not call this server. Its `db.ts` uses Supabase, with in-memory test tables; old SQLite architecture text is historical. |
| Athlete guidance | `engines/src/athlete`: BMI/body and diet guidance, maturity estimates, protocol-limited reference comparisons, readiness, experimental jump projection and future actions. Local coach: `app/assistantContext.ts`. |
| PWA and language | `offline-sw.js` caches the app shell and allowlisted pose assets; photos cache on use. `language.ts` loads English/Hindi/Marathi/Tamil/Telugu; untranslated strings fall back to English. |

## Measurement flow and evidence

Live camera: local frames -> MediaPipe -> aspect-corrected 2D geometry -> adaptive One Euro filtering -> framing/visibility/foreshortening checks -> rep state machine, hold timers or event detection -> live zones and final report. Tracking loss breaks continuous attempts; missing evidence must produce unassessed/N/A output rather than a confident grade.

Uploaded video: local container inspection -> seek-based pose extraction -> raw-landmark integrity checks -> zero-phase Butterworth filtering -> a second `MotionSession` pass without causal smoothing. Jump filtering uses 10 Hz; other clips use 6 Hz. Upload limits are 100 MB and 120 seconds. Here “upload” means selecting a local file, not sending the clip to a server.

The active motion engine fits raw airborne **toe** positions to recover flight time and calculates vertical jump height with `h = g*T^2/8`. It suppresses height for horizontal jumps and raised landings. The older standalone `jump/jumpAnalyzer.ts` is a separate estimator; do not conflate its hip-trajectory/fusion description with the current motion path.

Reports include tracking coverage and validity metadata, scored checks, joint statistics, reps/tempo/range/fatigue, holds or events, form grade, insights and a downsampled chart. `isAssessedReport()` gates useful evidence; `isEligibleSession()` additionally excludes demos and specified integrity/forensics failures.

Wrong-movement screening compares observed movement signatures against the exercise's synthetic reference. `integrity.ts` checks physical/temporal plausibility; `forensics.ts` inspects MP4/WebM metadata and declarations. `verdictOf()` combines these into genuine/review/suspect. These verdicts are screening signals, not proof of authenticity.

`personalize.ts` adjusts practice depth/hold targets from body context, experience and usual depth after enough history, with limits. Alignment/release rules stay protected. Guided battery capture bypasses personalization; `standardReps()` recounts catalog-target reps for rankings.

## Athlete, coach and admin flows

- `App.tsx` maps routes. Landing -> Train (`/app`, `/search`) -> exercise detail -> `/train/:id` -> `/results/:id`; Summary is `/progress`. History, Profile, guided assessment and validation are separate screens.
- `battery.ts` defines four guided tests: countermovement jump, bodyweight squat, push-up and plank. A battery-run ID connects reports. This is a local screening battery, not an official SAI assessment.
- `Validation.tsx` pairs eligible attempts with reference measurements and exports CSV; descriptive bias/RMSE/limits of agreement are grouped by protocol, reference method and unit. These pilot statistics do not establish clinical validity.
- Auth supports password or email links with recovery and safe return routes. Provider absence leaves the app local. Guest data does not automatically become another account's data.
- `store.ts` uploads eligible headline scores to `results` and non-demo full reports to `sessions`. Profile edits use dirty flags/timestamps; session pulls union by identity; local hiding and delete-everywhere have different semantics. Account switches are checked around async writes.
- Compete uses Supabase RPC rankings by group/city/state/country/world, with performance or form sorting. Visibility/consent is enforced by database policies/functions, not just UI.
- `/coach`: adult coach application, admin approval, owned squads/invite codes, permitted athlete reports, verdict evidence and revocable API keys. Keys are shown once and stored hashed. `/admin`: analytics, coach approval and role management.
- Hosted coaching is disabled: `api/ai.ts` returns 503. The UI coach provides deterministic local advice; do not infer that an external LLM powers the current athlete flow.

## What is established versus still open

The repository contains a substantial working prototype and synthetic/reference regression tests. Independent phone-camera calibration, paired real-athlete ground truth, protocol-matched norms and operational account QA remain the main next work. Client-calculated cloud results/verdicts can be forged by a modified client; cryptographic utilities exist, but trusted verification and live liveness/signing are not integrated into the current web flow.

The shared Log confirms migration 005 was live on 2026-10-15. `AUTHENTICATION.md` also records 006 as applied, while `PROJECT_STATE.md` still requests confirmation of 006/admin onboarding. Preserve that evidence distinction: this walkthrough did not inspect the live database. Custom SMTP and real-user onboarding remain unverified in the handoff.

Other limits include fixed-side/right-handed assumptions in some exercises, event checks sampled before lockout, partial portal/explanation translations, youth guardian-identity verification, dedicated privacy communication, and experimental jump-only projections. Refer to `PROJECT_STATE.md` for the prioritized roadmap.

## Sources and drift traps

- Current priorities/history: `docs/PROJECT_STATE.md`; earlier assessment: `docs/PROJECT_ANALYSIS.md`.
- Measurement targets, synthetic results and explicit limitations: `docs/VALIDATION.md`. Historical “gaps found” may be followed by fixes later in the same document.
- Account setup and provider operations: `docs/AUTHENTICATION.md`, migrations and actual auth/store code.
- Current UI: `apps/web/DESIGN.md` plus `glass.css`/`landing.css`; black/flat content, glass navigation, activity rings, photos with a synthetic-figure fallback. `PRODUCT.md` still describes an older aurora visual direction.
- Some comments still say sessions stay local; actual signed-in behavior backs up full reports. Validation reference fields are part of that report data despite UI copy saying they stay on the device.
- Demo poses are generated from the catalog definition, but the session's `def` currently personalizes any non-battery source, including demo. Do not repeat the handoff's blanket “demo stays standard” claim without resolving this source discrepancy.

## Resume and verification

At the next session: follow the repository instructions, sync safely, read the latest shared state/Log, then use this map to find the relevant code. Reuse existing skills from the canonical collection; do not copy them into this repo.

Commands: `npm run dev:web` (port 5174), `npm test`, `npm run build`, `npm run typecheck -w @fitzen/server`; SQL checks use `supabase/tests/run.sh` with local PostgreSQL server binaries. App UI verification uses the built-in browser. Tests do not substitute for camera/device/live-provider checks.

Environment observed 2026-10-25: Graphify is unavailable on PATH and `/Users/shiv/.local/bin/graphify` is a broken symlink. No dependency executables were present under `node_modules/.bin`; do not report the earlier 269-test baseline as a fresh pass. Preserve unrelated untracked files when committing this memory.
