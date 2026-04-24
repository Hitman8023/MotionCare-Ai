import EstimationForm from "../EstimationForm";
import DoctorDietPlanForm from "../DoctorDietPlanForm";
import type { DoctorEstimation } from "../../types/estimation";
import type { DietLogDoc } from "../../types/diet";

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

type PatientDetailHeaderProps = {
  patient: PatientData;
};

type PatientInfoCardProps = {
  patient: PatientData;
};

type RecoveryEstimationCardProps = {
  patientId: string;
  doctorId: string;
  estimation: DoctorEstimation | null;
  onRefreshEstimation: () => void;
};

type DietSectionProps = {
  patientId: string;
  doctorId: string;
  planMeals?: Partial<Record<"breakfast" | "lunch" | "dinner" | "snacks", string[]>>;
  loading: boolean;
  metrics: {
    adherenceScore: number;
    junkCount: number;
    weeklyConsistency: number;
  } | null;
  syncing: boolean;
  recentDietLogs: DietLogDoc[];
  onRecomputeMetrics: () => void;
};

export function PatientDetailHeader({ patient }: PatientDetailHeaderProps) {
  const summaryItems = [
    { label: "Incident", value: patient.incidentType || patient.surgery || "Not specified" },
    { label: "Stage", value: patient.stage || "Active" },
    { label: "Condition", value: patient.condition || "Recovery plan pending" },
    { label: "Age", value: patient.age ? `${patient.age}` : "—" },
  ];

  return (
    <section className="card doctor-detail-header-card">
      <div className="doctor-detail-header-top">
        <div>
          <div className="doctor-detail-header-kicker">Doctor Patient Overview</div>
          <h1 className="doctor-detail-header-title">{patient.displayName || "Patient"}</h1>
          <p className="doctor-detail-header-copy">
            Structured snapshot for recovery planning, diet assignment, and compliance tracking.
          </p>
        </div>
        <div className="doctor-detail-header-badges">
          <span className="doctor-detail-pill">UID: {patient.uid}</span>
          <span className="doctor-detail-pill">Recovery dashboard</span>
        </div>
      </div>

      <div className="doctor-detail-summary-grid">
        {summaryItems.map((item) => (
          <div key={item.label} className="doctor-detail-summary-card">
            <div className="doctor-detail-summary-label">{item.label}</div>
            <div className="doctor-detail-summary-value">{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PatientInfoCard({ patient }: PatientInfoCardProps) {
  return (
    <section className="card doctor-panel-card">
      <div className="card-header">
        <div className="card-title">Patient Information</div>
      </div>

      <div className="doctor-info-stack">
        <div className="doctor-info-block">
          <div className="doctor-info-heading">Basic Information</div>
          <div className="doctor-info-grid">
            <div>
              <div className="doctor-info-label">Age</div>
              <div className="doctor-info-value">{patient.age || "—"}</div>
            </div>
            <div>
              <div className="doctor-info-label">Gender</div>
              <div className="doctor-info-value">{patient.gender || "—"}</div>
            </div>
            <div className="doctor-info-span">
              <div className="doctor-info-label">Phone</div>
              <div className="doctor-info-value">{patient.phone || "—"}</div>
            </div>
          </div>
        </div>

        <div className="doctor-info-block">
          <div className="doctor-info-heading">Medical History</div>
          <div className="doctor-info-list">
            <div>
              <div className="doctor-info-label">Incident Type</div>
              <div className="doctor-info-value">{patient.incidentType || "—"}</div>
            </div>
            <div>
              <div className="doctor-info-label">Condition</div>
              <div className="doctor-info-value">{patient.condition || "—"}</div>
            </div>
            <div>
              <div className="doctor-info-label">Current Stage</div>
              <div className="doctor-info-value">{patient.stage || "—"}</div>
            </div>
            <div>
              <div className="doctor-info-label">Medications</div>
              <div className="doctor-info-copy">{patient.medications || "—"}</div>
            </div>
            <div>
              <div className="doctor-info-label">Allergies</div>
              <div className="doctor-info-copy">{patient.allergies || "—"}</div>
            </div>
          </div>
        </div>

        <div className="doctor-info-block">
          <div className="doctor-info-heading">Incident Details</div>
          <div className="doctor-info-copy doctor-info-copy-prominent">
            {patient.incidentDescription || "No description provided"}
          </div>
        </div>
      </div>
    </section>
  );
}

export function RecoveryEstimationCard({
  patientId,
  doctorId,
  estimation,
  onRefreshEstimation,
}: RecoveryEstimationCardProps) {
  return (
    <section className="card doctor-panel-card doctor-estimation-card">
      <div className="card-header">
        <div className="card-title">Recovery Estimation</div>
      </div>

      {estimation ? (
        <div className="doctor-estimation-summary">
          <div className="doctor-estimation-grid">
            <div className="doctor-estimation-metric">
              <div className="doctor-info-label">Range</div>
              <div className="doctor-estimation-value">
                Week {estimation.minWeeks}–{estimation.maxWeeks}
              </div>
            </div>
            <div className="doctor-estimation-metric">
              <div className="doctor-info-label">Confidence</div>
              <div className="doctor-estimation-value">{estimation.confidence}%</div>
            </div>
          </div>
          {estimation.notes && <div className="doctor-info-copy">{estimation.notes}</div>}
        </div>
      ) : (
        <div className="doctor-empty-state">No recovery estimate available yet.</div>
      )}

      <div className="doctor-estimation-form-wrap">
        <EstimationForm
          patientId={patientId}
          doctorId={doctorId}
          onSaved={onRefreshEstimation}
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
    </section>
  );
}

export function DietSection({
  patientId,
  doctorId,
  planMeals,
  loading,
  metrics,
  syncing,
  recentDietLogs,
  onRecomputeMetrics,
}: DietSectionProps) {
  return (
    <section className="card doctor-diet-section-card">
      <div className="doctor-diet-section-top">
        <div>
          <div className="doctor-diet-kicker">Primary Focus</div>
          <div className="card-title doctor-diet-title">Diet Plan</div>
          <div className="doctor-diet-copy">
            Doctor-assigned meal plan with live compliance tracking from patient actions.
          </div>
        </div>
        <div className="doctor-diet-metrics-strip">
          <div className="doctor-diet-mini-metric">
            <span>Adherence</span>
            <strong>{metrics?.adherenceScore ?? 0}%</strong>
          </div>
          <div className="doctor-diet-mini-metric">
            <span>Junk</span>
            <strong>{metrics?.junkCount ?? 0}</strong>
          </div>
          <div className="doctor-diet-mini-metric">
            <span>Consistency</span>
            <strong>{metrics?.weeklyConsistency ?? 0}%</strong>
          </div>
        </div>
      </div>

      <DoctorDietPlanForm
        patientId={patientId}
        doctorId={doctorId}
        initialMeals={planMeals}
        loading={loading}
        onSaved={onRecomputeMetrics}
      />

      <div className="doctor-diet-log-panel">
        <div className="doctor-diet-log-title">Recent Daily Logs</div>
        {recentDietLogs.length ? (
          recentDietLogs.map((entry) => {
            const completedMeals = Object.values(entry.meals).filter((meal) => meal.completed).length;
            const extrasCount = Object.values(entry.meals).filter((meal) => meal.extras.trim().length > 0).length;

            return (
              <div key={entry.date} className="doctor-diet-log-row">
                <span>{entry.date}</span>
                <span>{completedMeals}/4 completed · {extrasCount} extras</span>
              </div>
            );
          })
        ) : (
          <div className="doctor-empty-state">No patient diet logs yet.</div>
        )}
      </div>

      <button
        type="button"
        onClick={onRecomputeMetrics}
        disabled={syncing}
        className="doctor-diet-refresh-btn"
      >
        {syncing ? "Refreshing compliance..." : "Refresh Compliance Metrics"}
      </button>
    </section>
  );
}
