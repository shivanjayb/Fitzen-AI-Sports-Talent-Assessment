"""Regenerate One Euro reference fixtures with the authors' Python implementation.
Run: PYTHONPATH="../../../../../../../reference/OneEuroFilter/python" python3 gen_oneeuro.py
(casiez/OneEuroFilter @ d78925584245597f2aa9c4c01a802eb0f0b77fb9, BSD-3-Clause)
Params must equal FILTER in engine.ts."""
import json, math, random
from OneEuroFilter import OneEuroFilter

P = dict(mincutoff=1.5, beta=10.0, dcutoff=1.0)
N, HZ = 300, 30.0

def signal(rng, ts):
    # sin (1 Hz, rep-like) + step at sample 150 + gaussian landmark jitter, in normalized image units
    return [0.5 + 0.15 * math.sin(2 * math.pi * 1.0 * t / 1000) + (0.1 if i >= 150 else 0) + rng.gauss(0, 0.005)
            for i, t in enumerate(ts)]

def run(name, jitter):
    rng = random.Random(42)
    # start at t>0: reference treats timestamp 0 as "no timestamp" (falsy) and would ignore the first dt
    ts, t = [], 1000.0
    for _ in range(N):
        ts.append(t)
        t += 1000 / HZ * (1 + (rng.uniform(-0.3, 0.3) if jitter else 0))
    xs = signal(rng, ts)
    f = OneEuroFilter(freq=HZ, **P)
    ys = [f(x, tm / 1000) for x, tm in zip(xs, ts)]
    json.dump({"source": "casiez/OneEuroFilter python @ d789255", "params": P, "freq": HZ,
               "tMs": ts, "x": xs, "y": ys}, open(f"oneEuro_{name}.json", "w"))

run("uniform30", False)
run("jitter30", True)
