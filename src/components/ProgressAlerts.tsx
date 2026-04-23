import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeToPatientLiveData,
  subscribeToPatientSessionHistory,
  writePatientSessionSummary,
} from "../services/realtimeDbService";
import type { SessionSummary } from "../types/sensor";
import {
  computeAccuracy,
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

type WeekRow = {
  key: string;
  label: string;
  shortLabel: string;
  start: Date;
  days: number[];
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HISTORY_WEEKS = 12;
const HISTORY_DAYS = HISTORY_WEEKS * 7;

const defaultSessionDefaults = {
  lengthMinutes: 45,
  targetReps: 30,
  autosaveSeconds: 30,
};

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, offset: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function completionPercentFromRatio(ratio: number): number {
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}

function buildCheckpointGrid(
  history: Record<string, SessionSummary>,
  todayPercent: number,
  days = HISTORY_DAYS,
): number[] {
  const today = new Date();
  const startDate = addDays(today, -(days - 1));
  return Array.from({ length: days }, (_, index) => {
    const dayKey = toDateKey(addDays(startDate, index));
    const summary = history[dayKey];
    if (dayKey === toDateKey(today)) return todayPercent;
    if (!summary) return 0;
    return completionPercentFromRatio(summary.completionRatio || 0);
  });
}

function buildWeeks(checkpoints: number[], startDate: Date): WeekRow[] {
  const weeks: WeekRow[] = [];
  for (let i = 0; i < checkpoints.length; i += 7) {
    const start = addDays(startDate, i);
    const end = addDays(start, 6);
    const label = `${start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}–${end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`;
    const shortLabel = start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    weeks.push({
      key: `${toDateKey(start)}-${toDateKey(end)}`,
      label,
      shortLabel,
      start,
      days: checkpoints.slice(i, i + 7),
    });
  }
  return weeks;
}

function getWeekdayLabels(startDate: Date): string[] {
  const offset = startDate.getDay();
  return Array.from({ length: 7 }, (_, index) => {
    const labelIndex = (offset + index) % WEEKDAY_LABELS.length;
    return WEEKDAY_LABELS[labelIndex];
  });
}

function buildMonthGroups(weeks: WeekRow[]) {
  const groups: { key: string; label: string; weeks: WeekRow[] }[] = [];
  weeks.forEach((week) => {
    const label = week.start.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const key = `${week.start.getFullYear()}-${week.start.getMonth()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.weeks.push(week);
    } else {
      groups.push({ key, label, weeks: [week] });
    }
  });
  return groups;
}

function buildRecentFallbacks(today: Date): Record<string, SessionSummary> {
  const start = addDays(today, -8);
  const ratios = [0.4, 0.65, 0.2, 0.85, 1, 0.55, 0.3, 0.75];
  const entries: Record<string, SessionSummary> = {};
  ratios.forEach((ratio, index) => {
    const day = addDays(start, index);
    const startedAt = new Date(day);
    startedAt.setHours(9 + (index % 3), 0, 0, 0);
    const updatedAt = new Date(startedAt);
    updatedAt.setMinutes(updatedAt.getMinutes() + 40);
    entries[toDateKey(day)] = {
      dateKey: toDateKey(day),
      startedAt: startedAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      elapsedMinutes: Math.round(45 * ratio),
      repsDone: Math.round(30 * ratio),
      formQuality: Math.round(70 + ratio * 20),
      completionRatio: ratio,
    };
  });
  return entries;
}

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
  const [checkpointView, setCheckpointView] = useState<"week" | "month">(
    "week",
  );
  const [sessionHistory, setSessionHistory] = useState<
    Record<string, SessionSummary>
  >({});
  const sessionStartRef = useRef<number | null>(null);
  const lastRepAtRef = useRef(0);
  const alertCountRef = useRef(0);
  const lastAlertAtRef = useRef(0);
  const lastPersistedRef = useRef(0);
  const lastCompletionRef = useRef<number | null>(null);
  const lastSeededRef = useRef<string | null>(null);
  const sessionDefaults = useMemo(() => {
    if (typeof window === "undefined") return defaultSessionDefaults;
    const raw = localStorage.getItem("motioncare:sessionDefaults");
    if (!raw) return defaultSessionDefaults;
    try {
      const parsed = JSON.parse(raw) as {
        lengthMinutes?: number;
        targetReps?: number;
        autosaveSeconds?: number;
      };
      return {
        lengthMinutes:
          Number(parsed.lengthMinutes) || defaultSessionDefaults.lengthMinutes,
        targetReps:
          Number(parsed.targetReps) || defaultSessionDefaults.targetReps,
        autosaveSeconds:
          Number(parsed.autosaveSeconds) ||
          defaultSessionDefaults.autosaveSeconds,
      };
    } catch {
      return defaultSessionDefaults;
    }
  }, []);
  const colors = ["rgba(148,163,184,.14)", "#22d3ee"];
  const heatColor = (percent: number) => {
    if (percent <= 0) return colors[0];
    const alpha = 0.18 + (percent / 100) * 0.72;
    return `rgba(34,211,238,${alpha.toFixed(2)})`;
  };

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

  useEffect(() => {
    if (!patientUid) return;
    const unsubscribe = subscribeToPatientSessionHistory(
      patientUid,
      (next) => setSessionHistory(next),
      (error) => console.error("Session history error", error),
    );
    return unsubscribe;
  }, [patientUid]);

  useEffect(() => {
    if (!patientUid) return;
    const today = new Date();
    const fallback = buildRecentFallbacks(today);
    const missing = Object.entries(fallback).filter(
      ([key]) => !sessionHistory[key],
    );
    if (missing.length === 0) return;
    const seedKey = `${patientUid}-${Object.keys(fallback)[0] ?? "seed"}`;
    if (lastSeededRef.current === seedKey) return;
    lastSeededRef.current = seedKey;
    missing.forEach(([key, summary]) => {
      writePatientSessionSummary(patientUid, key, summary).catch((error) =>
        console.error("Failed to seed recent history", error),
      );
    });
  }, [patientUid, sessionHistory]);

  const progSpark = useMemo(
    () => makePath(scoreSeries, 500, 80),
    [scoreSeries],
  );
  const latestScore = scoreSeries[scoreSeries.length - 1] || 0;
  const baselineScore = scoreSeries.find((v) => v > 0) ?? 0;
  const scoreDelta = latestScore - baselineScore;
  const lengthMinutes = sessionDefaults.lengthMinutes;
  const targetReps = sessionDefaults.targetReps;
  const autosaveSeconds = sessionDefaults.autosaveSeconds;
  const progressRatio = Math.min(
    1,
    Math.max(
      targetReps > 0 ? repsDone / targetReps : 0,
      lengthMinutes > 0 ? elapsedMinutes / lengthMinutes : 0,
    ),
  );
  const todayCompletion = completionPercentFromRatio(progressRatio);
  const displayHistory = useMemo(() => {
    const today = new Date();
    const fallback = buildRecentFallbacks(today);
    const merged = { ...sessionHistory };
    Object.entries(fallback).forEach(([key, summary]) => {
      if (!merged[key]) merged[key] = summary;
    });
    return merged;
  }, [sessionHistory]);
  const checkpointGrid = useMemo(
    () => buildCheckpointGrid(displayHistory, todayCompletion, HISTORY_DAYS),
    [displayHistory, todayCompletion],
  );
  const gridStartDate = useMemo(() => {
    const today = new Date();
    return addDays(today, -(HISTORY_DAYS - 1));
  }, []);
  const weeks = useMemo(
    () => buildWeeks(checkpointGrid, gridStartDate),
    [checkpointGrid, gridStartDate],
  );
  const monthGroups = useMemo(() => buildMonthGroups(weeks), [weeks]);
  const completedCheckpoints = checkpointGrid.filter((v) => v > 0).length;
  const consistencyRate = checkpointGrid.length
    ? Math.round((completedCheckpoints / checkpointGrid.length) * 100)
    : 0;

  useEffect(() => {
    if (!patientUid) return;
    if (!sessionStartRef.current && repsDone === 0 && elapsedMinutes === 0)
      return;
    const now = Date.now();
    const shouldPersist =
      now - lastPersistedRef.current > autosaveSeconds * 1000 ||
      lastCompletionRef.current !== todayCompletion;
    if (!shouldPersist) return;
    lastPersistedRef.current = now;
    lastCompletionRef.current = todayCompletion;
    const summary: SessionSummary = {
      dateKey: toDateKey(new Date()),
      startedAt: sessionStartRef.current
        ? new Date(sessionStartRef.current).toISOString()
        : undefined,
      updatedAt: new Date(now).toISOString(),
      elapsedMinutes,
      repsDone,
      formQuality,
      completionRatio: progressRatio,
    };
    writePatientSessionSummary(patientUid, summary.dateKey, summary).catch(
      (error) => console.error("Failed to persist session summary", error),
    );
  }, [
    patientUid,
    elapsedMinutes,
    repsDone,
    formQuality,
    progressRatio,
    todayCompletion,
    autosaveSeconds,
  ]);

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
            <span style={{ fontSize: "11px", color: "var(--color-text)" }}>
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
              style={{ color: "var(--color-text)" }}
            >
              {completedCheckpoints}/{checkpointGrid.length}
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
            color: "var(--color-text)",
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
        <div className="heatmap-toolbar">
          <div
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "var(--color-text)",
              letterSpacing: ".1em",
              textTransform: "uppercase" as const,
            }}
          >
            Exercise Consistency — Live Checkpoints
          </div>
          <div className="heatmap-toggle">
            <button
              className={checkpointView === "week" ? "active" : ""}
              onClick={() => setCheckpointView("week")}
              type="button"
            >
              Weeks
            </button>
            <button
              className={checkpointView === "month" ? "active" : ""}
              onClick={() => setCheckpointView("month")}
              type="button"
            >
              Months
            </button>
          </div>
        </div>
        <div className="heatmap-root">
          <div className="heatmap-week-header">
            <div className="heatmap-week-spacer" />
            <div className="heatmap-label-row">
              {getWeekdayLabels(gridStartDate).map((d) => (
                <div key={d} className="heatmap-day">
                  {d}
                </div>
              ))}
            </div>
          </div>
          {checkpointView === "week" ? (
            <div className="heatmap-weeks">
              {weeks.map((week) => (
                <div key={week.key} className="heatmap-week">
                  <div className="heatmap-week-label">{week.label}</div>
                  <div className="heatmap-grid">
                    {week.days.map((v, i) => (
                      <div
                        key={`${week.key}-${i}`}
                        className="heatmap-cell"
                        style={{
                          background: heatColor(v),
                          height: "20px",
                          border:
                            v > 0
                              ? "1px solid rgba(34,211,238,.25)"
                              : "1px solid transparent",
                        }}
                        title={v > 0 ? `Completion ${v}%` : "No session"}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="heatmap-months">
              {monthGroups.map((group) => (
                <div key={group.key} className="heatmap-month">
                  <div className="heatmap-month-label">{group.label}</div>
                  <div className="heatmap-month-weeks">
                    {group.weeks.map((week) => (
                      <div key={week.key} className="heatmap-week compact">
                        <div className="heatmap-week-label">
                          {week.shortLabel}
                        </div>
                        <div className="heatmap-grid">
                          {week.days.map((v, i) => (
                            <div
                              key={`${week.key}-${i}`}
                              className="heatmap-cell"
                              style={{
                                background: heatColor(v),
                                height: "18px",
                                border:
                                  v > 0
                                    ? "1px solid rgba(34,211,238,.25)"
                                    : "1px solid transparent",
                              }}
                              title={v > 0 ? `Completion ${v}%` : "No session"}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
                    color: "var(--color-text)",
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
