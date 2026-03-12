export default function Reports() {
    const reports = [
        { title: 'Weekly Progress Report — Week 4', date: 'Mar 11, 2026', type: 'Progress', pages: 12, status: 'Ready' },
        { title: 'Movement Analysis Summary', date: 'Mar 10, 2026', type: 'Analysis', pages: 8, status: 'Ready' },
        { title: 'AI Recommendation Report', date: 'Mar 09, 2026', type: 'AI Report', pages: 6, status: 'Ready' },
        { title: 'Monthly Assessment — February', date: 'Feb 28, 2026', type: 'Assessment', pages: 18, status: 'Ready' },
        { title: 'Insurance Documentation', date: 'Feb 25, 2026', type: 'Admin', pages: 4, status: 'Pending Review' },
        { title: 'Initial Evaluation Report', date: 'Feb 10, 2026', type: 'Evaluation', pages: 15, status: 'Approved' },
    ];

    const typeColors: Record<string, string> = {
        Progress: 'var(--teal)', Analysis: 'var(--blue)', 'AI Report': 'var(--purple)',
        Assessment: 'var(--green)', Admin: 'var(--orange)', Evaluation: 'var(--pink)',
    };

    const metrics = [
        { label: 'Total Reports', value: '24', icon: '📄' },
        { label: 'This Month', value: '6', icon: '📅' },
        { label: 'Auto-Generated', value: '18', icon: '🤖' },
        { label: 'Avg Pages', value: '10.5', icon: '📊' },
    ];

    return (
        <>
            <div className="page-header">
                <div className="page-title">Reports</div>
                <div className="page-subtitle">Clinical documentation and automated reporting</div>
            </div>

            {/* Metrics */}
            <div className="section" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {metrics.map((m, i) => (
                    <div key={i} className="card" style={{ textAlign: 'center', padding: '20px' }}>
                        <div style={{ fontSize: '28px', marginBottom: '6px' }}>{m.icon}</div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--teal)', letterSpacing: '-1px' }}>{m.value}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: '4px' }}>{m.label}</div>
                    </div>
                ))}
            </div>

            {/* Reports list */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(96,165,250,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            </div>
                            Recent Reports
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {reports.map((r, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 110px', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', transition: 'all .2s', cursor: 'pointer' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}>
                                <div>
                                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{r.title}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.date}</div>
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', textAlign: 'center', background: `${typeColors[r.type]}15`, color: typeColors[r.type], border: `1px solid ${typeColors[r.type]}25` }}>{r.type}</span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>{r.pages} pages</span>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: r.status === 'Ready' ? 'var(--green)' : r.status === 'Approved' ? 'var(--teal)' : 'var(--orange)', textAlign: 'center' }}>{r.status}</span>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                    <button style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>View</button>
                                    <button style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(34,211,238,.2)', background: 'rgba(34,211,238,.08)', color: 'var(--teal)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>Export</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
