"""Train baseline (Z-score) and Isolation Forest anomaly detectors.

Inputs (produced by prepare_data.py):
- backend/ml/data.npy    -- scaled feature matrix
- backend/ml/labels.npy  -- rule-based proxy labels in {-1, +1}, raw-domain
- backend/ml/scaler.pkl  -- fitted StandardScaler reused at inference

Methodology note (read this before defending the thesis)
--------------------------------------------------------
Real labeled IoT-anomaly datasets at home scale are unavailable, so we use
RULE-BASED PROXY LABELS derived from physical thresholds (temperature,
gas, smoke, delta_temp) computed on the RAW feature matrix in
prepare_data.py. The metric reported here is therefore the agreement
between the unsupervised IsolationForest model and a hand-crafted rule
set -- not detection of unknown failure modes. Strengths and limitations:

  + Rules operate in physical units, so labels are interpretable.
  + Labels are fixed before training; no synthetic perturbation of test
    samples is applied (which would be circular evaluation).
  - Perfect agreement would imply the model is redundant with the rules.
  - The metric does not bound performance on unseen failure modes.
  - Extension: replace with a labeled benchmark (NAB / SWaT / WADI) for a
    stronger evaluation.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import joblib
import numpy as np
import numpy.typing as npt
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split


ML_DIR = Path(__file__).resolve().parent
DATA_PATH = ML_DIR / "data.npy"
LABELS_PATH = ML_DIR / "labels.npy"
MODEL_PATH = ML_DIR / "model.pkl"
FloatArray = npt.NDArray[np.float64]
IntArray = npt.NDArray[np.int64]


def _baseline_zscore_predict(
    X_train: FloatArray, X_test: FloatArray, threshold: float = 3.0
) -> np.ndarray:
    # Z-score is a transparent baseline with closed-form assumptions and no
    # learned tree structure, useful for thesis comparison against Isolation Forest.
    mean = X_train.mean(axis=0)
    std = X_train.std(axis=0)
    std = np.where(std == 0.0, 1e-8, std)
    z = (X_test - mean) / std
    is_anomaly = np.any(np.abs(z) > threshold, axis=1)
    return np.where(is_anomaly, -1, 1)


def _iforest_percentile_predict(scores: np.ndarray, percentile: int) -> tuple[np.ndarray, float]:
    threshold = float(np.percentile(scores, percentile))
    pred = np.where(scores < threshold, -1, 1)
    return pred, threshold


def _print_metrics(name: str, y_true: np.ndarray, y_pred: np.ndarray) -> None:
    # sklearn's type stubs can be stricter than runtime API for zero_division.
    precision = precision_score(y_true, y_pred, pos_label=-1, zero_division=cast(Any, 0))
    recall = recall_score(y_true, y_pred, pos_label=-1, zero_division=cast(Any, 0))
    f1 = f1_score(y_true, y_pred, pos_label=-1, zero_division=cast(Any, 0))
    print(f"{name}:")
    print(f"Precision: {precision:.4f}")
    print(f"Recall: {recall:.4f}")
    print(f"F1: {f1:.4f}")
    print()


def main() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Missing prepared data: {DATA_PATH}. Run prepare_data.py first.")
    if not LABELS_PATH.exists():
        raise FileNotFoundError(
            f"Missing labels: {LABELS_PATH}. Re-run prepare_data.py to regenerate "
            "labels.npy (rules are evaluated on raw values there)."
        )

    X = cast(FloatArray, np.load(DATA_PATH))
    y = cast(IntArray, np.load(LABELS_PATH))
    if X.ndim != 2:
        raise ValueError("Expected 2D feature matrix in data.npy.")
    if y.shape[0] != X.shape[0]:
        raise ValueError(
            f"Label/feature length mismatch: y={y.shape[0]}, X={X.shape[0]}. "
            "Regenerate both with prepare_data.py."
        )

    # Split features and labels together so y_test stays aligned to X_test.
    X_train, X_test, _y_train, y_test = cast(
        tuple[FloatArray, FloatArray, IntArray, IntArray],
        train_test_split(X, y, test_size=0.3, random_state=42, shuffle=True),
    )

    num_anomalies = int((y_test == -1).sum())
    total = len(y_test)
    print(f"Test samples: {total}")
    print(f"Rule-based anomalies in test: {num_anomalies} ({num_anomalies / total:.2%})")
    print()

    z_pred = _baseline_zscore_predict(X_train, X_test, threshold=3.0)

    # Isolation Forest is suitable for mixed-tabular telemetry because it handles
    # non-Gaussian distributions and multivariate isolation without labels.
    # sklearn's stubs may type contamination as str, though float works at runtime.
    model = IsolationForest(contamination=cast(Any, 0.05), random_state=42)
    model.fit(X_train)
    scores = model.decision_function(X_test)
    print(f"Score range: min={scores.min():.4f}, max={scores.max():.4f}")
    print()

    pred_5, thr_5 = _iforest_percentile_predict(scores, 5)
    pred_10, thr_10 = _iforest_percentile_predict(scores, 10)

    # Threshold tuning exposes the precision/recall trade-off: 5% is stricter and
    # usually improves precision, while 10% is more sensitive and usually improves
    # recall. In safety-oriented systems, a lower recall may still be acceptable
    # when each alert triggers costly manual checks and high precision is required.
    _print_metrics("Z-score", y_test, z_pred)
    _print_metrics("Isolation Forest (5%)", y_test, pred_5)
    _print_metrics("Isolation Forest (10%)", y_test, pred_10)
    print("Thresholds:")
    print(f"p5={thr_5:.6f}")
    print(f"p10={thr_10:.6f}")

    joblib.dump(model, MODEL_PATH)
    print(f"Saved: {MODEL_PATH}")

    # Limitation note for thesis context:
    # Combining simulator and external gas datasets improves coverage but introduces
    # domain shift (different sensors/sampling conditions), so threshold tuning and
    # periodic retraining remain necessary for stable field performance.


if __name__ == "__main__":
    main()
