"""Prepare contextual training matrix from unified data sources.

Pipeline:
1. `data_unification.load_unified` joins env CSVs with PIR occupancy and
   the simulator JSON into one chronologically sorted frame.
2. Each row is converted to a feature vector by `feature_builder.build_feature_row`,
   guaranteeing parity with online inference.
3. The resulting matrix X is split chronologically (train / val / test)
   and a `StandardScaler` is fit on the train portion only -- never on
   the full set -- so evaluation metrics are not leaked-into.
4. Proxy labels are computed on raw physical values (NOT on scaled
   features) for explicit baseline comparison and `train.py` reporting.

Outputs (under `backend/ml/`):
- `data.npy`           scaled feature matrix (full chronological order)
- `labels.npy`         proxy labels in {-1, +1}, raw-domain rules
- `splits.npy`         per-row split assignment {0=train, 1=val, 2=test}
- `scaler.pkl`         fitted StandardScaler
- `feature_manifest.json`  schema version, feature names, dataset shape

Methodology note for the thesis defense
---------------------------------------
The proxy labels are derived from raw threshold rules (gas, smoke,
delta_temp, occupancy mismatch). They serve TWO independent purposes:
(a) compute a baseline F1 for hand-crafted rules, and (b) provide a
sanity ceiling for the unsupervised models. The model is NOT trained
against these labels -- IsolationForest and LOF are unsupervised. The
training pipeline only USES `X_train` (no labels). This keeps the
research positioning consistent: contextual unsupervised models with a
rule-baseline comparison.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import joblib
import numpy as np
from sklearn.preprocessing import StandardScaler

from ml.data_unification import UnificationConfig, iter_feature_dicts, load_unified
from ml.feature_builder import build_feature_row
from ml.feature_schema import FEATURE_NAMES, NUM_FEATURES, SCHEMA_VERSION


logger = logging.getLogger(__name__)
ML_DIR = Path(__file__).resolve().parent
DATA_PATH = ML_DIR / "data.npy"
LABELS_PATH = ML_DIR / "labels.npy"
SPLITS_PATH = ML_DIR / "splits.npy"
SCALER_PATH = ML_DIR / "scaler.pkl"
MANIFEST_PATH = ML_DIR / "feature_manifest.json"


# Proxy-label thresholds are derived adaptively from the train slice
# so they respect the dataset's actual sensor scale (MOX/CO units vary
# wildly between hardware). The percentile is conservative enough to
# leave most readings as "normal", which makes the rule-baseline a
# meaningful comparison target rather than the majority class.
PROXY_QUANTILE = 0.99
CONTEXT_QUANTILE = 0.95  # softer threshold used only with context residuals


def _proxy_labels(matrix: np.ndarray, *, train_mask: np.ndarray) -> tuple[np.ndarray, dict]:
    """Compute rule-based proxy labels in {-1 (anomaly), +1 (normal)}.

    Per-channel percentile thresholds are fit on the TRAIN slice so the
    test set is never used to define the rule. The label rule is the
    union of:
      - per-channel exceedances at p99 (univariate outliers)
      - large temperature deltas (>4 deg C / 5 min)
      - context-aware residuals: motion at night, OR gas above p95
        WITH no detected occupancy (the rule expressing the thesis's
        contextual hypothesis).

    Returns the label array and the dict of thresholds for the manifest.
    """
    from ml.feature_schema import FEATURE_INDEX as IDX

    temp = matrix[:, IDX["temperature"]]
    gas = matrix[:, IDX["gas"]]
    smoke = matrix[:, IDX["smoke"]]
    humidity = matrix[:, IDX["humidity"]]
    delta_temp = matrix[:, IDX["delta_temperature_5m"]]
    motion_night = matrix[:, IDX["motion_at_night"]]
    any_motion = matrix[:, IDX["any_motion"]]
    occupancy = matrix[:, IDX["occupancy_total"]]

    train = matrix[train_mask]
    thresholds = {
        "temperature_high": float(np.quantile(train[:, IDX["temperature"]], PROXY_QUANTILE)),
        "gas_high": float(np.quantile(train[:, IDX["gas"]], PROXY_QUANTILE)),
        "smoke_high": float(np.quantile(train[:, IDX["smoke"]], PROXY_QUANTILE)),
        "humidity_high": float(np.quantile(train[:, IDX["humidity"]], PROXY_QUANTILE)),
        "humidity_low": float(np.quantile(train[:, IDX["humidity"]], 1.0 - PROXY_QUANTILE)),
        "gas_context": float(np.quantile(train[:, IDX["gas"]], CONTEXT_QUANTILE)),
        "delta_temp_c": 4.0,
        "proxy_quantile": PROXY_QUANTILE,
        "context_quantile": CONTEXT_QUANTILE,
    }

    univariate = (
        (temp > thresholds["temperature_high"])
        | (gas > thresholds["gas_high"])
        | (smoke > thresholds["smoke_high"])
        | (humidity < thresholds["humidity_low"])
        | (humidity > thresholds["humidity_high"])
        | (np.abs(delta_temp) > thresholds["delta_temp_c"])
    )
    contextual = (motion_night > 0.5) | (
        (gas > thresholds["gas_context"]) & (any_motion < 0.5) & (occupancy <= 0)
    )
    is_anomaly = univariate | contextual
    y = np.ones(matrix.shape[0], dtype=np.int64)
    y[is_anomaly] = -1
    return y, thresholds


def _chronological_split(n_rows: int, *, train: float = 0.6, val: float = 0.2) -> np.ndarray:
    splits = np.full(n_rows, 2, dtype=np.int8)  # default = test
    n_train = int(n_rows * train)
    n_val = int(n_rows * val)
    splits[:n_train] = 0
    splits[n_train : n_train + n_val] = 1
    return splits


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = UnificationConfig.from_env()
    logger.info(
        "loading unified dataset (env_ref=%s env_gas=%s pos=%s sim=%s stride=%s)",
        cfg.env_ref_csv,
        cfg.env_gas_csv,
        cfg.pos_csv,
        cfg.simulator_json,
        cfg.sample_stride,
    )
    df = load_unified(cfg)
    logger.info("unified frame rows=%d", len(df))

    raw_rows: list[list[float]] = []
    for kwargs in iter_feature_dicts(df):
        raw_rows.append(build_feature_row(**kwargs))

    X_raw = np.asarray(raw_rows, dtype=np.float64)
    if X_raw.shape[1] != NUM_FEATURES:
        raise RuntimeError(
            f"feature matrix width {X_raw.shape[1]} != schema {NUM_FEATURES}"
        )
    logger.info("feature matrix shape=%s features=%d", X_raw.shape, NUM_FEATURES)

    splits = _chronological_split(X_raw.shape[0])
    train_mask = splits == 0
    if train_mask.sum() < 100:
        raise RuntimeError(
            f"Train split too small ({int(train_mask.sum())} rows); check inputs."
        )

    scaler = StandardScaler()
    scaler.fit(X_raw[train_mask])
    X_scaled = scaler.transform(X_raw)

    y, raw_thresholds = _proxy_labels(X_raw, train_mask=train_mask)

    ML_DIR.mkdir(parents=True, exist_ok=True)
    np.save(DATA_PATH, X_scaled)
    np.save(LABELS_PATH, y)
    np.save(SPLITS_PATH, splits)
    joblib.dump(scaler, SCALER_PATH)

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "feature_names": list(FEATURE_NAMES),
        "rows_total": int(X_raw.shape[0]),
        "rows_train": int(train_mask.sum()),
        "rows_val": int((splits == 1).sum()),
        "rows_test": int((splits == 2).sum()),
        "anomalies_total": int((y == -1).sum()),
        "raw_thresholds": raw_thresholds,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    logger.info(
        "saved %s rows=%d anomalies=%d (%.2f%%)",
        DATA_PATH.name,
        manifest["rows_total"],
        manifest["anomalies_total"],
        100.0 * manifest["anomalies_total"] / manifest["rows_total"],
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
