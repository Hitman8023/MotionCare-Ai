import { useEffect, useState } from "react";
import {
  computeDietMetricsFromLogs,
  fetchRecentDietLogs,
  subscribeRecentDietLogs,
} from "../services/dietService";
import type { DietMetricsDoc } from "../types/diet";

export function useDietMetrics(patientId?: string) {
  const [metrics, setMetrics] = useState<DietMetricsDoc | null>(null);
  const [loading, setLoading] = useState(Boolean(patientId));
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!patientId) {
      setMetrics(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeRecentDietLogs(patientId, (logs) => {
      setMetrics(computeDietMetricsFromLogs(patientId, logs));
      setLoading(false);
    });

    return unsubscribe;
  }, [patientId]);

  const recompute = async () => {
    if (!patientId) return;
    setSyncing(true);
    try {
      const logs = await fetchRecentDietLogs(patientId, 7);
      setMetrics(computeDietMetricsFromLogs(patientId, logs));
    } finally {
      setSyncing(false);
    }
  };

  return {
    metrics,
    loading,
    syncing,
    recompute,
  };
}
