"use client";

import { cn } from "@/lib/utils";
import type { RoomTelemetryMode } from "@/lib/room-telemetry-mode";

type ToggleRow = {
  slug: string;
  title: string;
};

export function RoomTelemetrySourceBar({
  toggleRows,
  modes,
  onChange,
}: {
  toggleRows: ToggleRow[];
  modes: Record<string, RoomTelemetryMode>;
  onChange: (slug: string, mode: RoomTelemetryMode) => void;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-3 shadow-card">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-dim">
        Data source
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        {toggleRows.map((row) => {
          const active = modes[row.slug];
          return (
            <div
              key={row.slug}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="min-w-[88px] text-[11px] font-medium text-text-secondary">
                {row.title}
              </span>
              <div className="inline-flex overflow-hidden rounded-btn border border-border">
                {(["simulated", "realtime"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onChange(row.slug, mode)}
                    className={cn(
                      "min-h-9 px-3 text-[11px] font-medium capitalize transition",
                      active === mode
                        ? "bg-accent text-text-on-accent"
                        : "bg-surface-2 text-text-secondary hover:bg-surface-3"
                    )}
                  >
                    {mode === "simulated" ? "Simulated" : "Realtime"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
