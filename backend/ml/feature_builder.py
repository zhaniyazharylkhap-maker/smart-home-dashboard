"""Pure functional feature builder shared by offline and online paths.

`build_feature_row` produces a fixed-length vector aligned with
`feature_schema.FEATURE_NAMES`. Both the training data pipeline and the
real-time inference service call this same function; that is what
guarantees train/serve parity.

The function takes everything it needs as explicit arguments. There is
no hidden state -- the caller is responsible for maintaining rolling
windows (see `online_state.RollingDeviceState`) or precomputing them
in pandas (`data_unification.attach_rolling_features`).
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import TypedDict

from ml.feature_schema import (
    DEFAULT_HUMIDITY_PROFILE,
    FEATURE_NAMES,
    NUM_FEATURES,
    ROOM_HUMIDITY_PROFILE,
)


class RollingStats(TypedDict, total=False):
    """Pre-computed rolling statistics for the active device/room.

    All fields are optional: missing entries fall back to the current
    raw value, which yields delta == 0 (no novelty signal). This is the
    correct behavior at cold-start when we have not yet observed enough
    history to compute a stable baseline.
    """

    temperature_5m_mean: float
    temperature_5m_std: float
    humidity_5m_mean: float
    gas_5m_mean: float
    smoke_5m_mean: float
    temperature_30m_mean: float
    humidity_30m_mean: float


def _safe_float(v: object) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def _clip01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return v


def _hour_fraction(ts: datetime) -> float:
    return ts.hour + ts.minute / 60.0 + ts.second / 3600.0


def build_feature_row(
    *,
    timestamp: datetime,
    temperature: float | None,
    humidity: float | None,
    gas: float | None,
    smoke: float | None,
    light: float | None,
    motion: bool | None,
    occupancy_total: float | None,
    room: str | None,
    rolling: RollingStats | None = None,
) -> list[float]:
    """Build a single feature row aligned with `FEATURE_NAMES`.

    Returns a Python list of floats so it serializes cleanly to JSON for
    explainability inspection; the caller wraps it with `np.asarray`
    before scaling.
    """
    rolling = rolling or {}

    t = _safe_float(temperature)
    h = _safe_float(humidity)
    g = _safe_float(gas)
    sm = _safe_float(smoke)
    li = _safe_float(light)
    motion_flag = 1.0 if motion else 0.0
    occ = max(0.0, _safe_float(occupancy_total))

    hour_f = _hour_fraction(timestamp)
    hour_sin = math.sin(2.0 * math.pi * hour_f / 24.0)
    hour_cos = math.cos(2.0 * math.pi * hour_f / 24.0)
    dow = float(timestamp.weekday())
    dow_sin = math.sin(2.0 * math.pi * dow / 7.0)
    dow_cos = math.cos(2.0 * math.pi * dow / 7.0)
    is_night = 1.0 if (timestamp.hour >= 22 or timestamp.hour < 6) else 0.0
    is_weekend = 1.0 if timestamp.weekday() >= 5 else 0.0

    # Rolling stats default to the current raw value -> delta == 0.
    temp_5m_mean = float(rolling.get("temperature_5m_mean", t))
    temp_5m_std = float(rolling.get("temperature_5m_std", 0.0))
    hum_5m_mean = float(rolling.get("humidity_5m_mean", h))
    gas_5m_mean = float(rolling.get("gas_5m_mean", g))
    smoke_5m_mean = float(rolling.get("smoke_5m_mean", sm))
    temp_30m_mean = float(rolling.get("temperature_30m_mean", t))
    hum_30m_mean = float(rolling.get("humidity_30m_mean", h))

    delta_temp_5m = t - temp_5m_mean
    delta_gas_5m = g - gas_5m_mean

    # Contextual residuals.
    # 1) `gas_no_occupancy`: raw gas reading scaled by inverse motion;
    #    a high value means high gas with no human activity, which is
    #    qualitatively different from cooking-driven gas spikes.
    gas_no_occ = g * (1.0 - motion_flag) * (1.0 if occ <= 0.0 else 0.0)
    # 2) `motion_at_night`: motion flagged during quiet hours.
    motion_night = motion_flag * is_night
    # 3) `humidity_off_profile`: distance from the room-typical humidity
    #    midpoint, normalized so 25%RH off-profile -> ~1.0.
    profile = ROOM_HUMIDITY_PROFILE.get(
        (room or "").lower(), DEFAULT_HUMIDITY_PROFILE
    )
    humidity_off_profile = abs(h - profile) / 25.0
    humidity_off_profile = _clip01(humidity_off_profile)

    row: list[float] = [
        hour_sin,
        hour_cos,
        dow_sin,
        dow_cos,
        is_night,
        is_weekend,
        t,
        h,
        g,
        sm,
        li,
        occ,
        motion_flag,
        temp_5m_mean,
        temp_5m_std,
        hum_5m_mean,
        gas_5m_mean,
        smoke_5m_mean,
        temp_30m_mean,
        hum_30m_mean,
        delta_temp_5m,
        delta_gas_5m,
        gas_no_occ,
        motion_night,
        humidity_off_profile,
    ]
    if len(row) != NUM_FEATURES:  # pragma: no cover - structural invariant
        raise RuntimeError(
            f"feature row length {len(row)} != schema {NUM_FEATURES}; "
            "FEATURE_NAMES and build_feature_row are out of sync"
        )
    return row


__all__ = ["RollingStats", "build_feature_row", "FEATURE_NAMES"]
