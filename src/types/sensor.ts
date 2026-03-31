export type SensorSample = {
  timestamp: string;
  temperature: number;
  heart_rate: number;
  spo2: number;
  acc_x: number;
  acc_y: number;
  acc_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
};

export type HistoryBucket = "minute" | "hour" | "day";

export type SensorAggregate = {
  timestamp: string;
  temperature_avg: number;
  heart_rate_avg: number;
  spo2_avg: number;
};

export type SessionSummary = {
  dateKey: string;
  startedAt?: string;
  updatedAt: string;
  elapsedMinutes: number;
  repsDone: number;
  formQuality: number;
  completionRatio: number;
};

export type LiveDataMap = Record<string, SensorSample>;
