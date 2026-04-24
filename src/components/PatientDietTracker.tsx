import { useMemo, useState } from "react";
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
  const [junkInputByMeal, setJunkInputByMeal] = useState<Record<DietMealType, string>>({
    breakfast: "",
    lunch: "",
    dinner: "",
    snacks: "",
  });

  const progress = useMemo(() => {
    if (!log) return 0;
    return DIET_MEAL_ORDER.filter((meal) => log.meals[meal].completed).length;
  }, [log]);

  const completedMeals = typeof progress === "number" ? progress : 0;
  const remainingMeals = DIET_MEAL_ORDER.length - completedMeals;
  const junkMealsCount = useMemo(() => {
    if (!log) return 0;
    return DIET_MEAL_ORDER.filter((meal) => log.meals[meal].extras.length > 0).length;
  }, [log]);

  const completionRate = Math.round((completedMeals / DIET_MEAL_ORDER.length) * 100);

  const toggleMealCompletion = async (meal: DietMealType) => {
    const mealState = log?.meals[meal];
    await updateMeal(meal, { completed: !mealState?.completed });
  };

  const addJunkItem = async (meal: DietMealType) => {
    const value = junkInputByMeal[meal].trim();
    if (!value) return;

    const existing = log?.meals[meal]?.extras ?? [];
    await updateMeal(meal, { extras: [...existing, value] });
    setJunkInputByMeal((prev) => ({
      ...prev,
      [meal]: "",
    }));
  };

  const removeJunkItem = async (meal: DietMealType, index: number) => {
    const existing = log?.meals[meal]?.extras ?? [];
    await updateMeal(meal, {
      extras: existing.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const mealStatus = (meal: DietMealType): "Completed" | "Pending" | "Junk logged" => {
    const mealState = log?.meals[meal];
    if (!mealState) return "Pending";
    if (mealState.extras.length > 0) return "Junk logged";
    return mealState.completed ? "Completed" : "Pending";
  };

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
        <div className="aii-diet-live-summary">
          <span className="aii-badge">Completed {completedMeals}/4</span>
          <span className="aii-badge">Remaining {remainingMeals}</span>
          <span className="aii-badge">Junk meals {junkMealsCount}</span>
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
          const status = mealStatus(meal);
          const isCompleted = Boolean(mealLog?.completed);

          return (
            <article key={meal} className={`aii-meal-card${isCompleted ? " aii-meal-card-completed" : ""}`}>
              <div className="aii-meal-head">
                <h4 className="aii-meal-title">{labelMap[meal]}</h4>
                <span className={`aii-meal-status status-${status.toLowerCase().replace(" ", "-")}`}>
                  {status}
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

              <div className="aii-junk-builder">
                <label className="aii-outside-label">Outside food / junk items</label>
                <div className="aii-junk-input-row">
                  <input
                    className="aii-junk-input"
                    value={junkInputByMeal[meal]}
                    onChange={(event) => {
                      const value = event.target.value;
                      setJunkInputByMeal((prev) => ({
                        ...prev,
                        [meal]: value,
                      }));
                    }}
                    placeholder="E.g. chips, soda"
                  />
                  <button
                    type="button"
                    className="aii-junk-add-btn"
                    onClick={() => {
                      void addJunkItem(meal);
                    }}
                    disabled={!junkInputByMeal[meal].trim()}
                  >
                    + Add junk item
                  </button>
                </div>

                {(mealLog?.extras.length ?? 0) > 0 ? (
                  <div className="aii-junk-items">
                    {mealLog?.extras.map((item, index) => (
                      <span key={`${meal}-${item}-${index}`} className="aii-junk-item-chip">
                        {item}
                        <button
                          type="button"
                          className="aii-junk-remove-btn"
                          onClick={() => {
                            void removeJunkItem(meal, index);
                          }}
                          aria-label={`Remove ${item}`}
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="aii-junk-empty">No junk items logged.</div>
                )}
              </div>

              <button
                type="button"
                className={`aii-junk-toggle${mealLog?.completed ? " is-on" : ""}`}
                onClick={() => {
                  void toggleMealCompletion(meal);
                }}
                aria-pressed={Boolean(mealLog?.completed)}
              >
                <span className="aii-junk-track" aria-hidden="true">
                  <span className="aii-junk-thumb" />
                </span>
                <span className="aii-junk-text">{mealLog?.completed ? "Set as pending" : "Mark as completed"}</span>
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
