import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeToPatientLiveData } from "../services/realtimeDbService";
import {
  computeAccuracy,
  computeConsistencyIntensity,
  computeFlexRange,
  computeRecoveryScore,
  computeGyroMagnitude,
  detectAlertCount,
  smoothValue,
  vitalsRanges,
} from "../services/recoveryMetrics";

type ProgressAlertsProps = {
  patientUid: string;
};

function makePath(data: number[], w: number, h: number, pad = 4) {
  const min = Math.min(...data) - 2;
  const max = Math.max(...data) + 2;
  const xStep = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => [
    pad + i * xStep,
    h - pad - ((v - min) / (max - min)) * (h - pad * 2),
  ]);
  const d = pts
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
  const area =
    d + ` L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
  return { d, area };
}

export default function ProgressAlerts({ patientUid }: ProgressAlertsProps) {
  const [scoreSeries, setScoreSeries] = useState<number[]>(() =>
    Array.from({ length: 30 }, () => 0),
  );
  const [accuracy, setAccuracy] = useState(0);
  const [flexRange, setFlexRange] = useState(0);
  const [alertsToday, setAlertsToday] = useState(0);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [repsDone, setRepsDone] = useState(0);
  const [formQuality, setFormQuality] = useState(0);
  const [lastSampleAt, setLastSampleAt] = useState("");
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [spo2, setSpo2] = useState<number | null>(null);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [gyroMagnitude, setGyroMagnitude] = useState(0);
  const [consistency, setConsistency] = useState<number[]>(() =>
    Array.from({ length: 28 }, () => 0),
  );
  const sessionStartRef = useRef<number | null>(null);
  const lastRepAtRef = useRef(0);
  const alertCountRef = useRef(0);
  const lastAlertAtRef = useRef(0);
  const colors = [
    "rgba(148,163,184,.08)",
    "rgba(96,165,250,.2)",
    "rgba(56,189,248,.35)",
    "rgba(34,211,238,.6)",
  ];

  useEffect(() => {
    if (!patientUid) return;
    const unsubscribe = subscribeToPatientLiveData(patientUid, (sample) => {
      if (!sample) return;
      setLastSampleAt(sample.timestamp);
      const now = Date.now();
      if (!sessionStartRef.current) {
        sessionStartRef.current = now;
      }
      setElapsedMinutes(
        sessionStartRef.current
          ? Math.floor((now - sessionStartRef.current) / 60000)
          : 0,
      );
      const nextScore = computeRecoveryScore(sample);
      const nextAccuracy = computeAccuracy(sample);
      const nextFlex = computeFlexRange(sample);
      const nextIntensity = computeConsistencyIntensity(sample);
      const nextGyroMagnitude = computeGyroMagnitude(sample);
      setGyroMagnitude(nextGyroMagnitude);
      setHeartRate(sample.heart_rate);
      setSpo2(sample.spo2);
      setTemperature(sample.temperature);

      setScoreSeries((prev) => [...prev.slice(1), nextScore]);
      setAccuracy((prev) =>
        smoothValue(prev || nextAccuracy, nextAccuracy, 0.25),
      );
      setFormQuality((prev) =>
        smoothValue(prev || nextAccuracy, nextAccuracy, 0.2),
      );
      setFlexRange((prev) => Math.max(prev, nextFlex));
      setConsistency((prev) => [...prev.slice(1), nextIntensity]);

      if (nextGyroMagnitude > 70 && now - lastRepAtRef.current > 1800) {
        setRepsDone((prev) => prev + 1);
        lastRepAtRef.current = now;
      }

      const newAlerts = detectAlertCount(sample);
      if (newAlerts > 0 && now - lastAlertAtRef.current > 60000) {
        alertCountRef.current += newAlerts;
        setAlertsToday(alertCountRef.current);
        lastAlertAtRef.current = now;
      }
    });
    return unsubscribe;
  }, [patientUid]);

  const progSpark = useMemo(
    () => makePath(scoreSeries, 500, 80),
    [scoreSeries],
  );
  const latestScore = scoreSeries[scoreSeries.length - 1] || 0;
  const baselineScore = scoreSeries.find((v) => v > 0) ?? 0;
  const scoreDelta = latestScore - baselineScore;
  const consistencyRate = useMemo(() => {
    const completed = consistency.filter((v) => v > 0).length;
    return Math.round((completed / consistency.length) * 100);
  }, [consistency]);

  const alertTime = useMemo(() => {
    if (!lastSampleAt) return "--:--";
    const date = new Date(lastSampleAt);
    if (Number.isNaN(date.getTime())) return lastSampleAt;
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [lastSampleAt]);

  const currentSets = Math.floor(repsDone / 6);
  const targetFlex = 45;
  const movementOk = flexRange >= targetFlex - 3;
  const heartRateOk =
    heartRate !== null &&
    heartRate >= vitalsRanges.heartRate.min &&
    heartRate <= vitalsRanges.heartRate.max;
  const spo2Ok = spo2 !== null && spo2 >= vitalsRanges.spo2.min;
  const tempOk =
    temperature !== null &&
    temperature >= vitalsRanges.temperature.min &&
    temperature <= vitalsRanges.temperature.max;
  const movementLabel = movementOk ? "Movement Regular" : "Range Below Target";

  const statCardStyle = () => ({
    textAlign: "center" as const,
    padding: "16px",
    background: "var(--surface-2)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    transition: "all .25s",
  });

  return (
    <div className="section grid-main" style={{ alignItems: "start" }}>
      {/* Recovery Progress */}
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
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
            Recovery Progress
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span className="mini-tag tag-new">
              {scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta} pts
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Live session trend
            </span>
          </div>
        </div>

        <div className="progress-stats">
          <div className="progress-stat-card">
            <div className="progress-stat-val" style={{ color: "var(--teal)" }}>
              {latestScore || "--"}
            </div>
            <div className="progress-stat-label">Recovery Score</div>
            <div className="progress-stat-change up">
              {scoreDelta >= 0 ? "↑" : "↓"} {Math.abs(scoreDelta)} pts
            </div>
          </div>
          <div className="progress-stat-card">
            <div
              className="progress-stat-val"
              style={{ color: "var(--green)" }}
            >
              {accuracy ? `${accuracy}%` : "--"}
            </div>
            <div className="progress-stat-label">Movement Accuracy</div>
            <div className="progress-stat-change up">Live sensor feedback</div>
          </div>
          <div className="progress-stat-card">
            <div
              className="progress-stat-val"
              style={{ color: "var(--text-primary)" }}
            >
              {consistency.filter((v) => v > 0).length}/28
            </div>
            <div className="progress-stat-label">Session Consistency</div>
            <div className="progress-stat-change up">
              {consistencyRate}% attendance
            </div>
          </div>
          <div className="progress-stat-card">
            <div className="progress-stat-val" style={{ color: "var(--blue)" }}>
              {flexRange ? `${flexRange}°` : "--"}
            </div>
            <div className="progress-stat-label">Max Flexion Range</div>
            <div className="progress-stat-change up">
              Peak during live session
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: "11px",
            fontWeight: 800,
            color: "var(--text-muted)",
            letterSpacing: ".1em",
            textTransform: "uppercase" as const,
            marginBottom: "10px",
          }}
        >
          Recovery Score — Live Trend
        </div>
        <svg
          width="100%"
          height="80"
          viewBox="0 0 500 80"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="progGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity=".25" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path fill="url(#progGrad)" d={progSpark.area} />
          <path
            fill="none"
            stroke="#60a5fa"
            strokeWidth="2.5"
            strokeLinecap="round"
            d={progSpark.d}
            style={{ filter: "drop-shadow(0 0 8px rgba(96,165,250,.4))" }}
          />
        </svg>

        <div className="divider"></div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 800,
            color: "var(--text-muted)",
            letterSpacing: ".1em",
            textTransform: "uppercase" as const,
            marginBottom: "8px",
          }}
        >
          Exercise Consistency — Live Checkpoints
        </div>
        <div className="heatmap-label-row">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="heatmap-day">
              {d}
            </div>
          ))}
        </div>
        <div className="heatmap-grid">
          {consistency.map((v, i) => (
            <div
              key={i}
              className="heatmap-cell"
              style={{
                background: colors[v],
                height: "24px",
                border:
                  v > 0
                    ? "1px solid rgba(34,211,238,.1)"
                    : "1px solid transparent",
              }}
              title={
                v === 0
                  ? "No session"
                  : v === 1
                    ? "Partial"
                    : v === 2
                      ? "Good"
                      : "Excellent"
              }
            />
          ))}
        </div>
      </div>

      {/* Alerts */}
      <div className="stack-column">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div
                className="card-title-icon"
                style={{ background: "rgba(248,113,113,.12)" }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              Safety Alerts
            </div>
            <span
              className="mini-tag"
              style={{
                background: "rgba(248,113,113,.12)",
                color: "var(--red)",
                border: "1px solid rgba(248,113,113,.2)",
              }}
            >
              {alertsToday} Today
            </span>
          </div>

          <div
            className={`alert-item ${heartRateOk ? "alert-ok" : "alert-warn"}`}
          >
            <div className="alert-dot"></div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={heartRateOk ? "#34d399" : "#fbbf24"}
              strokeWidth="2.5"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <div className="alert-label">
              {heartRateOk ? "Heart Rate Normal" : "Heart Rate Out of Range"}
            </div>
            <span
              className="alert-val"
              style={{ color: heartRateOk ? "var(--green)" : "var(--orange)" }}
            >
              {heartRate !== null ? `${heartRate} BPM` : "--"}
            </span>
            <span className="alert-time">{alertTime}</span>
          </div>
          <div className={`alert-item ${spo2Ok ? "alert-ok" : "alert-warn"}`}>
            <div className="alert-dot"></div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={spo2Ok ? "#34d399" : "#fbbf24"}
              strokeWidth="2.5"
            >
              <path d="M12 2v20M2 7h5M17 7h5M2 17h5M17 17h5" />
            </svg>
            <div className="alert-label">
              {spo2Ok ? "SpO₂ Optimal" : "SpO₂ Low"}
            </div>
            <span
              className="alert-val"
              style={{ color: spo2Ok ? "var(--green)" : "var(--orange)" }}
            >
              {spo2 !== null ? `${spo2}%` : "--"}
            </span>
            <span className="alert-time">{alertTime}</span>
          </div>
          <div
            className={`alert-item ${movementOk ? "alert-ok" : "alert-warn"}`}
          >
            <div className="alert-dot"></div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={movementOk ? "#34d399" : "#fbbf24"}
              strokeWidth="2.5"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="alert-label">{movementLabel}</div>
            <span
              className="alert-val"
              style={{ color: movementOk ? "var(--green)" : "var(--orange)" }}
            >
              {flexRange ? `${flexRange}° / ${targetFlex}°` : "--"}
            </span>
            <span className="alert-time">{alertTime}</span>
          </div>
          <div className={`alert-item ${tempOk ? "alert-ok" : "alert-warn"}`}>
            <div className="alert-dot"></div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={tempOk ? "#34d399" : "#fbbf24"}
              strokeWidth="2.5"
            >
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
            </svg>
            <div className="alert-label">
              {tempOk ? "Temp Normal" : "Temp Outside Range"}
            </div>
            <span
              className="alert-val"
              style={{ color: tempOk ? "var(--green)" : "var(--orange)" }}
            >
              {temperature !== null ? `${temperature.toFixed(1)}°C` : "--"}
            </span>
            <span className="alert-time">{alertTime}</span>
          </div>
          <div
            className={`alert-item ${gyroMagnitude < 120 ? "alert-ok" : "alert-warn"}`}
          >
            <div className="alert-dot"></div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={gyroMagnitude < 120 ? "#34d399" : "#fbbf24"}
              strokeWidth="2.5"
            >
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
            </svg>
            <div className="alert-label">
              {gyroMagnitude < 120 ? "Motion Stable" : "Motion Spike"}
            </div>
            <span
              className="alert-val"
              style={{
                color: gyroMagnitude < 120 ? "var(--green)" : "var(--orange)",
              }}
            >
              {gyroMagnitude ? `${gyroMagnitude.toFixed(1)} rad/s` : "--"}
            </span>
            <span className="alert-time">{alertTime}</span>
          </div>
        </div>

        {/* Session Summary */}
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
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              Today's Session
            </div>
          </div>
          <div className="session-summary-grid">
            {[
              {
                val: elapsedMinutes ? String(elapsedMinutes) : "--",
                label: "Min Elapsed",
                color: "var(--purple)",
              },
              {
                val: repsDone ? String(repsDone) : "--",
                label: "Reps Done",
                color: "var(--teal)",
              },
              {
                val: currentSets ? String(currentSets) : "--",
                label: "Sets Complete",
                color: "var(--green)",
              },
              {
                val: formQuality ? `${formQuality}%` : "--",
                label: "Form Quality",
                color: "var(--blue)",
              },
            ].map((item, i) => (
              <div key={i} style={statCardStyle()}>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 900,
                    color: item.color,
                    letterSpacing: "-1px",
                  }}
                >
                  {item.val}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    marginTop: "3px",
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
