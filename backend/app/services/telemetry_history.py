from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Device, Room, Telemetry
from app.schemas.telemetry import TelemetryHistoryResponse, TelemetryPoint

RANGE_MAP = {
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
}

METRIC_ATTR = {
    "temperature": "temperature",
    "humidity": "humidity",
    "gas": "gas",
    "smoke": "smoke",
    "light": "light",
    "motion": "motion",
}


def get_history(
    db: Session,
    *,
    metric: str,
    range_key: str,
    room_name: str | None,
    device_external_id: str | None,
) -> TelemetryHistoryResponse:
    if metric not in METRIC_ATTR:
        raise ValueError("invalid metric")
    if range_key not in RANGE_MAP:
        raise ValueError("invalid range")
    cutoff = datetime.now(timezone.utc) - RANGE_MAP[range_key]

    q = select(Telemetry).where(Telemetry.timestamp >= cutoff)
    if room_name:
        rn = room_name.strip().lower()
        room = db.execute(select(Room).where(Room.name == rn)).scalar_one_or_none()
        if room is None:
            return TelemetryHistoryResponse(
                room=room_name,
                device_id=device_external_id,
                metric=metric,
                range=range_key,
                points=[],
            )
        q = q.where(Telemetry.room_id == room.id)
    if device_external_id:
        dev = db.execute(
            select(Device).where(Device.device_id == device_external_id.strip())
        ).scalar_one_or_none()
        if dev is None:
            return TelemetryHistoryResponse(
                room=room_name,
                device_id=device_external_id,
                metric=metric,
                range=range_key,
                points=[],
            )
        q = q.where(Telemetry.device_id == dev.id)

    q = q.order_by(Telemetry.timestamp.asc())
    rows = db.execute(q).scalars().all()
    attr = METRIC_ATTR[metric]
    points: list[TelemetryPoint] = []
    for row in rows:
        raw = getattr(row, attr)
        if metric == "motion":
            v = 1.0 if raw is True else (0.0 if raw is False else None)
        else:
            v = float(raw) if raw is not None else None
        points.append(TelemetryPoint(t=row.timestamp, v=v))
    return TelemetryHistoryResponse(
        room=room_name,
        device_id=device_external_id,
        metric=metric,
        range=range_key,
        points=points,
    )
