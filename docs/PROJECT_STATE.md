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
npm test               # engines (202) + server (34) + web auth/capture (23)
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
| 2026-10-07 | Assessment hardening: tracking gaps become missing evidence; N/A reports; protocol-gated norms; guided battery; coach validation export; goals; account-isolated storage/retry/delete; PWA preparation; partial Hindi; local coach; API/SQL security hardening |

## Current state

- Working and tested locally: web app, 90 exercises, camera/demo/video paths, evidence-aware reports, guided four-test battery, profile, Progress/goals, History, coach validation CSV, fake-video checks, installable PWA shell and partial Hindi navigation/instructions.
- Not yet verified: live camera accuracy on real athletes (all thresholds tuned on the synthetic athlete).
- Built, not yet live: optional Supabase magic-link accounts, scoped result sync, delete-everywhere queue, Compete tab (group/city/state/India/world leaderboards, invite groups, parent consent). A new/staging Supabase project must apply `002_compete.sql` then `003_audit_hardening.sql`; never apply migrations to the live project from an agent. Parent email matching is still not verifiable parental identity.
- Coaching is now deterministic and on-device; hosted Gemini/Anthropic processing is disabled. `api/ai.ts` returns 503 so youth data cannot be forwarded accidentally.
- Authentication UI includes `/auth` and `/auth/callback`: email-link signup/sign-in, safe return routes, expired-link recovery, resend cooldown and checked device sign-out. Public/publishable Supabase keys are supported. On 2026-10-09, Vercel project `fitzen` is reachable at `https://fitzen-iota.vercel.app` but has no Supabase environment variables; the connected Supabase account has no active Fitzen project. Authentication activation and real email delivery remain blocked on provider configuration; see `docs/AUTHENTICATION.md`.
- Known limits: unilateral poses assume a fixed side (tree/flamingo left leg, warrior left leg forward); throws assume a right-hander; jump projection is experimental and jump-only; Fit India push-up bands require a matching full/modified exhaustion protocol, which the ordinary camera exercise does not yet enforce; Hindi covers the main assessment flow rather than all 90 exercise names and account screens.
- Open question: 4 old commits (2e8c2dc..ceabd7b) carry a Claude co-author line; rewriting needs a force-push the user must approve and run.
- Release evidence on 2026-10-07: engine 202/202, server 34/34, capture 12/12; production web build and guided/validation/Hindi browser smoke pass succeeded. Supabase migration was checked locally on fresh and legacy schemas only.

## What's next (priority order)

1. Real-camera testing and threshold calibration on representative phones and athletes (tracking loss, wrong-exercise, integrity and colour bands).
2. Collect independent ground truth with the new coach-validation flow: jump mat/force plate and goniometer/lab references; publish Bland-Altman/RMSE and only use ICC with a defined repeated-measures design.
3. Finish protocol-matched Indian norms: run the official Fit India push-up protocol in a dedicated flow and source usable Indian references for the other tests.
4. Stage-test accounts + sync: apply migrations 002/003 to a new Supabase project, complete verifiable parental-consent operations and exercise failure/retry/delete/account-switch cases before real leaderboards.
5. Live anti-cheat: wire AKCR signing + liveness prompts into the live flow.
6. Scout/coach dashboard with report export.
7. Device-test PWA/offline model preparation and finish Hindi/regional translations.
8. Engine gaps: unilateral side detection, left-handed throws, weaker lying poses, more projected metrics.
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
