"""
analyze_research_logs.py — turns the CSVs exported by researchLogger.js into
the numbers the paper needs.

    python analyze_research_logs.py logs/*.csv
    python analyze_research_logs.py logs/*.csv --cv-condition normal

CSV columns (one row per frame handed to MediaPipe):
    timestamp, frame_id, inference_ms, latency_ms, landmarks_valid,
    tracked_side, ROM, BS, MS, TI, condition, session_id

Definitions (copy these into the Methods section):
  Latency        t0 = frame passed to MediaPipe, t1 = first game-loop tick that
                 reads that frame. Software latency only (no camera hardware).
  Detection rate valid frames / all frames sent to the model x 100, where valid
                 = shoulder, elbow and wrist of at least one arm all have
                 visibility > 0.5. Failed-detection frames ARE counted.
  ROM (session)  P95 - P5 of the per-frame shoulder-flexion angle (deg) of the
                 tracked arm. Percentiles instead of max-min so a single
                 glitch frame cannot set the range.
  BS  (session)  mean |left wrist y - right wrist y| (normalized image units;
                 0 = level). Only frames with both wrists visible.
  MS  (session)  mean over frames of the rolling-30-frame mean |change in wrist
                 speed|. Lower = smoother.
  TI  (session)  mean frame-to-frame wrist displacement (normalized units).
                 Higher = shakier.
  CV             SD / mean x 100 across the per-session values above.
"""
import argparse, csv, glob, math, statistics as st
from collections import defaultdict
from datetime import datetime


def f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def pct(vals, p):
    if not vals:
        return float("nan")
    s = sorted(vals)
    k = (len(s) - 1) * p / 100
    lo, hi = math.floor(k), math.ceil(k)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def msd(vals):
    if not vals:
        return "n/a"
    sd = st.stdev(vals) if len(vals) > 1 else 0.0
    return f"{st.mean(vals):.2f} ± {sd:.2f}"


def load(paths):
    rows = []
    for p in paths:
        with open(p, newline="") as fh:
            rows.extend(csv.DictReader(fh))
    return rows


def by_session(rows):
    d = defaultdict(list)
    for r in rows:
        d[r["session_id"]].append(r)
    return d


def test1(rows):
    lat = [f(r["latency_ms"]) for r in rows if f(r["latency_ms"]) is not None]
    inf = [f(r["inference_ms"]) for r in rows if f(r["inference_ms"]) is not None]
    valid = [r for r in rows if r["landmarks_valid"] == "1"]
    print("TEST 1 — Latency")
    if not lat:
        print("  no latency data (was the game loop running while logging?)")
        return
    print(f"  end-to-end (t0 -> game reads frame): mean ± SD = {msd(lat)} ms, "
          f"p95 = {pct(lat, 95):.1f} ms, n = {len(lat)}")
    print(f"  model inference only:                mean ± SD = {msd(inf)} ms, "
          f"p95 = {pct(inf, 95):.1f} ms")
    print(f"  frames reflected in the game: {len(lat)}/{len(valid)} valid frames "
          f"({100*len(lat)/max(1,len(valid)):.1f}%) — the rest were superseded by a newer frame first")


def test2(rows):
    print("\nTEST 2 — Landmark detection rate")
    conds = defaultdict(list)
    for sid, srows in by_session(rows).items():
        conds[srows[0]["condition"]].append(srows)
    for cond, sessions in conds.items():
        rates = [100 * sum(r["landmarks_valid"] == "1" for r in s) / len(s) for s in sessions]
        pooled = [r for s in sessions for r in s]
        pooled_rate = 100 * sum(r["landmarks_valid"] == "1" for r in pooled) / len(pooled)
        print(f"  {cond:10s}: pooled {pooled_rate:.1f}% over {len(pooled)} frames; "
              f"per-session {msd(rates)}% (n sessions = {len(sessions)})")


def fps(srows):
    try:
        t = [datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")) for r in srows]
        dur = (max(t) - min(t)).total_seconds()
        return len(srows) / dur if dur > 0 else float("nan")
    except Exception:
        return float("nan")


def session_metrics(srows):
    v = [r for r in srows if r["landmarks_valid"] == "1"]
    rom = [f(r["ROM"]) for r in v if f(r["ROM"]) is not None]
    bs = [f(r["BS"]) for r in v if f(r["BS"]) is not None]
    ms = [f(r["MS"]) for r in v if f(r["MS"]) is not None]
    ti = [f(r["TI"]) for r in v if f(r["TI"]) is not None]
    return {
        "ROM": pct(rom, 95) - pct(rom, 5) if len(rom) > 10 else None,
        "BS": st.mean(bs) if bs else None,
        "MS": st.mean(ms) if ms else None,
        "TI": st.mean(ti) if ti else None,
    }


def test3(rows, cond):
    print(f"\nTEST 3 — Repeatability (condition = '{cond}')")
    sessions = [s for s in by_session(rows).values() if s[0]["condition"] == cond]
    if len(sessions) < 3:
        print(f"  need >= 3 sessions of '{cond}', found {len(sessions)}")
        return
    per = [session_metrics(s) for s in sessions]
    print(f"  sessions: {len(sessions)}  | effective frame rate per session: "
          f"{', '.join(f'{fps(s):.1f}' for s in sessions)} FPS")
    for m in ("ROM", "BS", "MS", "TI"):
        vals = [p[m] for p in per if p[m] is not None]
        if len(vals) < 3:
            print(f"  {m}: only {len(vals)} session(s) had data — cannot compute CV")
            continue
        mean = st.mean(vals)
        cv = 100 * st.stdev(vals) / mean if mean else float("nan")
        print(f"  {m}: CV = {cv:.1f}%   (session values: {[round(x, 4) for x in vals]})")
    print("  BS is only defined for bilateral exercises; a one-arm raise may leave it blank.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--cv-condition", default="normal")
    a = ap.parse_args()
    paths = [p for pat in a.files for p in glob.glob(pat)]
    if not paths:
        raise SystemExit("No files matched.")
    rows = load(paths)
    print(f"Loaded {len(paths)} file(s), {len(rows)} frame rows\n")
    test1(rows)
    test2(rows)
    test3(rows, a.cv_condition)
