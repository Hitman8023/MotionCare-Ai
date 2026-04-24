import { useMemo } from "react";
import { useDietLog } from "../hooks/useDietLog";
import { useDietMetrics } from "../hooks/useDietMetrics";
import { useDietPlan } from "../hooks/useDietPlan";
import { DIET_MEAL_ORDER, getLocalDateKey, type DietMealType } from "../types/diet";

const labelMap: Record<DietMealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

type PatientDietTrackerProps = {
  patientId: string;
  dateKey?: string;
};

export default function PatientDietTracker({ patientId, dateKey }: PatientDietTrackerProps) {
  const activeDate = dateKey ?? getLocalDateKey();
  const { plan, loading: planLoading } = useDietPlan(patientId);
  const { log, loading: logLoading, saving, updateMeal } = useDietLog(patientId, activeDate);
  const { metrics, syncing, recompute } = useDietMetrics(patientId);

  const completionRate = useMemo(() => {
    if (!log) return 0;
    const done = DIET_MEAL_ORDER.filter((meal) => log.meals[meal].completed).length;
    return Math.round((done / DIET_MEAL_ORDER.length) * 100);
  }, [log]);

  if (planLoading || logLoading) {
    return <p style={{ color: "var(--color-text)", fontSize: "13px" }}>Loading diet tracker...</p>;
  }

  if (!plan) {
    return (
      <p style={{ color: "var(--color-text)", fontSize: "13px" }}>
        No doctor-assigned diet plan yet.
      </p>
    );
  }

  return (
    <section className="card aii-diet-panel">
      <div className="card-header">
        <div className="card-title">Doctor Assigned Diet Tracker</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className="aii-badge">Today completion {completionRate}%</span>
          <span className="aii-badge">Adherence {metrics?.adherenceScore ?? 0}%</span>
        </div>
      </div>

      <div className="aii-diet-summary-grid">
        <div className="aii-diet-kpi">
          <p>Adherence score</p>
          <strong>{metrics?.adherenceScore ?? 0}%</strong>
        </div>
        <div className="aii-diet-kpi">
          <p>Junk / outside count</p>
          <strong>{metrics?.junkCount ?? 0}</strong>
        </div>
        <div className="aii-diet-kpi">
          <p>Weekly consistency</p>
          <strong>{metrics?.weeklyConsistency ?? 0}%</strong>
        </div>
        <div className="aii-diet-kpi">
          <p>Date</p>
          <strong>{activeDate}</strong>
        </div>
      </div>

      <div className="aii-diet-grid">
        {DIET_MEAL_ORDER.map((meal) => {
          const mealLog = log?.meals[meal];
          const items = plan.meals[meal];

          return (
            <article key={meal} className="aii-meal-card">
              <div className="aii-meal-head">
                <h4 className="aii-meal-title">{labelMap[meal]}</h4>
                <span className="aii-meal-progress">
                  {mealLog?.completed ? "Completed" : "Pending"}
                </span>
              </div>

              <ul className="aii-meal-list" style={{ listStyle: "none", paddingLeft: 0 }}>
                {items.length ? (
                  items.map((item) => (
                    <li key={item} className="aii-meal-chip" aria-label={item}>
                      <span className="aii-meal-chip-indicator" aria-hidden="true">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <li style={{ color: "var(--color-text)", fontSize: "12px" }}>No items assigned.</li>
                )}
              </ul>

              <label className="aii-outside-label">
                Outside food / extras
                <textarea
                  className="aii-outside-input"
                  value={mealLog?.extras ?? ""}
                  onChange={(event) => {
                    void updateMeal(meal, { extras: event.target.value });
                  }}
                  placeholder="Log any outside food"
                />
              </label>

              <button
                type="button"
                className={`aii-junk-toggle${mealLog?.completed ? " is-on" : ""}`}
                onClick={() => {
                  void updateMeal(meal, { completed: !mealLog?.completed });
                }}
                aria-pressed={Boolean(mealLog?.completed)}
              >
                <span className="aii-junk-track" aria-hidden="true">
                  <span className="aii-junk-thumb" />
                </span>
                <span className="aii-junk-text">
                  {mealLog?.completed ? "Meal completed" : "Mark meal as completed"}
                </span>
              </button>
            </article>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
        <button
          type="button"
          onClick={() => {
            void recompute();
          }}
          disabled={syncing || saving}
          className="aii-toggle-btn"
        >
          {syncing ? "Updating metrics..." : "Sync Metrics"}
        </button>
      </div>
    </section>
  );
}
