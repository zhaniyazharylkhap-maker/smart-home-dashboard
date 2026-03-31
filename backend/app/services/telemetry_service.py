import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Device, Room, Telemetry
from app.schemas.telemetry import TelemetryIngest, TelemetryReading
from app.services.alert_engine import evaluate_telemetry
from app.websocket.manager import connection_manager

logger = logging.getLogger(__name__)


def _ensure_room(db: Session, room_name: str) -> Room:
    name = room_name.strip().lower()
    room = db.execute(select(Room).where(Room.name == name)).scalar_one_or_none()
    if room is None:
        room = Room(name=name, type="generic")
        db.add(room)
        db.flush()
    return room


def _ensure_device(db: Session, device_id: str, room: Room, name: str | None) -> Device:
    did = device_id.strip()
    dev = db.execute(select(Device).where(Device.device_id == did)).scalar_one_or_none()
    if dev is None:
        dev = Device(
            device_id=did,
            name=name or did,
            room_id=room.id,
            device_type="multi_sensor",
            status="online",
        )
        db.add(dev)
        db.flush()
    elif dev.room_id != room.id:
        dev.room_id = room.id
    return dev


def ingest_telemetry(db: Session, payload: TelemetryIngest) -> Telemetry:
    room = _ensure_room(db, payload.room)
    device = _ensure_device(db, payload.device_id, room, payload.device_id)
    ts = payload.timestamp or datetime.now(timezone.utc)
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
        timestamp=ts,
    )
    device.last_seen = ts
    device.status = "online"
    db.add(row)
    db.commit()
    db.refresh(row)

    try:
        evaluate_telemetry(db, room, device, payload)
    except Exception:  # noqa: BLE001
        logger.exception("alert evaluation failed")

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
    )
    connection_manager.broadcast(
        {
            "type": "telemetry",
            "payload": reading.model_dump(mode="json"),
        }
    )
    return row


def get_latest_per_device(db: Session) -> list[TelemetryReading]:
    latest = (
        select(
            Telemetry.device_id.label("dev_id"),
            func.max(Telemetry.timestamp).label("mx"),
        )
        .group_by(Telemetry.device_id)
        .subquery()
    )
    q = select(Telemetry).join(
        latest,
        (Telemetry.device_id == latest.c.dev_id)
        & (Telemetry.timestamp == latest.c.mx),
    )
    rows = db.execute(q).scalars().all()
    out: list[TelemetryReading] = []
    for t in rows:
        device = db.get(Device, t.device_id)
        room = db.get(Room, t.room_id) if t.room_id else None
        if not device or not room:
            continue
        out.append(
            TelemetryReading(
                device_id=device.device_id,
                room=room.name,
                temperature=t.temperature,
                humidity=t.humidity,
                motion=t.motion,
                light=t.light,
                gas=t.gas,
                smoke=t.smoke,
                timestamp=t.timestamp,
                trace_id=None,
                t_sim=None,
            )
        )
    return sorted(out, key=lambda r: r.device_id)
