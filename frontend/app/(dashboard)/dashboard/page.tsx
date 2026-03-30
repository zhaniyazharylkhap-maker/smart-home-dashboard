"use client";

import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Radio,
  RefreshCw,
  Shield,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";

import { TelemetryReadingCard } from "@/components/telemetry-reading-card";
import { Button } from "@/components/ui/button";
import { fetchDashboardStats } from "@/lib/api";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import type { DashboardStats } from "@/types/domain";
import { cn } from "@/lib/utils";

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "amber" | "emerald" | "rose";
}) {
  const ring =
    tone === "emerald"
      ? "border-emerald-500/25 bg-emerald-500/5"
      : tone === "amber"
        ? "border-amber-500/25 bg-amber-500/5"
        : tone === "rose"
          ? "border-rose-500/25 bg-rose-500/5"
          : "border-border/70 bg-card/50";
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", ring)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <Icon className="h-5 w-5 text-accent opacity-90" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { readings, connected, error, reload } = useLiveTelemetry();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col gap-6 border-b border-border/60 pb-8 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Home overview
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Live device telemetry, alert posture, and connectivity — fed by MQTT
            ingestion and your PostgreSQL history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              connected
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            {connected ? "WebSocket live" : "Reconnecting…"}
          </span>
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
      </motion.header>

      {statsError ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {statsError}
        </div>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Home status"
          value={stats ? statusLabel : "—"}
          hint="Derived from active alert severities"
          icon={Shield}
          tone={
            stats?.home_status === "critical"
              ? "rose"
              : stats?.home_status === "warning"
                ? "amber"
                : "emerald"
          }
        />
        <Kpi
          label="Devices online"
          value={stats ? `${stats.devices_online}/${stats.devices_total}` : "—"}
          hint="Seen in the last 2 minutes"
          icon={Wifi}
        />
        <Kpi
          label="Active alerts"
          value={stats?.active_alerts ?? "—"}
          hint="Unresolved incidents"
          icon={AlertTriangle}
          tone={
            stats && stats.active_alerts > 0 ? "amber" : "emerald"
          }
        />
        <Kpi
          label="Telemetry streams"
          value={readings.length}
          hint="Latest row per device"
          icon={Activity}
        />
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      ) : null}

      {readings.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/40 py-24 text-center">
          <Activity className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Waiting for telemetry… start the simulator stack or check MQTT.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {readings.map((r, i) => (
            <TelemetryReadingCard key={r.device_id} reading={r} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
