import type { TelemetryReading } from "@/types/telemetry";

export type RoomTelemetryMode = "simulated" | "realtime";

export const ROOM_TELEMETRY_MODES_STORAGE_KEY = "sh.roomTelemetryModes.v1";

/** Primary dwelling rooms surfaced on the dashboard (matches seeded DB slugs). */
export const ROOM_SOURCE_SLUGS: readonly string[] = [
  "kitchen",
  "living_room",
  "bedroom",
];

export const DEFAULT_ROOM_TELEMETRY_MODE: RoomTelemetryMode = "simulated";

export function isSimulatedTelemetryReading(
  r: Pick<TelemetryReading, "t_sim"> | { t_sim?: number | null }
): boolean {
  return r.t_sim != null;
}

/** Load persisted modes; falls back to simulated for unknown keys. */
export function loadRoomTelemetryModes(): Record<string, RoomTelemetryMode> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ROOM_TELEMETRY_MODES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, RoomTelemetryMode> = {};
    for (const slug of ROOM_SOURCE_SLUGS) {
      const v = parsed[slug];
      out[slug] =
        v === "realtime" || v === "simulated"
          ? v
          : DEFAULT_ROOM_TELEMETRY_MODE;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRoomTelemetryModes(
  modes: Record<string, RoomTelemetryMode>
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ROOM_TELEMETRY_MODES_STORAGE_KEY,
    JSON.stringify(modes)
  );
}

export function bumpRoomTelemetryModeVersion(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("sh-room-telemetry-mode"));
}

export function readingsMatchRoomMode(
  modes: Record<string, RoomTelemetryMode>,
  reading: Pick<TelemetryReading, "room" | "t_sim">
): boolean {
  const mode = modes[reading.room] ?? DEFAULT_ROOM_TELEMETRY_MODE;
  const sim = isSimulatedTelemetryReading(reading);
  if (mode === "simulated") return sim;
  return !sim;
}

export function telemetryHistorySource(params: {
  roomFilter?: string | null;
  deviceId?: string | null;
  modes?: Record<string, RoomTelemetryMode> | null;
}): string | undefined {
  const deviceId = params.deviceId?.trim();
  const roomFilter = params.roomFilter?.trim();
  if (deviceId) return undefined;
  if (!roomFilter) return undefined;
  const modes = params.modes ?? {};
  const mode = modes[roomFilter] ?? DEFAULT_ROOM_TELEMETRY_MODE;
  return mode === "simulated" ? "simulated" : "realtime";
}
