import { useEffect, useMemo, useState } from "react";
import { computeDietMetricsFromLogs, subscribeRecentDietLogs } from "../services/dietService";
import type { DietMetricsDoc } from "../types/diet";

export function useDietMetricsByPatients(patientIds: string[], maxDays = 7) {
  const [metricsByPatient, setMetricsByPatient] = useState<Record<string, DietMetricsDoc>>({});
  const [loading, setLoading] = useState(Boolean(patientIds.length));

  const patientKey = useMemo(() => patientIds.join("|"), [patientIds]);

  useEffect(() => {
    if (!patientIds.length) {
      setMetricsByPatient({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setMetricsByPatient({});
    let remainingInitialSnapshots = patientIds.length;

    const unsubscribers = patientIds.map((patientId) =>
      subscribeRecentDietLogs(
        patientId,
        (logs) => {
          const nextMetrics = computeDietMetricsFromLogs(patientId, logs);
          setMetricsByPatient((current) => ({
            ...current,
            [patientId]: nextMetrics,
          }));

          remainingInitialSnapshots = Math.max(0, remainingInitialSnapshots - 1);
          if (remainingInitialSnapshots === 0) {
            setLoading(false);
          }
        },
        maxDays,
      ),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [patientKey, maxDays]);

  return {
    metricsByPatient,
    loading,
  };
}