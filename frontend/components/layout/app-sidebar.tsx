"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Cpu,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/telemetry", label: "Telemetry", icon: Activity },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

export function AppSidebar() {
  const pathname = usePathname();
  const userEmail = useAuthStore((s) => s.user?.email);
  const clearSession = useAuthStore((s) => s.clearSession);

  return (
    <aside className="hidden min-h-screen flex-col border-r border-border bg-surface md:flex md:w-14 lg:w-[220px]">
      <div className="flex items-center px-2 py-5 lg:px-4">
        <div className="flex h-8 w-8 items-center justify-center">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
        </div>
        <p className="hidden font-display text-lg font-bold tracking-wide text-accent lg:block">
          NEXUS
        </p>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-btn border border-transparent px-2 font-body text-sm font-normal text-text-secondary transition-colors lg:justify-start lg:gap-3 lg:px-3.5",
                  active
                    ? "border-l-[3px] border-l-accent bg-accent-light font-display font-medium text-accent"
                    : "hover:bg-surface-2 hover:text-text-primary"
                )}
                title={item.label}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="hidden lg:inline">
                  {item.label}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2 lg:p-3">
        <p
          className="hidden truncate pb-2 font-body text-xs font-light text-text-dim lg:block"
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
