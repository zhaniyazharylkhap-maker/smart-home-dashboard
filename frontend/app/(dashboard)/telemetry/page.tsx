"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, ShieldAlert, Thermometer, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  temperature: "hsl(12 90% 62%)",
  humidity: "hsl(199 89% 58%)",
  gas: "hsl(40 95% 58%)",
  smoke: "hsl(0 85% 62%)",
  motion: "hsl(268 80% 66%)",
  light: "hsl(52 92% 62%)",
};

function metricLabel(metric: MetricKey): string {
  return METRICS.find((m) => m.id === metric)?.label ?? metric;
}

function metricUnit(metric: MetricKey): string {
  return METRICS.find((m) => m.id === metric)?.unit ?? "";
}

function getTemperatureColor(v: number | null): string {
  if (v == null) return "hsl(215 20% 65%)";
  if (v < 18) return "hsl(206 90% 62%)";
  if (v <= 25) return "hsl(145 70% 48%)";
  if (v <= 30) return "hsl(35 92% 58%)";
  return "hsl(0 85% 62%)";
}

function metricStroke(metric: MetricKey, latest: number | null): string {
  if (metric === "temperature") return getTemperatureColor(latest);
  return METRIC_COLORS[metric];
}

function fmt(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function riskTone(level: string | null | undefined): string {
  if (level === "CRITICAL") return "bg-rose-500/15 text-rose-300 border-rose-500/40";
  if (level === "WARNING") return "bg-amber-500/15 text-amber-200 border-amber-500/40";
  return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
}

function KpiBlock({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/25 bg-emerald-500/5"
      : tone === "warn"
        ? "border-amber-500/25 bg-amber-500/5"
        : tone === "bad"
          ? "border-rose-500/25 bg-rose-500/5"
          : "border-border/60 bg-card/40";
  return (
    <div className={cn("rounded-2xl border p-4", toneClass)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <Icon className="h-4 w-4 text-accent" />
      </div>
    </div>
  );
}

function MetricCard({
  metric,
  latest,
  points,
}: {
  metric: MetricKey;
  latest: number | null;
  points: { t: string; v: number | null }[];
}) {
  const stroke = metricStroke(metric, latest);
  const label = metricLabel(metric);
  return (
    <div className="rounded-2xl border border-border/60 bg-card/35 p-4 transition hover:border-accent/35 hover:shadow-glow">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stroke }} />
      </div>
      <p className="mb-2 text-2xl font-semibold tabular-nums" style={{ color: stroke }}>
        {metric === "motion"
          ? latest == null
            ? "—"
            : latest >= 0.5
              ? "Detected"
              : "Clear"
          : `${fmt(latest)} ${metricUnit(metric)}`}
      </p>
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points.map((p) => ({
              t: new Date(p.t).toLocaleTimeString(),
              v: p.v,
            }))}
          >
            <Area
              type="monotone"
              dataKey="v"
              stroke={stroke}
              fill={stroke}
              fillOpacity={0.14}
              strokeWidth={2}
              isAnimationActive
              animationDuration={450}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
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
      .map((r) => ({ ...r, tLabel: new Date(r.t).toLocaleString() }));
  }, [histories, chartMetrics]);

  const latestByMetric = useMemo(() => {
    const out = {} as Record<MetricKey, number | null>;
    for (const m of METRICS.map((x) => x.id)) {
      const points = histories[m]?.points ?? [];
      out[m] = points.length > 0 ? points[points.length - 1].v : null;
    }
    return out;
  }, [histories]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Analytics
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Telemetry</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Time-series from PostgreSQL, filtered by room and device. Metrics follow
          the unified sensor schema.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiBlock
          label="Current temperature"
          value={`${fmt(latestByMetric.temperature)} degC`}
          hint={room ? room.replace("_", " ") : "Across current filters"}
          icon={Thermometer}
          tone={
            (latestByMetric.temperature ?? 0) > 30
              ? "bad"
              : (latestByMetric.temperature ?? 0) > 25
                ? "warn"
                : "good"
          }
        />
        <KpiBlock
          label="Risk level"
          value={topReading?.risk_level ?? "SAFE"}
          hint={
            topReading?.risk_score == null
              ? "No risk score yet"
              : `score ${Math.round(topReading.risk_score)}/100`
          }
          icon={ShieldAlert}
          tone={
            topReading?.risk_level === "CRITICAL"
              ? "bad"
              : topReading?.risk_level === "WARNING"
                ? "warn"
                : "good"
          }
        />
        <KpiBlock
          label="Active alerts"
          value={String(activeAlerts)}
          hint="Unresolved incidents"
          icon={AlertTriangle}
          tone={activeAlerts > 0 ? "warn" : "good"}
        />
        <KpiBlock
          label="Devices online"
          value={devicesOnline}
          hint="Live device health"
          icon={Wifi}
        />
      </div>

      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-medium text-muted-foreground">
            Room
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
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
          <label className="text-xs font-medium text-muted-foreground">
            Device
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
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
          <label className="text-xs font-medium text-muted-foreground">
            Chart mode
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as "multi" | "single")}
            >
              <option value="multi">Multi-metric</option>
              <option value="single">Single metric</option>
            </select>
          </label>
          {viewMode === "single" ? (
            <label className="text-xs font-medium text-muted-foreground">
              Metric
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
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
          <label className="text-xs font-medium text-muted-foreground">
            Window
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              {RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Reload"}
        </Button>
      </div>

      {viewMode === "multi" ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {METRICS.map((m) => {
            const active = selectedMetrics.includes(m.id);
            const color = metricStroke(m.id, latestByMetric[m.id]);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  setSelectedMetrics((prev) => {
                    if (prev.includes(m.id)) {
                      if (prev.length === 1) return prev;
                      return prev.filter((x) => x !== m.id);
                    }
                    return [...prev, m.id];
                  })
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition",
                  active
                    ? "border-border bg-muted/60 text-foreground"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:bg-muted/30"
                )}
                style={active ? { boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {err ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {err}
        </div>
      ) : null}

      <div className={cn("mb-6 h-[420px] rounded-2xl border border-border/60 bg-card/30 p-4")}>
        {loading ? (
          <div className="flex h-full animate-pulse items-center justify-center text-sm text-muted-foreground">
            Loading telemetry analytics...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No points in this window yet — generate telemetry from the simulator.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="hsl(217 33% 17%)" strokeDasharray="3 3" />
              <XAxis
                dataKey="tLabel"
                tick={{ fill: "hsl(215 20% 65%)", fontSize: 11 }}
                minTickGap={28}
              />
              <YAxis tick={{ fill: "hsl(215 20% 65%)", fontSize: 11 }} />
              <Tooltip
                formatter={(value: unknown, name: unknown) => {
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
                  background: "hsl(222 40% 9%)",
                  border: "1px solid hsl(217 33% 17%)",
                  borderRadius: 12,
                }}
              />
              {chartMetrics.map((m) => (
                <Line
                  key={m}
                  type="monotone"
                  dataKey={m}
                  name={m}
                  stroke={metricStroke(m, latestByMetric[m])}
                  strokeWidth={2.2}
                  dot={false}
                  isAnimationActive
                  animationDuration={500}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mb-6 flex items-center gap-2 text-xs">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="text-muted-foreground">Live telemetry stream active</span>
        {topReading?.risk_level ? (
          <span className={cn("ml-2 rounded-full border px-2 py-0.5", riskTone(topReading.risk_level))}>
            {topReading.risk_level}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {CARD_METRICS.map((m) => (
          <MetricCard
            key={m}
            metric={m}
            latest={latestByMetric[m]}
            points={histories[m]?.points ?? []}
          />
        ))}
      </div>
    </div>
  );
}
