/**
 * ESP32 Smart Home Telemetry Publisher
 * Realtime MQTT telemetry for smart-home-dashboard
 */

#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>

#include "secrets.h"

// =========================
// MQTT
// =========================

#define MQTT_MAX_PACKET_SIZE 512

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// =========================
// AHT10
// =========================

Adafruit_AHTX0 aht;

// =========================
// VARIABLES
// =========================

unsigned long lastPublish = 0;

// =========================
// SETUP PINS
// =========================

static void setupPins() {

  pinMode(PIN_MOTION, INPUT);

  pinMode(PIN_LED, OUTPUT);

}

// =========================
// LIGHT SENSOR
// =========================

static float readLightLux() {

  int raw = analogRead(PIN_LIGHT_ADC);

  // Convert ADC to voltage
  float voltage = raw * (3.3 / 4095.0);

  // Approximate lux conversion for TEMT6000
  float lux = voltage * 500.0;

  if (lux < 0) {
    lux = 0;
  }

  return lux;
}

// =========================
// MOTION SENSOR
// =========================

static bool readMotion() {

  return digitalRead(PIN_MOTION) == HIGH;

}

// =========================
// GAS SENSOR
// =========================

static int readGas() {

  return analogRead(PIN_GAS_ADC);

}

// =========================
// WIFI
// =========================

static void reconnectWifi() {

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println("Connecting to WiFi...");

  WiFi.mode(WIFI_STA);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint8_t tries = 0;

  while (WiFi.status() != WL_CONNECTED && tries < 60) {

    delay(500);

    tries++;

  }

  if (WiFi.status() == WL_CONNECTED) {

    Serial.print("WiFi connected, IP: ");

    Serial.println(WiFi.localIP());

  } else {

    Serial.println("WiFi connection timeout");

  }
}

// =========================
// MQTT
// =========================

static void reconnectMqtt() {

  if (mqtt.connected()) {
    return;
  }

  Serial.println("Connecting to MQTT...");

  char clientId[32];

  snprintf(clientId, sizeof(clientId), "esp32-client");

  if (mqtt.connect(clientId, MQTT_USER, MQTT_PASS)) {

    Serial.println("MQTT connected");

  } else {

    Serial.print("MQTT failed, rc=");

    Serial.print(mqtt.state());

    Serial.print(" -> broker ");

    Serial.print(MQTT_HOST);

    Serial.print(":");

    Serial.print(MQTT_PORT);

    Serial.print(" | ESP IP ");

    Serial.println(WiFi.localIP());

    Serial.println(
      "rc=-2: no TCP to broker. Check MQTT_HOST=Mac LAN IP (ipconfig getifaddr en0), "
      "docker mqtt up, same WiFi, then Upload firmware after editing secrets.h."
    );

  }
}

// =========================
// SETUP
// =========================

void setup() {

  Serial.begin(115200);

  delay(500);

  setupPins();

  // AHT10
  Wire.begin(PIN_SDA, PIN_SCL);

  if (!aht.begin()) {

    Serial.println("AHT10 not detected");

  } else {

    Serial.println("AHT10 connected");

  }

  // WiFi
  reconnectWifi();

  // MQTT
  mqtt.setServer(MQTT_HOST, MQTT_PORT);

  reconnectMqtt();

  Serial.println("Smart Home Telemetry Started");
}

// =========================
// LOOP
// =========================

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

  if (now - lastPublish < PUBLISH_INTERVAL_MS) {

    delay(10);

    return;
  }

  lastPublish = now;

  // =========================
  // READ SENSORS
  // =========================

  float light = readLightLux();

  bool motion = readMotion();

  int gas = readGas();

  sensors_event_t humidity, temp;

  aht.getEvent(&humidity, &temp);

  // =========================
  // LED ALERT
  // =========================

  if (gas > 1500) {

    digitalWrite(PIN_LED, HIGH);

  } else {

    digitalWrite(PIN_LED, LOW);

  }

  // =========================
  // JSON
  // =========================

  StaticJsonDocument<512> doc;

  doc["device_id"] = DEVICE_ID;

  doc["room"] = ROOM;

  doc["temperature"] = temp.temperature;

  doc["humidity"] = humidity.relative_humidity;

  doc["light"] = light;

  doc["gas"] = gas;

  doc["motion"] = motion;

  doc["ts"] = now;

  char payload[MQTT_MAX_PACKET_SIZE];

  size_t n = serializeJson(doc, payload);

  // =========================
  // MQTT PUBLISH
  // =========================

  if (mqtt.publish(MQTT_TOPIC, payload)) {

    Serial.println("Telemetry published");

    Serial.println(payload);

  } else {

    Serial.println("MQTT publish failed");

  }
}