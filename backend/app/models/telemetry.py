from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Telemetry(Base):
    __tablename__ = "telemetry"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), index=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    motion: Mapped[bool | None] = mapped_column(nullable=True)
    light: Mapped[float | None] = mapped_column(Float, nullable=True)
    gas: Mapped[float | None] = mapped_column(Float, nullable=True)
    smoke: Mapped[float | None] = mapped_column(Float, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    device: Mapped["Device"] = relationship(back_populates="telemetry_rows")
    room: Mapped["Room"] = relationship()
