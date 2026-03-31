from datetime import datetime

from pydantic import BaseModel


class AlertOut(BaseModel):
    id: int
    room_id: int | None
    room_name: str | None
    device_id: int | None
    device_external_id: str | None
    alert_type: str
    severity: str
    title: str
    description: str | None
    recommended_action: str | None
    risk_score: float | None
    risk_level: str | None
    alert_reasons: list[str] | None
    status: str
    created_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": False}


class AlertResolveIn(BaseModel):
    pass
