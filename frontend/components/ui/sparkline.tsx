"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { ACCENT_HEX } from "@/lib/brand";

type SparklineProps = {
  values: (number | null)[];
  stroke?: string;
  fill?: string;
  height?: number;
  className?: string;
};

export function Sparkline({
  values,
  stroke = ACCENT_HEX,
  fill,
  height = 36,
  className,
}: SparklineProps) {
  const data = values.map((v, i) => ({ i, v: v ?? null }));
  if (data.length === 0) {
    return (
      <div
        className={className}
        style={{ height }}
        aria-hidden="true"
      />
    );
  }
  const fillColor = fill ?? `${stroke}22`;
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        >
          <defs>
            <linearGradient id={`spark-${stroke}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} stopOpacity={0.85} />
              <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.6}
            fill={`url(#spark-${stroke})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
