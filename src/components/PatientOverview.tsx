export default function PatientOverview() {
    const score = 80;
    const dashOffset = (1 - score / 100) * 220;

    return (
        <div className="section">
            <div className="card">
                <div className="patient-overview">
                    <div className="patient-info-left">
                        <div className="patient-big-avatar">JD</div>
                        <div>
                            <div className="patient-name">James Davidson</div>
                            <div className="patient-meta">
                                <span className="patient-meta-item">
                                    <strong>Age:</strong> 42 yrs
                                </span>
                                <span className="patient-meta-item">
                                    <strong>Surgery:</strong> Flexor Tendon Repair (Right Hand)
                                </span>
                                <span className="patient-meta-item">
                                    <strong>Stage:</strong>
                                    <span
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(34,211,238,.15), rgba(139,92,246,.1))',
                                            color: '#22d3ee',
                                            padding: '2px 10px',
                                            borderRadius: '10px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            border: '1px solid rgba(34,211,238,.2)',
                                        }}
                                    >
                                        Week 4 — Active Rehab
                                    </span>
                                </span>
                                <span className="patient-meta-item">
                                    <strong>Last Session:</strong> Today, 11:58 AM
                                </span>
                                <span className="patient-meta-item">
                                    <strong>Therapist:</strong> Dr. Rachel Moore
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="patient-stats">
                        <div className="patient-stat">
                            <div className="patient-stat-val" style={{ color: 'var(--teal)' }}>24</div>
                            <div className="patient-stat-label">Sessions Done</div>
                        </div>
                        <div className="patient-stat">
                            <div className="patient-stat-val" style={{ color: 'var(--green)' }}>87%</div>
                            <div className="patient-stat-label">Accuracy</div>
                        </div>
                        <div className="patient-stat">
                            <div className="patient-stat-val" style={{ color: 'var(--blue)' }}>42°</div>
                            <div className="patient-stat-label">Flex Range</div>
                        </div>
                        <div className="patient-stat">
                            <div className="patient-stat-val" style={{ color: 'var(--orange)' }}>3</div>
                            <div className="patient-stat-label">Alerts Today</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <div className="recovery-circle-wrap">
                            <svg viewBox="0 0 100 100">
                                <defs>
                                    <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#22d3ee" />
                                        <stop offset="100%" stopColor="#34d399" />
                                    </linearGradient>
                                </defs>
                                <circle className="recovery-circle-track" cx="50" cy="50" r="35" />
                                <circle
                                    className="recovery-circle-fill"
                                    cx="50"
                                    cy="50"
                                    r="35"
                                    style={{ strokeDashoffset: dashOffset }}
                                />
                            </svg>
                            <div className="recovery-circle-text">
                                <div className="val">{score}</div>
                                <div className="lbl">Score</div>
                            </div>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '.04em' }}>
                            Recovery Score
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
