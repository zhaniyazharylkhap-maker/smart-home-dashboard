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

export type LiveTelemetryPoint = {
  device_id: string;
  room: string;
  timestamp: string;
  value: number | null;
  risk_score: number | null;
  anomaly: boolean;
};

type ThroughputStats = {
  current: number | null;
  avg: number | null;
  max: number | null;
};

type PerformanceSnapshot = {
  avg_latency_ms: number | null;
  max_latency_ms: number | null;
  throughput_msg_per_sec: number | null;
  max_throughput_msg_per_sec: number | null;
  samples: number;
  total_messages: number;
  dropped_messages: number;
  loss_rate: number;
};
const SCORE_WINDOW = 300;

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length))
  );
  return sorted[idx] ?? null;
}

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
  const [throughputStats, setThroughputStats] = useState<ThroughputStats>({
    current: null,
    avg: null,
    max: null,
  });
  const [timeline, setTimeline] = useState<LiveTelemetryPoint[]>([]);
  const [performanceSummary, setPerformanceSummary] = useState<PerformanceSnapshot>({
    avg_latency_ms: null,
    max_latency_ms: null,
    throughput_msg_per_sec: null,
    max_throughput_msg_per_sec: null,
    samples: 0,
    total_messages: 0,
    dropped_messages: 0,
    loss_rate: 0,
  });
  const [anomalyThreshold, setAnomalyThreshold] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const latenciesRef = useRef<number[]>([]);
  const arrivalTimesRef = useRef<number[]>([]);
  const throughputHistoryRef = useRef<number[]>([]);
  const recentScoresRef = useRef<number[]>([]);
  const performanceRef = useRef<PerformanceSnapshot>({
    avg_latency_ms: null,
    max_latency_ms: null,
    throughput_msg_per_sec: null,
    max_throughput_msg_per_sec: null,
    samples: 0,
    total_messages: 0,
    dropped_messages: 0,
    loss_rate: 0,
  });

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
        const nextTotalMessages = performanceRef.current.total_messages + 1;
        try {
          const msg = JSON.parse(String(ev.data)) as WsMessage;
          if (msg.type === "telemetry" && msg.payload) {
            const reading = msg.payload as TelemetryReading;
            if (
              typeof reading.device_id !== "string" ||
              typeof reading.timestamp !== "string"
            ) {
              const droppedMessages = performanceRef.current.dropped_messages + 1;
              const lossRate =
                nextTotalMessages > 0 ? droppedMessages / nextTotalMessages : 0;
              const nextPerf = {
                ...performanceRef.current,
                total_messages: nextTotalMessages,
                dropped_messages: droppedMessages,
                loss_rate: lossRate,
              };
              performanceRef.current = nextPerf;
              setPerformanceSummary(nextPerf);
              return;
            }
            const now = Date.now();
            const emitted = new Date(reading.timestamp).getTime();
            const latencyMs = now - emitted;
            if (Number.isFinite(latencyMs) && latencyMs >= 0 && latencyMs < 300_000) {
              const next = [...latenciesRef.current, latencyMs].slice(-120);
              latenciesRef.current = next;
              const sum = next.reduce((a, b) => a + b, 0);
              setLatencyStats({
                latest: latencyMs,
                avg: next.length ? sum / next.length : null,
                min: next.length ? Math.min(...next) : null,
                max: next.length ? Math.max(...next) : null,
                count: next.length,
              });
            }

            const arrivals = [...arrivalTimesRef.current, now].filter(
              (t) => now - t <= 10_000
            );
            arrivalTimesRef.current = arrivals;
            const currentThroughput = arrivals.length / 10;
            const throughputHistory = [...throughputHistoryRef.current, currentThroughput].slice(-120);
            throughputHistoryRef.current = throughputHistory;
            const throughputAvg =
              throughputHistory.length > 0
                ? throughputHistory.reduce((a, b) => a + b, 0) / throughputHistory.length
                : null;
            const throughputMax =
              throughputHistory.length > 0 ? Math.max(...throughputHistory) : null;
            setThroughputStats({
              current: currentThroughput,
              avg: throughputAvg,
              max: throughputMax,
            });

            const anomaly =
              (reading.risk_level ?? "SAFE").toUpperCase() !== "SAFE" ||
              (reading.risk_score ?? 0) >= 70;
            if (typeof reading.risk_score === "number" && Number.isFinite(reading.risk_score)) {
              const nextScores = [...recentScoresRef.current, reading.risk_score].slice(
                -SCORE_WINDOW
              );
              recentScoresRef.current = nextScores;
              // Dynamic threshold from recent score distribution improves
              // interpretability versus hardcoded constants.
              setAnomalyThreshold(percentile(nextScores, 10));
            }
            setTimeline((prev) =>
              [
                ...prev,
                {
                  device_id: reading.device_id,
                  room: reading.room,
                  timestamp: reading.timestamp,
                  value: reading.temperature,
                  risk_score: reading.risk_score ?? null,
                  anomaly,
                },
              ].slice(-1200)
            );

            if (latenciesRef.current.length > 0) {
              const totalMessages = nextTotalMessages;
              const droppedMessages = performanceRef.current.dropped_messages;
              const lossRate =
                totalMessages > 0 ? droppedMessages / totalMessages : 0;
              // Message loss matters in distributed pipelines: even low latency is
              // insufficient if messages are silently dropped.
              const nextPerformance: PerformanceSnapshot = {
                avg_latency_ms:
                  latenciesRef.current.reduce((a, b) => a + b, 0) /
                  latenciesRef.current.length,
                max_latency_ms: Math.max(...latenciesRef.current),
                throughput_msg_per_sec: currentThroughput,
                max_throughput_msg_per_sec: throughputMax,
                samples: latenciesRef.current.length,
                total_messages: totalMessages,
                dropped_messages: droppedMessages,
                loss_rate: lossRate,
              };
              performanceRef.current = nextPerformance;
              setPerformanceSummary(nextPerformance);
            }
            setByDevice((prev) => mergeReading(prev, reading));
            return;
          }
          if (msg.type === "alert" && msg.payload) {
            const alert = toLiveAlert(msg.payload);
            if (!alert) return;
            setRecentAlerts((prev) => [alert, ...prev].slice(0, 8));
          }
          const totalMessages = nextTotalMessages;
          const droppedMessages = performanceRef.current.dropped_messages;
          const lossRate =
            totalMessages > 0 ? droppedMessages / totalMessages : 0;
          const nextPerformance: PerformanceSnapshot = {
            ...performanceRef.current,
            total_messages: totalMessages,
            dropped_messages: droppedMessages,
            loss_rate: lossRate,
          };
          performanceRef.current = nextPerformance;
          setPerformanceSummary(nextPerformance);
        } catch {
          const droppedMessages = performanceRef.current.dropped_messages + 1;
          const lossRate =
            nextTotalMessages > 0 ? droppedMessages / nextTotalMessages : 0;
          // Message loss in streaming dashboards is measured as invalid/unusable
          // messages over total received transport messages.
          const nextPerformance: PerformanceSnapshot = {
            ...performanceRef.current,
            total_messages: nextTotalMessages,
            dropped_messages: droppedMessages,
            loss_rate: lossRate,
          };
          performanceRef.current = nextPerformance;
          setPerformanceSummary(nextPerformance);
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

  useEffect(() => {
    if (performanceSummary.samples === 0) return;
    // For thesis evaluation we emit compact runtime stats that can be copied
    // into experiment reports (avg/max latency and stream throughput).
    console.info("stream_performance", {
      avg_latency_ms: performanceSummary.avg_latency_ms,
      max_latency_ms: performanceSummary.max_latency_ms,
      throughput_msg_per_sec: performanceSummary.throughput_msg_per_sec,
      max_throughput_msg_per_sec: performanceSummary.max_throughput_msg_per_sec,
      samples: performanceSummary.samples,
      total_messages: performanceSummary.total_messages,
      dropped_messages: performanceSummary.dropped_messages,
      loss_rate: performanceSummary.loss_rate,
    });
  }, [performanceSummary]);

  const readings = useMemo(
    () =>
      [...byDevice.values()].sort((a, b) =>
        a.device_id.localeCompare(b.device_id)
      ),
    [byDevice]
  );

  return {
    readings,
    connected,
    error,
    reload: load,
    latencyStats,
    throughputStats,
    performanceSummary,
    anomalyThreshold,
    recentAlerts,
    timeline,
  };
}
