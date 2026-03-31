import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

type JointMetric = {
    name: string;
    current: number;
    target: number;
    unit: string;
};

function trendPath(data: number[], width: number, height: number): string {
    if (!data.length) return '';
    const min = Math.min(...data) - 1;
    const max = Math.max(...data) + 1;
    const range = Math.max(1, max - min);
    const step = data.length > 1 ? width / (data.length - 1) : width;

    return data
        .map((v, i) => {
            const x = i * step;
            const y = height - ((v - min) / range) * height;
            return `${i === 0 ? 'M' : 'L'}${x},${y}`;
        })
        .join(' ');
}

function jointStatus(delta: number): 'Normal' | 'Limited' | 'Critical' {
    if (delta <= 8) return 'Normal';
    if (delta <= 18) return 'Limited';
    return 'Critical';
}

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

    const joints: JointMetric[] = [
        { name: 'Wrist Flexion', current: angle, target: -40, unit: 'deg' },
        { name: 'Wrist Extension', current: 28, target: 40, unit: 'deg' },
        { name: 'Wrist Rotation', current: 65, target: 60, unit: 'deg' },
        { name: 'Radial Deviation', current: 15, target: 4, unit: 'deg' },
        { name: 'Ulnar Deviation', current: -22, target: -4, unit: 'deg' },
    ];

    const sessions = [
        { date: 'Today', rom: 42, accuracy: 87, reps: 24 },
        { date: 'Yesterday', rom: 40, accuracy: 85, reps: 22 },
        { date: 'Mar 10', rom: 38, accuracy: 82, reps: 20 },
        { date: 'Mar 09', rom: 36, accuracy: 80, reps: 18 },
        { date: 'Mar 08', rom: 35, accuracy: 78, reps: 16 },
    ];

    const romTrend = sessions.map((s) => s.rom);
    const trendLine = trendPath(romTrend, 420, 120);

    const compactMetrics = [
        { label: 'Active ROM', value: `${rom}°`, hint: '+4 this week', icon: 'angle' },
        { label: 'Movement Score', value: '84%', hint: '+6%', icon: 'score' },
        { label: 'Symmetry', value: '0.92', hint: 'Near balanced', icon: 'symmetry' },
        { label: 'Pain Level', value: '2/10', hint: 'Low', icon: 'pain' },
    ];

    return (
        <>
            <div className="page-header">
                <div className="page-title">Movement Analysis</div>
                <div className="page-subtitle">Joint range of motion tracking and biomechanical assessment</div>
            </div>

            <section className="section movement-premium-hero card">
                <div className="movement-premium-hero-copy">
                    <div className="movement-premium-kicker">Realtime Biomechanics</div>
                    <h2 className="movement-premium-title">Live Movement Analysis</h2>
                    <p className="movement-premium-description">
                        High fidelity movement intelligence with trend-driven recovery insights.
                        Monitor joint quality, detect asymmetry, and act before decline.
                    </p>
                    <div className="movement-premium-actions">
                        <button type="button" className="movement-action-btn primary">Start New Session</button>
                        <button type="button" className="movement-action-btn secondary">Adjust Plan</button>
                        <button type="button" className="movement-action-btn secondary">Send Feedback</button>
                    </div>
                </div>

                <div className="movement-premium-visual" aria-label="Live arm analysis preview">
                    <div className="movement-premium-glow movement-premium-glow-a" />
                    <div className="movement-premium-glow movement-premium-glow-b" />
                    <div className="movement-premium-screen">
                        <div className="movement-premium-screen-tag">Live Simulation</div>
                        <div className="movement-premium-screen-angle">{angle}°</div>
                        <div className="movement-premium-screen-sub">Wrist Flexion</div>
                        <Link to="/live" className="movement-premium-link">
                            Open full simulation
                        </Link>
                    </div>
                </div>
            </section>

            <div className="section movement-premium-metrics-row">
                {compactMetrics.map((metric) => (
                    <div key={metric.label} className="movement-premium-metric-card">
                        <div className="movement-premium-metric-top">
                            <div className="movement-premium-metric-icon">{metric.icon === 'angle' ? '◢' : metric.icon === 'score' ? '◔' : metric.icon === 'symmetry' ? '◎' : '◌'}</div>
                            <div className="movement-premium-metric-label">{metric.label}</div>
                        </div>
                        <div className="movement-premium-metric-value">{metric.value}</div>
                        <div className="movement-premium-metric-hint">{metric.hint}</div>
                    </div>
                ))}
            </div>

            <div className="section grid-main movement-premium-main">
                <div className="card movement-joint-card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(34,211,238,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>
                            </div>
                            Joint Range of Motion
                        </div>
                        <span className="mini-tag tag-live">ANALYZING</span>
                    </div>

                    <div className="movement-joint-list">
                        {joints.map((joint) => {
                            const diff = Math.abs(joint.current - joint.target);
                            const status = jointStatus(diff);
                            const marker = Math.max(0, Math.min(100, 100 - (diff / 25) * 100));

                            return (
                                <div key={joint.name} className="movement-joint-item">
                                    <div className="movement-joint-row">
                                        <span className="movement-joint-name">{joint.name}</span>
                                        <span className="movement-joint-reading">
                                            {joint.current}° <span>/ {joint.target}°</span>
                                        </span>
                                    </div>

                                    <div className="movement-joint-range-track">
                                        <div className="movement-joint-range-zone zone-green" />
                                        <div className="movement-joint-range-zone zone-yellow" />
                                        <div className="movement-joint-range-zone zone-red" />
                                        <div className="movement-joint-marker" style={{ left: `${marker}%` }} />
                                    </div>

                                    <div className="movement-joint-foot">
                                        <span className={`movement-joint-status status-${status.toLowerCase()}`}>{status}</span>
                                        <span className="movement-joint-delta">delta {diff.toFixed(1)} {joint.unit}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="stack-column">
                    <div className="card movement-history-card">
                        <div className="card-header">
                            <div className="card-title">
                                <div className="card-title-icon" style={{ background: 'rgba(96,165,250,.12)' }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                                </div>
                                Session History
                            </div>
                        </div>

                        <div className="movement-history-trend-wrap">
                            <svg viewBox="0 0 420 120" preserveAspectRatio="none" className="movement-history-trend">
                                <path d={trendLine} fill="none" stroke="rgba(96,165,250,.95)" strokeWidth="3" />
                            </svg>
                        </div>

                        <div className="movement-history-list">
                            {sessions.map((session, i) => (
                                <div
                                    key={session.date}
                                    className="history-row"
                                    style={{
                                        background: i === 0 ? 'rgba(34,211,238,.08)' : 'rgba(15,23,42,.4)',
                                        border: `1px solid ${i === 0 ? 'rgba(34,211,238,.24)' : 'var(--border-light)'}`,
                                    }}
                                >
                                    <span className="history-row-date" style={{ color: i === 0 ? 'var(--teal)' : 'var(--text-secondary)' }}>{session.date}</span>
                                    <span className="history-row-value">{session.rom}°</span>
                                    <span className="history-row-accent">{session.accuracy}%</span>
                                    <span className="history-row-meta">{session.reps} reps</span>
                                    <span className="history-row-trend">{i === 0 ? '↑' : i % 2 === 0 ? '↑' : '→'}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card movement-action-card">
                        <div className="card-title">Quick Actions</div>
                        <div className="movement-premium-actions movement-premium-actions-inline">
                            <button type="button" className="movement-action-btn primary">Start New Session</button>
                            <button type="button" className="movement-action-btn secondary">Adjust Plan</button>
                            <button type="button" className="movement-action-btn secondary">Send Feedback</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
