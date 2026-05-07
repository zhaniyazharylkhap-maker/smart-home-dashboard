#!/usr/bin/env python3
"""Replay JSON sensor dataset to MQTT (smarthome/telemetry), one message per second."""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import paho.mqtt.client as mqtt

DEFAULT_TOPIC = "smarthome/telemetry"
ROOMS = ["bedroom", "kitchen", "living_room"]


def load_dataset(path: Path) -> tuple[str, list[dict]]:
    with path.open(encoding="utf-8") as f:
        root = json.load(f)
    device_id = str(root.get("device") or root.get("device_id") or "sim_device")
    rows = root.get("data") or root.get("records") or []
    if not isinstance(rows, list):
        raise ValueError("dataset must contain a list 'data' or 'records'")
    return device_id, [r for r in rows if isinstance(r, dict)]


def row_to_telemetry(room: str, row: dict) -> dict:
    t_sim = int(time.time() * 1000)
    motion = int(row.get("motion", 0))
    if motion not in (0, 1):
        motion = 1 if motion else 0
    return {
        "device_id": f"{room}_sensor_01",
        "room": room,
        "temperature": float(row["temperature"]),
        "humidity": None,
        "light": float(row["light"]),
        "motion": bool(motion),
        "gas": 0.0,
        "smoke": 0.0,
        "t_sim": t_sim,
    }


def main() -> None:
    host = os.environ.get("MQTT_HOST", "localhost")
    port = int(os.environ.get("MQTT_PORT", "1883"))
    username = os.environ.get("MQTT_USERNAME")
    password = os.environ.get("MQTT_PASSWORD")
    topic = os.environ.get("MQTT_TOPIC", DEFAULT_TOPIC)
    interval = float(os.environ.get("INTERVAL_SEC", "1"))
    raw_path = os.environ.get(
        "JSON_DATASET_PATH",
        os.environ.get("DATASET_JSON", "data/sensors_dataset.json"),
    )
    path = Path(raw_path)
    if not path.is_file():
        print(f"[simulator] dataset not found: {path.resolve()}", file=sys.stderr)
        sys.exit(1)

    device_id, rows = load_dataset(path)
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION1)
    if username and password:
        client.username_pw_set(username, password)
    client.connect(host, port, keepalive=60)
    client.loop_start()
    print(
        f"[simulator] connected {host}:{port} topic={topic} rows={len(rows)} "
        f"dataset_device={device_id} rooms={ROOMS}"
    )
    try:
        for row in rows:
            for room in ROOMS:
                payload = row_to_telemetry(room, row)
                client.publish(topic, json.dumps(payload), qos=1)
                print("[simulator] published", payload)
            time.sleep(max(interval, 0.05))
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
