import asyncio
import logging
import threading
from contextlib import asynccontextmanager

import paho.mqtt.client as mqtt
import redis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, WebSocketException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import get_settings
from app.core.config import cors_origin_list
from app.db.session import SessionLocal, engine
from app.services.auth_service import get_user_from_token
from app.websocket.manager import connection_manager
from services.anomaly_service import anomaly_background_loop
from services.ws_manager import start_redis_bridge_thread

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_mqtt_client: mqtt.Client | None = None
_redis_stop: threading.Event | None = None
_redis_thread: threading.Thread | None = None
_anomaly_task: asyncio.Task[None] | None = None
_health_status: dict[str, str] = {"db": "error", "redis": "error", "mqtt": "error"}


def _check_db() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        logger.exception("database health check failed")
        return False


def _check_redis() -> bool:
    try:
        client = redis.from_url(get_settings().redis_url, decode_responses=True)
        client.ping()
        client.close()
        return True
    except Exception:  # noqa: BLE001
        logger.exception("redis health check failed")
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _mqtt_client, _redis_stop, _redis_thread, _anomaly_task, _health_status
    loop = asyncio.get_running_loop()
    connection_manager.set_loop(loop)
    _redis_stop = threading.Event()

    if not _check_db():
        _health_status["db"] = "error"
        raise RuntimeError("Critical dependency failed: PostgreSQL unavailable")
    _health_status["db"] = "ok"

    if not _check_redis():
        _health_status["redis"] = "error"
        raise RuntimeError("Critical dependency failed: Redis unavailable")
    _health_status["redis"] = "ok"

    try:
        from app.mqtt.subscriber import start_mqtt_client

        _mqtt_client = start_mqtt_client()
        _health_status["mqtt"] = "ok"
        logger.info("mqtt client started")
    except Exception as e:  # noqa: BLE001
        _health_status["mqtt"] = "error"
        raise RuntimeError("Critical dependency failed: MQTT unavailable") from e
    _redis_thread = None
    try:
        _redis_thread = start_redis_bridge_thread(_redis_stop)
        logger.info("redis websocket bridge started")
    except Exception as e:  # noqa: BLE001
        _health_status["redis"] = "error"
        raise RuntimeError("Critical dependency failed: Redis bridge unavailable") from e

    # Best-effort artifact preload so the first MQTT event doesn't pay the
    # joblib.load cost. Failure is non-fatal: inference falls back to
    # degraded mode and the rule engine continues to operate.
    try:
        from ml.inference import contextual_inference

        contextual_inference._get_artifacts()  # noqa: SLF001
    except Exception:  # noqa: BLE001
        logger.exception("contextual inference preload failed")

    _anomaly_task = asyncio.create_task(anomaly_background_loop())

    yield

    if _anomaly_task is not None:
        _anomaly_task.cancel()
        try:
            await _anomaly_task
        except asyncio.CancelledError:
            pass
        _anomaly_task = None

    if _redis_stop is not None:
        _redis_stop.set()
    if _redis_thread is not None:
        _redis_thread.join(timeout=5.0)
        _redis_thread = None
    _redis_stop = None

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
    return dict(_health_status)


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket) -> None:
    auth_header = websocket.headers.get("authorization")
    token = None
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
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
    replay = websocket.query_params.get("replay", "latest").lower()
    replay_mode = "full" if replay == "full" else "latest"
    await connection_manager.connect(websocket, replay_mode=replay_mode)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
