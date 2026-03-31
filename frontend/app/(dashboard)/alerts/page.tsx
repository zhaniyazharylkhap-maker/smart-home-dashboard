"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchAlerts, resolveAlert } from "@/lib/api";
import type { AlertRow } from "@/types/domain";
import { cn } from "@/lib/utils";

function SeverityBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    critical: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    warning: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
    info: "bg-sky-500/15 text-sky-200 ring-sky-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
        map[s] ?? "bg-muted text-muted-foreground ring-border"
      )}
    >
      {s}
    </span>
  );
}

function RiskBadge({ level }: { level: string | null }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    WARNING: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
    SAFE: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  };
  if (!level) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
        map[level] ?? "bg-muted text-muted-foreground ring-border"
      )}
    >
      {level}
    </span>
  );
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Incidents
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Alerts</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Rule engine output stored in PostgreSQL. Resolve incidents after you
            verify remediation.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {err ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {err}
        </div>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Active ({active.length})
        </h2>
        <AlertTable
          rows={active}
          onResolve={onResolve}
          busy={busy}
          showResolve
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          History ({history.length})
        </h2>
        <AlertTable rows={history} onResolve={onResolve} busy={busy} />
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
      <div className="rounded-2xl border border-dashed border-border/70 bg-card/30 px-4 py-10 text-center text-sm text-muted-foreground">
        No rows.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
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
            <tr key={a.id} className="border-b border-border/40 last:border-0">
              <td className="px-4 py-3">
                <SeverityBadge s={a.severity} />
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <RiskBadge level={a.risk_level} />
                  <span className="text-xs text-muted-foreground">
                    {a.risk_score == null ? "—" : `${Math.round(a.risk_score)}/100`}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.description}</p>
                {a.alert_reasons && a.alert_reasons.length > 0 ? (
                  <p className="mt-1 text-xs text-foreground/90">
                    {a.alert_reasons.join(" · ")}
                  </p>
                ) : null}
                {a.recommended_action ? (
                  <p className="mt-1 text-xs text-accent/90">
                    → {a.recommended_action}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3">{a.room_name ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {a.device_external_id ?? "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </td>
              {showResolve ? (
                <td className="px-4 py-3 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    disabled={busy === a.id}
                    onClick={() => onResolve(a.id)}
                  >
                    {busy === a.id ? "…" : "Resolve"}
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
