import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

type TrendArrowProps = {
  delta: number | null | undefined;
  inverse?: boolean;
  format?: (value: number) => string;
  showValue?: boolean;
  className?: string;
};

export function TrendArrow({
  delta,
  inverse = false,
  format,
  showValue = true,
  className,
}: TrendArrowProps) {
  if (delta == null || !Number.isFinite(delta)) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[11px] text-text-dim tabular",
          className
        )}
      >
        <ArrowRight className="h-3 w-3" />
        <span>—</span>
      </span>
    );
  }
  const isUp = delta > 0;
  const isFlat = Math.abs(delta) < 1e-6;
  const goodDirection = inverse ? !isUp : isUp;
  const tone = isFlat
    ? "text-text-dim"
    : goodDirection
      ? "text-safe"
      : "text-danger";
  const Icon = isFlat ? ArrowRight : isUp ? ArrowUpRight : ArrowDownRight;
  const formatted = format
    ? format(delta)
    : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium tabular",
        tone,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {showValue ? <span>{formatted}</span> : null}
    </span>
  );
}
