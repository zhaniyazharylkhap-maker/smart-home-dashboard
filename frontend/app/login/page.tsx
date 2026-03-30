"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiFetch, publicApiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";

type TokenOut = { access_token: string; token_type: string };
type MeOut = { id: number; name: string; email: string; created_at: string };

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("demo@nexus.local");
  const [password, setPassword] = useState("Demo123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tok = await publicApiFetch<TokenOut>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(tok.access_token, {
        id: 0,
        name: "",
        email: "",
      });
      const me = await apiFetch<MeOut>("/auth/me");
      setSession(tok.access_token, {
        id: me.id,
        name: me.name,
        email: me.email,
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card/50 p-8 shadow-2xl backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Welcome back
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use the seeded demo account or register a new user.
        </p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs font-medium text-muted-foreground">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Continue"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Register
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo: demo@nexus.local / Demo123!
        </p>
      </div>
    </div>
  );
}
