import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeVariant =
  | "success"
  | "safe"
  | "warning"
  | "danger"
  | "neutral"
  | "info"
  | "online"
  | "offline";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  const normalized =
    variant === "online"
      ? "safe"
      : variant === "offline"
        ? "neutral"
        : variant === "success"
          ? "safe"
          : variant;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-2.5 py-[3px] font-display text-[11px] font-medium uppercase tracking-wide",
        normalized === "safe" &&
          "border-safe/30 bg-safe-light text-safe",
        normalized === "warning" &&
          "border-amber/30 bg-amber-light text-amber",
        normalized === "danger" &&
          "border-danger/30 bg-danger-light text-danger",
        normalized === "info" &&
          "border-accent/30 bg-accent-light text-accent",
        normalized === "neutral" &&
          "border-border bg-surface-2 text-text-secondary",
        className
      )}
      {...props}
    />
  );
}
