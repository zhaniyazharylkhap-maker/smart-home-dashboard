"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import {
  Activity,
  Droplets,
  Flame,
  Lightbulb,
  Radio,
  Thermometer,
  Wind,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TelemetryReading } from "@/types/telemetry";
import { cn } from "@/lib/utils";

function Metric({
  icon: Icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5",
        accent
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-accent opacity-90" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-mono text-sm tabular-nums text-foreground">
          {value}
          {unit ? (
            <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
          ) : null}
        </p>
      </div>
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
  const motionVal = (v: number | null | undefined, suffix: string) =>
    v == null ? "—" : `${v}${suffix}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <Card className="overflow-hidden border-border/60 transition hover:border-accent/40 hover:shadow-glow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">
                {reading.room.replace("_", " ")}
              </CardTitle>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {reading.device_id}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
              <Radio className="h-3 w-3" />
              Live
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Metric
            icon={Thermometer}
            label="Temperature"
            value={motionVal(reading.temperature, "")}
            unit="°C"
          />
          <Metric
            icon={Droplets}
            label="Humidity"
            value={motionVal(reading.humidity, "")}
            unit="%"
          />
          <Metric
            icon={Activity}
            label="Motion"
            value={
              reading.motion == null ? "—" : reading.motion ? "Detected" : "Clear"
            }
          />
          <Metric
            icon={Lightbulb}
            label="Light"
            value={motionVal(reading.light, "")}
            unit="lux"
          />
          <Metric
            icon={Wind}
            label="Gas"
            value={motionVal(reading.gas, "")}
            unit="ppm"
          />
          <Metric
            icon={Flame}
            label="Smoke"
            value={motionVal(reading.smoke, "")}
            unit="ppm"
          />
        </CardContent>
        <div className="border-t border-border/50 px-6 py-3 text-[11px] text-muted-foreground">
          Updated{" "}
          <span className="font-mono text-foreground/90">
            {new Date(reading.timestamp).toLocaleString()}
          </span>
        </div>
      </Card>
    </motion.div>
  );
}
