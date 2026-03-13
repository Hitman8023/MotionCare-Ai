import { useEffect, useMemo, useState } from 'react';
import MotionPanel from '../components/MotionPanel';
import DoctorLiveBoard from '../components/DoctorLiveBoard';
import { subscribeToPatientLiveData } from '../services/realtimeDbService';
import type { SensorSample } from '../types/sensor';
import type { UserRole } from '../types/auth';

type LiveMonitoringProps = {
    role: UserRole;
    patientUid: string;
};

function makePath(data: number[], w: number, h: number, pad = 4) {
    const minRaw = Math.min(...data);
    const maxRaw = Math.max(...data);
    const min = minRaw - 0.2;
    const max = maxRaw + 0.2;
    const safeRange = Math.max(max - min, 0.001);
    const xStep = (w - pad * 2) / Math.max(data.length - 1, 1);
    const pts = data.map((v, i) => [pad + i * xStep, h - pad - ((v - min) / safeRange) * (h - pad * 2)]);
    const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const area = d + ` L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
    return { d, area };
}

export default function LiveMonitoring({ role, patientUid }: LiveMonitoringProps) {
    const [sample, setSample] = useState<SensorSample | null>(null);
    const [elapsed, setElapsed] = useState(0);

    const [hrBuf, setHrBuf] = useState<number[]>(() => Array.from({ length: 60 }, () => 0));
    const [spo2Buf, setSpo2Buf] = useState<number[]>(() => Array.from({ length: 60 }, () => 0));
    const [tempBuf, setTempBuf] = useState<number[]>(() => Array.from({ length: 60 }, () => 0));
    const [gyroBuf, setGyroBuf] = useState<number[]>(() => Array.from({ length: 60 }, () => 0));

    useEffect(() => {
        if (role !== 'patient' || !patientUid) {
            return;
        }

        const unsubscribe = subscribeToPatientLiveData(patientUid, (next) => {
            if (!next) return;
            setSample(next);
            const gyroMagnitude = Math.sqrt((next.gyro_x ** 2) + (next.gyro_y ** 2) + (next.gyro_z ** 2));
            setHrBuf((p) => [...p.slice(1), next.heart_rate]);
            setSpo2Buf((p) => [...p.slice(1), next.spo2]);
            setTempBuf((p) => [...p.slice(1), next.temperature]);
            setGyroBuf((p) => [...p.slice(1), gyroMagnitude]);
        });

        return unsubscribe;
    }, [role, patientUid]);

    useEffect(() => {
        if (role !== 'patient') {
            return;
        }
        const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
        return () => clearInterval(tick);
    }, [role]);

    const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const hrPath = useMemo(() => makePath(hrBuf, 500, 100), [hrBuf]);
    const spo2Path = useMemo(() => makePath(spo2Buf, 500, 100), [spo2Buf]);
    const tempPath = useMemo(() => makePath(tempBuf, 500, 100), [tempBuf]);
    const gyroPath = useMemo(() => makePath(gyroBuf, 500, 100), [gyroBuf]);

    const gyroMagnitude = sample ? Math.sqrt((sample.gyro_x ** 2) + (sample.gyro_y ** 2) + (sample.gyro_z ** 2)) : 0;

    const monitors = [
        { label: 'Heart Rate', value: sample ? String(sample.heart_rate) : '--', unit: 'BPM', color: '#f87171', path: hrPath, status: 'Normal' },
        { label: 'SpO₂', value: sample ? String(sample.spo2) : '--', unit: '%', color: '#a78bfa', path: spo2Path, status: 'Optimal' },
        { label: 'Body Temperature', value: sample ? String(sample.temperature) : '--', unit: '°C', color: '#fbbf24', path: tempPath, status: 'Normal' },
        { label: 'Gyro Magnitude', value: sample ? gyroMagnitude.toFixed(3) : '--', unit: 'rad/s', color: '#22d3ee', path: gyroPath, status: 'Live' },
    ];

    return (
        <>
            <div className="page-header">
                <div className="page-title">Live Monitoring</div>
                <div className="page-subtitle">
                    <span className="live-dot"></span>
                    {role === 'doctor'
                        ? 'Viewing all live patient streams from Firebase Realtime Database'
                        : `Real-time biometric data streams · Session ${fmt(elapsed)}`}
                </div>
            </div>

            {role === 'doctor' ? (
                <div className="section">
                    <DoctorLiveBoard />
                </div>
            ) : (
                <>
                    <div className="section">
                        <div className="card" style={{ padding: '16px 24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 10px rgba(52,211,153,.5)', animation: 'pulse-ring 2s infinite' }}></div>
                                    <span style={{ fontWeight: 700, fontSize: '14px' }}>Session Active</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>ESP32 · MPU6050 · LM35 · MAX30102</span>
                                </div>
                                <div style={{ display: 'flex', gap: '24px' }}>
                                    {[{ l: 'Duration', v: fmt(elapsed) }, { l: 'Path', v: '/liveData' }, { l: 'UID', v: `${patientUid.slice(0, 6)}...` }, { l: 'Status', v: sample ? 'Live' : 'Waiting' }].map((s, i) => (
                                        <div key={i} style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{s.v}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>{s.l}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <MotionPanel />

                    <div className="section monitor-grid">
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
                                    { time: sample?.timestamp?.slice(11, 19) ?? '--:--:--', msg: sample ? 'Realtime packet received from Firebase /liveData' : 'Waiting for first packet from Firebase /liveData', type: sample ? 'success' : 'info' },
                                    { time: '--:--:--', msg: 'ESP32 connection expected at 1 Hz sample interval', type: 'info' },
                                    { time: '--:--:--', msg: `Patient UID stream: ${patientUid}`, type: 'info' },
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
            )}
        </>
    );
}
