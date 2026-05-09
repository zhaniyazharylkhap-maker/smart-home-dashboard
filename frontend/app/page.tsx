"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  Cpu,
  Gauge,
  Network,
  ShieldCheck,
} from "lucide-react";

import { Card, CardSectionLabel } from "@/components/ui/card";

const capabilities = [
  {
    title: "Contextual ML anomaly detection",
    description:
      "Isolation Forest + LOF ensemble with adaptive per-device thresholds, occupancy-aware features and humanized explanations.",
    icon: Brain,
  },
  {
    title: "Real-time stream",
    description:
      "Redis Streams + WebSocket bridge with replay, durable acks and reconnect-safe consumer groups.",
    icon: Network,
  },
  {
    title: "Behavioral analytics",
    description:
      "Learned-normal envelopes per hour-of-day, cross-sensor correlations, and behavioral heatmaps.",
    icon: Activity,
  },
  {
    title: "Operational metrics",
    description:
      "Stream latency, throughput, message loss and degraded-mode visibility — production-grade telemetry UX.",
    icon: Gauge,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-strong bg-surface">
              <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(20,195,166,0.55)]" />
            </span>
            <span className="font-display text-base font-semibold tracking-[0.12em] text-text-primary">
              LiveSense
            </span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.16em] text-text-dim md:inline">
              Home intelligence
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center justify-center rounded-btn border border-transparent px-4 py-2 font-display text-sm font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-btn border border-accent bg-accent px-4 py-2 font-display text-sm font-medium text-text-on-accent hover:border-accent-hover hover:bg-accent-hover"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
        <section className="px-2 py-14 text-center md:py-[100px]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
              LiveSense
            </p>
            <h1 className="mx-auto mt-4 max-w-4xl font-display text-[34px] font-semibold leading-tight md:text-[52px]">
              Transparent analytics for{" "}
              <span className="text-accent">smart homes.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[640px] text-base font-light text-text-secondary md:text-[17px]">
              Transparent analytics for smart homes. Live telemetry. Contextual
              anomalies.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-btn border border-accent bg-accent px-5 py-2.5 font-display text-sm font-semibold text-text-on-accent hover:border-accent-hover hover:bg-accent-hover"
              >
                Create account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-btn border border-border-strong bg-surface px-5 py-2.5 font-display text-sm font-semibold text-text-primary hover:bg-surface-2"
              >
                Sign in
              </Link>
            </div>
          </motion.div>
        </section>

        <section className="mb-12">
          <CardSectionLabel className="mb-3">Capabilities</CardSectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            {capabilities.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
              >
                <Card className="h-full">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-accent/30 bg-accent-light text-accent">
                      <f.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="font-display text-base font-semibold text-text-primary">
                        {f.title}
                      </h3>
                      <p className="mt-1 text-sm font-light text-text-secondary">
                        {f.description}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mb-14">
          <CardSectionLabel className="mb-3">Architecture</CardSectionLabel>
          <Card className="md:p-8">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: Cpu,
                  title: "Ingest",
                  desc: "MQTT + simulated IoT devices stream telemetry to the backend.",
                },
                {
                  icon: Brain,
                  title: "Score",
                  desc: "Contextual ML model emits explanations and adaptive thresholds.",
                },
                {
                  icon: ShieldCheck,
                  title: "Act",
                  desc: "Risk engine creates humanized incidents with recommended actions.",
                },
              ].map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                  className="rounded-md border border-border bg-surface-2/40 p-4"
                >
                  <div className="flex items-center gap-2 text-accent">
                    <s.icon className="h-4 w-4" />
                    <span className="font-display text-sm font-semibold uppercase tracking-wider">
                      {s.title}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-light text-text-secondary">
                    {s.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <Card tone="info">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent-light text-accent">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-display text-sm font-semibold text-text-primary">
                    See it on live data
                  </p>
                  <p className="text-sm font-light text-text-secondary">
                    Sign in with the demo account to explore live telemetry,
                    anomalies and the operational dashboard.
                  </p>
                </div>
              </div>
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-btn border border-accent bg-accent px-4 py-2 font-display text-sm font-medium text-text-on-accent hover:border-accent-hover hover:bg-accent-hover"
              >
                Open the console
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Card>
        </section>
      </main>

      <footer className="pb-8 pt-4 text-center text-[11px] font-light text-text-dim">
        LiveSense · transparent home telemetry
      </footer>
    </div>
  );
}
