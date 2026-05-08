"""Thesis-grade evaluation of the contextual anomaly pipeline.

Computes the comparison table that goes into the thesis's experiments
chapter. Run AFTER `prepare_data.py` and `train.py`.

What it produces (printed and written to JSON for the appendix):

1. Baselines & target model (test slice metrics)
   - Rule-only          (the proxy-label generator itself)
   - IsolationForest    (its native predict)
   - LOF                (novelty-mode predict)
   - IF + LOF ensemble  (ensemble score >= q95 train threshold)
2. Ablation: ensemble without the contextual residual block
   (zero out gas_no_occupancy, motion_at_night, humidity_off_profile).
3. Operational metrics (computed at the test-slice level)
   - false alerts / day  -- assumed 1 sample per second
   - median time-to-detect (TTD) in samples for sustained anomalies
   - inference latency p50/p95 over per-row scoring

Usage:
    python -m scripts.evaluate

Outputs:
    backend/ml/evaluation_report.json
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.metrics import f1_score, precision_score, recall_score

from ml.feature_schema import FEATURE_INDEX, NUM_FEATURES


logger = logging.getLogger(__name__)
ML_DIR = Path(__file__).resolve().parent.parent / "ml"
DATA_PATH = ML_DIR / "data.npy"
LABELS_PATH = ML_DIR / "labels.npy"
SPLITS_PATH = ML_DIR / "splits.npy"
SCALER_PATH = ML_DIR / "scaler.pkl"
MODEL_IF_PATH = ML_DIR / "model_if.pkl"
MODEL_LOF_PATH = ML_DIR / "model_lof.pkl"
MANIFEST_PATH = ML_DIR / "feature_manifest.json"
REPORT_PATH = ML_DIR / "evaluation_report.json"


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "precision": float(precision_score(y_true, y_pred, pos_label=-1, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, pos_label=-1, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, pos_label=-1, zero_division=0)),
    }


def _normalize(scores: np.ndarray, lo: float, hi: float) -> np.ndarray:
    rng = hi - lo
    if rng <= 1e-12:
        return np.zeros_like(scores)
    inv = (hi - scores) / rng
    return np.clip(inv * 100.0, 0.0, 100.0)


def _operational_metrics(
    y_pred_anomaly: np.ndarray, y_true: np.ndarray, samples_per_day: int = 86400
) -> dict[str, float]:
    n = len(y_pred_anomaly)
    if n == 0:
        return {"false_alerts_per_day": 0.0, "median_ttd_samples": -1.0}
    false_alerts = int(((y_pred_anomaly == -1) & (y_true == 1)).sum())
    days = n / samples_per_day if samples_per_day > 0 else 1.0
    fap = false_alerts / max(days, 1e-9)

    # Time-to-detect: for each contiguous run of true anomalies,
    # measure how many samples in until the model first flags it.
    ttd_samples: list[int] = []
    in_run = False
    run_start = 0
    for i in range(n):
        if y_true[i] == -1:
            if not in_run:
                in_run = True
                run_start = i
        else:
            if in_run:
                # close the run; locate first detection in this run
                detected_idx = None
                for j in range(run_start, i):
                    if y_pred_anomaly[j] == -1:
                        detected_idx = j
                        break
                if detected_idx is not None:
                    ttd_samples.append(detected_idx - run_start)
                in_run = False
    if in_run:
        for j in range(run_start, n):
            if y_pred_anomaly[j] == -1:
                ttd_samples.append(j - run_start)
                break
    median_ttd = float(np.median(ttd_samples)) if ttd_samples else -1.0
    return {
        "false_alerts_per_day": float(round(fap, 3)),
        "median_ttd_samples": median_ttd,
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not all(p.exists() for p in (DATA_PATH, LABELS_PATH, SPLITS_PATH, MANIFEST_PATH)):
        raise FileNotFoundError(
            "Missing prepared artifacts. Run prepare_data.py and train.py first."
        )

    X = np.load(DATA_PATH)
    y = np.load(LABELS_PATH)
    splits = np.load(SPLITS_PATH)
    if X.shape[1] != NUM_FEATURES:
        raise RuntimeError(
            f"data.npy width {X.shape[1]} != schema {NUM_FEATURES}"
        )
    test_mask = splits == 2
    X_test, y_test = X[test_mask], y[test_mask]
    print(f"test samples: {X_test.shape[0]}")

    iforest = joblib.load(MODEL_IF_PATH)
    lof = joblib.load(MODEL_LOF_PATH) if MODEL_LOF_PATH.exists() else None
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    ens = manifest.get("ensemble") or {}
    ranges = ens.get("score_ranges") or {}
    if_lo = float(ranges.get("isolation_forest", {}).get("lo", 0.0))
    if_hi = float(ranges.get("isolation_forest", {}).get("hi", 1.0))
    lof_lo = float(ranges.get("lof", {}).get("lo", 0.0))
    lof_hi = float(ranges.get("lof", {}).get("hi", 1.0))
    threshold = float(ens.get("default_threshold", 50.0))
    w_if = float((ens.get("weights") or {}).get("isolation_forest", 0.5))
    w_lof = float((ens.get("weights") or {}).get("lof", 0.5))

    # 1) Rule baseline = labels themselves.
    rule_pred = y_test.copy()
    rule_metrics = _metrics(y_test, rule_pred)

    # 2) IsolationForest alone.
    if_pred = iforest.predict(X_test)
    if_metrics = _metrics(y_test, np.where(if_pred == -1, -1, 1))

    # 3) LOF alone.
    if lof is not None:
        lof_pred = lof.predict(X_test)
        lof_metrics = _metrics(y_test, np.where(lof_pred == -1, -1, 1))
    else:
        lof_metrics = {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    # Time inference latency for the ensemble path.
    if_dec = iforest.decision_function(X_test)
    lof_dec = lof.decision_function(X_test) if lof is not None else np.zeros_like(if_dec)
    if_norm = _normalize(if_dec, if_lo, if_hi)
    lof_norm = _normalize(lof_dec, lof_lo, lof_hi)
    ens_test = w_if * if_norm + w_lof * lof_norm
    ens_pred = np.where(ens_test >= threshold, -1, 1)
    ens_metrics = _metrics(y_test, ens_pred)

    # 4) Ablation: zero residual block at inference.
    ablation_idx = [
        FEATURE_INDEX["gas_no_occupancy"],
        FEATURE_INDEX["motion_at_night"],
        FEATURE_INDEX["humidity_off_profile"],
    ]
    X_ablation = X_test.copy()
    X_ablation[:, ablation_idx] = 0.0
    if_dec_a = iforest.decision_function(X_ablation)
    lof_dec_a = (
        lof.decision_function(X_ablation) if lof is not None else np.zeros_like(if_dec_a)
    )
    ens_a = w_if * _normalize(if_dec_a, if_lo, if_hi) + w_lof * _normalize(
        lof_dec_a, lof_lo, lof_hi
    )
    ens_a_pred = np.where(ens_a >= threshold, -1, 1)
    ablation_metrics = _metrics(y_test, ens_a_pred)

    # 5) Operational metrics on the ensemble predictions.
    operational = _operational_metrics(ens_pred, y_test)

    # 6) Per-row inference latency via the IF model (LOF dominates if used).
    n_lat = min(2000, X_test.shape[0])
    sample = X_test[:n_lat]
    timings: list[float] = []
    for i in range(n_lat):
        x = sample[i : i + 1]
        t0 = time.perf_counter()
        iforest.decision_function(x)
        if lof is not None:
            lof.decision_function(x)
        timings.append((time.perf_counter() - t0) * 1000.0)
    arr = np.asarray(timings)
    latency = {
        "p50_ms": float(np.quantile(arr, 0.5)),
        "p95_ms": float(np.quantile(arr, 0.95)),
        "p99_ms": float(np.quantile(arr, 0.99)),
        "mean_ms": float(arr.mean()),
        "samples": int(arr.size),
    }

    report: dict[str, Any] = {
        "test_samples": int(X_test.shape[0]),
        "models": {
            "rule_baseline": rule_metrics,
            "isolation_forest_alone": if_metrics,
            "lof_alone": lof_metrics,
            "ensemble_if_lof": ens_metrics,
            "ensemble_minus_residuals": ablation_metrics,
        },
        "operational": operational,
        "latency": latency,
        "ensemble_threshold": threshold,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
