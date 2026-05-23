"""Fast checks for thesis metrics helpers."""

from __future__ import annotations

from pathlib import Path

from ml.thesis_metrics import evaluate_live_injection_csv


def test_live_csv_replay_returns_metrics():
    csv_path = (
        Path(__file__).resolve().parents[2]
        / "docs/thesis/anomaly_series_kitchen_sensor_01_live.csv"
    )
    if not csv_path.exists():
        return
    report = evaluate_live_injection_csv(csv_path)
    assert "metrics" in report
    m = report["metrics"]
    assert 0.0 <= m["f1"] <= 1.0
    assert m["recall"] >= 0.9
