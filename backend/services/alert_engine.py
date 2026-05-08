from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models import Alert, Device, Room, Threshold
from app.schemas.telemetry import TelemetryIngest
from services.risk_engine import RiskResult, compute_risk
from core.config import get_settings
from core.redis_client import get_redis, publish

if TYPE_CHECKING:
    pass

_humidity_high_since: dict[int, datetime] = {}
_THRESHOLD_CACHE_TTL_SECONDS = 60


def _effective_thresholds(db: Session, room_id: int, device_id: int) -> Threshold:
    # Cache namespace bumped to v2 after the migration-008 unit rescale
    # so any in-flight ppm-fraction values left in Redis are ignored.
    cache_key = f"thresholds:v2:{device_id}"
    try:
        cached_raw = get_redis().get(cache_key)
        if cached_raw:
            cached = json.loads(cached_raw)
            return Threshold(
                room_id=room_id,
                temperature_max=cached.get("temperature_max"),
                gas_max=cached.get("gas_max"),
                smoke_max=cached.get("smoke_max"),
                humidity_min=cached.get("humidity_min"),
                humidity_max=cached.get("humidity_max"),
                offline_after_minutes=cached.get("offline_after_minutes"),
                motion_light_combo_max=cached.get("motion_light_combo_max"),
            )
    except Exception:  # noqa: BLE001
        pass

    settings = get_settings()
    global_row = db.execute(
        select(Threshold).where(Threshold.room_id.is_(None))
    ).scalar_one_or_none()
    room_row = db.execute(
        select(Threshold).where(Threshold.room_id == room_id)
    ).scalar_one_or_none()
    # Threshold calibration: gas/smoke values arrive on the MOX/CO sensor
    # scale used by the training CSVs (gas ~50-300, smoke ~50-700) and by
    # the simulator's _ROOM_BASELINES. Values below were derived from
    # `feature_manifest.json#raw_thresholds` (train-slice p99) with a
    # safety margin so the rule engine fires on the same operating point
    # as the proxy-label rules used by the ML pipeline.
    #     temperature_max: physical safety threshold (unchanged at 30C)
    #     gas_max  ~= 200 (manifest gas_high p99 was 274)
    #     smoke_max ~= 250 (manifest smoke_high p99 was 716)
    merged = Threshold(
        room_id=room_id,
        temperature_max=30.0,
        gas_max=200.0,
        smoke_max=250.0,
        humidity_min=30.0,
        humidity_max=70.0,
        offline_after_minutes=10,
        motion_light_combo_max=settings.suspicious_motion_light_max,
    )
    if global_row:
        for attr in (
            "temperature_max",
            "gas_max",
            "smoke_max",
            "humidity_min",
            "humidity_max",
            "offline_after_minutes",
            "motion_light_combo_max",
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
            "motion_light_combo_max",
        ):
            v = getattr(room_row, attr)
            if v is not None:
                setattr(merged, attr, v)
    try:
        get_redis().setex(
            cache_key,
            _THRESHOLD_CACHE_TTL_SECONDS,
            json.dumps(
                {
                    "temperature_max": merged.temperature_max,
                    "gas_max": merged.gas_max,
                    "smoke_max": merged.smoke_max,
                    "humidity_min": merged.humidity_min,
                    "humidity_max": merged.humidity_max,
                    "offline_after_minutes": merged.offline_after_minutes,
                    "motion_light_combo_max": merged.motion_light_combo_max,
                }
            ),
        )
    except Exception:  # noqa: BLE001
        pass
    return merged


def _has_open_alert(db: Session, device_pk: int, alert_type: str) -> bool:
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
    user_id: int | None = None,
) -> Alert | None:
    if device_pk is not None and _has_open_alert(db, device_pk, alert_type):
        return None
    row = Alert(
        room_id=room_id,
        device_id=device_pk,
        user_id=user_id,
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


def _emit_alert(db: Session, device: Device, alert: Alert) -> None:
    publish(
        f"alerts:{device.device_id}",
        {"type": "alert", "payload": _alert_payload(db, alert)},
    )


def _update_humidity_duration_tracker(
    device_pk: int,
    humidity: float | None,
    humidity_max: float | None,
    now: datetime,
) -> None:
    if humidity_max is None or humidity is None:
        _humidity_high_since.pop(device_pk, None)
        return
    if humidity > humidity_max:
        if device_pk not in _humidity_high_since:
            _humidity_high_since[device_pk] = now
    else:
        _humidity_high_since.pop(device_pk, None)


def _apply_rules(
    db: Session,
    room: Room,
    device: Device,
    payload: TelemetryIngest,
) -> list[Alert]:
    th = _effective_thresholds(db, room.id, device.id)
    settings = get_settings()
    hour = datetime.now(timezone.utc).hour
    night = hour >= 22 or hour < 6
    risk = compute_risk(
        temperature=payload.temperature,
        smoke=payload.smoke,
        gas=payload.gas,
        motion=payload.motion,
    )
    created: list[Alert] = []
    now = datetime.now(timezone.utc)

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
                user_id=device.user_id,
            )
            if a:
                _emit_alert(db, device, a)
                created.append(a)

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
                user_id=device.user_id,
            )
            if a:
                _emit_alert(db, device, a)
                created.append(a)

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
                user_id=device.user_id,
            )
            if a:
                _emit_alert(db, device, a)
                created.append(a)

    if payload.humidity is not None and th.humidity_max is not None:
        if payload.humidity > th.humidity_max:
            a = _create_alert(
                db,
                room_id=room.id,
                device_pk=device.id,
                alert_type="humidity_high",
                severity="warning",
                title="Humidity above threshold",
                description=f"Humidity {payload.humidity:.1f}% exceeds max {th.humidity_max:.0f}% in {room.name}.",
                recommended_action="Check ventilation and moisture sources.",
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                alert_reasons=risk.alert_reasons,
                user_id=device.user_id,
            )
            if a:
                _emit_alert(db, device, a)
                created.append(a)

    if (
        payload.humidity is not None
        and th.humidity_min is not None
        and th.humidity_max is not None
    ):
        if payload.humidity < th.humidity_min:
            a = _create_alert(
                db,
                room_id=room.id,
                device_pk=device.id,
                alert_type="humidity_range",
                severity="warning",
                title="Humidity out of range",
                description=f"Humidity {payload.humidity:.1f}% below minimum {th.humidity_min:.0f}% in {room.name}.",
                recommended_action="Check ventilation, dehumidifier/humidifier, and leaks.",
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                alert_reasons=risk.alert_reasons,
                user_id=device.user_id,
            )
            if a:
                _emit_alert(db, device, a)
                created.append(a)

    motion_light_max = th.motion_light_combo_max
    if motion_light_max is None:
        motion_light_max = settings.suspicious_motion_light_max
    if payload.motion is True and payload.light is not None:
        combo = 1.0 + float(payload.light)
        if combo < motion_light_max:
            a = _create_alert(
                db,
                room_id=room.id,
                device_pk=device.id,
                alert_type="suspicious_motion_light",
                severity="warning",
                title="Suspicious motion and light pattern",
                description=(
                    f"Motion with low combined light signal ({combo:.1f} < {motion_light_max}) in {room.name}."
                ),
                recommended_action="Verify occupancy and lighting; review sensor placement.",
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                alert_reasons=risk.alert_reasons,
                user_id=device.user_id,
            )
            if a:
                _emit_alert(db, device, a)
                created.append(a)

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
            user_id=device.user_id,
        )
        if a:
            _emit_alert(db, device, a)
            created.append(a)

    if (
        payload.humidity is not None
        and th.humidity_max is not None
        and device.id in _humidity_high_since
    ):
        started = _humidity_high_since[device.id]
        mins = (now - started).total_seconds() / 60.0
        if mins >= settings.humidity_high_duration_minutes and payload.humidity > th.humidity_max:
            a = _create_alert(
                db,
                room_id=room.id,
                device_pk=device.id,
                alert_type="humidity_duration",
                severity="warning",
                title="Sustained high humidity",
                description=(
                    f"Humidity above {th.humidity_max:.0f}% for {mins:.0f}+ minutes in {room.name}."
                ),
                recommended_action="Inspect ventilation, leaks, and dehumidification.",
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                alert_reasons=risk.alert_reasons,
                user_id=device.user_id,
            )
            if a:
                _emit_alert(db, device, a)
                created.append(a)

    _update_humidity_duration_tracker(device.id, payload.humidity, th.humidity_max, now)

    return created


def check_alert(
    db: Session,
    room: Room,
    device: Device,
    payload: TelemetryIngest,
) -> Alert | None:
    xs = _apply_rules(db, room, device, payload)
    return xs[0] if xs else None


def evaluate_telemetry(
    db: Session,
    room: Room,
    device: Device,
    payload: TelemetryIngest,
) -> RiskResult:
    _apply_rules(db, room, device, payload)
    return compute_risk(
        temperature=payload.temperature,
        smoke=payload.smoke,
        gas=payload.gas,
        motion=payload.motion,
    )


def emit_anomaly_alert(
    db: Session,
    room: Room,
    device: Device,
    anomaly_score: float,
) -> Alert | None:
    risk = compute_risk(
        temperature=None,
        smoke=None,
        gas=None,
        motion=None,
    )
    a = _create_alert(
        db,
        room_id=room.id,
        device_pk=device.id,
        alert_type="anomaly_isolation",
        severity="warning",
        title="Telemetry anomaly",
        description=f"Isolation model score {anomaly_score:.3f} for device {device.device_id}.",
        recommended_action="Review recent sensor readings and environment.",
        risk_score=risk.risk_score,
        risk_level=risk.risk_level,
        alert_reasons=[f"anomaly_score={anomaly_score:.4f}"],
        user_id=device.user_id,
    )
    if a:
        _emit_alert(db, device, a)
    return a
