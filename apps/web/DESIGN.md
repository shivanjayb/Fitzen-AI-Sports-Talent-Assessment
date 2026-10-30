---
name: Fitzen Quiet Performance
description: Calm, accessible performance and personal records, adapted from the approved HTML concept.
colors:
  ground: "#f4f4f1"
  surface: "#ffffff"
  ink: "#252521"
  secondary: "#62635b"
  accent: "#a5442b"
  divider: "#dedfd7"
  action: "#252521 / #ffffff"
typography:
  font: "platform system stack, no bundled fonts"
  title: "clamp(1.8rem,3vw,2.4rem), weight650, tracking -0.035em"
  body: "1rem / 1.5"
---

# Fitzen Quiet Performance

The application uses the owner-approved Quiet Performance concept from `docs/design/quiet-performance/`, with real application behavior and clear empty states. Source: `src/app/quiet.css` after legacy `glass.css`; route styles in `dashboard.css`, `training-quiet.css`, and `wellness.css`. The existing landing page retains its scoped broadcast-demo treatment.

- Warm light canvas, white content surfaces, graphite text and restrained ember actions. Profile retains a dark preference with warm charcoal surfaces. Form judgement colors remain green/amber/red. No decorative data or synthetic user statistics.
- System typography, tabular measurements, 44px controls, readable input text, explicit focus, reduced-motion/transparency handling, safe-area padding. Existing Fitzen athlete mark and exercise media; incorrect or missing media uses the equipment-correct drawn athlete.
- Desktop header and sticky navigation. Phones: Home, Train, History, More. More groups health, training and account tools. No ten-destination phone tab strip.
- Home at `/home` uses actual eligible reports, weekly activity, compatible comparisons, latest manual signals, local coach and useful next actions. Missing signals are missing, never inferred zero. Detailed Progress/goals remain at `/progress`.
- Train searches and filters all 90 exercises. Guided four-test assessment is primary. Detail, camera, local video, demo, lesson and per-exercise history remain connected. History filters real/demo/review attempts and keeps them distinguishable.
- Compatible trends require exercise, metric, unit, recorded protocol and engine version. Repetition comparisons use standard-depth targets. Session charts stay with their original reports.
- Wellness data is dated manual entry with validation, history, edit/remove/undo and optional account sync. Nutrition shows logged totals; lab trends separate test/unit. Recovery uses actual post-session check-ins. Camera does not measure HRV, sleep or resting heart rate.
- Existing authentication, account sync, local coach and coach/admin controls retain service boundaries. Unsupported wearable/hosted-AI/file-import actions are described honestly in Connections.

See `docs/design/quiet-performance/INTEGRATION.md` for backend setup and verification limits. Motion engine accuracy and live-provider readiness are separate release gates.
