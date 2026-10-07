# Fitzen measurement validation plan

This document lists every number the live camera engine
(`packages/engines/src/motion/engine.ts`, class `MotionSession`) reports. For each one it gives:

1. the method and governing equation, taken from the engine source;
2. the best published accuracy for that method with a smartphone or markerless 2D pose, with citations;
3. the main error sources and the camera protocol that reduces them;
4. an **acceptance test**: the threshold Fitzen must meet and how to measure it;
5. the public ground-truth datasets that can be used for that metric.

Literature review compiled 2026-09-30.

**Source rule.** Every source cited with numbers below was opened and read (full text through Europe PMC
or the publisher, or the official dataset page). Anything not opened is tagged **[unverified]** and
collected in §10. Thresholds labelled **"Fitzen target"** are our own engineering choices. Each one
is anchored to the cited numbers but is not itself a published standard.

---

## 0. Common pipeline (applies to every metric)

| Step | What the engine does | Source line |
|---|---|---|
| Landmarks | MediaPipe/BlazePose 33-point 2D landmarks per frame; `z` is ignored | `engine.ts` header |
| Aspect correction | `x' = x · (W/H)` so that x and y share one unit (frame heights) | `push()` |
| Smoothing | One Euro filter per coordinate, `minCutoff = 1.5 Hz`, `beta = 10`, `dCutoff = 1 Hz`; landmarks with visibility < 0.5 are treated as missing | `FILTER`, `OneEuro` |
| Raw path | Throw and jump directions use **unfiltered** landmarks, because filter lag bends a fast trajectory | `stepEvent()` |

One Euro filter (Casiez, Roussel & Vogel, CHI 2012, doi:10.1145/2207676.2208639) **[unverified: paper
not opened; DOI seen in search results only]**. The update is

```
α(fc) = 1 / (1 + 1/(2π·fc·Δt))
dx̂ ← dx̂ + α(dCutoff)·((x − x̂)/Δt − dx̂)
x̂  ← x̂ + α(minCutoff + β·|dx̂|)·(x − x̂)
```

The filter trades jitter at rest against lag at speed. Any acceptance test below must be run with
the shipped `FILTER` values. If they change, the tests must be re-run.

---

## 1. 2D joint angles (per joint)

### Method
Included angle at joint `b` between segments `b→a` and `b→c` in the image plane:

```
θ = acos( (u·v) / (|u||v|) ),  u = a − b,  v = c − b        (jointAngle)
segment vs vertical   φ = atan2(|Δx|, −Δy)                  (vsVertical, image y points down)
segment vs horizontal ψ = atan2(|Δy|, |Δx|)                  (vsHorizontal)
```

Reported per joint: live value, left/right values, a zone (`good/ok/bad`), and session
mean, SD, min, max and noise (`AngleStat`).

Fitzen reports the **included** angle. Most biomechanics papers report **flexion**. For hinge joints
these relate as `flexion = 180° − θ`. Convert before comparing.

### Best published accuracy (markerless vs optical motion capture)

| Study | Setup | Result |
|---|---|---|
| Rode et al. 2025, *Sci Rep* 15:38767, doi:10.1038/s41598-025-22626-7 (Physio2.2M) | 11 open-source monocular estimators, 25 participants, 30 Hz webcams at 3–3.5 m, frontal + sagittal views, Vicon 200 Hz | 2D knee flexion MAE **9.3–21.9°**, 2D elbow MAE **21.5–28.9°**. Best 2D: RTMPose "Performance", knee MAE 9.3°. BlazePose World-Heavy (3D): knee 17.2°, elbow 18.3°. The authors cite **< 5°** as the error needed for clinical interpretation; no model reached it. |
| Iizuka et al. 2026, *Front Sports Act Living* 8:1831625, doi:10.3389/fspor.2026.1831625 | Browser-based monocular webcam, sagittal bodyweight squat, 30 males, fixed camera distance and orientation, vs 3D OMC | Raw bias hip **−11.2°**, knee **−10.6°**; RMSE hip 11.6°, knee 10.9°. After a geometry-informed linear correction (leave-one-subject-out): bias 0°, RMSE hip **4.0°**, knee **3.9°**. |
| Russo et al. 2026, *Sensors* 26:2148, doi:10.3390/s26072148 | Single smartphone + MediaPipe, gait, 27 volunteers, vs APDM OPAL IMUs | Knee flexion MAE **4.10° / 3.15°** (right/left); knee ROM MAE about 4.2–4.6°. Ankle agreement was poor. |
| Okuno et al. 2026, *Sensors* 26:5890, doi:10.3390/s26185890 | MediaPipe, OpenPose and HRNet vs physiotherapist, static lower-limb flexibility and ROM tests | ICC ≥ 0.87, r² ≥ 0.80 (HRNet MTT 0.73). Fixed biases were found, e.g. weight-bearing lunge **−6.25° to −7.17°**. The authors conclude the values are "not directly interchangeable" with manual cut-offs. |
| Mercadal-Baudart et al. 2024, *Heliyon* 10:e27596, doi:10.1016/j.heliyon.2024.e27596 | Single camera, 3D lifting (Strided Transformer) trained on Vicon exercise data; squats, deadlifts, CMJ, drop jumps | RMSE < 10° for shin, knee, hip flexion and trunk; < 15° for shoulder flexion. The authors use < 12° as "good" (better than a physiotherapist judging by eye) and < 6° as "very good". |
| Uhlrich et al. 2023, *PLOS Comput Biol* 19:e1011462, doi:10.1371/journal.pcbi.1011462 (OpenCap) | **Two** iPhones, 60 Hz, 720×1280, 3D musculoskeletal IK, 10 participants | Joint-angle MAE **4.5°** (squat 4.1°, drop jump 5.1°); RMSE range 2.0–10.2°. This is the multi-camera ceiling, not what one phone can achieve. |
| Baldinger et al. 2025, *Sensors* 25:799, doi:10.3390/s25030799 | OpenPose from 4 viewing angles (iPad, about 43 fps), front lunges, vs Vicon | Knee, hip and elbow correlations were reasonable; the shoulder was not. Biases differed significantly between viewing angles, so the camera angle changes the measured value. |

**Summary for Fitzen (single phone, 2D, side view).** Expect about **10° raw error** for hip and knee.
Error at the elbow and other distal joints will be larger. A fixed-geometry correction can bring hip
and knee to about **4°** (Iizuka 2026). MediaPipe knee angle has reached about 3–4° MAE in gait
(Russo 2026).

### Error sources
- **Out-of-plane motion and projection.** A 2D angle equals the true angle only if the limb moves
  in a plane parallel to the sensor. Iizuka 2026 attributes the −11° bias to pinhole perspective and
  to joint-centre definition.
- **Keypoint vs anatomical joint centre.** Pose models are trained on COCO-style keypoints, not
  anatomical landmarks. OpenCap needed a learned keypoint-to-marker model and gained 3.4° on average
  from it.
- **Distal joints and self-occlusion.** Elbow and ankle errors are the largest (Rode 2025, Russo 2026).
  In a side view the far limb is hidden; the engine's `side: 'auto'` should pick the near side.
- **View dependence.** Biases change with viewing angle (Baldinger 2025). Frontal views give larger
  vertical errors (Rode 2025).
- **Low frame rate and motion blur** during fast phases. Filter lag adds error at speed (see §0).

### Camera protocol
- Side-on, with the optical axis **perpendicular to the sagittal plane** (±10°). Kinovea validation
  found accuracy best at 90° and acceptable down to 45° at up to 5 m (Puig-Diví et al. 2019,
  *PLOS ONE* 14:e0216448, doi:10.1371/journal.pone.0216448).
- Lens at the height of the joint being assessed (hip height for lower body).
- Distance **2.5–4 m**, whole body in frame. The engine already warns when the body spans more than
  97 % of the frame height.
- At least 30 fps (60 fps preferred), fixed tripod, even front lighting, fitted clothing, plain
  background.

### Acceptance test (Fitzen target)
- **Math check (synthetic, must pass in CI).** Feed puppet frames with known joint angles
  (`puppet.ts`) through `MotionSession`. The reported angle must be within **0.5°** of truth after
  filter settle. This checks the geometry, not the pose model.
- **Model check (real video).** Use sagittal-view trials from the OpenCap lab set or BioCV
  (§9). Run MediaPipe, feed the engine, and time-align to mocap IK by cross-correlation. Report
  per joint: bias, 95 % LoA, RMSE and ICC(2,1).
  - Pass: hip, knee and trunk **RMSE ≤ 10°**, **|bias| ≤ 5°**, ICC ≥ 0.75.
  - Elbow and ankle: report only. They must not drive a pass/fail zone until they reach
    RMSE ≤ 12° (the Mercadal-Baudart "good" band).
  - Stretch goal: ≤ 5° after a geometric correction (Iizuka 2026 approach).
- **Zone sanity.** For every `check`, the width of the `ok` band beyond `good` must be at least the
  measured RMSE for that joint. Otherwise zones flip on noise.

---

## 2. Repetition count

### Method
Schmitt trigger on one driver angle (`reps.driver`) with `enter`/`exit` thresholds. A rep starts at
the last local extreme before crossing `enter`. It completes on crossing `exit`. It is rejected if
shorter than `minRepMs` (default 600 ms). A rep is `fullRange` if the extreme passes `target`. It is
`valid` if it is full range and its form score is ≥ 0.5.

```
x = s·θ_driver,  s = +1 (start high) / −1 (start low)
top → down when x < enter ;  down → top (rep) when x > exit ;  keep if Δt ≥ minRepMs
```

### Best published accuracy
- Oliosi et al. 2026, *JMIR mHealth uHealth* 14:e82412, doi:10.2196/82412. AI pose estimation on a
  smartphone, 44 students, about 1,320 reps per exercise, 12 camera configurations.
  - Overall rep-count MAE: **1.08** (push-up) and **1.11** (squat) reps.
  - Best squat setup: **diagonal view at 200 cm**, 95.5 % detection, **MAE 0.05**.
  - Squat from the side at 90 cm: 0 %, MAE 5.
  - Best push-up setup: diagonal view at 90–180 cm, up to 85.7 %, MAE 0.28.
  - Worst push-up setup: front view at 360 cm, MAE 2.70.
  - Implication for Fitzen: squats use `camera: 'side'` for angle accuracy, so the side view must
    **not** be too close (≥ 2 m).
- Physio2.2M (Rode 2025) reports pose detection ratios from 56.5 % to 100 % across models. Every
  dropped frame is a potential missed threshold crossing.

### Error sources
Missed detections or occlusion at the extreme. Threshold hysteresis set too narrow for the angle
noise (§1). Partial reps near `target`. Two quick reps merged by `minRepMs`. An idle person drifting
across `enter`/`exit`.

### Protocol
Side view at ≥ 2 m (or a 45° diagonal if only counting). Full body in frame. Start in the top
position so the Schmitt state initialises correctly.

### Acceptance test (Fitzen target)
- Corpus: at least 100 sets across the rep-mode exercises, with human-annotated counts.
- Pass:
  - exact-count accuracy **≥ 90 %** of sets;
  - **MAE ≤ 0.5 rep per set** (Oliosi's best configurations reached 0.05–0.28);
  - off-by-one accuracy ≥ 98 %;
  - **zero** reps counted on idle and walking clips;
  - `partial` flag agrees with the annotator on ≥ 90 % of reps.
- Synthetic: puppet sets with known N reps, including partial reps and reps faster than
  `minRepMs`, must give exactly N, the expected `partial` count and the expected `rejected` count.

---

## 3. Tempo and velocity loss

### Method
Per rep: `eccentricMs = t_extreme − t_start` and `concentricMs = t_end − t_extreme`. Session values:
average durations, time under tension, `fatigueSlopePct` (rep-duration trend) and `romDropDeg`.

Velocity-loss proxy (full-range reps only):

```
ω_i  = |exit − extreme_i| / concentric_i         [deg/s, mean concentric angular velocity of driver]
v̂(i) = linear fit of ω over rep index
VL % = 100 · (1 − v̂_last / v̂_first)             (reported when ≥ 3 full-range reps)
insight fires at VL > 20 %
```

### Best published accuracy
- **Construct.** Sánchez-Medina & González-Badillo 2011, *Med Sci Sports Exerc* 43:1725,
  doi:10.1249/MSS.0b013e318213f880. Velocity loss (from a **linear velocity transducer on the
  bar**) correlated with CMJ height loss and blood lactate (r = 0.91–0.97). The paper supports
  velocity loss as a fatigue index.
- **Smartphone bar velocity.** Renner et al. 2024, *PLOS ONE* 19:e0313919,
  doi:10.1371/journal.pone.0313919. Against Vicon: the best app (Qwik VBT) and a linear transducer
  reached RMSE **0.01–0.04 m/s**. Two other apps reached 0.04–0.14 m/s and missed 52 and 175 of
  589 reps.
- **Video velocity caveat.** Vieira et al. 2023, *PeerJ* 11:e14558, doi:10.7717/peerj.14558. Jump
  apps at 240 fps gave valid jump height but **underestimated** CMJ velocity. The velocity and power
  outputs had poor validity.
- **Gap.** No opened study validates a **pose-derived joint angular velocity** as a stand-in for
  bar velocity loss. The 20 % threshold is taken from bar-velocity literature. Until the test below
  passes, Fitzen's VL % is an **unvalidated proxy**.

### Error sources
- Time quantisation: ±1 frame per event (33 ms at 30 fps). For a 0.6 s concentric phase that is
  about ±5.5 % per rep. This is derived from the frame period, not a published figure.
- Choice of the extreme frame on a flat bottom.
- Filter lag at speed (§0).
- Angular velocity is not bar velocity. The two differ when technique changes within a set.

### Protocol
As §1. Use 60 fps where the device supports it.

### Acceptance test (Fitzen target)
- **Tempo.** Engine `startMs`, extreme and `endMs` events vs events from mocap joint angle (same
  thresholds): **MAE ≤ max(1 frame, 40 ms)**.
- **Proxy consistency.** Engine VL % vs VL % computed the same way from mocap joint angles:
  **|Δ| ≤ 5 percentage points** per set.
- **Construct.** On sets recorded with a linear transducer or a validated bar app (Renner 2024):
  Pearson r ≥ 0.8 between the engine's VL % and bar-velocity VL %. Until this passes, the UI must
  label VL % as an estimate.

---

## 4. Hold time (planks, sit-and-reach hold, flamingo)

### Method

```
Δt   = min(t − t_prev, 100 ms)            (untracked gaps never count)
hold += Δt  while every 'hold' check is non-null and not 'bad'
bestHold = longest continuous run;  a tracking loss > 300 ms breaks the run
```

### Best published accuracy and protocol reference
- No opened study validates pose-based hold timing. Timing resolution is bounded by the frame period
  (33 ms at 30 fps).
- **Official Indian protocol.** *Fitness Protocols and Guidelines for Age 5–18 Years*, v1, Fit India
  Mission, Ministry of Youth Affairs & Sports (opened from fitindia.gov.in).
  - **Flamingo balance** is scored as the **number of falls in 60 s** of balancing. The watch pauses
    at each loss of balance. The test is terminated if there are more than 15 falls in the first 30 s.
  - **Fitzen mismatch.** `sai-flamingo-balance` is a `hold` exercise with `targetSec: 60`. It reports
    hold seconds, not falls. To be comparable with SAI norms, the engine must also count
    hold-to-break transitions within 60 s of accumulated balance time.
  - **Sit-and-reach** requires the reach to be held for 1–2 s. `targetSec: 2` matches this.

### Error sources
Zone flicker near a check boundary. This splits a hold, although the 100 ms cap and zone logic
reduce it. Brief occlusion over 300 ms. Frame drops on slow devices.

### Acceptance test (Fitzen target)
- Compare with **frame-by-frame human annotation** of the same video.
  - Each hold start or stop within **±2 frames**.
  - Total hold within **±(0.2 s + 1 %)**.
  - Flamingo fall count exact in ≥ 90 % of trials and within ±1 in all trials.
- Synthetic: puppet holds with scripted breaks and 200 ms and 400 ms tracking dropouts. `holdMs`
  and `bestHold` must match to within 1 frame, and the 400 ms dropout must break the run.

---

## 5. Jump height from flight time

### Method
1. The engine tracks the ground as the slowly updated lowest-toe position.
2. It flags airborne when the toe rises more than 8 % of leg length.
3. The 8 % gate trims both ends of the flight. To recover the true contact instants, the engine fits
   a parabola to the raw airborne toe heights and solves `up(t) = 0`. The fit is accepted if its span
   is between 0.8× the gated flight and the gated flight + 300 ms.
4. Flights between 120 and 1200 ms are accepted.

```
h = g · t_f² / 8,   g = 9.81 m/s²
```

The equation is restated with the same form in Pueo et al. 2023 and used natively in MyJump. The
original source (Bosco, Luhtanen & Komi 1983) is **[unverified, not opened]**.

**Sensitivity:** `∂h/∂t_f = g·t_f/4`. For `t_f = 0.5 s` (h ≈ 30.7 cm), each 10 ms of timing error
changes h by ≈ 1.2 cm. One 30 fps frame (33 ms) at each end, if not interpolated, gives up to about
±4 cm. This is derived from the equation, not a published figure.

### Best published accuracy

| Study | Setup | Result vs criterion |
|---|---|---|
| Balsalobre-Fernández, Glaister & Lockey 2015, *J Sports Sci* 33:1574, doi:10.1080/02640414.2014.996184 (abstract read) | My Jump, iPhone 5s high-speed video, manual frame selection, 20 men × 5 CMJ | vs force plate: ICC **0.997**, bias **1.1 ± 0.5 cm**, r = 0.995 |
| Bishop et al. 2022, *J Hum Kinet* 83:185, doi:10.2478/hukin-2022-0098 | My Jump Lab, 27 students, twin force plates 1000 Hz | Jump-height bias **0.001 m**, r = 0.98, g = 0.00 |
| Balsalobre-Fernández & Varela-Olalla 2024, *Sensors* 24:7897, doi:10.3390/s24247897 | My Jump Lab **AI markerless**, iPhone 14 Pro **60 Hz 1080p**, frontal view, lens about 1.2 m high; loaded CMJ 0–70 % BM | r > 0.91, CV < 6 %; small, non-significant differences in most loads. Raw data: doi:10.6084/m9.figshare.27888879 |
| Aderinola et al. 2023, *IEEE OJEMB* 4:109, doi:10.1109/OJEMB.2023.3280127 | **Single smartphone, 30 fps, 720p, side view**, OpenPose, 16 adults, no calibration | ICC 0.84–0.99. vs force plate (bilateral): bias **−1.57 cm**, LoA **[−6.7, 3.6] cm**, ICC 0.95. **This is the closest published analogue to Fitzen.** |
| Pueo et al. 2023, *Biol Sport* 40:595, doi:10.5114/biolsport.2023.118023 | Same jumps transcoded to 120/240/480/1000 Hz | Technical error of flight time **3.4 / 1.8 / 1.2 / 0.8 ms**, of height **1.4 / 0.7 / 0.5 / 0.3 %**. Substantial at 120 Hz, negligible at ≥ 240 Hz. |
| Vieira et al. 2023, *PeerJ* 11:e14558, doi:10.7717/peerj.14558 | MyJump 2 and Jumpo 2, 240 fps, n = 10, force plate 1000 Hz | Jump height valid and reliable for CMJ and SJ. Velocity and power not valid. |
| Dias et al. 2024, *J Funct Morphol Kinesiol* 9:155, doi:10.3390/jfmk9030155 | VertVision app, 240 Hz, n = 38, contact platform | ICC > 0.9. Error 0.73–3.09 % for CMJ, 4.1–6.03 % for SJ |

### Error sources
- Frame rate. Fitzen runs at 30 fps live; Pueo 2023 shows 120 Hz is already "substantial".
- Toe keypoint noise near the ground.
- Tucking or bending the knees at landing. This lengthens flight and inflates h. It is a known
  limitation of the flight-time method.
- A moving camera or a camera not level.
- **Broad jump.** `sai-broad-jump` uses the same `jump` trigger. `h = g t²/8` is **not** a valid
  height for a horizontal jump, and the engine does not measure horizontal distance. Report
  take-off angle and flight time only, or add a calibrated distance measure.

### Protocol
- Stationary tripod. Both feet visible throughout.
- Side view at hip height, 3 m (current catalog), or frontal at about 1.2 m (My Jump Lab).
- Use the highest fps the device offers; 60 fps minimum is recommended.
- Hands on hips. Land with legs extended.

### Acceptance test (Fitzen target)
- **Criterion:** force-plate flight time (or impulse-momentum height).
- **At 30 fps:** |bias| ≤ **1.5 cm**, 95 % LoA within **±5 cm**, ICC(2,1) ≥ **0.90**. This is the
  Aderinola 30 fps level.
- **At 60 fps:** |bias| ≤ 1 cm, LoA within ±3 cm, ICC ≥ 0.95.
- **Frame-rate study:** downsample BioCV 200 Hz video to 30 and 60 fps (Pueo-style). The technical
  error at 30 fps must be ≤ 3 % of height with the parabola fit enabled, and it must be lower than
  with the fit disabled.
- **Synthetic (exists):** the 0.5 s puppet flight must give 30.7 ± 1 cm.

---

## 6. Throw release angle (and jump take-off angle)

### Method
- Wrist speed is computed by central difference on **raw** landmarks and normalised by the session's
  maximum shoulder-to-toe span:
  `sp = |p(t+1) − p(t−1)| / Δt / bodyH`.
- A peak is confirmed when speed falls below 55 % of a peak above 2.5 body-heights/s, with at least
  1.2 s since the last event.
- Release angle:

```
angle = atan2(y(k−1) − y(k+1), |x(k+1) − x(k−1)|)     (degrees above horizontal, image y down)
```

Jumps use the same formula on the hip midpoint around take-off.

### Best published accuracy
- **No opened study validates a pose-derived release angle** against mocap or ball tracking.
- Closest evidence:
  - Cronin et al. 2023, *Front Sports Act Living* 5:1298003, doi:10.3389/fspor.2023.1298003.
    OpenPose on 200 Hz competition footage (long-jump take-off) vs manual SIMI digitising:
    - COM **projection angle** waveform CMD **0.658 ± 0.273**;
    - discrete take-off variables had a mean ICC of **0.17**;
    - the authors judged OpenPose "not suitable" for in-competition analysis.
  - Yeung et al. 2025, AthletePose3D, arXiv:2503.07499 (CC BY-NC-SA 4.0):
    - models trained on everyday datasets perform poorly on athletic motion;
    - joint angles correlate strongly, but velocity estimation is limited;
    - fine-tuning cut MPJPE from 214 to 65 mm.
- Treat release angle as **unvalidated** until the test below passes.

### Error sources
- **Motion blur at release.** At 30 fps the wrist can travel a large part of a forearm length between
  frames, so the 3-frame direction is coarse.
- The wrist is not the ball, and the implement leaves the hand after the wrist speed peaks.
- The throw direction is not parallel to the image plane.
- Body-height normalisation assumes a constant camera distance. The ponytail note in the source says
  the same.

### Protocol
- Side-on, perpendicular to the throw direction, at chest height, 3 m (current catalog).
- **≥ 60 fps; 120 fps preferred.** Bright light so the shutter is short.
- Throw across the frame, not toward the camera.

### Acceptance test (Fitzen target)
- **Criterion:** ball or implement trajectory from 3D mocap, or manual digitisation of the ball in
  ≥ 120 fps video over the first 3–5 frames after it leaves the hand.
- Pass: release angle **MAE ≤ 5°**, |bias| ≤ 3°, release instant within ±1 frame, on ≥ 30 throws.
- Until then, zones should use the `ok` band only. Most catalog `good` bands are 5–10° wide, which is
  narrower than the unknown error.

---

## 7. Sit-and-reach and other flexibility proxies

### Method
`sai-sit-and-reach` is a `hold` exercise that grades three angles during the hold:
- hip (trunk–thigh) included angle: good 0–60°, ok ≤ 80°;
- knee: good 165–180°;
- elbow: good 160–180°.

**It does not measure reach distance.**

### Official protocol
Fit India 5–18 v1, §3.6:
- The score is the **reach distance in cm/mm** on the box.
- The feet are placed against the box face, which is set at the **23 cm mark**.
- The knees are locked.
- The reach is held for 1–2 s.
- A box of 12"×21" top with cm gradations is specified.

**Fitzen's hip angle is therefore a form or quality proxy, not the SAI score.**

### Best published accuracy
- Mier 2011, *Res Q Exerc Sport* 82:617, doi:10.1080/02701367.2011.10599798 (abstract read):
  - video analysis measured **static hip flexion accurately**;
  - sit-and-reach reliability R = 0.97–0.98;
  - its validity against the straight-leg-raise hamstring test was only **r = 0.64–0.81**.
- Okuno et al. 2026 (§1): MediaPipe, OpenPose and HRNet static flexibility tests had ICC ≥ 0.87 and
  r² ≥ 0.80, but showed fixed biases and LoA of ±8.04–10.87 cm (AKET/MTT). Pose values need their
  own reference norms.

### Error sources
- Hands occlude the feet.
- The box hides the ankles.
- A rounded spine vs hip hinge: equal reach can come from different hip angles.
- A pixel-to-cm scale is unknown without a reference object.

### Protocol
Side-on at hip height, 2 m (current catalog). Box fully in frame. Contrasting sock or box colour.

### Acceptance test (Fitzen target)
- **Hip-angle proxy:** vs goniometer or mocap on static holds, **MAE ≤ 5°** (static poses are easier
  than dynamic; see Russo 2026 and Okuno 2026).
- **If reach distance is added:**
  - compute `reach_cm = 23 + (x_fingertip − x_box_face) · s`, where `s` is calibrated from the known
    box top length;
  - vs box reading: |bias| ≤ 1 cm, LoA within ±3 cm, ICC ≥ 0.90.
  - Only then may Fitzen compare against SAI norms.

---

## 8. Summary of acceptance thresholds (Fitzen targets)

| Metric | Criterion | Pass threshold | Status today |
|---|---|---|---|
| Joint angle (hip/knee/trunk, sagittal) | Mocap IK (OpenCap, BioCV) | RMSE ≤ 10°, \|bias\| ≤ 5°, ICC ≥ 0.75 | Math verified synthetically only |
| Joint angle (elbow/ankle) | Mocap IK | Report only; gate at RMSE ≤ 12° | Not validated |
| Rep count | Human annotation (RepCount, MM-Fit, Fit3D) | Exact ≥ 90 %, MAE ≤ 0.5, 0 false reps idle | Synthetic only |
| Tempo phases | Mocap-derived events | ≤ max(1 frame, 40 ms) | Not validated |
| Velocity loss % | Mocap angle VL; bar VL | \|Δ\| ≤ 5 pp; r ≥ 0.8 vs bar | **Unvalidated proxy** |
| Hold time | Frame annotation | ±(0.2 s + 1 %); flamingo falls exact ≥ 90 % | Synthetic only; flamingo metric ≠ SAI score |
| Jump height (30 fps) | Force plate | \|bias\| ≤ 1.5 cm, LoA ±5 cm, ICC ≥ 0.90 | Synthetic 30.7 cm case only |
| Release / take-off angle | Mocap or ball digitisation ≥ 120 fps | MAE ≤ 5°, \|bias\| ≤ 3° | **Unvalidated** |
| Sit-and-reach | Goniometer (angle); box (cm) | ≤ 5° angle; LoA ±3 cm if reach added | Proxy only; no cm score |

Statistics to report for every test: n, bias ± SD, 95 % LoA (Bland–Altman), RMSE, ICC(2,1) with
95 % CI and CV %. These follow the methods of Bishop 2022 and Vieira 2023. Use the Koo & Li ICC bands
as quoted in Vieira 2023 (< 0.5 poor, 0.5–0.75 moderate, 0.75–0.9 good, > 0.9 excellent).

---

## 9. Public ground-truth datasets

| Dataset | Content | Size | Licence / access | Validates |
|---|---|---|---|---|
| **OpenCap lab validation** — simtk.org/projects/opencap (Uhlrich 2023) | 10 participants; walking, squats, sit-to-stand, drop vertical jumps; RGB video from 5 cameras + marker mocap + force plates + EMG + OpenSim IK | Not stated on page | "Apache 2.0 Use Agreement" (SimTK page); identifiable video shared for the lab study | §1 angles (squat, STS), §2 reps, §3 tempo, §5 drop-jump flight time |
| OpenCap field study (same page) | 100 participants, squats; IK only, **no video** | — | Apache 2.0 Use Agreement | Not usable for video tests |
| **BioCV** — researchdata.bath.ac.uk/1258 (Evans et al. 2024, *Sci Data* 11:1300, doi:10.1038/s41597-024-04077-3) | 15 participants; walking, running, CMJ, hopping; 9 synced HD cameras at **200 Hz** + Qualisys mocap + force plates + photogrammetry | ≈ 225 GB (15 × ≈ 15 GB) | Data "All Rights Reserved"; access on request; research use; no redistribution | §5 jump height and frame-rate downsampling study; §1 angles |
| **Fit3D** — fit3d.imar.ro (Fieraru et al., CVPR 2021) | 611 multi-view sequences, 37 exercises, ≥ 5 annotated reps each; 12-camera Vicon + RGB; 2.96 M 3D skeletons | > 3 M images | **Non-commercial** research/education only; commercial use by separate licence | §1 angles, §2 reps, §3 tempo |
| **MM-Fit** — mmfit.github.io; Zenodo 10.5281/zenodo.7672767 (Strömbäck et al., IMWUT 2020) | 10 exercises; RGB-D video + phone/watch/earbud IMUs; 2D/3D pose estimates | Video 39.1 GB, 20 sessions, > 800 min in total | **CC BY 4.0** (Zenodo record) | §2 rep count, exercise segmentation. No mocap, so not for angles |
| **RepCount** — svip-lab.github.io (Hu et al., TransRAC, arXiv:2204.01018) | 1,451 online videos, 19,280 cycle annotations (count + start/end) | — | **Not stated**; videos come from public online sources | §2 rep count only |
| AthletePose3D — arXiv:2503.07499 | 12 athletic motions, about 1.3 M frames, 165 k postures | — | CC BY-NC-SA 4.0 | §6 throw and jump kinematics (motion list **[unverified]**) |
| AIST++ — google.github.io/aistplusplus_dataset | Dance; 10.1 M images, 9 views, 30 subjects; triangulated 3D keypoints, not mocap | — | Annotations CC BY 4.0; source videos under AIST terms | Low relevance; filter and tracking stress test only |
| Physio2.2M (Rode 2025) | 25 participants, 2.2 M frames, exercise + Vicon | — | **Not public** (privacy) | — |
| My Jump Lab raw data — doi:10.6084/m9.figshare.27888879 | Tabular force-plate vs app values | — | figshare (licence not checked) | Numbers only; no video |

**Recommended first test.** Use the OpenCap lab set. It is the only one with video, mocap and force
plates under a permissive licence. BioCV adds 200 Hz video for the frame-rate study. Fit3D is
limited to non-commercial use, so results from it can go in the paper but it cannot be shipped in
the repo. Never commit third-party video into `validation/fixtures/`. Commit only derived landmark
JSON where the licence allows it.

---

## 10. Unverified items and known gaps

- **Not opened; citation only:**
  - Casiez et al. 2012 (One Euro filter).
  - Bosco et al. 1983 (h = g t²/8). The equation was confirmed through Pueo 2023.
  - The catalog's inline references (Schoenfeld 2010, Fry 2003, Wakai & Linthorne 2005,
    Linthorne 2001).
  - Human3.6M licence.
  - The ScienceDirect systematic review quoted in search snippets ("MediaPipe RMSE ≤ 7°").
- **Khelo India Administration Manual v2.0** (schoolfitness.kheloindia.gov.in) could not be fetched
  (connection refused). Protocol details here come from the Fit India 5–18 v1 document.
- **The SAI source for vertical jump, standing broad jump and medicine-ball throw protocols was not
  found.** The Fit India 5–18 battery does not include them. The protocols behind `sai-vertical-jump`,
  `sai-broad-jump` and `sai-medicine-ball-throw` need a citation.
- **AthletePose3D** motion list was not checked (whether it includes throws).
- **Fit3D** frame rate and subject count were not stated on the pages opened.
- **Methods not validated in the literature:**
  - pose-based angular velocity loss (§3);
  - pose-based release angle (§6);
  - pose-based hold timing (§4).
- **Engine and protocol mismatches found during this review:**
  1. The flamingo test reports hold seconds, but SAI scores falls in 60 s (§4).
  2. Sit-and-reach reports a hip angle, but SAI scores cm reach (§7).
  3. The broad jump computes a vertical-jump height from flight time, which is not meaningful (§5).

## 11. Measured accuracy on synthetic ground truth (2026-10-07)

Harness: `packages/engines/src/motion/validation/accuracy.test.ts` (run `npx vitest run accuracy` for the full table). Clips come from the synthetic athlete (`puppet.ts`), so the true angles, reps, holds, flight times and release angles are known exactly. Live = One Euro filter; offline (uploaded video) = zero-phase Butterworth (`filtfilt.ts`) + no causal filter. σ = white landmark noise in frame-height units. 16:9 at 30 fps unless stated.

| Metric | Condition | Live | Offline (upload) |
|---|---|---|---|
| Rep count (3 exercises × 6 reps) | 24–120 fps, 16:9 and 9:16, σ ≤ 0.01, ≤ 10 % dropped frames, ±2 ms jitter | exact | exact |
| Driver angle RMSE / max (back squat) | clean | 2.4° / 4.9° (filter lag) | 0.00° |
| | σ = 0.002 | 2.6° / 6.3° | 0.86° / 2.7° |
| | σ = 0.005, 5 % drops | 3.2° / 8.3° | 2.1° / 6.1° |
| Jump height (24 jumps, flight 0.35–0.65 s) | clean, 24 / 30 fps | 0.00 cm | bias −0.12 / −0.15, RMSE 0.19 / 0.21 cm |
| | σ = 0.002, 30 fps | RMSE 0.44 cm | RMSE 0.40 cm |
| | σ = 0.005, 30 fps | RMSE 1.5 cm | RMSE 1.0 cm |
| | σ = 0.005, 120 fps | RMSE 0.85 cm | RMSE 0.49 cm |
| Release angle (27 throws) | clean, 24 / 30 / 120 fps | 0.28° / 0.23° / 0.01° | 0.19° / 0.10° / 0.00° |
| | σ = 0.002 / 0.005, 30 fps | 1.6° / 6.6° | 0.7° / 4.5° |
| Hold time (plank, wall sit; ~64 s) | σ ≤ 0.005, landscape | ≤ 0.11 s | ≤ 0.11 s |

For comparison, counting airborne frames (the My Jump-style method) has a quantisation error with SD = 1/(fps·√6) in flight time: measured 2.17 / 1.58 / 0.83 / 0.38 cm RMSE at 24 / 30 / 60 / 120 fps, matching the analytic 2.09 / 1.67 / 0.83 / 0.42 cm. Fitzen's parabola fit to the airborne toe track removes most of it.

Bugs found and fixed by this harness: limb-foreshortening reference inflated by noise (holds under-counted ~45 %), release angle taken from the whole frame (8.8° → 0.1° RMSE), holds surviving gaps with no pose frames, `fps` off by one, and a −0.8 cm offline jump bias (jump clips now filtered at 10 Hz instead of 6 Hz).

**What this does not show.** These are upper bounds on how good the maths can be, not field accuracy. Synthetic tests cannot reproduce out-of-plane perspective bias, real MediaPipe errors (biased per joint and correlated over time), motion blur, rolling shutter or non-rigid take-off/landing postures. Published markerless-vs-marker sagittal angle differences are ~5–14° RMS (e.g. Thiele 2024, snatch: 13.6°), so field accuracy must be measured on real athletes (section 9, roadmap item 2). No figure here is "100 %"; none should be claimed.

Known weak spots: the foreshortening gate still mis-greys at σ = 0.005 in portrait with a small athlete; live throws at 120 fps with noise produce false releases (uploads unaffected); at σ = 0.01 a jump is occasionally missed or doubled.

## 12. Exercise catalog research audit (2026-10-07)

All 90 definitions were checked against published biomechanics, official protocols (AYUSH Common Yoga Protocol, IWF TCRR 2025, ICC, Fit India 5–18 protocol, SAI circulars) and the 2024 Compendium of Physical Activities (Herrmann et al., J Sport Health Sci, doi:10.1016/j.jshs.2023.10.010). Sources are cited in each exercise's `why` text and MET comments; only sources that were actually opened are cited (about 50 across the catalog).

Main corrections: pull-up/chin-up targets (Youdas 2010: ~93°/101° elbow motion to chin-over-bar, old target marked most real reps partial); squat torso-lean band (Larsen 2021); bridge, cobra, triangle, deep squat and overhead reach bands (AYUSH CYP, Hemmerich 2006, Gill 2020); sprint-start knee angles (Bezodis 2019); many MET values that were not real Compendium entries (e.g. kettlebell swing 6.0 → 9.8, upper-body lifts 5.0 → 3.5, static yoga 2.5/4.0 → 2.3/2.8).

Engine changes from the audit: `side: 'flexed' | 'extended'` (Warrior I/II work whichever leg leads); box jumps landing on a raised surface are recorded; no flight-time "height" is reported for horizontal jumps or box landings.

Not measurable from one phone, and now labelled as such in the app: javelin, discus and basketball release angle (scoring removed; hand moves several degrees between frames, mostly out of plane); broad jump and medicine-ball distance (needs a tape); sit-and-reach in cm (Fitzen scores the trunk–hip angle); Flamingo falls in 60 s (Fitzen reports time held); SAI vertical jump is jump-and-reach, so flight-time height is not comparable with SAI norm tables; 50 m dash and 600 m run; cricket elbow legality; knee hyperextension; lying and seated poses track weakly. Alternating drills (mountain climbers, high knees, A-skips, butt kicks) count one rep per left + right cycle on the leg nearer the camera. Bands tighter than ±10° are inside markerless measurement noise and need real-athlete calibration.
