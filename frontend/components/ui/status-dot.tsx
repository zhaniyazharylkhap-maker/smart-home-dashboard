import { cn } from "@/lib/utils";

type StatusDotProps = {
  status: "online" | "offline" | "warning" | "danger" | "info";
  pulse?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
};

export function StatusDot({
  status,
  pulse = false,
  size = "sm",
  className,
}: StatusDotProps) {
  const shouldPulse = pulse && status !== "offline";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 rounded-full",
        size === "xs" && "h-1.5 w-1.5",
        size === "sm" && "h-2 w-2",
        size === "md" && "h-2.5 w-2.5",
        status === "online" && "bg-safe",
        status === "offline" && "bg-text-dim",
        status === "warning" && "bg-amber",
        status === "danger" && "bg-danger",
        status === "info" && "bg-accent",
        className
      )}
    >
      {shouldPulse ? (
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-60 animate-ping",
            status === "online" && "bg-safe",
            status === "warning" && "bg-amber",
            status === "danger" && "bg-danger",
            status === "info" && "bg-accent"
          )}
        />
      ) : null}
    </span>
  );
}
