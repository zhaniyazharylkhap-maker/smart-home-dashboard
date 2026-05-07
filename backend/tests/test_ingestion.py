from datetime import datetime, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models import Telemetry
from app.schemas.telemetry import TelemetryIngest
from services.ingestion_service import ingest_telemetry


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return factory()


def test_ingestion_is_idempotent_for_duplicate_payload(monkeypatch) -> None:
    db = _build_session()
    monkeypatch.setattr("services.ingestion_service.publish", lambda *_args, **_kwargs: None)

    payload = TelemetryIngest(
        device_id="esp32-1",
        room="living_room",
        temperature=24.0,
        humidity=45.0,
        motion=False,
        light=300.0,
        gas=0.1,
        smoke=0.05,
        timestamp=datetime(2026, 5, 6, 12, 0, tzinfo=timezone.utc),
    )

    first = ingest_telemetry(db, payload)
    second = ingest_telemetry(db, payload)

    rows = db.execute(select(Telemetry)).scalars().all()
    assert len(rows) == 1
    assert first.id == second.id
    assert rows[0].trace_id is not None
