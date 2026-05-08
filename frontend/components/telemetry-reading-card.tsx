"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import {
  Activity,
  Brain,
  Droplets,
  Flame,
  Lightbulb,
  Thermometer,
  Wind,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { humanizeRoom, humanizeTokens } from "@/lib/explanations";
import { cn } from "@/lib/utils";
import type { TelemetryReading } from "@/types/telemetry";

function riskTone(level?: string | null): {
  accentLeft: "safe" | "warning" | "critical";
  badgeVariant: "safe" | "warning" | "danger";
  label: string;
  tone: "default" | "warning" | "anomaly";
} {
  if (level === "CRITICAL") {
    return {
      accentLeft: "critical",
      badgeVariant: "danger",
      label: "Critical",
      tone: "anomaly",
    };
  }
  if (level === "WARNING") {
    return {
      accentLeft: "warning",
      badgeVariant: "warning",
      label: "Warning",
      tone: "warning",
    };
  }
  return {
    accentLeft: "safe",
    badgeVariant: "safe",
    label: "Safe",
    tone: "default",
  };
}

function Metric({
  icon: Icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit?: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2/60 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-text-dim">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <p className="text-[10px] font-medium uppercase tracking-wide">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "kpi-value mt-0.5 text-base leading-none tabular",
          tone === "warning" && "text-amber",
          tone === "danger" && "text-danger",
          (!tone || tone === "default") && "text-text-primary"
        )}
      >
        {value}
        {unit ? (
          <span className="ml-0.5 text-[10px] font-light text-text-dim">
            {unit}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function fmtNumber(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Number(v.toFixed(digits)).toString();
}

export function TelemetryReadingCard({
  reading,
  index,
}: {
  reading: TelemetryReading;
  index: number;
}) {
  const isRecent = Date.now() - new Date(reading.timestamp).getTime() < 30_000;
  const updatedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(reading.timestamp).getTime()) / 1000)
  );
  const risk = riskTone(reading.risk_level);
  const motionValue =
    reading.motion == null ? "—" : reading.motion ? "On" : "Off";
  const ctxScore = reading.anomaly_score ?? null;
  const ctxThr = reading.anomaly_threshold ?? null;
  const isCtxBreach = Boolean(reading.is_contextual_anomaly);
  const tokens = humanizeTokens(reading.explanation_tokens);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
    >
      <Card
        accentLeft={risk.accentLeft}
        tone={risk.tone}
        glow={isCtxBreach}
        className="overflow-hidden p-4"
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <StatusDot status={isRecent ? "online" : "offline"} pulse={isRecent} />
              <div className="min-w-0">
                <CardTitle className="truncate text-sm font-semibold">
                  {reading.device_id}
                </CardTitle>
                <p className="text-[11px] font-light text-text-secondary">
                  {humanizeRoom(reading.room)}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <Badge variant={risk.badgeVariant}>
                  {risk.label}
                </Badge>
                <span className="kpi-value text-xs text-text-secondary">
                  {reading.risk_score == null
                    ? "--"
                    : Math.round(reading.risk_score)}
                </span>
              </div>
              {ctxScore != null ? (
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[10px] uppercase tracking-wide mono",
                    isCtxBreach
                      ? "border-danger/40 bg-danger-light text-danger"
                      : "border-border bg-surface-2 text-text-dim"
                  )}
                  title={tokens.join(" · ") || "Stable"}
                >
                  <Brain className="h-3 w-3" />
                  ctx {ctxScore.toFixed(1)}
                  {ctxThr != null ? (
                    <span className="opacity-60">/{ctxThr.toFixed(1)}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-3 gap-2">
          <Metric
            icon={Thermometer}
            label="Temp"
            value={fmtNumber(reading.temperature)}
            unit="°C"
            tone={
              reading.temperature != null && reading.temperature > 35
                ? "danger"
                : reading.temperature != null && reading.temperature > 28
                  ? "warning"
                  : "default"
            }
          />
          <Metric
            icon={Droplets}
            label="Humid"
            value={fmtNumber(reading.humidity)}
            unit="%"
          />
          <Metric icon={Activity} label="Motion" value={motionValue} />
          <Metric
            icon={Wind}
            label="Gas"
            value={fmtNumber(reading.gas)}
            unit="ppm"
            tone={
              reading.gas != null && reading.gas > 60
                ? "danger"
                : reading.gas != null && reading.gas > 30
                  ? "warning"
                  : "default"
            }
          />
          <Metric
            icon={Flame}
            label="Smoke"
            value={fmtNumber(reading.smoke)}
            unit="ppm"
            tone={
              reading.smoke != null && reading.smoke > 50
                ? "danger"
                : reading.smoke != null && reading.smoke > 20
                  ? "warning"
                  : "default"
            }
          />
          <Metric
            icon={Lightbulb}
            label="Light"
            value={fmtNumber(reading.light)}
            unit="lux"
          />
        </CardContent>

        {tokens.length > 0 ? (
          <p className="mt-3 line-clamp-2 text-[11px] font-light text-text-secondary">
            {tokens[0]}
            {tokens.length > 1 ? (
              <span className="text-text-dim"> · {tokens.slice(1, 3).join(" · ")}</span>
            ) : null}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[10px] font-light text-text-dim">
          <span>Updated {updatedSeconds}s ago</span>
          {reading.model_version ? (
            <span className="mono">{reading.model_version}</span>
          ) : null}
        </div>
      </Card>
    </motion.div>
  );
}
