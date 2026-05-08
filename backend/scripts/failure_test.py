"""Failure-injection experiment: MQTT broker outage and recovery.

Validates pipeline resilience against broker downtime. Required for the
distributed-systems chapter of the thesis.

What this script does
---------------------
1. Subscribes a counter MQTT client to the telemetry topic.
2. Records the message rate during a BASELINE window.
3. Stops the `mqtt` Docker container for an OUTAGE window.
4. Restarts the broker.
5. Records the message rate during a RECOVERY window, including the time
   between broker restart and first message received post-recovery.
6. Prints a result table suitable to copy into the thesis.

Resilience hypothesis being tested
----------------------------------
* MQTT QoS=1 + paho client outbound queueing on the simulator side
  (`client.loop_start()`) preserves messages while the broker is down.
* Mosquitto with `persistence true` retains in-flight messages.
* The backend re-subscribes automatically on broker reconnect (paho's
  built-in reconnect logic in `loop_start()`).

Usage
-----
    # From the repo root, with the docker stack already running:
    python backend/scripts/failure_test.py
    python backend/scripts/failure_test.py --outage 60 --baseline 30 --recovery 60

Required environment (defaults shown):
    MQTT_HOST=localhost
    MQTT_PORT=1883
    MQTT_USERNAME=smarthome
    MQTT_PASSWORD=smarthome
    MQTT_TOPIC=smarthome/telemetry
    MQTT_CONTAINER=docker-mqtt-1   # or the actual container name

Output
------
JSON to stdout. Suitable for `> failure_test_<date>.json` and direct
inclusion as a thesis appendix.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import paho.mqtt.client as mqtt


@dataclass
class CounterState:
    received: int = 0
    last_received_at: float | None = None
    timestamps: list[float] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)


def _on_message_factory(state: CounterState):
    def _on_message(_client, _userdata, _msg):
        now = time.time()
        with state.lock:
            state.received += 1
            state.last_received_at = now
            state.timestamps.append(now)
    return _on_message


def _make_client(state: CounterState, host: str, port: int, username: str, password: str, topic: str) -> mqtt.Client:
    # Use a unique client_id so this counter does not collide with the
    # backend's MQTT consumer in the same broker.
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
        client_id=f"failure_test_counter_{os.getpid()}",
    )
    if username and password:
        client.username_pw_set(username, password)
    client.on_message = _on_message_factory(state)

    def _on_connect(_c, _u, _f, rc):
        if rc == 0:
            print(f"[counter] connected to {host}:{port}, subscribing topic={topic}")
            client.subscribe(topic, qos=1)
        else:
            print(f"[counter] connect failed rc={rc}")

    client.on_connect = _on_connect
    client.connect_async(host, port, keepalive=30)
    client.loop_start()
    return client


def _docker_compose(args: list[str], cwd: str) -> tuple[int, str]:
    """Run `docker compose ...` in cwd, returning (exit_code, combined_output)."""
    cmd = ["docker", "compose", *args]
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    out = (res.stdout or "") + (res.stderr or "")
    return res.returncode, out.strip()


def _count_in_window(state: CounterState, since: float, until: float) -> int:
    with state.lock:
        return sum(1 for t in state.timestamps if since <= t < until)


def _wait_first_after(state: CounterState, after: float, deadline: float) -> float | None:
    """Block until the first message with timestamp > after, or until deadline."""
    while time.time() < deadline:
        with state.lock:
            for t in state.timestamps:
                if t > after:
                    return t
        time.sleep(0.2)
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="MQTT failure-injection experiment.")
    parser.add_argument("--baseline", type=float, default=30.0,
                        help="Baseline measurement window in seconds (default 30).")
    parser.add_argument("--outage", type=float, default=30.0,
                        help="Broker downtime in seconds (default 30).")
    parser.add_argument("--recovery", type=float, default=60.0,
                        help="Recovery measurement window in seconds (default 60).")
    parser.add_argument("--compose-cwd", default="docker",
                        help="Directory containing docker-compose.yml (default 'docker').")
    parser.add_argument("--service", default="mqtt",
                        help="Compose service name to stop/start (default 'mqtt').")
    args = parser.parse_args()

    host = os.environ.get("MQTT_HOST", "localhost")
    port = int(os.environ.get("MQTT_PORT", "1883"))
    topic = os.environ.get("MQTT_TOPIC", "smarthome/telemetry")
    username = os.environ.get("MQTT_USERNAME", "smarthome")
    password = os.environ.get("MQTT_PASSWORD", "smarthome")

    state = CounterState()
    client = _make_client(state, host, port, username, password, topic)

    # Wait briefly for the initial subscription to settle.
    time.sleep(2.0)

    t0 = time.time()
    print(f"[exp] baseline window: {args.baseline:.0f}s")
    time.sleep(args.baseline)
    t_baseline_end = time.time()
    baseline_count = _count_in_window(state, t0, t_baseline_end)
    baseline_rate = baseline_count / args.baseline if args.baseline > 0 else 0.0
    print(f"[exp] baseline messages={baseline_count} rate={baseline_rate:.2f} msg/s")

    print(f"[exp] stopping service '{args.service}' for {args.outage:.0f}s")
    rc, out = _docker_compose(["stop", args.service], cwd=args.compose_cwd)
    if rc != 0:
        print(f"[exp] FAILED to stop broker: {out}", file=sys.stderr)
        client.loop_stop()
        client.disconnect()
        return 2
    t_outage_start = time.time()
    time.sleep(args.outage)
    t_outage_end = time.time()
    outage_count = _count_in_window(state, t_outage_start, t_outage_end)
    print(f"[exp] outage messages received during downtime={outage_count} (expected: 0)")

    print(f"[exp] starting service '{args.service}'")
    rc, out = _docker_compose(["start", args.service], cwd=args.compose_cwd)
    if rc != 0:
        print(f"[exp] FAILED to start broker: {out}", file=sys.stderr)
        client.loop_stop()
        client.disconnect()
        return 3
    t_restart = time.time()

    # Recovery time = time from broker `start` returning until the first
    # message arrives at the counter post-restart. This includes broker
    # warmup, paho reconnect backoff on both counter and simulator, and
    # the broker's first message dispatch.
    deadline = t_restart + args.recovery
    first_after_restart = _wait_first_after(state, t_restart, deadline)
    recovery_seconds = (
        (first_after_restart - t_restart) if first_after_restart is not None else None
    )

    # Continue measuring throughput after first message until window ends.
    if first_after_restart is not None:
        remaining = max(0.0, deadline - time.time())
        time.sleep(remaining)
    t_recovery_end = time.time()

    recovery_window_start = first_after_restart or t_restart
    recovery_count = _count_in_window(state, recovery_window_start, t_recovery_end)
    recovery_window_seconds = max(1e-6, t_recovery_end - recovery_window_start)
    recovery_rate = recovery_count / recovery_window_seconds

    expected_during_outage_at_baseline_rate = baseline_rate * args.outage
    # Loss is conservatively defined as: messages we *expected* to see during
    # the outage at the baseline rate, minus messages received in the recovery
    # window beyond the post-recovery baseline rate (i.e., the queued backlog
    # the broker/clients flushed after reconnect). With QoS=1 + persistence,
    # the simulator's outbound queue and the broker's persistence should
    # deliver these once both reconnect; loss should be near zero.
    queued_replay = max(0.0, recovery_count - recovery_rate * recovery_window_seconds)
    loss_estimate = max(
        0.0, expected_during_outage_at_baseline_rate - queued_replay - outage_count
    )
    loss_pct = (
        100.0 * loss_estimate / expected_during_outage_at_baseline_rate
        if expected_during_outage_at_baseline_rate > 0 else 0.0
    )

    summary: dict[str, Any] = {
        "started_at_utc": datetime.fromtimestamp(t0, timezone.utc).isoformat(),
        "broker": f"{host}:{port}",
        "topic": topic,
        "windows_seconds": {
            "baseline": args.baseline,
            "outage": args.outage,
            "recovery": args.recovery,
        },
        "baseline": {
            "messages": baseline_count,
            "rate_msg_per_sec": round(baseline_rate, 3),
        },
        "outage": {
            "messages_received_during_downtime": outage_count,
        },
        "recovery": {
            "recovery_seconds": (
                round(recovery_seconds, 3) if recovery_seconds is not None else None
            ),
            "messages_after_restart": recovery_count,
            "rate_msg_per_sec": round(recovery_rate, 3),
        },
        "estimated_loss": {
            "expected_at_baseline_rate": round(expected_during_outage_at_baseline_rate, 3),
            "queued_replay_estimate": round(queued_replay, 3),
            "absolute_loss_estimate": round(loss_estimate, 3),
            "loss_pct": round(loss_pct, 3),
        },
    }
    print()
    print("=== FAILURE INJECTION RESULT ===")
    print(json.dumps(summary, indent=2))
    if recovery_seconds is None:
        print(
            f"[exp] WARNING: no message arrived within {args.recovery:.0f}s after restart;"
            " inspect broker and backend logs.",
            file=sys.stderr,
        )

    client.loop_stop()
    client.disconnect()
    return 0


if __name__ == "__main__":
    sys.exit(main())
