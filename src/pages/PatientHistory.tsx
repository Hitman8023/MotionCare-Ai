export default function PatientHistory() {
    const patients = [
        { name: 'James Davidson', age: 42, surgery: 'Flexor Tendon Repair (Right Hand)', stage: 'Week 4 — Active Rehab', score: 80, sessions: 24, status: 'active' },
        { name: 'Sarah Mitchell', age: 35, surgery: 'Carpal Tunnel Release (Left Hand)', stage: 'Week 6 — Strengthening', score: 88, sessions: 32, status: 'active' },
        { name: 'Robert Chen', age: 58, surgery: 'Wrist Arthroscopy (Right)', stage: 'Week 2 — Passive ROM', score: 45, sessions: 8, status: 'active' },
        { name: 'Emily Johnson', age: 29, surgery: 'De Quervain Release (Left)', stage: 'Completed — Discharged', score: 95, sessions: 40, status: 'completed' },
        { name: 'Michael Torres', age: 47, surgery: 'Trigger Finger Release (Right)', stage: 'Week 8 — Return to Activity', score: 92, sessions: 36, status: 'active' },
    ];

    const timeline = [
        { date: 'Mar 11', event: 'Session #24 completed — 87% accuracy, 42° peak ROM', type: 'session' },
        { date: 'Mar 10', event: 'AI flagged compensatory shoulder movement', type: 'alert' },
        { date: 'Mar 09', event: 'Session #23 completed — 85% accuracy, 40° peak ROM', type: 'session' },
        { date: 'Mar 07', event: 'Dr. Moore adjusted exercise protocol — added resistance band', type: 'update' },
        { date: 'Mar 06', event: 'Session #22 completed — 82% accuracy, 38° peak ROM', type: 'session' },
        { date: 'Mar 04', event: 'Patient reported decreased pain level (4→2)', type: 'milestone' },
        { date: 'Mar 03', event: 'Session #21 completed — 80% accuracy, 36° peak ROM', type: 'session' },
    ];

    const typeStyles: Record<string, { color: string; icon: string }> = {
        session: { color: 'var(--teal)', icon: '📋' },
        alert: { color: 'var(--orange)', icon: '⚠️' },
        update: { color: 'var(--blue)', icon: '🔧' },
        milestone: { color: 'var(--green)', icon: '🎯' },
    };

    return (
        <>
            <div className="page-header">
                <div className="page-title">Patient History</div>
                <div className="page-subtitle">Treatment records and session timeline</div>
            </div>

            {/* Patient Cards */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(167,139,250,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                            </div>
                            Patient Registry
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{patients.length} patients</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {patients.map((p, i) => (
                            <div key={i} className="patient-row" style={{ background: i === 0 ? 'rgba(34,211,238,.05)' : 'transparent', border: `1px solid ${i === 0 ? 'rgba(34,211,238,.12)' : 'var(--border-light)'}` }}>
                                <div className="patient-row-avatar" style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #22d3ee, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', fontWeight: 800 }}>{p.name.split(' ').map(n => n[0]).join('')}</div>
                                <div className="patient-row-main">
                                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{p.name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{p.surgery} · Age {p.age}</div>
                                    <div style={{ fontSize: '11px', color: p.status === 'completed' ? 'var(--green)' : 'var(--teal)', fontWeight: 600, marginTop: '2px' }}>{p.stage}</div>
                                </div>
                                <div className="patient-row-stat">
                                    <div style={{ fontSize: '22px', fontWeight: 900, color: p.score >= 90 ? 'var(--green)' : p.score >= 70 ? 'var(--teal)' : 'var(--orange)' }}>{p.score}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Score</div>
                                </div>
                                <div className="patient-row-stat">
                                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{p.sessions}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Sessions</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(96,165,250,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            </div>
                            Treatment Timeline — James Davidson
                        </div>
                    </div>
                    <div style={{ position: 'relative', paddingLeft: '28px' }}>
                        <div style={{ position: 'absolute', left: '10px', top: '8px', bottom: '8px', width: '2px', background: 'var(--border)' }}></div>
                        {timeline.map((t, i) => {
                            const ts = typeStyles[t.type];
                            return (
                                <div key={i} style={{ display: 'flex', gap: '14px', paddingBottom: '20px', position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '-22px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: ts.color, border: '2px solid var(--bg)', boxShadow: `0 0 8px ${ts.color}44`, zIndex: 1 }}></div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 600 }}>{ts.icon} {t.event}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{t.date}</span>
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
