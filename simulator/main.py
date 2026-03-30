"""
Virtual IoT sensor network: publishes unified telemetry to MQTT on an interval.
"""

from __future__ import annotations

import json
import os
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import paho.mqtt.client as mqtt


@dataclass(frozen=True)
class DeviceSpec:
    device_id: str
    room: str


DEVICES: list[DeviceSpec] = [
    DeviceSpec("kitchen_sensor_01", "kitchen"),
    DeviceSpec("bedroom_sensor_01", "bedroom"),
    DeviceSpec("living_sensor_01", "living_room"),
    DeviceSpec("bathroom_sensor_01", "bathroom"),
    DeviceSpec("hallway_sensor_01", "hallway"),
]


def normal_payload(spec: DeviceSpec) -> dict:
    return {
        "device_id": spec.device_id,
        "room": spec.room,
        "temperature": round(random.uniform(22.0, 27.0), 2),
        "humidity": round(random.uniform(40.0, 55.0), 2),
        "motion": random.choice([True, False]),
        "light": round(random.uniform(80.0, 450.0), 2),
        "gas": round(random.uniform(0.0, 0.15), 3),
        "smoke": round(random.uniform(0.0, 0.05), 3),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def main() -> None:
    host = os.environ.get("MQTT_HOST", "localhost")
    port = int(os.environ.get("MQTT_PORT", "1883"))
    topic = os.environ.get("MQTT_TOPIC", "smarthome/telemetry")
    interval = float(os.environ.get("INTERVAL_SEC", "3"))

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
        client_id="virtual-sensors",
    )
    client.connect(host, port, keepalive=60)
    client.loop_start()

    try:
        while True:
            for spec in DEVICES:
                payload = normal_payload(spec)
                client.publish(topic, json.dumps(payload), qos=1)
            time.sleep(interval)
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
