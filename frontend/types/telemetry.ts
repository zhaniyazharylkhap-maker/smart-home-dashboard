export type TelemetryReading = {
  device_id: string;
  room: string;
  temperature: number | null;
  humidity: number | null;
  motion: boolean | null;
  light: number | null;
  gas: number | null;
  smoke: number | null;
  timestamp: string;
  trace_id?: string | null;
  t_sim?: number | null;
  risk_score?: number | null;
  risk_level?: "SAFE" | "WARNING" | "CRITICAL" | string | null;
  alert_reasons?: string[] | null;
  anomaly_score?: number | null;
  anomaly_threshold?: number | null;
  is_contextual_anomaly?: boolean | null;
  explanation_tokens?: string[] | null;
  model_version?: string | null;
};

export type LatestTelemetryResponse = {
  readings: TelemetryReading[];
};

export type FeatureContribution = {
  feature: string;
  z: number;
};

export type ContextualAnomalyEvent = {
  device_id: string;
  room: string;
  timestamp: string;
  anomaly_score: number;
  anomaly_threshold: number;
  is_contextual_anomaly: boolean;
  explanation_tokens: string[];
  feature_contributions: FeatureContribution[];
  model_version: string;
  degraded?: boolean;
};

export type WsMessage =
  | {
      type: "alert";
      payload: {
        id: number;
        room_name: string | null;
        device_external_id: string | null;
        severity: string;
        title: string;
        description: string | null;
        created_at: string;
        risk_score?: number | null;
        risk_level?: string | null;
        alert_reasons?: string[] | null;
      };
    }
  | { type: "telemetry"; payload: TelemetryReading }
  | { type: "contextual_anomaly"; payload: ContextualAnomalyEvent }
  | { type: string; payload?: unknown };
