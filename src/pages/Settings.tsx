import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useTheme } from "../ThemeContext";
import { subscribeToAllPatientsLiveData } from "../services/realtimeDbService";
import { vitalsRanges } from "../services/recoveryMetrics";
import { bindDeviceToPatient, getDeviceBinding } from "../services/deviceBindingService";
import { db } from "../firebase";
import type { SessionUser } from "../types/auth";
import type { LiveDataMap } from "../types/sensor";
import packageJson from "../../package.json";

type SettingsProps = {
  session: SessionUser;
};

type PatientProfile = {
  uid: string;
  displayName?: string;
};

export default function Settings({ session }: SettingsProps) {
  const { theme, toggleTheme } = useTheme();
  const [liveData, setLiveData] = useState<LiveDataMap>({});
  const [lastSampleAt, setLastSampleAt] = useState("");
  const [sampleRate, setSampleRate] = useState(0);
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [deviceUid, setDeviceUid] = useState("");
  const [selectedPatientUid, setSelectedPatientUid] = useState(session.uid);
  const [currentBinding, setCurrentBinding] = useState<string | null>(null);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [bindingError, setBindingError] = useState("");
  const [bindingSuccess, setBindingSuccess] = useState("");
  const sessionStartRef = useRef(Date.now());
  const lastTimestampRef = useRef<string | null>(null);

  const isDoctor = session.role === "doctor";

  useEffect(() => {
    if (!isDoctor) {
      setPatients([{ uid: session.uid, displayName: session.displayName }]);
      setSelectedPatientUid(session.uid);
      return;
    }

    const unsubscribe = onSnapshot(collection(db, "patients"), (snapshot) => {
      const nextPatients = snapshot.docs
        .map((docItem) => docItem.data() as PatientProfile)
        .filter((item) => Boolean(item.uid));
      setPatients(nextPatients);
    });

    return unsubscribe;
  }, [isDoctor, session.displayName, session.uid]);

  useEffect(() => {
    if (!isDoctor) return;
    if (selectedPatientUid) {
      const exists = patients.some((patient) => patient.uid === selectedPatientUid);
      if (exists) return;
    }
    if (patients[0]?.uid) {
      setSelectedPatientUid(patients[0].uid);
    }
  }, [isDoctor, patients, selectedPatientUid]);

  useEffect(() => {
    const unsubscribe = subscribeToAllPatientsLiveData((incoming) => {
      setLiveData(incoming);
      const timestamps = Object.values(incoming)
        .map((sample) => sample?.timestamp)
        .filter((stamp): stamp is string => Boolean(stamp));
      const latest = timestamps.sort().slice(-1)[0];
      if (latest) {
        setLastSampleAt(latest);
        if (lastTimestampRef.current && lastTimestampRef.current !== latest) {
          const prev = new Date(lastTimestampRef.current).getTime();
          const next = new Date(latest).getTime();
          if (!Number.isNaN(prev) && !Number.isNaN(next) && next > prev) {
            const deltaSec = (next - prev) / 1000;
            const rate = Math.max(0.1, 1 / deltaSec);
            setSampleRate(Math.round(rate * 10) / 10);
          }
        }
        lastTimestampRef.current = latest;
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      setUptimeSeconds(
        Math.floor((Date.now() - sessionStartRef.current) / 1000),
      );
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const liveCount = Object.values(liveData).filter((sample) =>
    Boolean(sample?.timestamp),
  ).length;
  const isConnected = liveCount > 0;

  const formattedLastCalibration = useMemo(() => {
    if (!lastSampleAt) return "--";
    const date = new Date(lastSampleAt);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [lastSampleAt]);

  const storageUsedMb = useMemo(() => {
    if (typeof window === "undefined") return 0;
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? "";
      total += key.length + value.length;
    }
    return Math.round((total / 1024 / 1024) * 10) / 10;
  }, [lastSampleAt, liveCount]);

  const uptimeLabel = useMemo(() => {
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const mins = Math.floor((uptimeSeconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  }, [uptimeSeconds]);

  const handleCheckBinding = async () => {
    setBindingError("");
    setBindingSuccess("");
    const normalizedDeviceUid = deviceUid.trim();

    if (!normalizedDeviceUid) {
      setBindingError("Enter a device UID first.");
      return;
    }

    setBindingLoading(true);
    try {
      const binding = await getDeviceBinding(normalizedDeviceUid);
      setCurrentBinding(binding);
      setBindingSuccess(
        binding
          ? `Device is currently mapped to patient UID: ${binding}`
          : "No patient UID is currently mapped to this device.",
      );
    } catch (err) {
      setBindingError((err as Error).message || "Failed to fetch device binding.");
    } finally {
      setBindingLoading(false);
    }
  };

  const handleSaveBinding = async () => {
    setBindingError("");
    setBindingSuccess("");

    const normalizedDeviceUid = deviceUid.trim();
    if (!normalizedDeviceUid) {
      setBindingError("Device UID is required.");
      return;
    }

    const patientUid = isDoctor ? selectedPatientUid : session.uid;
    if (!patientUid) {
      setBindingError("Patient UID is required.");
      return;
    }

    setBindingLoading(true);
    try {
      await bindDeviceToPatient(normalizedDeviceUid, patientUid, session.uid);
      setCurrentBinding(patientUid);
      setBindingSuccess(`Device ${normalizedDeviceUid} mapped to patient UID ${patientUid}.`);
    } catch (err) {
      setBindingError((err as Error).message || "Failed to save device binding.");
    } finally {
      setBindingLoading(false);
    }
  };

  const sessionDefaults = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("motioncare:sessionDefaults");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as {
        lengthMinutes?: number;
        targetReps?: number;
        restSeconds?: number;
        autosaveSeconds?: number;
        firmwareVersion?: string;
      };
    } catch {
      return null;
    }
  }, []);

  const settingSections = [
    {
      title: "Device Configuration",
      icon: "⚙️",
      items: [
        {
          label: "ESP32 Module",
          value: isConnected ? "Connected" : "Disconnected",
          status: isConnected ? "ok" : "warn",
        },
        {
          label: "MPU6050 Sensor",
          value: isConnected ? `Active — ${sampleRate || 1}Hz` : "Idle",
          status: isConnected ? "ok" : "warn",
        },
        {
          label: "LM35 Temperature",
          value: isConnected ? `Active — ${sampleRate || 1}Hz` : "Idle",
          status: isConnected ? "ok" : "warn",
        },
        {
          label: "MAX30102 SpO₂",
          value: isConnected ? `Active — ${sampleRate || 1}Hz` : "Idle",
          status: isConnected ? "ok" : "warn",
        },
        {
          label: "BLE Signal",
          value: isConnected
            ? `-${45 + Math.min(liveCount * 2, 12)} dBm (Good)`
            : "--",
          status: isConnected ? "ok" : "warn",
        },
      ],
    },
    {
      title: "Alert Thresholds",
      icon: "🔔",
      items: [
        {
          label: "Heart Rate — High",
          value: `> ${vitalsRanges.heartRate.max} BPM`,
          status: "warn",
        },
        {
          label: "Heart Rate — Low",
          value: `< ${vitalsRanges.heartRate.min} BPM`,
          status: "warn",
        },
        {
          label: "SpO₂ — Low",
          value: `< ${vitalsRanges.spo2.min}%`,
          status: "crit",
        },
        {
          label: "Temperature — High",
          value: `> ${vitalsRanges.temperature.max}°C`,
          status: "warn",
        },
        { label: "Angle Deviation", value: "> 5° from target", status: "warn" },
      ],
    },
    {
      title: "Session Settings",
      icon: "⏱️",
      items: [
        {
          label: "Default Session Length",
          value: `${sessionDefaults?.lengthMinutes ?? 45} minutes`,
          status: "ok",
        },
        {
          label: "Target Repetitions",
          value: `${sessionDefaults?.targetReps ?? 30} per exercise`,
          status: "ok",
        },
        {
          label: "Rest Interval",
          value: `${sessionDefaults?.restSeconds ?? 60} seconds`,
          status: "ok",
        },
        {
          label: "Auto-Save Interval",
          value: `Every ${sessionDefaults?.autosaveSeconds ?? Math.max(20, Math.round(60 / Math.max(sampleRate || 1, 1)))} seconds`,
          status: "ok",
        },
      ],
    },
  ];

  return (
    <>
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-subtitle">
          System configuration and preferences
        </div>
      </div>

      {/* Theme Toggle Card */}
      <div className="section">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div
                className="card-title-icon"
                style={{ background: "rgba(251,191,36,.12)" }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </div>
              Appearance
            </div>
          </div>
          <div
            className="settings-appearance-row"
            style={{ padding: "12px 0" }}
          >
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>
                Theme Mode
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text)",
                  marginTop: "2px",
                }}
              >
                Switch between dark and light interface
              </div>
            </div>
            <button
              onClick={toggleTheme}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 20px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--color-text)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font)",
                transition: "all .2s",
              }}
            >
              {theme === "dark" ? "☀️ Switch to Light" : "🌙 Switch to Dark"}
            </button>
          </div>
        </div>
      </div>

      {/* Setting Sections */}
      {settingSections.map((section, si) => (
        <div key={si} className="section">
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <span style={{ fontSize: "18px" }}>{section.icon}</span>
                {section.title}
              </div>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              {section.items.map((item, ii) => (
                <div
                  key={ii}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 8px",
                    borderRadius: "8px",
                    transition: "background .15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--surface-2)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background:
                          item.status === "ok"
                            ? "var(--green)"
                            : item.status === "warn"
                              ? "var(--orange)"
                              : "var(--red)",
                        boxShadow: `0 0 6px ${item.status === "ok" ? "rgba(52,211,153,.4)" : item.status === "warn" ? "rgba(251,191,36,.4)" : "rgba(248,113,113,.4)"}`,
                      }}
                    ></div>
                    <span style={{ fontSize: "13.5px", fontWeight: 500 }}>
                      {item.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      fontFamily: "var(--mono)",
                      color:
                        item.status === "ok"
                          ? "var(--green)"
                          : item.status === "warn"
                            ? "var(--orange)"
                            : "var(--red)",
                    }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Device Binding */}
      <div className="section">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span style={{ fontSize: "18px" }}>🔗</span>
              Device to Patient Binding
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px", maxWidth: "760px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "var(--color-text)", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
                Device UID
              </div>
              <input
                value={deviceUid}
                onChange={(e) => setDeviceUid(e.target.value)}
                placeholder="Enter Firebase Auth UID of device"
                style={{
                  width: "100%",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--color-text)",
                  padding: "11px 12px",
                  fontFamily: "var(--mono)",
                  fontSize: "13px",
                }}
              />
            </div>

            {isDoctor ? (
              <div>
                <div style={{ fontSize: "12px", color: "var(--color-text)", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Patient UID
                </div>
                <select
                  value={selectedPatientUid}
                  onChange={(e) => setSelectedPatientUid(e.target.value)}
                  style={{
                    width: "100%",
                    borderRadius: "10px",
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    color: "var(--color-text)",
                    padding: "11px 12px",
                    fontSize: "13px",
                  }}
                >
                  <option value="">Select patient</option>
                  {patients.map((patient) => (
                    <option key={patient.uid} value={patient.uid}>
                      {(patient.displayName || "Unnamed patient") + " — " + patient.uid}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "var(--color-text)", background: "var(--surface-2)", border: "1px solid var(--border-light)", borderRadius: "10px", padding: "10px 12px" }}>
                Binding target UID: <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{session.uid}</span>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <button
                type="button"
                onClick={handleCheckBinding}
                disabled={bindingLoading}
                style={{
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--color-text)",
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {bindingLoading ? "Checking..." : "Check Mapping"}
              </button>
              <button
                type="button"
                onClick={handleSaveBinding}
                disabled={bindingLoading}
                style={{
                  borderRadius: "10px",
                  border: "1px solid rgba(52,211,153,.2)",
                  background: "rgba(52,211,153,.12)",
                  color: "var(--green)",
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {bindingLoading ? "Saving..." : "Save Mapping"}
              </button>
            </div>

            {currentBinding ? (
              <div style={{ fontSize: "13px", color: "var(--color-text)", fontFamily: "var(--mono)" }}>
                Current mapped patient UID: {currentBinding}
              </div>
            ) : null}

            {bindingError ? <div className="auth-error">{bindingError}</div> : null}
            {bindingSuccess ? <div className="auth-success">{bindingSuccess}</div> : null}
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="section">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span style={{ fontSize: "18px" }}>ℹ️</span>
              System Information
            </div>
          </div>
          <div className="system-info-grid">
            {[
              {
                label: "Firmware Version",
                value:
                  sessionDefaults?.firmwareVersion ??
                  (isConnected ? "ESP32 Live" : "Offline"),
              },
              { label: "App Version", value: `v${packageJson.version}` },
              { label: "Last Calibration", value: formattedLastCalibration },
              { label: "Data Storage", value: `${storageUsedMb} MB / 8192 MB` },
              { label: "Uptime", value: uptimeLabel },
              { label: "Cloud Sync", value: isConnected ? "Active" : "Idle" },
            ].map((info, i) => (
              <div
                key={i}
                style={{
                  padding: "12px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--color-text)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                  }}
                >
                  {info.label}
                </div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    marginTop: "4px",
                    fontFamily: "var(--mono)",
                  }}
                >
                  {info.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
