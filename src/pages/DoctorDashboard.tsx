import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { subscribeToAllPatientsLiveData } from "../services/realtimeDbService";
import { db } from "../firebase";
import type { LiveDataMap, SensorSample } from "../types/sensor";
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

type AlertSeverity = "critical" | "warning" | "info" | "success";

type PriorityAlert = {
  uid?: string;
  label: string;
  severity: AlertSeverity;
  urgency: "High" | "Medium" | "Low";
};

const formatRelativeTime = (rawTimestamp?: string) => {
  if (!rawTimestamp) return "No recent activity";
  const date = new Date(rawTimestamp);
  if (Number.isNaN(date.getTime())) return "No recent activity";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const getMovementStatus = (sample?: SensorSample) => {
  if (!sample) return "Unknown";
  const magnitude = Math.sqrt(
    sample.acc_x * sample.acc_x +
      sample.acc_y * sample.acc_y +
      sample.acc_z * sample.acc_z,
  );
  return magnitude >= 0.75 && magnitude <= 1.35 ? "Stable" : "Unstable";
};

const getPostureStatus = (sample?: SensorSample) => {
  if (!sample) return "Unknown";
  const rotation = Math.abs(sample.gyro_x) + Math.abs(sample.gyro_y);
  return rotation <= 1.35 ? "Normal" : "Abnormal";
};

export default function DoctorDashboard() {
  const navigate = useNavigate();
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
      const lastAttendance = sample?.timestamp ? new Date(sample.timestamp) : null;
      const attendedAfterSchedule =
        Boolean(scheduledAt && lastAttendance && lastAttendance >= scheduledAt);
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
    const items: PriorityAlert[] = [];

    caseload.forEach((row) => {
      const sample = liveData[row.uid];
      if (!sample) return;

      const alertCount = detectAlertCount(sample);

      if (row.sessionStatus === "missed") {
        items.push({
          uid: row.uid,
          label: `${row.name} missed the scheduled session`,
          severity: "critical",
          urgency: "High",
        });
      }

      if (alertCount >= 2) {
        items.push({
          uid: row.uid,
          label: `${row.name} has multiple vitals out of range`,
          severity: "critical",
          urgency: "High",
        });
      } else if (alertCount === 1) {
        items.push({
          uid: row.uid,
          label: `${row.name} has a vitals alert to review`,
          severity: "info",
          urgency: "Medium",
        });
      }

      if (row.adherence !== null && row.adherence < 70) {
        items.push({
          uid: row.uid,
          label: `${row.name} adherence dropped below 70%`,
          severity: "warning",
          urgency: "Medium",
        });
      }
    });

    if (!items.length) {
      items.push({
        label: "No critical alerts. All patients are within expected ranges.",
        severity: "success",
        urgency: "Low",
      });
    }

    return items.slice(0, 4);
  }, [caseload, liveData]);

  const statTrends = useMemo(() => {
    return {
      patients: "+1",
      adherence:
        kpi.avgAdherence !== null && kpi.avgAdherence < 80 ? "-3%" : "+2%",
      sessions:
        kpi.sessionsToday >= Math.max(1, Math.round(caseload.length * 0.5))
          ? "+6%"
          : "-1%",
      alerts: kpi.actionAlerts > 2 ? "+5%" : "-2%",
    };
  }, [kpi, caseload.length]);

  const highRiskPatients = useMemo(
    () => caseload.filter((row) => row.risk === "High").slice(0, 4),
    [caseload],
  );

  const activityTrendData = useMemo(() => {
    return caseload.slice(0, 7).map((row) => {
      const sample = liveData[row.uid];
      const movement = getMovementStatus(sample);
      const value = movement === "Stable" ? 78 : movement === "Unstable" ? 46 : 30;
      return { label: row.name.split(" ")[0], value };
    });
  }, [caseload, liveData]);

  const adherenceTrendData = useMemo(() => {
    return caseload.slice(0, 7).map((row) => ({
      label: row.name.split(" ")[0],
      value: row.adherence ?? 45,
    }));
  }, [caseload]);

  return (
    <>
      <div className="page-header">
        <div className="page-title">Doctor Dashboard</div>
        <div className="page-subtitle">
          <span className="live-dot"></span>
          Decision-first view to prioritize interventions and patient follow-up
        </div>
      </div>

      <div className="section">
        <div className="card doctor-quick-actions-card">
          <button
            type="button"
            className="doctor-quick-action primary"
            onClick={() => navigate("/live")}
          >
            Start Monitoring
          </button>
          <button
            type="button"
            className="doctor-quick-action"
            onClick={() => navigate("/chat")}
          >
            Open Chat
          </button>
          <button
            type="button"
            className="doctor-quick-action"
            onClick={() => navigate("/reports")}
          >
            View Reports
          </button>
        </div>
      </div>

      <div className="section">
        <div className="card doctor-priority-panel">
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
            <span className="mini-tag tag-live">{kpi.actionAlerts} Action Needed</span>
          </div>

          <div className="doctor-priority-list">
            {priorityAlerts.map((alert) => (
              <div
                key={alert.label}
                className={`doctor-priority-item severity-${alert.severity}`}
              >
                <div className="doctor-priority-copy">
                  <div className="doctor-priority-topline">
                    <span className="doctor-priority-urgency">{alert.urgency} Urgency</span>
                  </div>
                  <div className="doctor-priority-label">{alert.label}</div>
                </div>
                <button type="button" className="doctor-priority-cta">
                  Review Now
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section stats-grid-4">
        <div className="card doctor-kpi-card">
          <div className="doctor-kpi-value">{patients.length}</div>
          <div className="doctor-kpi-label">Active Patients</div>
          <div className="doctor-kpi-trend positive">{statTrends.patients}</div>
        </div>

        <div className="card doctor-kpi-card">
          <div className="doctor-kpi-value">
            {kpi.avgAdherence !== null ? `${kpi.avgAdherence}%` : "--"}
          </div>
          <div className="doctor-kpi-label">Avg Adherence</div>
          <div
            className={`doctor-kpi-trend ${
              statTrends.adherence.startsWith("+") ? "positive" : "negative"
            }`}
          >
            {statTrends.adherence}
          </div>
        </div>

        <div className="card doctor-kpi-card">
          <div className="doctor-kpi-value">{kpi.sessionsToday}</div>
          <div className="doctor-kpi-label">Sessions Today</div>
          <div
            className={`doctor-kpi-trend ${
              statTrends.sessions.startsWith("+") ? "positive" : "negative"
            }`}
          >
            {statTrends.sessions}
          </div>
        </div>

        <div className="card doctor-kpi-card doctor-kpi-card-alert">
          <div className="doctor-kpi-value">{kpi.actionAlerts}</div>
          <div className="doctor-kpi-label">Action Alerts</div>
          <div
            className={`doctor-kpi-trend ${
              statTrends.alerts.startsWith("+") ? "negative" : "positive"
            }`}
          >
            {statTrends.alerts}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card doctor-caseload-card">
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

            {highRiskPatients.length ? (
              <span
                className="mini-tag"
                style={{
                  background: "rgba(248,113,113,.14)",
                  color: "var(--color-text)",
                  borderColor: "rgba(248,113,113,.25)",
                }}
              >
                {highRiskPatients.length} High Risk
              </span>
            ) : null}
          </div>

          <div className="doctor-patient-cards">
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

              const statusLabel =
                patient.risk === "High"
                  ? "Critical"
                  : patient.risk === "Moderate"
                    ? "Warning"
                    : "Stable";

              const sample = liveData[patient.uid];
              const lastActivity = formatRelativeTime(sample?.timestamp);

              return (
                <div
                  key={patient.uid}
                  className={`doctor-patient-card ${
                    patient.risk === "High" ? "high-risk" : ""
                  }`}
                >
                  <div className="doctor-patient-card-head">
                    <div className="doctor-avatar-chip">{initials}</div>
                    <div>
                      <div className="doctor-patient-name">{patient.name}</div>
                      <div className="doctor-patient-meta">
                        {patient.condition}
                        {patient.age ? ` · Age ${patient.age}` : ""}
                      </div>
                    </div>
                    <div
                      className="doctor-status-pill"
                      style={{
                        color: riskColor,
                        background: riskBg,
                        borderColor: riskBorder,
                      }}
                    >
                      {statusLabel}
                    </div>
                  </div>

                  <div className="doctor-patient-card-body">
                    <div className="doctor-patient-next">Last activity: {lastActivity}</div>
                    <div className="doctor-patient-next">
                      Next session: {patient.nextSession}
                    </div>
                  </div>

                  <div className="doctor-patient-card-foot">
                    <div className="doctor-adherence-block">
                      <div
                        className="doctor-adherence-value"
                        style={{ color: adherenceColor }}
                      >
                        {patient.adherence === null ? "--" : `${patient.adherence}%`}
                      </div>
                      <div className="doctor-stat-label">Adherence</div>
                    </div>

                    <div className="doctor-action-row">
                      <button type="button" className="doctor-action-btn">
                        View
                      </button>
                      <button type="button" className="doctor-action-btn">
                        Chat
                      </button>
                      <button
                        type="button"
                        className={`doctor-action-btn review ${
                          patient.risk === "High" ? "critical" : ""
                        }`}
                      >
                        Review
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="section grid-main doctor-dashboard-grid">
        <div className="stack-column">
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
                Patient Activity Trend
              </div>
            </div>

            <div className="doctor-activity-bars">
              <div className="doctor-chart-shell">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={activityTrendData.length ? activityTrendData : [{ label: "No Data", value: 0 }] }>
                    <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="rgba(148,163,184,0.7)"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke="rgba(148,163,184,0.7)"
                      tick={{ fontSize: 11 }}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.08)" }}
                      contentStyle={{
                        background: "#0b1220",
                        border: "1px solid rgba(148,163,184,0.25)",
                        borderRadius: 10,
                        color: "#e2e8f0",
                      }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="url(#activityGradient)" />
                    <defs>
                      <linearGradient id="activityGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#34d399" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div
                  className="card-title-icon"
                  style={{ background: "rgba(52,211,153,.14)" }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2"
                  >
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                Adherence Trend
              </div>
            </div>

            <div className="doctor-line-chart-wrap">
              <div className="doctor-chart-shell">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={
                      adherenceTrendData.length
                        ? adherenceTrendData
                        : [{ label: "No Data", value: 45 }]
                    }
                  >
                    <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="rgba(148,163,184,0.7)"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke="rgba(148,163,184,0.7)"
                      tick={{ fontSize: 11 }}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      cursor={{ stroke: "rgba(52,211,153,0.4)", strokeWidth: 1 }}
                      contentStyle={{
                        background: "#0b1220",
                        border: "1px solid rgba(52,211,153,0.25)",
                        borderRadius: 10,
                        color: "#e2e8f0",
                      }}
                    />
                    <defs>
                      <linearGradient id="adherenceGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.55} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      fill="url(#adherenceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="doctor-line-caption">
                Average adherence trend over active patients
              </div>
            </div>
          </div>
        </div>

        <div className="stack-column">
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div
                  className="card-title-icon"
                  style={{ background: "rgba(148,163,184,.12)" }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2"
                  >
                    <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                  </svg>
                </div>
                Live Care Insights
              </div>
            </div>

            <div className="doctor-insight-list">
              {caseload.slice(0, 6).map((row) => {
                const sample = liveData[row.uid];
                const movement = getMovementStatus(sample);
                const posture = getPostureStatus(sample);

                return (
                  <div key={row.uid} className="doctor-insight-item">
                    <div className="doctor-insight-main">
                      <div className="doctor-insight-name">{row.name}</div>
                      <div className="doctor-insight-meta">
                        Last activity {formatRelativeTime(sample?.timestamp)}
                      </div>
                    </div>

                    <div className="doctor-insight-tags">
                      <span
                        className={`doctor-insight-tag ${
                          movement === "Stable"
                            ? "good"
                            : movement === "Unstable"
                              ? "warn"
                              : "neutral"
                        }`}
                      >
                        Movement: {movement}
                      </span>
                      <span
                        className={`doctor-insight-tag ${
                          posture === "Normal"
                            ? "good"
                            : posture === "Abnormal"
                              ? "warn"
                              : "neutral"
                        }`}
                      >
                        Posture: {posture}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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
                    <path d="M12 20h9" />
                    <path d="M12 4h9" />
                    <path d="M4 9h16" />
                    <path d="M4 15h16" />
                  </svg>
                </div>
                High-Risk Queue
              </div>
            </div>

            <div className="doctor-risk-queue">
              {highRiskPatients.length === 0 ? (
                <div className="doctor-risk-empty">
                  <div className="doctor-risk-empty-title">All patients stable</div>
                  <div className="doctor-risk-empty-subtitle">
                    No escalations are required right now. Monitoring is normal across the clinic.
                  </div>
                </div>
              ) : (
                highRiskPatients.map((patient) => (
                  <div key={patient.uid} className="doctor-risk-item">
                    <div>
                      <div className="doctor-patient-name">{patient.name}</div>
                      <div className="doctor-patient-meta">{patient.condition}</div>
                    </div>
                    <button type="button" className="doctor-action-btn review critical">
                      Review
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="section">
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
                  <path d="M12 20V10" />
                  <path d="M18 20V4" />
                  <path d="M6 20v-4" />
                </svg>
              </div>
              Clinic Snapshot
            </div>
          </div>

          <div className="session-summary-grid">
            <div className="doctor-snapshot-card">
              <div className="doctor-snapshot-value">{kpi.sessionsToday}</div>
              <div className="doctor-snapshot-label">Sessions Recorded Today</div>
            </div>
            <div className="doctor-snapshot-card">
              <div className="doctor-snapshot-value">{kpi.actionAlerts}</div>
              <div className="doctor-snapshot-label">Patients With Alerts</div>
            </div>
            <div className="doctor-snapshot-card">
              <div className="doctor-snapshot-value">{kpi.escalations}</div>
              <div className="doctor-snapshot-label">Escalation Candidates</div>
            </div>
            <div className="doctor-snapshot-card">
              <div className="doctor-snapshot-value">
                {kpi.avgAdherence !== null ? `${kpi.avgAdherence}%` : "--"}
              </div>
              <div className="doctor-snapshot-label">Average Program Adherence</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
