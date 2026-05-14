#pragma once

// Copy this file to secrets.h (done automatically on first PlatformIO build) and edit.

#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Mac/PC running Docker MQTT (not "localhost" — LAN IP of that machine).
#define MQTT_HOST "10.202.22.160"
#define MQTT_PORT 1883
#define MQTT_USER "smarthome"
#define MQTT_PASS "smarthome"
#define MQTT_TOPIC "smarthome/telemetry"

#define DEVICE_ID "esp32_commission_01"
#define ROOM "kitchen"

// Wiring (change if your board differs)
#define PIN_LIGHT_ADC 34   // ADC1, input-only — photoresistor divider → analog
#define PIN_MOTION 27      // PIR often active-low; INPUT_PULLUP, LOW = motion

#define PUBLISH_INTERVAL_MS 1500
