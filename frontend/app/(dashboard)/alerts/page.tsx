"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchAlerts, resolveAlert } from "@/lib/api";
import type { AlertRow } from "@/types/domain";

function SeverityBadge({ s }: { s: string }) {
  const key = s.toLowerCase();
  const variant =
    key === "critical"
      ? "danger"
      : key === "warning"
        ? "warning"
        : "neutral";
  return <Badge variant={variant}>{s}</Badge>;
}

function riskText(level: string | null, score: number | null): string {
  if (score == null) return "—";
  const base = `${Math.round(score)}`;
  if (!level) return base;
  if (level === "CRITICAL") return `${base} (critical)`;
  if (level === "WARNING") return `${base} (warning)`;
  if (level === "SAFE") return `${base} (safe)`;
  return base;
}

function riskTone(level: string | null): string {
  if (level === "CRITICAL") return "text-danger";
  if (level === "WARNING") return "text-amber";
  return "text-accent";
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

  const load = async () => {
    try {
      setErr(null);
      const data = await fetchAlerts();
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
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

  const active = rows.filter((r) => r.status === "unresolved");
  const history = rows.filter((r) => r.status === "resolved");

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[28px] font-bold">Alerts</h1>
          <p className="text-sm font-light text-text-secondary">
            Active and historical incident stream
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {err ? (
        <div className="mb-4 rounded-sm border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          {err}
        </div>
      ) : null}

      <section className="mb-6">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-text-primary">
                Active incidents
              </h2>
              <Badge variant={active.length > 0 ? "danger" : "neutral"}>
                {active.length}
              </Badge>
            </div>
            <AlertTable
              rows={active}
              onResolve={onResolve}
              busy={busy}
              showResolve
            />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-text-primary">
                Resolved history
              </h2>
              <Badge variant="neutral">{history.length}</Badge>
            </div>
            <AlertTable rows={history} onResolve={onResolve} busy={busy} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function AlertTable({
  rows,
  onResolve,
  busy,
  showResolve,
}: {
  rows: AlertRow[];
  onResolve: (id: number) => void;
  busy: number | null;
  showResolve?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-text-secondary">
        No rows.
      </div>
    );
  }
  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-[12px] font-medium uppercase tracking-wide text-text-dim">
          <tr>
            <th className="px-4 py-3">Severity</th>
            <th className="px-4 py-3">Risk</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Room</th>
            <th className="px-4 py-3">Device</th>
            <th className="px-4 py-3">When</th>
            {showResolve ? <th className="px-4 py-3" /> : null}
          </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.id}
                className="border-b border-border last:border-0 hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <SeverityBadge s={a.severity} />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`font-display text-sm font-semibold ${riskTone(
                      a.risk_level ?? a.severity.toUpperCase()
                    )}`}
                  >
                    {riskText(a.risk_level, a.risk_score)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-display text-[13px] font-medium">{a.title}</p>
                  <p className="text-xs font-light text-text-secondary">
                    {a.description}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs font-normal text-text-secondary">{a.room_name ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-normal text-text-secondary">
                  {a.device_external_id ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs font-light text-text-dim">
                  {new Date(a.created_at).toLocaleString()}
                </td>
                {showResolve ? (
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      disabled={busy === a.id}
                      onClick={() => onResolve(a.id)}
                    >
                      {busy === a.id ? "..." : "Resolve"}
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.map((a) => (
          <Card key={a.id} accentLeft={accentFromAlert(a)}>
            <CardContent className="p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SeverityBadge s={a.severity} />
                </div>
                <span
                  className={`font-display text-sm font-semibold ${riskTone(
                    a.risk_level ?? a.severity.toUpperCase()
                  )}`}
                >
                  {riskText(a.risk_level, a.risk_score)}
                </span>
              </div>
              <p className="font-display text-[13px] font-medium">{a.title}</p>
              <p className="mt-0.5 text-xs font-light text-text-secondary">{a.description}</p>
              <p className="mt-1 text-xs font-light text-text-dim">
                Room: <span className="text-text-secondary">{a.room_name ?? "—"}</span> · Device:{" "}
                <span className="text-text-secondary">{a.device_external_id ?? "—"}</span>
              </p>
              <p className="mt-1 text-xs font-light text-text-dim">
                {new Date(a.created_at).toLocaleString()}
              </p>
              {showResolve ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full px-3 py-2 text-xs"
                  disabled={busy === a.id}
                  onClick={() => onResolve(a.id)}
                >
                  {busy === a.id ? "..." : "Resolve"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
