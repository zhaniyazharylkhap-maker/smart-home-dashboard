export type Room = {
  id: number;
  name: string;
  type: string;
  created_at: string;
  device_count: number;
};

export type DeviceRow = {
  id: number;
  device_id: string;
  name: string;
  room_id: number;
  room_name: string;
  device_type: string;
  status: string;
  last_seen: string | null;
  created_at: string;
};

export type AlertRow = {
  id: number;
  room_id: number | null;
  room_name: string | null;
  device_id: number | null;
  device_external_id: string | null;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  recommended_action: string | null;
  risk_score: number | null;
  risk_level: string | null;
  alert_reasons: string[] | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

export type DashboardStats = {
  devices_total: number;
  devices_online: number;
  active_alerts: number;
  home_status: string;
};

export type TelemetryHistoryResponse = {
  room: string | null;
  device_id: string | null;
  metric: string;
  range: string;
  points: { t: string; v: number | null }[];
};

export type AnomalyLiveItem = {
  device_id: string;
  room: string;
  last_seen: string;
  anomaly_score: number;
  anomaly_threshold: number;
  is_contextual_anomaly: boolean;
  explanation_tokens: string[];
  model_version?: string | null;
  degraded?: boolean;
};

export type AnomalyLiveResponse = {
  items: AnomalyLiveItem[];
};

export type AnomalyHistoryPoint = {
  t: string;
  score: number;
  threshold: number;
  is_anomaly: boolean;
};

export type AnomalyHistoryResponse = {
  device_id: string | null;
  range: string;
  points: AnomalyHistoryPoint[];
};

export type AnomalyExplanationsResponse = {
  range: string;
  top_factors: { label: string; count: number }[];
  sample_events: {
    device_id: string;
    room: string;
    timestamp: string;
    anomaly_score: number;
    anomaly_threshold: number;
    is_contextual_anomaly: boolean;
    explanation_tokens: string[];
    feature_contributions: { feature: string; z: number }[];
    model_version: string;
    degraded?: boolean;
  }[];
};

export type CorrelationResponse = {
  metrics: string[];
  cells: { a: string; b: string; correlation: number }[];
  sample_size: number;
};

export type BehaviorProfileResponse = {
  metric: string;
  room: string | null;
  points: { hour: number; p10: number; p50: number; p90: number }[];
};
