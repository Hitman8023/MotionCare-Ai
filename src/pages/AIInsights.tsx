import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../firebase";
import { getDoctorEstimation } from "../services/estimationService";
import type { DoctorEstimation } from "../types/estimation";

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
    const insights = [
        { severity: 'info', title: 'Flexion Progress Trending Upward', desc: 'Wrist flexion has improved by 12° over the past 4 weeks. At this rate, the patient will reach the 45° target within 2 weeks.', time: '12:45 PM', confidence: 94 },
        { severity: 'success', title: 'Exercise Form Consistently Good', desc: 'Movement accuracy has stayed above 80% for 8 consecutive sessions. The patient has developed proper motor patterns for the prescribed exercises.', time: '12:40 PM', confidence: 91 },
        { severity: 'warn', title: 'Compensatory Movement Detected', desc: 'Slight shoulder elevation during wrist flexion exercises was detected in 3 of the last 10 repetitions. Cueing for scapular depression recommended.', time: '12:35 PM', confidence: 87 },
        { severity: 'info', title: 'Recovery Pace Above Average', desc: 'Compared to similar flexor tendon repair cases, this patient is recovering 15% faster than the median timeline. Excellent compliance.', time: '12:30 PM', confidence: 89 },
        { severity: 'warn', title: 'Fatigue Pattern Emerging', desc: 'Movement amplitude decreases by 8° during the final 5 repetitions of each set. Consider reducing set length or adding rest intervals.', time: '12:25 PM', confidence: 82 },
        { severity: 'success', title: 'Pain-Free Range Expanding', desc: 'Patient-reported pain levels have decreased from 4/10 to 2/10 over the past week. The pain-free ROM has expanded by 8°.', time: '12:20 PM', confidence: 96 },
    ];

    const systemEst = getSystemEstimation();

    const predictions = [
        {
          label: "Doctor's estimation",
          value: doctorEstimation
            ? `Week ${doctorEstimation.minWeeks}–${doctorEstimation.maxWeeks}`
            : "Pending assessment",
          confidence: doctorEstimation?.confidence ?? 0,
          color: doctorEstimation ? "var(--teal)" : "var(--text-muted)",
        },
        {
          label: "System's estimation",
          value: `Week ${systemEst.min}–${systemEst.max}`,
          confidence: systemEst.confidence,
          color: "var(--purple)",
        },
    ];

    const severityStyles: Record<string, { bg: string; border: string; textColor: string; iconColor: string }> = {
        info: { bg: 'rgba(56,189,248,.06)', border: 'rgba(56,189,248,.15)', textColor: '#7dd3fc', iconColor: '#38bdf8' },
        success: { bg: 'rgba(52,211,153,.06)', border: 'rgba(52,211,153,.15)', textColor: '#6ee7b7', iconColor: '#34d399' },
        warn: { bg: 'rgba(251,191,36,.06)', border: 'rgba(251,191,36,.15)', textColor: '#fde68a', iconColor: '#fbbf24' },
    };

    return (
        <>
            <div className="page-header">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
                    <div>
                        <div className="page-title">AI Insights</div>
                        <div className="page-subtitle">Machine learning analysis of patient recovery patterns</div>
                    </div>
                    <button
                        onClick={() => {
                            setRefreshing(true);
                            fetchEstimation();
                        }}
                        disabled={refreshing}
                        style={{
                            padding: "8px 12px",
                            borderRadius: "var(--radius-sm)",
                            background: refreshing ? "var(--border-color)" : "var(--teal)",
                            color: "#fff",
                            border: "none",
                            cursor: refreshing ? "not-allowed" : "pointer",
                            fontSize: "13px",
                            fontWeight: 600,
                            opacity: refreshing ? 0.6 : 1,
                        }}
                    >
                        {refreshing ? "Refreshing..." : "🔄 Refresh"}
                    </button>
                </div>
            </div>

            {/* Prediction Cards */}
            <div className="section stats-grid-3">
                {predictions.map((p, i) => (
                    <div key={i} className="card" style={{ textAlign: 'center', position: 'relative' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>{p.label}</div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: p.color, letterSpacing: '-1px' }}>{p.value}</div>
                        
                        {p.confidence > 0 && (
                          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <div style={{ width: '80px', height: '6px', borderRadius: '3px', background: 'rgba(148,163,184,.1)', overflow: 'hidden' }}>
                                <div style={{ width: `${p.confidence}%`, height: '100%', borderRadius: '3px', background: p.color }}></div>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: p.color }}>{p.confidence}%</span>
                        </div>
                        )}
                        
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {p.confidence > 0 ? 'Confidence' : 'Status'}
                        </div>

                        {i === 0 && doctorEstimation && (
                          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                            Updated {new Date(doctorEstimation.updatedAt).toLocaleDateString()}
                          </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Insight Feed */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,.1), rgba(139,92,246,.1))' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M12 2a10 10 0 0 1 10 10" /><path d="M12 6a6 6 0 0 1 6 6" /><circle cx="12" cy="12" r="2" /></svg>
                            </div>
                            AI Analysis Feed
                        </div>
                        <div className="ai-badge">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
                            NEURAL ENGINE
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {insights.map((ins, i) => {
                            const s = severityStyles[ins.severity];
                            return (
                                <div key={i} style={{ padding: '16px', borderRadius: 'var(--radius-sm)', background: s.bg, border: `1px solid ${s.border}`, display: 'flex', gap: '14px', alignItems: 'flex-start', transition: 'transform .2s', cursor: 'default' }}
                                    onMouseEnter={e => (e.currentTarget.style.transform = 'translateX(6px)')}
                                    onMouseLeave={e => (e.currentTarget.style.transform = 'translateX(0)')}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${s.iconColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s.iconColor} strokeWidth="2.5" strokeLinecap="round">
                                            {ins.severity === 'success' ? <polyline points="20 6 9 17 4 12" /> :
                                                ins.severity === 'warn' ? <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></> :
                                                    <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>}
                                        </svg>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '14px', fontWeight: 700, color: s.textColor, marginBottom: '4px' }}>{ins.title}</div>
                                        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ins.desc}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ins.time}</span>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: s.iconColor }}>Confidence: {ins.confidence}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
}
