"""Contextual feature schema v1.

This is the single source of truth shared by:
- offline training (`prepare_data.py`, `train.py`)
- online inference (`inference.py`, `services/contextual_service.py`)
- evaluation scripts (`scripts/evaluate.py`)

The dimension and ordering of `FEATURE_NAMES` MUST be identical across
all entry points; otherwise the scaler/model become silently misaligned.
The schema version is bumped whenever the feature set or ordering
changes -- inference will refuse to score against a model whose manifest
schema_version differs from this constant.
"""

from __future__ import annotations

from typing import Final


SCHEMA_VERSION: Final[str] = "contextual_v1"

# Order matters: keep grouped by semantic block for readability and
# downstream analysis, but never reorder within a released version.
FEATURE_NAMES: Final[tuple[str, ...]] = (
    # 1) Temporal cyclic encodings (capture time-of-day/day-of-week structure
    #    without imposing a linear ordinal that the model would misuse).
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "is_night",
    "is_weekend",
    # 2) Environment raw values.
    "temperature",
    "humidity",
    "gas",
    "smoke",
    "light",
    # 3) Occupancy / activity context.
    "occupancy_total",
    "any_motion",
    # 4) Short-window rolling statistics (~5 minutes).
    "temperature_5m_mean",
    "temperature_5m_std",
    "humidity_5m_mean",
    "gas_5m_mean",
    "smoke_5m_mean",
    # 5) Mid-window rolling statistics (~30 minutes).
    "temperature_30m_mean",
    "humidity_30m_mean",
    # 6) Deltas vs short-term mean (event-relative behavior).
    "delta_temperature_5m",
    "delta_gas_5m",
    # 7) Contextual residuals: handcrafted, fully explainable signals
    #    that pair raw measurements with behavioral context. They are
    #    cheap to compute, robust to noise, and provide ready-made
    #    explanation tokens when they dominate the score.
    "gas_no_occupancy",
    "motion_at_night",
    "humidity_off_profile",
)

FEATURE_INDEX: Final[dict[str, int]] = {n: i for i, n in enumerate(FEATURE_NAMES)}
NUM_FEATURES: Final[int] = len(FEATURE_NAMES)


# Friendly explanation strings shown in the dashboard. Keep concise --
# the frontend renders them as "explanation tokens".
FEATURE_LABELS: Final[dict[str, str]] = {
    "hour_sin": "Unusual hour-of-day",
    "hour_cos": "Unusual hour-of-day",
    "dow_sin": "Unusual day-of-week",
    "dow_cos": "Unusual day-of-week",
    "is_night": "Night-time event",
    "is_weekend": "Weekend pattern",
    "temperature": "Temperature outside normal range",
    "humidity": "Humidity outside normal range",
    "gas": "Gas level elevated",
    "smoke": "Smoke level elevated",
    "light": "Unusual light level",
    "occupancy_total": "Unusual home occupancy",
    "any_motion": "Unexpected motion state",
    "temperature_5m_mean": "Sustained temperature shift (5m)",
    "temperature_5m_std": "Temperature instability (5m)",
    "humidity_5m_mean": "Sustained humidity shift (5m)",
    "gas_5m_mean": "Sustained gas elevation (5m)",
    "smoke_5m_mean": "Sustained smoke (5m)",
    "temperature_30m_mean": "Long-term temperature shift (30m)",
    "humidity_30m_mean": "Long-term humidity shift (30m)",
    "delta_temperature_5m": "Sudden temperature change",
    "delta_gas_5m": "Sudden gas change",
    "gas_no_occupancy": "Gas elevated without occupancy",
    "motion_at_night": "Motion detected at night",
    "humidity_off_profile": "Humidity outside expected profile",
}


# Room types we know about; used to derive the room-profile residual.
# Bathrooms are expected to have higher humidity, kitchens higher gas
# during cooking, etc. Keys are the lowercased room names from the live
# telemetry pipeline (e.g. `living_room`, `kitchen`).
ROOM_HUMIDITY_PROFILE: Final[dict[str, float]] = {
    "bathroom": 65.0,
    "kitchen": 55.0,
    "bedroom": 50.0,
    "living_room": 50.0,
    "hallway": 50.0,
}
DEFAULT_HUMIDITY_PROFILE: Final[float] = 50.0


__all__ = [
    "SCHEMA_VERSION",
    "FEATURE_NAMES",
    "FEATURE_INDEX",
    "NUM_FEATURES",
    "FEATURE_LABELS",
    "ROOM_HUMIDITY_PROFILE",
    "DEFAULT_HUMIDITY_PROFILE",
]
