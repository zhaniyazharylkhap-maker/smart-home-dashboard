"use client";

import { Fragment, useMemo, useState } from "react";
import { Activity } from "lucide-react";

import { Card, CardSectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { humanizeRoom } from "@/lib/explanations";
import { cn } from "@/lib/utils";
import type { LiveTelemetryPoint } from "@/hooks/use-live-telemetry";

type Cell = {
  source: string;
  bucket: string;
  hour: number;
  avgScore: number;
  maxScore: number;
  count: number;
  anomalyCount: number;
};

type Props = {
  timeline: LiveTelemetryPoint[];
  windowSize?: number;
  className?: string;
};

function colorFor(score: number, max: number): string {
  if (max <= 0) return "rgba(34,211,238,0.06)";
  const t = Math.max(0, Math.min(1, score / max));
  if (t < 0.5) {
    const k = t / 0.5;
    const r = Math.round(34 + (245 - 34) * k);
    const g = Math.round(211 + (158 - 211) * k);
    const b = Math.round(238 + (11 - 238) * k);
    return `rgba(${r},${g},${b},${0.18 + 0.6 * k})`;
  }
  const k = (t - 0.5) / 0.5;
  const r = Math.round(245 + (239 - 245) * k);
  const g = Math.round(158 + (68 - 158) * k);
  const b = Math.round(11 + (68 - 11) * k);
  return `rgba(${r},${g},${b},${0.4 + 0.55 * k})`;
}

export function BehavioralHeatmap({
  timeline,
  windowSize = 1500,
  className,
}: Props) {
  const [hovered, setHovered] = useState<Cell | null>(null);

  const { cells, hours, sources, peak } = useMemo(() => {
    const map = new Map<string, Cell>();
    let peakLocal = 0;
    for (const p of timeline.slice(-windowSize)) {
      if (p.anomaly_score == null) continue;
      const d = new Date(p.timestamp);
      const hour = d.getHours();
      const bucket = `${hour.toString().padStart(2, "0")}:00`;
      const source = p.room || p.device_id || "unknown";
      const key = `${source}__${bucket}`;
      const existing = map.get(key);
      if (!existing) {
        const cell: Cell = {
          source,
          bucket,
          hour,
          avgScore: p.anomaly_score,
          maxScore: p.anomaly_score,
          count: 1,
          anomalyCount: p.is_contextual_anomaly ? 1 : 0,
        };
        map.set(key, cell);
      } else {
        existing.avgScore =
          (existing.avgScore * existing.count + p.anomaly_score) /
          (existing.count + 1);
        existing.maxScore = Math.max(existing.maxScore, p.anomaly_score);
        existing.count += 1;
        if (p.is_contextual_anomaly) existing.anomalyCount += 1;
      }
      const cellRef = map.get(key);
      if (cellRef && cellRef.avgScore > peakLocal) peakLocal = cellRef.avgScore;
    }
    const cellsArr = Array.from(map.values());
    const allHours = Array.from(new Set(cellsArr.map((c) => c.hour))).sort(
      (a, b) => a - b
    );
    const allSources = Array.from(new Set(cellsArr.map((c) => c.source))).sort();
    return {
      cells: cellsArr,
      hours: allHours,
      sources: allSources,
      peak: peakLocal || 1,
    };
  }, [timeline, windowSize]);

  const lookup = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of cells) m.set(`${c.source}__${c.hour}`, c);
    return m;
  }, [cells]);

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardSectionLabel>Behavioral Heatmap</CardSectionLabel>
          <p className="mt-1 text-xs font-light text-text-secondary">
            Anomaly score by room × hour-of-day · red dots mark contextual flags
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-text-dim">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-4 rounded"
              style={{ background: "rgba(34,211,238,0.55)" }}
            />
            calm
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-4 rounded"
              style={{ background: "rgba(245,158,11,0.7)" }}
            />
            elevated
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-4 rounded"
              style={{ background: "rgba(239,68,68,0.85)" }}
            />
            anomaly
          </span>
        </div>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No anomaly samples yet"
          description="The heatmap fills in once the contextual model has scored a few minutes of telemetry."
        />
      ) : (
        <div className="overflow-x-auto">
          <div
            className="relative grid min-w-[560px] gap-[3px]"
            style={{
              gridTemplateColumns: `120px repeat(${hours.length}, minmax(28px, 1fr))`,
            }}
          >
            <div />
            {hours.map((h) => (
              <div
                key={h}
                className="text-center text-[10px] font-light text-text-dim"
              >
                {h.toString().padStart(2, "0")}
              </div>
            ))}
            {sources.map((s) => (
              <Fragment key={s}>
                <div className="truncate text-[11px] font-light text-text-secondary">
                  {humanizeRoom(s)}
                </div>
                {hours.map((h) => {
                  const cell = lookup.get(`${s}__${h}`);
                  if (!cell) {
                    return (
                      <div
                        key={`${s}-${h}`}
                        className="h-7 rounded-[3px] border border-border/40 bg-surface-2/40"
                      />
                    );
                  }
                  return (
                    <div
                      key={`${s}-${h}`}
                      onMouseEnter={() => setHovered(cell)}
                      onMouseLeave={() =>
                        setHovered((cur) => (cur === cell ? null : cur))
                      }
                      className="relative h-7 rounded-[3px] border border-border/40 transition-shadow hover:shadow-glow"
                      style={{ backgroundColor: colorFor(cell.avgScore, peak) }}
                      title={`${humanizeRoom(s)} @ ${cell.bucket} · avg ${cell.avgScore.toFixed(1)} · ${cell.anomalyCount} anomalies / ${cell.count} pts`}
                    >
                      {cell.anomalyCount > 0 ? (
                        <span className="pointer-events-none absolute right-1 top-1 inline-block h-1.5 w-1.5 rounded-full bg-danger shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                      ) : null}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {hovered ? (
        <div className="rounded-md border border-border bg-surface-2/60 px-3 py-2 text-xs text-text-secondary">
          <span className="font-display font-medium text-text-primary">
            {humanizeRoom(hovered.source)} · {hovered.bucket}
          </span>
          <span className="ml-2 mono">
            avg {hovered.avgScore.toFixed(1)} · max {hovered.maxScore.toFixed(1)}
            {" · "}
            {hovered.anomalyCount}/{hovered.count} flagged
          </span>
        </div>
      ) : null}
    </Card>
  );
}
