import DoctorLiveBoard from '../components/DoctorLiveBoard';

export default function DoctorDashboard() {
    const patients = [
        { name: 'James Davidson', age: 42, condition: 'Flexor Tendon Repair (Right Hand)', adherence: 92, risk: 'Low', nextSession: 'Today · 4:00 PM' },
        { name: 'Sarah Mitchell', age: 35, condition: 'Carpal Tunnel Release (Left Hand)', adherence: 88, risk: 'Low', nextSession: 'Today · 5:15 PM' },
        { name: 'Robert Chen', age: 58, condition: 'Wrist Arthroscopy (Right)', adherence: 63, risk: 'Moderate', nextSession: 'Tomorrow · 10:00 AM' },
        { name: 'Michael Torres', age: 47, condition: 'Trigger Finger Release (Right)', adherence: 79, risk: 'Low', nextSession: 'Tomorrow · 1:30 PM' },
    ];

    const alerts = [
        { label: 'Robert Chen had 2 missed sessions this week', severity: 'warn' },
        { label: 'New compensation pattern detected in James Davidson', severity: 'info' },
        { label: 'Sarah Mitchell is eligible for protocol progression', severity: 'success' },
    ];

    return (
        <>
            <div className="page-header">
                <div className="page-title">Doctor Dashboard</div>
                <div className="page-subtitle">
                    <span className="live-dot"></span>
                    Active caseload overview with patient progress and alerts
                </div>
            </div>

            <div className="section stats-grid-4">
                <div className="card doctor-kpi-card">
                    <div className="doctor-kpi-value">24</div>
                    <div className="doctor-kpi-label">Active Patients</div>
                </div>
                <div className="card doctor-kpi-card">
                    <div className="doctor-kpi-value">87%</div>
                    <div className="doctor-kpi-label">Avg Adherence</div>
                </div>
                <div className="card doctor-kpi-card">
                    <div className="doctor-kpi-value">6</div>
                    <div className="doctor-kpi-label">Sessions Today</div>
                </div>
                <div className="card doctor-kpi-card">
                    <div className="doctor-kpi-value">3</div>
                    <div className="doctor-kpi-label">Action Alerts</div>
                </div>
            </div>

            <div className="section">
                <DoctorLiveBoard />
            </div>

            <div className="section grid-main doctor-dashboard-grid">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(34,211,238,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                            </div>
                            Patient Caseload
                        </div>
                    </div>

                    <div className="doctor-patient-list">
                        {patients.map((patient) => {
                            const initials = patient.name
                                .split(' ')
                                .map((segment) => segment[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase();
                            const adherenceColor =
                                patient.adherence >= 85 ? 'var(--green)' : patient.adherence >= 70 ? 'var(--teal)' : 'var(--orange)';

                            return (
                                <div key={patient.name} className="patient-row">
                                    <div className="patient-row-avatar doctor-avatar-chip">{initials}</div>
                                    <div className="patient-row-main">
                                        <div className="doctor-patient-name">{patient.name}</div>
                                        <div className="doctor-patient-meta">{patient.condition} · Age {patient.age}</div>
                                        <div className="doctor-patient-next">Next session: {patient.nextSession}</div>
                                    </div>
                                    <div className="patient-row-stat">
                                        <div style={{ fontSize: '21px', fontWeight: 900, color: adherenceColor }}>{patient.adherence}%</div>
                                        <div className="doctor-stat-label">Adherence</div>
                                    </div>
                                    <div className="patient-row-stat">
                                        <div
                                            style={{
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                color: patient.risk === 'Low' ? 'var(--green)' : 'var(--orange)',
                                                background: patient.risk === 'Low' ? 'rgba(52,211,153,.1)' : 'rgba(251,191,36,.12)',
                                                border: `1px solid ${patient.risk === 'Low' ? 'rgba(52,211,153,.2)' : 'rgba(251,191,36,.25)'}`,
                                                borderRadius: '999px',
                                                padding: '5px 10px',
                                            }}
                                        >
                                            {patient.risk} Risk
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="stack-column">
                    <div className="card">
                        <div className="card-header">
                            <div className="card-title">
                                <div className="card-title-icon" style={{ background: 'rgba(248,113,113,.14)' }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
                                        <path d="M10.29 3.86 1.82 18A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                </div>
                                Priority Alerts
                            </div>
                        </div>
                        <div className="doctor-alert-list">
                            {alerts.map((alert) => (
                                <div key={alert.label} className={`alert-item alert-${alert.severity === 'warn' ? 'warn' : alert.severity === 'success' ? 'ok' : 'crit'}`}>
                                    <div className="alert-dot"></div>
                                    <div className="alert-label">{alert.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <div className="card-title">
                                <div className="card-title-icon" style={{ background: 'rgba(96,165,250,.12)' }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                                        <polyline points="17 6 23 6 23 12" />
                                    </svg>
                                </div>
                                Clinic Snapshot
                            </div>
                        </div>
                        <div className="session-summary-grid">
                            <div className="doctor-snapshot-card">
                                <div className="doctor-snapshot-value">18</div>
                                <div className="doctor-snapshot-label">Completed Sessions</div>
                            </div>
                            <div className="doctor-snapshot-card">
                                <div className="doctor-snapshot-value">4</div>
                                <div className="doctor-snapshot-label">Pending Reviews</div>
                            </div>
                            <div className="doctor-snapshot-card">
                                <div className="doctor-snapshot-value">91%</div>
                                <div className="doctor-snapshot-label">Form Accuracy</div>
                            </div>
                            <div className="doctor-snapshot-card">
                                <div className="doctor-snapshot-value">2</div>
                                <div className="doctor-snapshot-label">Escalations</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
