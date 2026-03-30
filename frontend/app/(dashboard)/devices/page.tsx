"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchDevices, fetchRooms } from "@/lib/api";
import type { DeviceRow, Room } from "@/types/domain";
import { cn } from "@/lib/utils";

function StatusPill({ status, lastSeen }: { status: string; lastSeen: string | null }) {
  const online =
    status === "online" ||
    (lastSeen &&
      Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
        online
          ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
          : "bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/25"
      )}
    >
      {online ? "Online" : "Offline"}
    </span>
  );
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      setErr(null);
      const [d, r] = await Promise.all([fetchDevices(), fetchRooms()]);
      setDevices(d);
      setRooms(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Fleet
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Virtual sensors map to the same IDs you will use on ESP32 — no frontend
            changes required when you swap simulators for hardware.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {err ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {err}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{d.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{d.device_id}</p>
                </td>
                <td className="px-4 py-3">{d.room_name}</td>
                <td className="px-4 py-3">{d.device_type}</td>
                <td className="px-4 py-3">
                  <StatusPill status={d.status} lastSeen={d.last_seen} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {d.last_seen
                    ? new Date(d.last_seen).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {devices.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No devices yet — telemetry ingestion will auto-provision devices.
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Rooms in catalog: {rooms.map((r) => r.name).join(", ") || "—"}
      </p>
    </div>
  );
}
