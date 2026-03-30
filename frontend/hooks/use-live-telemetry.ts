"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchLatestTelemetry, getWsUrl } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { TelemetryReading, WsMessage } from "@/types/telemetry";

function mergeReading(
  prev: Map<string, TelemetryReading>,
  reading: TelemetryReading
): Map<string, TelemetryReading> {
  const next = new Map(prev);
  next.set(reading.device_id, reading);
  return next;
}

export function useLiveTelemetry() {
  const token = useAuthStore((s) => s.token);
  const [byDevice, setByDevice] = useState<Map<string, TelemetryReading>>(
    () => new Map()
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await fetchLatestTelemetry();
      setByDevice(
        new Map(data.readings.map((r) => [r.device_id, r] as const))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled || !useAuthStore.getState().token) return;
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) {
          setConnected(true);
          try {
            ws.send("ping");
          } catch {
            /* ignore */
          }
        }
      };
      ws.onclose = () => {
        if (!cancelled) {
          setConnected(false);
          retryTimer = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => {
        if (!cancelled) setConnected(false);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsMessage;
          if (msg.type === "telemetry" && msg.payload) {
            setByDevice((prev) =>
              mergeReading(prev, msg.payload as TelemetryReading)
            );
          }
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token]);

  const readings = useMemo(
    () =>
      [...byDevice.values()].sort((a, b) =>
        a.device_id.localeCompare(b.device_id)
      ),
    [byDevice]
  );

  return { readings, connected, error, reload: load };
}
