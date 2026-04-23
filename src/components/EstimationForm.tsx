import { useState } from "react";
import { saveDoctorEstimation } from "../services/estimationService";
import type { EstimationFormData } from "../types/estimation";

type EstimationFormProps = {
  patientId: string;
  doctorId: string;
  onSaved?: () => void;
  initialData?: EstimationFormData;
};

export default function EstimationForm({
  patientId,
  doctorId,
  onSaved,
  initialData,
}: EstimationFormProps) {
  const [minWeeks, setMinWeeks] = useState(initialData?.minWeeks || 4);
  const [maxWeeks, setMaxWeeks] = useState(initialData?.maxWeeks || 8);
  const [confidence, setConfidence] = useState(initialData?.confidence || 75);
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    if (minWeeks <= 0 || maxWeeks <= 0 || minWeeks > maxWeeks) {
      alert("Please enter valid week values (min ≤ max)");
      return;
    }
    if (confidence < 0 || confidence > 100) {
      alert("Confidence must be between 0 and 100");
      return;
    }

    setLoading(true);
    try {
      console.log("Saving estimation for patientId:", patientId, "doctorId:", doctorId);
      console.log("Estimation data:", { minWeeks, maxWeeks, confidence, notes });
      
      await saveDoctorEstimation(patientId, doctorId, {
        minWeeks,
        maxWeeks,
        confidence,
        notes,
      });
      
      console.log("Estimation saved successfully!");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSaved?.();
    } catch (error) {
      console.error("Error saving estimation:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      alert("Failed to save estimation: " + errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {/* Min Weeks */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>
            Min Recovery Weeks
          </label>
          <input
            type="number"
            min="1"
            max="52"
            step="1"
            value={minWeeks}
            onChange={(e) => setMinWeeks(Number(e.target.value))}
            style={{
              width: "100%",
              padding: "10px",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              background: "var(--card-bg)",
              color: "var(--color-text)",
              fontSize: "14px",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Max Weeks */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>
            Max Recovery Weeks
          </label>
          <input
            type="number"
            min="1"
            max="52"
            step="1"
            value={maxWeeks}
            onChange={(e) => setMaxWeeks(Number(e.target.value))}
            style={{
              width: "100%",
              padding: "10px",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              background: "var(--card-bg)",
              color: "var(--color-text)",
              fontSize: "14px",
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      {/* Confidence */}
      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>
          Confidence Level: {confidence}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          style={{
            width: "100%",
            height: "6px",
            borderRadius: "3px",
            background: "var(--border-color)",
            outline: "none",
            opacity: "0.7",
            cursor: "pointer",
          }}
        />
        <div style={{ fontSize: "11px", color: "var(--color-text)", marginTop: "4px" }}>
          How confident are you with this estimation?
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>
          Clinical Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any clinical notes or observations about the patient's recovery..."
          style={{
            width: "100%",
            padding: "10px",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-sm)",
            background: "var(--card-bg)",
            color: "var(--color-text)",
            fontSize: "14px",
            fontFamily: "inherit",
            minHeight: "80px",
            resize: "vertical",
          }}
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "10px 16px",
          borderRadius: "var(--radius-sm)",
          background: loading ? "var(--border-color)" : "var(--teal)",
          color: "var(--color-text)",
          border: "none",
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: "13px",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Saving..." : "Save Estimation"}
      </button>

      {saved && (
        <div style={{
          padding: "12px",
          borderRadius: "var(--radius-sm)",
          background: "rgba(52, 211, 153, 0.06)",
          border: "1px solid rgba(52, 211, 153, 0.15)",
          color: "var(--color-text)",
          fontSize: "13px",
          fontWeight: 600,
        }}>
          ✓ Estimation saved successfully
        </div>
      )}
    </form>
  );
}
