"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BottomNav } from "@/components/layout/bottom-nav";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useAuthStore } from "@/lib/auth-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!token) router.replace("/login");
  }, [ready, token, router]);

  if (!ready || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg font-body text-sm text-text-secondary">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg text-text-primary">
      <AppSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between border-b border-border bg-bg px-4 py-3 md:px-5 lg:px-6">
          <Link
            href="/"
            className="font-display text-sm font-semibold tracking-wide text-accent transition-colors hover:text-accent-hover"
          >
            NEXUS
          </Link>
          <div className="text-right">
            <p className="text-[11px] font-body font-light uppercase tracking-wide text-text-dim">
              Operator
            </p>
            <p className="max-w-[160px] truncate font-body text-xs font-light text-text-secondary md:max-w-[220px]">
              {user?.email}
            </p>
          </div>
        </header>
        <main className="flex-1 overflow-auto pb-20 md:pb-0">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
