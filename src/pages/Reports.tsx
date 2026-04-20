import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
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

function mapAssignedPatientsFromSnapshot(
  snapshot: { docs: Array<{ id: string; data: () => unknown }> },
  session: SessionUser,
): AssignedPatient[] {
  const doctorKeys = new Set(
    [session.uid, session.profileDocId].filter((value): value is string => Boolean(value)),
  );

  return snapshot.docs
    .map((docItem) => {
      const data = docItem.data() as PatientProfile & {
        assignedDoctorId?: string;
        doctor?: {
          doctorId?: string;
          uid?: string;
          profileDocId?: string;
        };
      };

      const assignedDoctorId = data.assignedDoctorId;
      const nestedDoctorId = data.doctor?.doctorId;
      const nestedDoctorUid = data.doctor?.uid;
      const nestedDoctorProfileDocId = data.doctor?.profileDocId;

      const isAssignedToDoctor =
        (assignedDoctorId && doctorKeys.has(assignedDoctorId))
        || (nestedDoctorId && doctorKeys.has(nestedDoctorId))
        || (nestedDoctorUid && doctorKeys.has(nestedDoctorUid))
        || (nestedDoctorProfileDocId && doctorKeys.has(nestedDoctorProfileDocId));

      if (!isAssignedToDoctor) return null;

      const uid = data.uid;
      const fallbackUid = docItem.id;

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
        uid: uid || fallbackUid,
        displayName: data.displayName || uid || fallbackUid || "Patient",
        age,
        injury,
        reports: normalizeEmbeddedReports(data.reports),
      } as AssignedPatient;
    })
    .filter((item): item is AssignedPatient => Boolean(item));
}

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
  const navigate = useNavigate();
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
  const [patientFilter, setPatientFilter] = useState<"all" | "recent" | "pending">("all");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [openDoctorMenuForReportId, setOpenDoctorMenuForReportId] = useState<string>("");
  const patientFileInputRef = useRef<HTMLInputElement | null>(null);

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

    const unsubscribe = onSnapshot(
      collection(db, "patients"),
      (snapshot) => {
        const nextPatients = mapAssignedPatientsFromSnapshot(snapshot, session);
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
  }, [isDoctor, session]);

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
    if (isPatient) return uploadedReports;
    return generatedReports;
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
    if (!reportName.trim()) {
      setReportName(file.name.replace(/\.[^/.]+$/, ""));
    }
    setUploadMessage(`Selected: ${file.name}`);
  };

  const handleDroppedFile = (file: File) => {
    const validation = validateMedicalReportFile(file);
    if (!validation.valid) {
      setSelectedFile(null);
      setUploadMessage(validation.error);
      return;
    }

    setSelectedFile(file);
    if (!reportName.trim()) {
      setReportName(file.name.replace(/\.[^/.]+$/, ""));
    }
    setUploadMessage(`Selected: ${file.name}`);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setUploadMessage("Please select a file first.");
      return;
    }

    const normalizedReportName = reportName.trim()
      || selectedFile.name.replace(/\.[^/.]+$/, "")
      || "Health Report";

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

  const makeFriendlyReportName = (report: ReportRow): string => {
    const normalized = (report.title || "").trim() || report.fileName || "Health Report";
    return normalized
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const getReportKind = (report: ReportRow): "pdf" | "image" | "other" => {
    const fileName = (report.fileName || "").toLowerCase();
    const mime = (report.mimeType || "").toLowerCase();
    if (mime.includes("pdf") || fileName.endsWith(".pdf")) return "pdf";
    if (mime.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(fileName)) return "image";
    return "other";
  };

  const nowMs = Date.now();
  const patientReports = filteredReports
    .map((report) => {
      const parsedDate = Date.parse(report.date);
      const isRecent = Number.isFinite(parsedDate)
        ? nowMs - parsedDate <= 30 * 24 * 60 * 60 * 1000
        : false;
      const status = report.status.toLowerCase().includes("pending")
        ? "Pending Review"
        : "Ready";

      return {
        ...report,
        friendlyName: makeFriendlyReportName(report),
        friendlyStatus: status,
        isRecent,
      };
    })
    .filter((report) => {
      if (patientFilter === "all") return true;
      if (patientFilter === "recent") return report.isRecent;
      return report.friendlyStatus === "Pending Review";
    });

  const toDoctorStatus = (report: ReportRow): "Reviewed" | "Pending Review" | "Needs Attention" => {
    if (report.status.toLowerCase().includes("reviewed")) return "Reviewed";
    const parsed = Date.parse(report.date);
    if (Number.isFinite(parsed) && Date.now() - parsed > 1000 * 60 * 60 * 24 * 7) {
      return "Needs Attention";
    }
    return "Pending Review";
  };

  const doctorReportCards = filteredReports.map((report) => ({
    ...report,
    workflowStatus: toDoctorStatus(report),
  }));

  const getPatientLastReportSummary = (patient: AssignedPatient) => {
    const latest = [...patient.reports]
      .map((item) => ({
        ...item,
        uploadedAtMs: item.uploadedAt ? new Date(item.uploadedAt).getTime() : 0,
      }))
      .sort((a, b) => b.uploadedAtMs - a.uploadedAtMs)[0];

    if (!latest) {
      return {
        lastReportDate: "No reports yet",
        lastReportStatus: "Pending Review" as "Reviewed" | "Pending Review" | "Needs Attention",
      };
    }

    const status = (latest.reviewStatus || "").toLowerCase().includes("reviewed")
      ? "Reviewed"
      : latest.uploadedAtMs > 0 && Date.now() - latest.uploadedAtMs > 1000 * 60 * 60 * 24 * 7
        ? "Needs Attention"
        : "Pending Review";

    const lastReportDate = latest.uploadedAtMs > 0
      ? new Date(latest.uploadedAtMs).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Unknown";

    return {
      lastReportDate,
      lastReportStatus: status,
    };
  };

  if (isPatient) {
    return (
      <div className="pb-8 patient-reports-root">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-[0_24px_50px_rgba(2,6,23,0.55)] backdrop-blur sm:p-6 lg:p-8 patient-reports-shell">
          <header className="space-y-2 patient-reports-header">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              My Health Reports
            </h1>
            <p className="max-w-2xl text-sm text-slate-400 sm:text-base">
              Keep all your medical records in one safe place so you can easily share updates with your care team.
            </p>
          </header>

          <section className="rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-4 shadow-[0_14px_35px_rgba(8,47,73,0.35)] backdrop-blur sm:p-5 patient-upload-card">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-100">Upload New Report</h2>
            <p className="mt-1 text-sm text-slate-400">
              Upload your prescriptions, test results, or reports
            </p>
          </div>

          <div className="grid gap-3">
            <label className="text-sm font-medium text-slate-200" htmlFor="patient-report-name">
              Report Name
            </label>
            <input
              id="patient-report-name"
              type="text"
              value={reportName}
              onChange={(event) => {
                setReportName(event.target.value);
                if (uploadMessage) setUploadMessage("");
              }}
              placeholder="Example: Blood Test - March 2026"
              disabled={uploading}
              className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none disabled:opacity-70"
            />

            <div
              role="button"
              tabIndex={0}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDraggingFile(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingFile(false);
                const file = event.dataTransfer.files?.[0];
                if (file) handleDroppedFile(file);
              }}
              onClick={() => patientFileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  patientFileInputRef.current?.click();
                }
              }}
              className={`rounded-2xl border-2 border-dashed p-4 text-center transition ${
                isDraggingFile
                  ? "border-cyan-300 bg-cyan-400/10"
                  : "border-slate-700 bg-slate-950/70 hover:border-cyan-600/70 hover:bg-slate-900"
              } patient-upload-dropzone`}
            >
              <p className="text-sm font-medium text-slate-200">
                Drag and drop a file here, or click to choose a file
              </p>
              <p className="mt-1 text-xs text-slate-500">
                PDF, JPG, PNG up to 10MB
              </p>
              {selectedFile ? (
                <p className="mt-2 truncate text-xs font-medium text-cyan-300">
                  Selected file: {selectedFile.name}
                </p>
              ) : null}
            </div>

            <input
              ref={patientFileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,image/*"
              disabled={uploading}
              onChange={handleFileSelected}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleFileUpload}
                disabled={uploading || !selectedFile}
                className="inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                style={{
                  background: uploading || !selectedFile
                    ? "rgb(51 65 85)"
                    : "linear-gradient(135deg, rgb(16 185 129), rgb(5 150 105))",
                  color: uploading || !selectedFile ? "rgb(148 163 184)" : "rgb(236 253 245)",
                }}
              >
                {uploading ? "Uploading..." : "Upload Report"}
              </button>
              <p className="text-xs text-slate-500">Your report stays private to you and your care team.</p>
            </div>

            {uploadMessage ? (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  uploadMessage.toLowerCase().includes("success")
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : uploadMessage.toLowerCase().includes("uploading")
                      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  {uploadMessage.toLowerCase().includes("uploading") ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
                  ) : uploadMessage.toLowerCase().includes("success") ? (
                    <span className="text-emerald-300">✓</span>
                  ) : null}
                  <span>{uploadMessage}</span>
                </div>
              </div>
            ) : null}
          </div>
          </section>

          <section className="flex flex-col gap-4 patient-reports-list-section">
            <div className="flex flex-wrap items-center gap-2 patient-report-filters">
              {[
                { key: "all", label: "All" },
                { key: "recent", label: "Recent" },
                { key: "pending", label: "Pending" },
              ].map((filter) => {
                const selected = patientFilter === filter.key;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setPatientFilter(filter.key as "all" | "recent" | "pending")}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition duration-200 ${
                      selected
                          ? "bg-cyan-300 text-slate-950 shadow-[0_0_0_1px_rgba(34,211,238,0.7)]"
                          : "border border-slate-700 bg-slate-900 text-slate-300 hover:-translate-y-0.5 hover:border-slate-500"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>

            {patientReports.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {patientReports.map((report) => (
                  <article
                    key={`${report.reportId || report.fileUrl || report.friendlyName}-${report.date}`}
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-[0_10px_26px_rgba(2,6,23,0.45)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(2,6,23,0.6)] patient-report-card"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          {getReportKind(report) === "pdf" ? (
                            <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">PDF</span>
                          ) : getReportKind(report) === "image" ? (
                            <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">IMG</span>
                          ) : (
                            <span className="rounded-md bg-slate-600/20 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">DOC</span>
                          )}
                          <h3 className="truncate text-base font-semibold text-slate-100" title={report.friendlyName}>
                            {report.friendlyName}
                          </h3>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Uploaded on {report.date}</p>
                        {report.fileName ? (
                          <p className="mt-1 truncate text-[11px] text-slate-500" title={report.fileName}>{report.fileName}</p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          report.friendlyStatus === "Pending Review"
                            ? "bg-amber-400/15 text-amber-300"
                            : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {report.friendlyStatus}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleViewReport(report);
                        }}
                        disabled={!report.fileUrl}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700 px-3 text-sm font-medium text-slate-200 transition hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportReport(report)}
                        disabled={!report.fileUrl}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-cyan-500/20 px-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        Download
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center patient-report-empty-state">
                <div className="mb-4 rounded-full border border-slate-700 bg-slate-800/80 p-3 text-cyan-300">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                </div>
                <p className="text-base font-medium text-slate-200">
                  No reports yet. Upload your first report to get started
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Add your first file and it will appear here for quick access.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  if (isDoctor) {
    const selectedSummary = selectedDoctorPatient
      ? getPatientLastReportSummary(selectedDoctorPatient)
      : null;

    return (
      <div className="space-y-6 pb-8">
        <div className="page-header">
          <div className="page-title">Doctor Reports Workflow</div>
          <div className="page-subtitle">Fast access to patient reports and review actions</div>
        </div>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 shadow-[0_12px_30px_rgba(2,6,23,0.45)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-300">Assigned Patients</h2>
            <span className="text-xs text-slate-400">{filteredAssignedPatients.length} patients</span>
          </div>

          <div className="relative mb-3">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={doctorPatientSearch}
              onChange={(event) => setDoctorPatientSearch(event.target.value)}
              placeholder="Search patients by name, age, or injury"
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 transition duration-200 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>

          <div className="grid gap-2">
            {filteredAssignedPatients.map((patient) => {
              const summary = getPatientLastReportSummary(patient);
              const isSelected = selectedPatientUid === patient.uid;
              return (
                <button
                  key={patient.uid}
                  type="button"
                  onClick={() => setSelectedPatientUid(patient.uid)}
                  className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-xl border p-3 text-left transition duration-200 ${
                    isSelected
                      ? "border-cyan-400/80 bg-gradient-to-r from-cyan-500/15 to-blue-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_10px_24px_rgba(14,116,144,0.2)]"
                      : "border-slate-700 bg-slate-950/60 hover:-translate-y-0.5 hover:border-slate-500 hover:shadow-[0_8px_18px_rgba(2,6,23,0.45)]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{patient.displayName}</p>
                    <p className="mt-0.5 text-xs text-slate-400">Age {patient.age} • {patient.injury}</p>
                    <p className="mt-1 text-xs text-slate-500">Last report: {summary.lastReportDate}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      summary.lastReportStatus === "Reviewed"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : summary.lastReportStatus === "Needs Attention"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {summary.lastReportStatus}
                  </span>
                </button>
              );
            })}
            {!filteredAssignedPatients.length ? (
              <p className="text-xs text-slate-400">No assigned patients found.</p>
            ) : null}
          </div>
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

        {selectedDoctorPatient ? (
          <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 shadow-[0_10px_28px_rgba(2,6,23,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{selectedDoctorPatient.displayName}</h3>
                <p className="text-sm text-slate-400">Age {selectedDoctorPatient.age} • Injury: {selectedDoctorPatient.injury}</p>
                <p className="text-xs text-slate-500">Last activity: {selectedSummary?.lastReportDate || "No activity yet"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/live")}
                  className="rounded-lg border border-cyan-400/60 bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-300"
                >
                  Start session
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/chat")}
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 transition duration-200 hover:bg-cyan-500/25"
                >
                  Chat with patient
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/doctor/${selectedDoctorPatient.uid}`)}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition duration-200 hover:border-slate-500"
                >
                  View profile
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {selectedDoctorPatient ? (
          <section className="space-y-3 border-t border-slate-700/80 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-300">Submitted Reports</h3>
              <button
                type="button"
                onClick={() => setSelectedPatientUid("")}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition duration-200 hover:border-slate-500"
              >
                Back to patients
              </button>
            </div>

            <div className="grid gap-3">
              {doctorReportCards.map((r, index) => {
                const menuKey = r.reportId || `${r.fileUrl || "row"}_${index}`;
                return (
                  <article
                    key={menuKey}
                    className={`relative rounded-2xl border p-4 shadow-[0_10px_22px_rgba(2,6,23,0.4)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(2,6,23,0.55)] ${
                      r.workflowStatus === "Needs Attention"
                        ? "border-rose-500/55 bg-gradient-to-br from-rose-500/10 to-slate-900/80 hover:shadow-[0_0_0_1px_rgba(244,63,94,0.35),0_16px_32px_rgba(2,6,23,0.55)]"
                        : r.workflowStatus === "Pending Review"
                          ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-slate-900/80 hover:border-amber-400/60"
                          : "border-emerald-500/35 bg-gradient-to-br from-emerald-500/8 to-slate-900/80 hover:border-emerald-400/55"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{r.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{r.date} • {r.pages} pages • {r.type}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          r.workflowStatus === "Reviewed"
                            ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                            : r.workflowStatus === "Needs Attention"
                              ? "border border-rose-500/45 bg-rose-500/20 text-rose-300"
                              : "border border-amber-500/45 bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {r.workflowStatus}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleViewReport(r);
                        }}
                        disabled={!r.fileUrl}
                        className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition duration-200 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        View Report
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportReport(r)}
                        disabled={!r.fileUrl}
                        className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition duration-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenDoctorMenuForReportId((current) => (current === menuKey ? "" : menuKey))
                        }
                        className="ml-auto rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 transition duration-200 hover:border-slate-500"
                        aria-label="Open report actions"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="5" cy="12" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="19" cy="12" r="2" />
                        </svg>
                      </button>
                    </div>

                    {openDoctorMenuForReportId === menuKey ? (
                      <div className="absolute right-4 top-[72px] z-20 min-w-[180px] rounded-xl border border-slate-700 bg-slate-950 p-1 shadow-[0_12px_24px_rgba(2,6,23,0.65)]">
                        <button
                          type="button"
                          onClick={() => {
                            void handleMarkReviewed(r);
                            setOpenDoctorMenuForReportId("");
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800"
                        >
                          Mark as reviewed
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleRemoveReportRecord(r);
                            setOpenDoctorMenuForReportId("");
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                        >
                          Remove report
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {!doctorReportCards.length ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 p-8 text-center">
                  <div className="mb-3 rounded-full border border-slate-700 bg-slate-800/80 p-3 text-slate-300">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-slate-200">No reports yet</p>
                  <p className="mt-1 text-xs text-slate-400">This patient has not uploaded reports yet.</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 text-sm text-slate-400">
            Select a patient to review reports.
          </div>
        )}
      </div>
    );
  }

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
