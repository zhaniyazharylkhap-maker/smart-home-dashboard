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
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-border bg-bg/85 px-4 py-3 backdrop-blur md:px-5 lg:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide text-text-primary transition-colors hover:text-accent"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-strong bg-surface">
              <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(20,195,166,0.55)]" />
            </span>
            <span className="font-display tracking-[0.08em]">LiveSense</span>
            <span className="hidden text-[10px] font-light uppercase tracking-[0.16em] text-text-dim md:inline">
              Transparent home analytics
            </span>
          </Link>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-dim">
              Operator
            </p>
            <p className="max-w-[160px] truncate font-body text-xs font-light text-text-secondary md:max-w-[260px]">
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
