"""Prepare unified anomaly-detection dataset for training.

Source datasets:
1) external gas-monitoring CSV(s)               -- real sensor readings
2) (OPT-IN) simulator/data/sensors_dataset.json -- light/motion/temperature only

Base feature space (raw, unscaled):
[temperature, light, motion, gas, smoke]

Engineered features appended (raw, unscaled):
[delta_temp, rolling_mean_temp_window_5]

Outputs (all written to backend/ml/):
- data.npy    -- StandardScaler-transformed feature matrix
- labels.npy  -- rule-based proxy labels in {-1, +1} aligned to data.npy rows
- scaler.pkl  -- fitted StandardScaler reused at inference

Why labels are computed BEFORE scaling
--------------------------------------
Domain rules (e.g. "temperature > 35 C") are expressed in physical units.
Applying them to standardized features (mean 0 / std 1) is a category error:
"35" in z-score space is ~35 standard deviations from the mean and would label
zero rows as anomalies. Labels MUST be derived from raw values; the scaled
matrix is then only used for the model's input.

Why simulator rows are excluded from ML by default (USE_SIMULATOR_DATA=False)
----------------------------------------------------------------------------
The simulator dataset only carries [temperature, light, motion]; in earlier
revisions we synthesized gas/smoke as `0.15 * temperature + noise` and
`0.08 * temperature + noise` to keep the schema fixed. That created a
deterministic correlation between temperature and gas/smoke that does not
exist at inference time, where gas/smoke arrive independently from the
device. Training on those rows imprinted a fake correlation onto the model.
Default is OFF; set USE_SIMULATOR_DATA=true ONLY if you understand the
distribution-shift consequence and document it in the thesis.
"""

from __future__ import annotations

import csv
import json
import os
from pathlib import Path

import joblib  # pyright: ignore[reportMissingImports]
import numpy as np  # pyright: ignore[reportMissingImports]
from sklearn.preprocessing import StandardScaler  # pyright: ignore[reportMissingImports]


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_DIR = Path(__file__).resolve().parent
SENSORS_JSON_PATH = PROJECT_ROOT / "simulator" / "data" / "sensors_dataset.json"
# External CSV path is configurable via DATA_PATH for reproducible runs across
# machines. No machine-specific path is hardcoded.
DATA_PATH = os.getenv("DATA_PATH", "data/default_dataset.csv")
USE_SIMULATOR_DATA = os.getenv("USE_SIMULATOR_DATA", "false").lower() in {
    "1",
    "true",
    "yes",
}

# Domain anomaly thresholds expressed in raw physical units. These are the
# same boundaries used by the alert engine's rules; using them as proxy
# labels measures how well IsolationForest agrees with hand-crafted rules
# (the limitation is documented in train.py).
TEMP_ANOMALY_C = 35.0
GAS_ANOMALY = 0.6
SMOKE_ANOMALY = 0.5
DELTA_TEMP_ANOMALY_C = 5.0


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value if isinstance(value, (int, float, str)) else default)
    except (TypeError, ValueError):
        return default


def _load_sensors_rows(path: Path) -> list[list[float]]:
    """Load simulator JSON rows. Used only when USE_SIMULATOR_DATA is True."""
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    rows: list[list[float]] = []
    for point in payload.get("data", []):
        temperature = _safe_float(point.get("temperature"))
        light = _safe_float(point.get("light"))
        motion = 1.0 if bool(point.get("motion")) else 0.0
        # Honest absence of data: simulator has no gas/smoke channels. We do
        # NOT synthesize them as a function of temperature anymore -- that
        # introduced train/inference distribution shift. Zero is an honest
        # null marker because ingestion also defaults missing gas/smoke to 0.
        gas = 0.0
        smoke = 0.0
        rows.append([temperature, light, motion, gas, smoke])
    return rows


def _iter_external_csv_files(external_path: Path) -> list[Path]:
    if external_path.is_file() and external_path.suffix.lower() == ".csv":
        return [external_path]
    if not external_path.exists():
        raise FileNotFoundError(f"External dataset path does not exist: {external_path}")
    if not external_path.is_dir():
        raise ValueError(f"External dataset path must be CSV file or directory: {external_path}")
    return sorted(external_path.glob("*.csv"))


def _load_external_rows(external_path: Path) -> list[list[float]]:
    csv_files = _iter_external_csv_files(external_path)
    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in external dataset path: {external_path}")

    rows: list[list[float]] = []
    for csv_path in csv_files:
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for item in reader:
                temperature = _safe_float(item.get("temperature"))

                # The external dataset has no light field; use a normalized proxy derived
                # from CO2CosIRValue to keep physical meaning while preserving schema.
                co2_cosir = _safe_float(item.get("CO2CosIRValue"))
                light = co2_cosir / 1024.0

                motion = 0.0
                gas = _safe_float(item.get("COValue"))
                smoke = float(
                    np.mean(
                        [
                            _safe_float(item.get("MOX1")),
                            _safe_float(item.get("MOX2")),
                            _safe_float(item.get("MOX3")),
                            _safe_float(item.get("MOX4")),
                        ]
                    )
                )
                rows.append([temperature, light, motion, gas, smoke])
    return rows


def _append_engineered_features(X_base: np.ndarray) -> np.ndarray:
    temperatures = X_base[:, 0]
    delta_temp = np.diff(temperatures, prepend=temperatures[0])

    rolling_mean_temp = np.zeros_like(temperatures)
    for i in range(len(temperatures)):
        start = max(0, i - 4)
        rolling_mean_temp[i] = np.mean(temperatures[start : i + 1])

    return np.column_stack([X_base, delta_temp, rolling_mean_temp])


def _rule_labels_from_raw(X_raw: np.ndarray) -> np.ndarray:
    """Compute rule-based proxy labels on RAW (unscaled) feature matrix.

    Feature order: [temperature, light, motion, gas, smoke, delta_temp, rolling_mean_temp]

    Returns: int array in {-1, +1} where -1 marks anomaly, +1 marks normal.
    Aligned 1:1 with the rows of X_raw.
    """
    temperature = X_raw[:, 0]
    gas = X_raw[:, 3]
    smoke = X_raw[:, 4]
    delta_temp = X_raw[:, 5]

    rule_anomaly = (
        (temperature > TEMP_ANOMALY_C)
        | (gas > GAS_ANOMALY)
        | (smoke > SMOKE_ANOMALY)
        | (np.abs(delta_temp) > DELTA_TEMP_ANOMALY_C)
    )
    y = np.ones(len(X_raw), dtype=int)
    y[rule_anomaly] = -1
    return y


def main() -> None:
    np.random.seed(42)

    external_path = Path(DATA_PATH)
    external_rows = _load_external_rows(external_path)

    sensors_rows: list[list[float]] = []
    if USE_SIMULATOR_DATA:
        # Opt-in only. See module docstring for the distribution-shift caveat.
        sensors_rows = _load_sensors_rows(SENSORS_JSON_PATH)

    all_rows = sensors_rows + external_rows
    if not all_rows:
        raise RuntimeError("No rows collected from datasets.")

    X_base = np.asarray(all_rows, dtype=np.float64)
    X_raw = _append_engineered_features(X_base)

    # CRITICAL: labels are computed on RAW features so that physical thresholds
    # (e.g. temperature > 35 C) match the data they are written for. Applying
    # the same thresholds to scaled values would mark zero rows as anomalies.
    y = _rule_labels_from_raw(X_raw)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_raw)

    ML_DIR.mkdir(parents=True, exist_ok=True)
    np.save(ML_DIR / "data.npy", X_scaled)
    np.save(ML_DIR / "labels.npy", y)
    joblib.dump(scaler, ML_DIR / "scaler.pkl")

    n_anom = int((y == -1).sum())
    print(
        "Prepared data:",
        f"sensors_rows={len(sensors_rows)}",
        f"external_rows={len(external_rows)}",
        f"total_rows={len(all_rows)}",
        f"features={X_scaled.shape[1]}",
        f"rule_anomalies={n_anom} ({n_anom / len(y):.2%})",
        f"use_simulator_data={USE_SIMULATOR_DATA}",
    )
    print(f"Saved: {ML_DIR / 'data.npy'}")
    print(f"Saved: {ML_DIR / 'labels.npy'}")
    print(f"Saved: {ML_DIR / 'scaler.pkl'}")


if __name__ == "__main__":
    main()
