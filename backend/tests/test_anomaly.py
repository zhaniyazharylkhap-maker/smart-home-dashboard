"""Smoke test for the anomaly background loop.

The previous test exercised an in-process scoring helper that has been
replaced by the contextual inference path. We now verify the public
loop wrapper exists and can be invoked once without raising even when
no artifacts are present (graceful degradation is the contract).
"""

from services.anomaly_service import _run_anomaly_iteration


def test_run_anomaly_iteration_does_not_raise_without_artifacts() -> None:
    # Should silently no-op when storage is empty / artifacts missing.
    _run_anomaly_iteration()
