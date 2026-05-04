from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Device, Room, Telemetry
from app.schemas.telemetry import TelemetryIngest, TelemetryReading
from app.services.risk_engine import compute_risk


def ensure_room(db: Session, room_name: str) -> Room:
    name = room_name.strip().lower()
    room = db.execute(select(Room).where(Room.name == name)).scalar_one_or_none()
    if room is None:
        room = Room(name=name, type="generic")
        db.add(room)
        db.flush()
    return room


def ensure_device(db: Session, device_id: str, room: Room, name: str | None) -> Device:
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
    from services.ingestion_service import complete_ingest

    return complete_ingest(db, payload)


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
        risk = compute_risk(
            temperature=t.temperature,
            smoke=t.smoke,
            gas=t.gas,
            motion=t.motion,
        )
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
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                alert_reasons=risk.alert_reasons,
            )
        )
    return sorted(out, key=lambda r: r.device_id)
