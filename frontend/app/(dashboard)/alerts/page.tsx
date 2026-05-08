"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardSectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchAlerts, resolveAlert } from "@/lib/api";
import { humanizeAlertReasons, humanizeRoom } from "@/lib/explanations";
import { cn } from "@/lib/utils";
import type { AlertRow } from "@/types/domain";

function severityVariant(s: string): "danger" | "warning" | "neutral" {
  const key = s.toLowerCase();
  if (key === "critical") return "danger";
  if (key === "warning") return "warning";
  return "neutral";
}

function riskTone(level: string | null): "default" | "warning" | "danger" {
  if (level === "CRITICAL") return "danger";
  if (level === "WARNING") return "warning";
  return "default";
}

function accentFromAlert(a: AlertRow): "safe" | "warning" | "critical" {
  const level = a.risk_level ?? a.severity.toUpperCase();
  if (level === "CRITICAL") return "critical";
  if (level === "WARNING") return "warning";
  return "safe";
}

export default function AlertsPage() {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setErr(null);
      setLoading(true);
      const data = await fetchAlerts();
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onResolve = async (id: number) => {
    const confirmed = window.confirm("Resolve this incident?");
    if (!confirmed) return;
    setBusy(id);
    try {
      await resolveAlert(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "resolve failed");
    } finally {
      setBusy(null);
    }
  };

  const active = useMemo(
    () => rows.filter((r) => r.status === "unresolved"),
    [rows]
  );
  const history = useMemo(
    () => rows.filter((r) => r.status === "resolved"),
    [rows]
  );

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Alerts</h1>
          <p className="mt-1 text-sm font-light text-text-secondary">
            Active and historical incident stream with humanized reasoning
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {err ? (
        <div className="mb-4 rounded-md border border-amber/30 bg-amber-light px-4 py-3 text-sm text-amber">
          {err}
        </div>
      ) : null}

      <section className="mb-6">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardSectionLabel>Active incidents</CardSectionLabel>
            <Badge variant={active.length > 0 ? "danger" : "neutral"}>
              {active.length}
            </Badge>
          </div>
          {loading ? (
            <p className="text-xs text-text-dim">Loading…</p>
          ) : active.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All clear"
              description="No unresolved incidents at the moment."
            />
          ) : (
            <div className="grid gap-2.5">
              {active.map((a) => (
                <AlertItem
                  key={a.id}
                  alert={a}
                  showResolve
                  onResolve={onResolve}
                  busy={busy === a.id}
                />
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardSectionLabel>Resolved history</CardSectionLabel>
            <Badge variant="neutral">{history.length}</Badge>
          </div>
          {loading ? (
            <p className="text-xs text-text-dim">Loading…</p>
          ) : history.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No resolved alerts yet"
              description="Resolved incidents will accumulate here for audit and review."
            />
          ) : (
            <div className="grid gap-2.5">
              {history.map((a) => (
                <AlertItem key={a.id} alert={a} />
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function AlertItem({
  alert,
  showResolve,
  onResolve,
  busy,
}: {
  alert: AlertRow;
  showResolve?: boolean;
  onResolve?: (id: number) => void;
  busy?: boolean;
}) {
  const level = alert.risk_level ?? alert.severity.toUpperCase();
  const reasons = humanizeAlertReasons(alert.alert_reasons ?? []);
  const tone = riskTone(level);
  return (
    <Card
      accentLeft={accentFromAlert(alert)}
      tone={tone === "danger" ? "anomaly" : tone === "warning" ? "warning" : "default"}
      className="p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={severityVariant(alert.severity)}>
              {alert.severity}
            </Badge>
            {alert.risk_score != null ? (
              <span
                className={cn(
                  "font-display text-sm font-semibold tabular",
                  tone === "danger" && "text-danger",
                  tone === "warning" && "text-amber",
                  tone === "default" && "text-text-secondary"
                )}
              >
                Risk {Math.round(alert.risk_score)}
                {level ? (
                  <span className="ml-1 text-[10px] font-light uppercase text-text-dim">
                    {level}
                  </span>
                ) : null}
              </span>
            ) : null}
            <span className="text-[10px] font-light text-text-dim">
              {humanizeRoom(alert.room_name)}
              {alert.device_external_id ? (
                <>
                  {" · "}
                  <span className="mono text-text-secondary">
                    {alert.device_external_id}
                  </span>
                </>
              ) : null}
            </span>
          </div>
          <p className="font-display text-sm font-medium text-text-primary">
            {alert.title}
          </p>
          {alert.description ? (
            <p className="mt-0.5 text-[13px] font-light text-text-secondary">
              {alert.description}
            </p>
          ) : null}
          {alert.recommended_action ? (
            <div className="mt-2 inline-flex items-start gap-1.5 rounded-md border border-accent/30 bg-accent-light px-2.5 py-1.5 text-[12px] text-accent">
              <CheckCircle2 className="mt-[1px] h-3.5 w-3.5 shrink-0" />
              <span>{alert.recommended_action}</span>
            </div>
          ) : null}
          {reasons.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {reasons.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary"
                >
                  {r}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5 text-[11px] text-text-dim">
          <span>{new Date(alert.created_at).toLocaleString()}</span>
          {alert.resolved_at ? (
            <span className="text-safe">
              Resolved {new Date(alert.resolved_at).toLocaleString()}
            </span>
          ) : null}
          {showResolve && onResolve ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onResolve(alert.id)}
            >
              {busy ? "..." : "Resolve"}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
