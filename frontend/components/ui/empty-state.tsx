import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  action?: React.ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  action,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface/40 px-6 py-10 text-center",
        className
      )}
    >
      {Icon ? (
        <Icon className="h-6 w-6 text-text-dim" aria-hidden="true" />
      ) : null}
      <p className="font-display text-sm font-medium text-text-primary">
        {title}
      </p>
      {description ? (
        <p className="max-w-sm text-xs font-light text-text-secondary">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
