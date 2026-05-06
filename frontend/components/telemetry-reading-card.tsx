"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import {
  Activity,
  Droplets,
  Lightbulb,
  Thermometer,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import type { TelemetryReading } from "@/types/telemetry";

function riskTone(level?: string | null): {
  accentLeft: "safe" | "warning" | "critical";
  badgeVariant: "success" | "warning" | "danger";
  label: string;
} {
  if (level === "CRITICAL") {
    return {
      accentLeft: "critical",
      badgeVariant: "danger",
      label: "Critical",
    };
  }
  if (level === "WARNING") {
    return {
      accentLeft: "warning",
      badgeVariant: "warning",
      label: "Warning",
    };
  }
  return {
    accentLeft: "safe",
    badgeVariant: "success",
    label: "Safe",
  };
}

function Metric({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-text-secondary">
        <Icon className="h-5 w-5 shrink-0 text-text-dim" />
        <p className="text-[11px] font-light uppercase tracking-wide">
          {label}
        </p>
      </div>
      <p className="kpi-value text-xl leading-none text-text-primary">
        {value}
        {unit ? (
          <span className="ml-1 font-body text-[11px] font-light text-text-dim">
            {unit}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export function TelemetryReadingCard({
  reading,
  index,
}: {
  reading: TelemetryReading;
  index: number;
}) {
  const formatNumber = (v: number | null | undefined) =>
    v == null ? "—" : Number(v.toFixed(1));
  const isRecent = Date.now() - new Date(reading.timestamp).getTime() < 30_000;
  const updatedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(reading.timestamp).getTime()) / 1000)
  );
  const risk = riskTone(reading.risk_level);
  const motionValue =
    reading.motion == null ? "—" : reading.motion ? "On" : "Off";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <Card
        accentLeft={risk.accentLeft}
        className="overflow-hidden"
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <StatusDot status={isRecent ? "online" : "offline"} pulse={isRecent} />
              <div>
                <CardTitle className="text-sm font-semibold">
                  {reading.device_id}
                </CardTitle>
                <p className="text-xs font-light text-text-secondary">
                  {reading.room.replaceAll("_", " ")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={risk.badgeVariant}>{risk.label}</Badge>
              <span className="kpi-value text-sm text-text-dim">
                {reading.risk_score == null
                  ? "--"
                  : Math.round(reading.risk_score)}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-2 gap-2">
          <Metric
            icon={Thermometer}
            label="Temp"
            value={formatNumber(reading.temperature)}
            unit="°C"
          />
          <Metric
            icon={Droplets}
            label="Humidity"
            value={formatNumber(reading.humidity)}
            unit="%"
          />
          <Metric icon={Activity} label="Motion" value={motionValue} />
          <Metric
            icon={Lightbulb}
            label="Light"
            value={formatNumber(reading.light)}
            unit="lux"
          />
        </CardContent>

        <div className="border-t border-border px-6 py-2 text-[11px] font-light text-text-dim">
          Updated {updatedSeconds}s ago
        </div>
      </Card>
    </motion.div>
  );
}
