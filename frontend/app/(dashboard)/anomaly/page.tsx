"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Brain, Clock, RefreshCw } from "lucide-react";

import { ExplanationCard } from "@/components/analytics/explanation-card";
import { LearnedNormalCard } from "@/components/analytics/learned-normal-card";
import { LiveAnomalyScoreCard } from "@/components/analytics/live-anomaly-score-card";
import { Button } from "@/components/ui/button";
import { Card, CardSectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import { fetchAnomalyHistory, fetchDevices } from "@/lib/api";
import { ACCENT_HEX } from "@/lib/brand";
import { humanizeRoom } from "@/lib/explanations";
import type {
  AnomalyHistoryResponse,
  DeviceRow,
} from "@/types/domain";
import type { ContextualAnomalyEvent } from "@/types/telemetry";
import { cn } from "@/lib/utils";

const RANGES = [
  { id: "1h", label: "Last hour" },
  { id: "24h", label: "Last 24h" },
  { id: "7d", label: "Last 7 days" },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

export default function AnomalyPage() {
  const {
    timeline,
    anomalyByDevice,
    recentAnomalyEvents,
    readings,
  } = useLiveTelemetry();

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [range, setRange] = useState<RangeId>("24h");
  const [history, setHistory] = useState<AnomalyHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchDevices();
        setDevices(list);
        if (list.length > 0 && !deviceId) {
          setDeviceId(list[0].device_id);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "failed to load devices");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = async () => {
    if (!deviceId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchAnomalyHistory({
        device_id: deviceId,
        range,
        limit: 600,
      });
      setHistory(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed to load history");
      setHistory(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, range]);

  const deviceTimeline = useMemo(
    () => timeline.filter((p) => !deviceId || p.device_id === deviceId),
    [timeline, deviceId]
  );

  const deviceAnomalyState = useMemo(
    () => (deviceId ? { [deviceId]: anomalyByDevice[deviceId] } : {}),
    [anomalyByDevice, deviceId]
  );

  const reading = useMemo(
    () => readings.find((r) => r.device_id === deviceId) ?? null,
    [readings, deviceId]
  );

  const deviceEvents: ContextualAnomalyEvent[] = useMemo(
    () =>
      recentAnomalyEvents.filter((e) => !deviceId || e.device_id === deviceId),
    [recentAnomalyEvents, deviceId]
  );

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.points.map((p) => ({
      t: p.t,
      tLabel: new Date(p.t).toLocaleString(),
      score: p.score,
      threshold: p.threshold,
      anomaly: p.is_anomaly ? p.score : null,
    }));
  }, [history]);

  const lastBreach = useMemo(() => {
    if (!history) return null;
    for (let i = history.points.length - 1; i >= 0; i -= 1) {
      const p = history.points[i];
      if (p.is_anomaly) return p;
    }
    return null;
  }, [history]);

  const breachesInRange = history?.points.filter((p) => p.is_anomaly).length ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[28px] font-bold leading-tight">
            <Brain className="h-6 w-6 text-accent" />
            Anomaly Workspace
          </h1>
          <p className="mt-1 text-sm font-light text-text-secondary">
            Per-device contextual reasoning, score history, and learned-normal
            envelope
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadHistory()}
            disabled={loading || !deviceId}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-5 rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-[11px] uppercase tracking-wider text-text-dim">
            Device
            <select
              className="mt-1 min-h-10 w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.device_id}>
                  {d.device_id} · {humanizeRoom(d.room_name)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-dim">
              Range
            </p>
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
          <div className="flex flex-col justify-end gap-1 text-[11px] text-text-dim">
            <span>
              Breaches in range:{" "}
              <span className="mono text-text-primary">{breachesInRange}</span>
            </span>
            {lastBreach ? (
              <span>
                Last breach:{" "}
                <span className="mono text-text-secondary">
                  {new Date(lastBreach.t).toLocaleString()}
                </span>
              </span>
            ) : (
              <span>No breaches in this window</span>
            )}
          </div>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-md border border-amber/30 bg-amber-light px-4 py-3 text-sm text-amber">
          {err}
        </div>
      ) : null}

      <section className="mb-5">
        <LiveAnomalyScoreCard
          timeline={deviceTimeline}
          anomalyByDevice={deviceAnomalyState}
        />
      </section>

      <Card className="mb-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardSectionLabel>Score history</CardSectionLabel>
            <p className="mt-1 text-xs font-light text-text-secondary">
              Anomaly score with adaptive threshold for{" "}
              <span className="mono text-text-secondary">{deviceId || "—"}</span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-text-dim">
            <Clock className="h-3 w-3" />
            {RANGES.find((r) => r.id === range)?.label}
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : chartData.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="No score history yet"
            description="The contextual model needs a few minutes of telemetry to populate per-device history."
          />
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT_HEX} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ACCENT_HEX} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="#1f2a3a" />
                <XAxis
                  dataKey="tLabel"
                  stroke="#5c6a82"
                  tick={{ fill: "#9aa7bb", fontSize: 11 }}
                  minTickGap={32}
                />
                <YAxis stroke="#5c6a82" tick={{ fill: "#9aa7bb", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#0b1018",
                    border: "1px solid #1f2a3a",
                    borderRadius: 8,
                    color: "#e6edf7",
                    fontSize: 12,
                  }}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as { t?: string } | undefined;
                    return row?.t ? new Date(row.t).toLocaleString() : "";
                  }}
                  formatter={(value, name) => {
                    if (name === "anomaly")
                      return [
                        typeof value === "number"
                          ? value.toFixed(2)
                          : "—",
                        "Flagged",
                      ];
                    return [
                      typeof value === "number" ? value.toFixed(2) : "—",
                      String(name),
                    ];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#9aa7bb" }} />
                <Area
                  type="monotone"
                  dataKey="score"
                  name="Score"
                  stroke={ACCENT_HEX}
                  strokeWidth={2}
                  fill="url(#score-fill)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="threshold"
                  name="Adaptive threshold"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Scatter dataKey="anomaly" name="Anomaly" fill="#ef4444" />
                {history?.points && history.points.length > 0 ? (
                  <ReferenceLine
                    y={history.points[history.points.length - 1].threshold}
                    stroke="#f59e0b"
                    strokeDasharray="3 3"
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <section className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3">
            <CardSectionLabel>Recent flagged events</CardSectionLabel>
            <p className="mt-1 text-xs font-light text-text-secondary">
              Live, humanized contextual explanations for this device
            </p>
          </div>
          {deviceEvents.length === 0 ? (
            <EmptyState
              icon={Brain}
              title="No live events yet"
              description="When the device's score breaches the adaptive threshold, an explanation will appear here."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {deviceEvents.slice(0, 6).map((ev, i) => (
                <ExplanationCard
                  key={`${ev.device_id}-${ev.timestamp}-${i}`}
                  event={ev}
                  mode="detailed"
                />
              ))}
            </div>
          )}
        </Card>

        <LearnedNormalCard
          defaultMetric="temperature"
          currentByMetric={
            reading
              ? {
                  temperature: reading.temperature ?? null,
                  humidity: reading.humidity ?? null,
                  gas: reading.gas ?? null,
                  smoke: reading.smoke ?? null,
                  light: reading.light ?? null,
                }
              : undefined
          }
        />
      </section>
    </div>
  );
}
