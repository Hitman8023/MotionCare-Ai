import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  DIET_MEAL_ORDER,
  createEmptyDietLog,
  createEmptyDietPlanMeals,
  type DietLogDoc,
  type DietMealType,
  type DietMetricsDoc,
  type DietPlanDoc,
  type DietPlanMeals,
} from "../types/diet";

const FASTAPI_BASE_URL =
  (import.meta.env.VITE_LLM_API_BASE_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "");

type MetricsResponse = {
  adherenceScore: number;
  junkCount: number;
  weeklyConsistency: number;
};

export function computeDietMetricsFromLogs(
  patientId: string,
  logs: DietLogDoc[],
): DietMetricsDoc {
  const completedMeals = logs.reduce((sum, log) => {
    return (
      sum +
      DIET_MEAL_ORDER.filter((meal) => Boolean(log.meals[meal]?.completed)).length
    );
  }, 0);

  const junkCount = logs.reduce((sum, log) => {
    return (
      sum +
      DIET_MEAL_ORDER.filter((meal) => (log.meals[meal]?.extras.length ?? 0) > 0).length
    );
  }, 0);

  const totalMeals = logs.length * DIET_MEAL_ORDER.length;
  const adherenceScore = totalMeals > 0 ? (completedMeals / totalMeals) * 100 : 0;

  return {
    patientId,
    adherenceScore: Math.max(0, Math.min(100, Math.round(adherenceScore)) ),
    junkCount: Math.max(0, Math.round(junkCount)),
    weeklyConsistency: Math.max(0, Math.min(100, Math.round(adherenceScore)) ),
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeMeals(input: Partial<DietPlanMeals> | undefined): DietPlanMeals {
  const base = createEmptyDietPlanMeals();
  if (!input) return base;

  for (const meal of DIET_MEAL_ORDER) {
    const items = input[meal];
    base[meal] = Array.isArray(items)
      ? items
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  }

  return base;
}

function normalizePlan(patientId: string, raw: unknown): DietPlanDoc {
  const data = (raw || {}) as Partial<DietPlanDoc>;
  return {
    patientId,
    assignedBy: typeof data.assignedBy === "string" ? data.assignedBy : "",
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    meals: sanitizeMeals(data.meals),
  };
}

function normalizeLog(patientId: string, date: string, raw: unknown): DietLogDoc {
  const data = (raw || {}) as Partial<DietLogDoc>;
  const base = createEmptyDietLog(patientId, date);

  if (!data.meals || typeof data.meals !== "object") return base;

  for (const meal of DIET_MEAL_ORDER) {
    const rawMeal = (data.meals as Record<DietMealType, unknown>)[meal];
    if (!rawMeal || typeof rawMeal !== "object") continue;

    const mealData = rawMeal as { completed?: unknown; extras?: unknown };
    const extrasRaw = mealData.extras;
    const extras = Array.isArray(extrasRaw)
      ? extrasRaw
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : typeof extrasRaw === "string"
        ? extrasRaw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    base.meals[meal] = {
      completed: Boolean(mealData.completed),
      extras,
    };
  }

  if (typeof data.updatedAt === "string") {
    base.updatedAt = data.updatedAt;
  }

  return base;
}

function normalizeMetrics(patientId: string, raw: unknown): DietMetricsDoc {
  const data = (raw || {}) as Partial<DietMetricsDoc>;

  const toNumber = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const next = Number(value);
      if (Number.isFinite(next)) return next;
    }
    return 0;
  };

  return {
    patientId,
    adherenceScore: Math.max(0, Math.min(100, Math.round(toNumber(data.adherenceScore)))),
    junkCount: Math.max(0, Math.round(toNumber(data.junkCount))),
    weeklyConsistency: Math.max(0, Math.min(100, Math.round(toNumber(data.weeklyConsistency)))),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
  };
}

export async function upsertDietPlan(input: {
  patientId: string;
  doctorId: string;
  meals: Partial<DietPlanMeals>;
}): Promise<void> {
  const now = new Date().toISOString();
  const nextDoc: DietPlanDoc = {
    patientId: input.patientId,
    assignedBy: input.doctorId,
    createdAt: now,
    updatedAt: now,
    meals: sanitizeMeals(input.meals),
  };

  const existing = await getDoc(doc(db, "dietPlans", input.patientId));
  if (existing.exists()) {
    const existingData = existing.data() as Partial<DietPlanDoc>;
    if (typeof existingData.createdAt === "string" && existingData.createdAt.length > 0) {
      nextDoc.createdAt = existingData.createdAt;
    }
  }

  await setDoc(doc(db, "dietPlans", input.patientId), nextDoc, { merge: true });
}

export function subscribeDietPlan(
  patientId: string,
  onData: (plan: DietPlanDoc | null) => void,
): () => void {
  return onSnapshot(doc(db, "dietPlans", patientId), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    onData(normalizePlan(patientId, snap.data()));
  });
}

export function subscribeDietLog(
  patientId: string,
  date: string,
  onData: (log: DietLogDoc) => void,
): () => void {
  return onSnapshot(doc(db, "dietLogs", patientId, "days", date), (snap) => {
    if (!snap.exists()) {
      onData(createEmptyDietLog(patientId, date));
      return;
    }
    onData(normalizeLog(patientId, date, snap.data()));
  });
}

export async function saveDietLog(input: {
  patientId: string;
  date: string;
  meals: DietLogDoc["meals"];
}): Promise<void> {
  const now = new Date().toISOString();
  const meals = DIET_MEAL_ORDER.reduce((acc, meal) => {
    acc[meal] = {
      completed: Boolean(input.meals[meal]?.completed),
      extras: (input.meals[meal]?.extras ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
    };
    return acc;
  }, {} as DietLogDoc["meals"]);

  await setDoc(
    doc(db, "dietLogs", input.patientId, "days", input.date),
    {
      patientId: input.patientId,
      date: input.date,
      meals,
      updatedAt: now,
    },
    { merge: true },
  );
}

export function subscribeDietMetrics(
  patientId: string,
  onData: (metrics: DietMetricsDoc | null) => void,
): () => void {
  return onSnapshot(doc(db, "dietMetrics", patientId), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    onData(normalizeMetrics(patientId, snap.data()));
  });
}

export async function fetchRecentDietLogs(patientId: string, maxDays = 7): Promise<DietLogDoc[]> {
  const q = query(
    collection(db, "dietLogs", patientId, "days"),
    orderBy("date", "desc"),
    limit(maxDays),
  );

  const snap = await getDocs(q);
  return snap.docs.map((entry) => normalizeLog(patientId, entry.id, entry.data()));
}

export function subscribeRecentDietLogs(
  patientId: string,
  onData: (logs: DietLogDoc[]) => void,
  maxDays = 7,
): () => void {
  const q = query(
    collection(db, "dietLogs", patientId, "days"),
    orderBy("date", "desc"),
    limit(maxDays),
  );

  return onSnapshot(q, (snapshot) => {
    onData(snapshot.docs.map((entry) => normalizeLog(patientId, entry.id, entry.data())));
  });
}

async function computeDietMetricsOnBackend(logs: DietLogDoc[]): Promise<MetricsResponse> {
  const response = await fetch(`${FASTAPI_BASE_URL}/api/diet/metrics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ logs }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Diet metrics compute failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as Partial<MetricsResponse>;

  return {
    adherenceScore: Number.isFinite(data.adherenceScore) ? Number(data.adherenceScore) : 0,
    junkCount: Number.isFinite(data.junkCount) ? Number(data.junkCount) : 0,
    weeklyConsistency: Number.isFinite(data.weeklyConsistency) ? Number(data.weeklyConsistency) : 0,
  };
}

export async function recomputeAndStoreDietMetrics(patientId: string): Promise<DietMetricsDoc> {
  const logs = await fetchRecentDietLogs(patientId, 7);
  const metrics = computeDietMetricsFromLogs(patientId, logs);

  await setDoc(doc(db, "dietMetrics", patientId), metrics, { merge: true });
  return metrics;
}
