import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { subscribeToPatientLiveData } from "../services/realtimeDbService";
import {
  computeAccuracy,
  computeFlexRange,
  computeRecoveryScore,
  detectAlertCount,
  formatTimestampLabel,
  smoothValue,
} from "../services/recoveryMetrics";

type PatientOverviewProps = {
  patientUid: string;
  displayName: string;
};

type PatientProfile = {
  displayName?: string;
  age?: number;
  surgery?: string;
  stage?: string;
  therapist?: string;
  lastSession?: string;
  sessionsDone?: number;
};

export default function PatientOverview({
  patientUid,
  displayName,
}: PatientOverviewProps) {
  const [profile, setProfile] = useState<PatientProfile>({});
  const [score, setScore] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [flexRange, setFlexRange] = useState(0);
  const [alertsToday, setAlertsToday] = useState(0);
  const [lastSampleAt, setLastSampleAt] = useState<string>("");

  const sessionStartRef = useRef<number | null>(null);
  const alertCountRef = useRef(0);
  const lastAlertAtRef = useRef(0);

  useEffect(() => {
    if (!patientUid) return;
    const q = query(collection(db, "patients"), where("uid", "==", patientUid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setProfile({});
        return;
      }
      const data = snapshot.docs[0].data() as PatientProfile;
      setProfile(data);
    });
    return unsubscribe;
  }, [patientUid]);

  useEffect(() => {
    if (!patientUid) return;
    const unsubscribe = subscribeToPatientLiveData(patientUid, (sample) => {
      if (!sample) return;
      setLastSampleAt(sample.timestamp);
      const nextScore = computeRecoveryScore(sample);
      const nextAccuracy = computeAccuracy(sample);
      const nextFlex = computeFlexRange(sample);

      setScore((prev) => smoothValue(prev || nextScore, nextScore, 0.2));
      setAccuracy((prev) =>
        smoothValue(prev || nextAccuracy, nextAccuracy, 0.25),
      );
      setFlexRange((prev) => Math.max(prev, nextFlex));

      const now = Date.now();
      const alerts = detectAlertCount(sample);
      if (alerts > 0 && now - lastAlertAtRef.current > 60_000) {
        alertCountRef.current += alerts;
        lastAlertAtRef.current = now;
        setAlertsToday(alertCountRef.current);
      }

      if (!sessionStartRef.current) {
        sessionStartRef.current = now;
      }
    });

    return unsubscribe;
  }, [patientUid]);

  const derivedStage = useMemo(() => {
    if (score >= 85) return "Week 6 — Strengthening";
    if (score >= 70) return "Week 4 — Active Rehab";
    if (score > 0) return "Week 2 — Passive ROM";
    return "Awaiting intake";
  }, [score]);

  const elapsedMinutes = sessionStartRef.current
    ? Math.floor((Date.now() - sessionStartRef.current) / 60000)
    : 0;
  const sessionsDone =
    profile.sessionsDone ?? Math.max(0, Math.floor(elapsedMinutes / 45));

  const patientName = profile.displayName || displayName || "Patient";
  const patientInitials = patientName
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const stageLabel = profile.stage || derivedStage;
  const lastSessionLabel =
    profile.lastSession || formatTimestampLabel(lastSampleAt);

  const dashOffset = (1 - score / 100) * 220;

  return (
    <div className="section">
      <div className="card">
        <div className="patient-overview">
          <div className="patient-info-left">
            <div className="patient-big-avatar">{patientInitials}</div>
            <div>
              <div className="patient-name">{patientName}</div>
              <div className="patient-meta">
                <span className="patient-meta-item">
                  <strong>Age:</strong>{" "}
                  {profile.age ? `${profile.age} yrs` : "--"}
                </span>
                <span className="patient-meta-item">
                  <strong>Surgery:</strong>{" "}
                  {profile.surgery || "Pending intake"}
                </span>
                <span className="patient-meta-item">
                  <strong>Stage:</strong>
                  <span
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(34,211,238,.15), rgba(139,92,246,.1))",
                      color: "#22d3ee",
                      padding: "2px 10px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      border: "1px solid rgba(34,211,238,.2)",
                    }}
                  >
                    {stageLabel}
                  </span>
                </span>
                <span className="patient-meta-item">
                  <strong>Last Session:</strong> {lastSessionLabel}
                </span>
                <span className="patient-meta-item">
                  <strong>Therapist:</strong>{" "}
                  {profile.therapist || "Assigned on intake"}
                </span>
              </div>
            </div>
          </div>

          <div className="patient-stats">
            <div className="patient-stat">
              <div
                className="patient-stat-val"
                style={{ color: "var(--teal)" }}
              >
                {Number.isFinite(sessionsDone) ? sessionsDone : "--"}
              </div>
              <div className="patient-stat-label">Sessions Done</div>
            </div>
            <div className="patient-stat">
              <div
                className="patient-stat-val"
                style={{ color: "var(--green)" }}
              >
                {accuracy ? `${accuracy}%` : "--"}
              </div>
              <div className="patient-stat-label">Accuracy</div>
            </div>
            <div className="patient-stat">
              <div
                className="patient-stat-val"
                style={{ color: "var(--blue)" }}
              >
                {flexRange ? `${flexRange}°` : "--"}
              </div>
              <div className="patient-stat-label">Flex Range</div>
            </div>
            <div className="patient-stat">
              <div
                className="patient-stat-val"
                style={{ color: "var(--orange)" }}
              >
                {alertsToday || 0}
              </div>
              <div className="patient-stat-label">Alerts Today</div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <div className="recovery-circle-wrap">
              <svg viewBox="0 0 100 100">
                <defs>
                  <linearGradient
                    id="scoreGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <circle
                  className="recovery-circle-track"
                  cx="50"
                  cy="50"
                  r="35"
                />
                <circle
                  className="recovery-circle-fill"
                  cx="50"
                  cy="50"
                  r="35"
                  style={{ strokeDashoffset: dashOffset }}
                />
              </svg>
              <div className="recovery-circle-text">
                <div className="val">{score || "--"}</div>
                <div className="lbl">Score</div>
              </div>
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontWeight: 700,
                letterSpacing: ".04em",
              }}
            >
              Recovery Score
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
