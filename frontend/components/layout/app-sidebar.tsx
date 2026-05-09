"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Brain,
  Cpu,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/telemetry", label: "Telemetry", icon: Activity },
  { href: "/anomaly", label: "Anomaly", icon: Brain },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

export function AppSidebar() {
  const pathname = usePathname();
  const userEmail = useAuthStore((s) => s.user?.email);
  const clearSession = useAuthStore((s) => s.clearSession);

  return (
    <aside className="hidden min-h-screen flex-col border-r border-border bg-surface md:flex md:w-16 lg:w-[228px]">
      <div className="flex items-center gap-2 px-3 py-5 lg:px-4">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-strong bg-surface-2">
          <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(20,195,166,0.55)]" />
        </span>
        <p className="hidden font-display text-base font-semibold tracking-[0.06em] text-text-primary lg:block">
          LiveSense
        </p>
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  "group relative flex min-h-10 items-center justify-center rounded-btn border border-transparent px-2 font-body text-sm font-normal text-text-secondary transition-colors lg:justify-start lg:gap-3 lg:px-3",
                  active
                    ? "bg-surface-2 text-accent"
                    : "hover:bg-surface-2 hover:text-text-primary"
                )}
                title={item.label}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-0 hidden w-[3px] rounded-r-full bg-accent shadow-[0_0_8px_rgba(20,195,166,0.45)] lg:block"
                  />
                ) : null}
                <Icon
                  className={cn(
                    "h-[18px] w-[18px]",
                    active ? "text-accent" : "text-text-secondary"
                  )}
                />
                <span className="hidden lg:inline">{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2 lg:p-3">
        <p
          className="hidden truncate pb-2 font-body text-[11px] font-light text-text-dim lg:block"
          title={userEmail ?? ""}
        >
          {userEmail ?? "unknown@local"}
        </p>
        <Button
          variant="ghost"
          className="w-full justify-center lg:justify-start"
          type="button"
          title="Sign out"
          onClick={() => {
            clearSession();
            window.location.href = "/login";
          }}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden lg:inline">Sign out</span>
        </Button>
      </div>
    </aside>
  );
}
