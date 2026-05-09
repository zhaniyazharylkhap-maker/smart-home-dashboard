"use client";

import { useMemo, useState } from "react";

import { ThresholdBandChart } from "@/components/analytics/threshold-band-chart";
import { Card, CardSectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ACCENT_HEX } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { LiveTelemetryPoint } from "@/hooks/use-live-telemetry";
import type { TelemetryReading } from "@/types/telemetry";

type Props = {
  timeline: LiveTelemetryPoint[];
  readings: TelemetryReading[];
  anomalyThreshold: number;
  anomalyThresholdDynamic: boolean;
};

export function AnalyticsPanel({
  timeline,
  readings,
  anomalyThreshold,
  anomalyThresholdDynamic,
}: Props) {
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");

  const deviceOptions = useMemo(
    () => Array.from(new Set(timeline.map((p) => p.device_id))).sort(),
    [timeline]
  );

  const baseSeries = useMemo(
    () =>
      timeline
        .slice(-300)
        .map((p) => ({
          t: p.timestamp,
          tLabel: new Date(p.timestamp).toLocaleTimeString(),
          value: p.value,
          risk: p.risk_score ?? 0,
          anomaly: p.anomaly ? p.value : null,
        })),
    [timeline]
  );

  const compareData = useMemo(() => {
    const a = compareA || deviceOptions[0];
    const b = compareB || deviceOptions[1];
    if (!a || !b) return [];
    const merged = new Map<
      string,
      { t: string; tLabel: string; a?: number | null; b?: number | null }
    >();
    for (const p of timeline.slice(-600)) {
      if (p.device_id !== a && p.device_id !== b) continue;
      const row = merged.get(p.timestamp) ?? {
        t: p.timestamp,
        tLabel: new Date(p.timestamp).toLocaleTimeString(),
      };
      if (p.device_id === a) row.a = p.value;
      if (p.device_id === b) row.b = p.value;
      merged.set(p.timestamp, row);
    }
    return Array.from(merged.values()).sort(
      (x, y) => new Date(x.t).getTime() - new Date(y.t).getTime()
    );
  }, [compareA, compareB, deviceOptions, timeline]);

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardSectionLabel>Anomaly Overlay</CardSectionLabel>
            <p className="mt-1 text-xs font-light text-text-secondary">
              Live analytical layer across {readings.length} active devices
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-[11px] mono text-text-secondary">
            threshold {anomalyThreshold.toFixed(2)}
            <span
              className={cn(
                "text-[10px] uppercase",
                anomalyThresholdDynamic ? "text-accent" : "text-text-dim"
              )}
            >
              {anomalyThresholdDynamic ? "dynamic" : "fallback"}
            </span>
          </span>
        </div>
        {baseSeries.length === 0 ? (
          <EmptyState
            title="Waiting for live samples"
            description="Anomaly overlay activates once readings stream in."
          />
        ) : (
          <ThresholdBandChart
            data={baseSeries.map((p) => ({
              t: p.t,
              tLabel: p.tLabel,
              temperature: p.value,
              anomaly: p.anomaly ?? null,
            }))}
            series={[
              {
                key: "temperature",
                label: "Temperature",
                stroke: ACCENT_HEX,
                unit: "°C",
              },
            ]}
            bands={{
              normal: [18, 26],
              warning: [26, 35],
              anomaly: [35, 70],
            }}
            height={260}
          />
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardSectionLabel>Device Comparison</CardSectionLabel>
            <p className="mt-1 text-xs font-light text-text-secondary">
              Side-by-side temperature stream for any two devices
            </p>
          </div>
          <div className="flex gap-2">
            <select
              className="min-h-9 rounded-btn border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary"
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
            >
              {deviceOptions.map((d) => (
                <option key={`a-${d}`} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className="min-h-9 rounded-btn border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary"
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
            >
              {deviceOptions.map((d) => (
                <option key={`b-${d}`} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        {compareData.length === 0 ? (
          <EmptyState
            title="Pick two devices"
            description="Choose two devices to compare their temperature streams."
          />
        ) : (
          <ThresholdBandChart
            data={compareData}
            series={[
              {
                key: "a",
                label: compareA || deviceOptions[0] || "device A",
                stroke: ACCENT_HEX,
                unit: "°C",
              },
              {
                key: "b",
                label: compareB || deviceOptions[1] || "device B",
                stroke: "#f59e0b",
                unit: "°C",
              },
            ]}
            bands={{
              normal: [18, 26],
            }}
            height={260}
          />
        )}
      </Card>
    </section>
  );
}
