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

const ZERO_MOTION_SAMPLE: MotionSensorSample = {
    ax: 0,
    ay: 0,
    az: 0,
    gx: 0,
    gy: 0,
    gz: 0,
};

declare global {
    interface WindowEventMap {
        'motioncare-sensor': CustomEvent<SensorPayload>;
    }
}

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
const applyDeadzone = (value: number, threshold: number) => (Math.abs(value) < threshold ? 0 : value);
const smoothTowards = (prev: number, target: number, blend: number, maxStep: number) => {
    const eased = prev + (target - prev) * blend;
    return clamp(eased, prev - maxStep, prev + maxStep);
};
const expLerp = (deltaMs: number, tauMs: number) => {
    const alpha = 1 - Math.exp(-deltaMs / Math.max(1, tauMs));
    return clamp(alpha, 0.04, 0.92);
};

// If sensor mounting is inverted, flip signs here without touching downstream math.
const AXIS_SIGN = {
    ax: 1,
    ay: 1,
    az: 1,
    gx: 1,
    gy: 1,
    gz: 1,
} as const;

const HAND_RENDER = {
    angleToPixel: 3.9,
    tiltGain: 1.8,
    maxOffset: 165,
    maxTilt: 36,
    livePositionTauMs: 24,
    idlePositionTauMs: 62,
    liveTiltTauMs: 34,
    idleTiltTauMs: 80,
    frameIntervalMs: 14,
} as const;

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
        targetAngle: 4,
    },
    ulnar_deviation: {
        label: 'Ulnar Deviation',
        cue: 'Tilt wrist toward little finger side',
        targetAngle: -4,
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
    radial_deviation: 'LEFT',
    ulnar_deviation: 'RIGHT',
};

const EXERCISE_TARGET_TOLERANCE: Record<ExerciseType, number> = {
    wrist_flexion: 5,
    wrist_extension: 5,
    wrist_rotation: 8,
    radial_deviation: 2,
    ulnar_deviation: 2,
};

const REP_NEUTRAL_MIN = -2;
const REP_NEUTRAL_MAX = 2;
const DAILY_REP_STORAGE_KEY_PREFIX = 'motioncare:daily-reps:v1';

function updateAngle(gx: number, ax: number, ay: number, az: number, dt: number, prevAngle: number) {
    void ax;
    const accelAngle = Math.atan2(ay, az) * (180 / Math.PI);
    const alpha = 0.96;
    return alpha * (prevAngle + gx * dt) + (1 - alpha) * accelAngle;
}

function getDirectionForExercise(
    exercise: ExerciseType,
    angleMetric: number,
    sample: MotionSensorSample,
): DirectionLabel {
    if (exercise === 'wrist_rotation') {
        if (sample.gz > 10) return 'CLOCKWISE';
        if (sample.gz < -10) return 'COUNTERCLOCKWISE';
        return 'STILL';
    }

    if (exercise === 'radial_deviation' || exercise === 'ulnar_deviation') {
        if (angleMetric > 3) return 'RIGHT';
        if (angleMetric < -3) return 'LEFT';
        return 'STILL';
    }

    if (angleMetric > 15) return 'UP';
    if (angleMetric < -15) return 'DOWN';
    return 'STILL';
}

function isAtOrBeyondTarget(angle: number, target: number, tolerance: number): boolean {
    if (target >= 0) {
        return angle >= target - tolerance;
    }
    return angle <= target + tolerance;
}

function isInRepNeutralZone(angle: number): boolean {
    return angle >= REP_NEUTRAL_MIN && angle <= REP_NEUTRAL_MAX;
}

function getLocalDateKey(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getDailyRepStorageKey(patientUid?: string): string {
    return `${DAILY_REP_STORAGE_KEY_PREFIX}:${patientUid ?? 'local'}:${getLocalDateKey()}`;
}

function loadDailyRepCount(exercise: ExerciseType, patientUid?: string): number {
    if (typeof window === 'undefined') return 0;

    try {
        const raw = window.localStorage.getItem(getDailyRepStorageKey(patientUid));
        if (!raw) return 0;
        const parsed = JSON.parse(raw) as Partial<Record<ExerciseType, number>>;
        const value = parsed?.[exercise];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
        return Math.floor(value);
    } catch {
        return 0;
    }
}

function saveDailyRepCount(exercise: ExerciseType, count: number, patientUid?: string): void {
    if (typeof window === 'undefined') return;

    try {
        const key = getDailyRepStorageKey(patientUid);
        const raw = window.localStorage.getItem(key);
        const current = raw ? (JSON.parse(raw) as Partial<Record<ExerciseType, number>>) : {};
        current[exercise] = Math.max(0, Math.floor(count));
        window.localStorage.setItem(key, JSON.stringify(current));
    } catch {
        // Best-effort persistence; ignore storage quota or JSON issues.
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
    const [az, setAz] = useState(0);
    const [gx, setGx] = useState(0);
    const [gy, setGy] = useState(0);
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
        Array.from({ length: 40 }, (_, i) => Math.sin(i * 0.28) * 6 + 24)
    );
    const sampleRef = useRef<MotionSensorSample>({ ...ZERO_MOTION_SAMPLE });
    const detectorRef = useRef<ExerciseDetector>(new ExerciseDetector('wrist_flexion'));
    const lastLiveSampleAtRef = useRef(0);
    const angleXRef = useRef(0);
    const lastSampleAtRef = useRef(0);
    const sampleSeqRef = useRef(0);
    const processedSeqRef = useRef(-1);
    const repCountRef = useRef(0);
    const repArmedRef = useRef(false);
    const lastAngleLogAtRef = useRef(0);
    const lastRenderAtRef = useRef(0);
    const motLevelRef = useRef(24);
    const exerciseMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        detectorRef.current.setExercise(selectedExercise, true);
        setIsExerciseMenuOpen(false);
        const persistedRepCount = loadDailyRepCount(selectedExercise, patientUid);
        setRepCount(persistedRepCount);
        repCountRef.current = persistedRepCount;
        repArmedRef.current = false;
        setAnalysis({
            exercise: selectedExercise,
            current_angle: 0,
            target_angle: EXERCISE_META[selectedExercise].targetAngle,
            repetitions: persistedRepCount,
            stability_score: 100,
            movement_quality: 'incorrect',
        });
        angleXRef.current = 0;
        lastSampleAtRef.current = 0;
        sampleSeqRef.current = 0;
        processedSeqRef.current = -1;
        lastRenderAtRef.current = 0;
        setGuidance(`Selected ${EXERCISE_META[selectedExercise].label}. ${EXERCISE_META[selectedExercise].cue}.`);
    }, [selectedExercise, patientUid]);

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
            const current = sampleRef.current;
            const gyroEnergy = Math.hypot(current.gx, current.gy, current.gz) * 0.22;
            const accelEnergy = Math.hypot(current.ax, current.ay, current.az - 1) * 18;
            const idlePulse = Date.now() - lastLiveSampleAtRef.current > 2500 ? Math.sin(Date.now() / 780) * 2 : 0;
            const target = clamp(14 + gyroEnergy + accelEnergy + idlePulse, 6, 92);

            motLevelRef.current = motLevelRef.current + (target - motLevelRef.current) * 0.18;
            setMotBuf((prev) => [...prev.slice(1), motLevelRef.current]);
        }, 120);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const pushSample = (sample: MotionSensorSample, live = false) => {
            const prev = sampleRef.current;
            const blend = live ? 0.34 : 0.24;

            const nextAx = clamp(sample.ax, -2, 2);
            const nextAy = clamp(sample.ay, -2, 2);
            const nextAz = clamp(sample.az, -2, 2);
            const nextGx = applyDeadzone(clamp(sample.gx * AXIS_SIGN.gx, -350, 350), 0.8);
            const nextGy = applyDeadzone(clamp(sample.gy * AXIS_SIGN.gy, -350, 350), 0.8);
            const nextGz = applyDeadzone(clamp(sample.gz * AXIS_SIGN.gz, -350, 350), 0.9);
            const accelStep = live ? 0.18 : 0.1;

            sampleRef.current = {
                ax: smoothTowards(prev.ax, nextAx * AXIS_SIGN.ax, blend * 0.95, accelStep),
                ay: smoothTowards(prev.ay, nextAy * AXIS_SIGN.ay, blend * 0.95, accelStep),
                az: smoothTowards(prev.az, nextAz * AXIS_SIGN.az, blend * 0.95, accelStep),
                gx: smoothTowards(prev.gx, nextGx, blend, live ? 22 : 14),
                gy: smoothTowards(prev.gy, nextGy, blend, live ? 22 : 14),
                gz: smoothTowards(prev.gz, nextGz, blend, live ? 22 : 14),
            };

            const nowMs = Date.now();
            const dt =
                lastSampleAtRef.current > 0
                    ? clamp((nowMs - lastSampleAtRef.current) / 1000, 0.004, 0.12)
                    : HAND_RENDER.frameIntervalMs / 1000;
            lastSampleAtRef.current = nowMs;

            const current = sampleRef.current;
            const fusedAngle = updateAngle(current.gx, current.ax, current.ay, current.az, dt, angleXRef.current);
            angleXRef.current = fusedAngle;
            sampleSeqRef.current += 1;

            if (live) {
                lastLiveSampleAtRef.current = nowMs;
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
            if (patientUid) {
                return;
            }
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
            if (patientUid) {
                return;
            }
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
            // No live sensor attached: keep readings pinned to zero instead of synthetic motion.
            pushSample(ZERO_MOTION_SAMPLE);
        }, 80);

        const renderInterval = setInterval(() => {
            const current = sampleRef.current;
            const nowMs = Date.now();
            const isLiveStream = nowMs - lastLiveSampleAtRef.current < 2500;
            const frameDtMs =
                lastRenderAtRef.current > 0
                    ? clamp(nowMs - lastRenderAtRef.current, 8, 48)
                    : HAND_RENDER.frameIntervalMs;
            lastRenderAtRef.current = nowMs;

            const stabilizedFlexAngle = angleXRef.current;
            const stabilizedDeviationAngle = Math.atan2(current.ax, current.az) * (180 / Math.PI);

            if (nowMs - lastAngleLogAtRef.current >= 120) {
                console.log('ANGLE:', Number(stabilizedFlexAngle.toFixed(2)));
                lastAngleLogAtRef.current = nowMs;
            }

            const targetX = clamp(
                -stabilizedDeviationAngle * HAND_RENDER.angleToPixel,
                -HAND_RENDER.maxOffset,
                HAND_RENDER.maxOffset,
            );
            const targetY = clamp(
                -stabilizedFlexAngle * HAND_RENDER.angleToPixel,
                -HAND_RENDER.maxOffset,
                HAND_RENDER.maxOffset,
            );
            const targetTilt = clamp(
                current.gz * HAND_RENDER.tiltGain,
                -HAND_RENDER.maxTilt,
                HAND_RENDER.maxTilt,
            );
            const targetScaleY = clamp(1 - Math.abs(current.gx) / 650, 0.86, 1.08);

            const basePositionLerp = expLerp(
                frameDtMs,
                isLiveStream ? HAND_RENDER.livePositionTauMs : HAND_RENDER.idlePositionTauMs,
            );
            const baseTiltLerp = expLerp(
                frameDtMs,
                isLiveStream ? HAND_RENDER.liveTiltTauMs : HAND_RENDER.idleTiltTauMs,
            );
            const positionLerp = clamp(basePositionLerp, 0.08, 0.9);
            const tiltLerp = clamp(baseTiltLerp, 0.06, 0.86);

            setRenderX((prev) => prev + (targetX - prev) * positionLerp);
            setRenderY((prev) => prev + (targetY - prev) * positionLerp);
            setRenderTilt((prev) => prev + (targetTilt - prev) * tiltLerp);
            setRenderScaleY((prev) => prev + (targetScaleY - prev) * tiltLerp);

            if (sampleSeqRef.current !== processedSeqRef.current) {
                processedSeqRef.current = sampleSeqRef.current;

                setAx(current.ax);
                setAy(current.ay);
                setAz(current.az);
                setGx(current.gx);
                setGy(current.gy);
                setGz(current.gz);

                const nextResult = detectorRef.current.update({
                    timestampMs: lastSampleAtRef.current || nowMs,
                    accelX: current.ax,
                    accelY: current.ay,
                    accelZ: current.az,
                    gyroX: current.gx,
                    gyroY: current.gy,
                    gyroZ: current.gz,
                    flexionAngle: stabilizedFlexAngle,
                });
                const selectedTargetAngle = EXERCISE_META[selectedExercise].targetAngle;

                const displayAngle =
                    selectedExercise === 'wrist_rotation'
                        ? nextResult.current_angle
                        : selectedExercise === 'radial_deviation' || selectedExercise === 'ulnar_deviation'
                            ? stabilizedDeviationAngle
                            : stabilizedFlexAngle;
                const roundedDisplayAngle = Math.round(displayAngle);
                setAngle(roundedDisplayAngle);

                const targetTolerance = EXERCISE_TARGET_TOLERANCE[selectedExercise];
                const isTargetReached = isAtOrBeyondTarget(displayAngle, selectedTargetAngle, targetTolerance);
                const inRepNeutral = isInRepNeutralZone(displayAngle);

                if (inRepNeutral) {
                    repArmedRef.current = true;
                }

                let repIncremented = false;
                if (repArmedRef.current && isTargetReached) {
                    repCountRef.current += 1;
                    setRepCount(repCountRef.current);
                    saveDailyRepCount(selectedExercise, repCountRef.current, patientUid);
                    repArmedRef.current = false;
                    repIncremented = true;
                }

                const expectedDirection = EXERCISE_DIRECTION[selectedExercise];
                const directionMetric =
                    selectedExercise === 'wrist_rotation'
                        ? nextResult.current_angle
                        : selectedExercise === 'radial_deviation' || selectedExercise === 'ulnar_deviation'
                            ? stabilizedDeviationAngle
                            : stabilizedFlexAngle;

                const userDirection = getDirectionForExercise(selectedExercise, directionMetric, current);
                setDirection(userDirection);

                const isDirectionCorrect = userDirection === expectedDirection;
                const movementQuality: ExerciseDetectionOutput['movement_quality'] =
                    isTargetReached ? 'correct' : 'incorrect';

                setAnalysis({
                    ...nextResult,
                    current_angle: roundedDisplayAngle,
                    target_angle: selectedTargetAngle,
                    repetitions: repCountRef.current,
                    movement_quality: movementQuality,
                });

                if (repIncremented) {
                    setGuidance(`Rep ${repCountRef.current} counted at target ${selectedTargetAngle}°. Return to -2..2 to arm next rep.`);
                } else if (isTargetReached) {
                    setGuidance(`Target matched at ${selectedTargetAngle}°. Move back to -2..2 to count the next rep.`);
                } else if (userDirection === 'STILL') {
                    setGuidance(`Move ${expectedDirection.toLowerCase()} for ${selectedExerciseMeta.label}.`);
                } else if (isDirectionCorrect) {
                    setGuidance(`Correct direction (${userDirection}). Keep moving to reach ${selectedTargetAngle}°.`);
                } else {
                    setGuidance(`Incorrect motion (${userDirection}). Move ${expectedDirection.toLowerCase()} instead.`);
                }
            }
        }, HAND_RENDER.frameIntervalMs);

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
    const fmtSigned = (value: number, digits: number) => value.toFixed(digits);
    const handTransform = `translate(${renderX}px, ${renderY}px) rotate(${renderTilt}deg) scaleY(${renderScaleY})`;
    const selectedExerciseMeta = EXERCISE_META[selectedExercise];
    const expectedDirection = EXERCISE_DIRECTION[selectedExercise];
    const targetTolerance = EXERCISE_TARGET_TOLERANCE[selectedExercise];
    const isTargetReached = isAtOrBeyondTarget(analysis.current_angle, selectedExerciseMeta.targetAngle, targetTolerance);
    const isNeutralMotion = direction === 'STILL' && !isTargetReached;
    const qualityMode: 'neutral' | 'correct' | 'incorrect' = isNeutralMotion
        ? 'neutral'
        : analysis.movement_quality === 'correct'
            ? 'correct'
            : 'incorrect';
    const isDirectionCorrect = qualityMode === 'correct';
    const angleDeviation = analysis.current_angle - selectedExerciseMeta.targetAngle;
    const qualityColor =
        qualityMode === 'neutral'
            ? 'var(--blue)'
            : isDirectionCorrect
                ? 'var(--green)'
                : 'var(--orange)';
    const qualityLabel =
        qualityMode === 'neutral'
            ? 'Neutral Position'
            : isDirectionCorrect
                ? 'Correct Direction'
                : 'Incorrect Direction';

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
                    <span className="exercise-target-chip">Target: {fmtSigned(selectedExerciseMeta.targetAngle, 0)}°</span>
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
                            <div className="angle-big">{fmtSigned(angle, 0)}°</div>
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
                        <div className="quality-icon" style={{ background: qualityMode === 'neutral' ? 'rgba(96,165,250,.12)' : isDirectionCorrect ? 'rgba(52,211,153,.12)' : 'rgba(251,191,36,.12)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={qualityMode === 'neutral' ? '#60a5fa' : isDirectionCorrect ? '#34d399' : '#fbbf24'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                        <div><div className="quality-label" style={{ color: qualityColor }}>{qualityLabel}</div><div className="quality-sub">Correct: {expectedDirection} · Your: {direction}</div></div>
                        <div className="quality-val" style={{ color: qualityColor }}>{qualityMode === 'neutral' ? '•' : isDirectionCorrect ? '✓' : '!'}</div>
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
                            {qualityMode === 'neutral'
                                ? `Neutral position detected. Move ${expectedDirection.toLowerCase()} to begin a valid repetition.`
                                : isDirectionCorrect
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
                        <div><div className="insight-text">Current angle {fmtSigned(analysis.current_angle, 0)}° vs target {fmtSigned(selectedExerciseMeta.targetAngle, 0)}° for {selectedExerciseMeta.label}.</div><div className="insight-time">Live</div></div>
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
                                <div className="hand-sim-metrics">Angle: {fmtSigned(angle, 0)}°</div>
                                <div className="hand-sim-metrics">Target: {fmtSigned(selectedExerciseMeta.targetAngle, 0)}°</div>
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
