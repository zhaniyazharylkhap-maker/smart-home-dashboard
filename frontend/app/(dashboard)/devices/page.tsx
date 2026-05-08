"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardSectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";
import { fetchDevices, fetchRooms } from "@/lib/api";
import { humanizeRoom } from "@/lib/explanations";
import type { DeviceRow, Room } from "@/types/domain";

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

function StatusPill({ lastSeen }: { lastSeen: string | null }) {
  const online = isOnline(lastSeen);
  return (
    <Badge variant={online ? "safe" : "neutral"} className="gap-1.5">
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
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setErr(null);
      setLoading(true);
      const [d, r] = await Promise.all([fetchDevices(), fetchRooms()]);
      setDevices(d);
      setRooms(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onlineCount = useMemo(
    () => devices.filter((d) => isOnline(d.last_seen)).length,
    [devices]
  );

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Devices</h1>
          <p className="mt-1 text-sm font-light text-text-secondary">
            Fleet of{" "}
            <span className="text-text-primary">{onlineCount}</span> connected /{" "}
            {devices.length} total sensors
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {err ? (
        <div className="mb-4 rounded-md border border-amber/30 bg-amber-light px-4 py-3 text-sm text-amber">
          {err}
        </div>
      ) : null}

      {loading ? (
        <Card>
          <p className="text-sm text-text-dim">Loading devices…</p>
        </Card>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No devices yet"
          description="Telemetry ingestion will auto-provision devices once the simulator publishes."
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden p-0 md:block">
            <table className="w-full text-left text-sm text-text-primary">
              <thead className="border-b border-border bg-surface-2/60 text-[10px] font-medium uppercase tracking-wider text-text-dim">
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
                    className="border-b border-border last:border-0 hover:bg-surface-2/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-display text-sm font-medium">
                        {d.name}
                      </p>
                      <p className="mono text-[11px] font-light text-text-dim">
                        {d.device_id}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {humanizeRoom(d.room_name)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {d.device_type}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill lastSeen={d.last_seen} />
                    </td>
                    <td className="px-4 py-3 text-[12px] font-light text-text-dim">
                      {relativeTime(d.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-2 md:hidden">
            {devices.map((d) => (
              <Card key={d.id} className="p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-sm font-medium">{d.name}</p>
                    <p className="mono text-[11px] font-light text-text-dim">
                      {d.device_id}
                    </p>
                  </div>
                  <StatusPill lastSeen={d.last_seen} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] font-light uppercase tracking-wider text-text-dim">
                      Room
                    </p>
                    <p className="text-text-secondary">
                      {humanizeRoom(d.room_name)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-light uppercase tracking-wider text-text-dim">
                      Type
                    </p>
                    <p className="text-text-secondary">{d.device_type}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] font-light text-text-dim">
                  Last seen:{" "}
                  <span className="font-normal text-text-secondary">
                    {relativeTime(d.last_seen)}
                  </span>
                </p>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-text-dim">
        <CardSectionLabel className="!text-[10px]">
          Rooms in catalog
        </CardSectionLabel>
        <span>·</span>
        <span className="text-text-secondary">
          {rooms.map((r) => humanizeRoom(r.name)).join(", ") || "—"}
        </span>
      </div>
    </div>
  );
}
