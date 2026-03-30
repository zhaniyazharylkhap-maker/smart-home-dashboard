import { useAuthStore } from "@/lib/auth-store";

function clientTimeout(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

/**
 * FastAPI origin for frontend calls.
 * Backend routes are mounted under /api, e.g. POST /api/auth/login.
 */
const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";

function apiRoot(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw === "same-origin") {
    return "";
  }
  if (!raw) {
    return DEFAULT_API_ORIGIN.replace(/\/$/, "");
  }
  return raw.replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const root = apiRoot();
  if (!root) {
    return `/api${p}`;
  }
  return `${root}/api${p}`;
}

function parseErrorBody(text: string, status: number): string {
  if (text.trimStart().startsWith("<!") || text.trimStart().startsWith("<html")) {
    return `Not found or HTML error from ${status} (wrong URL — is the API running on port 8000?)`;
  }
  try {
    const j = JSON.parse(text) as { detail?: string | string[] };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) return j.detail.map(String).join(", ");
  } catch {
    /* ignore */
  }
  return text || `Request failed: ${status}`;
}

export async function publicApiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? clientTimeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseErrorBody(text, res.status));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? clientTimeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseErrorBody(text, res.status));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
