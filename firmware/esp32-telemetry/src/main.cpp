/**
 * ESP32 telemetry publisher for smart-home-dashboard.
 *
 * - Reads photoresistor-style analog on PIN_LIGHT_ADC → "light" (lux-ish scale).
 * - Reads motion on PIN_MOTION (INPUT_PULLUP, LOW = motion).
 * - Publishes JSON to MQTT_TOPIC so the backend ingests in real time.
 *
 * Configure WiFi/MQTT in include/secrets.h (created from secrets.example.h on first build).
 */

#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoJson.h>

// Must be defined before PubSubClient.h (default 128 is too small for JSON)
#define MQTT_MAX_PACKET_SIZE 512
#include <PubSubClient.h>

#include "secrets.h"

#ifndef PIN_LIGHT_ADC
#define PIN_LIGHT_ADC 34
#endif
#ifndef PIN_MOTION
#define PIN_MOTION 27
#endif
#ifndef PUBLISH_INTERVAL_MS
#define PUBLISH_INTERVAL_MS 1500
#endif

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

unsigned long lastPublish = 0;

static void setupPins() {
  pinMode(PIN_MOTION, INPUT_PULLUP);
  // PIN_LIGHT_ADC is input-only on many ESP32 modules; no pinMode required
}

static float readLightLux() {
  int raw = analogRead(PIN_LIGHT_ADC);
  if (raw < 0) {
    raw = 0;
  }
  // Map 0..4095 (typical 12-bit) to 0..1200 lux — demo scale, tune for your divider
  return (static_cast<float>(raw) / 4095.0f) * 1200.0f;
}

static bool readMotion() {
  return digitalRead(PIN_MOTION) == LOW;
}

static void reconnectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint8_t tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 60) {
    delay(500);
    tries++;
  }
}

static void reconnectMqtt() {
  if (mqtt.connected()) {
    return;
  }
  String clientId = String("esp32-") + String((uint32_t)ESP.getEfuseMac(), HEX);
  mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  setupPins();
  reconnectWifi();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  reconnectMqtt();
}

void loop() {
  reconnectWifi();
  if (WiFi.status() != WL_CONNECTED) {
    delay(2000);
    return;
  }

  if (!mqtt.connected()) {
    reconnectMqtt();
    delay(500);
    return;
  }
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastPublish < static_cast<unsigned long>(PUBLISH_INTERVAL_MS)) {
    delay(10);
    return;
  }
  lastPublish = now;

  JsonDocument doc(384);
  doc["device_id"] = DEVICE_ID;
  doc["room"] = ROOM;
  doc["light"] = readLightLux();
  doc["motion"] = readMotion();
  // Optional channels — omit if you have no sensors (backend tolerates nulls)
  // doc["temperature"] = 22.5f;
  // doc["humidity"] = 45.0f;

  char payload[MQTT_MAX_PACKET_SIZE];
  const size_t n = serializeJson(doc, payload, sizeof(payload));
  if (n == 0 || n >= sizeof(payload)) {
    Serial.println("JSON too large");
    return;
  }

  if (mqtt.publish(MQTT_TOPIC, reinterpret_cast<const uint8_t*>(payload), n, false)) {
    Serial.printf("Published %u bytes to %s\n", static_cast<unsigned>(n), MQTT_TOPIC);
  } else {
    Serial.println("MQTT publish failed");
  }
}
