import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query as buildQuery,
  updateDoc,
  where,
} from "firebase/firestore";
import { subscribeToAllPatientsLiveData } from "../services/realtimeDbService";
import {
  computeRecoveryScore,
  detectAlertCount,
} from "../services/recoveryMetrics";
import { db } from "../firebase";
import {
  getCachedReportsForUser,
  removeCachedReportForUser,
  uploadMedicalReport,
  validateMedicalReportFile,
} from "../services/reportUploadService";
import { createNotification } from "../services/notificationService";
import type { SessionUser } from "../types/auth";
import type { LiveDataMap } from "../types/sensor";

type PatientProfile = {
  uid: string;
  displayName?: string;
  surgery?: string;
  condition?: string;
  status?: string;
  sessionsDone?: number;
  age?: number | string;
  basicInfo?: {
    age?: number | string;
  };
  incident?: {
    type?: string;
  };
  reports?: EmbeddedPatientReport[];
};

type EmbeddedPatientReport = {
  reportId?: string;
  userId?: string;
  reportName?: string;
  fileName?: string;
  mimeType?: string;
  fileUrl?: string;
  uploadedAt?: string;
  reviewStatus?: string;
};

type ReportRow = {
  reportId?: string;
  patientDocId?: string;
  title: string;
  date: string;
  type: string;
  pages: number;
  status: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  patientUid?: string;
  patientName?: string;
};

type AssignedPatient = {
  patientDocId: string;
  uid: string;
  displayName: string;
  age: string;
  injury: string;
  reports: EmbeddedPatientReport[];
};

function toReportRowFromCache(input: {
  userId?: string;
  patientName?: string;
  reportName: string;
  fileName: string;
  fileUrl: string;
  uploadedAtMs: number;
}): ReportRow {
  return {
    title: input.reportName,
    date: new Date(input.uploadedAtMs).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    type: "Assessment",
    pages: 1,
    status: "Pending Review",
    fileUrl: input.fileUrl,
    fileName: input.fileName,
    mimeType: (input.fileName || "").toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : undefined,
    patientUid: input.userId,
    patientName: input.patientName,
  };
}

function isPdfReport(report: ReportRow): boolean {
  if (report.mimeType?.toLowerCase() === "application/pdf") return true;
  return (report.fileName || "").toLowerCase().endsWith(".pdf");
}

function getResolvedReportUrl(report: ReportRow): string {
  const rawUrl = report.fileUrl || "";
  if (!rawUrl) return "";
  // Use stored URL directly. Rewriting resource type can cause 404 when the
  // asset was created under a different delivery type.
  return rawUrl;
}

function normalizeEmbeddedReports(input: unknown): EmbeddedPatientReport[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item) => typeof item === "object" && item !== null) as EmbeddedPatientReport[];
}

export default function Reports({ session }: { session: SessionUser }) {
  const [searchParams] = useSearchParams();
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [liveData, setLiveData] = useState<LiveDataMap>({});
  const [uploadedReports, setUploadedReports] = useState<ReportRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [assignedPatients, setAssignedPatients] = useState<AssignedPatient[]>([]);
  const [selectedPatientUid, setSelectedPatientUid] = useState<string>("");
  const [doctorPatientSearch, setDoctorPatientSearch] = useState("");
  const [reportName, setReportName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");

  const isPatient = session.role === "patient";
  const isDoctor = session.role === "doctor";
  const selectedDoctorPatient = useMemo(
    () => assignedPatients.find((patient) => patient.uid === selectedPatientUid) ?? null,
    [assignedPatients, selectedPatientUid],
  );
  const filteredAssignedPatients = useMemo(() => {
    const query = doctorPatientSearch.trim().toLowerCase();
    if (!query) return assignedPatients;
    return assignedPatients.filter((patient) => {
      const haystack = `${patient.displayName} ${patient.injury} ${patient.age}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [assignedPatients, doctorPatientSearch]);

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
    if (!isPatient) {
      return;
    }

    const cachedRows = getCachedReportsForUser(session.uid).map((row) =>
      toReportRowFromCache(row),
    );
    setUploadedReports(cachedRows);

    const patientRef = doc(db, "patients", session.profileDocId);
    const unsubscribe = onSnapshot(
      patientRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setUploadedReports(cachedRows);
          return;
        }

        const data = snapshot.data() as PatientProfile;
        const embeddedReports = normalizeEmbeddedReports(data.reports);
        const remoteRows = embeddedReports
          .map((item, index) => {
            const uploadedDate = item.uploadedAt ? new Date(item.uploadedAt) : new Date(0);
            const uploadedAtMs = Number.isNaN(uploadedDate.getTime()) ? 0 : uploadedDate.getTime();
            return {
              reportId: item.reportId || `${item.fileUrl || "report"}_${index}`,
              patientDocId: session.profileDocId,
              title: item.reportName?.trim() || item.fileName || "Medical Report",
              date: uploadedDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              type: "Assessment",
              pages: 1,
              status: item.reviewStatus || "Pending Review",
              fileUrl: item.fileUrl,
              fileName: item.fileName,
              mimeType: item.mimeType,
              patientUid: data.uid || session.uid,
              patientName: data.displayName || session.displayName,
              uploadedAtMs,
            };
          });

        const cachedWithMs = getCachedReportsForUser(session.uid).map((row) => ({
          ...toReportRowFromCache(row),
          uploadedAtMs: row.uploadedAtMs,
        }));

        const next = [...remoteRows, ...cachedWithMs]
          .filter((item, index, arr) => {
            const key = `${item.fileUrl || ""}-${item.title}`;
            return arr.findIndex((candidate) => {
              const candidateKey = `${candidate.fileUrl || ""}-${candidate.title}`;
              return candidateKey === key;
            }) === index;
          })
          .sort((a, b) => b.uploadedAtMs - a.uploadedAtMs)
          .map(({ uploadedAtMs, ...row }) => row);

        setUploadedReports(next);
      },
      () => {
        setUploadedReports(cachedRows);
        setUploadMessage("Unable to sync from cloud right now. Showing saved local reports.");
      },
    );

    return unsubscribe;
  }, [isPatient, session.displayName, session.profileDocId, session.uid]);

  useEffect(() => {
    if (!isDoctor) {
      setAssignedPatients([]);
      setSelectedPatientUid("");
      return;
    }

    const patientsQuery = buildQuery(
      collection(db, "patients"),
      where("doctor.doctorId", "==", session.profileDocId),
    );

    const unsubscribe = onSnapshot(
      patientsQuery,
      (snapshot) => {
        const nextPatients = snapshot.docs
          .map((docItem) => {
            const data = docItem.data() as PatientProfile;
            const uid = data.uid;
            if (!uid) return null;

            const ageValue = data.basicInfo?.age ?? data.age;
            const age = ageValue !== undefined && ageValue !== null && ageValue !== ""
              ? String(ageValue)
              : "--";

            const injury =
              data.incident?.type
              || data.condition
              || data.surgery
              || "Not specified";

            return {
              patientDocId: docItem.id,
              uid,
              displayName: data.displayName || data.uid || "Patient",
              age,
              injury,
              reports: normalizeEmbeddedReports(data.reports),
            } as AssignedPatient;
          })
          .filter((item): item is AssignedPatient => Boolean(item));

        setAssignedPatients(nextPatients);
        setSelectedPatientUid((current) => {
          if (!current) return current;
          const stillExists = nextPatients.some((p) => p.uid === current);
          return stillExists ? current : "";
        });
      },
      () => {
        setUploadMessage("Unable to load your assigned patients right now.");
      },
    );

    return unsubscribe;
  }, [isDoctor, session.profileDocId]);

  useEffect(() => {
    if (!isDoctor) return;

    const rows = assignedPatients
      .flatMap((patient) =>
        patient.reports.map((item, index) => {
          const uploadedDate = item.uploadedAt ? new Date(item.uploadedAt) : new Date(0);
          const uploadedAtMs = Number.isNaN(uploadedDate.getTime()) ? 0 : uploadedDate.getTime();
          return {
            reportId: item.reportId || `${item.fileUrl || "report"}_${index}`,
            patientDocId: patient.patientDocId,
            title: item.reportName?.trim() || item.fileName || "Medical Report",
            date: uploadedDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            type: "Assessment",
            pages: 1,
            status: item.reviewStatus || "Pending Review",
            fileUrl: item.fileUrl,
            fileName: item.fileName,
            mimeType: item.mimeType,
            patientUid: patient.uid,
            patientName: patient.displayName,
            uploadedAtMs,
          };
        }),
      )
      .sort((a, b) => b.uploadedAtMs - a.uploadedAtMs)
      .map(({ uploadedAtMs, ...row }) => row);

    setUploadedReports(rows);
  }, [assignedPatients, isDoctor]);

  const generatedReports = useMemo<ReportRow[]>(() => {
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

  const reports = useMemo(() => {
    if (isDoctor) {
      if (!selectedPatientUid) return [];
      return uploadedReports.filter((row) => row.patientUid === selectedPatientUid);
    }
    if (!isPatient) return generatedReports;
    return [...uploadedReports, ...generatedReports];
  }, [
    generatedReports,
    isDoctor,
    isPatient,
    selectedPatientUid,
    uploadedReports,
  ]);

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

  const handleFileSelected = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const validation = validateMedicalReportFile(file);
    if (!validation.valid) {
      setSelectedFile(null);
      setUploadMessage(validation.error);
      return;
    }

    setSelectedFile(file);
    setUploadMessage(`Selected: ${file.name}`);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setUploadMessage("Please select a file first.");
      return;
    }

    const normalizedReportName = reportName.trim();
    if (!normalizedReportName) {
      setUploadMessage("Please enter a report name before uploading.");
      return;
    }

    try {
      setUploading(true);
      setUploadMessage("Uploading...");

      const result = await uploadMedicalReport(
        selectedFile,
        normalizedReportName,
        session.profileDocId,
      );
      if (!result.success) {
        setUploadMessage(result.error);
        return;
      }

      setUploadMessage("Report uploaded successfully.");
      setReportName("");
      setSelectedFile(null);
      setIsUploaderOpen(false);
    } finally {
      setUploading(false);
    }
  };

  const handleViewReport = (report: ReportRow) => {
    const resolvedUrl = getResolvedReportUrl(report);

    if (!resolvedUrl) {
      setUploadMessage("This report does not have an uploaded file to view.");
      return;
    }

    if (isPdfReport(report)) {
      setUploadMessage("PDF preview is limited in this setup. Downloading the PDF instead.");
      handleExportReport(report);
      return;
    }

    window.open(resolvedUrl, "_blank", "noopener,noreferrer");
  };

  const handleExportReport = (report: ReportRow) => {
    const resolvedUrl = getResolvedReportUrl(report);

    if (!resolvedUrl) {
      setUploadMessage("This report does not have an uploaded file to export.");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = resolvedUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.download = report.fileName || `${report.title}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleMarkReviewed = async (report: ReportRow) => {
    if (!report.reportId || !report.patientDocId) {
      setUploadMessage("This report cannot be reviewed right now.");
      return;
    }

    try {
      const patientRef = doc(db, "patients", report.patientDocId);
      const snap = await getDoc(patientRef);
      if (!snap.exists()) {
        setUploadMessage("Patient record not found.");
        return;
      }

      const data = snap.data() as PatientProfile;
      const embeddedReports = normalizeEmbeddedReports(data.reports);
      const nextReports = embeddedReports.map((item) =>
        item.reportId === report.reportId
          ? {
              ...item,
              reviewStatus: "Reviewed",
              reviewedAt: new Date().toISOString(),
              reviewedByUid: session.uid,
            }
          : item,
      );

      await updateDoc(patientRef, { reports: nextReports });

      const doctorLabel = session.displayName || "Doctor";
      const patientLabel = report.patientName || "Patient";

      if (report.patientUid) {
        await createNotification(
          report.patientUid,
          `Report \"${report.title}\" was reviewed by ${doctorLabel}.`,
          "report",
        );
      }

      await createNotification(
        session.uid,
        `You reviewed \"${report.title}\" for ${patientLabel}.`,
        "report",
      );

      setUploadedReports((current) =>
        current.map((row) =>
          row.reportId === report.reportId
            ? { ...row, status: "Reviewed" }
            : row,
        ),
      );
      setUploadMessage("Report marked as reviewed.");
    } catch {
      setUploadMessage("Failed to update review status.");
    }
  };

  const handleRemoveReportRecord = async (report: ReportRow) => {
    if (!report.reportId || !report.patientDocId) {
      setUploadMessage("This report record cannot be removed.");
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete \"${report.title}\"?\n\nThis will permanently remove the report record from Firebase.`,
    );
    if (!confirmDelete) {
      return;
    }

    try {
      const patientRef = doc(db, "patients", report.patientDocId);
      const snap = await getDoc(patientRef);
      if (!snap.exists()) {
        setUploadMessage("Patient record not found.");
        return;
      }

      const data = snap.data() as PatientProfile;
      const embeddedReports = normalizeEmbeddedReports(data.reports);
      const nextReports = embeddedReports.filter(
        (item) => item.reportId !== report.reportId,
      );

      await updateDoc(patientRef, { reports: nextReports });

      setUploadedReports((current) =>
        current.filter((row) => row.reportId !== report.reportId),
      );

      const ownerUid = report.patientUid || session.uid;
      removeCachedReportForUser(ownerUid, report.fileUrl);
      setUploadMessage("Report removed from list.");
    } catch {
      setUploadMessage("Failed to remove this report from list.");
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Reports</div>
        <div className="page-subtitle">
          Clinical documentation and automated reporting
        </div>
      </div>

      {isDoctor ? (
        <div className="section">
          <div className="card" style={{ display: "grid", gap: "12px" }}>
            <div className="card-header" style={{ marginBottom: 0 }}>
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
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                Assigned Patients
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {filteredAssignedPatients.length} of {assignedPatients.length} patients
              </span>
            </div>

            {assignedPatients.length ? (
              <div style={{ display: "grid", gap: "10px" }}>
                <input
                  type="text"
                  value={doctorPatientSearch}
                  onChange={(event) => setDoctorPatientSearch(event.target.value)}
                  placeholder="Search patients by name or injury"
                  style={{
                    height: "42px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    padding: "0 12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "var(--font)",
                    outline: "none",
                    width: "min(520px, 100%)",
                  }}
                />
                {filteredAssignedPatients.map((patient) => (
                  <div
                    key={patient.uid}
                    className="report-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "14px 16px",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div className="report-row-main" style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "16px", fontWeight: 800 }}>
                        {patient.displayName}
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--text-muted)",
                          marginTop: "4px",
                          fontWeight: 600,
                        }}
                      >
                        Age: {patient.age} • Injury: {patient.injury}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedPatientUid(patient.uid)}
                      style={{
                        marginLeft: "auto",
                        alignSelf: "center",
                        padding: "9px 16px",
                        borderRadius: "8px",
                        border:
                          selectedPatientUid === patient.uid
                            ? "1px solid rgba(34,211,238,.55)"
                            : "1px solid rgba(34,211,238,.25)",
                        background:
                          selectedPatientUid === patient.uid
                            ? "rgba(34,211,238,.18)"
                            : "rgba(34,211,238,.08)",
                        color: "var(--teal)",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "var(--font)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      View Reports
                    </button>
                  </div>
                ))}
                {!filteredAssignedPatients.length ? (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    No patients match your search.
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                No patients have selected you yet.
              </div>
            )}
          </div>
        </div>
      ) : null}

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
      {!isDoctor || selectedDoctorPatient ? (
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
              {isDoctor && selectedDoctorPatient
                ? `${selectedDoctorPatient.displayName} — Submitted Reports`
                : "Recent Reports"}
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {query
                ? `${filteredReports.length} of ${reports.length} reports`
                : `${reports.length} reports`}
            </span>
          </div>
          {isDoctor && selectedDoctorPatient ? (
            <div style={{ marginBottom: "10px" }}>
              <button
                type="button"
                onClick={() => setSelectedPatientUid("")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font)",
                }}
              >
                ← Back To Patient List
              </button>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredReports.map((r, i) => (
              <div
                key={i}
                className="report-row"
                style={{
                  border: "1px solid var(--border-light)",
                  gridTemplateColumns: isDoctor
                    ? "minmax(220px,1fr) 110px 80px 120px minmax(250px,auto)"
                    : undefined,
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
                    {isDoctor && r.patientName
                      ? `${r.patientName} • ${r.date}`
                      : r.date}
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
                    lineHeight: 1.25,
                    whiteSpace: "normal",
                    minWidth: isDoctor ? "110px" : undefined,
                    color:
                      r.status === "Reviewed"
                        ? "var(--teal)"
                        : r.status === "Ready"
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
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  {r.fileUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handleViewReport(r);
                      }}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        opacity: 1,
                        fontFamily: "var(--font)",
                      }}
                    >
                      View Report
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      style={{
                        padding: "5px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text-muted)",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "not-allowed",
                        opacity: 0.65,
                        fontFamily: "var(--font)",
                      }}
                    >
                      View Report
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleExportReport(r)}
                    disabled={!r.fileUrl}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(34,211,238,.2)",
                      background: !r.fileUrl
                        ? "rgba(100,116,139,.12)"
                        : "rgba(34,211,238,.08)",
                      color: !r.fileUrl ? "var(--text-muted)" : "var(--teal)",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: !r.fileUrl ? "not-allowed" : "pointer",
                      opacity: !r.fileUrl ? 0.65 : 1,
                      fontFamily: "var(--font)",
                    }}
                  >
                    Export
                  </button>
                  {isDoctor ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handleMarkReviewed(r);
                      }}
                      disabled={r.status === "Reviewed"}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "6px",
                        border: "1px solid rgba(16,185,129,.25)",
                        background: r.status === "Reviewed"
                          ? "rgba(100,116,139,.12)"
                          : "rgba(16,185,129,.1)",
                        color: r.status === "Reviewed"
                          ? "var(--text-muted)"
                          : "var(--green)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: r.status === "Reviewed" ? "not-allowed" : "pointer",
                        opacity: r.status === "Reviewed" ? 0.7 : 1,
                        fontFamily: "var(--font)",
                      }}
                    >
                      {r.status === "Reviewed" ? "Reviewed" : "Mark Reviewed"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void handleRemoveReportRecord(r);
                    }}
                    disabled={!r.reportId}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(248,113,113,.25)",
                      background: !r.reportId
                        ? "rgba(100,116,139,.12)"
                        : "rgba(248,113,113,.1)",
                      color: !r.reportId ? "var(--text-muted)" : "var(--red)",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: !r.reportId ? "not-allowed" : "pointer",
                      opacity: !r.reportId ? 0.65 : 1,
                      fontFamily: "var(--font)",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {!filteredReports.length ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                No reports submitted by this patient yet.
              </div>
            ) : null}
          </div>
        </div>
      </div>
      ) : null}

      {isPatient ? (
        <>
          {isUploaderOpen ? (
            <div
              style={{
                position: "fixed",
                right: "24px",
                bottom: "92px",
                width: "min(92vw, 440px)",
                zIndex: 220,
              }}
            >
              <div
                className="card"
                style={{
                  display: "grid",
                  gap: "12px",
                  padding: "18px",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: 700 }}>
                    Upload Medical Report
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsUploaderOpen(false)}
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "999px",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    ×
                  </button>
                </div>

                <input
                  type="text"
                  value={reportName}
                  onChange={(event) => {
                    setReportName(event.target.value);
                    if (uploadMessage) setUploadMessage("");
                  }}
                  placeholder="Write report name"
                  disabled={uploading}
                  style={{
                    height: "38px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    padding: "0 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    fontFamily: "var(--font)",
                    outline: "none",
                    width: "100%",
                  }}
                />

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "fit-content",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(34,211,238,.35)",
                    background: "rgba(34,211,238,.1)",
                    color: "var(--teal)",
                    fontSize: "12px",
                    fontWeight: 700,
                    fontFamily: "var(--font)",
                    cursor: uploading ? "not-allowed" : "pointer",
                    opacity: uploading ? 0.75 : 1,
                  }}
                >
                  Select File / Photo
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,image/*"
                    disabled={uploading}
                    onChange={handleFileSelected}
                    style={{ display: "none" }}
                  />
                </label>

                <div
                  style={{
                    fontSize: "11px",
                    color: selectedFile ? "var(--text-secondary)" : "var(--text-muted)",
                    minHeight: "16px",
                  }}
                >
                  {selectedFile ? `Selected file: ${selectedFile.name}` : "No file selected yet"}
                </div>

                <button
                  type="button"
                  onClick={handleFileUpload}
                  disabled={uploading || !selectedFile || !reportName.trim()}
                  style={{
                    height: "38px",
                    borderRadius: "8px",
                    border: "1px solid rgba(34,211,238,.35)",
                    background:
                      uploading || !selectedFile || !reportName.trim()
                        ? "rgba(100,116,139,.18)"
                        : "linear-gradient(135deg, rgba(34,211,238,.22), rgba(14,165,233,.2))",
                    color:
                      uploading || !selectedFile || !reportName.trim()
                        ? "var(--text-muted)"
                        : "var(--teal)",
                    fontSize: "12px",
                    fontWeight: 700,
                    fontFamily: "var(--font)",
                    cursor:
                      uploading || !selectedFile || !reportName.trim()
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {uploading ? "Uploading..." : "Confirm and Upload"}
                </button>

                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Allowed files: PDF, JPG, PNG (max 10MB)
                </div>

                {uploadMessage ? (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {uploadMessage}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setIsUploaderOpen((open) => !open);
              if (uploadMessage) setUploadMessage("");
            }}
            aria-label="Open report uploader"
            style={{
              position: "fixed",
              right: "24px",
              bottom: "24px",
              zIndex: 210,
              width: "56px",
              height: "56px",
              borderRadius: "999px",
              border: "1px solid rgba(34,211,238,.35)",
              background: "linear-gradient(135deg, #22d3ee, #0ea5e9)",
              color: "#06202a",
              cursor: "pointer",
              fontSize: "26px",
              fontWeight: 700,
              boxShadow: "0 14px 40px rgba(14,165,233,.35)",
            }}
          >
            {isUploaderOpen ? "−" : "+"}
          </button>
        </>
      ) : null}
    </>
  );
}
