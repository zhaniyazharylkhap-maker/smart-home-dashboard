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
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[400px] rounded-card border border-border bg-surface p-6 shadow-card">
        <h1 className="text-center font-display text-[28px] font-bold text-accent">
          NEXUS
        </h1>
        <p className="mt-1 text-center text-sm font-light text-text-secondary">
          Sign in to your account
        </p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs font-normal text-text-secondary">
            Email
            <input
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface px-3 py-2 font-body text-sm font-normal text-text-primary outline-none transition-colors focus:border-accent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="block text-xs font-normal text-text-secondary">
            Password
            <input
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface px-3 py-2 font-body text-sm font-normal text-text-primary outline-none transition-colors focus:border-accent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-4 rounded-btn bg-surface-2 p-3">
          <p className="mb-1 text-xs font-light text-text-dim">
            Demo credentials
          </p>
          <p className="text-xs font-light text-text-dim">Email: demo@nexus.local</p>
          <p className="text-xs font-light text-text-dim">Password: Demo123!</p>
        </div>

        <p className="mt-4 text-center text-sm font-light text-text-secondary">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-accent hover:text-accent-dim">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
