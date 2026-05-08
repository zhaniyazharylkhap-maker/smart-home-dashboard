"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Grid3x3, List } from "lucide-react";

import { Card, CardSectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { CorrelationResponse } from "@/types/domain";

type Props = {
  data: CorrelationResponse | null;
  className?: string;
};

const PAIR_NARRATIVES: Record<string, string> = {
  "gas|smoke":
    "When gas climbs, smoke is expected to follow. A divergence here is a strong leading indicator.",
  "smoke|gas":
    "When gas climbs, smoke is expected to follow. A divergence here is a strong leading indicator.",
  "humidity|temperature":
    "Bathrooms drive a positive humidity↔temperature relationship; weak coupling suggests room-profile anomalies.",
  "temperature|humidity":
    "Bathrooms drive a positive humidity↔temperature relationship; weak coupling suggests room-profile anomalies.",
  "gas|light":
    "Gas without correlated light/motion can flag unattended kitchen activity.",
  "light|gas":
    "Gas without correlated light/motion can flag unattended kitchen activity.",
};

function strength(absVal: number): { label: string; tone: "strong" | "moderate" | "weak" } {
  if (absVal >= 0.6) return { label: "strongly", tone: "strong" };
  if (absVal >= 0.3) return { label: "moderately", tone: "moderate" };
  return { label: "weakly", tone: "weak" };
}

function correlationCellColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped >= 0) {
    const t = clamped;
    const r = Math.round(22 + (239 - 22) * t);
    const g = Math.round(36 + (68 - 36) * t);
    const b = Math.round(58 + (68 - 58) * t);
    return `rgba(${r},${g},${b},${0.4 + 0.5 * t})`;
  }
  const t = -clamped;
  const r = Math.round(22 + (34 - 22) * t);
  const g = Math.round(36 + (211 - 36) * t);
  const b = Math.round(58 + (238 - 58) * t);
  return `rgba(${r},${g},${b},${0.4 + 0.5 * t})`;
}

export function CorrelationInsights({ data, className }: Props) {
  const [view, setView] = useState<"insights" | "matrix">("insights");

  const insights = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.cells]
      .filter((c) => Number.isFinite(c.correlation))
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    return sorted.slice(0, 6);
  }, [data]);

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardSectionLabel>Cross-Sensor Relationships</CardSectionLabel>
          <p className="mt-1 text-xs font-light text-text-secondary">
            How channels move together · Pearson over the last 24h ·{" "}
            <span className="mono">n = {data?.sample_size ?? 0}</span>
          </p>
        </div>
        <div className="flex overflow-hidden rounded-btn border border-border bg-surface-2">
          <button
            type="button"
            onClick={() => setView("insights")}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 text-xs transition",
              view === "insights"
                ? "bg-surface-3 text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            <List className="h-3 w-3" />
            Insights
          </button>
          <button
            type="button"
            onClick={() => setView("matrix")}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 text-xs transition",
              view === "matrix"
                ? "bg-surface-3 text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            <Grid3x3 className="h-3 w-3" />
            Matrix
          </button>
        </div>
      </div>

      {!data || data.cells.length === 0 ? (
        <EmptyState
          icon={Grid3x3}
          title="Not enough samples yet"
          description="Cross-sensor correlation appears once telemetry has accumulated."
        />
      ) : view === "insights" ? (
        <div className="flex flex-col gap-2">
          {insights.map((cell) => {
            const abs = Math.abs(cell.correlation);
            const { label, tone } = strength(abs);
            const direction = cell.correlation >= 0 ? "positively" : "negatively";
            const Icon =
              cell.correlation >= 0.05
                ? ArrowUp
                : cell.correlation <= -0.05
                  ? ArrowDown
                  : ArrowRight;
            const narrative =
              PAIR_NARRATIVES[`${cell.a}|${cell.b}`] ?? null;
            return (
              <div
                key={`${cell.a}-${cell.b}`}
                className="rounded-md border border-border bg-surface-2/60 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-sm font-medium text-text-primary">
                    <span className="capitalize">{cell.a}</span> and{" "}
                    <span className="capitalize">{cell.b}</span> are {label}{" "}
                    {direction} correlated.
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] mono",
                      tone === "strong" && "border-amber/40 bg-amber-light text-amber",
                      tone === "moderate" && "border-accent/30 bg-accent-light text-accent",
                      tone === "weak" && "border-border bg-surface-3 text-text-dim"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {cell.correlation.toFixed(2)}
                  </span>
                </div>
                {narrative ? (
                  <p className="mt-1 text-[12px] font-light text-text-secondary">
                    {narrative}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid gap-1 text-[10px]"
            style={{
              gridTemplateColumns: `90px repeat(${data.metrics.length}, minmax(56px,1fr))`,
            }}
          >
            <div />
            {data.metrics.map((m) => (
              <div
                key={`hdr-${m}`}
                className="text-center uppercase tracking-wide text-text-dim"
              >
                {m}
              </div>
            ))}
            {data.metrics.map((row) => (
              <Fragment key={`row-${row}`}>
                <div className="truncate uppercase tracking-wide text-text-dim">
                  {row}
                </div>
                {data.metrics.map((col) => {
                  if (row === col) {
                    return (
                      <div
                        key={`${row}-${col}`}
                        className="flex h-7 items-center justify-center rounded border border-border bg-surface-3 text-[10px] text-text-dim"
                      >
                        1.00
                      </div>
                    );
                  }
                  const cell = data.cells.find(
                    (c) =>
                      (c.a === row && c.b === col) ||
                      (c.a === col && c.b === row)
                  );
                  const value = cell?.correlation ?? 0;
                  return (
                    <div
                      key={`${row}-${col}`}
                      title={`${row} ↔ ${col} = ${value.toFixed(3)}`}
                      className="flex h-7 items-center justify-center rounded border border-border text-[10px] mono text-text-primary"
                      style={{ backgroundColor: correlationCellColor(value) }}
                    >
                      {value.toFixed(2)}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
