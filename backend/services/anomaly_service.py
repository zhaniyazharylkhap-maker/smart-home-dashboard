"""Background anomaly sweep.

The primary contextual scoring runs in-line with each MQTT event via
`services.contextual_service.evaluate_contextual_event`. This module is
kept as a periodic safety-net that:

- iterates registered devices,
- ensures `ml.inference.contextual_inference` artifacts are loaded,
- creates a database alert when a device has been quiet but its last
  contextual score is above the adaptive threshold AND no open alert
  of the same type already exists (deduplication identical to the rule
  engine's path).

The legacy public symbol `anomaly_background_loop` is preserved so
`backend/app/main.py` does not need to change its import.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Device, Room
from app.services import contextual_storage
from core.config import get_settings
from core.database import SessionLocal
from ml.inference import contextual_inference
from services.alert_engine import emit_anomaly_alert


logger = logging.getLogger(__name__)


def _run_anomaly_iteration() -> None:
    settings = get_settings()
    threshold = float(getattr(settings, "anomaly_score_threshold", 0.75))
    # Force a load attempt so the next inline event is fast.
    contextual_inference._get_artifacts()  # type: ignore[attr-defined]

    latest = contextual_storage.latest_per_device()
    if not latest:
        return
    db: Session = SessionLocal()
    try:
        for ev in latest:
            try:
                if not ev.get("is_contextual_anomaly"):
                    continue
                score = float(ev.get("anomaly_score") or 0.0)
                # Convert 0..100 score to 0..1 for the legacy threshold
                # config knob so existing settings remain meaningful.
                if (score / 100.0) <= threshold:
                    continue
                device = db.execute(
                    select(Device).where(
                        Device.device_id == str(ev.get("device_id") or "")
                    )
                ).scalar_one_or_none()
                if device is None:
                    continue
                room = db.get(Room, device.room_id) if device.room_id else None
                if room is None:
                    continue
                emit_anomaly_alert(db, room, device, score / 100.0)
            except Exception:  # noqa: BLE001
                logger.exception("anomaly iteration: device handling failed")
    finally:
        db.close()


async def anomaly_background_loop(interval_sec: float = 30.0) -> None:
    """Long-running background coroutine launched from `app.main:lifespan`."""
    while True:
        try:
            await asyncio.sleep(interval_sec)
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _run_anomaly_iteration)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("anomaly loop iteration failed")


__all__ = ["anomaly_background_loop"]
