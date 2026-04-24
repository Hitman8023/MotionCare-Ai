import { useEffect, useState } from "react";
import type { DietPlanDoc } from "../types/diet";
import { subscribeDietPlan } from "../services/dietService";

export function useDietPlan(patientId?: string) {
  const [plan, setPlan] = useState<DietPlanDoc | null>(null);
  const [loading, setLoading] = useState(Boolean(patientId));

  useEffect(() => {
    if (!patientId) {
      setPlan(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeDietPlan(patientId, (next) => {
      setPlan(next);
      setLoading(false);
    });

    return unsubscribe;
  }, [patientId]);

  return {
    plan,
    loading,
  };
}
