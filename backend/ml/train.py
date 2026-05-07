"""Train baseline and Isolation Forest anomaly detectors on prepared data.

This script assumes `prepare_data.py` was executed and produced:
- backend/ml/data.npy   (scaled, unified feature matrix)
- backend/ml/scaler.pkl (saved StandardScaler)
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split


ML_DIR = Path(__file__).resolve().parent
DATA_PATH = ML_DIR / "data.npy"
MODEL_PATH = ML_DIR / "model.pkl"


def _inject_synthetic_anomalies(X_test: np.ndarray, anomaly_fraction: float = 0.1) -> tuple[np.ndarray, np.ndarray]:
    del anomaly_fraction  # fixed anomaly count for stable thesis-style comparison
    X_fake = X_test.copy()

    # Ground truth follows {-1: anomaly, 1: normal} to align with Isolation Forest.
    y_true = np.ones(len(X_fake), dtype=int)
    n_anom = min(50, len(X_fake))
    y_true[:n_anom] = -1

    # Synthetic anomalies are required because the merged datasets do not contain
    # reliable anomaly labels. We use two realistic perturbation styles:
    # 1) noise-based drift (subtle sensor perturbation)
    # 2) moderate multiplicative spikes (non-catastrophic excursions)
    half = n_anom // 2
    if half > 0:
        rng = np.random.default_rng(42)
        noise = rng.normal(0.0, 0.5, X_fake.shape)
        X_fake[:half] += noise[:half]
    if n_anom - half > 0:
        rng = np.random.default_rng(99)
        scales = rng.uniform(1.5, 2.0, size=(n_anom - half, 1))
        X_fake[half:n_anom] *= scales

    return X_fake, y_true


def _baseline_zscore_predict(X_train: np.ndarray, X_test: np.ndarray, threshold: float = 3.0) -> np.ndarray:
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


def _build_balanced_eval_set(X_test: np.ndarray, X_fake: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n_normal = min(500, len(X_test))
    n_anom = min(50, len(X_fake))
    if n_normal == 0 or n_anom == 0:
        raise ValueError("Balanced evaluation requires at least 1 normal and 1 anomaly sample.")

    X_normal = X_test[:n_normal]
    X_anomaly = X_fake[:n_anom]
    X_eval = np.concatenate([X_normal, X_anomaly], axis=0)

    y_true = np.ones(len(X_eval), dtype=int)
    y_true[-n_anom:] = -1
    return X_eval, y_true


def _print_metrics(name: str, y_true: np.ndarray, y_pred: np.ndarray) -> None:
    precision = precision_score(y_true, y_pred, pos_label=-1, zero_division=0)
    recall = recall_score(y_true, y_pred, pos_label=-1, zero_division=0)
    f1 = f1_score(y_true, y_pred, pos_label=-1, zero_division=0)
    print(f"{name}:")
    print(f"Precision: {precision:.4f}")
    print(f"Recall: {recall:.4f}")
    print(f"F1: {f1:.4f}")
    print()


def main() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Missing prepared data: {DATA_PATH}. Run prepare_data.py first.")

    X = np.load(DATA_PATH)
    if X.ndim != 2:
        raise ValueError("Expected 2D feature matrix in data.npy.")

    X_train, X_test = train_test_split(X, test_size=0.3, random_state=42, shuffle=True)
    X_fake, _ = _inject_synthetic_anomalies(X_test, anomaly_fraction=0.1)
    X_eval, y_true = _build_balanced_eval_set(X_test, X_fake)

    z_pred = _baseline_zscore_predict(X_train, X_eval, threshold=3.0)

    # Isolation Forest is suitable for mixed-tabular telemetry because it handles
    # non-Gaussian distributions and multivariate isolation without labels.
    model = IsolationForest(contamination=0.05, random_state=42)
    model.fit(X_train)
    # Full test-set metrics are misleading in heavy class imbalance settings:
    # with hundreds of thousands of normal points and few anomalies, precision/recall
    # can look artificially poor or inflated depending on cutoff choice. We therefore
    # report a balanced evaluation split and calibrate threshold on train scores only.
    scores_train = model.decision_function(X_train)
    threshold_5 = float(np.percentile(scores_train, 5))
    threshold_10 = float(np.percentile(scores_train, 10))

    scores_eval = model.decision_function(X_eval)
    if_pred_5 = np.where(scores_eval < threshold_5, -1, 1)
    if_pred_10 = np.where(scores_eval < threshold_10, -1, 1)

    # Default `model.predict()` relies on internal contamination-based cutoffs that
    # can be overly conservative after cross-domain data mixing. Percentile-based
    # score thresholds explicitly tune sensitivity and improve recall visibility.
    # Lower thresholds (e.g., 5%) usually favor precision, while higher anomaly-rate
    # thresholds (e.g., 10%) typically increase recall at some precision cost.
    _print_metrics("Z-score", y_true, z_pred)
    _print_metrics("Isolation Forest (5%)", y_true, if_pred_5)
    _print_metrics("Isolation Forest (10%)", y_true, if_pred_10)
    print(f"Calibrated thresholds: p5={threshold_5:.6f}, p10={threshold_10:.6f}")

    joblib.dump(model, MODEL_PATH)
    print(f"Saved: {MODEL_PATH}")

    # Limitation note for thesis context:
    # Combining simulator and external gas datasets improves coverage but introduces
    # domain shift (different sensors/sampling conditions), so threshold tuning and
    # periodic retraining remain necessary for stable field performance.


if __name__ == "__main__":
    main()