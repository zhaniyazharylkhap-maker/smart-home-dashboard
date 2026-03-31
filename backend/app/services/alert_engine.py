from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models import Alert, Device, Room, Threshold
from app.services.risk_engine import RiskResult, compute_risk
from app.schemas.telemetry import TelemetryIngest
from app.websocket.manager import connection_manager


def _effective_thresholds(db: Session, room_id: int) -> Threshold:
    """Merge global (room_id NULL) and room-specific row; room overrides where set."""
    global_row = db.execute(
        select(Threshold).where(Threshold.room_id.is_(None))
    ).scalar_one_or_none()
    room_row = db.execute(
        select(Threshold).where(Threshold.room_id == room_id)
    ).scalar_one_or_none()
    merged = Threshold(
        room_id=room_id,
        temperature_max=30.0,
        gas_max=0.5,
        smoke_max=0.25,
        humidity_min=30.0,
        humidity_max=70.0,
        offline_after_minutes=10,
    )
    if global_row:
        for attr in (
            "temperature_max",
            "gas_max",
            "smoke_max",
            "humidity_min",
            "humidity_max",
            "offline_after_minutes",
        ):
            v = getattr(global_row, attr)
            if v is not None:
                setattr(merged, attr, v)
    if room_row:
        for attr in (
            "temperature_max",
            "gas_max",
            "smoke_max",
            "humidity_min",
            "humidity_max",
            "offline_after_minutes",
        ):
            v = getattr(room_row, attr)
            if v is not None:
                setattr(merged, attr, v)
    return merged


def _has_open_alert(
    db: Session, device_pk: int, alert_type: str
) -> bool:
    q = select(Alert.id).where(
        and_(
            Alert.device_id == device_pk,
            Alert.alert_type == alert_type,
            Alert.status == "unresolved",
        )
    )
    return db.execute(q).first() is not None


def _create_alert(
    db: Session,
    *,
    room_id: int | None,
    device_pk: int | None,
    alert_type: str,
    severity: str,
    title: str,
    description: str | None,
    recommended_action: str | None,
    risk_score: float | None = None,
    risk_level: str | None = None,
    alert_reasons: list[str] | None = None,
) -> Alert | None:
    if device_pk is not None and _has_open_alert(db, device_pk, alert_type):
        return None
    row = Alert(
        room_id=room_id,
        device_id=device_pk,
        alert_type=alert_type,
        severity=severity,
        title=title,
        description=description,
        recommended_action=recommended_action,
        risk_score=risk_score,
        risk_level=risk_level,
        alert_reasons=json.dumps(alert_reasons) if alert_reasons else None,
        status="unresolved",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _alert_payload(db: Session, alert: Alert) -> dict:
    room_name = None
    dev_external = None
    if alert.room_id:
        r = db.get(Room, alert.room_id)
        room_name = r.name if r else None
    if alert.device_id:
        d = db.get(Device, alert.device_id)
        dev_external = d.device_id if d else None
    reasons: list[str] | None = None
    if alert.alert_reasons:
        try:
            parsed = json.loads(alert.alert_reasons)
            if isinstance(parsed, list):
                reasons = [str(x) for x in parsed]
        except json.JSONDecodeError:
            reasons = [alert.alert_reasons]
    return {
        "id": alert.id,
        "room_id": alert.room_id,
        "room_name": room_name,
        "device_id": alert.device_id,
        "device_external_id": dev_external,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "title": alert.title,
        "description": alert.description,
        "recommended_action": alert.recommended_action,
        "risk_score": alert.risk_score,
        "risk_level": alert.risk_level,
        "alert_reasons": reasons,
        "status": alert.status,
        "created_at": alert.created_at.isoformat(),
        "resolved_at": alert.resolved_at.isoformat() if alert.resolved_at else None,
    }


def evaluate_telemetry(
    db: Session,
    room: Room,
    device: Device,
    payload: TelemetryIngest,
) -> RiskResult:
    th = _effective_thresholds(db, room.id)
    hour = datetime.now(timezone.utc).hour
    night = hour >= 22 or hour < 6
    risk = compute_risk(
        temperature=payload.temperature,
        smoke=payload.smoke,
        gas=payload.gas,
        motion=payload.motion,
    )

    if payload.temperature is not None and th.temperature_max is not None:
        if payload.temperature > th.temperature_max:
            sev = "critical" if payload.temperature > th.temperature_max + 5 else "warning"
            a = _create_alert(
                db,
                room_id=room.id,
                device_pk=device.id,
                alert_type="temperature_high",
                severity=sev,
                title="High temperature",
                description=f"{payload.temperature:.1f}°C exceeds threshold {th.temperature_max:.1f}°C in {room.name}.",
                recommended_action="Check HVAC, ventilation, and heat sources.",
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                alert_reasons=risk.alert_reasons,
            )
            if a:
                connection_manager.broadcast({"type": "alert", "payload": _alert_payload(db, a)})

    if payload.gas is not None and th.gas_max is not None:
        if payload.gas > th.gas_max:
            a = _create_alert(
                db,
                room_id=room.id,
                device_pk=device.id,
                alert_type="gas_high",
                severity="critical",
                title="Gas level elevated",
                description=f"Gas reading {payload.gas:.3f} exceeds {th.gas_max:.3f} in {room.name}.",
                recommended_action="Ventilate the area and verify appliances; contact maintenance if persistent.",
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                alert_reasons=risk.alert_reasons,
            )
            if a:
                connection_manager.broadcast({"type": "alert", "payload": _alert_payload(db, a)})

    if payload.smoke is not None and th.smoke_max is not None:
        if payload.smoke > th.smoke_max:
            a = _create_alert(
                db,
                room_id=room.id,
                device_pk=device.id,
                alert_type="smoke_high",
                severity="critical",
                title="Smoke detected",
                description=f"Smoke index {payload.smoke:.3f} exceeds {th.smoke_max:.3f} in {room.name}.",
                recommended_action="Verify source; if unsure, evacuate and call emergency services.",
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                alert_reasons=risk.alert_reasons,
            )
            if a:
                connection_manager.broadcast({"type": "alert", "payload": _alert_payload(db, a)})

    if (
        payload.humidity is not None
        and th.humidity_min is not None
        and th.humidity_max is not None
    ):
        if payload.humidity < th.humidity_min or payload.humidity > th.humidity_max:
            a = _create_alert(
                db,
                room_id=room.id,
                device_pk=device.id,
                alert_type="humidity_range",
                severity="warning",
                title="Humidity out of range",
                description=f"Humidity {payload.humidity:.1f}% outside [{th.humidity_min:.0f}, {th.humidity_max:.0f}] in {room.name}.",
                recommended_action="Check ventilation, dehumidifier/humidifier, and leaks.",
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                alert_reasons=risk.alert_reasons,
            )
            if a:
                connection_manager.broadcast({"type": "alert", "payload": _alert_payload(db, a)})

    if night and payload.motion is True:
        a = _create_alert(
            db,
            room_id=room.id,
            device_pk=device.id,
            alert_type="motion_night",
            severity="info",
            title="Night motion",
            description=f"Motion detected in {room.name} during quiet hours.",
            recommended_action="Review camera or presence rules if unexpected.",
            risk_score=risk.risk_score,
            risk_level=risk.risk_level,
            alert_reasons=risk.alert_reasons,
        )
        if a:
            connection_manager.broadcast({"type": "alert", "payload": _alert_payload(db, a)})
    return risk
