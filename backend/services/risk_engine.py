from __future__ import annotations

from dataclasses import dataclass


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


@dataclass(frozen=True)
class RiskResult:
    risk_score: float
    risk_level: str
    alert_reasons: list[str]


def _norm_temperature(temp: float | None) -> float:
    if temp is None:
        return 0.0
    # indoor baseline ~24C; high-risk around >=35C
    return _clamp(((temp - 24.0) / 11.0) * 100.0)


def _norm_smoke(smoke: float | None) -> float:
    if smoke is None:
        return 0.0
    # default backend critical threshold ~0.25
    return _clamp((smoke / 0.25) * 100.0)


def _norm_gas(gas: float | None) -> float:
    if gas is None:
        return 0.0
    # default backend critical threshold ~0.5
    return _clamp((gas / 0.5) * 100.0)


def _motion_factor(motion: bool | None) -> float:
    if motion is True:
        return 100.0
    return 0.0


def compute_risk(
    *,
    temperature: float | None,
    smoke: float | None,
    gas: float | None,
    motion: bool | None,
) -> RiskResult:
    # Weighted multi-sensor fusion (deterministic and explainable)
    t = _norm_temperature(temperature)
    s = _norm_smoke(smoke)
    g = _norm_gas(gas)
    m = _motion_factor(motion)
    score = _clamp(0.25 * t + 0.35 * s + 0.30 * g + 0.10 * m)

    if score >= 70:
        level = "CRITICAL"
    elif score >= 30:
        level = "WARNING"
    else:
        level = "SAFE"

    reasons: list[str] = []
    if smoke is not None and s >= 60:
        reasons.append("Smoke level exceeded safe threshold")
    if gas is not None and g >= 60:
        reasons.append("Gas concentration is above normal range")
    if temperature is not None and t >= 55:
        reasons.append("Temperature is above normal room range")
    if motion is True and score >= 30:
        reasons.append("Motion detected during elevated risk state")
    if len(reasons) >= 2:
        reasons.append("Multiple sensor indicators suggest unsafe conditions")

    if not reasons and level == "WARNING":
        reasons.append("Combined sensor values indicate caution")
    if not reasons and level == "CRITICAL":
        reasons.append("Combined sensor values indicate critical risk")

    return RiskResult(
        risk_score=round(score, 2),
        risk_level=level,
        alert_reasons=reasons,
    )
