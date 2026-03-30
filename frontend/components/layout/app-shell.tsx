"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border/60 bg-background/40 px-6 py-4 backdrop-blur-md">
          <Link
            href="/"
            className="text-sm text-muted-foreground transition hover:text-foreground"
          >
            ← Marketing home
          </Link>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Signed in</p>
            <p className="text-sm font-medium">{user?.email}</p>
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
