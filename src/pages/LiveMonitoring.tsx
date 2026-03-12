import { useEffect, useState, useRef } from 'react';
import MotionPanel from '../components/MotionPanel';

function makePath(data: number[], w: number, h: number, pad = 4) {
    const min = Math.min(...data) - 2;
    const max = Math.max(...data) + 2;
    const xStep = (w - pad * 2) / (data.length - 1);
    const pts = data.map((v, i) => [pad + i * xStep, h - pad - ((v - min) / (max - min)) * (h - pad * 2)]);
    const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const area = d + ` L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
    return { d, area };
}

export default function LiveMonitoring() {
    const [hr, setHr] = useState(78);
    const [spo2, setSpo2] = useState(97.8);
    const [temp, setTemp] = useState(36.7);
    const [emg, setEmg] = useState(45);
    const [hrBuf, setHrBuf] = useState<number[]>(() => Array.from({ length: 60 }, (_, i) => 72 + Math.sin(i * 0.2) * 6 + Math.random() * 3));
    const [spo2Buf, setSpo2Buf] = useState<number[]>(() => Array.from({ length: 60 }, (_, i) => 97 + Math.sin(i * 0.15) * 0.6 + Math.random() * 0.3));
    const [tempBuf, setTempBuf] = useState<number[]>(() => Array.from({ length: 60 }, (_, i) => 36.5 + Math.sin(i * 0.1) * 0.2 + Math.random() * 0.1));
    const [emgBuf, setEmgBuf] = useState<number[]>(() => Array.from({ length: 60 }, (_, i) => 40 + Math.sin(i * 0.3) * 15 + Math.random() * 10));
    const [elapsed, setElapsed] = useState(2537);
    const elapsedRef = useRef(elapsed);
    elapsedRef.current = elapsed;

    useEffect(() => {
        const tick = setInterval(() => setElapsed(e => e + 1), 1000);
        const dataInterval = setInterval(() => {
            const now = Date.now();
            const newHr = Math.round(72 + Math.sin(now / 3000) * 8 + Math.random() * 4);
            setHr(newHr); setHrBuf(p => [...p.slice(1), newHr]);
            const newSpo2 = 97 + Math.sin(now / 5000) * 0.8 + Math.random() * 0.3;
            setSpo2(newSpo2); setSpo2Buf(p => [...p.slice(1), newSpo2]);
            const newTemp = 36.6 + Math.sin(now / 7000) * 0.2 + Math.random() * 0.05;
            setTemp(newTemp); setTempBuf(p => [...p.slice(1), newTemp]);
            const newEmg = Math.round(40 + Math.sin(now / 2000) * 18 + Math.random() * 8);
            setEmg(newEmg); setEmgBuf(p => [...p.slice(1), newEmg]);
        }, 800);
        return () => { clearInterval(tick); clearInterval(dataInterval); };
    }, []);

    const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const hrPath = makePath(hrBuf, 500, 100);
    const spo2Path = makePath(spo2Buf, 500, 100);
    const tempPath = makePath(tempBuf, 500, 100);
    const emgPath = makePath(emgBuf, 500, 100);

    const monitors = [
        { label: 'Heart Rate', value: Math.round(hr), unit: 'BPM', color: '#f87171', path: hrPath, status: 'Normal' },
        { label: 'SpO₂', value: spo2.toFixed(1), unit: '%', color: '#a78bfa', path: spo2Path, status: 'Optimal' },
        { label: 'Body Temperature', value: temp.toFixed(1), unit: '°C', color: '#fbbf24', path: tempPath, status: 'Normal' },
        { label: 'EMG Signal', value: emg, unit: 'µV', color: '#22d3ee', path: emgPath, status: 'Active' },
    ];

    return (
        <>
            <div className="page-header">
                <div className="page-title">Live Monitoring</div>
                <div className="page-subtitle">
                    <span className="live-dot"></span>Real-time biometric data streams · Session {fmt(elapsed)}
                </div>
            </div>

            {/* Session status bar */}
            <div className="section">
                <div className="card" style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 10px rgba(52,211,153,.5)', animation: 'pulse-ring 2s infinite' }}></div>
                            <span style={{ fontWeight: 700, fontSize: '14px' }}>Session Active</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>ESP32 · MPU6050 · LM35 · MAX30102</span>
                        </div>
                        <div style={{ display: 'flex', gap: '24px' }}>
                            {[{ l: 'Duration', v: fmt(elapsed) }, { l: 'Data Points', v: '12,847' }, { l: 'Sampling', v: '100Hz' }, { l: 'Battery', v: '87%' }].map((s, i) => (
                                <div key={i} style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{s.v}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>{s.l}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Live Arm Simulation */}
            <MotionPanel />

            {/* Monitor Grid */}
            <div className="section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                {monitors.map((m, i) => (
                    <div key={i} className="card">
                        <div className="card-header">
                            <div className="card-title">
                                <div className="card-title-icon" style={{ background: `${m.color}18` }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={m.color} strokeWidth="2.5" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                                </div>
                                {m.label}
                            </div>
                            <span className="mini-tag tag-live">LIVE</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '48px', fontWeight: 900, color: m.color, letterSpacing: '-2.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.value}</span>
                            <span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 500 }}>{m.unit}</span>
                        </div>
                        <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: 'rgba(52,211,153,.1)', color: 'var(--green)', border: '1px solid rgba(52,211,153,.2)' }}>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
                            {m.status}
                        </div>
                        <div style={{ marginTop: '16px', height: '100px' }}>
                            <svg width="100%" height="100" viewBox="0 0 500 100" preserveAspectRatio="none">
                                <defs><linearGradient id={`lg${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={m.color} stopOpacity=".2" /><stop offset="100%" stopColor={m.color} stopOpacity="0" /></linearGradient></defs>
                                <path fill={`url(#lg${i})`} d={m.path.area} />
                                <path fill="none" stroke={m.color} strokeWidth="2" strokeLinecap="round" d={m.path.d} style={{ filter: `drop-shadow(0 0 6px ${m.color}66)` }} />
                            </svg>
                        </div>
                    </div>
                ))}
            </div>

            {/* Connection Log */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(96,165,250,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            </div>
                            Connection Log
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                            { time: '12:42:17', msg: 'Data stream initialized — all sensors online', type: 'success' },
                            { time: '12:41:05', msg: 'ESP32 connected via BLE · Signal strength: -42dBm', type: 'info' },
                            { time: '12:40:58', msg: 'Calibrating MPU6050 gyroscope...', type: 'info' },
                            { time: '12:40:50', msg: 'MAX30102 SpO₂ sensor initialized successfully', type: 'success' },
                            { time: '12:40:42', msg: 'LM35 temperature reading stable at 36.7°C', type: 'success' },
                        ].map((log, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: log.type === 'success' ? 'rgba(52,211,153,.05)' : 'rgba(96,165,250,.05)', border: `1px solid ${log.type === 'success' ? 'rgba(52,211,153,.12)' : 'rgba(96,165,250,.12)'}` }}>
                                <span style={{ fontSize: '12px', fontFamily: 'var(--mono)', color: 'var(--text-muted)', flexShrink: 0 }}>{log.time}</span>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: log.type === 'success' ? 'var(--green)' : 'var(--blue)', flexShrink: 0 }}></div>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{log.msg}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
