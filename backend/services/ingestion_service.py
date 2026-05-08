from __future__ import annotations

import logging
import threading
from hashlib import sha256
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Device, Room, Telemetry
from app.schemas.telemetry import TelemetryIngest, TelemetryReading
from app.services import contextual_storage
from services.risk_engine import compute_risk
from app.services.telemetry_service import ensure_device, ensure_room
from core.config import get_settings
from core.redis_client import append_stream_event
from services.alert_engine import evaluate_telemetry
from services.contextual_service import evaluate_contextual_event

logger = logging.getLogger(__name__)


# Per-device cooldown for the dedicated `contextual_anomaly` stream
# event. The contextual score still flows on every tick inside the
# regular telemetry payload (so charts and the live grid update in
# real time); we just throttle the "fresh anomaly card" burst so the
# alert feed doesn't repeat the same explanation every two seconds
# while a device sits persistently above its adaptive threshold.
_ANOMALY_EMIT_COOLDOWN = timedelta(seconds=45)
_anomaly_emit_lock = threading.Lock()
_last_anomaly_emit_at: dict[str, datetime] = {}


def _should_emit_contextual_event(device_id: str, now: datetime) -> bool:
    with _anomaly_emit_lock:
        last = _last_anomaly_emit_at.get(device_id)
        if last is not None and now - last < _ANOMALY_EMIT_COOLDOWN:
            return False
        _last_anomaly_emit_at[device_id] = now
        return True


def _compute_trace_id(device_id: str, timestamp: datetime) -> str:
    # Stable idempotency key for QoS1 at-least-once MQTT delivery.
    raw = f"{device_id}_{timestamp.isoformat()}"
    return sha256(raw.encode("utf-8")).hexdigest()


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
    # MQTT-ingested telemetry carries no user identity; assign the configured
    # default owner so multi-tenant filters in the API layer return data.
    owner_user_id = get_settings().mqtt_default_owner_user_id
    room = ensure_room(db, payload.room, user_id=owner_user_id)
    device = ensure_device(
        db, payload.device_id, room, payload.device_id, user_id=owner_user_id
    )
    ts = payload.timestamp or received_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    trace_id = payload.trace_id or _compute_trace_id(payload.device_id, ts)

    existing = db.execute(
        select(Telemetry).where(Telemetry.trace_id == trace_id)
    ).scalar_one_or_none()
    if existing is not None:
        logger.info("duplicate telemetry skipped trace_id=%s", trace_id)
        return existing

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
        trace_id=trace_id,
        timestamp=ts,
        received_at=received_at,
    )
    device.last_seen = ts
    device.status = "online"
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        # Another worker may insert same trace_id concurrently; dedupe gracefully.
        db.rollback()
        dupe = db.execute(
            select(Telemetry).where(Telemetry.trace_id == trace_id)
        ).scalar_one_or_none()
        if dupe is not None:
            logger.info("duplicate telemetry resolved after race trace_id=%s", trace_id)
            return dupe
        raise
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

    # Contextual anomaly inference. Failures degrade silently to None
    # so the telemetry pipeline never blocks on the ML layer.
    ctx = evaluate_contextual_event(payload)

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
        trace_id=trace_id,
        t_sim=payload.t_sim,
        risk_score=risk.risk_score,
        risk_level=risk.risk_level,
        alert_reasons=risk.alert_reasons,
        anomaly_score=(ctx.score if ctx else None),
        anomaly_threshold=(ctx.threshold if ctx else None),
        is_contextual_anomaly=(ctx.is_anomaly if ctx else None),
        explanation_tokens=(ctx.explanations if ctx else None),
        model_version=(ctx.model_version if ctx else None),
    )
    # Redis Streams provide durable storage and replayability, unlike Pub/Sub where
    # events are dropped for disconnected websocket consumers.
    append_stream_event(
        {"type": "telemetry", "payload": reading.model_dump(mode="json")}
    )

    if ctx is not None:
        ctx_event = {
            "device_id": device.device_id,
            "room": room.name,
            "timestamp": row.timestamp.isoformat(),
            "anomaly_score": ctx.score,
            "anomaly_threshold": ctx.threshold,
            "is_contextual_anomaly": ctx.is_anomaly,
            "explanation_tokens": ctx.explanations,
            "feature_contributions": [
                {"feature": name, "z": z}
                for name, z in ctx.feature_contributions
            ],
            "model_version": ctx.model_version,
            "degraded": ctx.degraded,
        }
        contextual_storage.record_event(ctx_event)
        if ctx.is_anomaly and _should_emit_contextual_event(
            device.device_id, datetime.now(timezone.utc)
        ):
            # Emit a dedicated WS event type so the frontend can wire
            # it into the anomaly feed without ambiguity. Cooldown above
            # avoids spamming the operator with the same explanation
            # every tick while a device persistently breaches threshold.
            append_stream_event(
                {"type": "contextual_anomaly", "payload": ctx_event}
            )
    return row


def complete_ingest(db: Session, payload: TelemetryIngest) -> Telemetry:
    return ingest_telemetry(db, payload)


def ingest_from_mqtt_dict(db: Session, raw: dict) -> Telemetry:
    payload = telemetry_ingest_from_dict(raw)
    return ingest_telemetry(db, payload)
