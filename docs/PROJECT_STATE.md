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
| `packages/engines/src/athlete/` | Profile maths: `body.ts` (WHO BMI z, Mirwald/Moore maturity, ICMR-NIN diet), `norms.ts` (percentiles: Gabel 2016 jumps, CSEP push-ups), `readiness.ts` (Hooper index + mood, Tele-MANAS 14416), `projection.ts` (4/8/12-week jump projection), `summary.ts` (actions + future scope) |
| `packages/engines/src/{jump,crypto,potential,gamification}/` | Jump analyser, ECDSA signing + audit trail, potential score, 50 badges. Used by the server |
| `apps/web/` | React 18 + Vite app. `src/app/`: Landing, Home, ExerciseSheet, Session, Results, Progress, History, Profile, Shell, store (localStorage), glass.css (dark "Liquid Glass" design). `src/pose/poseSource.ts`: camera and video-file pose sources |
| `apps/server/` | Node API (auth, signed assessments, Supabase). Not used by the current web app; kept for accounts/sync. Deployed as `api/[...path].ts` on Vercel |
| `docs/` | `VALIDATION.md` (accuracy targets, datasets), `ARCHITECTURE.md`, `API.md`, this file |
| `graphify-out/` | Knowledge graph of the code (gitignored, rebuilt locally with `graphify update .`) |

Key methods: MediaPipe Pose Landmarker (lite/full/heavy) → One Euro filter (`FILTER = {minCutoff 1.5, beta 10, dCutoff 1}`) → 2D aspect-corrected joint angles → Schmitt-trigger reps, hold timers, events. Jump height h = g·t²/8 from flight time with sub-frame parabola fit. Wrong-exercise detection compares a per-rep/hold/event movement signature against the exercise's own puppet reference. Uploaded video: physics checks (gravity/time-scale, bone-length CV, teleports, frozen frames) + container forensics (MP4/WebM, C2PA, encoder fingerprints, VFR).

## How to run and verify

```bash
npm install
npm run dev:web        # http://localhost:5174 (builds engines first)
npm test               # engines (132) + server (21)
cd apps/web && npx tsc --noEmit -p . && npx vite build
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

## Current state

- Working and tested: web app, 90 exercises, demo + video modes, reports, profile, Progress tab, fake-video checks.
- Not yet verified: live camera accuracy on real athletes (all thresholds tuned on the synthetic athlete).
- Paused: accounts and cloud sync (server code kept).
- Known limits: unilateral poses assume a fixed side (tree/flamingo left leg, warrior left leg forward); throws assume a right-hander; growth projection covers jump height only; norms are international (Canadian), not Indian.
- Open question: 4 old commits (2e8c2dc..ceabd7b) carry a Claude co-author line; rewriting needs a force-push the user must approve and run.
- Security note: `api/[...path].ts` has a hard-coded fallback JWT secret; must come from env before any real deploy.

## What's next (priority order)

1. Real-camera testing and threshold calibration (wrong-exercise, integrity, colour bands).
2. Ground-truth validation: jump mat/force plate, goniometer or lab dataset; publish Bland-Altman/RMSE/ICC in `VALIDATION.md`.
3. Indian norms (Khelo India / Fit India tables).
4. Accounts + sync: new Supabase key, DPDP consent, parental consent, real leaderboards (city/state/India) with opt-in and parental consent for minors.
5. Live anti-cheat: wire AKCR signing + liveness prompts into the live flow.
6. Scout/coach dashboard with report export.
7. PWA, HTTPS hosting, offline model, Hindi/regional languages.
8. Engine gaps: unilateral side detection, left-handed throws, weaker lying poses, more projected metrics.
9. UI/UX polish pass (mobile first).
10. Paperwork: IEEE paper, copyright consistency.

## Log

Append one line after every change, from any account: `- YYYY-MM-DD [account: email] what changed (commit). Next/left: ...`. Read the last lines before starting work.

- 2026-10-05: created this handoff file; CLAUDE.md now points here.
- 2026-10-05: user allowed OpenPose (licence caveat noted) and real leaderboards (with DPDP consent rules).
- 2026-10-05 [account: shivanjayprakashbajpai@gmail.com] Added the shared work-log rule to CLAUDE.md so every account logs its changes here (see commit). Next/left: roadmap item 1, real-camera calibration.
