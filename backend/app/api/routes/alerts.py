from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Alert, Device, Room, User
from app.schemas.alert import AlertOut

router = APIRouter()


def _to_out(db: Session, a: Alert) -> AlertOut:
    room_name = None
    dev_ext = None
    if a.room_id:
        r = db.get(Room, a.room_id)
        room_name = r.name if r else None
    if a.device_id:
        d = db.get(Device, a.device_id)
        dev_ext = d.device_id if d else None
    return AlertOut(
        id=a.id,
        room_id=a.room_id,
        room_name=room_name,
        device_id=a.device_id,
        device_external_id=dev_ext,
        alert_type=a.alert_type,
        severity=a.severity,
        title=a.title,
        description=a.description,
        recommended_action=a.recommended_action,
        status=a.status,
        created_at=a.created_at,
        resolved_at=a.resolved_at,
    )


@router.get("", response_model=list[AlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    status_filter: str | None = Query(None, alias="status"),
) -> list[AlertOut]:
    q = select(Alert).order_by(Alert.created_at.desc())
    if status_filter == "active":
        q = q.where(Alert.status == "unresolved")
    elif status_filter == "resolved":
        q = q.where(Alert.status == "resolved")
    rows = db.execute(q).scalars().all()
    return [_to_out(db, a) for a in rows]


@router.patch("/{alert_id}/resolve", response_model=AlertOut)
def resolve_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> AlertOut:
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    if a.status == "resolved":
        return _to_out(db, a)
    a.status = "resolved"
    a.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return _to_out(db, a)
