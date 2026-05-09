"use client";

import { useMemo } from "react";
import { Activity, Minus, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardSectionLabel } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { TrendArrow } from "@/components/ui/trend-arrow";
import { ACCENT_HEX } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type {
  LiveAnomalyDeviceState,
  LiveTelemetryPoint,
} from "@/hooks/use-live-telemetry";

type Props = {
  timeline: LiveTelemetryPoint[];
  anomalyByDevice: Record<string, LiveAnomalyDeviceState>;
  className?: string;
};

function quantile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length))
  );
  return sorted[idx] ?? null;
}

export function LiveAnomalyScoreCard({
  timeline,
  anomalyByDevice,
  className,
}: Props) {
  const stats = useMemo(() => {
    const recent = timeline
      .slice(-180)
      .map((p) => p.anomaly_score)
      .filter((v): v is number => typeof v === "number");
    const earlier = timeline
      .slice(-360, -180)
      .map((p) => p.anomaly_score)
      .filter((v): v is number => typeof v === "number");
    const current = recent.length ? recent[recent.length - 1] : null;
    const avgRecent =
      recent.length > 0
        ? recent.reduce((a, b) => a + b, 0) / recent.length
        : null;
    const avgEarlier =
      earlier.length > 0
        ? earlier.reduce((a, b) => a + b, 0) / earlier.length
        : null;
    const trendDelta =
      avgRecent != null && avgEarlier != null ? avgRecent - avgEarlier : null;
    const p95 = quantile(recent, 95);
    const breachCount = timeline
      .slice(-300)
      .filter((p) => p.is_contextual_anomaly).length;
    const liveDevices = Object.values(anomalyByDevice);
    const adaptiveThreshold = (() => {
      const thresholds = timeline
        .slice(-180)
        .map((p) => p.anomaly_threshold)
        .filter((v): v is number => typeof v === "number");
      if (thresholds.length === 0) return null;
      return thresholds[thresholds.length - 1];
    })();
    const sparkValues = timeline
      .slice(-60)
      .map((p) => p.anomaly_score ?? null);
    return {
      current,
      avgRecent,
      trendDelta,
      p95,
      breachCount,
      adaptiveThreshold,
      liveDevices,
      sparkValues,
    };
  }, [timeline, anomalyByDevice]);

  const breach =
    stats.current != null &&
    stats.adaptiveThreshold != null &&
    stats.current >= stats.adaptiveThreshold;

  const confidence = (() => {
    if (stats.current == null || stats.adaptiveThreshold == null) return null;
    if (stats.adaptiveThreshold <= 0) return null;
    const ratio = stats.current / stats.adaptiveThreshold;
    return Math.max(0, Math.min(1, ratio));
  })();

  const stroke = breach ? "#ef4444" : ACCENT_HEX;

  return (
    <Card
      tone={breach ? "anomaly" : "default"}
      glow={breach}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardSectionLabel>Live Anomaly Score</CardSectionLabel>
          <p className="mt-1 text-xs font-light text-text-secondary">
            Adaptive contextual ensemble (Isolation Forest + LOF)
          </p>
        </div>
        <Badge variant={breach ? "danger" : "info"}>
          <ShieldAlert className="h-3 w-3" />
          {breach ? "Active anomaly" : "Within baseline"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[auto,1fr]">
        <div>
          <p
            className={cn(
              "kpi-value text-kpi tabular",
              breach ? "text-danger" : "text-text-primary"
            )}
          >
            {stats.current == null ? "—" : stats.current.toFixed(1)}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
            <span>
              threshold{" "}
              <span className="mono text-text-primary">
                {stats.adaptiveThreshold == null
                  ? "—"
                  : stats.adaptiveThreshold.toFixed(1)}
              </span>
            </span>
            <span className="text-text-dim">·</span>
            <TrendArrow
              delta={stats.trendDelta}
              inverse
              format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
            />
          </div>
        </div>
        <Sparkline
          values={stats.sparkValues}
          stroke={stroke}
          height={56}
          className="rounded-md bg-surface-2/50"
        />
      </div>

      {confidence != null ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wide text-text-dim">
            <span>Confidence vs threshold</span>
            <span className="mono text-text-secondary">
              {Math.round(confidence * 100)}%
            </span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300",
                breach
                  ? "bg-danger"
                  : confidence > 0.75
                    ? "bg-amber"
                    : "bg-accent"
              )}
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
        <Stat
          label="P95 (recent)"
          value={stats.p95 == null ? "—" : stats.p95.toFixed(1)}
          icon={<Activity className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Breaches (5m)"
          value={String(stats.breachCount)}
          tone={stats.breachCount > 0 ? "danger" : "default"}
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Devices live"
          value={String(stats.liveDevices.length)}
          icon={<Minus className="h-3.5 w-3.5" />}
        />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-dim">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-display text-base font-semibold tabular",
          tone === "danger" ? "text-danger" : "text-text-primary"
        )}
      >
        {value}
      </p>
    </div>
  );
}
