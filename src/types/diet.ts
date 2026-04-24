export type DietMealType = "breakfast" | "lunch" | "dinner" | "snacks";

export const DIET_MEAL_ORDER: DietMealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snacks",
];

export type DietPlanMeals = Record<DietMealType, string[]>;

export type DietPlanDoc = {
  patientId: string;
  assignedBy: string;
  createdAt: string;
  updatedAt?: string;
  meals: DietPlanMeals;
};

export type DietMealLog = {
  completed: boolean;
  extras: string;
};

export type DietLogDoc = {
  patientId: string;
  date: string;
  meals: Record<DietMealType, DietMealLog>;
  updatedAt: string;
};

export type DietMetricsDoc = {
  patientId: string;
  adherenceScore: number;
  junkCount: number;
  weeklyConsistency: number;
  updatedAt: string;
};

export function createEmptyDietPlanMeals(): DietPlanMeals {
  return {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
  };
}

export function createEmptyDietLog(patientId: string, date: string): DietLogDoc {
  return {
    patientId,
    date,
    updatedAt: new Date().toISOString(),
    meals: {
      breakfast: { completed: false, extras: "" },
      lunch: { completed: false, extras: "" },
      dinner: { completed: false, extras: "" },
      snacks: { completed: false, extras: "" },
    },
  };
}

export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
