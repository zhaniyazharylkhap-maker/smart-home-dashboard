"""Per-device rolling state for streaming feature extraction.

The training pipeline computes rolling means/std on a sorted DataFrame.
At inference time we don't have a DataFrame -- we have one event at a
time arriving from MQTT. `RollingDeviceState` keeps a small per-device
deque of recent samples and exposes `RollingStats` aligned with what
`feature_builder.build_feature_row` expects, so the same feature vector
is produced offline and online.

Concurrency: the online path is invoked from the MQTT consumer thread.
A single instance is shared across the process and protected by a
short-held lock.
"""

from __future__ import annotations

import statistics
import threading
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Deque

from ml.feature_builder import RollingStats


_WINDOW_5M = timedelta(minutes=5)
_WINDOW_30M = timedelta(minutes=30)
# Hard cap on per-device buffer size to bound memory under high-rate
# traffic. ~30 min * 1 sample/sec ~= 1800 entries; 4096 leaves headroom.
_MAX_BUFFER = 4096


@dataclass
class _Sample:
    ts: datetime
    temperature: float | None
    humidity: float | None
    gas: float | None
    smoke: float | None


@dataclass
class _DeviceBuffer:
    samples: Deque[_Sample] = field(default_factory=lambda: deque(maxlen=_MAX_BUFFER))


class RollingDeviceState:
    """Thread-safe rolling-window store keyed by external device id."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buffers: dict[str, _DeviceBuffer] = {}

    def observe(
        self,
        device_id: str,
        ts: datetime,
        *,
        temperature: float | None,
        humidity: float | None,
        gas: float | None,
        smoke: float | None,
    ) -> RollingStats:
        """Append a sample and return rolling stats up to (and including) it."""
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        with self._lock:
            buf = self._buffers.setdefault(device_id, _DeviceBuffer())
            buf.samples.append(
                _Sample(
                    ts=ts,
                    temperature=temperature,
                    humidity=humidity,
                    gas=gas,
                    smoke=smoke,
                )
            )
            cutoff_5m = ts - _WINDOW_5M
            cutoff_30m = ts - _WINDOW_30M
            window_5m = [s for s in buf.samples if s.ts >= cutoff_5m]
            window_30m = [s for s in buf.samples if s.ts >= cutoff_30m]
            return _stats_from(window_5m, window_30m)

    def reset(self, device_id: str | None = None) -> None:
        with self._lock:
            if device_id is None:
                self._buffers.clear()
            else:
                self._buffers.pop(device_id, None)


def _safe_mean(xs: list[float]) -> float | None:
    if not xs:
        return None
    return float(sum(xs) / len(xs))


def _safe_std(xs: list[float]) -> float | None:
    if len(xs) < 2:
        return 0.0
    try:
        return float(statistics.pstdev(xs))
    except statistics.StatisticsError:
        return 0.0


def _floats(values: list[float | None]) -> list[float]:
    return [v for v in values if v is not None]


def _stats_from(window_5m: list[_Sample], window_30m: list[_Sample]) -> RollingStats:
    out: RollingStats = {}
    temps_5m = _floats([s.temperature for s in window_5m])
    hums_5m = _floats([s.humidity for s in window_5m])
    gases_5m = _floats([s.gas for s in window_5m])
    smokes_5m = _floats([s.smoke for s in window_5m])

    if temps_5m:
        out["temperature_5m_mean"] = _safe_mean(temps_5m) or 0.0
        out["temperature_5m_std"] = _safe_std(temps_5m) or 0.0
    if hums_5m:
        out["humidity_5m_mean"] = _safe_mean(hums_5m) or 0.0
    if gases_5m:
        out["gas_5m_mean"] = _safe_mean(gases_5m) or 0.0
    if smokes_5m:
        out["smoke_5m_mean"] = _safe_mean(smokes_5m) or 0.0

    temps_30m = _floats([s.temperature for s in window_30m])
    hums_30m = _floats([s.humidity for s in window_30m])
    if temps_30m:
        out["temperature_30m_mean"] = _safe_mean(temps_30m) or 0.0
    if hums_30m:
        out["humidity_30m_mean"] = _safe_mean(hums_30m) or 0.0
    return out


# Process-wide singleton; the MQTT consumer and HTTP layer share it.
rolling_state = RollingDeviceState()


__all__ = ["RollingDeviceState", "rolling_state"]
