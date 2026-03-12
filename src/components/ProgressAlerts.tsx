function makePath(data: number[], w: number, h: number, pad = 4) {
    const min = Math.min(...data) - 2;
    const max = Math.max(...data) + 2;
    const xStep = (w - pad * 2) / (data.length - 1);
    const pts = data.map((v, i) => [pad + i * xStep, h - pad - ((v - min) / (max - min)) * (h - pad * 2)]);
    const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const area = d + ` L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
    return { d, area };
}

export default function ProgressAlerts() {
    const progData = [40, 45, 42, 50, 55, 58, 52, 60, 63, 65, 62, 68, 70, 72, 70, 75, 73, 78, 76, 80, 79, 82, 80, 84, 83, 86, 84, 88, 86, 90];
    const progSpark = makePath(progData, 500, 80);
    const intensity = [0, 3, 2, 3, 3, 1, 0, 2, 3, 3, 2, 3, 0, 0, 3, 3, 2, 3, 3, 1, 0, 3, 3, 3, 3, 2, 0, 0];
    const colors = ['rgba(148,163,184,.08)', 'rgba(96,165,250,.2)', 'rgba(56,189,248,.35)', 'rgba(34,211,238,.6)'];

    const statCardStyle = () => ({
        textAlign: 'center' as const,
        padding: '16px',
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        transition: 'all .25s',
    });

    return (
        <div className="section grid-main" style={{ alignItems: 'start' }}>
            {/* Recovery Progress */}
            <div className="card">
                <div className="card-header">
                    <div className="card-title">
                        <div className="card-title-icon" style={{ background: 'rgba(96,165,250,.12)' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                            </svg>
                        </div>
                        Recovery Progress
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className="mini-tag tag-new">+8% this week</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Last 30 days</span>
                    </div>
                </div>

                <div className="progress-stats">
                    <div className="progress-stat-card">
                        <div className="progress-stat-val" style={{ color: 'var(--teal)' }}>80</div>
                        <div className="progress-stat-label">Recovery Score</div>
                        <div className="progress-stat-change up">↑ +8 pts this week</div>
                    </div>
                    <div className="progress-stat-card">
                        <div className="progress-stat-val" style={{ color: 'var(--green)' }}>87%</div>
                        <div className="progress-stat-label">Movement Accuracy</div>
                        <div className="progress-stat-change up">↑ +5% vs last week</div>
                    </div>
                    <div className="progress-stat-card">
                        <div className="progress-stat-val" style={{ color: 'var(--text-primary)' }}>24/28</div>
                        <div className="progress-stat-label">Session Consistency</div>
                        <div className="progress-stat-change up">↑ 86% attendance</div>
                    </div>
                    <div className="progress-stat-card">
                        <div className="progress-stat-val" style={{ color: 'var(--blue)' }}>42°</div>
                        <div className="progress-stat-label">Max Flexion Range</div>
                        <div className="progress-stat-change up">↑ +12° since week 1</div>
                    </div>
                </div>

                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '.1em', textTransform: 'uppercase' as const, marginBottom: '10px' }}>Recovery Score — 30 Day Timeline</div>
                <svg width="100%" height="80" viewBox="0 0 500 80" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="progGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#60a5fa" stopOpacity=".25" />
                            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path fill="url(#progGrad)" d={progSpark.area} />
                    <path fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" d={progSpark.d} style={{ filter: 'drop-shadow(0 0 8px rgba(96,165,250,.4))' }} />
                </svg>

                <div className="divider"></div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '.1em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Exercise Consistency — Last 4 Weeks</div>
                <div className="heatmap-label-row">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="heatmap-day">{d}</div>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '5px' }}>
                    {intensity.map((v, i) => (
                        <div key={i} className="heatmap-cell" style={{ background: colors[v], height: '24px', border: v > 0 ? '1px solid rgba(34,211,238,.1)' : '1px solid transparent' }}
                            title={v === 0 ? 'No session' : v === 1 ? 'Partial' : v === 2 ? 'Good' : 'Excellent'} />
                    ))}
                </div>
            </div>

            {/* Alerts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(248,113,113,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                            </div>
                            Safety Alerts
                        </div>
                        <span className="mini-tag" style={{ background: 'rgba(248,113,113,.12)', color: 'var(--red)', border: '1px solid rgba(248,113,113,.2)' }}>3 Today</span>
                    </div>

                    <div className="alert-item alert-ok">
                        <div className="alert-dot"></div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                        <div className="alert-label">Heart Rate Normal</div>
                        <span className="alert-val" style={{ color: 'var(--green)' }}>78 BPM</span>
                        <span className="alert-time">Now</span>
                    </div>
                    <div className="alert-item alert-ok">
                        <div className="alert-dot"></div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><path d="M12 2v20M2 7h5M17 7h5M2 17h5M17 17h5" /></svg>
                        <div className="alert-label">SpO₂ Optimal</div>
                        <span className="alert-val" style={{ color: 'var(--green)' }}>98%</span>
                        <span className="alert-time">Now</span>
                    </div>
                    <div className="alert-item alert-warn">
                        <div className="alert-dot"></div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        <div className="alert-label">Angle Below Target</div>
                        <span className="alert-val" style={{ color: 'var(--orange)' }}>42° / 45°</span>
                        <span className="alert-time">12:44</span>
                    </div>
                    <div className="alert-item alert-warn">
                        <div className="alert-dot"></div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
                        <div className="alert-label">Temp Slightly High</div>
                        <span className="alert-val" style={{ color: 'var(--orange)' }}>37.2°C</span>
                        <span className="alert-time">12:30</span>
                    </div>
                    <div className="alert-item alert-ok">
                        <div className="alert-dot"></div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" /></svg>
                        <div className="alert-label">Movement Regular</div>
                        <span className="alert-val" style={{ color: 'var(--green)' }}>Stable</span>
                        <span className="alert-time">12:20</span>
                    </div>
                </div>

                {/* Session Summary */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(167,139,250,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                                </svg>
                            </div>
                            Today's Session
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {[
                            { val: '42', label: 'Min Elapsed', color: 'var(--purple)' },
                            { val: '18', label: 'Reps Done', color: 'var(--teal)' },
                            { val: '3', label: 'Sets Complete', color: 'var(--green)' },
                            { val: '87%', label: 'Form Quality', color: 'var(--blue)' },
                        ].map((item, i) => (
                            <div key={i} style={statCardStyle()}>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: item.color, letterSpacing: '-1px' }}>{item.val}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', fontWeight: 600 }}>{item.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
