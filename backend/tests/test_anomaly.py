from datetime import datetime, timezone

import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models import Device, Room, Telemetry
from services.anomaly_service import _detect_device_anomaly


class _IdentityScaler:
    def transform(self, X: np.ndarray) -> np.ndarray:
        return X


class _SimpleModel:
    def predict(self, X: np.ndarray) -> np.ndarray:
        return np.full((len(X),), -1, dtype=int)

    def decision_function(self, X: np.ndarray) -> np.ndarray:
        return np.full((len(X),), -0.5, dtype=float)


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return factory()


def test_anomaly_detection_returns_boolean_and_score() -> None:
    db = _build_session()
    room = Room(name="living_room", type="living")
    db.add(room)
    db.flush()
    device = Device(
        device_id="esp32-1",
        name="esp32-1",
        room_id=room.id,
        device_type="multi_sensor",
        status="online",
    )
    db.add(device)
    db.flush()

    now = datetime.now(timezone.utc)
    db.add(
        Telemetry(
            device_id=device.id,
            room_id=room.id,
            temperature=26.0,
            humidity=44.0,
            motion=True,
            light=100.0,
            gas=0.2,
            smoke=0.1,
            timestamp=now,
            received_at=now,
            trace_id="test-trace-id",
        )
    )
    db.commit()

    anomaly, score = _detect_device_anomaly(db, device, _SimpleModel(), _IdentityScaler())
    assert isinstance(anomaly, bool)
    assert isinstance(score, float)
