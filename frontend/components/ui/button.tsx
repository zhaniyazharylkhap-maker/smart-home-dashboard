import * as React from "react";

import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "primary"
    | "outline"
    | "ghost"
    | "danger"
    | "default"
    | "destructive";
  size?: "default" | "sm";
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
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border px-5 py-2.5 font-display text-sm font-semibold transition-[background-color,box-shadow] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50",
          size === "sm" ? "px-4 py-2 text-xs" : "px-5 py-2.5 text-sm",
          normalizedVariant === "primary" &&
            "border-accent bg-accent text-text-on-accent hover:border-accent-hover hover:bg-accent-hover",
          normalizedVariant === "outline" &&
            "border-[1.5px] border-accent bg-surface text-accent hover:bg-accent-light",
          normalizedVariant === "ghost" &&
            "border-transparent bg-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary",
          normalizedVariant === "danger" &&
            "border-danger bg-danger text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
