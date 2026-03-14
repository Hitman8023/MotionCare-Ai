import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import DoctorLiveBoard from "../components/DoctorLiveBoard";
import { subscribeToAllPatientsLiveData } from "../services/realtimeDbService";
import { db } from "../firebase";
import type { LiveDataMap } from "../types/sensor";
import { computeAccuracy, detectAlertCount } from "../services/recoveryMetrics";

type PatientProfile = {
  uid: string;
  displayName?: string;
  age?: number;
  condition?: string;
  nextSession?: string;
};

type CaseloadRow = {
  uid: string;
  name: string;
  age?: number;
  condition: string;
  adherence: number | null;
  risk: "Low" | "Moderate" | "High" | "Unknown";
  nextSession: string;
  sessionStatus: "upcoming" | "completed" | "missed" | "unscheduled";
};

export default function DoctorDashboard() {
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [liveData, setLiveData] = useState<LiveDataMap>({});

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "patients"), (snapshot) => {
      const nextPatients = snapshot.docs
        .map((docItem) => docItem.data() as PatientProfile)
        .filter((item) => Boolean(item.uid));
      setPatients(nextPatients);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAllPatientsLiveData((incoming) => {
      setLiveData(incoming);
    });
    return unsubscribe;
  }, []);

  const parseScheduledDate = (raw?: string) => {
    if (!raw) return null;
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct;
    const match = raw.match(
      /(today|tomorrow)\s*·\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i,
    );
    if (!match) return null;
    const base = new Date();
    if (match[1].toLowerCase() === "tomorrow") {
      base.setDate(base.getDate() + 1);
    }
    let hour = Number(match[2]);
    const minutes = Number(match[3]);
    const period = match[4].toUpperCase();
    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    base.setHours(hour, minutes, 0, 0);
    return base;
  };

  const formatNextSession = (
    scheduledAt?: Date | null,
    status?: CaseloadRow["sessionStatus"],
  ) => {
    if (!scheduledAt) return "Not scheduled";
    const today = new Date();
    const sameDay = scheduledAt.toDateString() === today.toDateString();
    const label = sameDay
      ? "Today"
      : scheduledAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
    const time = scheduledAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (status === "missed") return `Missed · ${time}`;
    if (status === "completed") return `Completed · ${time}`;
    return `${label} · ${time}`;
  };

  const caseload = useMemo<CaseloadRow[]>(() => {
    return patients.map((patient) => {
      const sample = liveData[patient.uid];
      const adherence = sample ? computeAccuracy(sample) : null;
      const alertCount = sample ? detectAlertCount(sample) : 0;
      const scheduledAt = parseScheduledDate(patient.nextSession);
      const now = new Date();
      const lastAttendance = sample?.timestamp
        ? new Date(sample.timestamp)
        : null;
      const attendedAfterSchedule =
        scheduledAt && lastAttendance && lastAttendance >= scheduledAt;
      const missedSession = Boolean(
        scheduledAt && scheduledAt < now && !attendedAfterSchedule,
      );
      const sessionStatus: CaseloadRow["sessionStatus"] = !scheduledAt
        ? "unscheduled"
        : missedSession
          ? "missed"
          : attendedAfterSchedule
            ? "completed"
            : "upcoming";
      const risk: CaseloadRow["risk"] =
        sample == null
          ? "Unknown"
          : missedSession || alertCount >= 2
            ? "High"
            : alertCount === 1
              ? "Moderate"
              : "Low";
      return {
        uid: patient.uid,
        name: patient.displayName || "Unnamed Patient",
        age: patient.age,
        condition: patient.condition || "Recovery plan pending",
        adherence,
        risk,
        sessionStatus,
        nextSession: formatNextSession(scheduledAt, sessionStatus),
      };
    });
  }, [patients, liveData]);

  const kpi = useMemo(() => {
    const samples = caseload.filter((row) => row.adherence !== null);
    const avgAdherence = samples.length
      ? Math.round(
          samples.reduce((sum, row) => sum + (row.adherence ?? 0), 0) /
            samples.length,
        )
      : null;
    const sessionsToday = caseload.filter((row) => {
      const sample = liveData[row.uid];
      if (!sample?.timestamp) return false;
      const date = new Date(sample.timestamp);
      if (Number.isNaN(date.getTime())) return false;
      return date.toDateString() === new Date().toDateString();
    }).length;
    const actionAlerts = caseload.filter((row) => {
      const sample = liveData[row.uid];
      return sample ? detectAlertCount(sample) > 0 : false;
    }).length;
    const escalations = caseload.filter((row) => {
      const sample = liveData[row.uid];
      return sample ? detectAlertCount(sample) >= 2 : false;
    }).length;

    return { avgAdherence, sessionsToday, actionAlerts, escalations };
  }, [caseload, liveData]);

  const priorityAlerts = useMemo(() => {
    const items: { label: string; severity: "warn" | "success" | "info" }[] =
      [];

    caseload.forEach((row) => {
      const sample = liveData[row.uid];
      if (!sample) return;
      const alertCount = detectAlertCount(sample);
      if (row.sessionStatus === "missed") {
        items.push({
          label: `${row.name} missed the scheduled session`,
          severity: "warn",
        });
      }
      if (alertCount >= 2) {
        items.push({
          label: `${row.name} has multiple vitals out of range`,
          severity: "warn",
        });
      } else if (alertCount === 1) {
        items.push({
          label: `${row.name} has a vitals alert to review`,
          severity: "info",
        });
      }
      if (row.adherence !== null && row.adherence < 70) {
        items.push({
          label: `${row.name} adherence dropped below 70%`,
          severity: "warn",
        });
      }
    });

    if (!items.length) {
      items.push({
        label: "No critical alerts. All patients within expected ranges.",
        severity: "success",
      });
    }

    return items.slice(0, 4);
  }, [caseload, liveData]);

  return (
    <>
      <div className="page-header">
        <div className="page-title">Doctor Dashboard</div>
        <div className="page-subtitle">
          <span className="live-dot"></span>
          Active caseload overview with patient progress and alerts
        </div>
      </div>

      <div className="section stats-grid-4">
        <div className="card doctor-kpi-card">
          <div className="doctor-kpi-value">{patients.length}</div>
          <div className="doctor-kpi-label">Active Patients</div>
        </div>
        <div className="card doctor-kpi-card">
          <div className="doctor-kpi-value">
            {kpi.avgAdherence !== null ? `${kpi.avgAdherence}%` : "--"}
          </div>
          <div className="doctor-kpi-label">Avg Adherence</div>
        </div>
        <div className="card doctor-kpi-card">
          <div className="doctor-kpi-value">{kpi.sessionsToday}</div>
          <div className="doctor-kpi-label">Sessions Today</div>
        </div>
        <div className="card doctor-kpi-card">
          <div className="doctor-kpi-value">{kpi.actionAlerts}</div>
          <div className="doctor-kpi-label">Action Alerts</div>
        </div>
      </div>

      <div className="section">
        <DoctorLiveBoard />
      </div>

      <div className="section grid-main doctor-dashboard-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div
                className="card-title-icon"
                style={{ background: "rgba(34,211,238,.12)" }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              Patient Caseload
            </div>
          </div>

          <div className="doctor-patient-list">
            {caseload.map((patient) => {
              const initials = patient.name
                .split(" ")
                .map((segment) => segment[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const adherenceValue = patient.adherence ?? 0;
              const adherenceColor =
                patient.adherence === null
                  ? "var(--text-muted)"
                  : adherenceValue >= 85
                    ? "var(--green)"
                    : adherenceValue >= 70
                      ? "var(--teal)"
                      : "var(--orange)";
              const riskLabel =
                patient.risk === "Unknown" ? "Review" : `${patient.risk} Risk`;
              const riskColor =
                patient.risk === "Low"
                  ? "var(--green)"
                  : patient.risk === "Moderate"
                    ? "var(--orange)"
                    : patient.risk === "High"
                      ? "var(--red)"
                      : "var(--text-muted)";
              const riskBg =
                patient.risk === "Low"
                  ? "rgba(52,211,153,.1)"
                  : patient.risk === "Moderate"
                    ? "rgba(251,191,36,.12)"
                    : patient.risk === "High"
                      ? "rgba(248,113,113,.12)"
                      : "rgba(148,163,184,.1)";
              const riskBorder =
                patient.risk === "Low"
                  ? "rgba(52,211,153,.2)"
                  : patient.risk === "Moderate"
                    ? "rgba(251,191,36,.25)"
                    : patient.risk === "High"
                      ? "rgba(248,113,113,.25)"
                      : "rgba(148,163,184,.2)";

              return (
                <div key={patient.name} className="patient-row">
                  <div className="patient-row-avatar doctor-avatar-chip">
                    {initials}
                  </div>
                  <div className="patient-row-main">
                    <div className="doctor-patient-name">{patient.name}</div>
                    <div className="doctor-patient-meta">
                      {patient.condition}
                      {patient.age ? ` · Age ${patient.age}` : ""}
                    </div>
                    <div className="doctor-patient-next">
                      Next session: {patient.nextSession}
                    </div>
                  </div>
                  <div className="patient-row-stat">
                    <div
                      style={{
                        fontSize: "21px",
                        fontWeight: 900,
                        color: adherenceColor,
                      }}
                    >
                      {patient.adherence === null
                        ? "--"
                        : `${patient.adherence}%`}
                    </div>
                    <div className="doctor-stat-label">Adherence</div>
                  </div>
                  <div className="patient-row-stat">
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: riskColor,
                        background: riskBg,
                        border: `1px solid ${riskBorder}`,
                        borderRadius: "999px",
                        padding: "5px 10px",
                      }}
                    >
                      {riskLabel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stack-column">
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div
                  className="card-title-icon"
                  style={{ background: "rgba(248,113,113,.14)" }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#f87171"
                    strokeWidth="2"
                  >
                    <path d="M10.29 3.86 1.82 18A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                Priority Alerts
              </div>
            </div>
            <div className="doctor-alert-list">
              {priorityAlerts.map((alert) => (
                <div
                  key={alert.label}
                  className={`alert-item alert-${alert.severity === "warn" ? "warn" : alert.severity === "success" ? "ok" : "crit"}`}
                >
                  <div className="alert-dot"></div>
                  <div className="alert-label">{alert.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div
                  className="card-title-icon"
                  style={{ background: "rgba(96,165,250,.12)" }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                  >
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
                Clinic Snapshot
              </div>
            </div>
            <div className="session-summary-grid">
              <div className="doctor-snapshot-card">
                <div className="doctor-snapshot-value">{kpi.sessionsToday}</div>
                <div className="doctor-snapshot-label">Completed Sessions</div>
              </div>
              <div className="doctor-snapshot-card">
                <div className="doctor-snapshot-value">{kpi.actionAlerts}</div>
                <div className="doctor-snapshot-label">Pending Reviews</div>
              </div>
              <div className="doctor-snapshot-card">
                <div className="doctor-snapshot-value">
                  {kpi.avgAdherence !== null ? `${kpi.avgAdherence}%` : "--"}
                </div>
                <div className="doctor-snapshot-label">Form Accuracy</div>
              </div>
              <div className="doctor-snapshot-card">
                <div className="doctor-snapshot-value">{kpi.escalations}</div>
                <div className="doctor-snapshot-label">Escalations</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
