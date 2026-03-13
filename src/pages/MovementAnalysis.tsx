import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function MovementAnalysis() {
    const [angle, setAngle] = useState(38);
    const [rom, setRom] = useState(42);
    const handTRef = useRef(0);

    useEffect(() => {
        const interval = setInterval(() => {
            handTRef.current += 0.03;
            const t = handTRef.current;
            setAngle(Math.round(35 + Math.sin(t) * 12));
            setRom(Math.round(40 + Math.sin(t * 0.5) * 5));
        }, 80);
        return () => clearInterval(interval);
    }, []);

    const joints = [
        { name: 'Wrist Flexion', current: `${angle}°`, target: '45°', pct: Math.round((angle / 45) * 100), color: 'var(--teal)' },
        { name: 'Wrist Extension', current: '28°', target: '35°', pct: 80, color: 'var(--blue)' },
        { name: 'Finger Curl', current: '65°', target: '80°', pct: 81, color: 'var(--purple)' },
        { name: 'Thumb Opposition', current: '72°', target: '90°', pct: 80, color: 'var(--green)' },
        { name: 'Radial Deviation', current: '15°', target: '20°', pct: 75, color: 'var(--orange)' },
        { name: 'Ulnar Deviation', current: '22°', target: '30°', pct: 73, color: 'var(--pink)' },
    ];

    const sessions = [
        { date: 'Today', rom: '42°', accuracy: '87%', reps: 24, trend: 'up' },
        { date: 'Yesterday', rom: '40°', accuracy: '85%', reps: 22, trend: 'up' },
        { date: 'Mar 10', rom: '38°', accuracy: '82%', reps: 20, trend: 'up' },
        { date: 'Mar 09', rom: '36°', accuracy: '80%', reps: 18, trend: 'flat' },
        { date: 'Mar 08', rom: '35°', accuracy: '78%', reps: 16, trend: 'up' },
    ];

    return (
        <>
            <div className="page-header">
                <div className="page-title">Movement Analysis</div>
                <div className="page-subtitle">Joint range of motion tracking and biomechanical assessment</div>
            </div>

            {/* Summary cards */}
            <div className="section stats-grid-4">
                {[
                    { label: 'Active ROM', val: `${rom}°`, change: '+4° this week', color: 'var(--teal)' },
                    { label: 'Movement Score', val: '84%', change: '+6% improvement', color: 'var(--green)' },
                    { label: 'Symmetry Index', val: '0.92', change: 'Near balanced', color: 'var(--blue)' },
                    { label: 'Pain Level', val: '2/10', change: 'Low discomfort', color: 'var(--purple)' },
                ].map((s, i) => (
                    <div key={i} className="card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '32px', fontWeight: 900, color: s.color, letterSpacing: '-1.5px' }}>{s.val}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: '4px' }}>{s.label}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)', marginTop: '6px' }}>↑ {s.change}</div>
                    </div>
                ))}
            </div>

            <div className="section">
                <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', background: 'linear-gradient(145deg, rgba(34, 211, 238, .08), rgba(15, 23, 42, .92))' }}>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Live Arm Simulation</div>
                        <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>Interactive full-arm simulation has been moved to Live Monitoring for real-time sensor tracking and fullscreen coaching.</div>
                    </div>
                    <Link
                        to="/live"
                        style={{
                            textDecoration: 'none',
                            padding: '10px 16px',
                            borderRadius: '10px',
                            border: '1px solid rgba(34, 211, 238, .35)',
                            color: 'var(--teal)',
                            fontWeight: 700,
                            fontSize: '13px',
                            background: 'rgba(34, 211, 238, .09)'
                        }}
                    >
                        Open Live Monitoring
                    </Link>
                </div>
            </div>

            <div className="section grid-main" style={{ alignItems: 'start' }}>
                {/* Joint Analysis */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(34,211,238,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>
                            </div>
                            Joint Range of Motion
                        </div>
                        <span className="mini-tag tag-live">LIVE</span>
                    </div>
                    {joints.map((j, i) => (
                        <div key={i} style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                                <span style={{ fontWeight: 600 }}>{j.name}</span>
                                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: j.color }}>{j.current} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {j.target}</span></span>
                            </div>
                            <div style={{ height: '8px', background: 'rgba(148,163,184,.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${j.pct}%`, height: '100%', borderRadius: '4px', background: `linear-gradient(90deg, ${j.color}, ${j.color}88)`, transition: 'width .8s ease', boxShadow: `0 0 10px ${j.color}33` }}></div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Session History */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(96,165,250,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                            </div>
                            Session History
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {sessions.map((s, i) => (
                            <div key={i} className="history-row" style={{ background: i === 0 ? 'rgba(34,211,238,.06)' : 'transparent', border: `1px solid ${i === 0 ? 'rgba(34,211,238,.12)' : 'var(--border-light)'}` }}>
                                <span className="history-row-date" style={{ color: i === 0 ? 'var(--teal)' : 'var(--text-secondary)' }}>{s.date}</span>
                                <span className="history-row-value">{s.rom}</span>
                                <span className="history-row-accent">{s.accuracy}</span>
                                <span className="history-row-meta">{s.reps} reps</span>
                                <span className="history-row-trend">{s.trend === 'up' ? '↑' : '→'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
