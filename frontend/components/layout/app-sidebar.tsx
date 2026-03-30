"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Home,
  LayoutDashboard,
  LineChart,
  LogOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/telemetry", label: "Telemetry", icon: LineChart },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
];

export function AppSidebar() {
  const pathname = usePathname();
  const clearSession = useAuthStore((s) => s.clearSession);

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border/70 bg-card/40 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/30">
          <Activity className="h-5 w-5 text-accent" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Nexus Twin
          </p>
          <p className="text-sm font-semibold">Control</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        <Link href="/">
          <motion.span
            whileHover={{ x: 2 }}
            className="mb-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
          >
            <Home className="h-4 w-4" />
            Marketing home
          </motion.span>
        </Link>
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <motion.span
                whileHover={{ x: 2 }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-muted/80 text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </motion.span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border/60 p-4">
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="w-full justify-center"
            type="button"
            onClick={() => {
              clearSession();
              window.location.href = "/";
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
          <p className="text-center text-[10px] text-muted-foreground">
            Opens the public homepage. Sign in again from there or{" "}
            <Link href="/login" className="text-accent underline">
              /login
            </Link>
            .
          </p>
        </div>
      </div>
    </aside>
  );
}
