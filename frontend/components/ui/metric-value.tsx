"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type MetricValueSize = "sm" | "md" | "lg";

type MetricValueProps = {
  value: string | number;
  unit?: string;
  size?: MetricValueSize;
  className?: string;
};

const sizeClasses: Record<MetricValueSize, string> = {
  sm: "text-sm",
  md: "text-xl",
  lg: "text-3xl",
};

export function MetricValue({
  value,
  unit,
  size = "md",
  className,
}: MetricValueProps) {
  const [flashKey, setFlashKey] = useState(0);
  const normalizedValue = String(value);

  useEffect(() => {
    setFlashKey((prev) => prev + 1);
  }, [normalizedValue]);

  return (
    <motion.div
      key={flashKey}
      initial={{ color: "var(--color-accent)" }}
      animate={{ color: "var(--color-text-primary)" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(
        "inline-flex items-baseline gap-1 tabular kpi-value",
        sizeClasses[size],
        className
      )}
    >
      <span>{normalizedValue}</span>
      {unit ? (
        <span className="text-xs font-light text-text-dim">{unit}</span>
      ) : null}
    </motion.div>
  );
}
