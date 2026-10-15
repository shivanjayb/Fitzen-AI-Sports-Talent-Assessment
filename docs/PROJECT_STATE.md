# Fitzen: project state and handoff

Read this first in any new session or account. It is the single source of truth for what Fitzen is, what has been done, where it stands and what comes next. Keep it current: update it whenever a milestone lands (the "Log" section at the end).

## What Fitzen is

- Final-year project, K. K. Wagh Institute, Nashik (CSD). Smart India Hackathon problem **SIH25073**: AI sports talent assessment for the Sports Authority of India (SAI). Not an official SAI product.
- Team: M. P. Deshmukh (guide), Shivanjay Bajpai (repo owner), Deepasha Sakhare, Aryan Sukhwal, Kadamb Sonawane.
- Goal: a phone/laptop camera becomes a sports-science lab for rural Indian athletes without coaches. Pose tracking runs on the device; video never leaves it.
- Copyright filed as "Fitzen Decentralized Edge-Native Biomechanics and Cryptographic Assessment Engine": keep MediaPipe on-device, offline-first, JWT gateway, verification/flagging engine, gamification, officials' dashboard, cryptographic signing.
- Repo: github.com/shivanjayb/Fitzen-AI-Sports-Talent-Assessment (branch `main`).

## Architecture

TypeScript npm-workspaces monorepo, Node ≥ 22.5.

| Path | What |
|---|---|
| `packages/engines/src/motion/` | Motion engine. `types.ts` (ExerciseDef schema), `engine.ts` (MotionSession), `puppet.ts` (synthetic athlete for demo/tests), `catalog/*.ts` (90 exercises as data), `integrity.ts` + `forensics.ts` (fake-video checks), `filtfilt.ts` (zero-phase Butterworth), `validation/` (reference tests vs OneEuroFilter and Sports2D) |
| `packages/engines/src/athlete/` | Profile maths: `body.ts` (WHO BMI z, Mirwald/Moore maturity, ICMR-NIN diet), `norms.ts` (protocol-gated Gabel 2016 jump and CSEP/Fit India push-up references), `readiness.ts` (Hooper index + mood, Tele-MANAS 14416), `projection.ts` (experimental 4/8/12-week jump projection), `summary.ts` (actions + future scope) |
| `packages/engines/src/{jump,crypto,potential,gamification}/` | Jump analyser, ECDSA signing + audit trail, potential score, 50 badges. Used by the server |
| `apps/web/` | React 18 + Vite PWA. `src/app/`: local 90-exercise lab, guided four-test battery, Results, Progress/goals, History, coach validation CSV, Profile, partial Hindi, account/leaderboard UI, user-scoped local storage and local deterministic coach. `src/pose/poseSource.ts`: cancellation-safe camera and video-file pose sources |
| `apps/server/` | Node API for legacy auth and signed assessments. Not used by the current web app; privileged registration requires trusted provisioning. Hosted AI is disabled. Deployed as `api/[...path].ts` on Vercel only if explicitly retained |
| `docs/` | `VALIDATION.md` (accuracy targets, datasets), `ARCHITECTURE.md`, `API.md`, this file |
| `graphify-out/` | Knowledge graph of the code (gitignored, rebuilt locally with `graphify update .`) |

Key methods: MediaPipe Pose Landmarker (lite/full/heavy) → One Euro filter (`FILTER = {minCutoff 1.5, beta 10, dCutoff 1}`) → 2D aspect-corrected joint angles → Schmitt-trigger reps, hold timers, events. Jump height h = g·t²/8 from flight time with sub-frame parabola fit. Wrong-exercise detection compares a per-rep/hold/event movement signature against the exercise's own puppet reference. Uploaded video: physics checks (gravity/time-scale, bone-length CV, teleports, frozen frames) + container forensics (MP4/WebM, C2PA, encoder fingerprints, VFR).

## How to run and verify

```bash
npm install
npm run dev:web        # http://localhost:5174 (builds engines first)
npm test               # engines (209) + server (34) + web auth/capture (25)
supabase/tests/run.sh  # migrations 002-005 on a throwaway local Postgres 16 (needs server binaries)
npm run build           # engine typecheck/build + web typecheck/production build
```

No camera? Each exercise has Watch demo (synthetic athlete) and Analyse video. Verify UI in the built-in browser pane, not Playwright. Launch configs live in `/Users/shiv/my_projects/.claude/launch.json` (`fitzen-repo-web` 5174, `fitzen-repo-api` 4000).

## Hard rules

- Commit and push every verified change without asking, as `git -c user.name="Shivanjay Bajpai" -c user.email="shivanjayprakashbajpai@gmail.com"`, with no Co-Authored-By or AI attribution.
- Never write to the live Supabase project. Never commit secrets.
- OpenPose is allowed (user decision, 2026-10-05). Its CMU licence is non-commercial research only and excludes sports/commercial use, so keep it optional/academic and never ship it in a commercial build without a licence from CMU. Don't copy UrbanFit or VertMeasure code (no licence).
- Video stays on the device. Leaderboards are allowed (user decision, 2026-10-05): city/state/India rankings of real users once accounts exist. Under the DPDP Act, minors need verifiable parental consent before appearing; use opt-in and display names/initials, never full names or exact locations of minors. No fake users, stats or endorsements.
- Single-camera numbers are screening estimates; never claim clinical accuracy until validated.

## History (what has been done)

| Date | Milestone |
|---|---|
| Jul–Sep 2026 | Team's first version: push-up/squat/jump suite, 3D model, badges, Supabase auth + sync, Vercel deploy |
| 2026-09-29 | Movement Lab: 90-exercise config-driven motion engine, live green/amber/red skeleton, scientific reports, Liquid Glass UI, email auth removed, landing page redesign |
| 2026-09-30 | Math audit against research (68 fixes); reference validation (One Euro to 6e-16, Sports2D); `docs/VALIDATION.md`; uploaded-video authenticity checks + zero-phase filtering |
| 2026-10-01 | Wrong-exercise detection for reps |
| 2026-10-03 | Wrong-exercise detection for holds/events; athlete profile (diet, BMI, maturity), post-session readiness check-in, norm percentiles, growth projection, Progress tab (streak, XP, badges, PBs, honest leaderboard card) |
| 2026-10-05 | Ponytail ultra audit: deleted legacy push-up/squat pipeline, scratch scripts, stale docs, unused test scaffolding (~3,700 lines). Agent rules added to CLAUDE.md |
| 2026-10-14 | Personal exercise ranges + biometric response, password login, cross-device sync, coach/admin portals with genuineness verdicts and API keys (migration 005), low-end/offline mode, Fitzen brand signatures |
| 2026-10-07 | Assessment hardening: tracking gaps become missing evidence; N/A reports; protocol-gated norms; guided battery; coach validation export; goals; account-isolated storage/retry/delete; PWA preparation; partial Hindi; local coach; API/SQL security hardening |

## Current state

- Working and tested locally: web app, 90 exercises, camera/demo/video paths, evidence-aware reports, guided four-test battery, profile, Progress/goals, History, coach validation CSV, fake-video checks, installable PWA shell and partial Hindi navigation/instructions.
- UI (2026-10-14, live on fitzen-ai.vercel.app via PR #4): unofficial Apple Fitness+ style built from the "Fitness+ Reference" and "Apple Native" design-system artifacts. Tabs Summary · Train · Compete + search; `/exercise/:id` pages; every exercise drawn as a shaded human from the engine's synthetic athlete (`Figure.tsx`); one embedded YouTube lesson per exercise (`lessons.ts`, youtube-nocookie, loads on tap). See `apps/web/DESIGN.md`.
- Exercise media (branch `claude/real-photos-movement-fix`, 2026-10-14): 77/90 exercises show real photos of people (`photos.ts`, vendored in `apps/web/public/exercises/`; free-exercise-db public domain + 15 credited Wikimedia Commons files, see THIRD_PARTY_NOTICES). The rest use the drawn demonstrator, which now moves correctly for all 90: per-exercise poses in `packages/engines/src/motion/puppetStyle.ts` (bench on a bench, bar on the back, stepping lunge, planted split stances, straight-line punches/pushes, ballistic jump shot) and drawn equipment. Audit: no exercise flags itself; every demo counts reps/holds/events.
- Not yet verified: live camera accuracy on real athletes (all thresholds tuned on the synthetic athlete).
- Personal ranges (PR #6, live 2026-10-14): `motion/personalize.ts` widens depth bands and rep targets from BMI, age and Experience (new Profile field), adds trunk-lean allowance for long legs (sitting height), and follows the athlete's usual depth after 3 sessions; alignment checks and release angles never change. On by default (Profile → Personal ranges); the guided battery and demo stay standard and leaderboard uploads recount reps against the catalog target (`standardReps`). Exercise and Results pages show personal vs standard ranges and why. Progress shows "How your body responds" per exercise.
- Accounts and portals (live since PR #6, need migration 005): password or magic-link login; profile and full session reports sync to the account (`athlete_data`, `sessions`) and come back on any device; offline changes queue. `/coach`: apply (admin approves), squads with invite codes, each athlete's reports with a genuine / needs review / suspect verdict plus evidence, API keys (`api_squad_report`). `/admin`: analytics, coach approvals, roles. Needs `005_portals_sync.sql` on Supabase project rmaheshfcwbwspgujghe and a first admin set in SQL (`docs/AUTHENTICATION.md`).
- Low-end/offline (PR #6, live): GPU→CPU pose fallback; ≤ 4 cores / ≤ 3 GB / Data Saver devices get a 640×360 camera, lite model by default and Lite mode (no blur/motion); exercise photos cached by the service worker with a drawn fallback; Offline panel shows "Ready offline".
- Brand (PR #6, live): add-only Fitzen signatures so the UI is not a copy of Fitness+: protractor dial + joint glyph on the rings, joint-line under page titles, FITZEN mark on wide screens; design comments no longer name Apple's product. Ring colours are still Apple's Activity hues (user asked not to change existing UI); swapping them is the highest-value remaining change if trade-dress risk matters.
- Live accounts project: Supabase `rmaheshfcwbwspgujghe` (Free, Tokyo) backs fitzen-ai.vercel.app (production/preview publishable key, Site URL and exact redirects set on 2026-10-09). Migrations 002/003/004 are applied there; **005 (portals + sync) is not yet applied**, so until the owner applies it the coach/admin portals show a missing-function error and sessions/profile stay queued on the device (nothing breaks). Never modify the legacy live project. Custom SMTP is not configured. Parent email matching is still not verifiable parental identity.
- Coaching is now deterministic and on-device; hosted Gemini/Anthropic processing is disabled. `api/ai.ts` returns 503 so youth data cannot be forwarded accidentally.
- Authentication UI includes `/auth` and `/auth/callback`: email + password or email-link sign-in, safe return routes (incl. `/coach`, `/admin`), expired-link recovery, resend cooldown and checked device sign-out. Real email delivery/onboarding verification remains outstanding; see `docs/AUTHENTICATION.md`.
- Known limits: unilateral poses assume a fixed side (tree/flamingo left leg, warrior left leg forward); throws assume a right-hander; jump projection is experimental and jump-only; Fit India push-up bands require a matching full/modified exhaustion protocol, which the ordinary camera exercise does not yet enforce; Hindi covers the main assessment flow rather than all 90 exercise names and account screens.
- Open question: 4 old commits (2e8c2dc..ceabd7b) carry a Claude co-author line; rewriting needs a force-push the user must approve and run.
- Release evidence on 2026-10-07: engine 202/202, server 34/34, capture 12/12; production web build and guided/validation/Hindi browser smoke pass succeeded. Supabase migration was checked locally on fresh and legacy schemas only.

## What's next (priority order)

1. Real-camera testing and threshold calibration on representative phones and athletes (tracking loss, wrong-exercise, integrity and colour bands).
2. Collect independent ground truth with the new coach-validation flow: jump mat/force plate and goniometer/lab references; publish Bland-Altman/RMSE and only use ICC with a defined repeated-measures design.
3. Finish protocol-matched Indian norms: run the official Fit India push-up protocol in a dedicated flow and source usable Indian references for the other tests.
4. Stage-test accounts + sync: apply migration 005 to the Fitzen Supabase project rmaheshfcwbwspgujghe (002/003/004 are already applied there) (set the first admin, approve a test coach, try a squad, API key, offline queue and a second device), complete verifiable parental-consent operations and exercise failure/retry/delete/account-switch cases before real leaderboards.
5. Live anti-cheat: wire AKCR signing + liveness prompts into the live flow.
6. Coach portal follow-ups: report export (PDF/CSV), API rate limiting at the edge, signed assessments so verdicts can't be forged by a modified client.
7. Device-test PWA/offline model preparation and finish Hindi/regional translations.
8. Engine gaps: unilateral side detection, left-handed throws, more projected metrics. Release checks for pushes and strikes (shot put, chest pass, punch, jump shot) read the elbow mid-extension at 30 fps, so even a correct demo scores those red; consider sampling at lock-out. Holds whose checks also pass standing (tree, toe touch) flag the step into position as movement.
9. UI/UX polish pass (mobile first).
10. Paperwork: IEEE paper, copyright consistency.

## Public beta checklist

Recommended scope: a **local-only beta** (no accounts, nothing leaves the device), so the DPDP consent work waits for the accounts release.

Must have:
1. Real-camera calibration on 10–20 real athletes (wrong-exercise, integrity, colour bands), phone and laptop.
2. Add the privacy page (video stays on device, local storage contents and deletion); the Results screening/medical limitation notice is implemented.
3. Decide whether to stop deploying unused `api/`; its JWT now requires an environment secret and hosted AI is disabled.
4. Recheck the implemented CSP and camera permissions policy against a preview deployment.
5. Device-test the implemented manifest/service worker and explicit MediaPipe model preparation after first load.
6. Cross-device QA: Android Chrome, iOS Safari, desktop; slow phones on the lite model; camera denied; low light; large video upload.
7. Error reporting (Sentry or similar, no PII) and a feedback link.
8. Accessibility and mobile polish pass on all screens.
9. Release gate: tests, typecheck and build green; preview deploy checked; production deploy only with the owner's approval.

Should have: Hindi UI, Indian norms (Khelo India / Fit India), coach report export (PDF/share), live liveness prompt.

After beta (accounts release): Supabase key, auth, DPDP + parental consent, sync, real leaderboards, signed assessments, scout dashboard.

## Log

Append one line after every change, from any account: `- YYYY-MM-DD [account: email] what changed (commit). Next/left: ...`. Read the last lines before starting work.

- 2026-10-05: created this handoff file; CLAUDE.md now points here.
- 2026-10-05: user allowed OpenPose (licence caveat noted) and real leaderboards (with DPDP consent rules).
- 2026-10-05 [account: shivanjayprakashbajpai@gmail.com] Added the shared work-log rule to CLAUDE.md so every account logs its changes here (see commit). Next/left: roadmap item 1, real-camera calibration.
- 2026-10-05 [account: shivanjayprakashbajpai@gmail.com] Decided not to add OpenPose: no browser/on-device build (would force video uploads, breaking the on-device rule), CMU licence excludes sports use, and the main 2D error is out-of-plane bias, not the keypoint model. If the detector is ever swapped, benchmark RTMPose (Apache-2.0, runs in browser via ONNX Runtime Web) against MediaPipe on ground truth first (no code change). Next/left: roadmap item 1, real-camera calibration.
- 2026-10-05 [account: shivanjayprakashbajpai@gmail.com] Added the public beta checklist (local-only beta scope) to this file. Next/left: checklist item 1, real-camera calibration.
- 2026-10-05 [account: shivanjayprakashbajpai@gmail.com] AI assistant (Gemini, server-side minor/consent gate) + accounts, leaderboards, groups, parent consent; SQL tested with PGlite (12 checks), endpoint tested with fake fetch (fdbe3b3). Next/left: user creates new Supabase project + Gemini key, run 002 migration, set env in .env.local/Vercel, then browser QA of Compete/Assistant/Consent; auth.users not deleted on account delete (needs service-key function); results are self-reported until signed assessments.
- 2026-10-07 [account: shivanjayprakashbajpai@gmail.com] IN PROGRESS (uncommitted, this machine): accuracy/research audit of all 90 exercises (catalog/*.ts, wellness done: 11/16 fixed), video-upload math + accuracy harness (engine.ts, poseSource.ts, Session.tsx, validation/accuracy.test.ts), anti-cheat red team (integrity.ts/test; genuine-clip false positives still being fixed). Next: finish agents, run tests, write measured tables into docs/VALIDATION.md, add engine side:'flexed'|'extended' for Warrior II, commit.
- 2026-10-07 [account: shivanjayprakashbajpai@gmail.com] Done: research audit of all 90 exercises (~50 opened sources, many bands/METs fixed, unmeasurable metrics labelled), measurement-maths fixes + synthetic ground-truth accuracy harness (1d71bf3), anti-cheat red team with 0/18 false positives (b70cf5b); tables in docs/VALIDATION.md §11-13. Next/left: real-athlete ground truth (roadmap 2) and real-clip recalibration of all thresholds; live throws at 120 fps false releases; puppet can't draw split legs/lying poses.
- 2026-10-07 [account: shivanjayprakashbajpai@gmail.com] Hardened assessment evidence, capture cancellation, local/account storage, offline PWA, API/SQL security and protocol-gated norms; added guided battery, coach validation export, goals, local coach and partial Hindi (17c7b60). Verified 248 tests, production build and browser smoke pass. Next/left: real-camera calibration and independently measured ground-truth collection; stage-test migrations 002/003 before any accounts release.
- 2026-10-09 [account: shivanjayprakashbajpai@gmail.com] Implemented dedicated email-link authentication, callback recovery, safe return destinations, publishable-key support, account-query errors and checked device sign-out. Added 11 authentication regressions (23 web tests total); production build and isolated mock-provider desktop/mobile browser checks passed. Next/left: connect an active new Fitzen Supabase project, configure email/redirects and Vercel environment variables, then verify real email sign-in and account onboarding; no live database was modified.
- 2026-10-09 [account: shivanjayprakashbajpai@gmail.com] Authentication implementation pushed as fcc62f5. Vercel preview surfaced root-level API TypeScript import diagnostics; added a root config that inherits the existing server compiler settings. Next/left: verify the production deploy and activate Supabase authentication after provider details are supplied.
- 2026-10-09 [account: shivanjayprakashbajpai@gmail.com] Final root API compiler check passed (bd34598); deployed to production dpl_GqaovC9Pt6xqpFHvJFUgRdyQhh2S and verified https://fitzen-ai.vercel.app/auth in the browser. No Supabase variables are configured, so the deployed UI correctly keeps online sign-in unavailable. Next/left: user supplies an active Fitzen Supabase project or approves a new one; configure provider, migrations in the new project, SMTP and production redirects, then verify real email delivery.
- 2026-10-09 [account: pshukla@powayusd.com] Made the launch video with /brag (22s, 1920x1080, music + SFX): brag-output/brag.mp4, poster brag.jpg, share-copy.txt, plan and composition source. brag-output/ is gitignored on purpose (bundled music licence unverified, 5 MB mp4); copy the file out to share. Next/left: none for the video; PWA/other beta items unchanged.
- 2026-10-14 [account: pshukla@powayusd.com] Apple Fitness+ style redesign across app + landing: black canvas, flat cards, system/SF Rounded type, Rings.tsx activity rings on Train/Progress, category shelves with See All, Apple product-page landing nav/CTAs; removed Aurora and Barlow fonts. Next/left: redeploy to fitzen-ai.vercel.app; real-camera calibration.
- 2026-10-13 [account: shivanjayprakashbajpai@gmail.com] Deeper Apple Fitness+ redesign on branch claude/fitness-plus-redesign: shaded human demonstrator from the synthetic athlete (cards, heroes, demo sessions, landing), Fitness+ Train tab with carousel/types/shelves/search, /exercise/:id pages with key-pose steps and a click-to-load YouTube lesson for all 90 exercises (IDs oEmbed-checked), Summary tab with rings/tiles/awards, glass tab bar (top on desktop), CSP frame-src for youtube-nocookie. Engines 202, server 34, web 23 tests and production build pass; mobile/desktop/light screenshots reviewed (128744a). Next/left: user review of the look; real licensed photos were not added (sandbox blocks image hosts); puppet still can't draw split legs/lying poses well (triangle, bridge); graphify not installed in the cloud container, run `graphify update .` locally.
- 2026-10-14 [account: shivanjayprakashbajpai@gmail.com] Merged PR #4 (Fitness+ redesign) into main with the user's approval (f2c9dbc); Vercel deploys main to production. Next/left: user review on device; real licensed photos still optional; puppet split-leg/lying poses.
- 2026-10-14 [account: shivanjayprakashbajpai@gmail.com] Fixed the demo athlete's movement for all 90 exercises (66143bf, 0551064): per-exercise poses (puppetStyle.ts), equipment drawn, front-view body; 77/90 exercises now show real photos of people (free-exercise-db + 15 credited Wikimedia files, photos.ts). Engine 202/202, server 34/34, web 23/23, build OK. Red-team squat loop detection recorded as 3–4/6 with the bar carried on the back. Branch claude/real-photos-movement-fix, draft PR; not merged/deployed. Next/left: user review, then merge (deploys); 13 exercises still drawn (javelin, discus, shot put, jump shot, smash, high knees, butt kicks, wall sit, hollow hold, knee/pike push-up, push jerk, hang clean); push/strike release checks read mid-extension at 30 fps.
- 2026-10-14 [account: shivanjayprakashbajpai@gmail.com] Merged PR #5 (real photos for 77 exercises + correct demo movement for all 90) into main at the user's request (d5b49cc); Vercel deployed it and https://fitzen-ai.vercel.app/exercises/bench-press-0.jpg now serves the new photo. Next/left: user review on device; 13 exercises still use the drawn demonstrator; engine follow-ups listed in What's next #8.
- 2026-10-14 [account: shivanjayprakashbajpai@gmail.com] Branch claude/personalize-portals-offline: per-person exercise ranges + biometric response (engine personalize/standardReps/responseProfile), password login, cross-device profile/session sync with offline queue, /coach (approval, squads, genuine/review/suspect verdicts, API keys) and /admin (analytics, approvals, roles) on migration 004 (tested locally on Postgres 16), GPU→CPU fallback + low-end Lite mode + photo caching, add-only Fitzen brand signatures. Engine 209/209, server 34/34, web 25/25, SQL tests pass, build OK, screenshots reviewed. Draft PR; not merged/deployed. Next/left: user review; Supabase project + migration 004 + first admin need the owner's action; ring colours still Apple's hues; real-device QA.
- 2026-10-14 [account: shivanjayprakashbajpai@gmail.com] Merged PR #6 into main at the user's request (47dbf1f); Vercel production now serves it (/coach renders the Coach portal on fitzen-ai.vercel.app). Renumbered the portals migration to 005_portals_sync.sql and added 004_auth_function_permissions.sql from unmerged codex/authentication (already applied on Supabase rmaheshfcwbwspgujghe); SQL tests pass on 002-005. Next/left: owner applies 005 in the Supabase SQL editor and sets the first admin; custom SMTP; real-device QA.
- 2026-10-14 [account: shivanjayprakashbajpai@gmail.com] Tried to apply 005 to Supabase rmaheshfcwbwspgujghe from this session and a fresh child session: neither has a SQL-capable Supabase tool (connector exposes only query_logs/create_edge_function_secret) and the sandbox blocks supabase.co; live API confirms profiles.role and coach_requests are still missing. Shipped graceful handling: /coach and /admin say the feature is being switched on, and sync stops retrying/counting pending when the 005 tables are missing (claude/portals-graceful). Next/left: 005 must be applied by someone with SQL access to rmaheshfcwbwspgujghe (dashboard SQL editor or a Supabase connector with execute_sql), then set the first admin.
- 2026-10-15 [account: shivanjayprakashbajpai@gmail.com] Deploy check: no open PRs; only unmerged branch codex/authentication is fully superseded on main (004 + its doc notes already there). Live fitzen-ai.vercel.app bundle contains PR #7 code (isMissingSchema codes), so production serves latest main 8da1403. Migration 005 still not applied: Supabase connector still only has query_logs/create_edge_function_secret and the sandbox proxy blocks supabase.co. Next/left: owner runs 005_portals_sync.sql in the Supabase SQL editor (or connects a SQL-capable Supabase connector), then sets the first admin.
