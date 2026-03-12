import { useEffect, useState, useRef } from 'react';

type SensorSample = {
    ax: number;
    ay: number;
    az: number;
    gx: number;
    gy: number;
    gz: number;
};

type SensorPayload = {
    ax?: number;
    ay?: number;
    az?: number;
    gx?: number;
    gy?: number;
    gz?: number;
};

declare global {
    interface WindowEventMap {
        'motioncare-sensor': CustomEvent<SensorPayload>;
    }
}

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

function makePath(data: number[], w: number, h: number, pad = 4) {
    const min = Math.min(...data) - 2;
    const max = Math.max(...data) + 2;
    const xStep = (w - pad * 2) / (data.length - 1);
    const pts = data.map((v, i) => [pad + i * xStep, h - pad - ((v - min) / (max - min)) * (h - pad * 2)]);
    const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const area = d + ` L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
    return { d, area };
}

function ArmModel({ idPrefix }: { idPrefix: string }) {
    return (
        <>
            <defs>
                <linearGradient id={`${idPrefix}-skin`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7dd3fc" />
                    <stop offset="52%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#0891b2" />
                </linearGradient>
                <linearGradient id={`${idPrefix}-shade`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(14, 116, 144, 0.0)" />
                    <stop offset="100%" stopColor="rgba(8, 145, 178, 0.45)" />
                </linearGradient>
                <linearGradient id={`${idPrefix}-forearm`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#67e8f9" />
                    <stop offset="100%" stopColor="#0e7490" />
                </linearGradient>
            </defs>

            {/* Forearm and elbow segment for full arm visualization */}
            <path
                d="M40 242 C34 232, 30 216, 30 198 C30 173, 38 150, 50 136 C62 122, 75 122, 88 136 C100 150, 108 173, 108 198 C108 216, 104 232, 98 242 Z"
                fill={`url(#${idPrefix}-forearm)`}
                opacity="0.96"
            />
            <ellipse cx="69" cy="248" rx="30" ry="14" fill="rgba(14,116,144,.72)" />
            <ellipse cx="69" cy="248" rx="22" ry="9" fill="rgba(125,211,252,.26)" />

            {/* Wrist joint */}
            <ellipse cx="69" cy="170" rx="22" ry="10" fill="rgba(125,211,252,.34)" />

            {/* Wrist + palm base */}
            <path d="M34 164 C28 152, 29 133, 33 112 C36 94, 40 82, 48 73 C55 64, 64 60, 74 62 C85 64, 93 72, 97 84 C101 97, 101 116, 97 132 C93 148, 88 160, 80 166 Z" fill={`url(#${idPrefix}-skin)`} opacity="0.98" />

            {/* Fingers */}
            <rect x="44" y="18" width="14" height="62" rx="7" fill={`url(#${idPrefix}-skin)`} />
            <rect x="60" y="10" width="14" height="68" rx="7" fill={`url(#${idPrefix}-skin)`} />
            <rect x="76" y="14" width="13" height="62" rx="6.5" fill={`url(#${idPrefix}-skin)`} />
            <rect x="90" y="28" width="11" height="48" rx="5.5" fill={`url(#${idPrefix}-skin)`} />

            {/* Thumb */}
            <path d="M25 86 C19 82, 12 86, 11 93 C10 99, 14 104, 21 106 L38 110 L41 97 Z" fill={`url(#${idPrefix}-skin)`} />

            {/* Palm muscle shading */}
            <ellipse cx="67" cy="105" rx="26" ry="24" fill={`url(#${idPrefix}-shade)`} />

            {/* Knuckles */}
            <circle cx="51" cy="79" r="2.6" fill="rgba(240,249,255,.58)" />
            <circle cx="67" cy="76" r="2.6" fill="rgba(240,249,255,.58)" />
            <circle cx="82" cy="78" r="2.5" fill="rgba(240,249,255,.58)" />
            <circle cx="95" cy="83" r="2.2" fill="rgba(240,249,255,.52)" />

            {/* Nail highlights */}
            <rect x="47" y="20" width="8" height="8" rx="3" fill="rgba(240,249,255,.5)" />
            <rect x="63" y="12" width="8" height="8" rx="3" fill="rgba(240,249,255,.5)" />
            <rect x="79" y="16" width="7" height="7" rx="3" fill="rgba(240,249,255,.45)" />
            <rect x="92" y="30" width="6" height="6" rx="3" fill="rgba(240,249,255,.45)" />

            {/* Outline for depth */}
            <path
                d="M34 164 C28 152, 29 133, 33 112 C36 94, 40 82, 48 73 C55 64, 64 60, 74 62 C85 64, 93 72, 97 84 C101 97, 101 116, 97 132 C93 148, 88 160, 80 166 Z"
                fill="none"
                stroke="rgba(125,211,252,.55)"
                strokeWidth="1.2"
            />

            {/* Forearm outline */}
            <path
                d="M40 242 C34 232, 30 216, 30 198 C30 173, 38 150, 50 136 C62 122, 75 122, 88 136 C100 150, 108 173, 108 198 C108 216, 104 232, 98 242"
                fill="none"
                stroke="rgba(125,211,252,.48)"
                strokeWidth="1.3"
            />
        </>
    );
}

export default function MotionPanel() {
    const [angle, setAngle] = useState(35);
    const [ax, setAx] = useState(0);
    const [ay, setAy] = useState(0);
    const [az, setAz] = useState(0.93);
    const [gx, setGx] = useState(12.4);
    const [gy, setGy] = useState(-5.7);
    const [gz, setGz] = useState(0);
    const [renderX, setRenderX] = useState(0);
    const [renderY, setRenderY] = useState(0);
    const [renderTilt, setRenderTilt] = useState(0);
    const [renderScaleY, setRenderScaleY] = useState(1);
    const [isFullscreenSim, setIsFullscreenSim] = useState(false);
    const [sensorMode, setSensorMode] = useState<'SIMULATED' | 'LIVE SENSOR'>('SIMULATED');
    const [guidance, setGuidance] = useState('Hold steady in the center target');
    const [direction, setDirection] = useState('CENTERED');
    const [repCount, setRepCount] = useState(18);
    const [motBuf, setMotBuf] = useState<number[]>(() =>
        Array.from({ length: 40 }, (_, i) => Math.sin(i * 0.4) * 20 + 24 + Math.random() * 8)
    );
    const sampleRef = useRef<SensorSample>({ ax: 0, ay: 0, az: 0.93, gx: 12.4, gy: -5.7, gz: 0 });
    const motionTrendRef = useRef(0);
    const lastLiveSampleAtRef = useRef(0);

    useEffect(() => {
        const interval = setInterval(() => {
            const mot = Math.sin(Date.now() / 1200) * 22 + 24 + Math.random() * 6;
            setMotBuf((prev) => [...prev.slice(1), mot]);
        }, 1200);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const pushSample = (sample: SensorSample, live = false) => {
            sampleRef.current = {
                ax: clamp(sample.ax, -2, 2),
                ay: clamp(sample.ay, -2, 2),
                az: clamp(sample.az, -2, 2),
                gx: clamp(sample.gx, -350, 350),
                gy: clamp(sample.gy, -350, 350),
                gz: clamp(sample.gz, -350, 350),
            };
            if (live) {
                lastLiveSampleAtRef.current = Date.now();
                setSensorMode('LIVE SENSOR');
            }
        };

        const onCustomSensor = (event: CustomEvent<SensorPayload>) => {
            const payload = event.detail;
            if (!payload) {
                return;
            }
            pushSample(
                {
                    ax: payload.ax ?? sampleRef.current.ax,
                    ay: payload.ay ?? sampleRef.current.ay,
                    az: payload.az ?? sampleRef.current.az,
                    gx: payload.gx ?? sampleRef.current.gx,
                    gy: payload.gy ?? sampleRef.current.gy,
                    gz: payload.gz ?? sampleRef.current.gz,
                },
                true
            );
        };

        window.addEventListener('motioncare-sensor', onCustomSensor as EventListener);

        const onDeviceMotion = (event: DeviceMotionEvent) => {
            const acc = event.accelerationIncludingGravity;
            const rot = event.rotationRate;
            if (!acc) {
                return;
            }
            pushSample(
                {
                    ax: (acc.x ?? 0) / 9.81,
                    ay: (acc.y ?? 0) / 9.81,
                    az: (acc.z ?? 0) / 9.81,
                    gx: rot?.beta ?? 0,
                    gy: rot?.gamma ?? 0,
                    gz: rot?.alpha ?? 0,
                },
                true
            );
        };

        if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
            window.addEventListener('devicemotion', onDeviceMotion);
        }

        const simInterval = setInterval(() => {
            if (Date.now() - lastLiveSampleAtRef.current < 1200) {
                return;
            }
            setSensorMode('SIMULATED');
            motionTrendRef.current += 0.03;
            const t = motionTrendRef.current;
            pushSample({
                ax: Math.sin(t) * 0.5,
                ay: Math.cos(t) * 0.25,
                az: 0.93 + Math.cos(t * 0.45) * 0.04,
                gx: Math.sin(t * 1.2) * 18,
                gy: Math.cos(t * 0.9) * 13,
                gz: Math.sin(t * 1.3) * 15,
            });
            if (Math.sin(t) > 0.9 && Math.sin(t - 0.03) <= 0.9) {
                setRepCount((c) => c + 1);
            }
        }, 80);

        const renderInterval = setInterval(() => {
            const current = sampleRef.current;
            const targetX = clamp(current.ax * 100, -120, 120);
            const targetY = clamp(-current.ay * 100, -120, 120);
            const targetTilt = clamp(current.gz * 1.8, -28, 28);
            const targetScaleY = clamp(1 - Math.abs(current.gx) / 800, 0.88, 1.06);

            setRenderX((prev) => prev + (targetX - prev) * 0.3);
            setRenderY((prev) => prev + (targetY - prev) * 0.3);
            setRenderTilt((prev) => prev + (targetTilt - prev) * 0.25);
            setRenderScaleY((prev) => prev + (targetScaleY - prev) * 0.25);

            setAx(current.ax);
            setAy(current.ay);
            setAz(current.az);
            setGx(current.gx);
            setGy(current.gy);
            setGz(current.gz);
            setAngle(Math.round(35 + current.ax * 18));

            const absX = Math.abs(targetX);
            const absY = Math.abs(targetY);
            const centered = absX <= 18 && absY <= 18;
            if (centered) {
                setDirection('CENTERED');
                setGuidance('Perfect. Keep your hand inside the center target.');
            } else {
                const xHint = targetX < -18 ? 'right' : targetX > 18 ? 'left' : '';
                const yHint = targetY < -18 ? 'down' : targetY > 18 ? 'up' : '';
                const joinWord = xHint && yHint ? ' and ' : '';
                const moveHint = `${xHint}${joinWord}${yHint}`.trim();
                setDirection(targetX < -18 ? 'LEFT' : targetX > 18 ? 'RIGHT' : targetY < -18 ? 'UP' : 'DOWN');
                setGuidance(`Adjust hand ${moveHint} to match the ideal position.`);
            }
        }, 33);

        return () => {
            clearInterval(simInterval);
            clearInterval(renderInterval);
            window.removeEventListener('motioncare-sensor', onCustomSensor as EventListener);
            window.removeEventListener('devicemotion', onDeviceMotion);
        };
    }, []);

    useEffect(() => {
        if (!isFullscreenSim) {
            return;
        }
        const onEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsFullscreenSim(false);
            }
        };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, [isFullscreenSim]);

    const motSpark = makePath(motBuf, 320, 48);
    const fmtSigned = (value: number, digits: number) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
    const handTransform = `translate(${renderX}px, ${renderY}px) rotate(${renderTilt}deg) scaleY(${renderScaleY})`;

    return (
        <>
            <div className="section grid-2" style={{ alignItems: 'start' }}>
            {/* Hand Movement Analysis */}
            <div className="card">
                <div className="card-header">
                    <div className="card-title">
                        <div className="card-title-icon" style={{ background: 'rgba(34,211,238,.12)' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                                <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                            </svg>
                        </div>
                        Hand Movement Analysis
                        <span className="mini-tag" style={{ background: 'rgba(34,211,238,.1)', color: '#22d3ee', border: '1px solid rgba(34,211,238,.2)' }}>MPU6050</span>
                    </div>
                    <span className="mini-tag tag-live">LIVE</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '18px', alignItems: 'start' }}>
                    <div>
                        <button
                            type="button"
                            className="hand-sim-launch"
                            onClick={() => setIsFullscreenSim(true)}
                            title="Open real-time simulation in fullscreen"
                        >
                            <div className="hand-3d-wrap" style={{ width: '160px', height: '160px' }}>
                                <div className="hand-target-ring" aria-hidden="true"></div>
                                <svg className="hand-svg" width="120" height="220" viewBox="0 0 140 270" style={{ transform: handTransform }}>
                                    <ArmModel idPrefix="arm-card" />
                                </svg>
                            </div>
                        </button>
                        <div style={{ marginTop: '12px', textAlign: 'center' }}>
                            <div className="angle-big">{angle}°</div>
                            <div className="angle-axis">Flexion Angle</div>
                            <div className="hand-guidance-text">{guidance}</div>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '.1em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Sensor Readings</div>
                        <div className="sensor-row"><span className="sensor-label">Accel X</span><span className="sensor-value">{fmtSigned(ax, 2)} g</span></div>
                        <div className="sensor-row"><span className="sensor-label">Accel Y</span><span className="sensor-value">{fmtSigned(ay, 2)} g</span></div>
                        <div className="sensor-row"><span className="sensor-label">Accel Z</span><span className="sensor-value">{fmtSigned(az, 2)} g</span></div>
                        <div className="sensor-row"><span className="sensor-label">Gyro X</span><span className="sensor-value">{fmtSigned(gx, 1)} °/s</span></div>
                        <div className="sensor-row"><span className="sensor-label">Gyro Y</span><span className="sensor-value">{fmtSigned(gy, 1)} °/s</span></div>
                        <div className="sensor-row"><span className="sensor-label">Gyro Z</span><span className="sensor-value">{fmtSigned(gz, 1)} °/s</span></div>
                        <div className="exercise-rep" style={{ marginTop: '14px', padding: '14px' }}>
                            <div className="rep-count">{repCount}</div>
                            <div className="rep-label">Repetitions</div>
                            <div className="rep-goal">Goal: 30 reps · {Math.round((repCount / 30) * 100)}%</div>
                        </div>
                    </div>
                </div>

                <div className="sensor-runtime-meta">
                    <span className="mini-tag" style={{ background: sensorMode === 'LIVE SENSOR' ? 'rgba(52,211,153,.12)' : 'rgba(251,191,36,.12)', color: sensorMode === 'LIVE SENSOR' ? 'var(--green)' : 'var(--orange)', border: `1px solid ${sensorMode === 'LIVE SENSOR' ? 'rgba(52,211,153,.35)' : 'rgba(251,191,36,.35)'}` }}>{sensorMode}</span>
                    <span className="mini-tag" style={{ background: 'rgba(96,165,250,.12)', color: 'var(--blue)', border: '1px solid rgba(96,165,250,.3)' }}>Direction: {direction}</span>
                    <span className="mini-tag" style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)', border: '1px solid rgba(167,139,250,.3)' }}>Tap hand for fullscreen</span>
                </div>

                <div className="divider"></div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '.1em', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Movement Stability</div>
                <div className="stability-bar-wrap">
                    <div className="stability-bar-label"><span>Stability Score</span><span style={{ fontWeight: 700, color: 'var(--teal)' }}>84%</span></div>
                    <div className="stability-bar-track"><div className="stability-bar-fill" style={{ width: '84%' }}></div></div>
                </div>
                <div className="vital-chart" style={{ marginTop: '14px' }}>
                    <svg className="sparkline" width="100%" height="48" viewBox="0 0 320 48" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="motGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#22d3ee" stopOpacity=".2" />
                                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path fill="url(#motGrad)" d={motSpark.area} />
                        <path fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" d={motSpark.d} style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,.4))' }} />
                    </svg>
                </div>
            </div>

            {/* Exercise Quality + AI Insights stacked */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Exercise Quality */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(52,211,153,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            </div>
                            Exercise Quality Detection
                        </div>
                        <span className="mini-tag tag-ai">AI</span>
                    </div>
                    <div className="quality-row">
                        <div className="quality-icon" style={{ background: 'rgba(52,211,153,.12)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                        <div><div className="quality-label" style={{ color: 'var(--green)' }}>Correct Movement</div><div className="quality-sub">Wrist flexion detected</div></div>
                        <div className="quality-val" style={{ color: 'var(--green)' }}>✓</div>
                    </div>
                    <div className="quality-row">
                        <div className="quality-icon" style={{ background: 'rgba(34,211,238,.12)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        </div>
                        <div><div className="quality-label" style={{ color: 'var(--teal)' }}>Stability Score</div><div className="quality-sub">Above threshold</div></div>
                        <div className="quality-val" style={{ color: 'var(--teal)' }}>84%</div>
                    </div>
                    <div className="quality-row">
                        <div className="quality-icon" style={{ background: 'rgba(251,191,36,.12)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        </div>
                        <div><div className="quality-label" style={{ color: 'var(--orange)' }}>Angle Deviation</div><div className="quality-sub">3° below target range</div></div>
                        <div className="quality-val" style={{ color: 'var(--orange)' }}>−3°</div>
                    </div>
                    <div style={{ marginTop: '14px', padding: '14px', background: 'linear-gradient(135deg, rgba(34,211,238,.06), rgba(52,211,153,.04))', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(34,211,238,.15)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal)', marginBottom: '4px' }}>🤖 AI Recommendation</div>
                        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>Increase wrist flexion angle by 3–5°. Maintain current movement speed. Form is otherwise excellent.</div>
                    </div>
                </div>

                {/* AI Insights */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,.1), rgba(139,92,246,.1))' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 0 1 10 10" /><path d="M12 6a6 6 0 0 1 6 6" /><circle cx="12" cy="12" r="2" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></svg>
                            </div>
                            AI Insights
                        </div>
                        <div className="ai-badge">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
                            LIVE AI
                        </div>
                    </div>
                    <div className="insight-card warn">
                        <div className="insight-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></div>
                        <div><div className="insight-text">Hand angle is slightly below the recommended range (target: 45°).</div><div className="insight-time">12:44:51 PM</div></div>
                    </div>
                    <div className="insight-card success">
                        <div className="insight-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg></div>
                        <div><div className="insight-text">Exercise movement detected as correct. Form maintained for {repCount} reps.</div><div className="insight-time">12:44:38 PM</div></div>
                    </div>
                    <div className="insight-card info">
                        <div className="insight-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg></div>
                        <div><div className="insight-text">Heart rate slightly elevated at 78 BPM. Consider a 2-minute rest break.</div><div className="insight-time">12:43:20 PM</div></div>
                    </div>
                </div>
            </div>

            {isFullscreenSim && (
                <div className="hand-sim-overlay" role="dialog" aria-modal="true" aria-label="Live hand simulation fullscreen">
                    <div className="hand-sim-overlay-panel">
                        <div className="hand-sim-overlay-header">
                            <div>
                                <div className="hand-sim-overlay-title">Live Hand Simulation</div>
                                <div className="hand-sim-overlay-sub">Mirror of real-time sensor movement for left, right, up, and down tracking</div>
                            </div>
                            <button type="button" className="hand-sim-close" onClick={() => setIsFullscreenSim(false)}>
                                Close
                            </button>
                        </div>

                        <div className="hand-sim-stage-wrap">
                            <div className="hand-sim-stage">
                                <div className="hand-stage-crosshair" aria-hidden="true"></div>
                                <svg className="hand-sim-stage-svg" width="270" height="430" viewBox="0 0 140 270" style={{ transform: handTransform }}>
                                    <ArmModel idPrefix="arm-fullscreen" />
                                </svg>
                            </div>

                            <div className="hand-sim-sidepanel">
                                <div className="hand-sim-status">{sensorMode}</div>
                                <div className="hand-sim-guidance">{guidance}</div>
                                <div className="hand-sim-metrics">X: {fmtSigned(renderX, 0)}px</div>
                                <div className="hand-sim-metrics">Y: {fmtSigned(renderY, 0)}px</div>
                                <div className="hand-sim-metrics">Angle: {angle}°</div>
                                <div className="hand-sim-metrics">Direction: {direction}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </>
    );
}
