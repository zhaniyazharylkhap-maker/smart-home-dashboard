"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, RadioTower, Zap } from "lucide-react";

import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

type Props = {
  connected: boolean;
  degraded: boolean;
  lastEventAt: string | null;
  reconnectCount: number;
  latencyAvgMs: number | null;
  className?: string;
};

function ageLabel(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(ts).toLocaleString();
}

export function SystemHealthStrip({
  connected,
  degraded,
  lastEventAt,
  reconnectCount,
  latencyAvgMs,
  className,
}: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const dotStatus = connected ? "online" : "warning";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-pill border border-border bg-surface px-3 py-1.5 text-[11px] font-medium",
        className
      )}
      role="status"
      aria-label="System health"
    >
      <span className="inline-flex items-center gap-1.5 text-text-primary">
        <StatusDot status={dotStatus} pulse={connected} />
        {connected ? "Live stream" : "Reconnecting…"}
      </span>
      <span className="h-3 w-px bg-border-strong" aria-hidden="true" />
      <span
        className={cn(
          "inline-flex items-center gap-1",
          degraded ? "text-amber" : "text-text-secondary"
        )}
        title={degraded ? "Inference is in degraded mode" : "Contextual ML active"}
      >
        {degraded ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <Zap className="h-3 w-3 text-accent" />
        )}
        {degraded ? "Degraded ML" : "ML active"}
      </span>
      <span className="h-3 w-px bg-border-strong" aria-hidden="true" />
      <span className="inline-flex items-center gap-1 text-text-secondary">
        <RadioTower className="h-3 w-3 text-accent" />
        {reconnectCount} reconnect{reconnectCount === 1 ? "" : "s"}
      </span>
      <span className="h-3 w-px bg-border-strong" aria-hidden="true" />
      <span className="inline-flex items-center gap-1 text-text-secondary">
        <Activity className="h-3 w-3 text-accent" />
        {latencyAvgMs == null ? "— ms" : `${Math.round(latencyAvgMs)} ms avg`}
      </span>
      <span className="h-3 w-px bg-border-strong" aria-hidden="true" />
      <span className="text-text-dim">
        last event {ageLabel(lastEventAt)}
      </span>
    </div>
  );
}
