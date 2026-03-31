import json
import logging
from typing import TYPE_CHECKING

import paho.mqtt.client as mqtt
from pydantic import ValidationError

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.schemas.telemetry import TelemetryIngest
from app.services.telemetry_service import ingest_telemetry

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def _on_message(_client: mqtt.Client, _userdata: object, msg: mqtt.MQTTMessage) -> None:
    try:
        raw = json.loads(msg.payload.decode("utf-8"))
        payload = TelemetryIngest.model_validate(raw)
    except (json.JSONDecodeError, ValidationError, UnicodeDecodeError) as e:
        logger.warning("invalid telemetry mqtt payload: %s", e)
        return

    db = SessionLocal()
    try:
        logger.info(
            "mqtt telemetry received trace_id=%s t_sim=%s",
            payload.trace_id,
            payload.t_sim,
        )
        ingest_telemetry(db, payload)
    except Exception:  # noqa: BLE001
        logger.exception("telemetry ingest failed")
        db.rollback()
    finally:
        db.close()


def start_mqtt_client() -> mqtt.Client:
    settings = get_settings()
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
        client_id="smarthome-backend",
    )
    client.on_message = _on_message

    try:
        client.connect(settings.mqtt_host, settings.mqtt_port, keepalive=60)
    except OSError as e:
        logger.error("mqtt connect failed: %s", e)
        raise

    client.subscribe(settings.mqtt_telemetry_topic, qos=1)
    client.loop_start()
    logger.info("mqtt subscribed to %s", settings.mqtt_telemetry_topic)
    return client
