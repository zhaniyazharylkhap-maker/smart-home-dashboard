from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    mqtt_host: str
    mqtt_port: int
    mqtt_topic: str
    interval_sec: float
    mode: str
    dataset_path: str


def load_settings() -> Settings:
    return Settings(
        mqtt_host=os.environ.get("MQTT_HOST", "localhost"),
        mqtt_port=int(os.environ.get("MQTT_PORT", "1883")),
        mqtt_topic=os.environ.get("MQTT_TOPIC", "smarthome/telemetry"),
        interval_sec=float(os.environ.get("INTERVAL_SEC", "2")),
        mode=os.environ.get("SIM_MODE", "dataset_replay"),
        dataset_path=os.environ.get(
            "DATASET_PATH", "data/iot_telemetry_data.csv"
        ),
    )
