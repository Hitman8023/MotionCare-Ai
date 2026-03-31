import { useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../firebase";
import { getDoctorEstimation } from "../services/estimationService";
import type { DoctorEstimation } from "../types/estimation";

type InsightSeverity = "info" | "success" | "warn";

type InsightItem = {
  severity: InsightSeverity;
  title: string;
  desc: string;
  time: string;
  confidence: number;
};

type PredictionCard = {
  label: string;
  value: string;
  confidence: number;
  tone: "doctor" | "system" | "alignment";
  note: string;
};

export default function AIInsights() {
  const [doctorEstimation, setDoctorEstimation] = useState<DoctorEstimation | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEstimation = async () => {
    try {
      const user = auth.currentUser;
      console.log("👤 Current user:", user?.uid);
      
      if (!user) {
        console.log("❌ No current user");
        return;
      }

      // Query patient document by uid field
      console.log("📄 Querying patient documents where uid ==", user.uid);
      const q = query(collection(db, "patients"), where("uid", "==", user.uid));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.log("❌ Patient document not found");
        return;
      }

      const patientData = snapshot.docs[0].data();
      const assignedDoctorId = patientData.assignedDoctorId;

      console.log("✅ Patient data found:", patientData);
      console.log("👨‍⚕️ Assigned Doctor ID:", assignedDoctorId);

      if (!assignedDoctorId) {
        console.log("⚠️ No doctor assigned yet");
        return;
      }

      // Fetch doctor's estimation
      const estimation = await getDoctorEstimation(user.uid, assignedDoctorId);
      console.log("📊 Fetched estimation:", estimation);
      
      if (estimation) {
        setDoctorEstimation(estimation);
      } else {
        console.log("⚠️ No estimation found for this patient-doctor pair");
      }
    } catch (error) {
      console.error("❌ Error fetching doctor estimation:", error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEstimation();
    
    // Set up a listener to re-fetch estimation every 5 seconds
    const interval = setInterval(fetchEstimation, 5000);
    return () => clearInterval(interval);
  }, []);

  // Get system estimation (mock for now - in real app this would come from ML model)
  const getSystemEstimation = () => {
    return {
      min: 16,
      max: 18,
      confidence: 72,
    };
  };
  const insights: InsightItem[] = [
    {
      severity: "info",
      title: "Flexion Progress Trending Upward",
      desc: "Wrist flexion has improved by 12° over the past 4 weeks. At this rate, the patient will reach the 45° target within 2 weeks.",
      time: "12:45 PM",
      confidence: 94,
    },
    {
      severity: "success",
      title: "Exercise Form Consistently Good",
      desc: "Movement accuracy has stayed above 80% for 8 consecutive sessions. The patient has developed proper motor patterns for the prescribed exercises.",
      time: "12:40 PM",
      confidence: 91,
    },
    {
      severity: "warn",
      title: "Compensatory Movement Detected",
      desc: "Slight shoulder elevation during wrist flexion exercises was detected in 3 of the last 10 repetitions. Cueing for scapular depression recommended.",
      time: "12:35 PM",
      confidence: 87,
    },
    {
      severity: "info",
      title: "Recovery Pace Above Average",
      desc: "Compared to similar flexor tendon repair cases, this patient is recovering 15% faster than the median timeline. Excellent compliance.",
      time: "12:30 PM",
      confidence: 89,
    },
    {
      severity: "warn",
      title: "Fatigue Pattern Emerging",
      desc: "Movement amplitude decreases by 8° during the final 5 repetitions of each set. Consider reducing set length or adding rest intervals.",
      time: "12:25 PM",
      confidence: 82,
    },
    {
      severity: "success",
      title: "Pain-Free Range Expanding",
      desc: "Patient-reported pain levels have decreased from 4/10 to 2/10 over the past week. The pain-free ROM has expanded by 8°.",
      time: "12:20 PM",
      confidence: 96,
    },
  ];

  const systemEst = getSystemEstimation();

  const modelAlignment = useMemo(() => {
    if (!doctorEstimation) {
      return null;
    }

    const doctorMid = (doctorEstimation.minWeeks + doctorEstimation.maxWeeks) / 2;
    const systemMid = (systemEst.min + systemEst.max) / 2;
    const weekGap = Math.abs(doctorMid - systemMid);
    return clamp(100 - weekGap * 10, 40, 99);
  }, [doctorEstimation, systemEst.max, systemEst.min]);

  const predictions: PredictionCard[] = [
    {
      label: "Doctor Forecast",
      value: doctorEstimation
        ? `Week ${doctorEstimation.minWeeks}-${doctorEstimation.maxWeeks}`
        : "Pending review",
      confidence: doctorEstimation?.confidence ?? 0,
      tone: "doctor",
      note: doctorEstimation
        ? `Updated ${new Date(doctorEstimation.updatedAt).toLocaleDateString()}`
        : "Waiting for clinician input",
    },
    {
      label: "System Forecast",
      value: `Week ${systemEst.min}-${systemEst.max}`,
      confidence: systemEst.confidence,
      tone: "system",
      note: "Derived from movement and vitals patterns",
    },
    {
      label: "Model Alignment",
      value: modelAlignment !== null ? `${modelAlignment}%` : "Pending",
      confidence: modelAlignment ?? 0,
      tone: "alignment",
      note: modelAlignment !== null
        ? "Agreement between physician and model"
        : "Available once doctor submits estimate",
    },
  ];

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEstimation();
  };

  return (
    <div className="aii-page">
      <div className="page-header aii-hero">
        <div className="aii-hero-content">
          <div className="page-title">AI Insights</div>
          <div className="page-subtitle">
            Precision recovery intelligence from clinician input and live movement analytics
          </div>
          <div className="aii-chip-row">
            <span className="aii-chip aii-chip-live">Live inference stream</span>
            <span className="aii-chip">Updated every 5 seconds</span>
            <span className="aii-chip">Date: {new Date().toLocaleDateString()}</span>
          </div>
        </div>
        <button className="aii-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          {refreshing ? "Refreshing" : "Refresh Data"}
        </button>
      </div>

      <div className="section stats-grid-3 aii-predictions">
        {predictions.map((prediction, index) => (
          <article key={prediction.label} className={`card aii-pred-card aii-${prediction.tone}`}>
            <p className="aii-pred-label">{prediction.label}</p>
            <p className="aii-pred-value">{prediction.value}</p>
            <div className="aii-progress-wrap">
              <div className="aii-progress-track">
                <div
                  className="aii-progress-fill"
                  style={{ width: `${prediction.confidence}%` }}
                />
              </div>
              <span className="aii-progress-text">{prediction.confidence > 0 ? `${prediction.confidence}%` : "--"}</span>
            </div>
            <p className="aii-pred-note">{prediction.note}</p>
            <div className="aii-card-index">0{index + 1}</div>
          </article>
        ))}
      </div>

      <div className="section">
        <section className="card aii-feed-card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon aii-feed-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12h4l3-8 4 16 3-8h2" />
                </svg>
              </div>
              AI Analysis Feed
            </div>
            <div className="aii-badge">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" />
              </svg>
              RECOVERY ENGINE
            </div>
          </div>

          <div className="aii-feed-list">
            {insights.map((insight, index) => (
              <article key={`${insight.title}-${index}`} className={`aii-insight aii-insight-${insight.severity}`}>
                <div className="aii-insight-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    {insight.severity === "success" ? (
                      <polyline points="20 6 9 17 4 12" />
                    ) : insight.severity === "warn" ? (
                      <>
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </>
                    )}
                  </svg>
                </div>
                <div className="aii-insight-content">
                  <h4 className="aii-insight-title">{insight.title}</h4>
                  <p className="aii-insight-desc">{insight.desc}</p>
                  <div className="aii-insight-meta">
                    <span>{insight.time}</span>
                    <span>Confidence {insight.confidence}%</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
