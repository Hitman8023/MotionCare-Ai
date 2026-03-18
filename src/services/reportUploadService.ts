import { auth, db } from "../firebase";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";

const CLOUDINARY_BASE_UPLOAD_URL = "https://api.cloudinary.com/v1_1/dksdvvjjv";
const CLOUDINARY_UPLOAD_PRESET = "motioncare_upload";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);

type CloudinaryUploadResponse = {
  secure_url?: string;
  error?: {
    message?: string;
  };
};

export type CachedReportRecord = {
  userId: string;
  reportName: string;
  fileName: string;
  fileUrl: string;
  uploadedAtMs: number;
};

const CACHE_KEY_PREFIX = "motioncare:reports:";

export type UploadMedicalReportResult =
  | {
      success: true;
      data: {
        userId: string;
        reportName: string;
        fileName: string;
        mimeType: string;
        fileUrl: string;
      };
    }
  | {
      success: false;
      error: string;
    };

function getCurrentUserId(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("You must be logged in to upload reports.");
  }
  return uid;
}

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return fileName.slice(dotIndex).toLowerCase();
}

function getCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

function readCachedReports(userId: string): CachedReportRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getCacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedReportRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      Boolean(item?.fileUrl && item?.reportName && item?.fileName),
    );
  } catch {
    return [];
  }
}

function writeCachedReports(userId: string, rows: CachedReportRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getCacheKey(userId), JSON.stringify(rows));
}

export function getCachedReportsForUser(userId: string): CachedReportRecord[] {
  return readCachedReports(userId)
    .sort((a, b) => b.uploadedAtMs - a.uploadedAtMs);
}

export function cacheUploadedReportLocally(input: {
  userId: string;
  reportName: string;
  fileName: string;
  fileUrl: string;
  uploadedAtMs?: number;
}): void {
  const current = readCachedReports(input.userId);
  const nextRow: CachedReportRecord = {
    userId: input.userId,
    reportName: input.reportName,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    uploadedAtMs: input.uploadedAtMs ?? Date.now(),
  };

  const merged = [nextRow, ...current].filter(
    (item, index, arr) =>
      arr.findIndex((candidate) => candidate.fileUrl === item.fileUrl) === index,
  );

  writeCachedReports(input.userId, merged.slice(0, 100));
}

export function removeCachedReportForUser(userId: string, fileUrl?: string): void {
  if (!fileUrl) return;
  const current = readCachedReports(userId);
  const next = current.filter((row) => row.fileUrl !== fileUrl);
  writeCachedReports(userId, next);
}

export function validateMedicalReportFile(file: File): { valid: true } | { valid: false; error: string } {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Selected file is empty." };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { valid: false, error: "File is too large. Max size is 10MB." };
  }

  const extension = getFileExtension(file.name);
  const mimeAllowed = ALLOWED_MIME_TYPES.has(file.type);
  const extensionAllowed = ALLOWED_EXTENSIONS.has(extension);

  if (!mimeAllowed && !extensionAllowed) {
    return { valid: false, error: "Only PDF, JPG, and PNG files are allowed." };
  }

  return { valid: true };
}

export async function uploadReportToCloudinary(file: File, userId: string): Promise<string> {
  const uploadUrl = `${CLOUDINARY_BASE_UPLOAD_URL}/auto/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", `reports/${userId}`);

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as CloudinaryUploadResponse;

  if (!response.ok) {
    const cloudinaryError = payload?.error?.message;
    throw new Error(cloudinaryError || "Cloudinary upload failed.");
  }

  if (!payload.secure_url) {
    throw new Error("Cloudinary did not return a secure file URL.");
  }

  return payload.secure_url;
}

export async function saveReportRecord(input: {
  patientDocId: string;
  userId: string;
  reportName: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
}): Promise<void> {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await updateDoc(doc(db, "patients", input.patientDocId), {
    reports: arrayUnion({
      reportId,
      userId: input.userId,
      reportName: input.reportName,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileUrl: input.fileUrl,
      uploadedAt: new Date().toISOString(),
      reviewStatus: "Pending Review",
    }),
  });
}

export async function uploadMedicalReport(
  file: File,
  reportName: string,
  patientDocId: string,
): Promise<UploadMedicalReportResult> {
  try {
    const userId = getCurrentUserId();
    const normalizedReportName = reportName.trim();

    if (!normalizedReportName) {
      return {
        success: false,
        error: "Please enter a report name.",
      };
    }

    const validation = validateMedicalReportFile(file);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    const fileUrl = await uploadReportToCloudinary(file, userId);

    await saveReportRecord({
      patientDocId,
      userId,
      reportName: normalizedReportName,
      fileName: file.name,
      mimeType: file.type,
      fileUrl,
    });

    cacheUploadedReportLocally({
      userId,
      reportName: normalizedReportName,
      fileName: file.name,
      fileUrl,
    });

    return {
      success: true,
      data: {
        userId,
        reportName: normalizedReportName,
        fileName: file.name,
        mimeType: file.type,
        fileUrl,
      },
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unable to upload report right now.";

    return {
      success: false,
      error: message,
    };
  }
}
