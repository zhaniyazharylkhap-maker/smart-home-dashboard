"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, Bell, Cpu } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const capabilities = [
  {
    title: "Real-time telemetry",
    description: "Sensor data streamed live to your dashboard",
    icon: Activity,
  },
  {
    title: "Instant alerts",
    description: "Rule-based and anomaly-driven notifications",
    icon: Bell,
  },
  {
    title: "Multi-device",
    description: "Monitor an entire fleet from a single view",
    icon: Cpu,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 md:px-6">
        <p className="font-display text-xl font-bold text-accent">NEXUS</p>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-btn px-5 py-2.5 font-display text-sm font-semibold text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-btn border border-accent bg-accent px-5 py-2.5 font-display text-sm font-semibold text-text-on-accent hover:border-accent-hover hover:bg-accent-hover"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
        <section className="px-2 py-14 text-center md:py-[120px]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
          >
            <p className="text-sm font-light uppercase tracking-[0.14em] text-accent">
              Smart Home Monitoring
            </p>
            <h1 className="mx-auto mt-4 max-w-4xl text-[32px] font-bold leading-tight md:text-[48px]">
              Real-time intelligence for your environment
            </h1>
            <p className="mx-auto mt-4 max-w-[520px] text-base font-light text-text-secondary md:text-[18px]">
              Monitor temperature, motion, humidity and light across every room.
              Instant alerts when something needs your attention.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-btn border-[1.5px] border-accent bg-surface px-5 py-2.5 font-display text-sm font-semibold text-accent hover:bg-accent-light"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center justify-center rounded-btn border border-accent bg-accent px-5 py-2.5 font-display text-sm font-semibold text-text-on-accent hover:border-accent-hover hover:bg-accent-hover"
              >
                Create account
              </Link>
            </div>
          </motion.div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {capabilities.map((f, i) => (
            <Card key={f.title} className="text-center">
              <CardContent className="flex flex-col items-center gap-3">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                >
                  <f.icon className="h-8 w-8 text-accent" />
                </motion.div>
                <h3 className="font-display text-base font-semibold">{f.title}</h3>
                <p className="text-sm font-light text-text-secondary">
                  {f.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-14">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                n: "1",
                title: "Connect",
                text: "Attach devices and start secure telemetry streaming.",
              },
              {
                n: "2",
                title: "Monitor",
                text: "Track room conditions and trends in real time.",
              },
              {
                n: "3",
                title: "Act",
                text: "Resolve alerts quickly with clear risk context.",
              },
            ].map((step, i) => (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
                className="rounded-card border border-border bg-surface p-6 shadow-card"
              >
                <p className="font-display text-5xl font-bold text-accent-light">
                  {step.n}
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm font-light text-text-secondary">
                  {step.text}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <footer className="pb-8 pt-4 text-center text-xs font-light text-text-dim">
        Nexus Smart Home Platform
      </footer>
    </div>
  );
}
