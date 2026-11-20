"""Compare MediaPipe Pose (what the Fitzen app runs) with RTMPose (rtmlib) on the same frames.

For each frame both models see, it measures the joint angles Fitzen scores (knee, hip, elbow; both sides)
with the app's formula (included angle in the image plane, pixel coordinates) and reports how far the two
models disagree: bias (MediaPipe - RTMPose), RMSE and worst case per angle.

Agreement between two pose models is NOT accuracy. It shows how much an angle depends on the model;
accuracy needs a reference (goniometer, motion capture, force plate). See README.md.

Usage:
  .venv/bin/python pose_compare.py <video.mp4 | image-folder> [--stride 3] [--csv out.csv]
"""
import argparse, csv, math, os, sys, urllib.request
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MP_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
MP_MODEL = os.path.join(HERE, "models", "pose_landmarker_full.task")
MP_MIN_VIS = 0.5   # Fitzen FILTER.minVisibility
RTM_MIN_SCORE = 0.3

# (name, a, b, c) as indices into MediaPipe 33 / COCO-17; angle at b between a and c.
ANGLES = [
    ("left_knee", (23, 25, 27), (11, 13, 15)), ("right_knee", (24, 26, 28), (12, 14, 16)),
    ("left_hip", (11, 23, 25), (5, 11, 13)), ("right_hip", (12, 24, 26), (6, 12, 14)),
    ("left_elbow", (11, 13, 15), (5, 7, 9)), ("right_elbow", (12, 14, 16), (6, 8, 10)),
]


def included_angle(a, b, c):
    u, v = np.subtract(a, b), np.subtract(c, b)
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu == 0 or nv == 0:
        return None
    return math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(u, v) / (nu * nv))))))


def frames(src, stride):
    if os.path.isdir(src):
        for name in sorted(os.listdir(src)):
            if name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                img = cv2.imread(os.path.join(src, name))
                if img is not None:
                    yield name, img
        return
    cap = cv2.VideoCapture(src)
    i = 0
    while True:
        ok, img = cap.read()
        if not ok:
            break
        if i % stride == 0:
            yield f"frame{i:05d}", img
        i += 1
    cap.release()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="video file or folder of images")
    ap.add_argument("--stride", type=int, default=3, help="analyse every Nth video frame (default 3)")
    ap.add_argument("--csv", help="write per-frame angles to this CSV")
    args = ap.parse_args()

    if not os.path.exists(MP_MODEL):
        os.makedirs(os.path.dirname(MP_MODEL), exist_ok=True)
        print(f"Downloading MediaPipe pose model to {MP_MODEL}", file=sys.stderr)
        urllib.request.urlretrieve(MP_MODEL_URL, MP_MODEL)

    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision
    from rtmlib import Body

    landmarker = vision.PoseLandmarker.create_from_options(
        vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=MP_MODEL), running_mode=vision.RunningMode.IMAGE))
    rtm = Body(mode="balanced", backend="onnxruntime", device="cpu")  # downloads its ONNX models on first use

    rows, diffs = [], {name: [] for name, _, _ in ANGLES}
    for label, img in frames(args.source, args.stride):
        h, w = img.shape[:2]
        res = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
        kps, scores = rtm(img)
        if not res.pose_landmarks or len(kps) == 0:
            continue
        mpl = res.pose_landmarks[0]
        best = int(np.argmax(scores.mean(axis=1)))  # most confident RTMPose person
        rk, rs = kps[best], scores[best]
        for name, (ma, mb, mc), (ra, rb, rc) in ANGLES:
            if min(mpl[i].visibility for i in (ma, mb, mc)) < MP_MIN_VIS or min(rs[i] for i in (ra, rb, rc)) < RTM_MIN_SCORE:
                continue
            m = included_angle(*[(mpl[i].x * w, mpl[i].y * h) for i in (ma, mb, mc)])
            r = included_angle(rk[ra], rk[rb], rk[rc])
            if m is None or r is None:
                continue
            diffs[name].append(m - r)
            rows.append({"frame": label, "angle": name, "mediapipe": round(m, 2), "rtmpose": round(r, 2), "diff": round(m - r, 2)})

    if args.csv:
        with open(args.csv, "w", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=["frame", "angle", "mediapipe", "rtmpose", "diff"])
            wr.writeheader()
            wr.writerows(rows)

    print(f"{'angle':<12} {'n':>4} {'bias':>7} {'RMSE':>7} {'max|d|':>7}   (degrees, MediaPipe - RTMPose)")
    for name, d in diffs.items():
        if d:
            a = np.array(d)
            print(f"{name:<12} {len(a):>4} {a.mean():>7.2f} {math.sqrt((a ** 2).mean()):>7.2f} {np.abs(a).max():>7.2f}")
        else:
            print(f"{name:<12} {0:>4}   (no frame where both models saw this joint)")


if __name__ == "__main__":
    main()
