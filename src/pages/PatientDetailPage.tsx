import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import Loader from "../components/Loader";
import { getDoctorEstimation } from "../services/estimationService";
import { useDietLogs } from "../hooks/useDietLogs";
import { useDietMetrics } from "../hooks/useDietMetrics";
import { useDietPlan } from "../hooks/useDietPlan";
import type { DoctorEstimation } from "../types/estimation";
import {
  DietSection,
  PatientDetailHeader,
  PatientInfoCard,
  RecoveryEstimationCard,
} from "../components/doctor/PatientDetailSections";

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
  const { plan, loading: planLoading } = useDietPlan(patientId);
  const { metrics, recompute, syncing } = useDietMetrics(patientId);
  const { logs: recentDietLogs } = useDietLogs(patientId, 7);

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
    <div className="doctor-detail-page">
      <button
        onClick={() => navigate("/patients")}
        className="doctor-back-button"
      >
        ← Back to Patients
      </button>

      <PatientDetailHeader patient={patient} />

      <div className="doctor-detail-grid">
        <div className="doctor-detail-left-column">
          <PatientInfoCard patient={patient} />

          <RecoveryEstimationCard
            patientId={patientId!}
            doctorId={doctorId}
            estimation={estimation}
            onRefreshEstimation={() => {
              getDoctorEstimation(patientId!, doctorId).then((est) => {
                if (est) setEstimation(est);
              });
            }}
          />
        </div>

        <div className="doctor-detail-right-column">
          <DietSection
            patientId={patientId!}
            doctorId={doctorId}
            planMeals={plan?.meals}
            loading={planLoading}
            metrics={metrics}
            syncing={syncing}
            recentDietLogs={recentDietLogs}
            onRecomputeMetrics={() => {
              void recompute();
            }}
          />
        </div>
      </div>
    </div>
  );
}
