"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain } from "lucide-react";

import { BehavioralHeatmap } from "@/components/analytics/behavioral-heatmap";
import { CorrelationInsights } from "@/components/analytics/correlation-insights";
import { ExplanationCard } from "@/components/analytics/explanation-card";
import { LearnedNormalCard } from "@/components/analytics/learned-normal-card";
import { LiveAnomalyScoreCard } from "@/components/analytics/live-anomaly-score-card";
import { Card, CardSectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  fetchAnomalyExplanations,
  fetchSensorCorrelation,
} from "@/lib/api";
import type {
  AnomalyExplanationsResponse,
  CorrelationResponse,
} from "@/types/domain";
import type {
  LiveAnomalyDeviceState,
  LiveTelemetryPoint,
} from "@/hooks/use-live-telemetry";
import type { ContextualAnomalyEvent } from "@/types/telemetry";

type Props = {
  timeline: LiveTelemetryPoint[];
  anomalyByDevice: Record<string, LiveAnomalyDeviceState>;
  recentAnomalyEvents: ContextualAnomalyEvent[];
  defaultMetric?: "temperature" | "humidity" | "gas" | "smoke" | "light";
  showScoreCard?: boolean;
  currentByMetric?: Partial<
    Record<"temperature" | "humidity" | "gas" | "smoke" | "light", number | null>
  >;
};

export function ContextualAnalyticsPanel({
  timeline,
  anomalyByDevice,
  recentAnomalyEvents,
  defaultMetric = "temperature",
  showScoreCard = false,
  currentByMetric,
}: Props) {
  const [explanations, setExplanations] = useState<AnomalyExplanationsResponse | null>(
    null
  );
  const [correlation, setCorrelation] = useState<CorrelationResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [exp, corr] = await Promise.all([
          fetchAnomalyExplanations("24h"),
          fetchSensorCorrelation("24h"),
        ]);
        if (!alive) return;
        setExplanations(exp);
        setCorrelation(corr);
      } catch {
        /* live ws still drives recentAnomalyEvents */
      }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const eventsForFeed = useMemo(() => {
    if (recentAnomalyEvents.length > 0) return recentAnomalyEvents.slice(0, 6);
    return (explanations?.sample_events ?? [])
      .map(
        (e): ContextualAnomalyEvent => ({
          ...e,
          feature_contributions: e.feature_contributions ?? [],
        })
      )
      .slice(0, 6);
  }, [recentAnomalyEvents, explanations]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {showScoreCard ? (
        <LiveAnomalyScoreCard
          timeline={timeline}
          anomalyByDevice={anomalyByDevice}
          className="lg:col-span-2"
        />
      ) : null}

      <Card className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardSectionLabel>Why anomalous</CardSectionLabel>
            <p className="mt-1 text-xs font-light text-text-secondary">
              Real-time, humanized contextual reasoning for the most recent
              events
            </p>
          </div>
          {explanations && explanations.top_factors.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {explanations.top_factors.slice(0, 4).map((tok) => (
                <span
                  key={tok.label}
                  className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary"
                >
                  {tok.label}
                  <span className="text-text-dim mono">×{tok.count}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {eventsForFeed.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="No anomalies in the selected window"
            description="When the contextual model flags an event, a humanized explanation appears here in real time."
          />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {eventsForFeed.map((ev, i) => (
              <ExplanationCard
                key={`${ev.device_id}-${ev.timestamp}-${i}`}
                event={ev}
                mode="detailed"
              />
            ))}
          </div>
        )}
      </Card>

      <BehavioralHeatmap timeline={timeline} />
      <CorrelationInsights data={correlation} />
      <LearnedNormalCard
        defaultMetric={defaultMetric}
        currentByMetric={currentByMetric}
        className="lg:col-span-2"
      />
    </div>
  );
}
