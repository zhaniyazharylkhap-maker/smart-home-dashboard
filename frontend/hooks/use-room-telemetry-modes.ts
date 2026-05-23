"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ROOM_SOURCE_SLUGS,
  type RoomTelemetryMode,
  bumpRoomTelemetryModeVersion,
  loadRoomTelemetryModes,
  saveRoomTelemetryModes,
  DEFAULT_ROOM_TELEMETRY_MODE,
  ROOM_TELEMETRY_MODES_STORAGE_KEY,
} from "@/lib/room-telemetry-mode";
import { humanizeRoom } from "@/lib/explanations";

export function useRoomTelemetryModes() {
  const [modes, setModes] = useState<Record<string, RoomTelemetryMode>>(() =>
    normalizeModes(loadRoomTelemetryModes())
  );

  useEffect(() => {
    const syncFromStorage = () =>
      setModes(normalizeModes(loadRoomTelemetryModes()));
    const onStorage = (e: StorageEvent) => {
      if (e.key != null && e.key !== ROOM_TELEMETRY_MODES_STORAGE_KEY) return;
      syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("sh-room-telemetry-mode", syncFromStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sh-room-telemetry-mode", syncFromStorage);
    };
  }, []);

  const merged = useMemo(() => normalizeModes(modes), [modes]);

  const setModeForRoom = useCallback((roomSlug: string, mode: RoomTelemetryMode) => {
    setModes((prev) => {
      const next = normalizeModes({
        ...prev,
        [roomSlug]: mode,
      });
      saveRoomTelemetryModes(next);
      bumpRoomTelemetryModeVersion();
      return next;
    });
  }, []);

  return {
    modes: merged,
    setModeForRoom,
    toggleLabels: ROOM_SOURCE_SLUGS.map((slug) => ({
      slug,
      title: humanizeRoom(slug),
    })),
  };
}

function normalizeModes(
  m: Record<string, RoomTelemetryMode>
): Record<string, RoomTelemetryMode> {
  const out: Record<string, RoomTelemetryMode> = {};
  for (const slug of ROOM_SOURCE_SLUGS) {
    const mode = m[slug];
    out[slug] =
      mode === "realtime" || mode === "simulated"
        ? mode
        : DEFAULT_ROOM_TELEMETRY_MODE;
  }
  return out;
}
