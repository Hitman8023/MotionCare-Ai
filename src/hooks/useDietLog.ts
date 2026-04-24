import { useEffect, useState } from "react";
import { saveDietLog, subscribeDietLog } from "../services/dietService";
import { createEmptyDietLog, type DietLogDoc, type DietMealType } from "../types/diet";

export function useDietLog(patientId?: string, date?: string) {
  const [log, setLog] = useState<DietLogDoc | null>(null);
  const [loading, setLoading] = useState(Boolean(patientId && date));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!patientId || !date) {
      setLog(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeDietLog(patientId, date, (next) => {
      setLog(next);
      setLoading(false);
    });

    return unsubscribe;
  }, [patientId, date]);

  const updateMeal = async (
    mealType: DietMealType,
    patch: Partial<DietLogDoc["meals"][DietMealType]>,
  ) => {
    if (!patientId || !date) return;

    const base = log ?? createEmptyDietLog(patientId, date);
    const next: DietLogDoc = {
      ...base,
      meals: {
        ...base.meals,
        [mealType]: {
          ...base.meals[mealType],
          ...patch,
        },
      },
      updatedAt: new Date().toISOString(),
    };

    setLog(next);
    setSaving(true);
    try {
      await saveDietLog({
        patientId,
        date,
        meals: next.meals,
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    log,
    loading,
    saving,
    updateMeal,
  };
}
