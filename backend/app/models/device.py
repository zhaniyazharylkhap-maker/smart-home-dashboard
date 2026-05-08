from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), index=True)
    # Nullable for backward-compat with rows pre-dating migration 007;
    # application layer enforces ownership on all new writes.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=True
    )
    device_type: Mapped[str] = mapped_column(String(64), default="multi_sensor")
    status: Mapped[str] = mapped_column(String(32), default="online")
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    room: Mapped["Room"] = relationship(back_populates="devices")
    telemetry_rows: Mapped[list["Telemetry"]] = relationship(back_populates="device")
