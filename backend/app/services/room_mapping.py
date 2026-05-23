"""Map external telemetry room labels to canonical room slugs."""

from __future__ import annotations

import re

# Seeded simulator / dashboard rooms; physical devices attach here only.
CANONICAL_ROOM_SLUGS: frozenset[str] = frozenset(
    {"kitchen", "bedroom", "living_room", "bathroom", "hallway"}
)

_SPACE_RE = re.compile(r"\s+")


def _collapse_key(raw: str) -> str:
    s = raw.strip().lower().replace("-", "_")
    s = _SPACE_RE.sub(" ", s).replace(" ", "_")
    while "__" in s:
        s = s.replace("__", "_")
    return s


def normalize_room_slug(raw: str | None) -> str:
    """
    Normalize user-facing labels (kitchen, Kitchen, living room, lounge)
    to DB room names (kitchen, living_room).
    """
    if not raw or not str(raw).strip():
        raise ValueError("room is required")
    key = _collapse_key(str(raw))

    alias: dict[str, str] = {
        # kitchen
        "kitchen": "kitchen",
        "kit": "kitchen",
        # bedroom
        "bedroom": "bedroom",
        "bed": "bedroom",
        # living
        "living_room": "living_room",
        "livingroom": "living_room",
        "living": "living_room",
        "lounge": "living_room",
        "salon": "living_room",
        # other seeded
        "bathroom": "bathroom",
        "bath": "bathroom",
        "hallway": "hallway",
        "hall": "hallway",
    }
    slug = alias.get(key)
    if slug is None and key in CANONICAL_ROOM_SLUGS:
        slug = key
    if slug is None:
        raise ValueError(f"unknown or unsupported room label: {raw!r}")
    if slug not in CANONICAL_ROOM_SLUGS:
        raise ValueError(f"room not in canonical set: {raw!r}")
    return slug
