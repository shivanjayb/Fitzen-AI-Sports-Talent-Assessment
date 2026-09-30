"""Generate sports2d_angles.json: random BlazePose keypoints + angles from Sports2D's own code.

No Sports2D/Pose2Sim code is copied: the functions are pulled at runtime (via ast) from the
reference clones, so the fixture is computed by the upstream source verbatim.
  Sports2D  (BSD-3, Pagnon et al., JOSS 2024)  reference/Sports2D  @ 4392177d
  Pose2Sim  (BSD-3, Pagnon et al., JOSS 2022)  reference/Pose2Sim  @ 2a71fe22  (angle_dict, points_to_angles, fixed_angles)

Run:  python gen_sports2d.py   (needs numpy only; paths relative to this file)
"""
import ast, json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.normpath(os.path.join(HERE, *[".."] * 7, "reference"))
P2S = os.path.join(REF, "Pose2Sim", "Pose2Sim", "common.py")
S2D = os.path.join(REF, "Sports2D", "Sports2D", "process.py")


def pull(path, names):
    tree = ast.parse(open(path).read())
    keep = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in names)
            or (isinstance(n, ast.Assign) and any(getattr(t, "id", None) in names for t in n.targets))]
    return ast.unparse(ast.Module(body=keep, type_ignores=[]))


ns = {"np": np}
for path, names in [(P2S, {"angle_dict", "points_to_angles", "fixed_angles", "euclidean_distance", "add_shoulder_neck_hip_coords"}),
                    (S2D, {"compute_angle", "compute_angles_for_person"})]:
    exec(pull(path, names), ns)
angle_dict, fixed_angles, compute_angles_for_person, add_snh = ns["angle_dict"], ns["fixed_angles"], ns["compute_angles_for_person"], ns["add_shoulder_neck_hip_coords"]

# Pose2Sim BLAZEPOSE skeleton names -> MediaPipe indices (skeletons.py)
NAMES = {0: "Nose", 2: "LEye", 5: "REye", 11: "LShoulder", 12: "RShoulder", 13: "LElbow", 14: "RElbow", 15: "LWrist", 16: "RWrist",
         17: "LPinky", 18: "RPinky", 19: "LIndex", 20: "RIndex", 21: "LThumb", 22: "RThumb", 23: "LHip", 24: "RHip", 25: "LKnee",
         26: "RKnee", 27: "LAnkle", 28: "RAnkle", 29: "LHeel", 30: "RHeel", 31: "LBigToe", 32: "RBigToe"}
ANGLES = ["right ankle", "left ankle", "right knee", "left knee", "right hip", "left hip", "right shoulder", "left shoulder",
          "right elbow", "left elbow", "right wrist", "left wrist", "right shank", "left shank", "right thigh", "left thigh",
          "pelvis", "trunk", "shoulders", "right arm", "left arm", "right forearm", "left forearm"]
W, H = 1920, 1080
A = W / H

rng = np.random.default_rng(20240711)
d2r = math.radians
unit = lambda a: np.array([math.sin(a), math.cos(a)])  # angle a from straight DOWN, image y grows downward


def pose(sagittal):
    """Forward-kinematics puppet in aspect-scaled units (x*A, y). Returns 33x2."""
    p = np.zeros((33, 2))
    mid_hip = np.array([0.5 * A, 0.55])
    trunk = unit(d2r(180 + rng.uniform(-60, 60)))  # up, with lean
    neck = mid_hip + 0.28 * trunk
    half_sh = np.zeros(2) if sagittal else np.array([rng.uniform(-0.1, 0.1), rng.uniform(-0.03, 0.03)])
    half_hp = np.zeros(2) if sagittal else np.array([rng.uniform(-0.08, 0.08), rng.uniform(-0.03, 0.03)])
    for side, sgn in (("L", 1), ("R", -1)):
        i = 0 if side == "L" else 1
        sh = neck + sgn * half_sh; hp = mid_hip + sgn * half_hp
        th = d2r(rng.uniform(-110, 110)); kn = hp + 0.24 * unit(th)
        sn = th + d2r(rng.uniform(-10, 150)); an = kn + 0.24 * unit(sn)
        ft = sn + d2r(rng.choice([-1, 1]) * rng.uniform(60, 120)); toe = an + 0.08 * unit(ft)
        heel = an - 0.04 * unit(ft + (0 if sagittal else d2r(rng.uniform(-25, 25))))
        ua = d2r(rng.uniform(-180, 180)); el = sh + 0.17 * unit(ua)
        fa = ua + d2r(rng.uniform(-10, 160)); wr = el + 0.15 * unit(fa)
        hd = fa + d2r(rng.uniform(-60, 60)); ix = wr + 0.05 * unit(hd)
        for k, v in zip((11, 13, 15, 23, 25, 27, 29, 31), (sh, el, wr, hp, kn, an, heel, toe)): p[k + i] = v
        p[19 + i] = ix; p[17 + i] = wr + 0.04 * unit(hd + 0.3); p[21 + i] = wr + 0.03 * unit(hd - 0.5)
    head = neck + 0.12 * trunk
    for k in range(11): p[k] = head + 0.01 * rng.standard_normal(2)
    # uniform scale + shift into the frame (angles are invariant); keeps y-span < 0.97 so framing passes
    c = (p.max(0) + p.min(0)) / 2
    s = min(0.9 / (p[:, 1].max() - p[:, 1].min()), 0.9 * A / (p[:, 0].max() - p[:, 0].min()), 1.0)
    p = (p - c) * s + np.array([0.5 * A, 0.5])
    if rng.random() < 0.5: p[:, 0] = A - p[:, 0]  # facing the other way
    return p


def sports2d(xn, yn):
    X = np.array([xn[k] * W for k in sorted(NAMES)]); Y = np.array([yn[k] * H for k in sorted(NAMES)])
    names = [NAMES[k] for k in sorted(NAMES)]; ids = list(range(len(names)))
    S = np.ones_like(X)
    for kpt in ["Hip", "Neck"]:  # Sports2D order is RShoulder, LShoulder, Hip, Neck; shoulders exist
        X, Y, S = add_snh(kpt, X, Y, S, ids, names); names.append(kpt); ids.append(len(X) - 1)
    lr = [names.index(n) for n in ("LBigToe", "LHeel", "RBigToe", "RHeel")]
    Xf, ang, vs = compute_angles_for_person(X, Y, "auto", True, ids, names, ANGLES, angle_dict, L_R_direction_idx=lr)
    out = dict(zip(ANGLES, map(float, ang)))
    # Same Sports2D functions, fed Fitzen's landmark choice (same-side shoulder/hip instead of Neck/mid-Hip,
    # ankle->toe instead of heel->toe) to separate formula agreement from landmark-definition differences.
    pt = lambda n: [Xf[names.index(n)], Y[names.index(n)]]
    for s, S_ in (("right", "R"), ("left", "L")):
        out[f"{s} hip@side"] = float(fixed_angles([pt(S_ + "Knee"), pt(S_ + "Hip"), pt(S_ + "Hip"), pt(S_ + "Shoulder")], f"{s} hip"))
        out[f"{s} shoulder@side"] = float(fixed_angles([pt(S_ + "Elbow"), pt(S_ + "Shoulder"), pt(S_ + "Hip"), pt(S_ + "Shoulder")], f"{s} shoulder"))
        out[f"{s} ankle@side"] = float(fixed_angles([pt(S_ + "Knee"), pt(S_ + "Ankle"), pt(S_ + "BigToe"), pt(S_ + "Ankle")], f"{s} ankle"))
        out[f"{s} trunk@side"] = float(fixed_angles([pt(S_ + "Shoulder"), pt(S_ + "Hip")], "trunk"))
        out[f"{s} wrist@ordered"] = float(fixed_angles([pt(S_ + "Elbow"), pt(S_ + "Wrist"), pt(S_ + "Index")], "right wrist"))
    return out, vs


cases = []
for i in range(200):
    sag = i < 20
    p = pose(sag)
    xn = [float(v) for v in p[:, 0] / A]; yn = [float(v) for v in p[:, 1]]
    angles, vs = sports2d(xn, yn)
    cases.append({"sagittal": sag, "visibleSide": vs, "x": xn, "y": yn, "sports2d": angles})

json.dump({"source": "Sports2D@4392177d + Pose2Sim@2a71fe22 (BSD-3), seed 20240711", "width": W, "height": H, "cases": cases},
          open(os.path.join(HERE, "sports2d_angles.json"), "w"))
print(len(cases), "cases")
