"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { fetchDevices, fetchRooms } from "@/lib/api";
import type { DeviceRow, Room } from "@/types/domain";

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

function StatusPill({ lastSeen }: { lastSeen: string | null }) {
  const online = isOnline(lastSeen);
  return (
    <Badge variant={online ? "online" : "offline"} className="gap-1.5">
      <StatusDot status={online ? "online" : "offline"} pulse={online} />
      {online ? "Online" : "Offline"}
    </Badge>
  );
}

function relativeTime(value: string | null): string {
  if (!value) return "—";
  const diffMs = Date.now() - new Date(value).getTime();
  if (diffMs < 60_000) return `${Math.max(1, Math.floor(diffMs / 1000))}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
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

  const onlineCount = devices.filter((d) => isOnline(d.last_seen)).length;

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[28px] font-bold">Devices</h1>
          <p className="text-sm font-light text-text-secondary">
            Fleet of {onlineCount} connected sensors
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {err ? (
        <div className="mb-4 rounded-sm border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          {err}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-card border border-border bg-surface shadow-card md:block">
        <table className="w-full text-left text-sm text-text-primary">
          <thead className="border-b border-border bg-surface-2 text-[12px] font-medium uppercase tracking-wide text-text-dim">
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
              <tr
                key={d.id}
                className="border-b border-border last:border-0 hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <p className="font-display text-sm font-medium">{d.name}</p>
                  <p className="text-xs font-light text-text-dim">{d.device_id}</p>
                </td>
                <td className="px-4 py-3">{d.room_name}</td>
                <td className="px-4 py-3">{d.device_type}</td>
                <td className="px-4 py-3">
                  <StatusPill lastSeen={d.last_seen} />
                </td>
                <td className="px-4 py-3 text-xs font-light text-text-dim">
                  {relativeTime(d.last_seen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {devices.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-text-secondary">
            No devices yet — telemetry ingestion will auto-provision devices.
          </div>
        ) : null}
      </div>

      <div className="space-y-2 md:hidden">
        {devices.map((d) => (
          <Card key={d.id}>
            <CardContent className="p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-sm font-medium">{d.name}</p>
                  <p className="text-xs font-light text-text-dim">{d.device_id}</p>
                </div>
                <StatusPill lastSeen={d.last_seen} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="font-light text-text-dim">Room</p>
                  <p className="font-normal text-text-secondary">{d.room_name}</p>
                </div>
                <div>
                  <p className="font-light text-text-dim">Type</p>
                  <p className="font-normal text-text-secondary">{d.device_type}</p>
                </div>
              </div>
              <p className="mt-2 text-xs font-light text-text-dim">
                Last seen:{" "}
                <span className="font-normal text-text-secondary">
                  {relativeTime(d.last_seen)}
                </span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-xs text-text-secondary">
        Rooms in catalog: {rooms.map((r) => r.name).join(", ") || "—"}
      </p>
    </div>
  );
}
