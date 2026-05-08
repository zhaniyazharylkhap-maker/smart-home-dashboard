"""End-to-end smoke tests for the contextual inference service.

Verifies the service produces a well-formed `InferenceResult` regardless
of whether artifacts are loaded. When artifacts are missing the service
degrades gracefully (degraded=True, is_anomaly=False, score=0); when
they are present it returns a real score in 0..100. Either contract
must be satisfied without raising.
"""

from datetime import datetime, timezone

from ml.inference import InferenceResult, contextual_inference


def _score_one() -> InferenceResult:
    return contextual_inference.score_event(
        device_id="esp32-test",
        timestamp=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
        temperature=22.0,
        humidity=50.0,
        gas=10.0,
        smoke=20.0,
        light=0.4,
        motion=False,
        occupancy_total=0.0,
        room="living_room",
        rolling=None,
    )


def test_score_event_returns_well_formed_result() -> None:
    res = _score_one()
    assert isinstance(res, InferenceResult)
    assert isinstance(res.score, float) and 0.0 <= res.score <= 100.0
    assert isinstance(res.threshold, float) and 0.0 <= res.threshold <= 100.0
    assert isinstance(res.is_anomaly, bool)
    assert isinstance(res.explanations, list)
    assert isinstance(res.model_version, str) and res.model_version
    assert isinstance(res.feature_contributions, list)


def test_score_event_is_idempotent_in_repeated_calls() -> None:
    a = _score_one()
    b = _score_one()
    # Same input, same model -> identical score within float tolerance.
    assert abs(a.score - b.score) < 1e-6
    assert a.model_version == b.model_version
