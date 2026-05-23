"""Train contextual anomaly detectors: IsolationForest + LocalOutlierFactor.

Inputs (produced by `prepare_data.py`):
- `data.npy`               scaled feature matrix in chronological order
- `labels.npy`             rule-based proxy labels in {-1, +1}
- `splits.npy`             per-row split assignment {0=train, 1=val, 2=test}
- `scaler.pkl`             fitted StandardScaler (carried through to inference)
- `feature_manifest.json`  schema version, feature names, dataset shape

Outputs (overwritten on each run):
- `model_if.pkl`     IsolationForest trained on the train slice
- `model_lof.pkl`    LocalOutlierFactor (novelty=True) trained on train slice
- `model.pkl`        backwards-compat alias = IsolationForest model
- `feature_manifest.json`  enriched with score-normalization stats and
                            adaptive-threshold defaults

Methodology (thesis defense talking points)
-------------------------------------------
- The two detectors are unsupervised; they NEVER see labels during fit.
- Train/val/test are chronological so we never report on a test set
  that overlaps the training window.
- Normalization stats (`score_min`, `score_max`) are derived on the
  TRAIN slice only and frozen in the manifest. They map detector
  decision_functions to a stable 0-100 anomaly score at inference.
- The default adaptive threshold is the train-slice 95th percentile of
  the ensemble score; the inference service may override it per-device
  with rolling quantiles if enough samples are observed.
- The rule-based F1 reported below is a BASELINE -- it measures how
  well a hand-crafted threshold engine matches the same proxy labels.
  IsolationForest/LOF F1 are reported on the same labels; an honest
  thesis discussion compares them along with operational metrics
  (false alerts/day, time-to-detect) computed by `scripts/evaluate.py`.
  Chapter 4 headline F1 scores (offline ~0.87, live injection ~0.80)
  are reproduced by `scripts/evaluate_thesis.py` — see `docs/thesis/METRICS.md`.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.neighbors import LocalOutlierFactor

from ml.feature_schema import FEATURE_NAMES, NUM_FEATURES, SCHEMA_VERSION


logger = logging.getLogger(__name__)
ML_DIR = Path(__file__).resolve().parent
DATA_PATH = ML_DIR / "data.npy"
LABELS_PATH = ML_DIR / "labels.npy"
SPLITS_PATH = ML_DIR / "splits.npy"
MANIFEST_PATH = ML_DIR / "feature_manifest.json"
MODEL_IF_PATH = ML_DIR / "model_if.pkl"
MODEL_LOF_PATH = ML_DIR / "model_lof.pkl"
LEGACY_MODEL_PATH = ML_DIR / "model.pkl"


# Ensemble weights. IsolationForest is a higher-precision detector on
# this dataset (manifest typically reports IF F1 ~= 0.45, LOF F1 ~= 0.30
# at native operating points); LOF contributes recall on the long-tail
# contextual outliers but drags precision down at equal weight. The
# 0.7/0.3 split favours IF as the principal detector while still
# admitting LOF's contextual sensitivity. Re-tune empirically per dataset
# by re-running `scripts/evaluate.py` after each train.
W_IF = 0.7
W_LOF = 0.3
# Default threshold is set adaptively so the predicted anomaly rate on
# the train slice matches the prevalence of proxy anomalies. Falling
# back to q95 keeps things reasonable when labels are degenerate.
FALLBACK_TRAIN_QUANTILE = 0.95


def _normalize(scores: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Map raw scores (lower = more normal) to 0-100 (higher = more anomalous)."""
    rng = hi - lo
    if rng <= 1e-12:
        return np.zeros_like(scores)
    inv = (hi - scores) / rng  # 1.0 = max anomaly, 0.0 = max normal
    return np.clip(inv * 100.0, 0.0, 100.0)


def _label_self_consistency_predictions(y: np.ndarray) -> np.ndarray:
    """Return labels-as-predictions; F1=1.0 by construction.

    `prepare_data._proxy_labels` IS the rule that produced the labels;
    feeding its own output back as predictions gives a perfect score.
    Kept here ONLY as a sanity ceiling -- the meaningful rule baseline
    (the production alert-engine thresholds) is reported by
    `scripts/evaluate.py` against the raw test values.
    """
    return y.copy()


def _print_metrics(name: str, y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    precision = precision_score(y_true, y_pred, pos_label=-1, zero_division=0)
    recall = recall_score(y_true, y_pred, pos_label=-1, zero_division=0)
    f1 = f1_score(y_true, y_pred, pos_label=-1, zero_division=0)
    print(f"{name:32s} precision={precision:.3f} recall={recall:.3f} f1={f1:.3f}")
    return {
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"{DATA_PATH} missing -- run prepare_data.py first.")
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(
            f"{MANIFEST_PATH} missing -- run prepare_data.py first."
        )

    X = np.load(DATA_PATH)
    y = np.load(LABELS_PATH)
    splits = np.load(SPLITS_PATH)
    if X.shape[1] != NUM_FEATURES:
        raise RuntimeError(
            f"data.npy has {X.shape[1]} features, schema expects {NUM_FEATURES}"
        )

    train_mask = splits == 0
    test_mask = splits == 2
    X_train, X_test = X[train_mask], X[test_mask]
    y_train = y[train_mask]
    y_test = y[test_mask]
    if X_train.shape[0] < 50:
        raise RuntimeError(
            f"Train slice too small: {X_train.shape[0]} rows; "
            "increase data volume or lower SAMPLE_STRIDE."
        )
    train_anomaly_rate = float((y_train == -1).mean())
    print(
        f"rows: train={X_train.shape[0]} test={X_test.shape[0]} "
        f"features={X.shape[1]} train_anomaly_rate={train_anomaly_rate:.3f}"
    )

    # --- IsolationForest ----------------------------------------------------
    iforest = IsolationForest(
        n_estimators=200,
        contamination="auto",
        random_state=42,
        n_jobs=-1,
    )
    iforest.fit(X_train)
    if_train = iforest.decision_function(X_train)
    if_test = iforest.decision_function(X_test)

    # --- LocalOutlierFactor (novelty mode for inference) -------------------
    lof = LocalOutlierFactor(
        n_neighbors=35,
        novelty=True,
        contamination="auto",
        n_jobs=-1,
    )
    lof.fit(X_train)
    lof_train = lof.decision_function(X_train)
    lof_test = lof.decision_function(X_test)

    # --- Score normalization ranges (frozen on train) ----------------------
    if_lo, if_hi = float(np.min(if_train)), float(np.max(if_train))
    lof_lo, lof_hi = float(np.min(lof_train)), float(np.max(lof_train))

    if_train_norm = _normalize(if_train, if_lo, if_hi)
    if_test_norm = _normalize(if_test, if_lo, if_hi)
    lof_train_norm = _normalize(lof_train, lof_lo, lof_hi)
    lof_test_norm = _normalize(lof_test, lof_lo, lof_hi)

    ens_train = W_IF * if_train_norm + W_LOF * lof_train_norm
    ens_test = W_IF * if_test_norm + W_LOF * lof_test_norm
    # If the rule-baseline produces a sensible (1-50%) anomaly rate, set
    # the threshold so the ensemble flags roughly that fraction. This
    # makes the unsupervised models comparable to the rule baseline
    # without forcing one to operate at the wrong operating point.
    if 0.005 <= train_anomaly_rate <= 0.5:
        threshold_quantile = 1.0 - train_anomaly_rate
    else:
        threshold_quantile = FALLBACK_TRAIN_QUANTILE
    threshold = float(np.quantile(ens_train, threshold_quantile))
    print(
        f"adaptive_threshold(train-q{threshold_quantile:.3f})={threshold:.3f} "
        f"(matched to anomaly_rate={train_anomaly_rate:.3f})"
    )

    def _to_pm1(scores: np.ndarray, thr: float) -> np.ndarray:
        return np.where(scores >= thr, -1, 1)

    self_consistency_metrics = _print_metrics(
        "Label self-consistency (F1=1)",
        y_test,
        _label_self_consistency_predictions(y_test),
    )
    if_metrics = _print_metrics(
        "IsolationForest (alone)",
        y_test,
        np.where(iforest.predict(X_test) == -1, -1, 1),
    )
    lof_metrics = _print_metrics(
        "LocalOutlierFactor (alone)",
        y_test,
        np.where(lof.predict(X_test) == -1, -1, 1),
    )
    ens_metrics = _print_metrics(
        "IF+LOF ensemble (q95 threshold)",
        y_test,
        _to_pm1(ens_test, threshold),
    )

    # --- Persist artifacts -------------------------------------------------
    joblib.dump(iforest, MODEL_IF_PATH)
    joblib.dump(lof, MODEL_LOF_PATH)
    # Backward-compat: legacy `model.pkl` alias for the existing
    # `services/anomaly_service.py` consumer that looks up `model.pkl`.
    joblib.dump(iforest, LEGACY_MODEL_PATH)

    manifest: dict[str, Any] = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest.update(
        {
            "schema_version": SCHEMA_VERSION,
            "feature_names": list(FEATURE_NAMES),
            "ensemble": {
                "weights": {"isolation_forest": W_IF, "lof": W_LOF},
                "score_ranges": {
                    "isolation_forest": {"lo": if_lo, "hi": if_hi},
                    "lof": {"lo": lof_lo, "hi": lof_hi},
                },
                "default_threshold": threshold,
                "default_threshold_quantile": threshold_quantile,
                "train_anomaly_rate": train_anomaly_rate,
            },
            "metrics": {
                "label_self_consistency": self_consistency_metrics,
                "isolation_forest": if_metrics,
                "lof": lof_metrics,
                "ensemble": ens_metrics,
            },
        }
    )
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"saved {MODEL_IF_PATH.name}, {MODEL_LOF_PATH.name}, manifest updated")


if __name__ == "__main__":
    main()
