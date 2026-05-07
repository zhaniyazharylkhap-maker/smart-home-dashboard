"""Prepare unified anomaly-detection dataset for training.

This script merges:
1) simulator/data/sensors_dataset.json
2) external gas-monitoring CSV dataset(s)

All records are mapped into a single base feature space:
[temperature, light, motion, gas, smoke]

Then engineered features are appended:
[delta_temp, rolling_mean_temp_window_5]

The final matrix is normalized with StandardScaler and stored as data.npy.
The fitted scaler is stored as scaler.pkl and reused during backend inference.
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
# Dataset path is configurable via DATA_PATH for reproducible runs across machines.
DATA_PATH = os.getenv("DATA_PATH", "data/default_dataset.csv")


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value if isinstance(value, (int, float, str)) else default)
    except (TypeError, ValueError):
        return default


def _load_sensors_rows(path: Path) -> list[list[float]]:
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    rows: list[list[float]] = []
    for point in payload.get("data", []):
        temperature = _safe_float(point.get("temperature"))
        light = _safe_float(point.get("light"))
        motion = 1.0 if bool(point.get("motion")) else 0.0

        # The simulator source has no native gas/smoke channels; derive weak proxies
        # so the model still trains in the same fixed feature schema.
        gas = 0.15 * temperature + np.random.normal(0.0, 0.03)
        smoke = 0.08 * temperature + np.random.normal(0.0, 0.02)

        rows.append([temperature, light, motion, float(gas), float(smoke)])
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


def main() -> None:
    np.random.seed(42)

    external_path = Path(DATA_PATH)

    sensors_rows = _load_sensors_rows(SENSORS_JSON_PATH)
    external_rows = _load_external_rows(external_path)
    all_rows = sensors_rows + external_rows
    if not all_rows:
        raise RuntimeError("No rows collected from datasets.")

    X_base = np.asarray(all_rows, dtype=np.float64)
    X = _append_engineered_features(X_base)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    ML_DIR.mkdir(parents=True, exist_ok=True)
    np.save(ML_DIR / "data.npy", X_scaled)
    joblib.dump(scaler, ML_DIR / "scaler.pkl")

    print(
        "Prepared data:",
        f"sensors_rows={len(sensors_rows)}",
        f"external_rows={len(external_rows)}",
        f"total_rows={len(all_rows)}",
        f"features={X_scaled.shape[1]}",
    )
    print(f"Saved: {ML_DIR / 'data.npy'}")
    print(f"Saved: {ML_DIR / 'scaler.pkl'}")


if __name__ == "__main__":
    main()
