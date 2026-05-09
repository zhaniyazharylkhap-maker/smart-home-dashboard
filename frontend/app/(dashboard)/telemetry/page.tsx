"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Filter,
  ShieldAlert,
  Thermometer,
  Wifi,
} from "lucide-react";

import { AnalyticsPanel } from "@/components/analytics-panel";
import { ContextualAnalyticsPanel } from "@/components/contextual-analytics-panel";
import {
  METRIC_BANDS,
  ThresholdBandChart,
  type ThresholdBandRow,
  type ThresholdBandSeries,
} from "@/components/analytics/threshold-band-chart";
import { Button } from "@/components/ui/button";
import { Card, CardSectionLabel } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import {
  fetchAlerts,
  fetchDashboardStats,
  fetchDevices,
  fetchLatestTelemetry,
  fetchRooms,
  fetchTelemetryHistory,
} from "@/lib/api";
import { ACCENT_HEX } from "@/lib/brand";
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
  { id: "temperature", label: "Temperature", unit: "°C" },
  { id: "humidity", label: "Humidity", unit: "%" },
  { id: "gas", label: "Gas", unit: "ppm" },
  { id: "smoke", label: "Smoke", unit: "ppm" },
  { id: "motion", label: "Motion", unit: "0/1" },
  { id: "light", label: "Light", unit: "lux" },
];
const CARD_METRICS: MetricKey[] = ["temperature", "humidity", "gas", "smoke", "motion"];

const RANGES = [
  { id: "1h", label: "1h" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
] as const;

const METRIC_COLORS: Record<MetricKey, string> = {
  temperature: ACCENT_HEX,
  humidity: "#3b82f6",
  gas: "#f59e0b",
  smoke: "#ef4444",
  motion: "#a855f7",
  light: "#facc15",
};

function metricLabel(metric: MetricKey): string {
  return METRICS.find((m) => m.id === metric)?.label ?? metric;
}

function metricUnit(metric: MetricKey): string {
  return METRICS.find((m) => m.id === metric)?.unit ?? "";
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
  const stroke = METRIC_COLORS[metric];
  const label = metricLabel(metric);
  const values = points.map((p) => p.v);
  return (
    <Card className="min-w-[180px] p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-text-dim">
          {label}
        </p>
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: stroke }}
        />
      </div>
      <p
        className="kpi-value tabular text-2xl"
        style={{ color: stroke }}
      >
        {metric === "motion"
          ? latest == null
            ? "—"
            : latest >= 0.5
              ? "On"
              : "Off"
          : fmt(latest)}
        {metric !== "motion" ? (
          <span className="ml-1 text-[10px] font-light text-text-dim">
            {metricUnit(metric)}
          </span>
        ) : null}
      </p>
      <Sparkline values={values} stroke={stroke} height={36} className="mt-1" />
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
    anomalyByDevice,
    recentAnomalyEvents,
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

  const chartData: ThresholdBandRow[] = useMemo(() => {
    const anomalyBuckets = new Set(
      timeline
        .filter((p) => p.anomaly)
        .map((p) => new Date(p.timestamp).toISOString().slice(0, 16))
    );
    const byTime = new Map<string, ThresholdBandRow>();
    for (const m of chartMetrics) {
      const points = histories[m]?.points ?? [];
      for (const p of points) {
        const key = p.t;
        const row =
          byTime.get(key) ??
          ({
            t: key,
            tLabel: new Date(key).toLocaleString(),
          } as ThresholdBandRow);
        row[m] = p.v;
        byTime.set(key, row);
      }
    }
    return Array.from(byTime.values())
      .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
      .map((r) => {
        const anomalyKey = new Date(r.t).toISOString().slice(0, 16);
        const temp = (r.temperature as number | null | undefined) ?? null;
        return {
          ...r,
          anomaly: anomalyBuckets.has(anomalyKey) ? temp ?? null : null,
        };
      });
  }, [histories, chartMetrics, timeline]);

  const chartSeries: ThresholdBandSeries[] = useMemo(
    () =>
      chartMetrics.map((m) => ({
        key: m,
        label: metricLabel(m),
        stroke: METRIC_COLORS[m],
        unit: metricUnit(m),
      })),
    [chartMetrics]
  );

  const primaryMetric: MetricKey =
    viewMode === "single" ? singleMetric : chartMetrics[0] ?? "temperature";

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
        <h1 className="text-[28px] font-bold leading-tight">Telemetry</h1>
        <p className="mt-1 text-sm font-light text-text-secondary">
          Historical and real-time sensor analytics with adaptive thresholds
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiPill
          icon={<Thermometer className="h-4 w-4 text-accent" />}
          label="Current temp"
          value={`${fmt(latestByMetric.temperature)} °C`}
        />
        <KpiPill
          icon={<ShieldAlert className="h-4 w-4 text-amber" />}
          label="Risk level"
          value={topReading?.risk_level ?? "SAFE"}
          tone={
            topReading?.risk_level === "CRITICAL"
              ? "danger"
              : topReading?.risk_level === "WARNING"
                ? "warning"
                : "default"
          }
        />
        <KpiPill
          icon={<AlertTriangle className="h-4 w-4 text-amber" />}
          label="Active alerts"
          value={String(activeAlerts)}
          tone={activeAlerts > 0 ? "warning" : "default"}
        />
        <KpiPill
          icon={<Wifi className="h-4 w-4 text-safe" />}
          label="Devices active"
          value={devicesOnline}
        />
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
            className={cn(
              "h-4 w-4 transition-transform",
              mobileFiltersOpen && "rotate-180"
            )}
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
          <label className="text-[11px] uppercase tracking-wider text-text-dim">
            Room
            <select
              className="mt-1 min-h-10 w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
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
          <label className="text-[11px] uppercase tracking-wider text-text-dim">
            Device
            <select
              className="mt-1 min-h-10 w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
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
          <label className="text-[11px] uppercase tracking-wider text-text-dim">
            Chart mode
            <select
              className="mt-1 min-h-10 w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as "multi" | "single")}
            >
              <option value="multi">Multi-metric</option>
              <option value="single">Single metric</option>
            </select>
          </label>
          {viewMode === "single" ? (
            <label className="text-[11px] uppercase tracking-wider text-text-dim">
              Metric
              <select
                className="mt-1 min-h-10 w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
                value={singleMetric}
                onChange={(e) =>
                  setSingleMetric(e.target.value as MetricKey)
                }
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
            <p className="mb-1 text-[11px] uppercase tracking-wider text-text-dim">
              Metrics
            </p>
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
                      "min-h-9 rounded-btn border px-3 text-xs font-body transition",
                      active
                        ? "border-accent/50 bg-accent-light text-accent"
                        : "border-border bg-surface-2 text-text-secondary hover:bg-surface-3",
                      viewMode === "single" && "opacity-50"
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-wider text-text-dim">
            Window
            <div className="mt-1 inline-flex overflow-hidden rounded-btn border border-border">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={cn(
                    "min-h-10 px-3 text-xs font-medium transition",
                    range === r.id
                      ? "bg-accent text-text-on-accent"
                      : "bg-surface-2 text-text-secondary hover:bg-surface-3"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Loading…" : "Reload"}
            </Button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-md border border-amber/30 bg-amber-light px-4 py-3 text-sm text-amber">
          {err}
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardSectionLabel>Time-series with threshold bands</CardSectionLabel>
            <p className="mt-1 text-xs font-light text-text-secondary">
              Normal · warning · anomaly zones derived from sensor profiles
              {anomalyThreshold != null ? (
                <>
                  {" · "}
                  <span className="mono">
                    adaptive threshold {anomalyThreshold.toFixed(1)}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <ThresholdBandChart
          data={chartData}
          series={chartSeries}
          bands={
            viewMode === "single"
              ? METRIC_BANDS[primaryMetric] ?? METRIC_BANDS.temperature
              : METRIC_BANDS.temperature
          }
          loading={loading}
          emptyMessage="No points in this window yet — generate telemetry from the simulator."
          height={300}
        />
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <CardSectionLabel>Sparkline strip</CardSectionLabel>
        <span className="text-[11px] font-light text-text-dim">5 metrics</span>
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

      <div className="mt-4">
        <AnalyticsPanel
          timeline={timeline}
          readings={readings}
          anomalyThreshold={anomalyThreshold ?? 0.14}
          anomalyThresholdDynamic={anomalyThreshold != null}
        />
      </div>

      <div className="mt-4">
        <ContextualAnalyticsPanel
          timeline={timeline}
          anomalyByDevice={anomalyByDevice}
          recentAnomalyEvents={recentAnomalyEvents}
          defaultMetric={
            primaryMetric === "motion" ? "temperature" : (primaryMetric as
              | "temperature"
              | "humidity"
              | "gas"
              | "smoke"
              | "light")
          }
          currentByMetric={{
            temperature: latestByMetric.temperature,
            humidity: latestByMetric.humidity,
            gas: latestByMetric.gas,
            smoke: latestByMetric.smoke,
            light: latestByMetric.light,
          }}
        />
      </div>
    </div>
  );
}

function KpiPill({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "inline-flex min-h-12 items-center gap-2 rounded-card border px-3",
        tone === "danger" && "border-danger/30 bg-danger-light",
        tone === "warning" && "border-amber/30 bg-amber-light",
        (!tone || tone === "default") && "border-border bg-surface"
      )}
    >
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-dim">
        {label}
      </span>
      <span
        className={cn(
          "ml-auto font-display text-sm font-semibold tabular",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-amber",
          (!tone || tone === "default") && "text-text-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}
