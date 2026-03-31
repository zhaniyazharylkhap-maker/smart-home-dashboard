from __future__ import annotations

import json

import paho.mqtt.client as mqtt


class Publisher:
    def __init__(self, host: str, port: int, topic: str) -> None:
        self.topic = topic
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
            client_id="virtual-sensors",
        )
        self.client.connect(host, port, keepalive=60)
        self.client.loop_start()

    def publish(self, payload: dict) -> None:
        self.client.publish(self.topic, json.dumps(payload), qos=1)

    def close(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()
