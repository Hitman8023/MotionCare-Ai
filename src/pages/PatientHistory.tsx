import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { subscribeToAllPatientsLiveData } from "../services/realtimeDbService";
import {
  computeRecoveryScore,
  detectAlertCount,
} from "../services/recoveryMetrics";
import { db } from "../firebase";
import type { LiveDataMap } from "../types/sensor";

type PatientProfile = {
  uid: string;
  displayName?: string;
  age?: number;
  surgery?: string;
  condition?: string;
  stage?: string;
  status?: string;
  sessionsDone?: number;
  score?: number;
};

type PatientRow = {
  uid: string;
  name: string;
  age?: number;
  surgery: string;
  stage: string;
  score: number;
  sessions: number;
  status: string;
};

type TimelineEvent = {
  date: string;
  event: string;
  type: "session" | "alert" | "update" | "milestone";
};

export default function PatientHistory() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [liveData, setLiveData] = useState<LiveDataMap>({});
  const [timelineByUid, setTimelineByUid] = useState<
    Record<string, TimelineEvent[]>
  >({});
  const lastTimestampByUid = useRef<Map<string, string>>(new Map());

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

  useEffect(() => {
    setTimelineByUid((prev) => {
      const nextTimeline: Record<string, TimelineEvent[]> = { ...prev };
      Object.entries(liveData).forEach(([uid, sample]) => {
        if (!sample?.timestamp) return;
        const lastSeen = lastTimestampByUid.current.get(uid);
        if (lastSeen === sample.timestamp) return;
        lastTimestampByUid.current.set(uid, sample.timestamp);

        const dateObj = new Date(sample.timestamp);
        const date = Number.isNaN(dateObj.getTime())
          ? sample.timestamp
          : dateObj.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
        const alertCount = detectAlertCount(sample);
        const sessionEvent: TimelineEvent = {
          date,
          event: `Session packet received — HR ${sample.heart_rate} BPM, SpO₂ ${sample.spo2}%, Temp ${sample.temperature.toFixed(1)}°C`,
          type: "session",
        };
        const events = [sessionEvent];
        if (alertCount > 0) {
          events.push({
            date,
            event: `Vitals alert triggered (${alertCount})`,
            type: "alert",
          });
        }

        const existing = nextTimeline[uid] ?? [];
        const merged = [...events, ...existing].slice(0, 8);
        nextTimeline[uid] = merged;
      });
      return nextTimeline;
    });
  }, [liveData]);

  const patientRows = useMemo<PatientRow[]>(() => {
    return patients.map((patient) => {
      const sample = liveData[patient.uid];
      const score = sample
        ? computeRecoveryScore(sample)
        : (patient.score ?? 0);
      return {
        uid: patient.uid,
        name: patient.displayName || "Unnamed Patient",
        age: patient.age,
        surgery:
          patient.surgery || patient.condition || "Recovery plan pending",
        stage: patient.stage || "Active",
        score,
        sessions: patient.sessionsDone ?? 0,
        status: patient.status || "active",
      };
    });
  }, [patients, liveData]);

  const query = (searchParams.get("query") ?? "").trim();
  const normalizedQuery = query.toLowerCase();
  const filteredPatients = normalizedQuery
    ? patientRows.filter((patient) => {
        const haystack =
          `${patient.name} ${patient.surgery} ${patient.stage} ${patient.status}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : patientRows;

  const selectedPatient = filteredPatients[0] ?? patientRows[0];
  const timeline = selectedPatient
    ? (timelineByUid[selectedPatient.uid] ?? [])
    : [];

  const typeStyles: Record<string, { color: string; icon: string }> = {
    session: { color: "var(--teal)", icon: "📋" },
    alert: { color: "var(--orange)", icon: "⚠️" },
    update: { color: "var(--blue)", icon: "🔧" },
    milestone: { color: "var(--green)", icon: "🎯" },
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Patient History</div>
        <div className="page-subtitle">
          Treatment records and session timeline
        </div>
      </div>

      {/* Patient Cards */}
      <div className="section">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div
                className="card-title-icon"
                style={{ background: "rgba(167,139,250,.12)" }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="2"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              Patient Registry
            </div>
            <span style={{ fontSize: "12px", color: "var(--color-text)" }}>
              {query
                ? `${filteredPatients.length} of ${patientRows.length} patients`
                : `${patientRows.length} patients`}
            </span>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {filteredPatients.map((p, i) => (
              <div
                key={i}
                onClick={() => navigate(`/doctor/${p.uid}`)}
                className="patient-row"
                style={{
                  background: i === 0 ? "rgba(34,211,238,.05)" : "transparent",
                  border: `1px solid ${i === 0 ? "rgba(34,211,238,.12)" : "var(--border-light)"}`,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(34,211,238,.1)";
                  e.currentTarget.style.borderColor = "rgba(34,211,238,.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = i === 0 ? "rgba(34,211,238,.05)" : "transparent";
                  e.currentTarget.style.borderColor = i === 0 ? "rgba(34,211,238,.12)" : "var(--border-light)";
                }}
              >
                <div
                  className="patient-row-avatar"
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #22d3ee, #8b5cf6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "16px",
                    fontWeight: 800,
                  }}
                >
                  {p.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div className="patient-row-main">
                  <div style={{ fontSize: "14px", fontWeight: 700 }}>
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text)",
                      marginTop: "2px",
                    }}
                  >
                    {p.surgery} · Age {p.age}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color:
                        p.status === "completed"
                          ? "var(--green)"
                          : "var(--teal)",
                      fontWeight: 600,
                      marginTop: "2px",
                    }}
                  >
                    {p.stage}
                  </div>
                </div>
                <div className="patient-row-stat">
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: 900,
                      color:
                        p.score >= 90
                          ? "var(--green)"
                          : p.score >= 70
                            ? "var(--teal)"
                            : "var(--orange)",
                    }}
                  >
                    {p.score}
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--color-text)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                    }}
                  >
                    Score
                  </div>
                </div>
                <div className="patient-row-stat">
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "var(--color-text)",
                    }}
                  >
                    {p.sessions}
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--color-text)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                    }}
                  >
                    Sessions
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
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
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              Treatment Timeline —
              {selectedPatient ? ` ${selectedPatient.name}` : " No patient"}
            </div>
          </div>
          <div style={{ position: "relative", paddingLeft: "28px" }}>
            <div
              style={{
                position: "absolute",
                left: "10px",
                top: "8px",
                bottom: "8px",
                width: "2px",
                background: "var(--border)",
              }}
            ></div>
            {timeline.length ? (
              timeline.map((t, i) => {
                const ts = typeStyles[t.type];
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "14px",
                      paddingBottom: "20px",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-22px",
                        top: "4px",
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        background: ts.color,
                        border: "2px solid var(--bg)",
                        boxShadow: `0 0 8px ${ts.color}44`,
                        zIndex: 1,
                      }}
                    ></div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>
                          {ts.icon} {t.event}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--color-text)",
                            fontFamily: "var(--mono)",
                          }}
                        >
                          {t.date}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                No timeline events yet. Live data will populate this feed.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
