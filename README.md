# Fitzen — Every sport. One coach.

Fitzen turns a phone or laptop camera into a sports-science lab. Pick any of **90 exercises**,
from squats and bench press to javelin, yoga and the SAI fitness battery. The camera opens and every
measured joint is drawn on the video in **green (correct), amber (almost) or red (fix it)**.
When you stop, you get a scientific report and a list of what to fix next.

No sign-up. Pose tracking runs on the device and **video never leaves it**.

Built for Smart India Hackathon problem statement **SIH25073** (AI-powered mobile sports talent
assessment, Sports Authority of India). Final-year project, CSD department, K. K. Wagh Institute,
Nashik. Not an official SAI product.

## Quick start

Requires **Node ≥ 22.5**.

```bash
npm install
npm run dev:web      # web app on http://localhost:5174 (no API needed)
```

Open http://localhost:5174 in Chrome. The camera needs `localhost` or HTTPS. No camera? Every
exercise has **Watch demo**, which runs a synthetic athlete through the real engine, and **Analyse video**,
which takes an uploaded clip.

```bash
npm test             # engines + API + web
npm run build        # production build → dist/
```

## What it does

- **90 exercises in 8 categories:** Gym, Calisthenics, Athletics, Throws & Strikes, Olympic lifts,
  SAI battery, Yoga, Mobility.
- **Live feedback:** joint angles colour-coded on the video, angle chips, a rep/hold/attempt
  counter, a running form score, spoken cues, and a framing → hold still → countdown flow.
- **Session report:** time, reps (correct / partial / rejected), reps per minute and per second,
  eccentric/concentric tempo, range of motion ± SD, time under tension, fatigue drift, consistency,
  per-joint time in each zone, left/right symmetry, angle noise, jump height from flight time and release angle.
  It closes with a coaching list and can be printed or exported as JSON.
- **Local history and profile:** stored on the device only. Pose model lite/full/heavy, voice on/off,
  dark or light theme.

## How it works

| Step | Method |
|---|---|
| Pose | MediaPipe Pose Landmarker (on-device, Apache-2.0) |
| Angles | 2D joint angles in the image plane, x scaled by aspect ratio (MediaPipe z is not used) |
| Smoothing | One Euro filter per landmark (tunable in `FILTER`) |
| Reps | Schmitt-trigger counter on a driver angle, with minimum rep time and depth check at the extreme |
| Holds | Timer runs while every hold check is green/amber |
| Throws | Release = peak wrist speed; release angle from raw landmarks |
| Jumps | Toe-off → toe-contact flight time, h = g·t²/8 |
| Precision | Angle noise = SD of raw angle about a 5-frame moving average |

Every exercise is data, not code: angles, green/amber bands, rep rule, cues and rationale all live in
`packages/engines/src/motion/catalog/*.ts`. Single-camera numbers are screening estimates, not
clinical measurements.

## Repository

```
packages/engines/src/
  motion/        exercise schema, MotionSession engine, demo athlete, 90-exercise catalog, tests
  jump/ crypto/ potential/ gamification/ …   earlier engines (jump analyzer, signing, scoring, badges)
apps/web/src/
  app/           landing page, library, exercise sheet, live session, results, history, profile,
                 Liquid Glass design system (glass.css, landing.css)
  pose/          camera and video-file pose sources
apps/server/     Node API (auth, signed assessments, Supabase). Not used by the current web app.
docs/            architecture, API, research notes
```

Design notes: `apps/web/PRODUCT.md` and `apps/web/DESIGN.md`. Credits for adapted open-source ideas:
`THIRD_PARTY_NOTICES.md`.

## Status

- **Working:** web app, 90 exercises, demo and video modes, and reports. Tests: 57 engine and 21 API.
- **Not yet verified:** live camera accuracy on real athletes.
- **Paused:** email sign-in and cloud sync. The server code remains; the web app runs fully offline for now.
- **Known limits:** unilateral poses assume a fixed leg (tree pose and flamingo stand on the left leg;
  warrior I/II put the left leg forward). Throws assume a right-hander.

## Team

M. P. Deshmukh (guide) · Shivanjay Bajpai · Deepasha Sakhare · Aryan Sukhwal · Kadamb Sonawane

## License

MIT. Third-party notices in `THIRD_PARTY_NOTICES.md`.
