"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Gauge,
  RefreshCw,
  Shield,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";

import { TelemetryReadingCard } from "@/components/telemetry-reading-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { fetchDashboardStats } from "@/lib/api";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import type { DashboardStats } from "@/types/domain";
import { cn } from "@/lib/utils";

function Kpi({
  label,
  value,
  subtext,
  icon: Icon,
  tone = "safe",
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "safe" | "warning" | "critical";
}) {
  return (
    <Card accentLeft={tone} className="p-3 md:p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-[12px] font-light uppercase tracking-wide text-text-dim">
          {label}
        </p>
        <Icon className="h-5 w-5 text-accent" />
      </div>
      <div className="mb-1">
        <p className="kpi-value text-[32px] leading-none">{value}</p>
      </div>
      <p className="text-xs font-normal text-text-secondary">{subtext}</p>
    </Card>
  );
}

function alertTone(level?: string | null) {
  if (level === "CRITICAL") return "border-l-danger";
  if (level === "WARNING") return "border-l-amber";
  return "border-l-accent";
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
  } = useLiveTelemetry();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const downloadMetricsCsv = () => {
    // CSV export supports reproducible thesis experiments and offline analysis.
    const rows = [
      ["metric", "value"],
      ["latency_avg_ms", String(performanceSummary.avg_latency_ms ?? "")],
      ["latency_max_ms", String(performanceSummary.max_latency_ms ?? "")],
      ["throughput_msg_per_sec", String(performanceSummary.throughput_msg_per_sec ?? "")],
      ["throughput_max_msg_per_sec", String(performanceSummary.max_throughput_msg_per_sec ?? "")],
      ["samples", String(performanceSummary.samples)],
      ["messages_total", String(performanceSummary.total_messages)],
      ["messages_dropped", String(performanceSummary.dropped_messages)],
      ["message_loss_rate", String(performanceSummary.loss_rate)],
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

  const statusTone: "safe" | "warning" | "critical" =
    stats?.home_status === "critical"
      ? "critical"
      : stats?.home_status === "warning"
        ? "warning"
        : "safe";

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-[28px] font-bold">Overview</h1>
          <p className="text-sm font-light text-text-secondary">
            Live sensor data and system status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-pill px-3 py-1.5 text-xs font-medium",
              connected
                ? "bg-accent-light text-accent"
                : "bg-amber-light text-amber"
            )}
          >
            <StatusDot
              status={connected ? "online" : "warning"}
              pulse={connected}
            />
            {connected ? "Live" : "Reconnecting..."}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void reload();
              void loadStats();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      {statsError ? (
        <div className="mb-4 rounded-sm border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          {statsError}
        </div>
      ) : null}

      <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Home Status"
          value={stats ? statusLabel : "--"}
          subtext="Derived from incident severity"
          icon={Shield}
          tone={statusTone}
        />
        <Kpi
          label="Devices Online"
          value={stats ? `${stats.devices_online}/${stats.devices_total}` : "--"}
          subtext="Seen in the last 2 minutes"
          icon={Wifi}
          tone="safe"
        />
        <Kpi
          label="Active Alerts"
          value={stats?.active_alerts ?? "--"}
          subtext="Unresolved incidents"
          icon={AlertTriangle}
          tone={stats && stats.active_alerts > 0 ? "warning" : "safe"}
        />
        <Kpi
          label="Latency Avg"
          value={
            latencyStats.avg == null ? "--" : `${Math.round(latencyStats.avg)}ms`
          }
          subtext={
            latencyStats.latest == null
              ? "Waiting for traced stream"
              : `latest ${Math.round(latencyStats.latest)}ms`
          }
          icon={Gauge}
          tone={latencyStats.avg != null && latencyStats.avg > 1200 ? "warning" : "safe"}
        />
      </section>

      <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi
          label="Throughput"
          value={
            throughputStats.current == null
              ? "--"
              : `${throughputStats.current.toFixed(2)} msg/s`
          }
          subtext={
            throughputStats.max == null
              ? "Waiting for stream"
              : `max ${throughputStats.max.toFixed(2)} msg/s`
          }
          icon={Activity}
          tone="safe"
        />
        <Kpi
          label="Latency Max"
          value={
            performanceSummary.max_latency_ms == null
              ? "--"
              : `${Math.round(performanceSummary.max_latency_ms)}ms`
          }
          subtext="Used for thesis performance evaluation"
          icon={Gauge}
          tone={
            performanceSummary.max_latency_ms != null &&
            performanceSummary.max_latency_ms > 2000
              ? "warning"
              : "safe"
          }
        />
        <Kpi
          label="Perf Samples"
          value={performanceSummary.samples}
          subtext={
            performanceSummary.avg_latency_ms == null
              ? "No telemetry timing yet"
              : `avg ${Math.round(performanceSummary.avg_latency_ms)}ms`
          }
          icon={Shield}
          tone="safe"
        />
        <Kpi
          label="Message Loss"
          value={`${(performanceSummary.loss_rate * 100).toFixed(2)}%`}
          subtext={
            performanceSummary.total_messages === 0
              ? "No traffic observed yet"
              : `${performanceSummary.dropped_messages}/${performanceSummary.total_messages}`
          }
          icon={AlertTriangle}
          tone={performanceSummary.dropped_messages > 0 ? "warning" : "safe"}
        />
      </section>

      <div className="mb-4 flex justify-end">
        <Button type="button" variant="outline" onClick={downloadMetricsCsv}>
          Download metrics (CSV)
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-sm border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm text-text-secondary">Live Telemetry Grid</h2>
            <span className="text-xs font-light text-text-dim">
              {readings.length} devices
            </span>
          </div>
          {readings.length === 0 && !error ? (
            <Card className="p-6 text-center">
              <CardContent className="p-0">
                <Activity className="mx-auto mb-2 h-5 w-5 text-text-dim" />
                <p className="text-sm text-text-secondary">
                  Waiting for telemetry stream...
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {readings.map((r, i) => (
                <TelemetryReadingCard key={r.device_id} reading={r} index={i} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm text-text-secondary">Live Alert Feed</h2>
            <span className="text-xs font-light text-text-dim">
              {recentAlerts.length}
            </span>
          </div>
          <Card className="h-full">
            <CardContent className="p-2 md:p-3">
              {recentAlerts.length === 0 ? (
                <p className="py-12 text-center text-sm font-light text-text-dim">
                  No recent alerts
                </p>
              ) : (
                <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1 lg:max-h-[420px]">
                  <AnimatePresence initial={false}>
                    {recentAlerts.map((a) => (
                      <motion.div
                        key={a.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                          "rounded-xl border border-border border-l-[3px] bg-surface px-3 py-3",
                          alertTone(a.risk_level ?? a.severity?.toUpperCase())
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="font-display text-[13px] font-medium text-text-primary">
                            {a.title}
                          </p>
                          <Badge
                            variant={
                              (a.risk_level ?? a.severity?.toUpperCase()) === "CRITICAL"
                                ? "danger"
                                : (a.risk_level ?? a.severity?.toUpperCase()) === "WARNING"
                                  ? "warning"
                                  : "success"
                            }
                          >
                            {a.risk_level ?? "safe"}
                          </Badge>
                        </div>
                        <p className="text-[11px] font-light text-text-dim">
                          {(a.room_name ?? "Unknown room").replaceAll("_", " ")} ·{" "}
                          {new Date(a.created_at).toLocaleTimeString()}
                        </p>
                        {a.description ? (
                          <p className="mt-1 text-xs text-text-secondary">
                            {a.description}
                          </p>
                        ) : null}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

    </div>
  );
}
