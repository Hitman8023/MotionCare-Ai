import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  surgery?: string;
  condition?: string;
  status?: string;
  sessionsDone?: number;
};

type ReportRow = {
  title: string;
  date: string;
  type: string;
  pages: number;
  status: string;
};

export default function Reports() {
  const [searchParams] = useSearchParams();
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

  const reports = useMemo<ReportRow[]>(() => {
    return patients.map((patient) => {
      const sample = liveData[patient.uid];
      const score = sample ? computeRecoveryScore(sample) : 0;
      const alertCount = sample ? detectAlertCount(sample) : 0;
      const status =
        alertCount > 0
          ? "Pending Review"
          : patient.status === "completed"
            ? "Approved"
            : "Ready";
      const type =
        score >= 85
          ? "Progress"
          : score >= 70
            ? "Analysis"
            : score > 0
              ? "Assessment"
              : "Evaluation";
      const pages = Math.max(4, Math.round(6 + score / 10));
      const dateObj = sample?.timestamp
        ? new Date(sample.timestamp)
        : new Date();
      const date = Number.isNaN(dateObj.getTime())
        ? new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : dateObj.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
      const name = patient.displayName || "Patient";
      const title = `${type} Report — ${name}`;
      return { title, date, type, pages, status };
    });
  }, [patients, liveData]);

  const query = (searchParams.get("query") ?? "").trim();
  const normalizedQuery = query.toLowerCase();
  const filteredReports = normalizedQuery
    ? reports.filter((report) => {
        const haystack =
          `${report.title} ${report.type} ${report.status} ${report.date}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : reports;

  const typeColors: Record<string, string> = {
    Progress: "var(--teal)",
    Analysis: "var(--blue)",
    "AI Report": "var(--purple)",
    Assessment: "var(--green)",
    Admin: "var(--orange)",
    Evaluation: "var(--pink)",
  };

  const metrics = useMemo(() => {
    const now = new Date();
    const thisMonth = reports.filter((report) => {
      const date = new Date(report.date);
      return (
        !Number.isNaN(date.getTime()) &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    }).length;
    const avgPages = reports.length
      ? (reports.reduce((sum, r) => sum + r.pages, 0) / reports.length).toFixed(
          1,
        )
      : "0.0";
    return [
      { label: "Total Reports", value: String(reports.length), icon: "📄" },
      { label: "This Month", value: String(thisMonth), icon: "📅" },
      { label: "Auto-Generated", value: String(reports.length), icon: "🤖" },
      { label: "Avg Pages", value: avgPages, icon: "📊" },
    ];
  }, [reports]);

  return (
    <>
      <div className="page-header">
        <div className="page-title">Reports</div>
        <div className="page-subtitle">
          Clinical documentation and automated reporting
        </div>
      </div>

      {/* Metrics */}
      <div className="section stats-grid-4">
        {metrics.map((m, i) => (
          <div
            key={i}
            className="card"
            style={{ textAlign: "center", padding: "20px" }}
          >
            <div style={{ fontSize: "28px", marginBottom: "6px" }}>
              {m.icon}
            </div>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 900,
                color: "var(--teal)",
                letterSpacing: "-1px",
              }}
            >
              {m.value}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginTop: "4px",
              }}
            >
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {/* Reports list */}
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              Recent Reports
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {query
                ? `${filteredReports.length} of ${reports.length} reports`
                : `${reports.length} reports`}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredReports.map((r, i) => (
              <div
                key={i}
                className="report-row"
                style={{
                  border: "1px solid var(--border-light)",
                  transition: "all .2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--surface-2)";
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                <div className="report-row-main">
                  <div style={{ fontSize: "13.5px", fontWeight: 600 }}>
                    {r.title}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      marginTop: "2px",
                    }}
                  >
                    {r.date}
                  </div>
                </div>
                <span
                  className="report-row-type"
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "20px",
                    textAlign: "center",
                    background: `${typeColors[r.type]}15`,
                    color: typeColors[r.type],
                    border: `1px solid ${typeColors[r.type]}25`,
                  }}
                >
                  {r.type}
                </span>
                <span
                  className="report-row-pages"
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  {r.pages} pages
                </span>
                <span
                  className="report-row-status"
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color:
                      r.status === "Ready"
                        ? "var(--green)"
                        : r.status === "Approved"
                          ? "var(--teal)"
                          : "var(--orange)",
                    textAlign: "center",
                  }}
                >
                  {r.status}
                </span>
                <div
                  className="report-row-actions"
                  style={{
                    display: "flex",
                    gap: "6px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "var(--font)",
                    }}
                  >
                    View
                  </button>
                  <button
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(34,211,238,.2)",
                      background: "rgba(34,211,238,.08)",
                      color: "var(--teal)",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "var(--font)",
                    }}
                  >
                    Export
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
