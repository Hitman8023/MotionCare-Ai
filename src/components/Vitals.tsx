import { useEffect, useState } from 'react';

function makePath(data: number[], w: number, h: number, pad = 4) {
    const min = Math.min(...data) - 2;
    const max = Math.max(...data) + 2;
    const xStep = (w - pad * 2) / (data.length - 1);
    const pts = data.map((v, i) => [pad + i * xStep, h - pad - ((v - min) / (max - min)) * (h - pad * 2)]);
    const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const area = d + ` L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
    return { d, area };
}

export default function Vitals() {
    const [hr, setHr] = useState(78);
    const [spo2, setSpo2] = useState(98.2);
    const [temp, setTemp] = useState(36.7);

    const [hrBuf, setHrBuf] = useState<number[]>(() =>
        Array.from({ length: 30 }, (_, i) => 70 + Math.sin(i * 0.3) * 8 + Math.random() * 4)
    );
    const [spo2Buf, setSpo2Buf] = useState<number[]>(() =>
        Array.from({ length: 30 }, (_, i) => 97 + Math.sin(i * 0.2) * 0.8 + Math.random() * 0.4)
    );
    const [tempBuf, setTempBuf] = useState<number[]>(() =>
        Array.from({ length: 30 }, (_, i) => 36.5 + Math.sin(i * 0.1) * 0.3 + Math.random() * 0.1)
    );

    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const newHr = Math.round(72 + Math.sin(now / 4000) * 8 + Math.random() * 4);
            setHr(newHr);
            setHrBuf((prev) => [...prev.slice(1), newHr]);

            const newSpo2 = 97.2 + Math.sin(now / 6000) * 0.6 + Math.random() * 0.3;
            setSpo2(newSpo2);
            setSpo2Buf((prev) => [...prev.slice(1), newSpo2]);

            const newTemp = 36.6 + Math.sin(now / 8000) * 0.2 + Math.random() * 0.05;
            setTemp(newTemp);
            setTempBuf((prev) => [...prev.slice(1), newTemp]);
        }, 1200);
        return () => clearInterval(interval);
    }, []);

    const hrSpark = makePath(hrBuf, 240, 56);
    const spo2Spark = makePath(spo2Buf, 240, 56);
    const tempSpark = makePath(tempBuf, 240, 56);

    return (
        <div className="section">
            <div className="vitals-grid">
                {/* Heart Rate */}
                <div className="card vital-card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(248,113,113,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                </svg>
                            </div>
                            Heart Rate
                        </div>
                        <span className="mini-tag tag-live">LIVE</span>
                    </div>
                    <div className="vital-value" style={{ color: 'var(--red)' }}>
                        {Math.round(hr)}<span className="vital-unit">BPM</span>
                    </div>
                    <div className="vital-status" style={{ background: 'rgba(52,211,153,.1)', color: 'var(--green)', border: '1px solid rgba(52,211,153,.2)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
                        Normal Range
                    </div>
                    <div className="vital-chart">
                        <svg className="sparkline" width="100%" height="56" viewBox="0 0 240 56" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f87171" stopOpacity=".25" />
                                    <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path fill="url(#hrGrad)" d={hrSpark.area} />
                            <path fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" d={hrSpark.d} style={{ filter: 'drop-shadow(0 0 6px rgba(248,113,113,.4))' }} />
                        </svg>
                    </div>
                </div>

                {/* SpO2 */}
                <div className="card vital-card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(167,139,250,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2v20M2 7h5M17 7h5M2 17h5M17 17h5" />
                                </svg>
                            </div>
                            SpO₂
                        </div>
                        <span className="mini-tag tag-live">LIVE</span>
                    </div>
                    <div className="vital-value" style={{ color: 'var(--purple)' }}>
                        {spo2.toFixed(1)}<span className="vital-unit">%</span>
                    </div>
                    <div className="vital-status" style={{ background: 'rgba(52,211,153,.1)', color: 'var(--green)', border: '1px solid rgba(52,211,153,.2)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
                        Optimal
                    </div>
                    <div className="vital-chart">
                        <svg className="sparkline" width="100%" height="56" viewBox="0 0 240 56" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#a78bfa" stopOpacity=".25" />
                                    <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path fill="url(#spo2Grad)" d={spo2Spark.area} />
                            <path fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" d={spo2Spark.d} style={{ filter: 'drop-shadow(0 0 6px rgba(167,139,250,.4))' }} />
                        </svg>
                    </div>
                </div>

                {/* Temperature */}
                <div className="card vital-card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(251,191,36,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                                </svg>
                            </div>
                            Body Temp
                        </div>
                        <span className="mini-tag" style={{ background: 'rgba(251,191,36,.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,.2)' }}>LM35</span>
                    </div>
                    <div className="vital-value" style={{ color: 'var(--orange)' }}>
                        {temp.toFixed(1)}<span className="vital-unit">°C</span>
                    </div>
                    <div className="vital-status" style={{ background: 'rgba(52,211,153,.1)', color: 'var(--green)', border: '1px solid rgba(52,211,153,.2)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
                        Normal
                    </div>
                    <div className="vital-chart">
                        <svg className="sparkline" width="100%" height="56" viewBox="0 0 240 56" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#fbbf24" stopOpacity=".25" />
                                    <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path fill="url(#tempGrad)" d={tempSpark.area} />
                            <path fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" d={tempSpark.d} style={{ filter: 'drop-shadow(0 0 6px rgba(251,191,36,.4))' }} />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
}
