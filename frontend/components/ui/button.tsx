import * as React from "react";

import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "primary"
    | "outline"
    | "ghost"
    | "danger"
    | "default"
    | "destructive"
    | "subtle";
  size?: "default" | "sm" | "lg";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", ...props }, ref) => {
    const normalizedVariant =
      variant === "default"
        ? "primary"
        : variant === "destructive"
          ? "danger"
          : variant;

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-btn border font-display font-medium transition-all duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50",
          size === "sm" && "min-h-9 px-3 py-1.5 text-xs",
          size === "default" && "min-h-10 px-4 py-2 text-sm",
          size === "lg" && "min-h-11 px-5 py-2.5 text-sm",
          normalizedVariant === "primary" &&
            "border-accent bg-accent text-text-on-accent hover:border-accent-hover hover:bg-accent-hover",
          normalizedVariant === "outline" &&
            "border-border-strong bg-surface text-text-primary hover:border-accent/40 hover:bg-surface-2",
          normalizedVariant === "ghost" &&
            "border-transparent bg-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary",
          normalizedVariant === "subtle" &&
            "border-border bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary",
          normalizedVariant === "danger" &&
            "border-danger bg-danger text-white hover:border-[#dc2626] hover:bg-[#dc2626]",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
