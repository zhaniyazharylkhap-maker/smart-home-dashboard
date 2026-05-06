import * as React from "react";

import { cn } from "@/lib/utils";

type AccentLeft = "safe" | "warning" | "critical";
type CardVariant = "default" | "flat";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  accentLeft?: AccentLeft;
  variant?: CardVariant;
};

const Card = React.forwardRef<
  HTMLDivElement,
  CardProps
>(({ className, accentLeft, variant = "default", ...props }, ref) => {
  const accentClass =
    accentLeft === "safe"
      ? "border-l-[3px] border-l-accent"
      : accentLeft === "warning"
        ? "border-l-[3px] border-l-amber"
        : accentLeft === "critical"
          ? "border-l-[3px] border-l-danger"
          : null;

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-border bg-surface p-6 text-text-primary",
        variant === "default" ? "shadow-card" : "shadow-none",
        accentClass,
        className
      )}
      {...props}
    />
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-0 pb-3", className)}
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
      "font-display text-base font-semibold leading-none text-text-primary",
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
    className={cn("font-body text-sm font-normal text-text-secondary", className)}
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

export { Card, CardContent, CardDescription, CardHeader, CardTitle };
