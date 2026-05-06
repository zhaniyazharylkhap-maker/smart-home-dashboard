import { cn } from "@/lib/utils";

type StatusDotProps = {
  status: "online" | "offline" | "warning";
  pulse?: boolean;
  className?: string;
};

export function StatusDot({ status, pulse = false, className }: StatusDotProps) {
  const shouldPulse = pulse && status !== "offline";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-2 w-2 rounded-full",
        status === "online" && "bg-accent",
        status === "offline" && "bg-text-dim",
        status === "warning" && "bg-amber",
        shouldPulse && "animate-[pulse-dot_2s_ease-in-out_infinite]",
        className
      )}
    />
  );
}
