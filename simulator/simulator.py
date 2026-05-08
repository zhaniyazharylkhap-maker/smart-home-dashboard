#!/usr/bin/env python3
"""Replay JSON sensor dataset to MQTT (smarthome/telemetry).

Why this is structured the way it is:
- The packaged JSON dataset is short (a few hundred rows). Iterating it
  once and exiting was the previous behavior; the live dashboard then
  showed stale data forever. We now loop over the dataset indefinitely
  so the system has a continuous stream for as long as the container
  runs.
- The raw JSON only carries `temperature`, `light`, `motion`. The
  contextual ML pipeline needs `humidity`, `gas`, `smoke` to produce a
  meaningful score; otherwise three of its features are dead constants.
  We synthesize those three channels with realistic per-room baselines
  plus low-frequency drift and occasional spikes -- enough to exercise
  the IF/LOF ensemble without inventing telemetry that the platform
  could not in principle observe.
- SIGTERM/SIGINT are honored so `docker compose stop` shuts down cleanly.
"""

from __future__ import annotations

import json
import math
import os
import random
import signal
import sys
import time
import uuid
from pathlib import Path

import paho.mqtt.client as mqtt

DEFAULT_TOPIC = "smarthome/telemetry"
ROOMS = ["bedroom", "kitchen", "living_room"]


_should_stop = False


def _on_signal(signum: int, _frame) -> None:  # noqa: ANN001
    global _should_stop
    _should_stop = True


def load_dataset(path: Path) -> tuple[str, list[dict]]:
    with path.open(encoding="utf-8") as f:
        root = json.load(f)
    device_id = str(root.get("device") or root.get("device_id") or "sim_device")
    rows = root.get("data") or root.get("records") or []
    if not isinstance(rows, list):
        raise ValueError("dataset must contain a list 'data' or 'records'")
    return device_id, [r for r in rows if isinstance(r, dict)]


# Per-room baselines for the synthetic channels. These approximate the
# physical reality (bathrooms humid, kitchens occasionally gassy, no
# smoke under normal conditions) without claiming to be calibrated
# sensor readings. They drive the contextual ML pipeline so its panels
# show real variation instead of flat lines.
_ROOM_BASELINES: dict[str, dict[str, float]] = {
    "bedroom": {"humidity": 48.0, "gas": 80.0, "smoke": 100.0},
    "kitchen": {"humidity": 55.0, "gas": 110.0, "smoke": 120.0},
    "living_room": {"humidity": 50.0, "gas": 90.0, "smoke": 110.0},
}


def _synth_channels(room: str, tick: int, motion: bool) -> tuple[float, float, float]:
    base = _ROOM_BASELINES.get(room, _ROOM_BASELINES["living_room"])
    # Slow sinusoidal drift to make rolling stats non-degenerate.
    phase = tick / 60.0
    humidity = base["humidity"] + 2.0 * math.sin(phase) + random.uniform(-0.4, 0.4)
    gas = base["gas"] + 5.0 * math.sin(phase / 3.0) + random.uniform(-1.0, 1.0)
    smoke = base["smoke"] + 4.0 * math.sin(phase / 4.0) + random.uniform(-0.8, 0.8)

    # Cooking signal: kitchen with motion gets a sustained gas/smoke lift.
    if room == "kitchen" and motion:
        gas += 25.0
        smoke += 15.0

    # Rare spikes (~1%) so the anomaly detector has something to flag.
    # Gas spike without motion is the canonical "contextual anomaly".
    if random.random() < 0.01:
        if room == "kitchen":
            gas += 80.0  # cooking-like spike
        else:
            gas += 60.0  # leak-like spike, especially salient w/o motion
        smoke += 20.0
    return round(humidity, 2), round(gas, 2), round(smoke, 2)


def row_to_telemetry(room: str, row: dict, tick: int) -> dict:
    t_sim = int(time.time() * 1000)
    raw_motion = row.get("motion", 0)
    motion = (
        bool(raw_motion)
        if isinstance(raw_motion, bool)
        else bool(int(raw_motion) if str(raw_motion).strip() not in ("", "None") else 0)
    )
    humidity, gas, smoke = _synth_channels(room, tick, motion)
    return {
        "device_id": f"{room}_sensor_01",
        "room": room,
        "temperature": float(row["temperature"]),
        "humidity": humidity,
        "light": float(row["light"]),
        "motion": motion,
        "gas": gas,
        "smoke": smoke,
        "t_sim": t_sim,
        "trace_id": str(uuid.uuid4()),
    }


def main() -> None:
    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)

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
    if not rows:
        print("[simulator] dataset has no rows; nothing to publish", file=sys.stderr)
        sys.exit(1)

    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION1)
    if username and password:
        client.username_pw_set(username, password)
    client.connect(host, port, keepalive=60)
    client.loop_start()
    print(
        f"[simulator] connected {host}:{port} topic={topic} rows={len(rows)} "
        f"dataset_device={device_id} rooms={ROOMS} interval_sec={interval}"
    )
    tick = 0
    try:
        # Replay the dataset in a tight loop so the dashboard always has
        # fresh telemetry; the loop only exits on SIGTERM/SIGINT.
        while not _should_stop:
            for row in rows:
                if _should_stop:
                    break
                tick += 1
                for room in ROOMS:
                    payload = row_to_telemetry(room, row, tick)
                    client.publish(topic, json.dumps(payload), qos=1)
                    print("[simulator] published", payload)
                time.sleep(max(interval, 0.05))
            print(f"[simulator] dataset loop complete (tick={tick}); replaying")
    finally:
        client.loop_stop()
        client.disconnect()
        print("[simulator] stopped cleanly")


if __name__ == "__main__":
    main()
