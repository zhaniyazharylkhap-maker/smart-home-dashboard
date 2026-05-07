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
  if (clamped <= 0.5) {
    const t = clamped / 0.5;
    const red = Math.round(46 + (250 - 46) * t);
    const green = Math.round(204 + (204 - 204) * t);
    const blue = Math.round(113 + (21 - 113) * t);
    return `rgba(${red},${green},${blue},0.9)`;
  }
  const t = (clamped - 0.5) / 0.5;
  const red = Math.round(250 + (239 - 250) * t);
  const green = Math.round(204 + (68 - 204) * t);
  const blue = Math.round(21 + (68 - 21) * t);
  return `rgba(${red},${green},${blue},0.92)`;
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
  const heatLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of heatRows) {
      map.set(`${cell.source}__${cell.bucket}`, cell.score);
    }
    return map;
  }, [heatRows]);

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
    <section className="grid gap-4 lg:grid-cols-2">
      <Card className="border-border/60 bg-slate-900/70 lg:col-span-2">
        <CardContent className="p-4 md:p-5">
          <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-400">
            Anomaly Overlay
          </h3>
          <p className="mb-2 text-xs text-slate-500">
            Live analytical layer across {readings.length} active devices.
          </p>
          <p className="mb-3 text-xs text-slate-500">
            {/* Threshold display improves interpretability of anomaly decisions. */}
            Threshold: {anomalyThreshold.toFixed(2)}{" "}
            {anomalyThresholdDynamic ? "(dynamic)" : "(fallback)"}
          </p>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={baseSeries}>
                <CartesianGrid strokeDasharray="2 6" stroke="#334155" />
                <XAxis
                  dataKey="tLabel"
                  minTickGap={24}
                  stroke="#94a3b8"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as { t?: string } | undefined;
                    return row?.t ? new Date(row.t).toLocaleString() : "";
                  }}
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
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  name="Temperature"
                />
                <Scatter dataKey="anomaly" fill="#ef4444" name="Anomaly" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-slate-900/70">
        <CardContent className="p-4 md:p-5">
          <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-400">
            Risk Heatmap (Hour x Room/Device)
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Buckets with warmer colors indicate concentrated high-risk periods.
          </p>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[520px] gap-1"
              style={{ gridTemplateColumns: `120px repeat(${heatBuckets.length}, minmax(48px,1fr))` }}
            >
              <div />
              {heatBuckets.map((bucket) => (
                <div key={bucket} className="text-center text-[10px] text-slate-500">
                  {bucket}
                </div>
              ))}
              {heatSources.map((source) => (
                <Fragment key={source}>
                  <div key={`${source}-label`} className="truncate text-[11px] text-slate-400">
                    {source}
                  </div>
                  {heatBuckets.map((bucket) => {
                    const raw = heatLookup.get(`${source}__${bucket}`) ?? 0;
                    const norm = normalizeHeatValue(raw, heatRange.min, heatRange.max);
                    return (
                      <div
                        key={`${source}-${bucket}`}
                        title={`${source} ${bucket} score=${raw.toFixed(1)}`}
                        className="h-6 rounded-[4px] border border-slate-800/70"
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

      <Card className="border-border/60 bg-slate-900/70">
        <CardContent className="p-4 md:p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wide text-slate-400">Device Comparison</h3>
            <div className="flex gap-2">
              <select
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300"
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
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300"
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
                <CartesianGrid strokeDasharray="2 6" stroke="#334155" />
                <XAxis
                  dataKey="tLabel"
                  minTickGap={20}
                  stroke="#94a3b8"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" />
                <Line
                  type="monotone"
                  dataKey="a"
                  name={compareA || deviceOptions[0] || "device A"}
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="b"
                  name={compareB || deviceOptions[1] || "device B"}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

