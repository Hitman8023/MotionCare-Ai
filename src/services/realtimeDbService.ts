import { onValue, ref, set, update } from "firebase/database";
import { realtimeDb } from "../firebase";
import type { UserRole } from "../types/auth";
import type {
  HistoryBucket,
  LiveDataMap,
  SensorAggregate,
  SensorSample,
  SessionSummary,
} from "../types/sensor";

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function pickFirst(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj) return obj[key];
  }
  return undefined;
}

function normalizeSensorSample(raw: unknown): SensorSample | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Record<string, unknown>;
  const motion =
    data.motion && typeof data.motion === "object"
      ? (data.motion as Record<string, unknown>)
      : {};
  const health =
    data.health && typeof data.health === "object"
      ? (data.health as Record<string, unknown>)
      : {};

  // Supports both legacy flat payloads and split payloads under motion/health.
  const merged = { ...data, ...motion, ...health };

  const timestampRaw =
    pickFirst(motion, ["timestamp", "ts", "time"]) ??
    pickFirst(health, ["timestamp", "ts", "time"]) ??
    pickFirst(data, ["timestamp", "ts", "time"]);
  const timestamp =
    typeof timestampRaw === "string" && timestampRaw.trim().length > 0
      ? timestampRaw
      : new Date().toISOString();

  return {
    timestamp,
    temperature: toNumber(
      pickFirst(merged, ["lm35_temp", "temperature", "lm35", "lm_35"]),
    ),
    heart_rate: toNumber(
      pickFirst(merged, ["heart_rate", "heartRate", "hr", "bpm"]),
    ),
    spo2: toNumber(
      pickFirst(merged, ["spo2", "SpO2", "oxygen", "oxygen_saturation"]),
    ),
    acc_x: toNumber(pickFirst(merged, ["acc_x", "accX", "ax"])),
    acc_y: toNumber(pickFirst(merged, ["acc_y", "accY", "ay"])),
    acc_z: toNumber(pickFirst(merged, ["acc_z", "accZ", "az"])),
    gyro_x: toNumber(pickFirst(merged, ["gyro_x", "gyroX", "gx"])),
    gyro_y: toNumber(pickFirst(merged, ["gyro_y", "gyroY", "gy"])),
    gyro_z: toNumber(pickFirst(merged, ["gyro_z", "gyroZ", "gz"])),
  };
}

function normalizeLiveDataMap(raw: unknown): LiveDataMap {
  if (!raw || typeof raw !== "object") return {};

  const map = raw as Record<string, unknown>;
  const normalized: LiveDataMap = {};

  Object.entries(map).forEach(([uid, sample]) => {
    const next = normalizeSensorSample(sample);
    if (next) normalized[uid] = next;
  });

  return normalized;
}

function normalizeSessionSummary(
  raw: unknown,
  dateKey: string,
): SessionSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const updatedAtRaw = pickFirst(data, [
    "updatedAt",
    "timestamp",
    "ts",
    "time",
  ]);
  const updatedAt =
    typeof updatedAtRaw === "string" && updatedAtRaw.trim().length > 0
      ? updatedAtRaw
      : new Date().toISOString();
  return {
    dateKey,
    startedAt: typeof data.startedAt === "string" ? data.startedAt : undefined,
    updatedAt,
    elapsedMinutes: toNumber(data.elapsedMinutes),
    repsDone: toNumber(data.repsDone),
    formQuality: toNumber(data.formQuality),
    completionRatio: Math.max(0, Math.min(1, toNumber(data.completionRatio))),
  };
}

function normalizeSessionHistory(raw: unknown): Record<string, SessionSummary> {
  if (!raw || typeof raw !== "object") return {};
  const map = raw as Record<string, unknown>;
  const normalized: Record<string, SessionSummary> = {};
  Object.entries(map).forEach(([dateKey, summary]) => {
    const next = normalizeSessionSummary(summary, dateKey);
    if (next) normalized[dateKey] = next;
  });
  return normalized;
}

function hasAnyFulfilled(results: PromiseSettledResult<unknown>[]): boolean {
  return results.some((result) => result.status === "fulfilled");
}

function logRejectedWrites(
  context: string,
  results: PromiseSettledResult<unknown>[],
): void {
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      // Helps diagnose RTDB rule/path issues without breaking auth UX.
      console.error(`${context} write[${index}] failed`, result.reason);
    }
  });
}

export async function setActiveUid(user: {
  uid: string;
  role: UserRole;
  displayName: string;
  email?: string | null;
}): Promise<void> {
  const timestamp = new Date().toISOString();

  const results = await Promise.allSettled([
    set(ref(realtimeDb, `users/${user.uid}`), {
      uid: user.uid,
      role: user.role,
      displayName: user.displayName,
      email: user.email ?? null,
      isActive: true,
      lastAuthAt: timestamp,
    }),
    set(ref(realtimeDb, `presence/${user.uid}`), {
      uid: user.uid,
      isActive: true,
      updatedAt: timestamp,
    }),
    set(ref(realtimeDb, `activeUsers/${user.uid}`), {
      uid: user.uid,
      isActive: true,
      updatedAt: timestamp,
    }),
    set(ref(realtimeDb, "active_uid"), {
      uid: user.uid,
      updatedAt: timestamp,
    }),
  ]);

  if (!hasAnyFulfilled(results)) {
    throw new Error("Unable to write active user to Realtime Database.");
  }

  logRejectedWrites("setActiveUid", results);
}

export async function clearActiveUid(uid?: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const payload: {
    uid: string | null;
    updatedAt: string;
    clearedFor?: string;
  } = {
    uid: null,
    updatedAt: timestamp,
  };

  if (uid) {
    payload.clearedFor = uid;

    const results = await Promise.allSettled([
      set(ref(realtimeDb, `presence/${uid}`), {
        uid,
        isActive: false,
        updatedAt: timestamp,
      }),
      set(ref(realtimeDb, `activeUsers/${uid}`), null),
      update(ref(realtimeDb, `users/${uid}`), {
        isActive: false,
        lastAuthAt: timestamp,
      }),
      set(ref(realtimeDb, "active_uid"), payload),
    ]);

    logRejectedWrites("clearActiveUid", results);

    return;
  }

  await set(ref(realtimeDb, "active_uid"), payload);
}

export function subscribeToPatientLiveData(
  patientUid: string,
  onData: (data: SensorSample | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const liveRef = ref(realtimeDb, `liveData/${patientUid}`);
  const legacyLiveRef = ref(realtimeDb, `LiveData/${patientUid}`);

  let primarySample: SensorSample | null = null;
  let legacySample: SensorSample | null = null;

  const emit = () => {
    onData(primarySample ?? legacySample);
  };

  const unsubPrimary = onValue(
    liveRef,
    (snapshot) => {
      primarySample = normalizeSensorSample(snapshot.val());
      emit();
    },
    (error) => {
      if (onError) onError(error as Error);
    },
  );

  const unsubLegacy = onValue(
    legacyLiveRef,
    (snapshot) => {
      legacySample = normalizeSensorSample(snapshot.val());
      if (!primarySample) {
        emit();
      }
    },
    (error) => {
      if (onError) onError(error as Error);
    },
  );

  return () => {
    unsubPrimary();
    unsubLegacy();
  };
}

export function subscribeToAllPatientsLiveData(
  onData: (data: LiveDataMap) => void,
  onError?: (error: Error) => void,
): () => void {
  const liveRootRef = ref(realtimeDb, "liveData");
  const legacyLiveRootRef = ref(realtimeDb, "LiveData");

  let primaryMap: LiveDataMap = {};
  let legacyMap: LiveDataMap = {};

  const emit = () => {
    onData({ ...legacyMap, ...primaryMap });
  };

  const unsubPrimary = onValue(
    liveRootRef,
    (snapshot) => {
      primaryMap = normalizeLiveDataMap(snapshot.val());
      emit();
    },
    (error) => {
      if (onError) onError(error as Error);
    },
  );

  const unsubLegacy = onValue(
    legacyLiveRootRef,
    (snapshot) => {
      legacyMap = normalizeLiveDataMap(snapshot.val());
      emit();
    },
    (error) => {
      if (onError) onError(error as Error);
    },
  );

  return () => {
    unsubPrimary();
    unsubLegacy();
  };
}

export function subscribeToPatientSessionHistory(
  patientUid: string,
  onData: (data: Record<string, SessionSummary>) => void,
  onError?: (error: Error) => void,
): () => void {
  const historyRef = ref(realtimeDb, `history/${patientUid}/sessions`);
  return onValue(
    historyRef,
    (snapshot) => {
      onData(normalizeSessionHistory(snapshot.val()));
    },
    (error) => {
      if (onError) onError(error as Error);
    },
  );
}

export async function writeLiveSensorData(
  patientUid: string,
  sample: SensorSample,
): Promise<void> {
  await set(ref(realtimeDb, `liveData/${patientUid}`), sample);
}

export async function writePatientSessionSummary(
  patientUid: string,
  dateKey: string,
  summary: SessionSummary,
): Promise<void> {
  await set(
    ref(realtimeDb, `history/${patientUid}/sessions/${dateKey}`),
    summary,
  );
}

/**
 * Writes a prepared aggregate payload under:
 * history/{patientUid}/{bucket}/{periodKey}
 * Example periodKey values:
 * - minute: 2026-03-14T13:25
 * - hour: 2026-03-14T13
 * - day: 2026-03-14
 */
export async function writeHistoryAggregate(
  patientUid: string,
  bucket: HistoryBucket,
  periodKey: string,
  aggregate: SensorAggregate,
): Promise<void> {
  await set(
    ref(realtimeDb, `history/${patientUid}/${bucket}/${periodKey}`),
    aggregate,
  );
}

export async function upsertHistorySummary(
  patientUid: string,
  summary: Partial<Record<HistoryBucket, SensorAggregate>>,
): Promise<void> {
  const payload: Record<string, SensorAggregate> = {};
  if (summary.minute) payload.minute = summary.minute;
  if (summary.hour) payload.hour = summary.hour;
  if (summary.day) payload.day = summary.day;
  await update(ref(realtimeDb, `history/${patientUid}/latest`), payload);
}
