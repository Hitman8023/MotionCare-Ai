import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import EstimationForm from "../components/EstimationForm";
import Loader from "../components/Loader";
import { getDoctorEstimation } from "../services/estimationService";
import type { DoctorEstimation } from "../types/estimation";

type PatientData = {
  uid: string;
  displayName?: string;
  age?: number;
  gender?: string;
  phone?: string;
  surgery?: string;
  condition?: string;
  stage?: string;
  medications?: string;
  allergies?: string;
  previousIncidents?: boolean;
  incidentType?: string;
  incidentDescription?: string;
};

export default function PatientDetailPage({ doctorId }: { doctorId: string }) {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [estimation, setEstimation] = useState<DoctorEstimation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!patientId) {
        setError("Patient ID not found");
        setLoading(false);
        return;
      }

      try {
        console.log("🔍 Doctor analyzing patient:");
        console.log("  PatientId:", patientId);
        console.log("  DoctorId:", doctorId);

        let patientData = null;

        // Try approach 1: Fetch using document ID (patientId as doc ID)
        const patientRef = doc(db, "patients", patientId);
        const patientSnap = await getDoc(patientRef);

        if (patientSnap.exists()) {
          patientData = patientSnap.data();
          console.log("✅ Patient found via document ID");
        } else {
          // Try approach 2: Query by uid field AND assigned doctor
          console.warn(`⚠️ Document not found at db.patients[${patientId}], querying by uid field...`);
          const q = query(
            collection(db, "patients"),
            where("uid", "==", patientId)
          );
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            const foundPatient = snapshot.docs[0].data();
            console.log("✅ Patient found via uid query");
            // Verify the doctor is assigned to this patient
            if (foundPatient.assignedDoctorId === doctorId || !foundPatient.assignedDoctorId) {
              patientData = foundPatient;
            } else {
              console.error("❌ Doctor mismatch - assignedDoctorId:", foundPatient.assignedDoctorId, "vs doctorId:", doctorId);
              setError("You are not assigned to this patient");
              setLoading(false);
              return;
            }
          } else {
            console.log("❌ Patient query by uid also failed for ID:", patientId);
            setError("Patient document not found");
            setLoading(false);
            return;
          }
        }

        if (patientData) {
          console.log("📋 Patient data:", patientData);
          
          // Map the nested structure to flat
          const mappedPatient: PatientData = {
            uid: patientId,
            displayName: patientData.basicInfo?.name || patientData.displayName,
            age: patientData.basicInfo?.age || patientData.age,
            gender: patientData.basicInfo?.gender || patientData.gender,
            phone: patientData.basicInfo?.phone || patientData.phone,
            surgery: patientData.surgery || patientData.incident?.type,
            condition: patientData.condition || patientData.medical?.conditions,
            stage: patientData.stage,
            medications: patientData.medical?.medications,
            allergies: patientData.medical?.allergies,
            previousIncidents: patientData.medical?.previousIncidents,
            incidentType: patientData.incident?.type,
            incidentDescription: patientData.incident?.description,
          };
          
          setPatient(mappedPatient);
        }

        // Fetch doctor's estimation if it exists
        const est = await getDoctorEstimation(patientId, doctorId);
        if (est) {
          setEstimation(est);
        }
      } catch (error) {
        console.error("Error fetching patient data:", error);
        setError(error instanceof Error ? error.message : "Error loading patient data");
      } finally {
        setLoading(false);
      }
    };

    fetchPatientData();
  }, [patientId, doctorId]);

  if (loading) {
    return (
      <div style={{ padding: "20px", display: "grid", gap: "10px" }}>
        <Loader />
        <p>Loading patient details...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div style={{ padding: "20px" }}>
        <p style={{ color: "var(--red)", marginBottom: "12px" }}>
          ⚠️ {error || "Patient not found"}
        </p>
        <p style={{ fontSize: "12px", color: "var(--color-text)", marginBottom: "16px" }}>
          Debug info: Patient ID = {patientId}
        </p>
        <button 
          onClick={() => navigate("/patients")}
          style={{
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--teal)",
            color: "var(--color-text)",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          ← Back to Patients
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <button
          onClick={() => navigate("/patients")}
          style={{
            background: "none",
            border: "none",
            color: "var(--teal)",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "8px",
          }}
        >
          ← Back to Patients
        </button>
        <div className="page-title">{patient.displayName || "Patient"}</div>
        <div className="page-subtitle">View patient profile and provide recovery estimation</div>
      </div>

      {/* Main Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
        {/* Left: Patient Information */}
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Patient Information</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Basic Info */}
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(148,163,184,.05)" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", marginBottom: "8px" }}>
                  Basic Information
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Age</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
                      {patient.age || "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Gender</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
                      {patient.gender || "—"}
                    </div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Phone</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
                      {patient.phone || "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Medical History */}
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(148,163,184,.05)" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", marginBottom: "8px" }}>
                  Medical History
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Incident Type</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
                      {patient.incidentType || "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Condition</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
                      {patient.condition || "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Current Stage</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
                      {patient.stage || "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Medications</div>
                    <div style={{ fontSize: "13px", color: "var(--color-text)", lineHeight: 1.5 }}>
                      {patient.medications || "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Allergies</div>
                    <div style={{ fontSize: "13px", color: "var(--color-text)", lineHeight: 1.5 }}>
                      {patient.allergies || "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Incident Description */}
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(148,163,184,.05)" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", marginBottom: "8px" }}>
                  Incident Details
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text)", lineHeight: 1.6 }}>
                  {patient.incidentDescription || "No description provided"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Recovery Estimation Form */}
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recovery Time Estimation</div>
            </div>

            {estimation && (
              <div style={{
                padding: "12px",
                borderRadius: "8px",
                background: "rgba(34, 211, 238, 0.06)",
                border: "1px solid rgba(34, 211, 238, 0.15)",
                marginBottom: "16px",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", marginBottom: "8px" }}>
                  Current Estimation
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Range</div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text)" }}>
                      Week {estimation.minWeeks}–{estimation.maxWeeks}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)" }}>Confidence</div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text)" }}>
                      {estimation.confidence}%
                    </div>
                  </div>
                </div>
                {estimation.notes && (
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--color-text)", marginBottom: "4px" }}>Notes</div>
                    <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                      {estimation.notes}
                    </div>
                  </div>
                )}
              </div>
            )}

            <EstimationForm
              patientId={patientId!}
              doctorId={doctorId}
              onSaved={() => {
                // Refresh estimation
                getDoctorEstimation(patientId!, doctorId).then((est) => {
                  if (est) setEstimation(est);
                });
              }}
              initialData={
                estimation
                  ? {
                      minWeeks: estimation.minWeeks,
                      maxWeeks: estimation.maxWeeks,
                      confidence: estimation.confidence,
                      notes: estimation.notes || "",
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
