# Final project report: study notes

Digest of the owner's final B.Tech report, **"Fitzen_BIG BOSS (1).pdf"** (101 pages, LaTeX, built 2026-11-18), read in full on 2026-11-21. The PDF itself is not in this repository. Figures below are what the report states. Where code was spot-checked, that is marked. Numbers are synthetic-harness results unless stated otherwise.

## Identity

- **Title:** FITZEN: Motion Intelligence Platform for Remote Performance Verification and Fraud Detection.
- B.Tech Computer Science and Design, K. K. Wagh Institute of Engineering Education and Research, Nashik (autonomous, SPPU), A.Y. 2026-27.
- Team: Shivanjay Prakash Bajpai (B231313005, lead: architecture, engine, catalogue, validation, anti-cheat, athlete modules, auth, deployment), Deepasha Nagsen Sakhare (B231313066, literature, Phase I report, paper), Aryan Sukhwal (B231313074, requirements, testing, report), Kadamb Ganesh Sonawane (B231313073, first suite, badges, 3D model, offline sync, Supabase migration, serverless API). Guide: Prof. Manodnya Deshmukh. HoD Dr. Y. D. Bhise; Director Dr. K. N. Nandurkar.
- Keywords: pose estimation, edge AI, sports talent assessment, repetition counting, jump height, video integrity, anti-cheat.

## Chapter map

| Ch. | Content |
|---|---|
| 1 Introduction | KIRTI scale problem (3,62,683 registered, ~51,000 assessed, 70 centres). Five contributions: one engine for 90 exercises; evidence control on every reading; sub-frame jump timing; physics anti-cheat; privacy by design. Motivation: measurement is solved (My Jump ICC 0.997, meta-analysis 0.989), trust and access are not; DPDP Act 2023 for minors. |
| 2 Literature | 4 domains (HAR/pose, phone measurement, rep counting, video forensics). Table 2.1: 14 studies. Table 2.2 vs My Jump, OpenCap, rep counters, Kinovea. Gap: they assume a supervisor, use hand-coded per-test logic, and report numbers without saying how much the camera saw. |
| 3 Problem and scope | Problem statement + 7 objectives. Scope: 90 exercises, live/upload (≤100 MB, ≤120 s)/demo, local history, guided 4-test battery, coach validation export, optional accounts. Out of scope: multi-person, clinical diagnosis, horizontal distance, sprint timing, real-athlete accuracy. Pipeline figure 3.2.1. Table 3.2.1: squat prototype → final system (3D→2D angles, Savitzky–Golay→One Euro/filtfilt, 4-state FSM→hysteresis, FastAPI/MongoDB→browser + Supabase + Node API). |
| 4 Plan | Jan–May 2026 selection/survey/Phase I; Jul first suite; Sep 16–21 offline sync, Supabase, Vercel; Sep 29–30 90-exercise engine; Oct 1–7 wrong-exercise, profile, audit, red team, battery; Oct 9–14 email sign-in, production, redesign; Nov–Dec real-athlete calibration (planned). |
| 5 SRS | FR-1..FR-16 and NFR-1..NFR-8 (privacy, security, performance 125 kB gzipped main bundle, honesty, reliability, usability, portability, maintainability). Constraints: monocular, ~30 fps, HTTPS, localStorage capped at 60 sessions, no horizontal distance, flamingo = time held, sit-and-reach = angle not cm, thresholds tuned on synthetic athlete. |
| 6 Design | Edge-first 3-tier architecture; L1 DFD; 10 modules (Table 6.2.1); catalogue (Table 6.2.2); integrity score 100 − 15/warn − 40/fail; data structures (PoseFrame, ExerciseDef, LiveState, SessionReport, SavedSession, SignedAssessment); two DB schemas (compete on Supabase: profiles, results, groups, group_members; assessment for the API: users, athlete_profiles, assessments, badges, notifications, settings); UML: use case, class, sequence, activity, state, deployment; tech stack; algorithms (a)–(i). |
| 7 Results | Setup: clean install, Node 22, Vitest 3.2.6, commit **1bc3204** (14 Oct 2026). Datasets (Table 7.1.1), test suites (Table 7.2.1), 22 test cases TC-01..TC-22 all pass, angle/jump/red-team tables. |
| 8 Conclusion | 6 conclusions, 6 future-work items, 5 applications (SAI/Khelo India pre-screening, school batteries, self-coaching, academy tracking, research base). |
| Annexures | A references [1]–[43]; B Turnitin; C published paper; D copyright; E competition certificates; F installation guide and user manual. |

## Algorithms as the report states them (spot-checked in code 2026-11-21)

- **Pre-processing:** x scaled by W/H; z ignored; visibility < 0.5 = missing. One Euro: f_min 1.5 Hz, β 10, d_c 1 Hz (matches `FILTER` in `packages/engines/src/motion/engine.ts`). Uploads: 2-pole Butterworth forward-backward as `scipy.signal.filtfilt` (odd padding 3(n+1)).
- **Angles:** A = arccos(u·v / ‖u‖‖v‖); T_vert = atan2(|dx|, −dy); T_horiz = atan2(|dy|, |dx|); flexion = 180° − A.
- **Foreshortening gate:** withhold when smoothed segment length < 0.87 × running max (cos 30°, 0.25 s window). Matches `minSegmentRatio: 0.87`.
- **Gap:** > 300 ms ends the current rep/hold/flight. Matches `GAP_MS = 300`.
- **Score:** S = 100 · Σ wᵢ(gᵢ + 0.6 oᵢ)/nᵢ / Σ wᵢ. Rep exercises: round(0.7 S + 30 N_valid/N). Grades A ≥ 90, B 80–89, C 70–79, D 60–69, F < 60, N/A without evidence. kcal = MET × 3.5 × m / 200 × t_min.
- **Reps (Algorithm 1):** Schmitt trigger on driver angle x = s·A; TOP (not ready) → ready after x ≥ exit → DOWN below enter → evaluate above exit; reject if < minRepMs; mismatch if signature wrong; valid = full range ∧ score ≥ 0.5. Back squat: enter 150°, exit 165°, target 80°, min 1 s; bottom knee 0–80°, trunk 15–55°, shin 5–40°.
- **Jump (Algorithm 2):** airborne when ground − toe > 0.08 × leg length; parabola fit of raw airborne toe heights gives sub-frame take-off/landing; accept 0.8 t_gate ≤ t_f ≤ t_gate + 300 ms; flights 120–1200 ms; height only for same-level vertical jumps; ∂h/∂t_f = g t_f/4 (10 ms ≈ 1.2 cm at 0.5 s).
- **Throw release:** wrist speed / body height; peak > 2.5 body-heights/s, release when < 55 % of peak, ≥ 1.2 s apart; release angle interpolated to parabolic vertex of the speed peak.
- **Movement signature:** knee/hip/elbow ROM, mean trunk lean, foreshortened fraction vs the exercise's synthetic reference; mismatch if a still joint (< 20°) moves > 50° (knee, hip) / 60° (elbow) / 100° (shoulder), a moving joint exceeds reference by > 55°, trunk differs > 40°, or an in-plane arm segment is out of plane > 50 % of frames.
- **Fatigue:** velocity-loss proxy VL = 100(1 − ω_last/ω_first); warn > 20 %; labelled an estimate.
- **Integrity (Algorithm 3):** scale = 0.93 × stature / p95 nose-to-ankle span; noise-corrected bone-length CV warn 3.5 % / fail 4.5 % (matches `BONE_CV_WARN/FAIL`); L/R drift > 5 %; backward timestamps, gaps > 3× median, irregular timing > 20 %; hip flight parabola gives implied g, inverse-variance mean, z = ln(g/9.807)/σ_rel, flag |z| > 2, fail > 3; also frozen frames, teleports, loops, interpolation, foot sliding. Re-timing by k scales g by k².

## Results to quote (synthetic, not real athletes)

- 259 tests: engine 202 (motion 26, integrity 20, reference/accuracy 60, catalogue audit 40, athlete/crypto/jump/badges 56), server 34, web 23. One 90-exercise sweep hit Vitest's 5 s timeout once (5.15 s), passed alone.
- One Euro matches reference to 5.6 × 10⁻¹⁶; angles match Sports2D to 6 × 10⁻¹² ° on 200 poses; filtfilt matches SciPy to 10⁻⁶.
- 240/240 rep clips counted exactly (24–120 fps, 16:9 and 9:16, σ ≤ 0.01, ≤ 10 % dropped frames).
- Driver-angle RMSE at 30 fps 16:9: live 2.56–3.73°, offline 0.86–3.05° (Table 7.3.1). Live filter lag 2.42° on a clean squat.
- Jump height RMSE at 30 fps σ 0.002: live 0.44 cm, offline 0.40 cm vs frame counting 1.58 cm (3.6× better). Demo jump 30.66 cm reads 30.4–30.7 cm. Advantage disappears by 120 fps.
- Throw release 0.23° RMSE clean (1.55° at σ 0.002, 6.60° at 0.005), so javelin/discus/basketball release scoring was removed. Holds within 0.11 s.
- Red team (Table 7.3.3): 0/6 false positives for squat, plank and jump; speed changes caught only for jumps (6/6); duplicated/interpolated, up-conversion and splices 6/6; matching-pose cut and 4 s loop 0/6 (stated limitation). 2× speed-up gives g = 40.7 m/s²; 0.5× gives 2.54 m/s².
- Second research prototype: acoustic challenge-response caught a 1.25× speed-up that the angular-velocity check missed 91.6 % of the time (modelled).
- Pre-registered field pass marks: jump bias ≤ 1.5 cm, LoA ±5 cm, ICC ≥ 0.90; hip/knee RMSE ≤ 10°; exact count in ≥ 90 % of sets.

## Annexure facts

- **Turnitin** (submission trn:oid:::3618:159051534, 18 Nov 2026, 62 pages, 13,618 words): 1 % similarity; AI-writing score below the 20 % reporting threshold; **1 integrity flag: 8 replaced characters (letters swapped with look-alikes from another alphabet) on 2 pages.**
- **Paper:** IJEDR Vol 14 Issue 4, November 2026, published 18-11-2026, Paper ID IJEDR2604502, Registration 310412, title *FITZEN: Verifying Unsupervised Smartphone Fitness Tests with Acoustic Challenges, Gravity and Cross-Test Coherence*, all five authors.
- **Copyright:** Diary No. LD-30387/2026-CO, *FITZEN Decentralized Edge-Native Biomechanics and Cryptographic Assessment Engine* (status page only, registration outcome not stated in the text).
- **Competition:** participation certificates for all four students (event name is in the images, not the text layer).

## Where the report differs from the current code (as of `16bff65`, 2026-11-16)

| Report says | Repository now |
|---|---|
| 259 tests (202/34/23) at `1bc3204` | `PROJECT_STATE.md` Log 2026-11-13: web 68/68, server 34/34, engines 220/222 (two known accuracy/realism cases). |
| Hosted AI disabled, `api/ai.ts` returns 503 | Still true for `api/ai.ts` (checked). But main now also has a Supabase edge function `ai-coach` (Gemini, adults only, numbers only, on-device fallback), migration 010. |
| Partial Hindi | English, Hindi, Marathi, Tamil, Telugu athlete flows. |
| Sync sends only the headline number and form score | Signed-in users also back up full session reports (`sessions`); see `PROJECT_MEMORY.md` drift traps. |
| Install guide: "run the three SQL files" | `supabase/migrations/` has 001–010. |
| Tabs Train/Progress/Compete/History/Profile | Later redesigns changed the shell (Home/Train/Reports/Health/Profile on phones). |
| Not covered | Wellness (sleep, Bluetooth HR/HRV, Health/Fitbit/Garmin/CSV import), food-photo nutrition, view-angle detection, streaks, coach chat and 14-day coach access, activity/size-class boards, Capacitor iOS/Android projects. |
| Future work 4 (scout dashboard) and 6 (native app) | Partly done: coach/admin portals; Capacitor shells (unsigned, untested on phones). |
| §3.2: "our research paper outlines the first version (squat only)" | The paper actually published (IJEDR2604502) is the second, AKCR/gravity/coherence manuscript. |

## Report-quality observations (for revision or viva)

- Much of the prose carries inserted filler ("in many respects", "broadly speaking", "in actual application", "to a significant degree") and some garbled sentences, e.g. abstract "every speed-changed, copied, interpolated or spliced jump was; indeed, all 259 automated tests are passing", and "remain grateful will be forevered", "personneled", "an formal product". It reads like output of a paraphrasing tool.
- Together with the Turnitin homoglyph flag, an examiner may ask about it. Cleaning the prose and removing the substituted characters would be safer before final submission.
- Page 1 of the abstract starts "Beyond this, Talent scouting…" (dangling connective).
