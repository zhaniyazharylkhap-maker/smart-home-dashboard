"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchLatestTelemetry, getWsUrl } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { TelemetryReading, WsMessage } from "@/types/telemetry";

type LiveAlert = {
  id: number;
  room_name: string | null;
  device_external_id: string | null;
  severity: string;
  title: string;
  description: string | null;
  created_at: string;
  risk_score?: number | null;
  risk_level?: string | null;
  alert_reasons?: string[] | null;
};

function toLiveAlert(payload: unknown): LiveAlert | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.id !== "number" ||
    typeof p.severity !== "string" ||
    typeof p.title !== "string" ||
    typeof p.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: p.id,
    room_name: typeof p.room_name === "string" ? p.room_name : null,
    device_external_id:
      typeof p.device_external_id === "string" ? p.device_external_id : null,
    severity: p.severity,
    title: p.title,
    description: typeof p.description === "string" ? p.description : null,
    created_at: p.created_at,
    risk_score: typeof p.risk_score === "number" ? p.risk_score : null,
    risk_level: typeof p.risk_level === "string" ? p.risk_level : null,
    alert_reasons: Array.isArray(p.alert_reasons)
      ? p.alert_reasons.filter((x): x is string => typeof x === "string")
      : null,
  };
}

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
  const [recentAlerts, setRecentAlerts] = useState<LiveAlert[]>([]);
  const [latencyStats, setLatencyStats] = useState<{
    latest: number | null;
    avg: number | null;
    min: number | null;
    max: number | null;
    count: number;
  }>({ latest: null, avg: null, min: null, max: null, count: 0 });
  const wsRef = useRef<WebSocket | null>(null);
  const latenciesRef = useRef<number[]>([]);

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
            const reading = msg.payload as TelemetryReading;
            if (typeof reading.t_sim === "number") {
              const li = Date.now() - reading.t_sim;
              if (Number.isFinite(li) && li >= 0 && li < 300_000) {
                const next = [...latenciesRef.current, li].slice(-50);
                latenciesRef.current = next;
                const sum = next.reduce((a, b) => a + b, 0);
                setLatencyStats({
                  latest: li,
                  avg: next.length ? sum / next.length : null,
                  min: next.length ? Math.min(...next) : null,
                  max: next.length ? Math.max(...next) : null,
                  count: next.length,
                });
              }
            }
            setByDevice((prev) => mergeReading(prev, reading));
            return;
          }
          if (msg.type === "alert" && msg.payload) {
            const alert = toLiveAlert(msg.payload);
            if (!alert) return;
            setRecentAlerts((prev) => [alert, ...prev].slice(0, 8));
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

  return { readings, connected, error, reload: load, latencyStats, recentAlerts };
}
