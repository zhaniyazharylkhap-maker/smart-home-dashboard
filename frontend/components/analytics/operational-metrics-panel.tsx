"use client";

import { useMemo } from "react";
import { Activity, AlertTriangle, Gauge, RefreshCw, Wifi } from "lucide-react";

import { Card, CardSectionLabel } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";
import type { LiveTelemetryPoint } from "@/hooks/use-live-telemetry";

type Props = {
  performanceSummary: {
    avg_latency_ms: number | null;
    max_latency_ms: number | null;
    p95_latency_ms: number | null;
    throughput_msg_per_sec: number | null;
    max_throughput_msg_per_sec: number | null;
    samples: number;
    total_messages: number;
    dropped_messages: number;
    loss_rate: number;
  };
  latencyStats: {
    latest: number | null;
    avg: number | null;
    min: number | null;
    max: number | null;
    p95: number | null;
    count: number;
  };
  throughputStats: {
    current: number | null;
    avg: number | null;
    max: number | null;
  };
  streamHealth: {
    reconnect_count: number;
    last_connected_at: string | null;
    last_disconnected_at: string | null;
    degraded: boolean;
  };
  connected: boolean;
  timeline: LiveTelemetryPoint[];
  className?: string;
};

function relativeTime(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleString();
}

export function OperationalMetricsPanel({
  performanceSummary,
  latencyStats,
  throughputStats,
  streamHealth,
  connected,
  timeline,
  className,
}: Props) {
  const latencySpark = useMemo(() => {
    return timeline
      .slice(-60)
      .map((p) => {
        const t = new Date(p.timestamp).getTime();
        const lat = Date.now() - t;
        return Number.isFinite(lat) && lat >= 0 && lat < 300_000 ? lat : null;
      });
  }, [timeline]);

  const throughputSpark = useMemo(() => {
    const arrivals = timeline
      .slice(-300)
      .map((p) => new Date(p.timestamp).getTime())
      .filter((t) => Number.isFinite(t));
    if (arrivals.length === 0) return [] as number[];
    const minT = arrivals[0];
    const buckets = new Map<number, number>();
    for (const t of arrivals) {
      const k = Math.floor((t - minT) / 5000);
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return Array.from(buckets.values()).slice(-30);
  }, [timeline]);

  const overall = streamHealth.degraded
    ? { tone: "warning", label: "Degraded" }
    : connected
      ? { tone: "safe", label: "Healthy" }
      : { tone: "danger", label: "Reconnecting" };

  return (
    <Card className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardSectionLabel>System Health Analytics</CardSectionLabel>
          <p className="mt-1 text-xs font-light text-text-secondary">
            Stream throughput, latency, recovery and inference mode
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider",
            overall.tone === "safe" && "border-safe/30 bg-safe-light text-safe",
            overall.tone === "warning" && "border-amber/30 bg-amber-light text-amber",
            overall.tone === "danger" && "border-danger/30 bg-danger-light text-danger"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              overall.tone === "safe" && "bg-safe animate-pulse-dot",
              overall.tone === "warning" && "bg-amber animate-pulse-dot",
              overall.tone === "danger" && "bg-danger animate-pulse-dot"
            )}
          />
          {overall.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={<Gauge className="h-4 w-4" />}
          label="Latency (avg)"
          primary={
            latencyStats.avg == null ? "—" : `${Math.round(latencyStats.avg)}ms`
          }
          secondary={
            latencyStats.p95 == null
              ? "p95 —"
              : `p95 ${Math.round(latencyStats.p95)}ms`
          }
          spark={latencySpark}
          stroke="#22d3ee"
        />
        <Tile
          icon={<Activity className="h-4 w-4" />}
          label="Throughput"
          primary={
            throughputStats.current == null
              ? "—"
              : `${throughputStats.current.toFixed(2)} msg/s`
          }
          secondary={
            throughputStats.max == null
              ? "peak —"
              : `peak ${throughputStats.max.toFixed(2)} msg/s`
          }
          spark={throughputSpark}
          stroke="#10b981"
        />
        <Tile
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Message loss"
          primary={`${(performanceSummary.loss_rate * 100).toFixed(2)}%`}
          secondary={`${performanceSummary.dropped_messages}/${performanceSummary.total_messages} dropped`}
          tone={performanceSummary.dropped_messages > 0 ? "warning" : "safe"}
        />
        <Tile
          icon={<RefreshCw className="h-4 w-4" />}
          label="Stream recovery"
          primary={`${streamHealth.reconnect_count}`}
          secondary={
            connected
              ? `connected ${relativeTime(streamHealth.last_connected_at)}`
              : `dropped ${relativeTime(streamHealth.last_disconnected_at)}`
          }
          tone={streamHealth.reconnect_count > 0 ? "warning" : "safe"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex items-center justify-between rounded-md border border-border bg-surface-2/50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Wifi
              className={cn(
                "h-4 w-4",
                connected ? "text-safe" : "text-amber"
              )}
            />
            <div>
              <p className="font-display text-xs font-medium text-text-primary">
                WebSocket
              </p>
              <p className="text-[11px] font-light text-text-dim">
                {connected
                  ? "Streaming live telemetry"
                  : "Reconnecting to live stream"}
              </p>
            </div>
          </div>
          <span className="mono text-[11px] text-text-secondary">
            {performanceSummary.samples} samples
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border bg-surface-2/50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={cn(
                "h-4 w-4",
                streamHealth.degraded ? "text-amber" : "text-safe"
              )}
            />
            <div>
              <p className="font-display text-xs font-medium text-text-primary">
                Inference mode
              </p>
              <p className="text-[11px] font-light text-text-dim">
                {streamHealth.degraded
                  ? "Model artifacts unavailable — running rules only"
                  : "Contextual ML model active"}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-pill border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              streamHealth.degraded
                ? "border-amber/30 bg-amber-light text-amber"
                : "border-safe/30 bg-safe-light text-safe"
            )}
          >
            {streamHealth.degraded ? "degraded" : "ml"}
          </span>
        </div>
      </div>
    </Card>
  );
}

function Tile({
  icon,
  label,
  primary,
  secondary,
  spark,
  stroke = "#22d3ee",
  tone = "default",
}: {
  icon?: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
  spark?: (number | null)[];
  stroke?: string;
  tone?: "default" | "safe" | "warning" | "danger";
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-dim">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "kpi-value mt-1 text-lg tabular",
          tone === "warning" && "text-amber",
          tone === "danger" && "text-danger",
          tone === "safe" && "text-text-primary",
          tone === "default" && "text-text-primary"
        )}
      >
        {primary}
      </p>
      <p className="text-[11px] font-light text-text-dim">{secondary}</p>
      {spark && spark.length > 1 ? (
        <Sparkline values={spark} stroke={stroke} height={28} className="mt-1.5" />
      ) : null}
    </div>
  );
}
