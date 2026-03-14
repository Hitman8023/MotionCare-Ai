import type { SensorSample } from "../types/sensor";

type Range = {
  min: number;
  max: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

export const vitalsRanges = {
  heartRate: { min: 55, max: 110 },
  spo2: { min: 92, max: 100 },
  temperature: { min: 36.1, max: 37.8 },
} satisfies Record<string, Range>;

function scoreFromRange(value: number, range: Range, falloff = 0.4): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= range.min && value <= range.max) return 1;
  const span = range.max - range.min;
  const center = range.min + span / 2;
  const distance = Math.abs(value - center);
  const normalized = clamp01(distance / (span / 2 + falloff * span));
  return clamp01(1 - normalized);
}

export function computeGyroMagnitude(sample: SensorSample): number {
  return Math.sqrt(
    sample.gyro_x ** 2 + sample.gyro_y ** 2 + sample.gyro_z ** 2,
  );
}

export function computeRecoveryScore(sample: SensorSample): number {
  const hrScore = scoreFromRange(sample.heart_rate, vitalsRanges.heartRate);
  const spo2Score = scoreFromRange(sample.spo2, vitalsRanges.spo2);
  const tempScore = scoreFromRange(
    sample.temperature,
    vitalsRanges.temperature,
  );
  const gyroMagnitude = computeGyroMagnitude(sample);
  const motionScore = clamp01(1 - Math.abs(gyroMagnitude - 60) / 90);

  const weighted =
    hrScore * 0.25 + spo2Score * 0.3 + tempScore * 0.25 + motionScore * 0.2;

  return Math.round(weighted * 100);
}

export function computeAccuracy(sample: SensorSample): number {
  const gyroMagnitude = computeGyroMagnitude(sample);
  const motionScore = clamp01(1 - Math.abs(gyroMagnitude - 55) / 85);
  return Math.round(60 + motionScore * 40);
}

export function computeFlexRange(sample: SensorSample): number {
  const gyroMagnitude = computeGyroMagnitude(sample);
  return Math.round(clamp(gyroMagnitude * 0.6, 12, 80));
}

export function computeConsistencyIntensity(sample: SensorSample): number {
  const gyroMagnitude = computeGyroMagnitude(sample);
  const intensity = clamp01(gyroMagnitude / 120);
  return Math.min(3, Math.max(0, Math.round(intensity * 3)));
}

export function detectAlertCount(sample: SensorSample): number {
  let count = 0;
  if (
    sample.heart_rate < vitalsRanges.heartRate.min ||
    sample.heart_rate > vitalsRanges.heartRate.max
  )
    count += 1;
  if (sample.spo2 < vitalsRanges.spo2.min) count += 1;
  if (
    sample.temperature < vitalsRanges.temperature.min ||
    sample.temperature > vitalsRanges.temperature.max
  )
    count += 1;
  return count;
}

export function smoothValue(prev: number, next: number, alpha = 0.2): number {
  if (!Number.isFinite(prev)) return next;
  return Math.round(prev + alpha * (next - prev));
}

export function formatTimestampLabel(timestamp?: string): string {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
