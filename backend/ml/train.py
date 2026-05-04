"""Offline training: load telemetry from DB, train IsolationForest, save ml/model.pkl."""

from __future__ import annotations

import os
import pickle
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import select

from app.models import Telemetry
from core.config import get_settings
from core.database import SessionLocal
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler


def _features(rows: list[Telemetry]) -> np.ndarray:
    X: list[list[float]] = []
    for t in rows:
        X.append(
            [
                float(t.temperature or 0.0),
                float(t.humidity or 0.0),
                1.0 if t.motion else 0.0,
                float(t.light or 0.0),
            ]
        )
    return np.asarray(X, dtype=np.float64)


def main() -> None:
    days = int(os.environ.get("TRAIN_LOOKBACK_DAYS", "14"))
    if days < 7:
        days = 7
    if days > 30:
        days = 30
    since = datetime.now(timezone.utc) - timedelta(days=days)
    db = SessionLocal()
    try:
        q = select(Telemetry).where(Telemetry.timestamp >= since).limit(500_000)
        rows = list(db.execute(q).scalars().all())
    finally:
        db.close()
    if len(rows) < 50:
        raise SystemExit(f"need at least 50 telemetry rows in last {days} days, got {len(rows)}")
    X = _features(rows)
    scaler = RobustScaler()
    Xs = scaler.fit_transform(X)
    clf = IsolationForest(
        n_estimators=200,
        contamination=0.02,
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(Xs)
    base = Path(__file__).resolve().parent
    out = Path(get_settings().ml_model_path)
    path = out if out.is_absolute() else base / out.name
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        pickle.dump({"scaler": scaler, "clf": clf}, f)
    print(f"saved model to {path} rows={len(rows)}")


if __name__ == "__main__":
    main()
