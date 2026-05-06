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
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[400px] rounded-card border border-border bg-surface p-6 shadow-card">
        <h1 className="text-center font-display text-[28px] font-bold text-accent">
          NEXUS
        </h1>
        <p className="mt-1 text-center text-sm font-light text-text-secondary">
          Create your account
        </p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs font-normal text-text-secondary">
            Full name
            <input
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface px-3 py-2 font-body text-sm font-normal text-text-primary outline-none transition-colors focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block text-xs font-normal text-text-secondary">
            Email
            <input
              className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface px-3 py-2 font-body text-sm font-normal text-text-primary outline-none transition-colors focus:border-accent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
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
              minLength={8}
              required
            />
            <p
              className={`mt-1 text-[11px] font-light ${
                password.length >= 8 ? "text-accent" : "text-text-dim"
              }`}
            >
              Minimum 8 characters
            </p>
          </label>
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm font-light text-text-secondary">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:text-accent-dim">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
