import { useEffect, useState } from "react";
import { subscribeRecentDietLogs } from "../services/dietService";
import type { DietLogDoc } from "../types/diet";

export function useDietLogs(patientId?: string, maxDays = 7) {
  const [logs, setLogs] = useState<DietLogDoc[]>([]);
  const [loading, setLoading] = useState(Boolean(patientId));

  useEffect(() => {
    if (!patientId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeRecentDietLogs(patientId, (next) => {
      setLogs(next);
      setLoading(false);
    }, maxDays);

    return unsubscribe;
  }, [patientId, maxDays]);

  return {
    logs,
    loading,
  };
}