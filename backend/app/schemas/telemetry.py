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
    risk_score: float | None = None
    risk_level: str | None = None
    alert_reasons: list[str] | None = None
    # Contextual anomaly layer (filled by `ml.inference`).
    anomaly_score: float | None = None
    anomaly_threshold: float | None = None
    is_contextual_anomaly: bool | None = None
    explanation_tokens: list[str] | None = None
    model_version: str | None = None

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


class FeatureContribution(BaseModel):
    feature: str
    z: float


class ContextualAnomalyEvent(BaseModel):
    device_id: str
    room: str
    timestamp: datetime
    anomaly_score: float
    anomaly_threshold: float
    is_contextual_anomaly: bool
    explanation_tokens: list[str]
    feature_contributions: list[FeatureContribution] = []
    model_version: str
    degraded: bool = False


class AnomalyLiveItem(BaseModel):
    device_id: str
    room: str
    last_seen: datetime
    anomaly_score: float
    anomaly_threshold: float
    is_contextual_anomaly: bool
    explanation_tokens: list[str]
    model_version: str | None = None
    degraded: bool = False


class AnomalyLiveResponse(BaseModel):
    items: list[AnomalyLiveItem]


class AnomalyHistoryPoint(BaseModel):
    t: datetime
    score: float
    threshold: float
    is_anomaly: bool


class AnomalyHistoryResponse(BaseModel):
    device_id: str | None
    range: str
    points: list[AnomalyHistoryPoint]


class AnomalyExplanationCount(BaseModel):
    label: str
    count: int


class AnomalyExplanationsResponse(BaseModel):
    range: str
    top_factors: list[AnomalyExplanationCount]
    sample_events: list[ContextualAnomalyEvent]


class CorrelationCell(BaseModel):
    a: str
    b: str
    correlation: float


class CorrelationResponse(BaseModel):
    metrics: list[str]
    cells: list[CorrelationCell]
    sample_size: int


class BehaviorEnvelopePoint(BaseModel):
    hour: int
    p10: float
    p50: float
    p90: float


class BehaviorProfileResponse(BaseModel):
    metric: str
    room: str | None = None
    points: list[BehaviorEnvelopePoint]
