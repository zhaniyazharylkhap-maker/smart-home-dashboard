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
  plus low-frequency drift, exponential smoothing and rare spikes --
  enough to exercise the IF/LOF ensemble without inventing telemetry
  that the platform could not in principle observe.
- Per-room phase offsets (both in time and in the dataset cursor) keep
  the three rooms desynchronized so motion/light flips don't all fire on
  the same tick. The previous lockstep behavior caused the dashboard to
  flap rapidly between safe/warning/anomaly states across all rooms at
  once.
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


# State for per-room exponential smoothing of synthetic channels and a
# per-room spike cooldown so a single rare spike doesn't immediately
# trigger another one. EMA keeps inter-tick deltas modest, which in
# turn keeps the contextual ML score from oscillating across the
# adaptive threshold every second.
_smoothed: dict[str, dict[str, float]] = {}
_last_spike_tick: dict[str, int] = {}
_SPIKE_COOLDOWN_TICKS = 60  # at INTERVAL_SEC=2 this is ~2 minutes


def _ema(prev: float, target: float, alpha: float) -> float:
    return prev + (target - prev) * alpha


def _synth_channels(
    room: str,
    tick: int,
    motion: bool,
    spike_probability: float,
) -> tuple[float, float, float]:
    base = _ROOM_BASELINES.get(room, _ROOM_BASELINES["living_room"])
    # Per-room phase so the three rooms drift at different rates. The
    # previous code shared the same `tick` for all rooms, which meant
    # every channel hit its peak in lockstep across the home.
    room_phase = {"bedroom": 0.0, "kitchen": 1.7, "living_room": 3.3}.get(room, 0.0)
    phase = tick / 60.0 + room_phase
    target_humidity = base["humidity"] + 2.0 * math.sin(phase) + random.uniform(-0.3, 0.3)
    target_gas = base["gas"] + 4.0 * math.sin(phase / 3.0) + random.uniform(-0.6, 0.6)
    target_smoke = base["smoke"] + 3.0 * math.sin(phase / 4.0) + random.uniform(-0.4, 0.4)

    # Cooking signal: kitchen with motion gets a sustained gas/smoke lift,
    # but the lift is gradual (applied to the EMA target) so the value
    # ramps in over a few ticks rather than jumping by +25 in one step.
    if room == "kitchen" and motion:
        target_gas += 18.0
        target_smoke += 10.0

    # Rare spikes so the anomaly detector has something to flag, but
    # rate-limited per room so we don't fire one every other tick.
    last_spike = _last_spike_tick.get(room, -10_000)
    if (
        random.random() < spike_probability
        and tick - last_spike >= _SPIKE_COOLDOWN_TICKS
    ):
        if room == "kitchen":
            target_gas += 60.0  # cooking-like spike
        else:
            target_gas += 45.0  # leak-like spike, especially salient w/o motion
        target_smoke += 12.0
        _last_spike_tick[room] = tick

    state = _smoothed.setdefault(
        room,
        {
            "humidity": base["humidity"],
            "gas": base["gas"],
            "smoke": base["smoke"],
        },
    )
    # Alphas chosen so a step change reaches ~95% of target after ~10
    # ticks (~20 seconds at INTERVAL_SEC=2). Smoke/humidity are slower
    # processes physically, so they smooth a little harder than gas.
    state["humidity"] = _ema(state["humidity"], target_humidity, 0.18)
    state["gas"] = _ema(state["gas"], target_gas, 0.25)
    state["smoke"] = _ema(state["smoke"], target_smoke, 0.18)
    return (
        round(state["humidity"], 2),
        round(state["gas"], 2),
        round(state["smoke"], 2),
    )


def row_to_telemetry(
    room: str,
    row: dict,
    tick: int,
    spike_probability: float,
) -> dict:
    t_sim = int(time.time() * 1000)
    raw_motion = row.get("motion", 0)
    motion = (
        bool(raw_motion)
        if isinstance(raw_motion, bool)
        else bool(int(raw_motion) if str(raw_motion).strip() not in ("", "None") else 0)
    )
    humidity, gas, smoke = _synth_channels(room, tick, motion, spike_probability)
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
    # Slower default keeps the dashboard from flapping between
    # safe/warning/anomaly states every second. Operators can still
    # tighten or loosen via the env knob.
    interval = float(os.environ.get("INTERVAL_SEC", "2"))
    spike_probability = float(os.environ.get("SPIKE_PROBABILITY", "0.003"))
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
        f"dataset_device={device_id} rooms={ROOMS} interval_sec={interval} "
        f"spike_probability={spike_probability}"
    )
    # Per-room dataset cursor offsets so the rooms walk through the
    # short dataset at different starting positions (one third apart),
    # which keeps motion/light from flipping in lockstep.
    n = len(rows)
    cursors: dict[str, int] = {
        "bedroom": 0,
        "kitchen": n // 3,
        "living_room": (2 * n) // 3,
    }
    # Stagger the publish slot of each room within a single interval so
    # we don't bunch all three into the same millisecond.
    room_stagger = {
        "bedroom": 0.0,
        "kitchen": max(0.05, interval / 3.0),
        "living_room": max(0.10, (2 * interval) / 3.0),
    }
    tick = 0
    try:
        while not _should_stop:
            tick += 1
            cycle_start = time.monotonic()
            for room in ROOMS:
                if _should_stop:
                    break
                pause = room_stagger.get(room, 0.0)
                if pause > 0:
                    time.sleep(pause)
                row = rows[cursors[room] % n]
                cursors[room] += 1
                payload = row_to_telemetry(room, row, tick, spike_probability)
                client.publish(topic, json.dumps(payload), qos=1)
                print("[simulator] published", payload)
            # Pace the loop so the *whole* cycle takes roughly `interval`
            # seconds, including the per-room stagger above.
            elapsed = time.monotonic() - cycle_start
            sleep_for = max(interval - elapsed, 0.05)
            time.sleep(sleep_for)
    finally:
        client.loop_stop()
        client.disconnect()
        print("[simulator] stopped cleanly")


if __name__ == "__main__":
    main()
