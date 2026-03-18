import { useEffect, useState, useRef } from 'react';
import {
    ExerciseDetector,
    type ExerciseDetectionOutput,
    type ExerciseType,
} from '../services/exerciseDetection';
import { subscribeToPatientLiveData } from '../services/realtimeDbService';
import type { SensorSample as RealtimeSensorSample } from '../types/sensor';

type MotionSensorSample = {
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

const EXERCISE_META: Record<ExerciseType, { label: string; cue: string; targetAngle: number }> = {
    wrist_flexion: {
        label: 'Wrist Flexion',
        cue: 'Bend wrist downward',
        targetAngle: -40,
    },
    wrist_extension: {
        label: 'Wrist Extension',
        cue: 'Bend wrist upward',
        targetAngle: 40,
    },
    wrist_rotation: {
        label: 'Wrist Rotation',
        cue: 'Rotate wrist in a controlled motion',
        targetAngle: 60,
    },
    radial_deviation: {
        label: 'Radial Deviation',
        cue: 'Tilt wrist toward thumb side',
        targetAngle: 20,
    },
    ulnar_deviation: {
        label: 'Ulnar Deviation',
        cue: 'Tilt wrist toward little finger side',
        targetAngle: -25,
    },
};

type DirectionLabel =
    | 'UP'
    | 'DOWN'
    | 'LEFT'
    | 'RIGHT'
    | 'CLOCKWISE'
    | 'COUNTERCLOCKWISE'
    | 'STILL';

const EXERCISE_DIRECTION: Record<ExerciseType, DirectionLabel> = {
    wrist_flexion: 'DOWN',
    wrist_extension: 'UP',
    wrist_rotation: 'CLOCKWISE',
    radial_deviation: 'RIGHT',
    ulnar_deviation: 'LEFT',
};

function resolveUserDirection(exercise: ExerciseType, sample: MotionSensorSample): DirectionLabel {
    switch (exercise) {
        case 'wrist_flexion':
        case 'wrist_extension':
            if (sample.gx > 8) return 'UP';
            if (sample.gx < -8) return 'DOWN';
            return 'STILL';
        case 'radial_deviation':
        case 'ulnar_deviation':
            if (sample.gy > 8) return 'RIGHT';
            if (sample.gy < -8) return 'LEFT';
            return 'STILL';
        case 'wrist_rotation':
            if (sample.gz > 10) return 'CLOCKWISE';
            if (sample.gz < -10) return 'COUNTERCLOCKWISE';
            return 'STILL';
        default:
            return 'STILL';
    }
}

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
type MotionPanelProps = {
    patientUid?: string;
};

export default function MotionPanel({ patientUid }: MotionPanelProps) {
    const [selectedExercise, setSelectedExercise] = useState<ExerciseType>('wrist_flexion');
    const [isExerciseMenuOpen, setIsExerciseMenuOpen] = useState(false);
    const [angle, setAngle] = useState(0);
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
    const [guidance, setGuidance] = useState('Select exercise and start movement');
    const [direction, setDirection] = useState<DirectionLabel>('STILL');
    const [repCount, setRepCount] = useState(0);
    const [analysis, setAnalysis] = useState<ExerciseDetectionOutput>({
        exercise: 'wrist_flexion',
        current_angle: 0,
        target_angle: EXERCISE_META.wrist_flexion.targetAngle,
        repetitions: 0,
        stability_score: 100,
        movement_quality: 'incorrect',
    });
    const [motBuf, setMotBuf] = useState<number[]>(() =>
        Array.from({ length: 40 }, (_, i) => Math.sin(i * 0.4) * 20 + 24 + Math.random() * 8)
    );
    const sampleRef = useRef<MotionSensorSample>({ ax: 0, ay: 0, az: 0.93, gx: 12.4, gy: -5.7, gz: 0 });
    const detectorRef = useRef<ExerciseDetector>(new ExerciseDetector('wrist_flexion'));
    const motionTrendRef = useRef(0);
    const lastLiveSampleAtRef = useRef(0);
    const exerciseMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        detectorRef.current.setExercise(selectedExercise, true);
        setIsExerciseMenuOpen(false);
        setRepCount(0);
        setAnalysis({
            exercise: selectedExercise,
            current_angle: 0,
            target_angle: EXERCISE_META[selectedExercise].targetAngle,
            repetitions: 0,
            stability_score: 100,
            movement_quality: 'incorrect',
        });
        setGuidance(`Selected ${EXERCISE_META[selectedExercise].label}. ${EXERCISE_META[selectedExercise].cue}.`);
    }, [selectedExercise]);

    useEffect(() => {
        const onDocClick = (event: MouseEvent) => {
            if (!exerciseMenuRef.current) {
                return;
            }
            const target = event.target;
            if (target instanceof Node && !exerciseMenuRef.current.contains(target)) {
                setIsExerciseMenuOpen(false);
            }
        };

        const onEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsExerciseMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onEscape);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEscape);
        };
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            const mot = Math.sin(Date.now() / 1200) * 22 + 24 + Math.random() * 6;
            setMotBuf((prev) => [...prev.slice(1), mot]);
        }, 1200);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const pushSample = (sample: MotionSensorSample, live = false) => {
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

        let unsubscribeDb = () => {};
        if (patientUid) {
            unsubscribeDb = subscribeToPatientLiveData(
                patientUid,
                (next: RealtimeSensorSample | null) => {
                    if (!next) return;
                    pushSample(
                        {
                            ax: next.acc_x,
                            ay: next.acc_y,
                            az: next.acc_z,
                            gx: next.gyro_x,
                            gy: next.gyro_y,
                            gz: next.gyro_z,
                        },
                        true,
                    );
                },
                () => {
                    // Keep existing browser/device/sim fallback when RTDB stream errors.
                },
            );
        }

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
            if (Date.now() - lastLiveSampleAtRef.current < 5000) {
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

            const nextResult = detectorRef.current.update({
                timestampMs: Date.now(),
                accelX: current.ax,
                accelY: current.ay,
                accelZ: current.az,
                gyroX: current.gx,
                gyroY: current.gy,
                gyroZ: current.gz,
            });
            setAnalysis(nextResult);
            setRepCount(nextResult.repetitions);
            setAngle(nextResult.current_angle);

            const absX = Math.abs(targetX);
            const absY = Math.abs(targetY);
            const centered = absX <= 18 && absY <= 18;
            const expectedDirection = EXERCISE_DIRECTION[selectedExercise];
            const userDirection = resolveUserDirection(selectedExercise, current);
            setDirection(userDirection);

            if (userDirection === 'STILL' || centered) {
                setGuidance(`Move ${expectedDirection.toLowerCase()} for ${selectedExerciseMeta.label}.`);
            } else if (userDirection === expectedDirection) {
                setGuidance(`Correct direction (${userDirection}). Continue and return to neutral for rep count.`);
            } else {
                setGuidance(`Incorrect direction (${userDirection}). Move ${expectedDirection.toLowerCase()} instead.`);
            }
        }, 33);

        return () => {
            clearInterval(simInterval);
            clearInterval(renderInterval);
            unsubscribeDb();
            window.removeEventListener('motioncare-sensor', onCustomSensor as EventListener);
            window.removeEventListener('devicemotion', onDeviceMotion);
        };
    }, [patientUid, selectedExercise]);

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
    const selectedExerciseMeta = EXERCISE_META[selectedExercise];
    const expectedDirection = EXERCISE_DIRECTION[selectedExercise];
    const isDirectionCorrect = direction === expectedDirection;
    const angleDeviation = analysis.current_angle - analysis.target_angle;
    const qualityColor = isDirectionCorrect ? 'var(--green)' : 'var(--orange)';
    const qualityLabel = isDirectionCorrect ? 'Correct Direction' : 'Incorrect Direction';

    return (
        <>
            <div className="section grid-2 motion-panel-layout" style={{ alignItems: 'start' }}>
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

                <div className="exercise-select-row">
                    <span className="exercise-select-label">Exercise</span>
                    <div className="exercise-select-menu" ref={exerciseMenuRef}>
                        <button
                            type="button"
                            className="exercise-select-trigger"
                            aria-haspopup="listbox"
                            aria-expanded={isExerciseMenuOpen}
                            onClick={() => setIsExerciseMenuOpen((prev) => !prev)}
                        >
                            <span>{selectedExerciseMeta.label}</span>
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ transform: isExerciseMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s ease' }}
                            >
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        {isExerciseMenuOpen && (
                            <div className="exercise-select-options" role="listbox" aria-label="Exercise list">
                                {Object.entries(EXERCISE_META).map(([value, item]) => {
                                    const active = value === selectedExercise;
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            className={`exercise-option ${active ? 'active' : ''}`}
                                            role="option"
                                            aria-selected={active}
                                            onClick={() => setSelectedExercise(value as ExerciseType)}
                                        >
                                            <span className="exercise-option-label">{item.label}</span>
                                            <span className="exercise-option-cue">{item.cue}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <span className="exercise-target-chip">Target: {analysis.target_angle}°</span>
                </div>

                <div className="motion-card-grid">
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
                            <div className="angle-axis">{selectedExerciseMeta.label} Angle</div>
                            <div className="hand-guidance-text">{guidance}</div>
                        </div>
                    </div>
                    <div>
                        <div className="sensor-heading">Sensor Readings</div>
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
                    <span className={`runtime-pill ${sensorMode === 'LIVE SENSOR' ? 'runtime-pill-live' : 'runtime-pill-sim'}`}>{sensorMode}</span>
                    <span className="runtime-pill runtime-pill-direction">Correct Direction: {expectedDirection}</span>
                    <span className="runtime-pill runtime-pill-direction">Your Direction: {direction}</span>
                    <span className="runtime-pill runtime-pill-exercise">{selectedExerciseMeta.label}</span>
                </div>

                <div className="divider"></div>
                <div className="sensor-heading">Movement Stability</div>
                <div className="stability-bar-wrap">
                    <div className="stability-bar-label"><span>Stability Score</span><span style={{ fontWeight: 700, color: 'var(--teal)' }}>{analysis.stability_score}%</span></div>
                    <div className="stability-bar-track"><div className="stability-bar-fill" style={{ width: `${analysis.stability_score}%` }}></div></div>
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
            <div className="stack-column">
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
                        <div className="quality-icon" style={{ background: isDirectionCorrect ? 'rgba(52,211,153,.12)' : 'rgba(251,191,36,.12)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isDirectionCorrect ? '#34d399' : '#fbbf24'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                        <div><div className="quality-label" style={{ color: qualityColor }}>{qualityLabel}</div><div className="quality-sub">Correct: {expectedDirection} · Your: {direction}</div></div>
                        <div className="quality-val" style={{ color: qualityColor }}>{isDirectionCorrect ? '✓' : '!'}</div>
                    </div>
                    <div className="quality-row">
                        <div className="quality-icon" style={{ background: 'rgba(34,211,238,.12)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        </div>
                        <div><div className="quality-label" style={{ color: 'var(--teal)' }}>Stability Score</div><div className="quality-sub">{analysis.stability_score >= 70 ? 'Above threshold' : 'Needs steadier control'}</div></div>
                        <div className="quality-val" style={{ color: 'var(--teal)' }}>{analysis.stability_score}%</div>
                    </div>
                    <div className="quality-row">
                        <div className="quality-icon" style={{ background: 'rgba(251,191,36,.12)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        </div>
                        <div><div className="quality-label" style={{ color: 'var(--orange)' }}>Angle Deviation</div><div className="quality-sub">Difference from target angle</div></div>
                        <div className="quality-val" style={{ color: 'var(--orange)' }}>{angleDeviation > 0 ? '+' : ''}{angleDeviation}°</div>
                    </div>
                    <div className="ai-recommendation-panel">
                        <div className="ai-recommendation-title">AI Recommendation</div>
                        <div className="ai-recommendation-copy">
                            {isDirectionCorrect
                                ? `Direction is correct (${direction}). Keep controlled return to neutral for repetition counting.`
                                : `Move ${expectedDirection.toLowerCase()} for ${selectedExerciseMeta.label}. Your current direction is ${direction}.`}
                        </div>
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
                        <div><div className="insight-text">Current angle {analysis.current_angle}° vs target {analysis.target_angle}° for {selectedExerciseMeta.label}.</div><div className="insight-time">Live</div></div>
                    </div>
                    <div className="insight-card success">
                        <div className="insight-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg></div>
                        <div><div className="insight-text">Direction check: expected {expectedDirection}, current {direction}. Correct repetitions counted: {repCount}.</div><div className="insight-time">Live</div></div>
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
                                <div className="hand-sim-metrics">Target: {analysis.target_angle}°</div>
                                <div className="hand-sim-metrics">Direction: {direction}</div>
                                <div className="hand-sim-metrics">Quality: {analysis.movement_quality}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </>
    );
}
