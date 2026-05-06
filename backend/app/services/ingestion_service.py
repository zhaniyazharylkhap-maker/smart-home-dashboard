"""Compatibility shim re-exporting canonical ingestion service APIs."""

from services.ingestion_service import (  # noqa: F401
    complete_ingest,
    ingest_from_mqtt_dict,
    ingest_telemetry,
    telemetry_ingest_from_dict,
)
