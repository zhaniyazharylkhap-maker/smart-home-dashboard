"""
Dataset-aware IoT simulator.

Primary mode: replay CSV rows as live telemetry.
Fallback mode: random generation (kept for future scenario overlays).
"""

from __future__ import annotations

import random
import time
import uuid
from datetime import datetime, timezone

from app.config import load_settings
from app.dataset_loader import inspect_dataset, iter_rows, locate_dataset
from app.mapper import RowMapper
from app.publisher import Publisher
from app.scenarios import apply_scenario

ROOMS = ["kitchen", "bedroom", "living_room", "bathroom", "hallway"]


def random_payload(device_id: str, room: str) -> dict:
    return {
        "device_id": device_id,
        "room": room,
        "temperature": round(random.uniform(22.0, 27.0), 2),
        "humidity": round(random.uniform(40.0, 55.0), 2),
        "motion": random.choice([True, False]),
        "light": round(random.uniform(80.0, 450.0), 2),
        "gas": round(random.uniform(0.0, 0.15), 3),
        "smoke": round(random.uniform(0.0, 0.05), 3),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def with_trace(payload: dict) -> dict:
    out = dict(payload)
    out["trace_id"] = str(uuid.uuid4())
    out["t_sim"] = int(time.time() * 1000)
    return out


def run_dataset_replay() -> None:
    s = load_settings()
    csv_path = locate_dataset(s.dataset_path)
    cols, sample = inspect_dataset(csv_path, sample_size=5)
    mapper = RowMapper(cols)
    mapper.detect_temperature_unit(sample)

    print(f"[simulator] dataset loaded: {csv_path}")
    print(f"[simulator] columns: {cols}")
    print(f"[simulator] sample rows: {sample}")
    print(
        "[simulator] mapping:",
        {
            "device_id": mapper.device_col,
            "timestamp": mapper.ts_col,
            "temperature": mapper.temp_col,
            "humidity": mapper.humidity_col,
            "light": mapper.light_col,
            "motion": mapper.motion_col,
            "gas": mapper.gas_col,
            "smoke": mapper.smoke_col,
            "temp_unit": "F->C" if mapper.temp_is_f else "C",
        },
    )

    pub = Publisher(s.mqtt_host, s.mqtt_port, s.mqtt_topic)
    try:
        for row in iter_rows(csv_path):
            payload = with_trace(apply_scenario(mapper.map_row(row), s.mode))
            pub.publish(payload)
            print(
                "[simulator] published",
                {
                    "trace_id": payload.get("trace_id"),
                    "t_sim": payload.get("t_sim"),
                    "device_id": payload.get("device_id"),
                    "room": payload.get("room"),
                },
            )
            time.sleep(s.interval_sec)
    finally:
        pub.close()


def run_random_mode() -> None:
    s = load_settings()
    pub = Publisher(s.mqtt_host, s.mqtt_port, s.mqtt_topic)
    devices = [f"sim_sensor_{i+1:02d}" for i in range(5)]
    try:
        while True:
            for idx, device_id in enumerate(devices):
                payload = with_trace(
                    random_payload(device_id, ROOMS[idx % len(ROOMS)])
                )
                pub.publish(payload)
                print(
                    "[simulator] published",
                    {
                        "trace_id": payload.get("trace_id"),
                        "t_sim": payload.get("t_sim"),
                        "device_id": payload.get("device_id"),
                        "room": payload.get("room"),
                    },
                )
            time.sleep(max(s.interval_sec, 1.0))
    finally:
        pub.close()


def main() -> None:
    s = load_settings()
    if s.mode == "random":
        run_random_mode()
    else:
        run_dataset_replay()


if __name__ == "__main__":
    main()
