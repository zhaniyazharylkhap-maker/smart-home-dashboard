"""Tests for canonical room slug resolution (ESP32 → existing rooms)."""

import pytest

from app.services.room_mapping import normalize_room_slug


def test_normalize_kitchen_aliases() -> None:
    assert normalize_room_slug("kitchen") == "kitchen"
    assert normalize_room_slug("Kitchen ") == "kitchen"


def test_normalize_living_aliases() -> None:
    assert normalize_room_slug("living_room") == "living_room"
    assert normalize_room_slug("living room") == "living_room"
    assert normalize_room_slug("Lounge") == "living_room"


def test_unknown_room_rejected() -> None:
    with pytest.raises(ValueError, match="unknown"):
        normalize_room_slug("esp32_room")
