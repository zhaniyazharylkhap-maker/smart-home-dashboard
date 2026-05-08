import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import type { LatestTelemetryResponse } from "@/types/telemetry";
import type {
  AlertRow,
  AnomalyExplanationsResponse,
  AnomalyHistoryResponse,
  AnomalyLiveResponse,
  BehaviorProfileResponse,
  CorrelationResponse,
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

export async function fetchAnomalyLive(): Promise<AnomalyLiveResponse> {
  return apiFetch<AnomalyLiveResponse>("/anomaly/live");
}

export async function fetchAnomalyHistory(params: {
  device_id: string;
  range?: string;
  limit?: number;
}): Promise<AnomalyHistoryResponse> {
  const sp = new URLSearchParams();
  sp.set("device_id", params.device_id);
  if (params.range) sp.set("range", params.range);
  if (params.limit) sp.set("limit", String(params.limit));
  return apiFetch<AnomalyHistoryResponse>(`/anomaly/history?${sp.toString()}`);
}

export async function fetchAnomalyExplanations(
  range = "24h"
): Promise<AnomalyExplanationsResponse> {
  const sp = new URLSearchParams();
  sp.set("range", range);
  return apiFetch<AnomalyExplanationsResponse>(`/anomaly/explanations?${sp.toString()}`);
}

export async function fetchSensorCorrelation(
  range = "24h"
): Promise<CorrelationResponse> {
  const sp = new URLSearchParams();
  sp.set("range", range);
  return apiFetch<CorrelationResponse>(`/anomaly/correlation?${sp.toString()}`);
}

export async function fetchBehaviorProfile(params: {
  metric: string;
  room?: string;
  days?: number;
}): Promise<BehaviorProfileResponse> {
  const sp = new URLSearchParams();
  sp.set("metric", params.metric);
  if (params.room) sp.set("room", params.room);
  if (params.days) sp.set("days", String(params.days));
  return apiFetch<BehaviorProfileResponse>(`/anomaly/profile?${sp.toString()}`);
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
