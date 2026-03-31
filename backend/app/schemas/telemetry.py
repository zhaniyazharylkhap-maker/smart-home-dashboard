from datetime import datetime

from pydantic import BaseModel, Field


class TelemetryIngest(BaseModel):
    """Unified payload from MQTT / future ESP32."""

    device_id: str = Field(..., min_length=1)
    room: str = Field(..., min_length=1)
    temperature: float | None = None
    humidity: float | None = None
    motion: bool | None = None
    light: float | None = None
    gas: float | None = None
    smoke: float | None = None
    timestamp: datetime | None = None
    trace_id: str | None = None
    t_sim: int | None = None


class TelemetryReading(BaseModel):
    device_id: str
    room: str
    temperature: float | None = None
    humidity: float | None = None
    motion: bool | None = None
    light: float | None = None
    gas: float | None = None
    smoke: float | None = None
    timestamp: datetime
    trace_id: str | None = None
    t_sim: int | None = None

    model_config = {"from_attributes": False}


class LatestTelemetryResponse(BaseModel):
    readings: list[TelemetryReading]


class TelemetryPoint(BaseModel):
    t: datetime
    v: float | None


class TelemetryHistoryResponse(BaseModel):
    room: str | None = None
    device_id: str | None = None
    metric: str
    range: str
    points: list[TelemetryPoint]
