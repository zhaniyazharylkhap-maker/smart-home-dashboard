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
};

export type LatestTelemetryResponse = {
  readings: TelemetryReading[];
};

export type WsMessage =
  | { type: "telemetry"; payload: TelemetryReading }
  | { type: string; payload?: unknown };
