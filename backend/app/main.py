import asyncio
import logging
from contextlib import asynccontextmanager

import paho.mqtt.client as mqtt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, WebSocketException, status
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import cors_origin_list
from app.db.session import SessionLocal
from app.services.auth_service import get_user_from_token
from app.websocket.manager import connection_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_mqtt_client: mqtt.Client | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _mqtt_client
    loop = asyncio.get_running_loop()
    connection_manager.set_loop(loop)
    try:
        from app.mqtt.subscriber import start_mqtt_client

        _mqtt_client = start_mqtt_client()
        logger.info("mqtt client started")
    except Exception as e:  # noqa: BLE001
        logger.error("mqtt failed to start (telemetry will not ingest): %s", e)

    yield

    if _mqtt_client is not None:
        _mqtt_client.loop_stop()
        _mqtt_client.disconnect()
        _mqtt_client = None


app = FastAPI(title="Smart Home Platform API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origin_list(),
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/health")
def root_health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="missing token")
    db = SessionLocal()
    try:
        user = get_user_from_token(db, token)
    finally:
        db.close()
    if user is None:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="invalid token")
    await connection_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
