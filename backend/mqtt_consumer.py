"""MQTT consumer: decode payload and delegate to ingestion (no DB/alert logic here)."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

import paho.mqtt.client as mqtt
from pydantic import ValidationError

from core.config import get_settings
from core.database import SessionLocal
from services.ingestion_service import ingest_from_mqtt_dict

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def _on_message(_client: mqtt.Client, _userdata: object, msg: mqtt.MQTTMessage) -> None:
    try:
        raw = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.warning("invalid telemetry mqtt payload: %s", e)
        return

    db = SessionLocal()
    try:
        logger.info(
            "mqtt telemetry received t_sim=%s device_id=%s",
            raw.get("t_sim"),
            raw.get("device_id"),
        )
        ingest_from_mqtt_dict(db, raw)
    except (ValidationError, ValueError) as e:
        logger.warning("telemetry validation failed: %s", e)
        db.rollback()
    except Exception:  # noqa: BLE001
        logger.exception("telemetry ingest failed")
        db.rollback()
    finally:
        db.close()


def start_mqtt_client() -> mqtt.Client:
    settings = get_settings()
    if not settings.mqtt_username or not settings.mqtt_password:
        raise ValueError("MQTT_USERNAME and MQTT_PASSWORD are required")
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
        client_id="smarthome-backend",
    )
    client.username_pw_set(settings.mqtt_username, settings.mqtt_password)
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
