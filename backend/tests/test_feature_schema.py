"""Contract tests for the contextual feature schema.

The schema in `ml/feature_schema.py` is the single source of truth that
both the offline training pipeline and the online inference path
import. These tests fail loudly if the contract is altered without an
intentional refactor (renames, drops, dimension drift).
"""

from __future__ import annotations

from ml.feature_builder import build_feature_row
from ml.feature_schema import (
    DEFAULT_HUMIDITY_PROFILE,
    FEATURE_INDEX,
    FEATURE_LABELS,
    FEATURE_NAMES,
    NUM_FEATURES,
    ROOM_HUMIDITY_PROFILE,
    SCHEMA_VERSION,
)


def test_schema_version_is_pinned() -> None:
    assert SCHEMA_VERSION == "contextual_v1"


def test_feature_names_are_unique() -> None:
    assert len(set(FEATURE_NAMES)) == len(FEATURE_NAMES)


def test_feature_index_matches_feature_names_order() -> None:
    for i, name in enumerate(FEATURE_NAMES):
        assert FEATURE_INDEX[name] == i


def test_num_features_matches_feature_names_length() -> None:
    assert NUM_FEATURES == len(FEATURE_NAMES)


def test_every_feature_has_a_label() -> None:
    # Every feature must carry a friendly label so that explanations
    # rendered in the UI never fall back to opaque variable names.
    for name in FEATURE_NAMES:
        assert name in FEATURE_LABELS, f"missing label for {name!r}"
        assert FEATURE_LABELS[name], f"empty label for {name!r}"


def test_room_humidity_profile_covers_canonical_rooms() -> None:
    expected = {"bathroom", "kitchen", "bedroom", "living_room", "hallway"}
    assert expected.issubset(ROOM_HUMIDITY_PROFILE.keys())
    for room, value in ROOM_HUMIDITY_PROFILE.items():
        assert isinstance(room, str) and room == room.lower()
        assert 0.0 < value < 100.0
    assert 0.0 < DEFAULT_HUMIDITY_PROFILE < 100.0


def test_feature_builder_aligns_with_schema() -> None:
    # The training pipeline and online inference both rely on this
    # invariant; if the row width drifts, scaler dimensions break.
    from datetime import datetime, timezone

    row = build_feature_row(
        timestamp=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
        temperature=22.0,
        humidity=50.0,
        gas=10.0,
        smoke=20.0,
        light=0.4,
        motion=False,
        occupancy_total=0.0,
        room="living_room",
    )
    assert len(row) == NUM_FEATURES
