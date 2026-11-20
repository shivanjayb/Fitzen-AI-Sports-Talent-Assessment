# Offline checks: pose accuracy and video forgery research

Tools that run on a developer machine, never in the app or on an athlete's phone. The app's own anti-fraud
checks (physics integrity, container forensics, and C2PA signature verification) run in the browser; see
`apps/web/src/app/c2pa.ts` and `packages/engines/src/motion/{integrity,forensics}.ts`.

## Setup

```bash
cd tools/offline-check
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

The first run downloads model weights: MediaPipe `pose_landmarker_full.task` (Google, into `models/`) and the
RTMPose/YOLOX ONNX files (OpenMMLab, about 140 MB, into `~/.cache/rtmlib`).

## 1. Pose model agreement: `pose_compare.py`

Runs MediaPipe Pose (what the app uses) and RTMPose via [rtmlib](https://github.com/Tau-J/rtmlib) on the same
frames and compares the knee, hip and elbow angles Fitzen scores, using the app's formula (included angle in
the image plane).

```bash
.venv/bin/python pose_compare.py ../../apps/web/public/exercises --csv photos.csv   # folder of images
.venv/bin/python pose_compare.py my-squat.mp4 --stride 3 --csv squat.csv            # video
```

First result (2026-11-21, the app's 130 exercise photos): median disagreement 2.5–4.5°, but 8–20 % of joint
readings differ by more than 15°, almost all in hard poses (flamingo balance, crunch, burpee, hip thrust)
where a limb is hidden or the body is lying down. Agreement between two models is not accuracy: it shows
how much an angle depends on the model. Accuracy needs a reference (goniometer, motion capture, force plate)
and the app's coach-validation CSV.

[Sports2D](https://github.com/davidpagnon/Sports2D) is installed too (`.venv/bin/sports2d --help`): an
independent single-camera angle pipeline that also runs RTMPose. Its angle code is already the reference for
`packages/engines/src/motion/validation/sports2d.ref.test.ts`. Pose2Sim (multi-camera, OpenSim) is not
installed; Fitzen is single-camera.

## 2. Research forgery detectors: `fetch_research_models.sh`

Clones two research codebases at pinned commits into `vendor/` (gitignored). Neither is wired into Fitzen.

| Project | Licence | What it detects | Status for Fitzen |
|---|---|---|---|
| [DeMamba](https://github.com/chenhaoxing/DeMamba) @ `646db28` | Apache-2.0 | Fully AI-generated video (GenVideo benchmark) | No trained weights are published: it must be trained on GenVideo with a CUDA GPU before it detects anything. |
| [DeepfakeBench](https://github.com/SCLBD/DeepfakeBench) @ `f188b1c` | **CC BY-NC 4.0** (non-commercial) | Face swaps and reenactment; many image and video detectors with released weights | Usable for academic evaluation only, never in a commercial build. Face-focused, so it says little about full-body exercise clips. Needs CUDA. |

Not included: [baheesa/inter_frame_forgery_detection](https://github.com/baheesa/inter_frame_forgery_detection)
(frame insertion, deletion and duplication) has **no licence**, so its code cannot be used. Fitzen's
`integrity.ts` already flags frozen and duplicated frames, interpolation, loops and timing gaps.

## Privacy

Run these only on clips that an athlete or volunteer has agreed to share for research. Nothing here uploads
video; model weights are downloaded once from the projects' published links.
