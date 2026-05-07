"use client";

import { Fragment, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import type { LiveTelemetryPoint } from "@/hooks/use-live-telemetry";
import type { TelemetryReading } from "@/types/telemetry";

type Props = {
  timeline: LiveTelemetryPoint[];
  readings: TelemetryReading[];
  anomalyThreshold: number;
  anomalyThresholdDynamic: boolean;
};

type HeatCell = {
  bucket: string;
  source: string;
  score: number;
};

function normalize01(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function colorFrom01(v: number): string {
  const clamped = Math.max(0, Math.min(1, v));
  const red = Math.round(255 * clamped);
  const green = Math.round(180 * (1 - clamped) + 50);
  return `rgba(${red},${green},80,0.85)`;
}

function normalizeHeatValue(value: number, min: number, max: number): number {
  if (max === min) return 0;
  // Normalization improves heatmap readability by stretching local variance.
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

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

  const heatRows = useMemo(() => {
    // Heatmap highlights high-risk periods; this is more interpretable than raw
    // tables when validating anomaly concentration across time and sources.
    const byKey = new Map<string, HeatCell>();
    for (const p of timeline.slice(-1200)) {
      const d = new Date(p.timestamp);
      const bucket = `${d.getHours().toString().padStart(2, "0")}:00`;
      const source = p.room || p.device_id;
      const score = p.risk_score ?? (p.anomaly ? 75 : 0);
      const key = `${bucket}__${source}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { bucket, source, score });
      } else {
        prev.score = (prev.score + score) / 2;
      }
    }
    return Array.from(byKey.values());
  }, [timeline]);

  const heatBuckets = useMemo(
    () => Array.from(new Set(heatRows.map((x) => x.bucket))).sort(),
    [heatRows]
  );
  const heatSources = useMemo(
    () => Array.from(new Set(heatRows.map((x) => x.source))).sort(),
    [heatRows]
  );
  const heatRange = useMemo(
    () => {
      // Rolling min/max prevents abrupt heatmap palette shifts as the full
      // dataset grows, keeping visual interpretation stable over time.
      const rollingScores = timeline
        .slice(-300)
        .map((x) => x.risk_score ?? (x.anomaly ? 75 : 0));
      return normalize01(rollingScores);
    },
    [timeline]
  );

  const compareData = useMemo(() => {
    const a = compareA || deviceOptions[0];
    const b = compareB || deviceOptions[1];
    if (!a || !b) return [];
    const merged = new Map<string, { t: string; a?: number | null; b?: number | null }>();
    for (const p of timeline.slice(-600)) {
      if (p.device_id !== a && p.device_id !== b) continue;
      const row = merged.get(p.timestamp) ?? { t: p.timestamp };
      if (p.device_id === a) row.a = p.value;
      if (p.device_id === b) row.b = p.value;
      merged.set(p.timestamp, row);
    }
    return Array.from(merged.values())
      .sort((x, y) => new Date(x.t).getTime() - new Date(y.t).getTime())
      .map((x) => ({
        ...x,
        tLabel: new Date(x.t).toLocaleTimeString(),
      }));
  }, [compareA, compareB, deviceOptions, timeline]);

  return (
    <section className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardContent className="p-4">
          <h3 className="mb-2 text-sm text-text-secondary">Temperature with anomaly overlay</h3>
          <p className="mb-2 text-xs text-text-dim">
            Live analytical layer across {readings.length} active devices.
          </p>
          <p className="mb-2 text-xs text-text-dim">
            {/* Threshold display improves interpretability of anomaly decisions. */}
            Threshold: {anomalyThreshold.toFixed(2)}{" "}
            {anomalyThresholdDynamic ? "(dynamic)" : "(fallback)"}
          </p>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={baseSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d4e6d4" />
                <XAxis dataKey="tLabel" minTickGap={24} />
                <YAxis />
                <Tooltip
                  formatter={(value, name, item) => {
                    const row = item.payload as {
                      risk: number;
                      t: string;
                    };
                    if (name === "anomaly") {
                      return [
                        `${Number(value).toFixed(2)} (score ${row.risk.toFixed(1)})`,
                        `Anomaly @ ${new Date(row.t).toLocaleTimeString()}`,
                      ];
                    }
                    return [value, "Temperature"];
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#16a34a" dot={false} name="Temperature" />
                <Scatter dataKey="anomaly" fill="#dc2626" name="anomaly" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="mb-2 text-sm text-text-secondary">Risk heatmap (time x room/device)</h3>
          <p className="mb-3 text-xs text-text-dim">
            Buckets with warmer colors indicate concentrated high-risk periods.
          </p>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[520px] gap-1"
              style={{ gridTemplateColumns: `120px repeat(${heatBuckets.length}, minmax(48px,1fr))` }}
            >
              <div />
              {heatBuckets.map((bucket) => (
                <div key={bucket} className="text-center text-[10px] text-text-dim">
                  {bucket}
                </div>
              ))}
              {heatSources.map((source) => (
                <Fragment key={source}>
                  <div key={`${source}-label`} className="truncate text-[11px] text-text-secondary">
                    {source}
                  </div>
                  {heatBuckets.map((bucket) => {
                    const cell = heatRows.find((h) => h.source === source && h.bucket === bucket);
                    const raw = cell?.score ?? 0;
                    const norm = normalizeHeatValue(raw, heatRange.min, heatRange.max);
                    return (
                      <div
                        key={`${source}-${bucket}`}
                        title={`${source} ${bucket} score=${raw.toFixed(1)}`}
                        className="h-6 rounded"
                        style={{ backgroundColor: colorFrom01(norm) }}
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm text-text-secondary">Device comparison</h3>
            <div className="flex gap-2">
              <select
                className="rounded border border-border bg-surface px-2 py-1 text-xs"
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
              >
                {deviceOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-border bg-surface px-2 py-1 text-xs"
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
              >
                {deviceOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={compareData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d4e6d4" />
                <XAxis dataKey="tLabel" minTickGap={20} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="a" name={compareA || deviceOptions[0] || "device A"} stroke="#0ea5e9" dot={false} />
                <Line type="monotone" dataKey="b" name={compareB || deviceOptions[1] || "device B"} stroke="#f97316" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

