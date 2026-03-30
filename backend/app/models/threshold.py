from sqlalchemy import Float, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Threshold(Base):
    __tablename__ = "thresholds"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    room_id: Mapped[int | None] = mapped_column(
        ForeignKey("rooms.id"), index=True, nullable=True
    )
    temperature_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    gas_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    smoke_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    offline_after_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    room: Mapped["Room | None"] = relationship()
