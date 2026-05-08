"""Contextual anomaly analytics API.

All endpoints are tenant-scoped: device ownership is verified against
`Device.user_id` before any per-device storage is read. The backing
store (`app.services.contextual_storage`) holds device-keyed rolling
buffers in Redis; SQL telemetry is used for cross-sensor correlation
and behavior-profile envelopes which need actual time-series math.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Device, Room, Telemetry, User
from app.schemas.telemetry import (
    AnomalyExplanationCount,
    AnomalyExplanationsResponse,
    AnomalyHistoryPoint,
    AnomalyHistoryResponse,
    AnomalyLiveItem,
    AnomalyLiveResponse,
    BehaviorEnvelopePoint,
    BehaviorProfileResponse,
    ContextualAnomalyEvent,
    CorrelationCell,
    CorrelationResponse,
    FeatureContribution,
)
from app.services import contextual_storage


router = APIRouter()


def _user_owns_device(db: Session, *, user_id: int, device_id: str) -> Device | None:
    return db.execute(
        select(Device).where(
            Device.device_id == device_id, Device.user_id == user_id
        )
    ).scalar_one_or_none()


def _user_device_externals(db: Session, *, user_id: int) -> set[str]:
    rows = db.execute(
        select(Device.device_id).where(Device.user_id == user_id)
    ).scalars().all()
    return {str(x) for x in rows}


def _parse_event(raw: dict) -> ContextualAnomalyEvent | None:
    try:
        ts_raw = raw.get("timestamp")
        ts = (
            datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
            if ts_raw
            else datetime.now(timezone.utc)
        )
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        contributions = [
            FeatureContribution(feature=str(c.get("feature")), z=float(c.get("z", 0.0)))
            for c in raw.get("feature_contributions") or []
            if isinstance(c, dict)
        ]
        return ContextualAnomalyEvent(
            device_id=str(raw.get("device_id") or ""),
            room=str(raw.get("room") or ""),
            timestamp=ts,
            anomaly_score=float(raw.get("anomaly_score") or 0.0),
            anomaly_threshold=float(raw.get("anomaly_threshold") or 0.0),
            is_contextual_anomaly=bool(raw.get("is_contextual_anomaly")),
            explanation_tokens=[str(x) for x in raw.get("explanation_tokens") or []],
            feature_contributions=contributions,
            model_version=str(raw.get("model_version") or ""),
            degraded=bool(raw.get("degraded")),
        )
    except Exception:  # noqa: BLE001
        return None


@router.get("/live", response_model=AnomalyLiveResponse)
def anomaly_live(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnomalyLiveResponse:
    owned = _user_device_externals(db, user_id=user.id)
    items: list[AnomalyLiveItem] = []
    for ev in contextual_storage.latest_per_device():
        device_id = str(ev.get("device_id") or "")
        if device_id not in owned:
            continue
        ts_raw = ev.get("timestamp")
        try:
            ts = (
                datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                if ts_raw
                else datetime.now(timezone.utc)
            )
        except Exception:  # noqa: BLE001
            ts = datetime.now(timezone.utc)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        items.append(
            AnomalyLiveItem(
                device_id=device_id,
                room=str(ev.get("room") or ""),
                last_seen=ts,
                anomaly_score=float(ev.get("anomaly_score") or 0.0),
                anomaly_threshold=float(ev.get("anomaly_threshold") or 0.0),
                is_contextual_anomaly=bool(ev.get("is_contextual_anomaly")),
                explanation_tokens=[str(x) for x in ev.get("explanation_tokens") or []],
                model_version=(str(ev.get("model_version") or "") or None),
                degraded=bool(ev.get("degraded")),
            )
        )
    return AnomalyLiveResponse(items=sorted(items, key=lambda x: x.device_id))


@router.get("/history", response_model=AnomalyHistoryResponse)
def anomaly_history(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    device_id: str = Query(..., description="External device_id string"),
    limit: int = Query(240, ge=10, le=2000),
    range_key: str = Query("24h", alias="range"),
) -> AnomalyHistoryResponse:
    if _user_owns_device(db, user_id=user.id, device_id=device_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    rows = contextual_storage.history(device_id, limit=limit)
    points: list[AnomalyHistoryPoint] = []
    for raw in rows:
        ts_raw = raw.get("timestamp")
        try:
            ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
        except Exception:  # noqa: BLE001
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        points.append(
            AnomalyHistoryPoint(
                t=ts,
                score=float(raw.get("anomaly_score") or 0.0),
                threshold=float(raw.get("anomaly_threshold") or 0.0),
                is_anomaly=bool(raw.get("is_contextual_anomaly")),
            )
        )
    return AnomalyHistoryResponse(device_id=device_id, range=range_key, points=points)


@router.get("/explanations", response_model=AnomalyExplanationsResponse)
def anomaly_explanations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    range_key: str = Query("24h", alias="range"),
    sample_limit: int = Query(20, ge=1, le=100),
) -> AnomalyExplanationsResponse:
    hours = {"1h": 1.0, "24h": 24.0, "7d": 168.0}.get(range_key, 24.0)
    raw_events = contextual_storage.recent_events(within_hours=hours, limit=2000)
    owned = _user_device_externals(db, user_id=user.id)
    events: list[ContextualAnomalyEvent] = []
    for raw in raw_events:
        if str(raw.get("device_id") or "") not in owned:
            continue
        if not raw.get("is_contextual_anomaly"):
            continue
        ev = _parse_event(raw)
        if ev:
            events.append(ev)

    counts: dict[str, int] = {}
    for ev in events:
        for label in ev.explanation_tokens:
            counts[label] = counts.get(label, 0) + 1
    ranked = sorted(
        (AnomalyExplanationCount(label=k, count=v) for k, v in counts.items()),
        key=lambda x: x.count,
        reverse=True,
    )
    return AnomalyExplanationsResponse(
        range=range_key,
        top_factors=ranked[:10],
        sample_events=events[:sample_limit],
    )


def _correlation(values: dict[str, np.ndarray]) -> Iterable[CorrelationCell]:
    metrics = [m for m, v in values.items() if v.size >= 2]
    for i, a in enumerate(metrics):
        for b in metrics[i + 1 :]:
            x = values[a]
            y = values[b]
            n = min(x.size, y.size)
            if n < 2:
                yield CorrelationCell(a=a, b=b, correlation=0.0)
                continue
            xa = x[:n]
            yb = y[:n]
            if np.std(xa) <= 1e-9 or np.std(yb) <= 1e-9:
                yield CorrelationCell(a=a, b=b, correlation=0.0)
                continue
            corr = float(np.corrcoef(xa, yb)[0, 1])
            yield CorrelationCell(a=a, b=b, correlation=round(corr, 4))


@router.get("/correlation", response_model=CorrelationResponse)
def anomaly_correlation(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    range_key: str = Query("24h", alias="range"),
) -> CorrelationResponse:
    hours = {"1h": 1.0, "24h": 24.0, "7d": 168.0}.get(range_key, 24.0)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    user_devices = select(Device.id).where(Device.user_id == user.id).scalar_subquery()
    rows = db.execute(
        select(
            Telemetry.temperature,
            Telemetry.humidity,
            Telemetry.gas,
            Telemetry.smoke,
            Telemetry.light,
        )
        .where(
            Telemetry.device_id.in_(user_devices),
            Telemetry.timestamp >= cutoff,
        )
    ).all()
    if not rows:
        return CorrelationResponse(
            metrics=["temperature", "humidity", "gas", "smoke", "light"],
            cells=[],
            sample_size=0,
        )
    arrs: dict[str, list[float]] = {
        "temperature": [],
        "humidity": [],
        "gas": [],
        "smoke": [],
        "light": [],
    }
    for r in rows:
        for key, val in zip(arrs.keys(), r, strict=True):
            arrs[key].append(float(val) if val is not None else 0.0)
    np_arrs = {k: np.asarray(v, dtype=np.float64) for k, v in arrs.items()}
    cells = list(_correlation(np_arrs))
    return CorrelationResponse(
        metrics=list(np_arrs.keys()),
        cells=cells,
        sample_size=len(rows),
    )


@router.get("/profile", response_model=BehaviorProfileResponse)
def behavior_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    metric: str = Query("temperature"),
    room: str | None = Query(None),
    days: int = Query(7, ge=1, le=30),
) -> BehaviorProfileResponse:
    valid = {"temperature", "humidity", "gas", "smoke", "light"}
    if metric not in valid:
        raise HTTPException(status_code=400, detail="invalid metric")
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    user_devices = select(Device.id).where(Device.user_id == user.id).scalar_subquery()
    q = select(getattr(Telemetry, metric), Telemetry.timestamp).where(
        Telemetry.device_id.in_(user_devices),
        Telemetry.timestamp >= cutoff,
    )
    if room:
        rn = room.strip().lower()
        room_obj = db.execute(
            select(Room).where(Room.name == rn, Room.user_id == user.id)
        ).scalar_one_or_none()
        if room_obj is None:
            return BehaviorProfileResponse(metric=metric, room=room, points=[])
        q = q.where(Telemetry.room_id == room_obj.id)
    rows = db.execute(q).all()

    by_hour: dict[int, list[float]] = {h: [] for h in range(24)}
    for v, ts in rows:
        if v is None or ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        by_hour[ts.hour].append(float(v))
    points: list[BehaviorEnvelopePoint] = []
    for h in range(24):
        vals = by_hour[h]
        if not vals:
            continue
        arr = np.asarray(vals)
        points.append(
            BehaviorEnvelopePoint(
                hour=h,
                p10=float(np.quantile(arr, 0.1)),
                p50=float(np.quantile(arr, 0.5)),
                p90=float(np.quantile(arr, 0.9)),
            )
        )
    return BehaviorProfileResponse(metric=metric, room=room, points=points)
