from __future__ import annotations

from datetime import datetime, timezone

ROOMS = ["kitchen", "bedroom", "living_room", "bathroom", "hallway"]


def _normalize_bool(v: str | bool | int | float | None) -> bool | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().lower()
    if s in {"true", "1", "yes", "on"}:
        return True
    if s in {"false", "0", "no", "off"}:
        return False
    return None


def _to_float(v: str | None) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _epoch_to_iso(ts: str | None) -> str:
    if not ts:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        t = float(ts)
        # datasets may have ms epoch
        if t > 1e12:
            t /= 1000.0
        return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        # fallback for iso-like timestamp
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class RowMapper:
    def __init__(self, columns: list[str]) -> None:
        self.columns = [c.strip() for c in columns]
        self.col = {c.lower(): c for c in columns}
        self._room_for_device: dict[str, str] = {}
        self._device_order: list[str] = []

        self.device_col = self._pick("device_id", "device", "sensor_id", "id")
        self.temp_col = self._pick("temperature", "temp", "t")
        self.humidity_col = self._pick("humidity", "hum")
        self.light_col = self._pick("light", "luminosity", "lux")
        self.motion_col = self._pick("motion", "pir", "movement")
        self.gas_col = self._pick("gas", "lpg", "co")
        self.smoke_col = self._pick("smoke")
        self.ts_col = self._pick("timestamp", "ts", "time")

        # prefer lpg for gas if both exist
        if "lpg" in self.col:
            self.gas_col = self.col["lpg"]
        elif "co" in self.col and self.gas_col is None:
            self.gas_col = self.col["co"]

        self.temp_is_f = False

    def _pick(self, *names: str) -> str | None:
        for n in names:
            if n in self.col:
                return self.col[n]
        # loose contains match
        for c in self.columns:
            lc = c.lower()
            if any(n in lc for n in names):
                return c
        return None

    def detect_temperature_unit(self, sample_rows: list[dict[str, str]]) -> None:
        if not self.temp_col:
            self.temp_is_f = False
            return
        vals: list[float] = []
        for row in sample_rows:
            v = _to_float(row.get(self.temp_col))
            if v is not None:
                vals.append(v)
        if not vals:
            self.temp_is_f = False
            return
        avg = sum(vals) / len(vals)
        # heuristic: typical F indoor readings > 60
        self.temp_is_f = avg > 60.0

    def _device_id(self, row: dict[str, str]) -> str:
        if self.device_col:
            raw = row.get(self.device_col, "").strip()
            if raw:
                return raw
        return "sim_device_01"

    def _room_for(self, device_id: str) -> str:
        if device_id in self._room_for_device:
            return self._room_for_device[device_id]
        if device_id not in self._device_order:
            self._device_order.append(device_id)
        idx = self._device_order.index(device_id) % len(ROOMS)
        room = ROOMS[idx]
        self._room_for_device[device_id] = room
        return room

    def map_row(self, row: dict[str, str]) -> dict:
        device_id = self._device_id(row)
        room = self._room_for(device_id)

        temp = _to_float(row.get(self.temp_col)) if self.temp_col else None
        if temp is not None and self.temp_is_f:
            temp = (temp - 32.0) * 5.0 / 9.0

        humidity = _to_float(row.get(self.humidity_col)) if self.humidity_col else None
        light_raw = row.get(self.light_col) if self.light_col else None
        light_bool = _normalize_bool(light_raw)
        light = (
            float(light_bool) * 400.0
            if light_bool is not None
            else _to_float(light_raw)
        )

        motion = (
            _normalize_bool(row.get(self.motion_col))
            if self.motion_col
            else None
        )

        gas = _to_float(row.get(self.gas_col)) if self.gas_col else None
        smoke = _to_float(row.get(self.smoke_col)) if self.smoke_col else None
        ts = _epoch_to_iso(row.get(self.ts_col) if self.ts_col else None)

        return {
            "device_id": device_id,
            "room": room,
            "temperature": round(temp, 2) if temp is not None else None,
            "humidity": round(humidity, 2) if humidity is not None else None,
            "motion": motion,
            "light": round(light, 2) if light is not None else None,
            "gas": round(gas, 6) if gas is not None else None,
            "smoke": round(smoke, 6) if smoke is not None else None,
            "timestamp": ts,
        }
