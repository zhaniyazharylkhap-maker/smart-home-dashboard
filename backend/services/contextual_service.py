"""Glue layer between ingestion and the contextual ML inference engine.

The MQTT consumer doesn't import scikit-learn directly: it calls
`evaluate_contextual_event`, which (a) maintains per-device rolling
statistics, (b) approximates global occupancy from recent device-level
motion, (c) invokes `ml.inference.contextual_inference`, and (d)
persists the result via `app.services.contextual_storage`.

Returning `None` means the contextual layer is unavailable (artifacts
missing or stale); ingestion treats this as a graceful no-op and the
rule-based risk engine still runs.
"""

from __future__ import annotations

import logging
import threading
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Deque

from app.schemas.telemetry import TelemetryIngest
from ml.inference import InferenceResult, contextual_inference
from ml.online_state import rolling_state


logger = logging.getLogger(__name__)


_OCC_WINDOW = timedelta(minutes=5)


@dataclass
class _MotionEvent:
    device_id: str
    room: str
    ts: datetime
    motion: bool


class _OccupancyTracker:
    """Approximate whole-home occupancy from recent device motion events."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: Deque[_MotionEvent] = deque(maxlen=4096)

    def observe(self, ev: _MotionEvent) -> tuple[float, dict[str, bool]]:
        with self._lock:
            self._events.append(ev)
            cutoff = ev.ts - _OCC_WINDOW
            active_rooms: dict[str, bool] = {}
            for past in self._events:
                if past.ts < cutoff:
                    continue
                if past.motion:
                    active_rooms[past.room] = True
            return float(len(active_rooms)), active_rooms


_occupancy_tracker = _OccupancyTracker()


def evaluate_contextual_event(payload: TelemetryIngest) -> InferenceResult | None:
    ts = payload.timestamp or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    rolling = rolling_state.observe(
        payload.device_id,
        ts,
        temperature=payload.temperature,
        humidity=payload.humidity,
        gas=payload.gas,
        smoke=payload.smoke,
    )
    occ_total, _active_rooms = _occupancy_tracker.observe(
        _MotionEvent(
            device_id=payload.device_id,
            room=payload.room,
            ts=ts,
            motion=bool(payload.motion),
        )
    )

    try:
        result = contextual_inference.score_event(
            device_id=payload.device_id,
            timestamp=ts,
            temperature=payload.temperature,
            humidity=payload.humidity,
            gas=payload.gas,
            smoke=payload.smoke,
            light=payload.light,
            motion=payload.motion,
            occupancy_total=occ_total,
            room=payload.room,
            rolling=rolling,
        )
    except Exception:  # noqa: BLE001
        logger.exception("contextual inference dispatch failed")
        return None
    return result


__all__ = ["evaluate_contextual_event"]
