"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { fetchDevices, fetchRooms, fetchTelemetryHistory } from "@/lib/api";
import type { DeviceRow, Room, TelemetryHistoryResponse } from "@/types/domain";
import { cn } from "@/lib/utils";

const METRICS = [
  { id: "temperature", label: "Temperature (°C)" },
  { id: "humidity", label: "Humidity (%)" },
  { id: "gas", label: "Gas" },
  { id: "smoke", label: "Smoke" },
  { id: "light", label: "Light (lux)" },
  { id: "motion", label: "Motion (0/1)" },
] as const;

const RANGES = [
  { id: "1h", label: "Last hour" },
  { id: "24h", label: "Last 24h" },
  { id: "7d", label: "Last 7 days" },
] as const;

export default function TelemetryPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [room, setRoom] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [metric, setMetric] = useState<string>("temperature");
  const [range, setRange] = useState<string>("24h");
  const [data, setData] = useState<TelemetryHistoryResponse | null>(null);
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
      const res = await fetchTelemetryHistory({
        metric,
        range,
        room: room || undefined,
        device_id: deviceId || undefined,
      });
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, range, room, deviceId]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.points.map((p) => ({
      t: new Date(p.t).toLocaleString(),
      v: p.v,
    }));
  }, [data]);

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

      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            Metric
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
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

      {err ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {err}
        </div>
      ) : null}

      <div className={cn("h-[420px] rounded-2xl border border-border/60 bg-card/30 p-4")}>
        {chartData.length === 0 && !loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No points in this window yet — generate telemetry from the simulator.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="hsl(217 33% 17%)" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fill: "hsl(215 20% 65%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(215 20% 65%)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(222 40% 9%)",
                  border: "1px solid hsl(217 33% 17%)",
                  borderRadius: 12,
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="v"
                name={metric}
                stroke="hsl(199 89% 48%)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
