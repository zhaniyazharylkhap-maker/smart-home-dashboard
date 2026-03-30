from datetime import datetime

from pydantic import BaseModel, Field


class DeviceOut(BaseModel):
    id: int
    device_id: str
    name: str
    room_id: int
    room_name: str
    device_type: str
    status: str
    last_seen: datetime | None
    created_at: datetime

    model_config = {"from_attributes": False}


class DeviceCreateIn(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=128)
    room_id: int
    device_type: str = Field(default="multi_sensor", max_length=64)


class DeviceUpdateIn(BaseModel):
    name: str | None = Field(None, max_length=128)
    room_id: int | None = None
    device_type: str | None = Field(None, max_length=64)
    status: str | None = Field(None, max_length=32)
