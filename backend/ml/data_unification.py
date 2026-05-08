"""Unified loader: 3 CSV datasets + simulator JSON -> contextual frame.

Inputs (paths configurable via env vars):
- DATA_REF_CSV       env_ref-style CSV: timestamp, temperature, humidity,
                     CO2CosIRValue, CO2MG811Value, MOX1..4, COValue
- DATA_GAS_CSV       same schema as DATA_REF_CSV (longer recording)
- DATA_POS_CSV       per-room PIR occupancy: datetime + 5 room columns
- SIM_DATASET_JSON   simulator/data/sensors_dataset.json (optional)

Outputs (in-memory `pandas.DataFrame`):
- one row per environmental sample
- timestamps aligned to UTC
- occupancy joined via `merge_asof` with backward direction so each
  env sample sees the most recent known PIR state
- canonical environment columns matching `feature_builder.build_feature_row`

This module is read-only and does not write artifacts. Callers
(`prepare_data.py`, `scripts/evaluate.py`) decide how to scale, label,
and serialize the resulting frame.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

# Synthetic anchor for simulator JSONs that only carry a relative `t`
# (seconds since start). Anchoring is arbitrary -- we only need a
# monotone increasing series so rolling windows still make sense.
_SIM_BASE_TIME = datetime(2024, 1, 1, tzinfo=timezone.utc)


logger = logging.getLogger(__name__)


# Position file column -> normalized room name used elsewhere in the system.
_POS_COLUMN_MAP = {
    "Living room": "living_room",
    "Bedroom": "bedroom",
    "Bathroom": "bathroom",
    "Kitchen": "kitchen",
    "Hallway": "hallway",
}
_POS_COLUMNS = list(_POS_COLUMN_MAP.keys())


@dataclass(frozen=True)
class UnificationConfig:
    """Where to read each source from. All optional except env CSVs."""

    env_ref_csv: Path | None
    env_gas_csv: Path | None
    pos_csv: Path | None
    simulator_json: Path | None
    sample_stride: int = 1  # take every Nth env row to control train size

    @classmethod
    def from_env(cls) -> "UnificationConfig":
        def _opt(name: str) -> Path | None:
            v = os.environ.get(name, "").strip()
            return Path(v) if v else None

        return cls(
            env_ref_csv=_opt("DATA_REF_CSV"),
            env_gas_csv=_opt("DATA_GAS_CSV"),
            pos_csv=_opt("DATA_POS_CSV"),
            simulator_json=_opt("SIM_DATASET_JSON"),
            sample_stride=max(1, int(os.environ.get("SAMPLE_STRIDE", "5"))),
        )


def _read_env_csv(path: Path) -> pd.DataFrame:
    """Read one env-style CSV and project it onto the canonical columns."""
    df = pd.read_csv(
        path,
        usecols=[
            "timestamp",
            "temperature",
            "humidity",
            "CO2CosIRValue",
            "MOX1",
            "MOX2",
            "MOX3",
            "MOX4",
            "COValue",
        ],
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df.dropna(subset=["timestamp"]).sort_values("timestamp")

    # Map to the canonical environmental schema. The CO sensor value
    # serves as the gas channel; smoke is approximated by the average of
    # the four MOX metal-oxide sensors. CO2CosIRValue is normalized to a
    # 0..1 light proxy (the dataset has no real lux sensor).
    df["gas"] = df["COValue"].astype(float)
    df["smoke"] = df[["MOX1", "MOX2", "MOX3", "MOX4"]].astype(float).mean(axis=1)
    df["light"] = df["CO2CosIRValue"].astype(float) / 1024.0
    df["temperature"] = df["temperature"].astype(float)
    df["humidity"] = df["humidity"].astype(float)
    df = df[["timestamp", "temperature", "humidity", "gas", "smoke", "light"]]
    return df.reset_index(drop=True)


def _read_pos_csv(path: Path) -> pd.DataFrame:
    """Read the per-room PIR occupancy CSV.

    Each row records ONE room's state change (others are NaN). We
    forward-fill per column so any timestamp can be queried for the most
    recent known state of every room.
    """
    df = pd.read_csv(path, usecols=["datetime", *_POS_COLUMNS])
    df = df.rename(columns={"datetime": "timestamp"})
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df.dropna(subset=["timestamp"]).sort_values("timestamp")

    # Forward-fill per room so each row reflects the cumulative PIR
    # state of every monitored room.
    df[_POS_COLUMNS] = df[_POS_COLUMNS].ffill()
    df = df.fillna({col: 0.0 for col in _POS_COLUMNS})
    df[_POS_COLUMNS] = df[_POS_COLUMNS].astype(float).clip(0.0, 1.0)

    df["occupancy_total"] = df[_POS_COLUMNS].sum(axis=1)
    df["any_motion"] = (df["occupancy_total"] > 0).astype(float)

    keep = ["timestamp", "occupancy_total", "any_motion", *_POS_COLUMNS]
    return df[keep].reset_index(drop=True)


def _join_env_with_occupancy(
    env: pd.DataFrame, pos: pd.DataFrame | None
) -> pd.DataFrame:
    """Backward `merge_asof` so each env row sees the latest known PIR state."""
    if pos is None or pos.empty:
        env = env.copy()
        env["occupancy_total"] = 0.0
        env["any_motion"] = 0.0
        for col in _POS_COLUMNS:
            env[_POS_COLUMN_MAP[col]] = 0.0
        return env

    env_sorted = env.sort_values("timestamp")
    pos_sorted = pos.sort_values("timestamp")
    merged = pd.merge_asof(
        env_sorted,
        pos_sorted,
        on="timestamp",
        direction="backward",
        allow_exact_matches=True,
    )
    # Rename PIR columns to canonical room names.
    merged = merged.rename(columns=_POS_COLUMN_MAP)
    # Fill rows that fall before the first PIR record with zero
    # (interpreted as "no observed activity yet").
    occ_cols = ["occupancy_total", "any_motion", *_POS_COLUMN_MAP.values()]
    for col in occ_cols:
        if col in merged.columns:
            merged[col] = merged[col].fillna(0.0)
    return merged.reset_index(drop=True)


def _attach_temporal_room(df: pd.DataFrame) -> pd.DataFrame:
    """Choose a `room` per row.

    For the offline dataset the multisensor sits at one location, so we
    use whichever room is currently active (PIR=1). Ties resolve to a
    deterministic priority. If no room is active, we mark `unknown`,
    which makes the room-profile residual fall back to the default.
    """
    df = df.copy()
    priority = ["bathroom", "kitchen", "bedroom", "living_room", "hallway"]
    available = [r for r in priority if r in df.columns]
    if not available:
        df["room"] = "unknown"
        return df
    rooms_arr = df[available].to_numpy()
    chosen: list[str] = []
    for row in rooms_arr:
        idx = int(np.argmax(row))
        chosen.append(available[idx] if row[idx] >= 0.5 else "unknown")
    df["room"] = chosen
    return df


def _attach_rolling(df: pd.DataFrame) -> pd.DataFrame:
    """Compute the rolling stats expected by `build_feature_row`.

    The frame must already be sorted by timestamp. Windows are time-
    based (5 min, 30 min) so they remain meaningful even if the raw
    sample rate is irregular -- which it is in the unified set after
    `merge_asof`.
    """
    df = df.set_index("timestamp")
    roll_5m = df[["temperature", "humidity", "gas", "smoke"]].rolling("5min")
    roll_30m = df[["temperature", "humidity"]].rolling("30min")
    df["temperature_5m_mean"] = roll_5m["temperature"].mean()
    df["temperature_5m_std"] = roll_5m["temperature"].std().fillna(0.0)
    df["humidity_5m_mean"] = roll_5m["humidity"].mean()
    df["gas_5m_mean"] = roll_5m["gas"].mean()
    df["smoke_5m_mean"] = roll_5m["smoke"].mean()
    df["temperature_30m_mean"] = roll_30m["temperature"].mean()
    df["humidity_30m_mean"] = roll_30m["humidity"].mean()
    df = df.reset_index()
    return df


def _read_simulator_rows(path: Path | None) -> pd.DataFrame | None:
    if path is None or not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    rows = []
    for point in payload.get("data", []):
        ts_raw = point.get("ts") or point.get("timestamp")
        if ts_raw:
            ts = ts_raw
        else:
            # Simulator emits relative integer seconds (`t`); anchor to a
            # synthetic base so rolling windows remain ordered.
            t_int = point.get("t")
            if t_int is None:
                continue
            ts = (_SIM_BASE_TIME + timedelta(seconds=int(t_int))).isoformat()
        rows.append(
            {
                "timestamp": ts,
                "temperature": float(point.get("temperature") or 0.0),
                "humidity": float(point.get("humidity") or 0.0),
                "gas": 0.0,  # simulator omits this channel
                "smoke": 0.0,
                "light": float(point.get("light") or 0.0),
                "any_motion": 1.0 if point.get("motion") else 0.0,
                "occupancy_total": 1.0 if point.get("motion") else 0.0,
                "room": str(point.get("room") or "living_room").lower(),
            }
        )
    if not rows:
        return None
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df.dropna(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)
    df = _attach_rolling(df)
    return df


def load_unified(cfg: UnificationConfig) -> pd.DataFrame:
    """Materialize the unified contextual frame from configured sources."""
    env_frames: list[pd.DataFrame] = []
    for path in (cfg.env_ref_csv, cfg.env_gas_csv):
        if path is None:
            continue
        if not path.exists():
            logger.warning("env CSV missing: %s", path)
            continue
        env_frames.append(_read_env_csv(path))
    if not env_frames:
        raise FileNotFoundError(
            "No env CSV available; set DATA_REF_CSV and/or DATA_GAS_CSV."
        )
    env = pd.concat(env_frames, ignore_index=True).sort_values("timestamp")
    if cfg.sample_stride > 1:
        env = env.iloc[:: cfg.sample_stride].reset_index(drop=True)

    pos = _read_pos_csv(cfg.pos_csv) if cfg.pos_csv and cfg.pos_csv.exists() else None
    merged = _join_env_with_occupancy(env, pos)
    merged = _attach_temporal_room(merged)
    merged = _attach_rolling(merged)

    sim = _read_simulator_rows(cfg.simulator_json)
    if sim is not None:
        # Align column sets before concatenation; simulator lacks the
        # PIR per-room columns so they are filled with zeros.
        for col in _POS_COLUMN_MAP.values():
            if col not in sim.columns:
                sim[col] = 0.0
        merged = pd.concat([merged, sim], ignore_index=True, sort=False)
        merged = merged.sort_values("timestamp").reset_index(drop=True)

    # Coerce required columns to float and fill remaining NaNs.
    numeric_cols = [
        "temperature",
        "humidity",
        "gas",
        "smoke",
        "light",
        "occupancy_total",
        "any_motion",
        "temperature_5m_mean",
        "temperature_5m_std",
        "humidity_5m_mean",
        "gas_5m_mean",
        "smoke_5m_mean",
        "temperature_30m_mean",
        "humidity_30m_mean",
    ]
    for col in numeric_cols:
        if col not in merged.columns:
            merged[col] = 0.0
        merged[col] = merged[col].astype(float).fillna(0.0)
    if "room" not in merged.columns:
        merged["room"] = "unknown"
    return merged


def iter_feature_dicts(df: pd.DataFrame) -> Iterable[dict]:
    """Yield argument dicts for `build_feature_row` from a unified frame."""
    for r in df.itertuples(index=False):
        rolling = {
            "temperature_5m_mean": float(getattr(r, "temperature_5m_mean", 0.0) or 0.0),
            "temperature_5m_std": float(getattr(r, "temperature_5m_std", 0.0) or 0.0),
            "humidity_5m_mean": float(getattr(r, "humidity_5m_mean", 0.0) or 0.0),
            "gas_5m_mean": float(getattr(r, "gas_5m_mean", 0.0) or 0.0),
            "smoke_5m_mean": float(getattr(r, "smoke_5m_mean", 0.0) or 0.0),
            "temperature_30m_mean": float(getattr(r, "temperature_30m_mean", 0.0) or 0.0),
            "humidity_30m_mean": float(getattr(r, "humidity_30m_mean", 0.0) or 0.0),
        }
        yield {
            "timestamp": getattr(r, "timestamp").to_pydatetime(),
            "temperature": float(getattr(r, "temperature", 0.0) or 0.0),
            "humidity": float(getattr(r, "humidity", 0.0) or 0.0),
            "gas": float(getattr(r, "gas", 0.0) or 0.0),
            "smoke": float(getattr(r, "smoke", 0.0) or 0.0),
            "light": float(getattr(r, "light", 0.0) or 0.0),
            "motion": bool(getattr(r, "any_motion", 0.0) >= 0.5),
            "occupancy_total": float(getattr(r, "occupancy_total", 0.0) or 0.0),
            "room": str(getattr(r, "room", "unknown") or "unknown"),
            "rolling": rolling,
        }


__all__ = ["UnificationConfig", "load_unified", "iter_feature_dicts"]
