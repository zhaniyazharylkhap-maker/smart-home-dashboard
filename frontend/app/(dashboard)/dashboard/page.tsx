"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Download,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { LiveAnomalyScoreCard } from "@/components/analytics/live-anomaly-score-card";
import { OperationalMetricsPanel } from "@/components/analytics/operational-metrics-panel";
import { SystemHealthStrip } from "@/components/analytics/system-health-strip";
import { TelemetryReadingCard } from "@/components/telemetry-reading-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardSectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import { fetchDashboardStats } from "@/lib/api";
import {
  humanizeAlertReasons,
  humanizeRoom,
} from "@/lib/explanations";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/types/domain";

function alertTone(level?: string | null): {
  accentLeft: "safe" | "warning" | "critical";
  badge: "safe" | "warning" | "danger";
} {
  if (level === "CRITICAL") return { accentLeft: "critical", badge: "danger" };
  if (level === "WARNING") return { accentLeft: "warning", badge: "warning" };
  return { accentLeft: "safe", badge: "safe" };
}

function HeroKpi({
  label,
  value,
  subtext,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  subtext: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "safe" | "warning" | "danger";
}) {
  return (
    <Card className="flex flex-col gap-3 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-text-dim">
          {label}
        </p>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "danger" && "text-danger",
            tone === "warning" && "text-amber",
            tone === "safe" && "text-safe",
            tone === "default" && "text-accent"
          )}
        />
      </div>
      <p
        className={cn(
          "kpi-value tabular leading-none",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-amber",
          tone === "safe" && "text-text-primary",
          tone === "default" && "text-text-primary",
          "text-kpi-sm md:text-kpi"
        )}
      >
        {value}
      </p>
      <p className="text-[11px] font-light text-text-dim">{subtext}</p>
    </Card>
  );
}

export default function DashboardPage() {
  const {
    readings,
    connected,
    error,
    reload,
    latencyStats,
    throughputStats,
    performanceSummary,
    recentAlerts,
    timeline,
    anomalyByDevice,
    streamHealth,
  } = useLiveTelemetry();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const lastEventAt = useMemo(() => {
    if (timeline.length === 0) return null;
    return timeline[timeline.length - 1].timestamp;
  }, [timeline]);

  const downloadMetricsCsv = () => {
    const rows = [
      ["metric", "value"],
      ["latency_avg_ms", String(performanceSummary.avg_latency_ms ?? "")],
      ["latency_p95_ms", String(performanceSummary.p95_latency_ms ?? "")],
      ["latency_max_ms", String(performanceSummary.max_latency_ms ?? "")],
      ["throughput_msg_per_sec", String(performanceSummary.throughput_msg_per_sec ?? "")],
      ["throughput_max_msg_per_sec", String(performanceSummary.max_throughput_msg_per_sec ?? "")],
      ["samples", String(performanceSummary.samples)],
      ["messages_total", String(performanceSummary.total_messages)],
      ["messages_dropped", String(performanceSummary.dropped_messages)],
      ["message_loss_rate", String(performanceSummary.loss_rate)],
      ["reconnect_count", String(streamHealth.reconnect_count)],
      ["degraded_mode", String(streamHealth.degraded)],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-metrics-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadStats = async () => {
    try {
      setStatsError(null);
      const s = await fetchDashboardStats();
      setStats(s);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : "stats failed");
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  const statusLabel =
    stats?.home_status === "critical"
      ? "Critical"
      : stats?.home_status === "warning"
        ? "Warning"
        : "Safe";

  const statusTone: "safe" | "warning" | "danger" =
    stats?.home_status === "critical"
      ? "danger"
      : stats?.home_status === "warning"
        ? "warning"
        : "safe";

  const liveAnomalyCount = Object.values(anomalyByDevice).filter(
    (a) => a.is_contextual_anomaly
  ).length;

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Overview</h1>
          <p className="mt-1 text-sm font-light text-text-secondary">
            Live behavior, anomalies, and operational health across your fleet
          </p>
          <SystemHealthStrip
            connected={connected}
            degraded={streamHealth.degraded}
            lastEventAt={lastEventAt}
            reconnectCount={streamHealth.reconnect_count}
            latencyAvgMs={latencyStats.avg}
            className="mt-3"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="subtle"
            size="sm"
            onClick={() => {
              void reload();
              void loadStats();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadMetricsCsv}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </header>

      {statsError ? (
        <div className="mb-4 rounded-md border border-amber/30 bg-amber-light px-3 py-2 text-sm text-amber">
          {statsError}
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroKpi
          label="Home Status"
          value={stats ? statusLabel : <Skeleton className="h-8 w-20" />}
          subtext="Derived from rule + anomaly engine"
          icon={Shield}
          tone={statusTone}
        />
        <HeroKpi
          label="Live Anomalies"
          value={liveAnomalyCount}
          subtext="Devices currently above adaptive threshold"
          icon={AlertTriangle}
          tone={liveAnomalyCount > 0 ? "danger" : "safe"}
        />
        <HeroKpi
          label="Devices Online"
          value={
            stats ? (
              `${stats.devices_online}/${stats.devices_total}`
            ) : (
              <Skeleton className="h-8 w-16" />
            )
          }
          subtext="Seen in the last 2 minutes"
          icon={Cpu}
          tone="safe"
        />
        <HeroKpi
          label="Active Alerts"
          value={stats ? stats.active_alerts : <Skeleton className="h-8 w-12" />}
          subtext="Unresolved incidents"
          icon={AlertTriangle}
          tone={stats && stats.active_alerts > 0 ? "warning" : "safe"}
        />
      </section>

      <section className="mb-5">
        <LiveAnomalyScoreCard
          timeline={timeline}
          anomalyByDevice={anomalyByDevice}
        />
      </section>

      {error ? (
        <div className="mb-4 rounded-md border border-amber/30 bg-amber-light px-3 py-2 text-sm text-amber">
          {error}
        </div>
      ) : null}

      <section className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <CardSectionLabel>Live Telemetry Grid</CardSectionLabel>
            <span className="text-[11px] font-light text-text-dim">
              {readings.length} device{readings.length === 1 ? "" : "s"}
            </span>
          </div>
          {readings.length === 0 && !error ? (
            <EmptyState
              icon={Activity}
              title="Waiting for telemetry stream"
              description="Once the simulator publishes events you'll see live readings appear here."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {readings.map((r, i) => (
                <TelemetryReadingCard key={r.device_id} reading={r} index={i} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <CardSectionLabel>Live Alert Feed</CardSectionLabel>
            <Badge variant={recentAlerts.length > 0 ? "warning" : "neutral"}>
              {recentAlerts.length}
            </Badge>
          </div>
          <Card className="h-full p-3 md:p-4">
            {recentAlerts.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="No recent alerts"
                description="Live alerts will stream in here as the engine detects unsafe conditions."
                className="py-8"
              />
            ) : (
              <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {recentAlerts.map((a) => {
                    const level = a.risk_level ?? a.severity?.toUpperCase();
                    const tone = alertTone(level);
                    const reasons = humanizeAlertReasons(a.alert_reasons ?? []);
                    return (
                      <motion.div
                        key={a.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Card
                          accentLeft={tone.accentLeft}
                          tone={
                            level === "CRITICAL"
                              ? "anomaly"
                              : level === "WARNING"
                                ? "warning"
                                : "default"
                          }
                          className="p-3"
                        >
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <p className="font-display text-[13px] font-medium leading-tight text-text-primary">
                              {a.title}
                            </p>
                            <Badge variant={tone.badge}>{level ?? "safe"}</Badge>
                          </div>
                          <p className="text-[11px] font-light text-text-dim">
                            {humanizeRoom(a.room_name)} ·{" "}
                            {new Date(a.created_at).toLocaleTimeString()}
                          </p>
                          {a.description ? (
                            <p className="mt-1 text-[12px] text-text-secondary">
                              {a.description}
                            </p>
                          ) : null}
                          {reasons.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {reasons.slice(0, 3).map((r) => (
                                <span
                                  key={r}
                                  className="inline-flex items-center rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-[10px] text-text-secondary"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </Card>
        </div>
      </section>

      <section>
        <OperationalMetricsPanel
          performanceSummary={performanceSummary}
          latencyStats={latencyStats}
          throughputStats={throughputStats}
          streamHealth={streamHealth}
          connected={connected}
          timeline={timeline}
        />
      </section>
    </div>
  );
}
