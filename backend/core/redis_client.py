from __future__ import annotations

import json
import logging
from typing import Any

import redis

from core.config import get_settings

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().redis_url, decode_responses=True)
    return _client


def reset_redis() -> None:
    global _client
    _client = None


def publish(channel: str, data: dict[str, Any]) -> None:
    try:
        get_redis().publish(channel, json.dumps(data, default=str))
    except Exception:  # noqa: BLE001
        logger.exception("redis publish failed channel=%s", channel)
