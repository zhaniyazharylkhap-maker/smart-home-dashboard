from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.telemetry import LatestTelemetryResponse, TelemetryHistoryResponse
from app.services.telemetry_history import get_history
from app.services.telemetry_service import get_latest_per_device

router = APIRouter()


@router.get("/latest", response_model=LatestTelemetryResponse)
def latest_telemetry(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> LatestTelemetryResponse:
    readings = get_latest_per_device(db)
    return LatestTelemetryResponse(readings=readings)


@router.get("/history", response_model=TelemetryHistoryResponse)
def telemetry_history(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    metric: str = Query(..., description="temperature|humidity|gas|smoke|light|motion"),
    range_key: str = Query("24h", alias="range"),
    room: str | None = Query(None),
    device_id: str | None = Query(None, description="External device_id string"),
) -> TelemetryHistoryResponse:
    try:
        return get_history(
            db,
            metric=metric,
            range_key=range_key,
            room_name=room,
            device_external_id=device_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
