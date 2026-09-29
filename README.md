<p align="center">
  <img src="https://img.shields.io/badge/tests-83%20passing-c8f135?style=flat-square" alt="83 tests passing" />
  <img src="https://img.shields.io/badge/deps-zero%20native-c8f135?style=flat-square" alt="zero native deps" />
  <img src="https://img.shields.io/badge/offline-first-c8f135?style=flat-square" alt="offline first" />
</p>

# Fitzen — AI Sports Talent Assessment Platform

Fitzen turns any smartphone or laptop into a verified sports-science lab. It measures
**vertical jump**, **push-ups**, and **squats** performance with **on-device 3D AI pose tracking**, produces **uncertainty-aware
metrics**, signs every result **cryptographically at capture time**, and predicts
**future athletic potential** with fully explainable scoring — all working offline and
syncing automatically when a connection returns.

> 📖 **Comprehensive Documentation**: For a complete deep-dive into the architecture, tech stack, research equations, FSM anti-cheat engine, and future roadmap, read [PROJECT_MASTER_DOCUMENTATION.md](file:///c:/Users/sonaw/OneDrive/Desktop/Fitzen/Fitzen-AI-Sports-Talent-Assessment/docs/PROJECT_MASTER_DOCUMENTATION.md) and [CHANGES_LOG.md](file:///c:/Users/sonaw/OneDrive/Desktop/Fitzen/Fitzen-AI-Sports-Talent-Assessment/docs/CHANGES_LOG.md).

---

## Movement Lab (current build)

The app now opens straight into a **Movement Lab** — no sign-in (email auth is paused; the old
pages remain in `apps/web/src/pages`). Pick any of **90 exercises** across Gym, Calisthenics,
Athletics, Throws & Strikes, Olympic lifts, the SAI fitness battery, Yoga and Mobility; the
camera opens, every measured joint is drawn on the video in **green / yellow / red**, and the
session ends with a scientific report (reps, cadence, tempo, ROM ± SD, time under tension,
fatigue drift, per-joint time-in-zone, angle noise, jump height from flight time, release
angle) plus a "how to do better" coaching list.

- Engine: `packages/engines/src/motion/` — `types.ts` (exercise schema), `engine.ts`
  (MotionSession: 2D aspect-corrected angles, One Euro filter, Schmitt rep counter, holds,
  throw/jump events, report + insights), `puppet.ts` (synthetic athlete for demos/tests),
  `catalog/*.ts` (the 90 definitions).
- UI: `apps/web/src/app/` — Liquid-Glass design system (`glass.css`), library, exercise sheet,
  live session HUD, results, local history/profile (stored on the device only).
- No camera? Every exercise has **Watch demo** (synthetic athlete through the real engine) and
  **Analyse video** (upload a clip).
- Pose model: MediaPipe Pose Landmarker (lite/full/heavy, chosen in Profile). OpenPose is not
  used — its licence forbids sports use. See `THIRD_PARTY_NOTICES.md`.

## Demo accounts


Run `npm run seed`, then sign in with password `fitzen-demo-2026`:

| Role    | Email               |
|---------|---------------------|
| Athlete | `kabir@fitzen.demo` |
| Coach   | `coach@fitzen.demo` |
| Admin   | `admin@fitzen.demo` |

## Quick start

Requires **Node ≥ 22.5** (uses the built-in `node:sqlite` — no native modules anywhere).

```bash
npm install
npm run seed     # demo users + genuinely-signed assessment history
npm run dev      # API on :4000, web on :5174 (proxied)
```

Open http://localhost:5174. Run all test suites (engines, API integration, UI):

```bash
npm test
```

Optional environment:

| Variable | Effect |
|---|---|
| `FITZEN_JWT_SECRET` | Stable token signing secret (required in production). |
| `ANTHROPIC_API_KEY` | Upgrades AI coaching briefs from the deterministic engine to Claude. |
| `FITZEN_DB_PATH` | SQLite location (default `data/fitzen.db`). |

## What's inside

### Product features

- **Onboarding & auth** — email/password (scrypt), JWT sessions, athlete/coach/admin roles.
- **Assessments, three capture modes** — all feeding the identical
  capture→analyze→sign→sync pipeline:
  - **Live camera** — MediaPipe PoseLandmarker on the device camera with a real-time
    skeleton overlay; nothing is recorded or uploaded, only pose landmarks are kept.
  - **Upload video** — process a jump clip recorded with any phone's camera app.
    Decoded frame-by-frame via timeline seeking (deterministic 30 fps sampling,
    immune to background-tab throttling); the video never leaves the device.
  - **Guided demo** — a physically-accurate synthesized jump (works with no camera,
    used by the test suite too).
- **Jump metrics** — height with 95% CI, flight time, Sayers peak power, W/kg,
  left/right symmetry, movement quality with actionable flags.
- **Offline-first** — assessments are signed and queued in IndexedDB *first*; a sync
  engine flushes on submit/online/interval with server-side idempotency, and dashboards
  fall back to cached snapshots offline.
- **Dashboards** — trend charts with confidence bands, potential rings, component
  meters, explainable insights, AI coaching brief; coach roster + athlete drill-down;
  admin platform overview.
- **Gamification** — 10 badges across 4 tiers with progress tracking, streaks,
  personal-best notifications, opt-out leaderboards by jump or power.
- **Design system** — hand-built (zero UI deps): dark/light themes via CSS tokens,
  60fps transform/opacity animations, custom SVG charts, accessible components
  (ARIA roles, focus rings, reduced-motion support).

### Innovation modules (in `packages/engines`)

1. **Single-camera jump estimation with uncertainty**
   (`jump/`) — no calibration board, no wearables. Two independent estimators:
   ballistic flight time from a least-squares parabola fit of the airborne hip
   trajectory (sub-frame precision), and hip displacement scaled by the athlete's
   stated stature. Estimates are fused by inverse-variance weighting; frame-rate
   quantization and landmark jitter propagate into an honest 95% CI. The analyzer
   also detects countermovement/takeoff/landing events, symmetry, and movement quality.

2. **Cryptographic Assessment Engine**
   (`crypto/`) — canonical-JSON SHA-256 hashing, per-device ECDSA P-256 signatures
   (WebCrypto — the same bytes verify in browser and Node), hash-chained audit trails,
   and layered tamper detection: hash match, signature validity, chain integrity, and
   physical-plausibility screening that catches *validly signed but fabricated* numbers
   (e.g. a flight time inconsistent with the claimed height). The server is the
   authority: clients can never mark their own results "verified".

3. **Potential Score Engine**
   (`potential/`) — a transparent weighted model over explosiveness, relative power,
   movement quality, coordination, consistency, anthropometrics, and biological
   maturity (Mirwald-style PHV offset with mid-parental height support). Outputs
   Current Performance, Potential Score, and Confidence (0–100) plus ranked,
   human-readable insights with signed contributions — every point of the score is
   attributable.

4. **AI integration** — `/api/ai/brief` composes stats + potential into a coaching
   brief via the Anthropic API (`claude-opus-4-8`) when a key is present, and degrades
   to a deterministic rule-based brief offline. The feature always works; the LLM
   upgrades its quality.

## Architecture

```
PID4/
├── packages/engines/          Pure TS domain engines (browser + Node + tests)
│   └── src/
│       ├── jump/              analyzer, uncertainty math, simulator, types
│       ├── crypto/            signing, hash chains, tamper detection
│       ├── potential/         maturity + potential scoring, insights
│       └── gamification/      badge definitions & evaluation
├── apps/server/               Node API — zero framework, zero native deps
│   └── src/
│       ├── http/              router, validation, CORS, JSON body handling
│       ├── auth/              scrypt passwords, HS256 JWT, role middleware
│       ├── services/          assessments, stats/leaderboard, users, notifications, AI
│       ├── db.ts              node:sqlite schema (WAL, FKs)
│       └── seed.ts            demo data generated through the REAL signed pipeline
└── apps/web/                  React 18 + Vite client
    └── src/
        ├── styles/            design tokens + system (dark/light)
        ├── lib/               typed API client, IndexedDB, device keys, sync engine
        ├── pose/              MediaPipe camera source, simulation source, overlay
        ├── components/        UI kit, SVG charts, app shell
        └── pages/             auth, dashboard, assess, history, leaderboard,
                               badges, notifications, settings, team
```

Key decisions are written up in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);
the REST contract is in [`docs/API.md`](docs/API.md).

## Testing

63 tests across three suites (`npm test`):

- **Engines (30)** — CI coverage of ground truth on synthesized jumps, monotonicity,
  fps-vs-uncertainty, asymmetry detection, signature forgery/tamper/chain-break
  detection, plausibility screening, potential-score properties, badge logic.
- **API integration (20)** — real HTTP against an in-memory DB: registration/login,
  profile, genuine signed submission, idempotent offline sync, tampered-payload
  flagging, leaderboard exclusion of tampered results, role enforcement,
  notifications, settings/opt-out, coach access, AI brief fallback.
- **Web components (13)** — design-system components and chart rendering (jsdom).

## Security notes

- Passwords: scrypt (N=16384) with per-hash parameters; uniform login errors.
- Tokens: HS256 JWT, constant-time comparison, expiry enforced; secret must be
  provided in production (process refuses to default).
- Assessments: device-held private keys never leave the browser; server re-verifies
  signature + audit chain + physical plausibility on ingest and on demand.
- API: strict allowlist CORS, JSON body size caps, parameterized SQL throughout,
  role checks at every route, athletes can only submit for themselves.
- Video never leaves the device — only pose-derived metrics are transmitted.

## License

MIT
