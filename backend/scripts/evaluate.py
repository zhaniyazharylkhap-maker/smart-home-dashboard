"""Thesis-grade evaluation of the contextual anomaly pipeline.

Computes the comparison table that goes into the thesis's experiments
chapter. Run AFTER `prepare_data.py` and `train.py`.

What it produces (printed and written to JSON for the appendix):

1. Baselines & target model (test slice metrics)
   - Label self-consistency  (the proxy-label generator vs itself; F1=1
     by construction, kept in the table only as a sanity ceiling)
   - Production rule engine  (the actual `services.alert_engine`
     thresholds applied to RAW test values; this is what the user
     actually experiences in the live system)
   - IsolationForest         (its native predict)
   - LOF                     (novelty-mode predict)
   - IF + LOF ensemble       (ensemble score >= manifest threshold)
2. Ablation: ensemble without the contextual residual block
   (zero out gas_no_occupancy, motion_at_night, humidity_off_profile).
3. Operational metrics (computed at the test-slice level)
   - false alerts / day
       * `raw`     -- one count per row that fires
       * `deduped` -- one count per off->on transition AND per
                       cooldown window (default 5 min @ 1Hz)
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


# Production rule engine thresholds (must mirror the defaults in
# `backend/services/alert_engine.py::_effective_thresholds`). Kept here
# explicitly so the evaluation script remains a self-contained,
# CI-friendly snapshot of the rules being benchmarked.
PROD_RULE_TEMPERATURE_MAX = 30.0
PROD_RULE_GAS_MAX = 200.0
PROD_RULE_SMOKE_MAX = 250.0
PROD_RULE_HUMIDITY_MIN = 30.0
PROD_RULE_HUMIDITY_MAX = 70.0


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


def _production_rule_predictions(X_raw: np.ndarray) -> np.ndarray:
    """Apply the live alert-engine rules to the RAW test matrix.

    This is the rule baseline a homeowner would actually experience.
    The proxy labels in `prepare_data._proxy_labels` use train-slice
    quantiles which are STRICTER than the safety-oriented thresholds
    used here, so this baseline is expected to under-recall the proxy
    labels but with high precision.
    """
    temperature = X_raw[:, FEATURE_INDEX["temperature"]]
    humidity = X_raw[:, FEATURE_INDEX["humidity"]]
    gas = X_raw[:, FEATURE_INDEX["gas"]]
    smoke = X_raw[:, FEATURE_INDEX["smoke"]]
    fires = (
        (temperature > PROD_RULE_TEMPERATURE_MAX)
        | (gas > PROD_RULE_GAS_MAX)
        | (smoke > PROD_RULE_SMOKE_MAX)
        | (humidity < PROD_RULE_HUMIDITY_MIN)
        | (humidity > PROD_RULE_HUMIDITY_MAX)
    )
    return np.where(fires, -1, 1)


def _operational_metrics(
    y_pred: np.ndarray,
    y_true: np.ndarray,
    *,
    samples_per_day: int = 86400,
    cooldown_samples: int = 300,
) -> dict[str, Any]:
    """Compute false-alert rates with and without alert deduplication.

    `raw` matches the previous metric: every individual prediction
    counts.  `deduped` collapses sustained alert runs and applies a
    cooldown window (default 5 minutes at 1Hz), which is what the live
    UI shows after `_has_open_alert()` deduplication. The deduped rate
    is the one to quote in the thesis -- the raw rate is reported only
    for completeness, since it can be off by 100x in either direction
    depending on the assumed sample rate.
    """
    n = len(y_pred)
    if n == 0:
        return {
            "false_alerts_per_day_raw": 0.0,
            "false_alerts_per_day_deduped": 0.0,
            "median_ttd_samples": -1.0,
            "samples_per_day_assumption": int(samples_per_day),
            "cooldown_samples": int(cooldown_samples),
        }
    days = n / samples_per_day if samples_per_day > 0 else 1.0

    # Raw FAR: every false-positive prediction.
    false_alerts_raw = int(((y_pred == -1) & (y_true == 1)).sum())
    fap_raw = false_alerts_raw / max(days, 1e-9)

    # Deduped FAR: count only off->on transitions, AND skip any edge
    # that arrives within `cooldown_samples` of the previous alert
    # (mirrors `_has_open_alert` behaviour).
    is_alert = (y_pred == -1)
    transitions = np.zeros(n, dtype=bool)
    if n > 0:
        transitions[0] = is_alert[0]
    if n > 1:
        transitions[1:] = is_alert[1:] & (~is_alert[:-1])
    last_alert = -10**9
    deduped_alerts = np.zeros(n, dtype=bool)
    for i in range(n):
        if transitions[i] and (i - last_alert) >= cooldown_samples:
            deduped_alerts[i] = True
            last_alert = i
    false_alerts_dedup = int((deduped_alerts & (y_true == 1)).sum())
    fap_dedup = false_alerts_dedup / max(days, 1e-9)

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
                detected_idx = None
                for j in range(run_start, i):
                    if y_pred[j] == -1:
                        detected_idx = j
                        break
                if detected_idx is not None:
                    ttd_samples.append(detected_idx - run_start)
                in_run = False
    if in_run:
        for j in range(run_start, n):
            if y_pred[j] == -1:
                ttd_samples.append(j - run_start)
                break
    median_ttd = float(np.median(ttd_samples)) if ttd_samples else -1.0
    return {
        "false_alerts_per_day_raw": float(round(fap_raw, 3)),
        "false_alerts_per_day_deduped": float(round(fap_dedup, 3)),
        "median_ttd_samples": median_ttd,
        "samples_per_day_assumption": int(samples_per_day),
        "cooldown_samples": int(cooldown_samples),
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

    # The production-rule baseline operates on RAW (un-scaled) values;
    # invert the saved StandardScaler rather than re-loading the source
    # CSVs so this script remains a self-contained re-runnable artifact.
    scaler = joblib.load(SCALER_PATH)
    X_test_raw = scaler.inverse_transform(X_test)

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

    # 1) Self-consistency: labels vs themselves. Kept as a defended
    #    sanity ceiling, NOT as a real baseline. F1=1.0 by construction.
    self_metrics = _metrics(y_test, y_test.copy())

    # 2) Production rule engine on raw test values -- the actual
    #    user-visible alert behaviour.
    prod_pred = _production_rule_predictions(X_test_raw)
    prod_metrics = _metrics(y_test, prod_pred)

    # 3) IsolationForest alone.
    if_pred = iforest.predict(X_test)
    if_metrics = _metrics(y_test, np.where(if_pred == -1, -1, 1))

    # 4) LOF alone.
    if lof is not None:
        lof_pred = lof.predict(X_test)
        lof_metrics = _metrics(y_test, np.where(lof_pred == -1, -1, 1))
    else:
        lof_metrics = {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    if_dec = iforest.decision_function(X_test)
    lof_dec = lof.decision_function(X_test) if lof is not None else np.zeros_like(if_dec)
    if_norm = _normalize(if_dec, if_lo, if_hi)
    lof_norm = _normalize(lof_dec, lof_lo, lof_hi)
    ens_test = w_if * if_norm + w_lof * lof_norm
    ens_pred = np.where(ens_test >= threshold, -1, 1)
    ens_metrics = _metrics(y_test, ens_pred)

    # 5) Ablation: zero residual block at inference.
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

    # 6) Operational metrics: report for both the production-rule
    #    baseline and the IF+LOF ensemble so the thesis can compare
    #    "what the user sees today" vs "what ML would deliver".
    op_prod = _operational_metrics(prod_pred, y_test)
    op_ens = _operational_metrics(ens_pred, y_test)

    # 7) Per-row inference latency via the IF model (LOF dominates if used).
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
        "note": (
            "Per-row decision_function only. End-to-end ingestion latency "
            "includes scaler.transform + Redis write + DB session refresh "
            "and is reported by scripts/failure_test.py."
        ),
    }

    report: dict[str, Any] = {
        "test_samples": int(X_test.shape[0]),
        "models": {
            "label_self_consistency": {
                **self_metrics,
                "_note": (
                    "Tautological: proxy labels compared against themselves. "
                    "Reported only as a sanity ceiling; F1=1.0 by definition."
                ),
            },
            "production_rule_engine": {
                **prod_metrics,
                "_note": (
                    "Real alert-engine thresholds (see "
                    "services.alert_engine._effective_thresholds) applied to "
                    "raw test values. This is what the user experiences."
                ),
                "thresholds": {
                    "temperature_max": PROD_RULE_TEMPERATURE_MAX,
                    "gas_max": PROD_RULE_GAS_MAX,
                    "smoke_max": PROD_RULE_SMOKE_MAX,
                    "humidity_min": PROD_RULE_HUMIDITY_MIN,
                    "humidity_max": PROD_RULE_HUMIDITY_MAX,
                },
            },
            "isolation_forest_alone": if_metrics,
            "lof_alone": lof_metrics,
            "ensemble_if_lof": ens_metrics,
            "ensemble_minus_residuals": ablation_metrics,
        },
        "operational": {
            "production_rule_engine": op_prod,
            "ensemble_if_lof": op_ens,
        },
        "latency": latency,
        "ensemble_threshold": threshold,
        "ensemble_weights": {"isolation_forest": w_if, "lof": w_lof},
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
