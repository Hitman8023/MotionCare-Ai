import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../ThemeContext";
import { subscribeToAllPatientsLiveData } from "../services/realtimeDbService";
import { vitalsRanges } from "../services/recoveryMetrics";
import type { LiveDataMap } from "../types/sensor";
import packageJson from "../../package.json";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const [liveData, setLiveData] = useState<LiveDataMap>({});
  const [lastSampleAt, setLastSampleAt] = useState("");
  const [sampleRate, setSampleRate] = useState(0);
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const sessionStartRef = useRef(Date.now());
  const lastTimestampRef = useRef<string | null>(null);

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
                  color: "var(--text-muted)",
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
                color: "var(--text-primary)",
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
                    color: "var(--text-muted)",
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
