"""Redis-backed storage of recent contextual anomaly events.

Writes are best-effort: a Redis outage degrades analytics surfaces but
never blocks ingestion. Two structures are kept:

- `ctx:latest:{device_id}`  HASH (or JSON string) with the latest event
- `ctx:history:{device_id}` LIST capped at MAX_HISTORY entries
- `ctx:events:global`       LIST capped at MAX_GLOBAL_EVENTS for the
                            top-factors aggregation
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from core.redis_client import get_redis


logger = logging.getLogger(__name__)


MAX_HISTORY = 2000  # ~33 min at 1 event/sec/device; bounded redis footprint
MAX_GLOBAL_EVENTS = 10000


def _key_latest(device_id: str) -> str:
    return f"ctx:latest:{device_id}"


def _key_history(device_id: str) -> str:
    return f"ctx:history:{device_id}"


def _key_events_global() -> str:
    return "ctx:events:global"


def _key_devices_index() -> str:
    return "ctx:devices"


def record_event(payload: dict[str, Any]) -> None:
    """Persist a contextual anomaly event payload."""
    device_id = str(payload.get("device_id") or "")
    if not device_id:
        return
    try:
        r = get_redis()
        body = json.dumps(payload, default=str)
        pipe = r.pipeline()
        pipe.set(_key_latest(device_id), body)
        pipe.lpush(_key_history(device_id), body)
        pipe.ltrim(_key_history(device_id), 0, MAX_HISTORY - 1)
        pipe.lpush(_key_events_global(), body)
        pipe.ltrim(_key_events_global(), 0, MAX_GLOBAL_EVENTS - 1)
        pipe.sadd(_key_devices_index(), device_id)
        pipe.execute()
    except Exception:  # noqa: BLE001
        logger.exception("ctx storage write failed device=%s", device_id)


def latest_per_device() -> list[dict[str, Any]]:
    try:
        r = get_redis()
        ids = list(r.smembers(_key_devices_index()) or [])
        out: list[dict[str, Any]] = []
        for did in ids:
            raw = r.get(_key_latest(str(did)))
            if not raw:
                continue
            try:
                out.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
        return out
    except Exception:  # noqa: BLE001
        logger.exception("ctx storage read failed")
        return []


def history(device_id: str, limit: int = 240) -> list[dict[str, Any]]:
    try:
        r = get_redis()
        rows = r.lrange(_key_history(device_id), 0, max(0, limit - 1)) or []
        out: list[dict[str, Any]] = []
        for raw in rows:
            try:
                out.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
        # `lpush` stores most-recent first; reverse so the timeline is
        # ascending as expected by chart components.
        out.reverse()
        return out
    except Exception:  # noqa: BLE001
        logger.exception("ctx history read failed device=%s", device_id)
        return []


def recent_events(within_hours: float = 24.0, limit: int = 1000) -> list[dict[str, Any]]:
    try:
        r = get_redis()
        rows = r.lrange(_key_events_global(), 0, max(0, limit - 1)) or []
        cutoff = datetime.now(timezone.utc) - timedelta(hours=within_hours)
        out: list[dict[str, Any]] = []
        for raw in rows:
            try:
                ev = json.loads(raw)
            except json.JSONDecodeError:
                continue
            ts_raw = ev.get("timestamp")
            try:
                ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
            except Exception:  # noqa: BLE001
                continue
            if ts < cutoff:
                continue
            out.append(ev)
        return out
    except Exception:  # noqa: BLE001
        logger.exception("ctx recent events read failed")
        return []


__all__ = ["record_event", "latest_per_device", "history", "recent_events"]
