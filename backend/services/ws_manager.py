from __future__ import annotations
import os
import asyncio
import json
import logging
import threading
import time
from typing import Any, cast

import redis
from fastapi import WebSocket

from core.config import get_settings
from core.redis_client import STREAM_NAME

logger = logging.getLogger(__name__)
GROUP_NAME = "ws_group"
StreamFields = dict[str, Any]
StreamEvent = tuple[str, StreamFields]


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket: WebSocket, replay_mode: str = "latest") -> None:
        await websocket.accept()
        self._connections.add(websocket)
        if replay_mode == "full":
            # Replay from stream start (0-0) to support durable catch-up.
            await self._replay_history(websocket, start_id="0-0")

    async def _replay_history(self, websocket: WebSocket, start_id: str) -> None:
        r = redis.from_url(get_settings().redis_url, decode_responses=True)
        try:
            msg_id = start_id
            replayed = 0
            while True:
                rows = cast(list[StreamEvent], r.xrange(STREAM_NAME, min=msg_id, max="+", count=100))
                if not rows:
                    break
                for event_id, fields in rows:
                    data = fields.get("data")
                    if not data:
                        continue
                    body: dict[str, Any] = json.loads(data)
                    await websocket.send_text(json.dumps(body, default=str))
                    replayed += 1
                    msg_id = event_id
                # Move past last id to avoid infinite loop on same boundary.
                if msg_id != "0-0":
                    ms, seq = msg_id.split("-")
                    msg_id = f"{ms}-{int(seq) + 1}"
                if replayed >= 500:
                    break
            if replayed > 0:
                logger.info("Message replayed count=%s", replayed)
        except Exception:  # noqa: BLE001
            logger.exception("ws replay failed")
        finally:
            r.close()

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def _broadcast_async(self, message: dict[str, Any]) -> None:
        text = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                # Backpressure safety: drop slow sockets instead of stalling stream ack.
                await asyncio.wait_for(ws.send_text(text), timeout=0.5)
            except Exception as e:  # noqa: BLE001
                logger.debug("ws send failed: %s", e)
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def broadcast(self, message: dict[str, Any]) -> None:
        loop = self._loop
        if loop is None or not loop.is_running():
            logger.warning("no event loop for websocket broadcast")
            return
        asyncio.run_coroutine_threadsafe(self._broadcast_async(message), loop)


connection_manager = ConnectionManager()


def _forward_to_websockets(data: bytes | str) -> None:
    try:
        text = data.decode("utf-8") if isinstance(data, (bytes, bytearray)) else str(data)
        body: dict[str, Any] = json.loads(text)
        connection_manager.broadcast(body)
    except Exception:  # noqa: BLE001
        logger.exception("ws_manager forward failed")


def _create_group_if_missing(r: redis.Redis) -> None:
    try:
        r.xgroup_create(STREAM_NAME, GROUP_NAME, id="0-0", mkstream=True)
    except redis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise


def run_redis_subscriber(stop_event: threading.Event) -> None:
    settings = get_settings()
    # Redis Streams are a lightweight Kafka-style log for this diploma project:
    # durable writes, replay from offsets, and consumer acknowledgements.
    while not stop_event.is_set():
        r: redis.Redis | None = None
        try:
            r = redis.from_url(settings.redis_url, decode_responses=True)
            _create_group_if_missing(r)
            consumer_name = f"ws_consumer_{os.getpid()}_{threading.get_ident()}"
            logger.info("ws stream consumer started stream=%s group=%s", STREAM_NAME, GROUP_NAME)
            while not stop_event.is_set():
                messages = cast(
                    list[tuple[str, list[StreamEvent]]],
                    r.xreadgroup(
                        groupname=GROUP_NAME,
                        consumername=consumer_name,
                        streams={STREAM_NAME: ">"},
                        block=5000,
                        count=10,
                    ),
                )
                if not messages:
                    continue
                for _stream, events in messages:
                    for message_id, fields in events:
                        payload = fields.get("data")
                        if not payload:
                            r.xack(STREAM_NAME, GROUP_NAME, message_id)
                            continue
                        logger.info("Stream message received id=%s", message_id)
                        _forward_to_websockets(payload)
                        r.xack(STREAM_NAME, GROUP_NAME, message_id)
                        logger.info("Message acknowledged id=%s", message_id)
        except Exception:  # noqa: BLE001
            if stop_event.is_set():
                break
            logger.exception("ws stream consumer error; retrying")
            time.sleep(1.0)
        finally:
            if r is not None:
                try:
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
