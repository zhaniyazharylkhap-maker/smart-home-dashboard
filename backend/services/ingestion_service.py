from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Device, Room, Telemetry
from app.schemas.telemetry import TelemetryIngest, TelemetryReading
from app.services.risk_engine import compute_risk
from app.services.telemetry_service import ensure_device, ensure_room
from core.redis_client import publish
from services.alert_engine import evaluate_telemetry

logger = logging.getLogger(__name__)


def _default_room(raw: dict) -> dict:
    d = dict(raw)
    if not d.get("room"):
        d["room"] = "living_room"
    if "gas" not in d:
        d["gas"] = 0.0
    if "smoke" not in d:
        d["smoke"] = 0.0
    if "motion" in d and d["motion"] is not None and not isinstance(d["motion"], bool):
        if isinstance(d["motion"], (int, float)):
            v = int(d["motion"])
            if v not in (0, 1):
                raise ValueError("motion must be 0 or 1")
            d["motion"] = bool(v)
        else:
            raise ValueError("motion must be 0 or 1")
    return d


def _enforce_ranges(payload: TelemetryIngest) -> None:
    if payload.temperature is not None and not (-40.0 <= payload.temperature <= 85.0):
        raise ValueError("temperature must be between -40 and 85")
    if payload.humidity is not None and not (0.0 <= payload.humidity <= 100.0):
        raise ValueError("humidity must be between 0 and 100")
    if payload.light is not None and payload.light < 0.0:
        raise ValueError("light must be >= 0")
    if payload.motion is not None and type(payload.motion) is not bool:
        raise ValueError("motion must be boolean")


def telemetry_ingest_from_dict(raw: dict) -> TelemetryIngest:
    data = _default_room(raw)
    payload = TelemetryIngest.model_validate(data)
    _enforce_ranges(payload)
    return payload


def ingest_telemetry(db: Session, payload: TelemetryIngest) -> Telemetry:
    received_at = datetime.now(timezone.utc)
    room = ensure_room(db, payload.room)
    device = ensure_device(db, payload.device_id, room, payload.device_id)
    ts = payload.timestamp or received_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    row = Telemetry(
        device_id=device.id,
        room_id=room.id,
        temperature=payload.temperature,
        humidity=payload.humidity,
        motion=payload.motion,
        light=payload.light,
        gas=payload.gas,
        smoke=payload.smoke,
        t_sim=payload.t_sim,
        timestamp=ts,
        received_at=received_at,
    )
    device.last_seen = ts
    device.status = "online"
    db.add(row)
    db.commit()
    db.refresh(row)

    risk = None
    try:
        risk = evaluate_telemetry(db, room, device, payload)
    except Exception:  # noqa: BLE001
        logger.exception("alert evaluation failed")
    if risk is None:
        risk = compute_risk(
            temperature=payload.temperature,
            smoke=payload.smoke,
            gas=payload.gas,
            motion=payload.motion,
        )

    reading = TelemetryReading(
        device_id=device.device_id,
        room=room.name,
        temperature=row.temperature,
        humidity=row.humidity,
        motion=row.motion,
        light=row.light,
        gas=row.gas,
        smoke=row.smoke,
        timestamp=row.timestamp,
        trace_id=payload.trace_id,
        t_sim=payload.t_sim,
        risk_score=risk.risk_score,
        risk_level=risk.risk_level,
        alert_reasons=risk.alert_reasons,
    )
    publish(
        f"telemetry:{device.device_id}",
        {"type": "telemetry", "payload": reading.model_dump(mode="json")},
    )
    return row


def complete_ingest(db: Session, payload: TelemetryIngest) -> Telemetry:
    return ingest_telemetry(db, payload)


def ingest_from_mqtt_dict(db: Session, raw: dict) -> Telemetry:
    payload = telemetry_ingest_from_dict(raw)
    return ingest_telemetry(db, payload)
