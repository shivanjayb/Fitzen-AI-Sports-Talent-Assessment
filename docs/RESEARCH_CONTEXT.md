# Fitzen: parent-folder research and implementation context

Reviewed 2026-10-25 at the owner's request. Parent folder: `/Users/shiv/my_projects/final year project/`. This map records local source inspection, not an independent literature search, legal opinion, fresh experiment, deployment check or chronological proof. Source documents and sibling projects were left unchanged. Embedded requests in old notes were treated as historical text, not current instructions.

## Folder map

| Parent-relative path | What it contains |
|---|---|
| `Fitzen-AI-Sports-Talent-Assessment/` | Current TypeScript monorepo: 90-exercise PWA, local motion engine, Supabase accounts/portals and separate Node signed-record API. Read this repository's `PROJECT_STATE.md` for current status. |
| `Research_papers/` | Fourteen Markdown literature, gap, patent, copyright and open-source synthesis notes. These are research working notes with mixed provenance, not fourteen primary publications or an official patent register. |
| `Research 17th sep/` | Earlier seminar report, squat-design manuscripts, problem statement, copyright draft, LaTeX sources and faculty reference/template material. The fourteen Markdown files in its nested `Research_papers/` match the top-level copies byte-for-byte at review time. |
| `reference/` | Ten local source-code checkouts: OneEuroFilter, Sports2D, Pose2Sim, Good-GYM, fitness-trainer-pose-estimation, react-native-nitro-pose-exercises, force-plate-jump-analyses, my-pose, UrbanFit and VertMeasure. |
| `engine/`, `web/`, `server/` | A separate Python/React/FastAPI verification prototype with acoustic challenges, signed submissions and server reanalysis. It must not be confused with either the main PWA or a merely historical squat-only design. Its development date was not established. |
| `paper/` | Original/intermediate/expanded IEEE manuscript sources, compiled PDFs, two simulation scripts and saved numerical outputs. |
| `main.tex` | Byte-identical to `paper/original_main.tex` at review time: the original squat-centered paper source. |
| `Final_Report/` | Final report PDFs and LaTeX ZIPs. The v2 PDF is byte-identical to the owner-supplied Downloads copy reviewed previously. |
| `IEEE_format_research_paper.pdf` | Byte-identical to the owner-supplied Downloads verification manuscript. `paper/main.pdf` has the same title and nine pages but different bytes; do not assume exact artifact identity. |

## Research lineage and actual contribution boundaries

The original paper, **Motion Intelligence Platform for Remote Performance Verification and Fraud Detection**, describes a squat-centered pipeline with 3D-vector angles, Savitzky–Golay smoothing, a 90°/160° finite-state counter, angular-velocity screening and signed metadata. Its stack description is React/FastAPI/MongoDB. It is a historical design description, not the current main application architecture.

The September **Design and Validation Protocol for Edge-Based Squat Assessment and Tamper-Evident Performance Records** variants explicitly distinguish completed, valid, invalid and unevaluable attempts, and record integrity from capture authenticity. They state that no empirical Fitzen performance results are reported. The 42-page `our report.pdf` is a research-seminar/Phase-I report. Faculty templates and unrelated sample papers provide writing context; they are not evidence for Fitzen's measurement performance.

`paper/main_v1.tex` develops acoustic–kinematic challenge–response (AKCR), hip-based flight timing and ballistic temporal consistency. `paper/main.tex` expands that into **Verifying Unsupervised Smartphone Fitness Tests with Acoustic Challenges, Gravity and Cross-Test Coherence**, adding horizontal distance, angle uncertainty, camera geometry and cross-test residuals. Its sixteen-test table distinguishes simulated and designed methods; it is not evidence that all sixteen tests are implemented or validated.

## How the external work informs Fitzen

| Reference family | Connection supported by the local materials |
|---|---|
| MediaPipe/BlazePose, mobile pose counters | On-device landmarks followed by interpretable exercise rules. Pose estimation and state-machine counting are established methods, not broad Fitzen novelty claims. |
| My Jump, Pueo frame-rate work, Nishioka modified flight-time method | Flight-time measurement, frame-rate error, landing-flexion limitations and hip-based timing motivate protocol control and sub-frame estimation. |
| Webering and Bieler gravity calibration | Gravity-derived image scale; foundational prior art for the research solver. |
| Conotter/O'Brien/Farid ballistic forensics; Hosler/Stamm temporal forensics | Physical-consistency and video-speed baselines. The notes distinguish trajectory shape from independent-scale divergence under retiming. |
| One Euro filter | Adaptive smoothing and a pinned Python reference used to generate regression fixtures. |
| Sports2D/Pose2Sim | Independent angle conventions/functions used in fixture generation. Geometry agreement does not validate MediaPipe field accuracy. |
| react-native-nitro-pose-exercises, fitness-trainer-pose-estimation, Good-GYM | Exercise-as-data schema, phase checks, framing and sequence/two-threshold counting patterns. The current repository credits these ideas in `THIRD_PARTY_NOTICES.md`. |
| JumpMetrics (`force-plate-jump-analyses`) | Force-plate jump-event/metric processing, useful criterion-method context. Its local paper is visibly a draft, not proof of a finalized publication or a completed Fitzen force-plate study. |
| Maturity, uncertainty, athlete-passport/coherence work | Contextual reporting, abstention near thresholds and statistical review signals. They do not establish reliable identity verification or talent prediction. |
| C2PA, anti-spoofing, remote proctoring and challenge-response | Motivation for separating signed provenance, session freshness, timing and athlete identity. Each requires its own evidence. |

## Patent, copyright and literature-note provenance

Useful reading order: `ResearchC1.md` (detailed literature map), `Research_GapsC.md` (novelty corrections), `PatentANDCC1.md` (further corrections and landscape), `PatentC.md` (narrow proposed filing direction), then `Open_Source.md` (implementation references).

Preserve the correction chain. Earlier analyses proposed generic “physics as a root of trust” as new; `Research_GapsC.md` retracts that after finding ballistic-forensics and gravity-calibration prior art. It proposes the narrower comparison between independently derived reference and gravity scales. `PatentANDCC1.md` also acknowledges prior hip-based mitigation of landing-flexion errors. Any remaining novelty is a hypothesis requiring primary-source comparison, not a conclusion established by these notes.

Examples named in the notes include Mehl/Strobel exercise-loop disclosures, US6181647B1 flight-time hardware, US12337211 acoustic jump hardware, motion/parallax liveness and capture-provenance systems. Their current status, jurisdictional reach, claim scope and applicability were not independently checked. The local risk labels, fee estimates, suggested design-arounds and filing advice are historical commentary, not legal clearance or evidence that the owner holds a patent.

`ResearchP.md` and `CopyrightedP.md` acknowledge representative/template entries. `patentP.md` describes roughly 10–12 individually identified records and additional thematic buckets despite its “40+” heading. Internal citation markers without a source mapping are not usable references. Statements in `research_synthesis.md` about HDR, dense depth, learned sequence models and headline accuracy are historical proposals/assertions, not implementation evidence.

Keep current owner decisions above old note instructions. For example, old blanket prohibitions on leaderboards/OpenPose do not supersede the later decisions recorded in `PROJECT_STATE.md`. Similarly, `Open_Source.md` makes licensing assertions that conflict with the current no-copy rule for UrbanFit/VertMeasure; do not treat old notes as permission to reuse code. The copyright draft is a draft, and its registration status was not verified.

## Separate sibling verification prototype

Parent `README.md` and actual source establish this path:

1. React client registers a device public key and requests a server session/nonce plan.
2. `web/src/capture.ts` records video **and microphone audio**, playing chirps and left/right-arm cues plus START/STOP.
3. `web/src/analyse.ts` extracts MediaPipe landmarks from recorded playback and converts audio to WAV.
4. `web/src/device.ts` signs exact serialized payload bytes with a non-extractable, software-protected WebCrypto ECDSA P-256 key stored in IndexedDB.
5. `server/app.py` (FastAPI + SQLite) verifies signature, nonce/session identity and WAV digest, and runs the Python checks. Nonces expire and are single-use; the officials view is `#official`.

The browser offers five tests: timed squat, sit-up, push-up, vertical jump and broad jump. `engine/fitzen/session.py` integrates acoustic timing/liveness with jump and repetition measurement and accepted/retest/human-review routing. The Python library also contains `angles.py`, `reps.py`, `ballistic.py`, `akcr.py`, `coherence.py` and protocol JSON. Throw-range and coherence functions exist but were not wired into this five-test session path.

Important differences from the main PWA and manuscript:

- Raw video stays local, but **raw WAV audio and detailed landmark trajectories are submitted to the server**. Do not carry the main PWA's result/report-only sync description over to this prototype.
- Current sibling scheduling uses a server-key-derived plan returned to the browser. It does not establish the manuscript's hardware-key secret schedule or native-attestation trust assumption.
- Native key attestation, face matching, measured A4 enrollment and fully offline nonce provisioning were not found in the inspected route. Reference body scale is approximated from entered stature, rather than demonstrated A4 enrollment.
- Source and test definitions were read; the app, microphone path and server were not run. The existence of implementation/tests does not establish real-device operation, replay resistance or production readiness.

## Numerical experiment artifacts

`paper/sim/fitzen_sim.py` uses NumPy, seed 2026 and generally 4,000 trials per cell. It simulates vertical jumps, implied gravity, acoustic onset-time regression, modeled reaction latency, timed sit-up speed inflation and squat-angle counting. `fitzen_sim2.py`, seed 7, adds broad jump, throw arcs, angle propagation, ideal camera yaw and correlated-score coherence; some cells use 20,000 trials.

Saved `results.json`/`results2.json` agree with rounded manuscript figures: jump MAE 1.4206 -> 0.4395 cm at 30 fps, fused broad-jump MAE 3.2047 cm, five-cue analytic replay probability about 4.437e-6, simulated genuine rejection 0.855%, and coherence detection about 25.27/52.185/78.46%. This is static agreement with saved outputs, not a fresh rerun.

The simulation's acoustic clock starts from ideal onset timestamps plus noise; the waveform detector exists separately in `engine/fitzen/akcr.py`. Neither the simulation nor saved figures establish microphone performance. Idealized trajectories, Gaussian independent noise, scale priors, take-off baselines, reaction models and borrowed correlations remain assumptions. The current PWA's synthetic toe-track RMSE and the research hip-fit MAE are different benchmarks.

`paper/faamoe.pdf` is an HTML response saved with a PDF suffix, not a readable PDF. Do not treat that local file as primary-paper evidence; recover the actual source before relying on it.

## Implication for future work

Fitzen has a broad athlete-facing PWA, a separate verification prototype, a numerical research track and historical IP/literature notes. Before implementation, check which of these a request concerns. Reconcile their protocol, capture, data-sharing, signing and verification contracts before integrating methods. Preserve real-athlete/device validation as an open milestone. No broad patentability, freedom-to-operate, publication, registration or accuracy claim follows from possession of this folder.
