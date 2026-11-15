# Fitzen — Every sport. One coach.

Fitzen turns a phone or laptop camera into a sports-science lab. Pick any of **90 exercises**, from
squats and bench press to javelin, yoga and the SAI fitness battery. Every measured joint is drawn
on the video in **green (correct), amber (almost) or red (fix it)**, and each session ends with a
report you can trust and share.

Pose tracking runs on the device: **video never leaves it.**

**Live:** https://fitzen-ai.vercel.app · try **Explore the demo** without an account.

Built for Smart India Hackathon problem statement **SIH25073** (AI-powered mobile sports talent
assessment, Sports Authority of India). Final-year project, CSD department, K. K. Wagh Institute,
Nashik. Not an official SAI product.

## Features

- **Live camera coaching** — angle chips, rep/hold/attempt counter, running form score, spoken cues,
  background view-angle detection and wrong-exercise detection.
- **Offline video analysis** — upload a clip; the same engine reads it locally, with authenticity checks.
- **Reports** — reps (correct / partial / rejected), tempo, range of motion, time under tension,
  fatigue drift, symmetry, jump height, release angle, and an evidence level for every number.
- **Talent assessment** — guided four-test battery, jumps, sprints, throws and the SAI battery,
  compared against age-group norms only when the protocol matches.
- **Wellness** — sleep schedule, Bluetooth heart-rate watches (resting HR, HRV), Apple Health /
  Fitbit / Garmin / CSV import, and food-photo nutrition estimates (on-device model).
- **Accounts** — email + password (Supabase), per-user data with offline queue, demo mode,
  coach portal (squads, verdicts, API keys) and admin portal.
- **Mobile-first PWA** — installable, safe-area and keyboard aware, works offline; English, Hindi,
  Marathi, Tamil and Telugu athlete flows.

## Quick start

Requires **Node ≥ 22.5**.

```bash
npm install
npm run dev:web      # http://localhost:5174
```

The camera needs `localhost` or HTTPS. No camera? Every exercise has **Watch demo** (a synthetic
athlete run through the real engine) and **Analyse video**.

Accounts are optional locally. To enable them, copy `apps/web/.env.example` to `apps/web/.env.local` and set
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, then apply `supabase/migrations/*.sql` in order
(see `docs/AUTHENTICATION.md`).

```bash
npm test             # engines + server + web
npm run build        # production build → dist/
```

## How it works

| Step | Method |
|---|---|
| Pose | MediaPipe Pose Landmarker, on-device (GPU, CPU fallback) |
| Angles | 2D joint angles in the image plane, x scaled by aspect ratio |
| Smoothing | One Euro filter per landmark |
| Reps | Schmitt-trigger counter on a driver angle, minimum rep time and depth check |
| Holds | Timer runs while every hold check is green/amber |
| Throws | Release = peak wrist speed; release angle from raw landmarks |
| Jumps | Toe-off → toe-contact flight time, h = g·t²/8 |
| Evidence | Tracking gaps become missing evidence, never zeros |

Every exercise is data, not code: angles, bands, rep rule, cues and rationale live in
`packages/engines/src/motion/catalog/*.ts`. Single-camera numbers are screening estimates, not
clinical measurements.

## Repository

```
packages/engines/   motion engine (MotionSession, 90-exercise catalog, evidence, view angle), tests
apps/web/           React + Vite PWA
  src/x/            app shell and pages (home, train, wellness, food, wearables, auth, landing)
  src/app/          exercise, session, results, history, coach/admin, i18n
  src/pose/         camera and video pose sources
apps/server/        Node API for signed assessments (served via api/[...path].ts)
supabase/           migrations 001–009 and SQL tests
docs/               architecture, API, auth, validation, project state and log
```

Design notes: `apps/web/PRODUCT.md`, `apps/web/DESIGN.md`. Project status and roadmap:
`docs/PROJECT_STATE.md`. Credits: `THIRD_PARTY_NOTICES.md`.

## Status

- **Tests:** web 68/68, server 34/34, engines 220/222 (two known accuracy cases at low frame rates).
- **Not yet verified:** live camera accuracy on real athletes, real Bluetooth watches and food photos
  on devices.
- **Known limits:** unilateral poses assume a fixed side; throws assume a right-hander.

## Team

M. P. Deshmukh (guide) · Shivanjay Bajpai · Deepasha Sakhare · Aryan Sukhwal · Kadamb Sonawane

## License

MIT. Third-party notices in `THIRD_PARTY_NOTICES.md`.
