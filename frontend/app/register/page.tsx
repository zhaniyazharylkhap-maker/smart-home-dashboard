"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiFetch, publicApiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";

type TokenOut = { access_token: string; token_type: string };
type MeOut = { id: number; name: string; email: string; created_at: string };

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tok = await publicApiFetch<TokenOut>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
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
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card border border-border bg-surface p-6 shadow-panel md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-surface-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold tracking-[0.2em] text-text-primary">
              NEXUS
            </p>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-dim">
              Smart Home Analytics
            </p>
          </div>
        </div>

        <h1 className="font-display text-xl font-semibold text-text-primary">
          Create account
        </h1>
        <p className="mt-1 text-sm font-light text-text-secondary">
          Spin up your operator workspace and start monitoring your fleet.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-[11px] uppercase tracking-wider text-text-dim">
            Full name
            <input
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface-2 px-3 py-2 font-body text-sm font-normal text-text-primary outline-none transition-colors focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block text-[11px] uppercase tracking-wider text-text-dim">
            Email
            <input
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface-2 px-3 py-2 font-body text-sm font-normal text-text-primary outline-none transition-colors focus:border-accent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </label>
          <label className="block text-[11px] uppercase tracking-wider text-text-dim">
            Password
            <input
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface-2 px-3 py-2 font-body text-sm font-normal text-text-primary outline-none transition-colors focus:border-accent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={8}
              required
            />
            <p
              className={`mt-1 text-[11px] font-light ${
                password.length >= 8 ? "text-safe" : "text-text-dim"
              }`}
            >
              Minimum 8 characters
            </p>
          </label>
          {error ? (
            <p className="rounded-md border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={loading}
          >
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm font-light text-text-secondary">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-accent hover:text-accent-hover"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
