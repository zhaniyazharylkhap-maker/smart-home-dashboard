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
