from datetime import datetime

from pydantic import BaseModel


class RoomOut(BaseModel):
    id: int
    name: str
    type: str
    created_at: datetime
    device_count: int = 0

    model_config = {"from_attributes": False}


class RoomDetailOut(RoomOut):
    pass
