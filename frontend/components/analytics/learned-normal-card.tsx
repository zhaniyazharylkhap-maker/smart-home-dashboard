"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardSectionLabel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchBehaviorProfile } from "@/lib/api";
import type { BehaviorProfileResponse } from "@/types/domain";
import { cn } from "@/lib/utils";

type Metric = "temperature" | "humidity" | "gas" | "smoke" | "light";

const METRIC_OPTIONS: { id: Metric; label: string; unit: string }[] = [
  { id: "temperature", label: "Temperature", unit: "°C" },
  { id: "humidity", label: "Humidity", unit: "%" },
  { id: "gas", label: "Gas", unit: "ppm" },
  { id: "smoke", label: "Smoke", unit: "ppm" },
  { id: "light", label: "Light", unit: "lux" },
];

type Props = {
  defaultMetric?: Metric;
  currentByMetric?: Partial<Record<Metric, number | null>>;
  className?: string;
};

function verdict(
  current: number | null,
  point: { p10: number; p50: number; p90: number } | undefined
): { label: string; tone: "safe" | "warning" | "info" } {
  if (current == null || !point) {
    return { label: "Awaiting current reading", tone: "info" };
  }
  if (current < point.p10) {
    return { label: "Below expected range for this hour", tone: "warning" };
  }
  if (current > point.p90) {
    return { label: "Above expected range for this hour", tone: "warning" };
  }
  return { label: "Within learned normal range", tone: "safe" };
}

export function LearnedNormalCard({
  defaultMetric = "temperature",
  currentByMetric,
  className,
}: Props) {
  const [metric, setMetric] = useState<Metric>(defaultMetric);
  const [data, setData] = useState<BehaviorProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetchBehaviorProfile({ metric, days: 7 });
        if (alive) setData(res);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [metric]);

  const series = useMemo(() => {
    if (!data) return [];
    return data.points.map((p) => ({
      hour: p.hour,
      hourLabel: `${p.hour.toString().padStart(2, "0")}:00`,
      p10: p.p10,
      p50: p.p50,
      p90: p.p90,
      band: p.p90 - p.p10,
    }));
  }, [data]);

  const currentHour = new Date().getHours();
  const currentPoint = useMemo(
    () => series.find((p) => p.hour === currentHour),
    [series, currentHour]
  );
  const currentValue = currentByMetric?.[metric] ?? null;
  const { label: verdictLabel, tone: verdictTone } = verdict(currentValue, currentPoint);
  const unit = METRIC_OPTIONS.find((o) => o.id === metric)?.unit ?? "";

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardSectionLabel>Learned Normal Behavior</CardSectionLabel>
          <p className="mt-1 text-xs font-light text-text-secondary">
            7-day P10–P90 envelope per hour-of-day · current vs expected
          </p>
        </div>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
          className="min-h-9 rounded-btn border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
        >
          {METRIC_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-md border border-border bg-surface-2/60 p-3 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-dim">
            Current
          </p>
          <p className="kpi-value mt-0.5 text-lg tabular text-text-primary">
            {currentValue == null ? "—" : currentValue.toFixed(1)}
            {currentValue != null ? (
              <span className="ml-0.5 text-[11px] font-light text-text-dim">
                {unit}
              </span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-dim">
            Expected (this hour)
          </p>
          <p className="mt-0.5 text-sm tabular text-text-secondary">
            {currentPoint
              ? `${currentPoint.p10.toFixed(1)} – ${currentPoint.p90.toFixed(1)}`
              : "—"}
          </p>
          {currentPoint ? (
            <p className="mono text-[11px] text-text-dim">
              median {currentPoint.p50.toFixed(1)}
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-dim">
            Verdict
          </p>
          <p
            className={cn(
              "mt-0.5 text-sm font-medium",
              verdictTone === "safe" && "text-safe",
              verdictTone === "warning" && "text-amber",
              verdictTone === "info" && "text-text-secondary"
            )}
          >
            {verdictLabel}
          </p>
        </div>
      </div>

      <div className="h-[200px]">
        {loading && series.length === 0 ? (
          <Skeleton className="h-full w-full" />
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-text-dim">
            Not enough history yet to learn a profile.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series}>
              <defs>
                <linearGradient id="learned-band" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="#1f2a3a" />
              <XAxis
                dataKey="hourLabel"
                stroke="#5c6a82"
                tick={{ fill: "#9aa7bb", fontSize: 10 }}
                minTickGap={20}
              />
              <YAxis
                stroke="#5c6a82"
                tick={{ fill: "#9aa7bb", fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#0b1018",
                  border: "1px solid #1f2a3a",
                  borderRadius: 8,
                  color: "#e6edf7",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#9aa7bb" }} />
              <Area
                type="monotone"
                dataKey="p90"
                stroke="transparent"
                fill="url(#learned-band)"
                name="P90"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="p10"
                stroke="transparent"
                fill="#0b1018"
                name="P10"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                name="Median"
              />
              {currentPoint && currentValue != null ? (
                <ReferenceDot
                  x={currentPoint.hourLabel}
                  y={currentValue}
                  r={5}
                  fill={verdictTone === "warning" ? "#ef4444" : "#10b981"}
                  stroke="#0b1018"
                  strokeWidth={2}
                  isFront
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
