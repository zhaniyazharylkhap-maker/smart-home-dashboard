"""Compatibility shim re-exporting canonical anomaly service APIs."""

from services.anomaly_service import anomaly_background_loop

__all__ = ["anomaly_background_loop"]
