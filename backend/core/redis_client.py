from __future__ import annotations

import json
import logging
from typing import Any

import redis

from core.config import get_settings

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None
STREAM_NAME = "telemetry_stream"


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().redis_url, decode_responses=True)
    return _client


def reset_redis() -> None:
    global _client
    _client = None


def append_stream_event(data: dict[str, Any]) -> None:
    try:
        get_redis().xadd(
            STREAM_NAME,
            {"data": json.dumps(data, default=str)},
            maxlen=100000,
            approximate=True,
        )
    except Exception:  # noqa: BLE001
        logger.exception("redis stream write failed stream=%s", STREAM_NAME)


def publish(channel: str, data: dict[str, Any]) -> None:
    # Compatibility shim: callers still invoke `publish`, but transport is now Redis
    # Streams for durability/replay instead of ephemeral Pub/Sub.
    _ = channel
    append_stream_event(data)
