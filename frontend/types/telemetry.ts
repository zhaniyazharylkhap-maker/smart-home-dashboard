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
};

export type LatestTelemetryResponse = {
  readings: TelemetryReading[];
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
  | { type: string; payload?: unknown };
