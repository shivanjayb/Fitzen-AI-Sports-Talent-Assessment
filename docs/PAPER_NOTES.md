# Research paper: study notes

Digest of the owner's research paper, **FITZEN_Paper2_similarity_fixed.pdf** (8 pages, IEEE two-column LaTeX, built 2026-11-18 14:23 IST), read in full on 2026-11-21. The owner calls this the official paper. Its title matches the one published in **IJEDR Vol 14 Issue 4 (Nov 2026), Paper ID IJEDR2604502**, per the final report's Annexure C. "similarity_fixed" suggests the version revised after a similarity check. The PDF is not in this repository.

## Identity

- **Title:** FITZEN: Verifying Unsupervised Smartphone Fitness Tests with Acoustic Challenges, Gravity and Cross-Test Coherence.
- **Authors:** M. P. Deshmukh, Shivanjay Prakash Bajpai, Deepasha Nagsen Sakhare, Aryan Sukhwal, Kadamb Ganesh Sonawane (Dept. of CSD, KKWIEER Nashik).
- **Index terms:** pose estimation, remote fitness assessment, anti-cheating, challenge–response, liveness, projectile motion, measurement uncertainty, talent identification.
- **Positioning:** a verification-first pre-screening instrument for the national talent battery on entry-level phones, forwarding credible remote results to scarce centre slots. Explicitly not a predictor of talent. **Every result is from simulation.**

## Argument

KIRTI assessed ~51,000 of 3,62,683 registered athletes, so 86 % never took a test. Phones can already measure (My Jump pooled r 0.989; sprint within ~10 ms of photocells). The hard part is trust: validations assume a supervisor, and signing only proves a record wasn't altered, not that the performance was real. The question: what can an INR 10,000 phone verify from inside the recording itself?

## Five contributions

1. **Threat model** (Table II): protocol attacks (A1 partial range, A2 knee tuck), media attacks (A3 speed change, A4 cut/splice, A5 replay, A6 record tampering, A7 generated video), identity attack (A8 a stronger peer). Assumes an attested genuine binary and unbroken crypto; a fully compromised OS and real-time full-body generative avatars (< 0.8 s latency) are out of scope.
2. **AKCR (acoustic–kinematic challenge–response):** server issues a single-use nonce; device seeds a PRNG with HMAC-SHA256(K_d, n), K_d in the hardware keystore; M chirps (40 ms sweeps, 2.5–5.5 kHz) played by the phone's own speaker and recorded by its mic; m of them are cues (start, stop, raise left arm, raise right arm), revealed only as they play. Matched filtering finds onsets; regression gives playback-speed slope k̂ and residuals (missing/duplicated chirp = cut). Liveness: movement onset must fall in [L_min, L_max] after each cue; replay passes with p = (L_max − L_min)/(W b) per cue, P_replay ≤ pᵐ. Offline use: a batch of signed nonces, each rejected if reused.
3. **Gravity-referenced ballistic solver:** fit y = c₀ + c₁t + c₂t², x = d₀ + d₁t to the airborne hip (jumps) or ball (throw). Vertical jump: T̂ = √(c₁² − 4c₂c₀)/|c₂|, h = gT̂²/8, timed from the hip (after Nishioka) so knee tuck can't stretch flight. Broad jump/throw: gravity as a ruler, S_g = 2|c₂|/g px/m, fused by inverse variance with an enrolled segment scale S_r (shoulder–ankle measured once beside an A4 sheet, 2 % prior). Implied-gravity check: k̂ = √(S_r/S_g), g_impl = g/k̂² (a 10 % slowdown adds 21 % to jump height). Throw range from intersecting the fitted arc with the ground line.
4. **Angle uncertainty and capture geometry:** σ_θ = σ√(1/a² + 1/b² − 2cosθ/(ab)) (Eq. 3). A rep whose deepest angle is within 2σ_θ of the threshold is labelled uncertain. Capture asks the athlete to step closer until the thigh spans enough pixels (σ 3 px: 120 px thigh ≈ 3°, 240 px ≈ 1.4°). Yaw gate: current/enrolled thigh-shank length ratio ≥ 0.97 (yaw ≈ 20°, knee error < 1.6°).
5. **Cross-test coherence:** convert results to age/sex z-scores; predict each from the others with a multivariate-normal conditional mean; residual r_j; flag max |r_j| above a 5 % false-alarm threshold. Correlations borrowed from youth studies (VJ–BJ 0.74; jumps–sprint 0.62–0.72). A flag means look, not a verdict.

Also: deterministic repetition automata with hysteresis δ (squat: State 0 θ ≥ 160°, descent, depth at the protocol condition such as θ ≤ 90° half squat or hip below knee, ascent, count if 0.8–4.5 s; attempted vs valid reported separately; validity from absolute protocol thresholds, not comparison with a stored example). Smoothing: MediaPipe's One Euro plus a 5-point quadratic Savitzky–Golay offline; lower-body visibility < 0.65 excluded. Maturity offset from Moore et al. (boys −8.128741 + 0.0070346·a·H_s; girls −7.709133 + 0.0042232·a·H), shown as context only. Payload: per-rep validity and uncertainty, flight parameters, AKCR stats, nonce, capture rate, landmark digest; JCS (RFC 8785) → SHA-256 → ECDSA P-256 (Android hardware keystore with attestation in the native design; non-extractable WebCrypto key in the web prototype). Raw video stays on the phone.

## Prototype described

A browser prototype runs **five tests** (squat, sit-up, push-up, vertical jump, broad jump): records video and audio while playing the AKCR schedule, runs MediaPipe on the recording, signs landmarks, timestamps, nonce and audio digest with WebCrypto. A **FastAPI** server verifies the signature and re-runs every check with a Python reference implementation. A native Android client (high-speed capture, hardware key attestation) is future work.

## Sixteen-test catalogue (Table III; S = simulated, D = designed only)

S: vertical jump, standing broad jump, medicine-ball throw, sit-ups (30 s), squat.
D: standing height, sitting height, weight (photograph of the scale display), sit-and-reach, push-ups, plank, flamingo balance (falls/60 s), plate tapping, 30/50 m sprint, 4×10 m shuttle, 600–1600 m run (GPS only as corroboration). Rules: never estimate weight from images; all timed tests start and stop on AKCR cues.

## Simulation results (Monte Carlo, usually 4,000 trials, code and seeds released)

- **Vertical jump (Table IV, MAE / 95 % LoA half-width, cm):** σ 4 px at 30 fps: frame count 1.42/3.44, sub-frame fit **0.44**/1.08, g-constrained 0.41/1.03. The fit at 30 fps matches ideal frame counting at ~100 fps. At σ 8 px noise, not frame rate, limits accuracy.
- **Broad jump (Table V, MAE cm, σ 4 px):** at 30 fps gravity alone 6.38, segment 3.46, **fused 3.20**, A4 in plane 1.76 (but an A4 sheet 2 %/5 % nearer the camera biases by −3.7/−9.0 cm). Fused at 240 fps 2.45.
- **Throw:** range error 5.6 cm (30 fps) / 4.1 cm (60 fps) with the whole arc visible; 15.0/10.4 at 70 %; 37.6/26.3 at half. Capture requires ≥ 70 % of the predicted arc.
- **Angles:** Eq. 3 confirmed within 1 %; knee near 90° at σ 3 px: 5.8° (60 px), 2.9° (120 px), 1.4° (240 px). Yaw 10/20/30° gives up to 0.4/1.6/3.7° knee error.
- **Time base:** implied gravity detects a 1.05× slowdown in 87.6/95.6/98.8/99.3 % of jumps at 30/60/120/240 fps and every ≥ 1.10×. AKCR with ten chirps in 30 s: σ_k̂ = 8.2 × 10⁻⁵, so a 1 % speed change is > 100 SDs out.
- **Sped-up sit-ups (Table VI):** angular-velocity limit at 294°/s catches 2.0 / 8.4 / 30.3 % of 1.10× / 1.25× / 1.50× speed-ups; AKCR > 99.9 % for all. (The final report phrases the 1.25× case as "missed 91.6 % of the time".)
- **Replay (Table VII):** all cues required: 3/4/5 cues give replay acceptance 6.1 × 10⁻⁴ / 5.2 × 10⁻⁵ / **4.4 × 10⁻⁶** with FRR 0.37 / 0.74 / **0.86 %**. Allowing one miss cuts FRR below 0.01 % but raises replay acceptance 30–55×.
- **Coherence:** a peer scoring 1.0/1.5/2.0 SD above the athlete is flagged in 25.3/52.2/78.5 % of sessions at 5 % false alarms.
- **Rep counting under jitter:** single raw threshold MAE 9.67 reps at σ 4°; Savitzky–Golay alone 1.79; hysteresis automaton exact at σ ≤ 4°, 99.9 % exact at 6°, every partial rep rejected.

## Limitations the paper states

All results are simulated; noise, reaction latency, take-off height and drag-free throws are assumptions; no accuracy claim before the field study. AKCR assumes an attested app: a rooted phone injecting streams, or chirps from a second speaker while filming a screen, needs attestation and screen-recapture detection, not built yet. Ambient noise or OS echo cancellation can suppress chirps, so detectability must be confirmed before a test. Coherence correlations come from other populations and need Indian norms. Maturity equations are biased at extremes. Minors need verifiable guardian consent and percentile bands instead of public rankings.

**Planned field study:** consenting adult volunteers, ≥ 3 entry-level Android phones; criteria: 240 fps hip flight-time reference and tape (jumps), tape (throw), two human counters (reps), goniometer (angles); attacks: knee-tuck, partial reps, ffmpeg re-timing 0.8–2.0× plus transcoding, screen replay, peer substitution; report MAE, Bland–Altman, count agreement, ROC, reaction latencies, FRR.

## Paper versus this repository's app (checked 2026-11-21)

These are different systems; do not merge their numbers or features.

| Paper | Main Fitzen PWA (this repo) |
|---|---|
| AKCR chirps, cue binding, nonce schedule | Not present. Lives in the sibling research prototype (`engine/fitzen/akcr.py`, see `RESEARCH_CONTEXT.md`). |
| Jump timed from the **hip**; MAE metric | Jump timed from the **toes** (`engine.ts`: parabola on raw airborne toe heights); report quotes RMSE. Both say 0.44 cm, but on different harnesses and metrics. |
| Broad jump and throw distance via gravity scale | App reports no height or distance for broad jumps/throws (report constraint). |
| Savitzky–Golay offline, visibility 0.65 | One Euro live, zero-phase Butterworth offline, visibility 0.5. |
| Yaw gate: length ratio vs **enrolled** segment ≥ 0.97 | Foreshortening gate: smoothed length vs **running max** ≥ 0.87. |
| Validity from absolute protocol thresholds only | App also checks a movement signature against the synthetic reference (wrong-exercise detection). |
| Squat states at 160° / protocol depth, 0.8–4.5 s | Back squat enter 150°, exit 165°, target 80°, min 1 s. |
| Cross-test coherence, face match, A4 enrolment, hardware attestation | Not in the app (coherence code exists only in the sibling Python library, not wired in). |
| Five-test browser prototype + FastAPI server receiving audio and landmarks | 90-exercise PWA; signed-in sync sends reports, never video or audio. |
| Signs with ECDSA P-256 over JCS | Engines have ECDSA P-256 signing and an audit chain, used by `apps/server`, not by the web flow. |

Compared with the earlier 9-page manuscript reviewed 2026-10-25 (`IEEE_format_research_paper (1).pdf`), this version is 8 pages, and its prototype paragraph names a browser + FastAPI verification server instead of FastAPI/MongoDB.
