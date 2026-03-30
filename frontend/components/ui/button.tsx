import * as React from "react";

import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        variant === "default" &&
          "bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:opacity-95",
        variant === "outline" &&
          "border border-border bg-transparent hover:bg-muted/60",
        variant === "ghost" && "hover:bg-muted/60",
        variant === "destructive" &&
          "bg-red-600/90 text-white hover:bg-red-600",
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
