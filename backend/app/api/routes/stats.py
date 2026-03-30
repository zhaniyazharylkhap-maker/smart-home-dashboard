from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Alert, Device, User
from app.schemas.stats import DashboardStatsOut

router = APIRouter()

ONLINE_WINDOW = timedelta(minutes=2)


@router.get("/dashboard", response_model=DashboardStatsOut)
def dashboard_stats(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> DashboardStatsOut:
    devices = db.execute(select(Device)).scalars().all()
    now = datetime.now(timezone.utc)
    online = 0
    for d in devices:
        if d.last_seen is None:
            continue
        ls = d.last_seen
        if ls.tzinfo is None:
            ls = ls.replace(tzinfo=timezone.utc)
        if now - ls <= ONLINE_WINDOW:
            online += 1

    active = db.execute(
        select(func.count()).select_from(Alert).where(Alert.status == "unresolved")
    ).scalar_one()
    active_int = int(active)

    crit = db.execute(
        select(func.count())
        .select_from(Alert)
        .where(Alert.status == "unresolved", Alert.severity == "critical")
    ).scalar_one()
    warn = db.execute(
        select(func.count())
        .select_from(Alert)
        .where(Alert.status == "unresolved", Alert.severity == "warning")
    ).scalar_one()

    if int(crit) > 0:
        status = "critical"
    elif int(warn) > 0 or active_int > 0:
        status = "warning"
    else:
        status = "safe"

    return DashboardStatsOut(
        devices_total=len(devices),
        devices_online=online,
        active_alerts=active_int,
        home_status=status,
    )
