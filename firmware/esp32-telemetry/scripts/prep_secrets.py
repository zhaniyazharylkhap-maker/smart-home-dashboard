"""Create include/secrets.h from secrets.example.h on first build (local file; gitignored)."""

from pathlib import Path

Import("env")  # noqa: F821

root = Path(env["PROJECT_DIR"])
dst = root / "include" / "secrets.h"
src = root / "include" / "secrets.example.h"
if not dst.exists() and src.exists():
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    print("Created include/secrets.h from secrets.example.h — set WIFI_SSID / WIFI_PASSWORD / MQTT_HOST.")
