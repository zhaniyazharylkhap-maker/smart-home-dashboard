from __future__ import annotations

import json
import logging
import threading
from typing import Any

import redis

from app.websocket.manager import connection_manager
from core.config import get_settings

logger = logging.getLogger(__name__)


def _forward_to_websockets(data: bytes | str) -> None:
    try:
        text = data.decode("utf-8") if isinstance(data, (bytes, bytearray)) else str(data)
        body: dict[str, Any] = json.loads(text)
        connection_manager.broadcast(body)
    except Exception:  # noqa: BLE001
        logger.exception("ws_manager forward failed")


def run_redis_subscriber(stop_event: threading.Event) -> None:
    r = redis.from_url(get_settings().redis_url, decode_responses=True)
    pubsub = r.pubsub(ignore_subscribe_messages=True)
    pubsub.psubscribe("telemetry:*", "alerts:*")
    logger.info("ws_manager psubscribed telemetry:* alerts:*")
    while not stop_event.is_set():
        try:
            msg = pubsub.get_message(timeout=1.0)
            if msg is None or msg["type"] != "pmessage":
                continue
            _forward_to_websockets(msg["data"])
        except Exception:  # noqa: BLE001
            if stop_event.is_set():
                break
            logger.exception("ws_manager redis loop error")
    try:
        pubsub.close()
        r.close()
    except Exception:  # noqa: BLE001
        logger.debug("ws_manager redis close", exc_info=True)


def start_redis_bridge_thread(stop_event: threading.Event) -> threading.Thread:
    t = threading.Thread(
        target=run_redis_subscriber,
        args=(stop_event,),
        name="redis-ws-bridge",
        daemon=True,
    )
    t.start()
    return t
