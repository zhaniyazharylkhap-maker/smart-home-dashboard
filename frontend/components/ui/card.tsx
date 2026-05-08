import * as React from "react";

import { cn } from "@/lib/utils";

type AccentLeft = "safe" | "warning" | "critical" | "info";
type CardVariant = "default" | "flat" | "raised";
type CardTone = "default" | "anomaly" | "warning" | "info" | "muted";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  accentLeft?: AccentLeft;
  variant?: CardVariant;
  tone?: CardTone;
  glow?: boolean;
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    { className, accentLeft, variant = "default", tone = "default", glow = false, ...props },
    ref
  ) => {
    const accentClass =
      accentLeft === "safe"
        ? "border-l-[3px] border-l-safe"
        : accentLeft === "warning"
          ? "border-l-[3px] border-l-amber"
          : accentLeft === "critical"
            ? "border-l-[3px] border-l-danger"
            : accentLeft === "info"
              ? "border-l-[3px] border-l-accent"
              : null;

    const toneClass =
      tone === "anomaly"
        ? "border-danger/40 bg-[#1a1216]"
        : tone === "warning"
          ? "border-amber/40 bg-[#1a1612]"
          : tone === "info"
            ? "border-accent/30 bg-[#0e1c22]"
            : tone === "muted"
              ? "bg-surface-2/60"
              : "";

    const glowClass = glow ? "glow-danger animate-glow-pulse" : "";

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-card border border-border bg-surface text-text-primary",
          variant === "default" && "shadow-card p-5 md:p-6",
          variant === "flat" && "shadow-none p-5 md:p-6",
          variant === "raised" && "shadow-panel p-5 md:p-6",
          toneClass,
          accentClass,
          glowClass,
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 p-0 pb-3", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "font-display text-base font-semibold leading-tight text-text-primary",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "font-body text-sm font-normal text-text-secondary",
      className
    )}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardSectionLabel = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "font-display text-[11px] font-medium uppercase tracking-[0.14em] text-text-dim",
      className
    )}
    {...props}
  />
));
CardSectionLabel.displayName = "CardSectionLabel";

export {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardSectionLabel,
  CardTitle,
};
