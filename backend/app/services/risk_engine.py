"""Compatibility shim re-exporting canonical risk engine APIs."""

from services.risk_engine import RiskResult, compute_risk

__all__ = ["RiskResult", "compute_risk"]
