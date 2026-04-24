import { useEffect, useMemo, useState } from "react";
import { upsertDietPlan } from "../services/dietService";
import {
  DIET_MEAL_ORDER,
  createEmptyDietPlanMeals,
  type DietMealType,
  type DietPlanMeals,
} from "../types/diet";

type DoctorDietPlanFormProps = {
  patientId: string;
  doctorId: string;
  initialMeals?: Partial<Record<DietMealType, string[]>>;
  loading?: boolean;
  onSaved?: () => void;
};

const labelMap: Record<DietMealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

function normalizeMealItems(items?: string[]): string[] {
  const cleaned = (items ?? [])
    .map((item) => item.trim())
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : [""];
}

function buildFormState(initialMeals?: Partial<Record<DietMealType, string[]>>): DietPlanMeals {
  return {
    breakfast: normalizeMealItems(initialMeals?.breakfast),
    lunch: normalizeMealItems(initialMeals?.lunch),
    dinner: normalizeMealItems(initialMeals?.dinner),
    snacks: normalizeMealItems(initialMeals?.snacks),
  };
}

function hasChanges(current: DietPlanMeals, baseline: DietPlanMeals): boolean {
  return DIET_MEAL_ORDER.some((meal) => {
    const currentItems = current[meal].map((item) => item.trim()).filter(Boolean);
    const baselineItems = baseline[meal].map((item) => item.trim()).filter(Boolean);
    return JSON.stringify(currentItems) !== JSON.stringify(baselineItems);
  });
}

export default function DoctorDietPlanForm({
  patientId,
  doctorId,
  initialMeals,
  loading: loadingProp = false,
  onSaved,
}: DoctorDietPlanFormProps) {
  const [form, setForm] = useState<DietPlanMeals>(() => buildFormState(initialMeals));
  const [baseline, setBaseline] = useState<DietPlanMeals>(() => buildFormState(initialMeals));
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Record<DietMealType, boolean>>({
    breakfast: false,
    lunch: false,
    dinner: false,
    snacks: false,
  });
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!initialMeals) {
      return;
    }

    const next = buildFormState(initialMeals);
    setForm(next);
    setBaseline(next);
    setMessage("");
    setTouched({
      breakfast: false,
      lunch: false,
      dinner: false,
      snacks: false,
    });
  }, [initialMeals]);

  const parsedMeals = useMemo(() => {
    const base = createEmptyDietPlanMeals();
    for (const meal of DIET_MEAL_ORDER) {
      base[meal] = form[meal].map((item) => item.trim()).filter(Boolean);
    }
    return base;
  }, [form]);

  const invalidMeals = useMemo(() => {
    const result: Record<DietMealType, boolean> = {
      breakfast: false,
      lunch: false,
      dinner: false,
      snacks: false,
    };

    for (const meal of DIET_MEAL_ORDER) {
      const items = form[meal].map((item) => item.trim());
      result[meal] = items.length === 0 || items.some((item) => item.length === 0);
    }

    return result;
  }, [form]);

  const canSave = useMemo(() => {
    if (loadingProp || saving) return false;
    if (!hasChanges(form, baseline)) return false;
    return DIET_MEAL_ORDER.every((meal) => parsedMeals[meal].length > 0);
  }, [baseline, form, loadingProp, parsedMeals, saving]);

  const addItem = (meal: DietMealType) => {
    setForm((prev) => ({
      ...prev,
      [meal]: [...prev[meal], ""],
    }));
  };

  const removeItem = (meal: DietMealType, index: number) => {
    setForm((prev) => {
      const nextItems = prev[meal].filter((_, itemIndex) => itemIndex !== index);
      return {
        ...prev,
        [meal]: nextItems.length > 0 ? nextItems : [""],
      };
    });
  };

  const updateItem = (meal: DietMealType, index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      [meal]: prev[meal].map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  };

  const handleSave = async () => {
    if (!canSave) {
      setMessage("Please fix empty items and add at least one item for each meal.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await upsertDietPlan({
        patientId,
        doctorId,
        meals: parsedMeals,
      });
      setMessage("Diet plan saved successfully.");
      setBaseline(form);
      onSaved?.();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to save diet plan.";
      setMessage(text);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      {loadingProp && (
        <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
          Loading existing diet plan...
        </div>
      )}

      {DIET_MEAL_ORDER.map((meal) => (
        <div key={meal} style={{ display: "grid", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text)" }}>
              {labelMap[meal]}
            </span>
            <button
              type="button"
              onClick={() => addItem(meal)}
              style={{
                border: "1px solid var(--border-light)",
                background: "transparent",
                color: "var(--color-text)",
                borderRadius: "999px",
                padding: "4px 10px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              + Add Item
            </button>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            {form[meal].map((item, index) => {
              const showError = touched[meal] && item.trim().length === 0;

              return (
                <div key={`${meal}-${index}`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    value={item}
                    onChange={(event) => updateItem(meal, index, event.target.value)}
                    onBlur={() =>
                      setTouched((prev) => ({
                        ...prev,
                        [meal]: true,
                      }))
                    }
                    placeholder={`Add ${labelMap[meal].toLowerCase()} item`}
                    aria-invalid={showError}
                    style={{
                      flex: 1,
                      borderRadius: "8px",
                      border: `1px solid ${showError ? "var(--red)" : "var(--border-light)"}`,
                      background: "var(--bg-secondary)",
                      color: "var(--color-text)",
                      padding: "10px",
                      fontSize: "13px",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(meal, index)}
                    aria-label={`Remove ${labelMap[meal]} item ${index + 1}`}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                      background: "transparent",
                      color: "var(--color-text)",
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {invalidMeals[meal] && (
            <div style={{ fontSize: "11px", color: "var(--red)" }}>
              {labelMap[meal]} must contain at least one non-empty item.
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          void handleSave();
        }}
        disabled={!canSave}
        style={{
          width: "fit-content",
          padding: "10px 14px",
          borderRadius: "8px",
          border: "none",
          background: canSave ? "var(--teal)" : "rgba(148,163,184,.35)",
          color: canSave ? "#04131a" : "var(--color-text)",
          fontWeight: 700,
          cursor: canSave ? "pointer" : "not-allowed",
        }}
      >
        {saving ? "Saving plan..." : "Save Diet Plan"}
      </button>

      {message && (
        <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text)" }}>
          {message}
        </p>
      )}
    </div>
  );
}
