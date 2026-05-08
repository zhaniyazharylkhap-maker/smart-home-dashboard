"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import {
  fetchAnomalyExplanations,
  fetchBehaviorProfile,
  fetchSensorCorrelation,
} from "@/lib/api";
import type {
  AnomalyExplanationsResponse,
  BehaviorProfileResponse,
  CorrelationResponse,
} from "@/types/domain";
import type {
  LiveAnomalyDeviceState,
  LiveTelemetryPoint,
} from "@/hooks/use-live-telemetry";
import type { ContextualAnomalyEvent } from "@/types/telemetry";

type Props = {
  timeline: LiveTelemetryPoint[];
  anomalyByDevice: Record<string, LiveAnomalyDeviceState>;
  recentAnomalyEvents: ContextualAnomalyEvent[];
  defaultMetric?: "temperature" | "humidity" | "gas" | "smoke" | "light";
};

const RANGE_OPTIONS = [
  { id: "1h", label: "Last hour" },
  { id: "24h", label: "Last 24h" },
  { id: "7d", label: "Last 7 days" },
] as const;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

function correlationColor(value: number): string {
  // -1..0 -> blue scale; 0..1 -> orange scale.
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped >= 0) {
    const t = clamped;
    const r = Math.round(15 + (251 - 15) * t);
    const g = Math.round(23 + (146 - 23) * t);
    const b = Math.round(42 + (60 - 42) * t);
    return `rgba(${r},${g},${b},0.92)`;
  }
  const t = -clamped;
  const r = Math.round(15 + (37 - 15) * t);
  const g = Math.round(23 + (99 - 23) * t);
  const b = Math.round(42 + (235 - 42) * t);
  return `rgba(${r},${g},${b},0.92)`;
}

function ScoreRibbon({
  timeline,
  anomalyByDevice,
}: {
  timeline: LiveTelemetryPoint[];
  anomalyByDevice: Record<string, LiveAnomalyDeviceState>;
}) {
  const series = useMemo(() => {
    return timeline
      .slice(-300)
      .map((p) => ({
        t: p.timestamp,
        tLabel: formatTime(p.timestamp),
        score: p.anomaly_score ?? null,
        threshold: p.anomaly_threshold ?? null,
        anomaly: p.is_contextual_anomaly ? p.anomaly_score : null,
      }))
      .filter((p) => p.score != null);
  }, [timeline]);

  const aggregateThreshold = useMemo(() => {
    const recent = timeline
      .slice(-300)
      .map((p) => p.anomaly_threshold)
      .filter((v): v is number => typeof v === "number");
    if (recent.length === 0) return null;
    return recent[recent.length - 1];
  }, [timeline]);

  const liveDevices = Object.values(anomalyByDevice);

  return (
    <Card className="border-border/60 bg-slate-900/70 lg:col-span-2">
      <CardContent className="p-4 md:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wide text-slate-400">
            Live Anomaly Score
          </h3>
          <span className="text-xs text-slate-500">
            {aggregateThreshold == null
              ? "Adaptive threshold pending"
              : `Adaptive threshold ${aggregateThreshold.toFixed(1)}`}
          </span>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series}>
              <CartesianGrid strokeDasharray="2 6" stroke="#334155" />
              <XAxis
                dataKey="tLabel"
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                minTickGap={28}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" />
              <Area
                type="monotone"
                dataKey="threshold"
                stroke="#f59e0b"
                fill="#f59e0b22"
                strokeWidth={1.5}
                name="Adaptive threshold"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                name="Anomaly score"
              />
              <Line
                type="monotone"
                dataKey="anomaly"
                stroke="#ef4444"
                strokeWidth={0}
                dot={{ r: 3, fill: "#ef4444" }}
                name="Flagged"
                isAnimationActive={false}
              />
              {aggregateThreshold != null ? (
                <ReferenceLine y={aggregateThreshold} stroke="#f59e0b" strokeDasharray="3 3" />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {liveDevices.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            {liveDevices.map((d) => {
              const breach = d.is_contextual_anomaly;
              return (
                <div
                  key={d.device_id}
                  className={`rounded-xl border px-3 py-2 ${
                    breach
                      ? "border-red-500/60 bg-red-500/10"
                      : "border-slate-700 bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate">{d.device_id}</span>
                    <span>{d.room.replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xl font-semibold text-slate-100">
                      {d.anomaly_score.toFixed(1)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      thr {d.anomaly_threshold.toFixed(1)}
                    </span>
                  </div>
                  {d.explanation_tokens.length > 0 ? (
                    <p className="mt-1 truncate text-[11px] text-slate-300">
                      {d.explanation_tokens.slice(0, 2).join(" - ")}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Stable
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExplanationsPanel({
  recentAnomalyEvents,
  remote,
}: {
  recentAnomalyEvents: ContextualAnomalyEvent[];
  remote: AnomalyExplanationsResponse | null;
}) {
  const liveTokens = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of recentAnomalyEvents) {
      for (const tok of ev.explanation_tokens || []) {
        counts.set(tok, (counts.get(tok) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [recentAnomalyEvents]);

  const topFactors = (remote?.top_factors ?? []).length
    ? remote!.top_factors
    : liveTokens;

  const recentEvents = recentAnomalyEvents.length
    ? recentAnomalyEvents
    : (remote?.sample_events ?? []).map((e) => ({
        ...e,
        feature_contributions: e.feature_contributions || [],
      }));

  return (
    <Card className="border-border/60 bg-slate-900/70">
      <CardContent className="p-4 md:p-5">
        <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-400">
          Why Anomalous
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Top contextual factors and most recent flagged events.
        </p>
        <div className="mb-4 grid gap-2">
          {topFactors.length === 0 ? (
            <p className="text-xs text-slate-500">No flagged factors yet.</p>
          ) : (
            topFactors.slice(0, 6).map((tok) => (
              <div
                key={tok.label}
                className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5"
              >
                <span className="text-xs text-slate-200">{tok.label}</span>
                <span className="text-[11px] text-slate-400">x{tok.count}</span>
              </div>
            ))
          )}
        </div>
        <h4 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
          Recent flagged events
        </h4>
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {recentEvents.length === 0 ? (
            <p className="text-xs text-slate-500">No events yet.</p>
          ) : (
            recentEvents.slice(0, 8).map((ev, idx) => (
              <div
                key={`${ev.device_id}-${ev.timestamp}-${idx}`}
                className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{ev.device_id}</span>
                  <span>{formatTime(ev.timestamp)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-100">
                  Score {ev.anomaly_score.toFixed(1)} - threshold{" "}
                  {ev.anomaly_threshold.toFixed(1)}
                </p>
                {(ev.explanation_tokens || []).length > 0 ? (
                  <p className="mt-1 text-[11px] text-slate-300">
                    {(ev.explanation_tokens || []).join(" - ")}
                  </p>
                ) : null}
                {(ev.feature_contributions || []).length > 0 ? (
                  <p className="mt-1 text-[10px] text-slate-500">
                    {(ev.feature_contributions || [])
                      .slice(0, 3)
                      .map(
                        (c) =>
                          `${c.feature} z=${c.z >= 0 ? "+" : ""}${c.z.toFixed(2)}`
                      )
                      .join(" - ")}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BehavioralHeatmap({ timeline }: { timeline: LiveTelemetryPoint[] }) {
  const cells = useMemo(() => {
    const map = new Map<string, { source: string; bucket: string; score: number; count: number }>();
    for (const p of timeline.slice(-1500)) {
      if (p.anomaly_score == null) continue;
      const d = new Date(p.timestamp);
      const bucket = `${d.getHours().toString().padStart(2, "0")}:00`;
      const source = p.room || p.device_id;
      const key = `${source}__${bucket}`;
      const cur = map.get(key);
      if (!cur) {
        map.set(key, { source, bucket, score: p.anomaly_score, count: 1 });
      } else {
        cur.score = (cur.score * cur.count + (p.anomaly_score ?? 0)) / (cur.count + 1);
        cur.count += 1;
      }
    }
    return Array.from(map.values());
  }, [timeline]);

  const buckets = useMemo(
    () => Array.from(new Set(cells.map((c) => c.bucket))).sort(),
    [cells]
  );
  const sources = useMemo(
    () => Array.from(new Set(cells.map((c) => c.source))).sort(),
    [cells]
  );
  const lookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) m.set(`${c.source}__${c.bucket}`, c.score);
    return m;
  }, [cells]);

  return (
    <Card className="border-border/60 bg-slate-900/70">
      <CardContent className="p-4 md:p-5">
        <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-400">
          Behavioral Heatmap (Hour x Room/Device)
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Each cell averages the anomaly score for that source within an hour.
        </p>
        {sources.length === 0 ? (
          <p className="text-xs text-slate-500">Waiting for live anomaly samples.</p>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[520px] gap-1"
              style={{
                gridTemplateColumns: `120px repeat(${buckets.length}, minmax(36px,1fr))`,
              }}
            >
              <div />
              {buckets.map((b) => (
                <div key={b} className="text-center text-[10px] text-slate-500">
                  {b}
                </div>
              ))}
              {sources.map((s) => (
                <Fragment key={s}>
                  <div className="truncate text-[11px] text-slate-400">
                    {s.replace(/_/g, " ")}
                  </div>
                  {buckets.map((b) => {
                    const v = lookup.get(`${s}__${b}`) ?? 0;
                    const norm = Math.max(0, Math.min(1, v / 100));
                    const r = Math.round(46 + (239 - 46) * norm);
                    const g = Math.round(204 + (68 - 204) * norm);
                    const blue = Math.round(113 + (68 - 113) * norm);
                    return (
                      <div
                        key={`${s}-${b}`}
                        title={`${s} ${b} score=${v.toFixed(1)}`}
                        className="h-6 rounded-[4px] border border-slate-800/70"
                        style={{ backgroundColor: `rgba(${r},${g},${blue},0.92)` }}
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CorrelationPanel({ data }: { data: CorrelationResponse | null }) {
  return (
    <Card className="border-border/60 bg-slate-900/70">
      <CardContent className="p-4 md:p-5">
        <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-400">
          Cross-Sensor Correlation
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Pearson correlation across sensor channels (last 24h, n=
          {data?.sample_size ?? 0}).
        </p>
        {!data || data.cells.length === 0 ? (
          <p className="text-xs text-slate-500">Need more telemetry samples.</p>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `120px repeat(${data.metrics.length}, minmax(64px,1fr))`,
              }}
            >
              <div />
              {data.metrics.map((m) => (
                <div key={`hdr-${m}`} className="text-center text-[10px] text-slate-500">
                  {m}
                </div>
              ))}
              {data.metrics.map((row) => (
                <Fragment key={`row-${row}`}>
                  <div className="truncate text-[11px] text-slate-400">
                    {row}
                  </div>
                  {data.metrics.map((col) => {
                    if (row === col) {
                      return (
                        <div
                          key={`${row}-${col}`}
                          className="flex h-7 items-center justify-center rounded-[4px] border border-slate-800/70 bg-slate-950 text-[10px] text-slate-400"
                        >
                          1.00
                        </div>
                      );
                    }
                    const cell = data.cells.find(
                      (c) =>
                        (c.a === row && c.b === col) ||
                        (c.a === col && c.b === row)
                    );
                    const value = cell?.correlation ?? 0;
                    return (
                      <div
                        key={`${row}-${col}`}
                        title={`${row} vs ${col} = ${value.toFixed(3)}`}
                        className="flex h-7 items-center justify-center rounded-[4px] border border-slate-800/70 text-[10px] text-slate-100"
                        style={{ backgroundColor: correlationColor(value) }}
                      >
                        {value.toFixed(2)}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NormalBehaviorPanel({
  metric,
  setMetric,
  data,
}: {
  metric: string;
  setMetric: (m: "temperature" | "humidity" | "gas" | "smoke" | "light") => void;
  data: BehaviorProfileResponse | null;
}) {
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

  return (
    <Card className="border-border/60 bg-slate-900/70 lg:col-span-2">
      <CardContent className="p-4 md:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wide text-slate-400">
            Learned Normal Behavior (7d quantile envelope)
          </h3>
          <select
            value={metric}
            onChange={(e) =>
              setMetric(
                e.target.value as
                  | "temperature"
                  | "humidity"
                  | "gas"
                  | "smoke"
                  | "light"
              )
            }
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          >
            {(["temperature", "humidity", "gas", "smoke", "light"] as const).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <p className="mb-2 text-xs text-slate-500">
          Median (line) and p10 - p90 envelope per hour-of-day. Departures from
          this envelope at the same hour are what the model is trained to flag.
        </p>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series}>
              <CartesianGrid strokeDasharray="2 6" stroke="#334155" />
              <XAxis
                dataKey="hourLabel"
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                minTickGap={20}
              />
              <YAxis stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" />
              <Area
                type="monotone"
                dataKey="p10"
                stroke="#0ea5e9"
                strokeWidth={1}
                fill="transparent"
                name="p10"
              />
              <Area
                type="monotone"
                dataKey="p90"
                stroke="#0ea5e9"
                strokeWidth={1}
                fill="#0ea5e933"
                name="p90"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                name="p50"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function ContextualAnalyticsPanel({
  timeline,
  anomalyByDevice,
  recentAnomalyEvents,
  defaultMetric = "temperature",
}: Props) {
  const [explanations, setExplanations] = useState<AnomalyExplanationsResponse | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationResponse | null>(null);
  const [profile, setProfile] = useState<BehaviorProfileResponse | null>(null);
  const [metric, setMetric] = useState<
    "temperature" | "humidity" | "gas" | "smoke" | "light"
  >(defaultMetric);
  const [range] = useState<(typeof RANGE_OPTIONS)[number]["id"]>("24h");

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [exp, corr] = await Promise.all([
          fetchAnomalyExplanations(range),
          fetchSensorCorrelation(range),
        ]);
        if (!alive) return;
        setExplanations(exp);
        setCorrelation(corr);
      } catch {
        /* swallow; live ws still drives recentAnomalyEvents */
      }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [range]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await fetchBehaviorProfile({ metric, days: 7 });
        if (!alive) return;
        setProfile(data);
      } catch {
        /* ignore */
      }
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [metric]);

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <ScoreRibbon timeline={timeline} anomalyByDevice={anomalyByDevice} />
      <ExplanationsPanel
        recentAnomalyEvents={recentAnomalyEvents}
        remote={explanations}
      />
      <BehavioralHeatmap timeline={timeline} />
      <CorrelationPanel data={correlation} />
      <NormalBehaviorPanel metric={metric} setMetric={setMetric} data={profile} />
    </section>
  );
}
