"use client";

import { useEffect, useMemo, useState } from "react";
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
import { AlertTriangle, ChevronDown, Filter, ShieldAlert, Thermometer, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import {
  fetchAlerts,
  fetchDashboardStats,
  fetchDevices,
  fetchLatestTelemetry,
  fetchRooms,
  fetchTelemetryHistory,
} from "@/lib/api";
import type { DeviceRow, Room, TelemetryHistoryResponse } from "@/types/domain";
import { cn } from "@/lib/utils";
import type { TelemetryReading } from "@/types/telemetry";

type MetricKey =
  | "temperature"
  | "humidity"
  | "gas"
  | "smoke"
  | "motion"
  | "light";

const METRICS: { id: MetricKey; label: string; unit: string }[] = [
  { id: "temperature", label: "Temperature", unit: "degC" },
  { id: "humidity", label: "Humidity", unit: "%" },
  { id: "gas", label: "Gas", unit: "ppm" },
  { id: "smoke", label: "Smoke", unit: "ppm" },
  { id: "motion", label: "Motion", unit: "0/1" },
  { id: "light", label: "Light", unit: "lux" },
];
const CARD_METRICS: MetricKey[] = ["temperature", "humidity", "gas", "smoke", "motion"];

const RANGES = [
  { id: "1h", label: "Last hour" },
  { id: "24h", label: "Last 24h" },
  { id: "7d", label: "Last 7 days" },
] as const;

const METRIC_COLORS: Record<MetricKey, string> = {
  temperature: "#16a34a",
  humidity: "#3b82f6",
  gas: "#d97706",
  smoke: "#dc2626",
  motion: "#8b5cf6",
  light: "#f59e0b",
};

function metricLabel(metric: MetricKey): string {
  return METRICS.find((m) => m.id === metric)?.label ?? metric;
}

function metricUnit(metric: MetricKey): string {
  return METRICS.find((m) => m.id === metric)?.unit ?? "";
}

function metricStroke(metric: MetricKey): string {
  return METRIC_COLORS[metric];
}

function fmt(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function SparkMetricCard({
  metric,
  latest,
  points,
}: {
  metric: MetricKey;
  latest: number | null;
  points: { t: string; v: number | null }[];
}) {
  const stroke = metricStroke(metric);
  const label = metricLabel(metric);
  return (
    <Card className="min-w-[180px] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-light text-text-dim">{label}</p>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stroke }} />
      </div>
      <p className="kpi-value mb-2 text-2xl text-text-primary" style={{ color: stroke }}>
        {metric === "motion"
          ? latest == null
            ? "—"
            : latest >= 0.5
              ? "Detected"
              : "Clear"
          : `${fmt(latest)} ${metricUnit(metric)}`}
      </p>
      <div className="h-12">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points.map((p) => ({
              t: new Date(p.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              v: p.v,
            }))}
          >
            <Line
              type="monotone"
              dataKey="v"
              stroke={stroke}
              strokeWidth={1.8}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function TelemetryPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [room, setRoom] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [singleMetric, setSingleMetric] = useState<MetricKey>("temperature");
  const [viewMode, setViewMode] = useState<"multi" | "single">("multi");
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>([
    "temperature",
    "humidity",
    "gas",
    "smoke",
  ]);
  const [range, setRange] = useState<string>("24h");
  const [histories, setHistories] = useState<Partial<Record<MetricKey, TelemetryHistoryResponse>>>({});
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryReading[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<number>(0);
  const [devicesOnline, setDevicesOnline] = useState<string>("—");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const {
    readings,
    timeline,
    anomalyThreshold,
    latencyStats,
    throughputStats,
    performanceSummary,
  } = useLiveTelemetry();

  useEffect(() => {
    void (async () => {
      try {
        const [r, d] = await Promise.all([fetchRooms(), fetchDevices()]);
        setRooms(r);
        setDevices(d);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "failed to load filters");
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const targetMetrics =
        viewMode === "single"
          ? [singleMetric]
          : (Array.from(new Set([...selectedMetrics, ...CARD_METRICS])) as MetricKey[]);

      const [histRes, latest, alerts, stats] = await Promise.all([
        Promise.all(
          targetMetrics.map(async (m) => {
            const res = await fetchTelemetryHistory({
              metric: m,
              range,
              room: room || undefined,
              device_id: deviceId || undefined,
            });
            return [m, res] as const;
          })
        ),
        fetchLatestTelemetry(),
        fetchAlerts("active"),
        fetchDashboardStats(),
      ]);

      setHistories(
        histRes.reduce((acc, [m, res]) => {
          acc[m] = res;
          return acc;
        }, {} as Partial<Record<MetricKey, TelemetryHistoryResponse>>)
      );
      setLatestTelemetry(latest.readings);
      setActiveAlerts(alerts.length);
      setDevicesOnline(`${stats.devices_online}/${stats.devices_total}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, room, deviceId, viewMode, singleMetric, selectedMetrics.join(",")]);

  const filteredLatest = useMemo(() => {
    return latestTelemetry.filter((r) => {
      if (room && r.room !== room) return false;
      if (deviceId && r.device_id !== deviceId) return false;
      return true;
    });
  }, [latestTelemetry, room, deviceId]);

  const topReading = useMemo(() => {
    if (filteredLatest.length === 0) return null;
    return filteredLatest.reduce((best, cur) => {
      const b = best.risk_score ?? -1;
      const c = cur.risk_score ?? -1;
      return c > b ? cur : best;
    });
  }, [filteredLatest]);

  const chartMetrics = useMemo(
    () => (viewMode === "single" ? [singleMetric] : selectedMetrics),
    [viewMode, singleMetric, selectedMetrics]
  );
  const chartData = useMemo(() => {
    const anomalyBuckets = new Set(
      timeline
        .filter((p) => p.anomaly)
        .map((p) => new Date(p.timestamp).toISOString().slice(0, 16))
    );
    const byTime = new Map<string, { t: string } & Partial<Record<MetricKey, number | null>>>();
    for (const m of chartMetrics) {
      const points = histories[m]?.points ?? [];
      for (const p of points) {
        const key = p.t;
        const row = byTime.get(key) ?? { t: key };
        row[m] = p.v;
        byTime.set(key, row);
      }
    }
    return Array.from(byTime.values())
      .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
      .map((r) => {
        const anomalyKey = new Date(r.t).toISOString().slice(0, 16);
        const temp = r.temperature ?? null;
        return {
          ...r,
          tLabel: new Date(r.t).toLocaleString(),
          anomaly: anomalyBuckets.has(anomalyKey) ? temp : null,
        };
      });
  }, [histories, chartMetrics, timeline]);

  const latestByMetric = useMemo(() => {
    const out = {} as Record<MetricKey, number | null>;
    for (const m of METRICS.map((x) => x.id)) {
      const points = histories[m]?.points ?? [];
      out[m] = points.length > 0 ? points[points.length - 1].v : null;
    }
    return out;
  }, [histories]);

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <div className="mb-4">
        <h1 className="text-[28px] font-bold">Telemetry</h1>
        <p className="text-sm font-light text-text-secondary">
          Historical and real-time sensor analytics
        </p>
      </div>

      {/* Dense KPI cards reduce eye travel during real-time monitoring, which is why
          BI/Grafana-style dashboards cluster high-value status indicators first. */}
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4">
          <Thermometer className="h-4 w-4 text-accent" />
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Current temp</span>
          <span className="ml-auto font-display text-sm font-semibold text-slate-100">
            {fmt(latestByMetric.temperature)} degC
          </span>
        </div>
        <div className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4">
          <ShieldAlert className="h-4 w-4 text-accent" />
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Risk level</span>
          <span className="ml-auto font-display text-sm font-semibold text-slate-100">
            {topReading?.risk_level ?? "SAFE"}
          </span>
        </div>
        <div className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4">
          <AlertTriangle className="h-4 w-4 text-amber" />
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Alerts</span>
          <span className="ml-auto font-display text-sm font-semibold text-slate-100">
            {activeAlerts}
          </span>
        </div>
        <div className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4">
          <Wifi className="h-4 w-4 text-accent" />
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Devices active</span>
          <span className="ml-auto font-display text-sm font-semibold text-slate-100">
            {devicesOnline}
          </span>
        </div>
      </div>

      <div className="mb-4 md:hidden">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          onClick={() => setMobileFiltersOpen((v) => !v)}
        >
          <span className="inline-flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", mobileFiltersOpen && "rotate-180")}
          />
        </Button>
      </div>

      <div
        className={cn(
          "mb-4 rounded-card border border-border bg-surface p-4 shadow-card",
          !mobileFiltersOpen && "hidden md:block"
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <label className="text-xs text-text-secondary">
            Room
            <select
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            >
              <option value="">All rooms</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Device
            <select
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="">All devices</option>
              {devices.map((d) => (
                <option key={d.id} value={d.device_id}>
                  {d.device_id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Chart mode
            <select
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as "multi" | "single")}
            >
              <option value="multi">Multi-metric</option>
              <option value="single">Single metric</option>
            </select>
          </label>
          {viewMode === "single" ? (
            <label className="text-xs text-text-secondary">
              Metric
              <select
                className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                value={singleMetric}
                onChange={(e) => setSingleMetric(e.target.value as MetricKey)}
              >
                {METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="lg:col-span-2">
            <p className="mb-1 text-xs text-text-secondary">Metrics</p>
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map((m) => {
                const active = selectedMetrics.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setSelectedMetrics((prev) => {
                        if (viewMode === "single") return prev;
                        if (prev.includes(m.id)) {
                          if (prev.length === 1) return prev;
                          return prev.filter((x) => x !== m.id);
                        }
                        return [...prev, m.id];
                      })
                    }
                    disabled={viewMode === "single"}
                    className={cn(
                      "min-h-11 rounded-btn border px-2.5 text-xs font-body transition",
                      active
                        ? "border-accent text-accent"
                        : "border-border text-text-secondary hover:bg-surface-2",
                      viewMode === "single" && "opacity-50"
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="text-xs text-text-secondary">
            Window
            <div className="mt-1 flex gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={cn(
                    "min-h-11 rounded-lg border px-2 text-xs font-body",
                    range === r.id
                      ? "border-accent bg-accent text-white"
                      : "border-border text-text-secondary hover:bg-surface-2"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </label>
          <div className="flex items-end">
            <Button type="button" onClick={() => void load()} disabled={loading} className="w-full">
              {loading ? "Loading..." : "Reload"}
            </Button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-sm border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          {err}
        </div>
      ) : null}

      <Card className="mb-4 border-border/60 bg-slate-900/70 p-3 md:p-4">
        {loading ? (
          <div className="flex h-[200px] animate-pulse items-center justify-center text-sm text-text-secondary md:h-[280px]">
            Loading telemetry analytics...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-text-secondary md:h-[280px]">
            No points in this window yet — generate telemetry from the simulator.
          </div>
        ) : (
          <div className="h-[200px] md:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="2 6" stroke="#334155" />
                <XAxis
                  dataKey="tLabel"
                  stroke="#94a3b8"
                  tick={{
                    fill: "#94a3b8",
                    fontFamily: "Inter",
                    fontSize: 11,
                  }}
                  minTickGap={28}
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{
                    fill: "#94a3b8",
                    fontFamily: "Inter",
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  labelFormatter={(label) => String(label)}
                  formatter={(value: unknown, name: unknown) => {
                    if (String(name) === "anomaly") return ["Anomaly detected", "Status"];
                    const key = String(name) as MetricKey;
                    const numeric = typeof value === "number" ? value : null;
                    if (value == null) return ["—", metricLabel(key)];
                    if (key === "motion")
                      return [numeric != null && numeric >= 0.5 ? "Detected" : "Clear", metricLabel(key)];
                    return [
                      numeric == null ? "—" : `${numeric.toFixed(2)} ${metricUnit(key)}`,
                      metricLabel(key),
                    ];
                  }}
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.28)",
                    color: "#e2e8f0",
                    fontFamily: "Inter",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontFamily: "Inter", fontSize: 11 }} verticalAlign="bottom" />
                {chartMetrics.map((m) => (
                  <Line
                    key={m}
                    type="monotone"
                    dataKey={m}
                    name={m}
                    stroke={metricStroke(m)}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive
                    animationDuration={500}
                  />
                ))}
                <Scatter dataKey="anomaly" name="anomaly" fill="#ef4444" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm text-text-secondary">Sparkline Strip</h2>
        <span className="text-xs font-light text-text-dim">5 metrics</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-3 lg:grid-cols-5">
        {CARD_METRICS.map((m) => (
          <SparkMetricCard
            key={m}
            metric={m}
            latest={latestByMetric[m]}
            points={histories[m]?.points ?? []}
          />
        ))}
      </div>

      {/* Consolidating analytical modules in one dense telemetry workspace improves
          operator context switching time and makes anomaly triage faster. */}
      <div className="mt-4">
        <AnalyticsPanel
          timeline={timeline}
          readings={readings}
          anomalyThreshold={anomalyThreshold ?? 0.14}
          anomalyThresholdDynamic={anomalyThreshold != null}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Card className="border-border/60 bg-slate-900/70">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Latency</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {latencyStats.avg == null ? "—" : `${Math.round(latencyStats.avg)} ms`}
            </p>
            <p className="text-xs text-slate-500">
              {latencyStats.max == null ? "No live samples yet" : `Max ${Math.round(latencyStats.max)} ms`}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-slate-900/70">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Throughput</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {throughputStats.current == null ? "—" : `${throughputStats.current.toFixed(2)} msg/s`}
            </p>
            <p className="text-xs text-slate-500">
              {throughputStats.max == null ? "Waiting for stream" : `Peak ${throughputStats.max.toFixed(2)} msg/s`}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-slate-900/70">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Message loss</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {(performanceSummary.loss_rate * 100).toFixed(2)}%
            </p>
            <p className="text-xs text-slate-500">
              {performanceSummary.dropped_messages}/{performanceSummary.total_messages} dropped
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
