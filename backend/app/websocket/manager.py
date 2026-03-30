import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def _broadcast_async(self, message: dict[str, Any]) -> None:
        text = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(text)
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
