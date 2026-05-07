from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Device, Room, Telemetry
from core.config import get_settings
from core.database import SessionLocal
from services.alert_engine import emit_anomaly_alert

logger = logging.getLogger(__name__)


ML_DIR = Path(__file__).resolve().parent.parent / "ml"
MODEL_PATH = ML_DIR / "model.pkl"
SCALER_PATH = ML_DIR / "scaler.pkl"


def _load_artifacts() -> tuple[object | None, object | None]:
    if not MODEL_PATH.is_file() or not SCALER_PATH.is_file():
        return None, None
    try:
        model = joblib.load(MODEL_PATH)
        scaler = joblib.load(SCALER_PATH)
        return model, scaler
    except Exception:  # noqa: BLE001
        logger.exception("failed to load ml artifacts from %s", ML_DIR)
        return None, None


def _rows_to_feature_matrix(rows: list[Telemetry]) -> np.ndarray:
    if not rows:
        return np.empty((0, 7), dtype=np.float64)

    base: list[list[float]] = []
    for t in rows:
        temperature = float(t.temperature or 0.0)
        light = float(t.light or 0.0)
        motion = 1.0 if t.motion else 0.0
        gas = float(t.gas or 0.0)
        smoke = float(t.smoke or 0.0)
        base.append([temperature, light, motion, gas, smoke])

    X_base = np.asarray(base, dtype=np.float64)
    temperatures = X_base[:, 0]
    delta_temp = np.diff(temperatures, prepend=temperatures[0])

    rolling_mean_temp = np.zeros_like(temperatures)
    for i in range(len(temperatures)):
        start = max(0, i - 4)
        rolling_mean_temp[i] = np.mean(temperatures[start : i + 1])

    return np.column_stack([X_base, delta_temp, rolling_mean_temp])


def _detect_device_anomaly(db: Session, device: Device, model: object | None, scaler: object | None) -> tuple[bool, float]:
    since = datetime.now(timezone.utc) - timedelta(seconds=60)
    q = (
        select(Telemetry)
        .where(Telemetry.device_id == device.id, Telemetry.timestamp >= since)
        .order_by(Telemetry.timestamp.asc())
        .limit(200)
    )
    rows = list(db.execute(q).scalars().all())
    if not rows:
        return False, 0.0
    if model is None or scaler is None:
        return False, 0.0
    try:
        X = _rows_to_feature_matrix(rows)
        X_scaled = scaler.transform(X)
        pred = model.predict(X_scaled)
        decision = model.decision_function(X_scaled)

        latest_is_anomaly = bool(pred[-1] == -1)
        latest_score = float(-decision[-1])
        logger.debug(
            "anomaly_result device=%s rows=%s anomaly=%s score=%s",
            device.device_id,
            len(rows),
            latest_is_anomaly,
            latest_score,
        )
        return latest_is_anomaly, latest_score
    except Exception:  # noqa: BLE001
        logger.exception("anomaly scoring failed for device %s", device.device_id)
        return False, 0.0


def _run_anomaly_iteration() -> None:
    model, scaler = _load_artifacts()
    settings = get_settings()
    db = SessionLocal()
    try:
        devs = list(db.execute(select(Device)).scalars().all())
        for device in devs:
            anomaly, score = _detect_device_anomaly(db, device, model, scaler)
            if not anomaly and score <= settings.anomaly_score_threshold:
                continue
            room = db.get(Room, device.room_id)
            if room is None:
                continue
            emit_anomaly_alert(db, room, device, score)
    finally:
        db.close()


async def anomaly_background_loop(interval_sec: float = 10.0) -> None:
    while True:
        try:
            await asyncio.sleep(interval_sec)
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _run_anomaly_iteration)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("anomaly loop iteration failed")
