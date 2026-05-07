"""Train baseline and Isolation Forest anomaly detectors on prepared data.

This script assumes `prepare_data.py` was executed and produced:
- backend/ml/data.npy   (scaled, unified feature matrix)
- backend/ml/scaler.pkl (saved StandardScaler)
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
MODEL_PATH = ML_DIR / "model.pkl"
FloatArray = npt.NDArray[np.float64]


def generate_rule_labels(X: FloatArray) -> np.ndarray:
    """
    Generate anomaly labels using domain rules.

    Feature order:
    [temperature, light, motion, gas, smoke, delta_temp, rolling_mean]
    """
    # Synthetic anomaly injection was removed because it can bias evaluation with
    # artifacts that may not represent real IoT failure/safety conditions.
    # In diploma-scale unsupervised anomaly detection, labeled IoT anomalies are
    # often unavailable; therefore, rule-based proxy labels are a common and
    # academically defensible way to estimate precision/recall/F1.
    temperature = X[:, 0]
    gas = X[:, 3]
    smoke = X[:, 4]
    delta_temp = X[:, 5]

    rule_anomaly = (
        (temperature > 35)
        | (gas > 0.6)
        | (smoke > 0.5)
        | (np.abs(delta_temp) > 5)
    )

    y = np.ones(len(X))
    y[rule_anomaly] = -1
    return y.astype(int)


def _baseline_zscore_predict(X_train: FloatArray, X_test: FloatArray, threshold: float = 3.0) -> np.ndarray:
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

    X = cast(FloatArray, np.load(DATA_PATH))
    if X.ndim != 2:
        raise ValueError("Expected 2D feature matrix in data.npy.")

    X_train, X_test = cast(tuple[FloatArray, FloatArray], train_test_split(X, test_size=0.3, random_state=42, shuffle=True))
    y_true = generate_rule_labels(X_test)
    num_anomalies = int((y_true == -1).sum())
    total = len(y_true)
    print(f"Total samples: {total}")
    print(f"Rule-based anomalies: {num_anomalies} ({num_anomalies / total:.2%})")
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

    threshold = max(float(np.percentile(scores, 5)), 1e-6)
    pred_5 = np.where(scores < threshold, -1, 1)
    thr_5 = threshold
    pred_10, thr_10 = _iforest_percentile_predict(scores, 10)

    # Threshold tuning exposes the precision/recall trade-off: 5% is stricter and
    # usually improves precision, while 10% is more sensitive and usually improves
    # recall. In safety-oriented systems, a lower recall may still be acceptable
    # when each alert triggers costly manual checks and high precision is required.
    _print_metrics("Z-score", y_true, z_pred)
    _print_metrics("Isolation Forest (5%)", y_true, pred_5)
    _print_metrics("Isolation Forest (10%)", y_true, pred_10)
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