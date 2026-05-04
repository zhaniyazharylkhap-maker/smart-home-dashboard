from __future__ import annotations

import asyncio
import logging
import pickle
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Device, Room, Telemetry
from core.config import get_settings
from core.database import SessionLocal
from services.alert_engine import emit_anomaly_alert

logger = logging.getLogger(__name__)


def _model_path() -> Path:
    base = Path(__file__).resolve().parent.parent
    p = Path(get_settings().ml_model_path)
    if p.is_absolute():
        return p
    return base / p


def _load_model():
    path = _model_path()
    if not path.is_file():
        return None
    try:
        with path.open("rb") as f:
            return pickle.load(f)
    except Exception:  # noqa: BLE001
        logger.exception("failed to load ml model from %s", path)
        return None


def _normalize_if_score(raw: float) -> float:
    return float(min(1.0, max(0.0, -float(raw))))


def _features_for_row(t: Telemetry) -> list[float]:
    return [
        float(t.temperature or 0.0),
        float(t.humidity or 0.0),
        1.0 if t.motion else 0.0,
        float(t.light or 0.0),
    ]


def _score_device(db: Session, device: Device, model: object | None) -> float:
    since = datetime.now(timezone.utc) - timedelta(seconds=60)
    q = (
        select(Telemetry)
        .where(Telemetry.device_id == device.id, Telemetry.timestamp >= since)
        .order_by(Telemetry.timestamp.desc())
        .limit(200)
    )
    rows = list(db.execute(q).scalars().all())
    if not rows:
        return 0.0
    row = rows[0]
    X = np.asarray([_features_for_row(row)], dtype=np.float64)
    if model is None:
        return 0.0
    try:
        scaler = getattr(model, "scaler", None)
        clf = getattr(model, "clf", None)
        if scaler is not None:
            X = scaler.transform(X)
        if clf is None:
            return 0.0
        raw = float(clf.decision_function(X)[0])
        return _normalize_if_score(raw)
    except Exception:  # noqa: BLE001
        logger.exception("anomaly scoring failed for device %s", device.device_id)
        return 0.0


async def anomaly_background_loop(interval_sec: float = 10.0) -> None:
    while True:
        try:
            await asyncio.sleep(interval_sec)
            model = _load_model()
            settings = get_settings()
            db = SessionLocal()
            try:
                devs = list(db.execute(select(Device)).scalars().all())
                for device in devs:
                    score = _score_device(db, device, model)
                    if score <= settings.anomaly_score_threshold:
                        continue
                    room = db.get(Room, device.room_id)
                    if room is None:
                        continue
                    emit_anomaly_alert(db, room, device, score)
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("anomaly loop iteration failed")
