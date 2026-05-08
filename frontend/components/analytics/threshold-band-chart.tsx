"use client";

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

export type ThresholdBandSeries = {
  key: string;
  label: string;
  stroke: string;
  unit?: string;
};

export type ThresholdBandRow = {
  t: string;
  tLabel: string;
  anomaly?: number | null;
} & Record<string, number | string | null | undefined>;

type Bands = {
  normal: [number, number];
  warning?: [number, number];
  anomaly?: [number, number];
  adaptiveThreshold?: number | null;
};

type Props = {
  data: ThresholdBandRow[];
  series: ThresholdBandSeries[];
  bands?: Bands;
  height?: number;
  className?: string;
  emptyMessage?: string;
  loading?: boolean;
};

export function ThresholdBandChart({
  data,
  series,
  bands,
  height = 280,
  className,
  emptyMessage = "No data in this window.",
  loading,
}: Props) {
  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-border bg-surface-2/40 text-xs text-text-dim",
          className
        )}
        style={{ height }}
      >
        Loading chart…
      </div>
    );
  }
  if (!data.length) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-border bg-surface-2/40 text-xs text-text-dim",
          className
        )}
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="2 6" stroke="#1f2a3a" />
          <XAxis
            dataKey="tLabel"
            stroke="#5c6a82"
            tick={{ fill: "#9aa7bb", fontSize: 11 }}
            minTickGap={28}
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
              if (name === "anomaly") return ["flagged", "Anomaly"];
              const seriesDef = series.find((s) => s.key === String(name));
              const label = seriesDef?.label ?? String(name);
              const numeric = typeof value === "number" ? value : null;
              if (numeric == null) return ["—", label];
              return [
                `${numeric.toFixed(2)}${seriesDef?.unit ? " " + seriesDef.unit : ""}`,
                label,
              ];
            }}
          />
          {bands?.normal ? (
            <ReferenceArea
              y1={bands.normal[0]}
              y2={bands.normal[1]}
              fill="#10b981"
              fillOpacity={0.06}
              stroke="none"
              ifOverflow="extendDomain"
            />
          ) : null}
          {bands?.warning ? (
            <ReferenceArea
              y1={bands.warning[0]}
              y2={bands.warning[1]}
              fill="#f59e0b"
              fillOpacity={0.07}
              stroke="none"
              ifOverflow="extendDomain"
            />
          ) : null}
          {bands?.anomaly ? (
            <ReferenceArea
              y1={bands.anomaly[0]}
              y2={bands.anomaly[1]}
              fill="#ef4444"
              fillOpacity={0.08}
              stroke="none"
              ifOverflow="extendDomain"
            />
          ) : null}
          {bands?.adaptiveThreshold != null ? (
            <ReferenceLine
              y={bands.adaptiveThreshold}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{
                value: "adaptive",
                position: "right",
                fill: "#f59e0b",
                fontSize: 10,
              }}
            />
          ) : null}
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#9aa7bb" }}
            verticalAlign="bottom"
            iconType="line"
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.stroke}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
          <Scatter dataKey="anomaly" name="anomaly" fill="#ef4444" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Default normal/warning/anomaly bands per metric, picked to be informative
 * without being prescriptive. Numbers are tuned for the simulator's range. */
export const METRIC_BANDS: Record<string, Bands> = {
  temperature: {
    normal: [18, 26],
    warning: [26, 35],
    anomaly: [35, 70],
  },
  humidity: {
    normal: [30, 65],
    warning: [65, 80],
    anomaly: [80, 100],
  },
  gas: {
    normal: [0, 30],
    warning: [30, 60],
    anomaly: [60, 200],
  },
  smoke: {
    normal: [0, 20],
    warning: [20, 50],
    anomaly: [50, 200],
  },
  light: {
    normal: [0, 600],
    warning: [600, 900],
    anomaly: [900, 2000],
  },
  motion: {
    normal: [0, 1],
  },
};
