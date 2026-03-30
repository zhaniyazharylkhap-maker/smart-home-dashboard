"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Bell,
  Cpu,
  LineChart,
  Shield,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

const features = [
  {
    title: "Realtime telemetry",
    body: "MQTT ingestion with unified payloads ready for ESP32 swap-in.",
    icon: Activity,
  },
  {
    title: "Alert intelligence",
    body: "Threshold rules with severities, actions, and full audit history.",
    icon: Bell,
  },
  {
    title: "Live dashboards",
    body: "WebSocket fan-out so operators see changes instantly.",
    icon: LineChart,
  },
  {
    title: "Digital twin ready",
    body: "Room-aware modeling built for expansion into 3D twin views.",
    icon: Cpu,
  },
];

const steps = [
  { title: "Connect", body: "Devices publish to your broker using one schema." },
  { title: "Process", body: "FastAPI validates, stores, and evaluates rules." },
  { title: "Observe", body: "Teams watch KPIs, charts, and incidents in the app." },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(199_89%_48%_/_0.14),_transparent_55%)]" />
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/30">
            <Sparkles className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Nexus Twin
            </p>
            <p className="text-sm font-semibold">Smart Home Cloud</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium",
              "bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:opacity-95"
            )}
          >
            Create account
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        <section className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5 text-accent" />
                Production-style IoT architecture
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
                AI-powered IoT smart home{" "}
                <span className="text-accent">digital twin</span> platform
              </h1>
              <p className="mt-5 max-w-xl text-base text-muted-foreground">
                Monitor telemetry, orchestrate scenarios, and resolve incidents from a
                single SaaS-grade control plane — built for graduation demos and
                ready for real sensors.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium",
                    "bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:opacity-95"
                  )}
                >
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-transparent px-6 py-2.5 text-sm font-medium hover:bg-muted/60"
                  )}
                >
                  View dashboard
                </Link>
              </div>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 to-background/40 p-6 shadow-2xl"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_hsl(280_60%_40%_/_0.12),_transparent_40%)]" />
            <div className="relative space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Dashboard preview
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                  <p className="text-xs text-muted-foreground">Home status</p>
                  <p className="mt-2 text-2xl font-semibold">Safe</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                  <p className="text-xs text-muted-foreground">Active alerts</p>
                  <p className="mt-2 text-2xl font-semibold">0</p>
                </div>
                <div className="col-span-2 rounded-2xl border border-border/60 bg-background/30 p-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Temperature</span>
                    <span className="font-mono text-accent">24.6°C</span>
                  </div>
                  <div className="mt-3 h-24 rounded-xl bg-gradient-to-r from-accent/20 via-accent/5 to-transparent" />
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold">Capabilities</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Everything you need for a credible smart home SaaS MVP — realtime data,
            policy, and operator UX.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-border/60 bg-card/40 p-5"
              >
                <f.icon className="h-5 w-5 text-accent" />
                <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
                <p className="mt-2 text-xs text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map((s, idx) => (
              <div
                key={s.title}
                className="rounded-2xl border border-border/60 bg-card/30 p-6"
              >
                <p className="text-xs font-semibold text-accent">0{idx + 1}</p>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-3xl border border-border/60 bg-card/40 p-8 sm:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Pricing (mock)</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Starter is free for development. Pro adds SSO, retention, and SLA —
                placeholders for your pitch deck.
              </p>
            </div>
            <div className="flex gap-4">
              <div className="rounded-2xl border border-border/70 bg-background/40 px-6 py-4">
                <p className="text-xs text-muted-foreground">Starter</p>
                <p className="mt-2 text-3xl font-semibold">$0</p>
              </div>
              <div className="rounded-2xl border border-accent/30 bg-accent/10 px-6 py-4">
                <p className="text-xs text-muted-foreground">Pro</p>
                <p className="mt-2 text-3xl font-semibold">$49</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-10 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Nexus Twin. Built for IoT telemetry graduation projects.
      </footer>
    </div>
  );
}
