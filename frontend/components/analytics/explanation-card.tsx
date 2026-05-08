"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Brain, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  composeAnomalySentence,
  humanizeRoom,
  humanizeTokens,
} from "@/lib/explanations";
import { cn } from "@/lib/utils";
import type { ContextualAnomalyEvent } from "@/types/telemetry";

type Tone = "anomaly" | "warning" | "info";

type ExplanationCardProps = {
  event: ContextualAnomalyEvent;
  mode?: "compact" | "detailed";
  tone?: Tone;
  className?: string;
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 30_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleString();
}

export function ExplanationCard({
  event,
  mode = "detailed",
  tone = "anomaly",
  className,
}: ExplanationCardProps) {
  const sentence = composeAnomalySentence({
    room: event.room,
    tokens: event.explanation_tokens,
    score: event.anomaly_score,
    threshold: event.anomaly_threshold,
  });
  const tokens = humanizeTokens(event.explanation_tokens);
  const room = humanizeRoom(event.room);
  const isBreach = event.is_contextual_anomaly;
  const cardTone = isBreach ? tone : "info";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        tone={cardTone}
        accentLeft={isBreach ? "critical" : "info"}
        className={cn(
          mode === "compact" ? "p-3 md:p-3.5" : "p-4 md:p-5",
          className
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                isBreach
                  ? "bg-danger-light text-danger"
                  : "bg-accent-light text-accent"
              )}
            >
              {isBreach ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <Brain className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-display text-[12px] font-medium uppercase tracking-wide text-text-dim">
                  {event.device_id}
                </span>
                <span className="text-text-dim">·</span>
                <span className="text-[12px] text-text-secondary">{room}</span>
              </div>
              <p
                className={cn(
                  "font-display font-medium text-text-primary",
                  mode === "compact" ? "mt-0.5 text-[13px] leading-snug" : "mt-1 text-sm leading-relaxed"
                )}
              >
                {sentence}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={isBreach ? "danger" : "info"}>
              {event.anomaly_score.toFixed(1)}
              <span className="ml-1 opacity-60">
                / {event.anomaly_threshold.toFixed(1)}
              </span>
            </Badge>
            <span className="inline-flex items-center gap-1 text-[10px] font-light text-text-dim">
              <Clock className="h-3 w-3" />
              {relativeTime(event.timestamp)}
            </span>
          </div>
        </div>

        {mode === "detailed" && tokens.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tokens.slice(1, 5).map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        {mode === "detailed" &&
        event.feature_contributions &&
        event.feature_contributions.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-1.5 md:grid-cols-3">
            {event.feature_contributions.slice(0, 3).map((c) => (
              <div
                key={c.feature}
                className="rounded-md border border-border bg-surface-2 px-2 py-1.5"
                title={`${c.feature} z-score: ${c.z.toFixed(2)}`}
              >
                <p className="truncate text-[10px] uppercase tracking-wide text-text-dim">
                  {c.feature.replaceAll("_", " ")}
                </p>
                <p className="mono text-xs text-text-primary">
                  z = {c.z >= 0 ? "+" : ""}
                  {c.z.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {mode === "detailed" && event.degraded ? (
          <p className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber">
            <AlertTriangle className="h-3 w-3" />
            Degraded inference
          </p>
        ) : null}
      </Card>
    </motion.div>
  );
}
