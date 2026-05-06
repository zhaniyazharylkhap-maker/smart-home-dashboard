import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
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
  const normalized = variant === "online" ? "success" : variant === "offline" ? "neutral" : variant;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-[3px] font-body text-xs font-medium",
        normalized === "success" && "bg-accent-light text-accent",
        normalized === "warning" && "bg-amber-light text-amber",
        normalized === "danger" && "bg-danger-light text-danger",
        normalized === "neutral" && "bg-surface-2 text-text-secondary",
        className
      )}
      {...props}
    />
  );
}
