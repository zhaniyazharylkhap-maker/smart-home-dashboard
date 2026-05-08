"""Schema invariants for the contextual feature builder.

These tests guarantee that the offline training pipeline and the online
inference path always produce identical feature vectors. If any of them
fail, the model and the runtime have diverged and inference must be
considered untrusted.
"""

from datetime import datetime, timezone

from ml.feature_builder import build_feature_row
from ml.feature_schema import FEATURE_INDEX, FEATURE_NAMES, NUM_FEATURES


def _row(**overrides):
    base = {
        "timestamp": datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc),
        "temperature": 22.0,
        "humidity": 50.0,
        "gas": 50.0,
        "smoke": 100.0,
        "light": 0.5,
        "motion": True,
        "occupancy_total": 1.0,
        "room": "living_room",
        "rolling": None,
    }
    base.update(overrides)
    return build_feature_row(**base)


def test_feature_row_has_schema_length() -> None:
    row = _row()
    assert len(row) == NUM_FEATURES
    assert NUM_FEATURES == len(FEATURE_NAMES)


def test_motion_at_night_residual_triggers() -> None:
    night_ts = datetime(2026, 1, 5, 2, 0, tzinfo=timezone.utc)
    row = _row(timestamp=night_ts, motion=True)
    idx = FEATURE_INDEX["motion_at_night"]
    assert row[idx] == 1.0


def test_gas_without_occupancy_residual_triggers() -> None:
    row = _row(motion=False, occupancy_total=0.0, gas=120.0)
    idx = FEATURE_INDEX["gas_no_occupancy"]
    assert row[idx] == 120.0


def test_humidity_off_profile_clipped() -> None:
    row = _row(humidity=200.0)  # absurdly high -> clipped to 1.0
    idx = FEATURE_INDEX["humidity_off_profile"]
    assert row[idx] == 1.0


def test_rolling_default_yields_zero_delta() -> None:
    row = _row(temperature=22.0, gas=10.0, rolling=None)
    assert row[FEATURE_INDEX["delta_temperature_5m"]] == 0.0
    assert row[FEATURE_INDEX["delta_gas_5m"]] == 0.0
