import socket

import redis
from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    status = {"db": "error", "redis": "error", "mqtt": "error"}

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        status["db"] = "ok"
    except Exception:  # noqa: BLE001
        status["db"] = "error"

    try:
        client = redis.from_url(get_settings().redis_url, decode_responses=True)
        client.ping()
        client.close()
        status["redis"] = "ok"
    except Exception:  # noqa: BLE001
        status["redis"] = "error"

    try:
        settings = get_settings()
        with socket.create_connection((settings.mqtt_host, settings.mqtt_port), timeout=2.0):
            pass
        status["mqtt"] = "ok"
    except Exception:  # noqa: BLE001
        status["mqtt"] = "error"

    return status
