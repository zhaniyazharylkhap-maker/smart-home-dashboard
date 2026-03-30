import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import type { LatestTelemetryResponse } from "@/types/telemetry";
import type {
  AlertRow,
  DashboardStats,
  DeviceRow,
  Room,
  TelemetryHistoryResponse,
} from "@/types/domain";

export { apiUrl, apiFetch, publicApiFetch } from "@/lib/api-client";

export async function fetchLatestTelemetry(): Promise<LatestTelemetryResponse> {
  return apiFetch<LatestTelemetryResponse>("/telemetry/latest");
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>("/stats/dashboard");
}

export async function fetchRooms(): Promise<Room[]> {
  return apiFetch<Room[]>("/rooms");
}

export async function fetchDevices(): Promise<DeviceRow[]> {
  return apiFetch<DeviceRow[]>("/devices");
}

export async function fetchAlerts(status?: string): Promise<AlertRow[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<AlertRow[]>(`/alerts${q}`);
}

export async function resolveAlert(id: number): Promise<AlertRow> {
  return apiFetch<AlertRow>(`/alerts/${id}/resolve`, { method: "PATCH" });
}

export async function fetchTelemetryHistory(params: {
  metric: string;
  range: string;
  room?: string;
  device_id?: string;
}): Promise<TelemetryHistoryResponse> {
  const sp = new URLSearchParams();
  sp.set("metric", params.metric);
  sp.set("range", params.range);
  if (params.room) sp.set("room", params.room);
  if (params.device_id) sp.set("device_id", params.device_id);
  return apiFetch<TelemetryHistoryResponse>(`/telemetry/history?${sp.toString()}`);
}

export function getWsUrl(): string {
  const token = useAuthStore.getState().token;
  const fromEnv = process.env.NEXT_PUBLIC_WS_URL;
  let wsRoot = "ws://127.0.0.1:8000";
  if (fromEnv) {
    const s = fromEnv.trim();
    if (s.startsWith("ws://") || s.startsWith("wss://")) {
      wsRoot = s.replace(/\/$/, "");
    } else {
      const u = s.replace(/^https?:\/\//, "");
      wsRoot = `ws://${u.replace(/\/$/, "")}`;
    }
  } else if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    wsRoot = `${proto}//${window.location.hostname}:8000`;
  }
  const suffix = token
    ? `?token=${encodeURIComponent(token)}`
    : "?token=";
  return `${wsRoot}/ws/live${suffix}`;
}
