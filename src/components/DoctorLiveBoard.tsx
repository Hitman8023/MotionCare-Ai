import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { subscribeToAllPatientsLiveData } from '../services/realtimeDbService';
import { db } from '../firebase';
import type { LiveDataMap } from '../types/sensor';

function smooth(prev: number, next: number, alpha = 0.25): number {
    return Number((prev + alpha * (next - prev)).toFixed(3));
}

function smoothByUid(previous: LiveDataMap, incoming: LiveDataMap): LiveDataMap {
    const nextMap: LiveDataMap = {};
    for (const [uid, sample] of Object.entries(incoming)) {
        const prev = previous[uid];
        if (!prev) {
            nextMap[uid] = sample;
            continue;
        }
        nextMap[uid] = {
            ...sample,
            acc_x: smooth(prev.acc_x, sample.acc_x, 0.3),
            acc_y: smooth(prev.acc_y, sample.acc_y, 0.3),
            acc_z: smooth(prev.acc_z, sample.acc_z, 0.3),
            gyro_x: smooth(prev.gyro_x, sample.gyro_x, 0.22),
            gyro_y: smooth(prev.gyro_y, sample.gyro_y, 0.22),
            gyro_z: smooth(prev.gyro_z, sample.gyro_z, 0.22),
        };
    }
    return nextMap;
}

type PatientProfile = {
    uid: string;
    displayName: string;
};

type FlatLive = {
    uid: string;
    name: string;
    timestamp: string | null;
    heart_rate: number | null;
    spo2: number | null;
    movement: 'Stable' | 'Unstable' | 'No data available';
    posture: 'Normal' | 'Abnormal' | 'No data available';
    hrStatus: 'Normal' | 'High' | 'Low' | 'No data available';
    spo2Status: 'Good' | 'Warning' | 'Critical' | 'No data available';
    lastUpdatedLabel: string;
    tone: 'active' | 'warning' | 'critical' | 'offline';
    freshness: 'live' | 'active' | 'stale' | 'offline';
    stale: boolean;
    isOffline: boolean;
};

type FilterMode = 'all' | 'active' | 'critical';

const LIVE_SECONDS = 5;
const ACTIVE_SECONDS = 60;
const STALE_SECONDS = 300;
const OFFLINE_SECONDS = 1800;

function toDateMaybe(raw: string | null): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ageSeconds(raw: string | null, nowMs: number): number | null {
    const date = toDateMaybe(raw);
    if (!date) return null;
    return Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
}

function relativeTime(raw: string | null, nowMs: number): string {
    const age = ageSeconds(raw, nowMs);
    if (age === null) return 'No data available';
    if (age <= 1) return 'Updated just now';
    if (age < 60) return `${age} seconds ago`;
    const mins = Math.floor(age / 60);
    if (mins < 60) return `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    return `${hours} hours ago`;
}

function freshnessState(age: number | null): FlatLive['freshness'] {
    if (age === null || age > OFFLINE_SECONDS) return 'offline';
    if (age < LIVE_SECONDS) return 'live';
    if (age < ACTIVE_SECONDS) return 'active';
    if (age > STALE_SECONDS) return 'stale';
    return 'active';
}

function statusClass(
    tone: 'active' | 'warning' | 'critical' | 'muted' | 'offline',
): string {
    if (tone === 'critical') return 'status-critical';
    if (tone === 'warning') return 'status-warning';
    if (tone === 'active') return 'status-active';
    if (tone === 'offline') return 'status-offline';
    return 'status-muted';
}

function patientLabel(displayName: string, uid: string): string {
    if (displayName && displayName !== 'Unknown Patient') return displayName;
    return `Patient #${uid.slice(0, 4).toUpperCase()}`;
}

function hrStatus(hr: number | null): FlatLive['hrStatus'] {
    if (hr === null) return 'No data available';
    if (hr < 55) return 'Low';
    if (hr > 105) return 'High';
    return 'Normal';
}

function spo2Status(spo2: number | null): FlatLive['spo2Status'] {
    if (spo2 === null) return 'No data available';
    if (spo2 < 92) return 'Critical';
    if (spo2 < 95) return 'Warning';
    return 'Good';
}

function movementStatus(sample: LiveDataMap[string] | undefined): FlatLive['movement'] {
    if (!sample) return 'No data available';
    const magnitude = Math.sqrt(
        sample.acc_x * sample.acc_x +
            sample.acc_y * sample.acc_y +
            sample.acc_z * sample.acc_z,
    );
    return magnitude >= 0.75 && magnitude <= 1.35 ? 'Stable' : 'Unstable';
}

function postureStatus(sample: LiveDataMap[string] | undefined): FlatLive['posture'] {
    if (!sample) return 'No data available';
    const rotation = Math.abs(sample.gyro_x) + Math.abs(sample.gyro_y);
    return rotation <= 1.35 ? 'Normal' : 'Abnormal';
}

function trendPath(points: number[], width = 180, height = 44): string {
    if (!points.length) return '';
    const min = Math.min(...points) - 1;
    const max = Math.max(...points) + 1;
    const range = Math.max(1, max - min);
    const xStep = points.length > 1 ? width / (points.length - 1) : width;
    return points
        .map((value, index) => {
            const x = index * xStep;
            const y = height - ((value - min) / range) * height;
            return `${index === 0 ? 'M' : 'L'}${x},${y}`;
        })
        .join(' ');
}

export default function DoctorLiveBoard() {
    const [liveData, setLiveData] = useState<LiveDataMap>({});
    const [patients, setPatients] = useState<PatientProfile[]>([]);
    const [error, setError] = useState('');
    const [authUser, setAuthUser] = useState<{ uid: string } | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [filterMode, setFilterMode] = useState<FilterMode>('all');
    const [nowMs, setNowMs] = useState(Date.now());
    const [hrSeriesByUid, setHrSeriesByUid] = useState<Record<string, number[]>>({});

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setAuthUser(user ? { uid: user.uid } : null);
            setAuthLoading(false);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (authLoading) return;

        const loadPatients = async () => {
            try {
                if (!authUser) {
                    setError('User not authenticated');
                    return;
                }
                const q = query(
                    collection(db, 'patients'),
                    where('assignedDoctorId', '==', authUser.uid),
                );
                const snapshot = await getDocs(q);

                const nextPatients: PatientProfile[] = snapshot.docs
                    .map((docItem) => docItem.data() as { uid?: string; displayName?: string })
                    .filter((item) => Boolean(item.uid))
                    .map((item) => ({
                        uid: item.uid as string,
                        displayName: item.displayName || 'Unnamed Patient',
                    }));
                setPatients(nextPatients);
                setError('');
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'Failed to load patient list from Firestore';
                setError(errorMsg);
            }
        };

        loadPatients();
    }, [authLoading, authUser]);

    useEffect(() => {
        const tick = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(tick);
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeToAllPatientsLiveData(
            (incoming) => {
                setLiveData((prev) => smoothByUid(prev, incoming));
                setHrSeriesByUid((prev) => {
                    const nextSeries = { ...prev };
                    Object.entries(incoming).forEach(([uid, sample]) => {
                        const value = Number.isFinite(sample.heart_rate)
                            ? sample.heart_rate
                            : null;
                        if (value === null) return;
                        const previousPoints = nextSeries[uid] ?? [];
                        nextSeries[uid] = [...previousPoints.slice(-17), value];
                    });
                    return nextSeries;
                });
            },
            (err) => setError(err.message || 'Failed to read /liveData stream.'),
        );
        return unsubscribe;
    }, []);

    const rows = useMemo<FlatLive[]>(() => {
        const nameByUid = new Map(patients.map((p) => [p.uid, p.displayName]));

        const knownRows = patients.map((patient) => {
            const sample = liveData[patient.uid];
            const timestamp = sample?.timestamp ?? null;
            const age = ageSeconds(timestamp, nowMs);
            const freshness = freshnessState(age);
            const isOffline = freshness === 'offline';
            const stale = freshness === 'stale';

            const heartRate = sample && Number.isFinite(sample.heart_rate) ? sample.heart_rate : null;
            const spo2 = sample && Number.isFinite(sample.spo2) ? sample.spo2 : null;

            const hr = hrStatus(heartRate);
            const oxygen = spo2Status(spo2);
            const movement = movementStatus(sample);
            const posture = postureStatus(sample);

            const hasCritical =
                hr === 'High' ||
                hr === 'Low' ||
                oxygen === 'Critical' ||
                movement === 'Unstable' ||
                posture === 'Abnormal';

            const hasWarning = oxygen === 'Warning' || stale;

            const tone: FlatLive['tone'] = isOffline
                ? 'offline'
                : hasCritical
                    ? 'critical'
                    : hasWarning
                        ? 'warning'
                        : 'active';

            return {
                uid: patient.uid,
                name: patientLabel(patient.displayName, patient.uid),
                timestamp,
                heart_rate: heartRate,
                spo2,
                movement,
                posture,
                hrStatus: hr,
                spo2Status: oxygen,
                isOffline,
                stale,
                freshness,
                lastUpdatedLabel: relativeTime(timestamp, nowMs),
                tone,
            };
        });

        const unknownRows = Object.entries(liveData)
            .filter(([uid]) => !nameByUid.has(uid))
            .map(([uid, sample]) => {
                const timestamp = sample?.timestamp ?? null;
                const age = ageSeconds(timestamp, nowMs);
                const freshness = freshnessState(age);
                const isOffline = freshness === 'offline';
                const stale = freshness === 'stale';

                const heartRate = Number.isFinite(sample.heart_rate) ? sample.heart_rate : null;
                const spo2 = Number.isFinite(sample.spo2) ? sample.spo2 : null;

                const hr = hrStatus(heartRate);
                const oxygen = spo2Status(spo2);
                const movement = movementStatus(sample);
                const posture = postureStatus(sample);

                const hasCritical =
                    hr === 'High' ||
                    hr === 'Low' ||
                    oxygen === 'Critical' ||
                    movement === 'Unstable' ||
                    posture === 'Abnormal';

                const hasWarning = oxygen === 'Warning' || stale;

                const tone: FlatLive['tone'] = isOffline
                    ? 'offline'
                    : hasCritical
                        ? 'critical'
                        : hasWarning
                            ? 'warning'
                            : 'active';

                return {
                    uid,
                    name: patientLabel('Unknown Patient', uid),
                    timestamp,
                    heart_rate: heartRate,
                    spo2,
                    movement,
                    posture,
                    hrStatus: hr,
                    spo2Status: oxygen,
                    isOffline,
                    stale,
                    freshness,
                    lastUpdatedLabel: relativeTime(timestamp, nowMs),
                    tone,
                };
            });

        return [...knownRows, ...unknownRows].sort((a, b) => {
            const aTs = toDateMaybe(a.timestamp)?.getTime() ?? 0;
            const bTs = toDateMaybe(b.timestamp)?.getTime() ?? 0;
            return bTs - aTs;
        });
    }, [liveData, patients, nowMs]);

    const filteredRows = useMemo(() => {
        if (filterMode === 'active') {
            return rows.filter((row) => row.freshness === 'live' || row.freshness === 'active');
        }
        if (filterMode === 'critical') {
            return rows.filter((row) => row.tone === 'critical');
        }
        return rows;
    }, [rows, filterMode]);

    const activeCount = rows.filter((row) => row.freshness === 'live' || row.freshness === 'active').length;
    const criticalCount = rows.filter((row) => row.tone === 'critical').length;

    const metricValue = (
        value: number | null,
        unit = '',
        fixed = 0,
        offline = false,
    ) => {
        if (offline || value === null) return 'No data available';
        return `${value.toFixed(fixed)}${unit}`;
    };

    const alertMessage = (row: FlatLive): string | null => {
        if (row.isOffline) return 'Device is offline. Please verify sensor connectivity.';
        if (row.stale) return 'Data is stale. Last fresh update was over 5 minutes ago.';
        if (row.hrStatus === 'High' || row.hrStatus === 'Low') {
            return `Heart rate is ${row.hrStatus.toLowerCase()}. Review patient immediately.`;
        }
        if (row.spo2Status === 'Critical') {
            return 'SpO2 is critical. Immediate intervention recommended.';
        }
        if (row.spo2Status === 'Warning') {
            return 'SpO2 is in warning range. Monitor closely.';
        }
        if (row.movement === 'Unstable' || row.posture === 'Abnormal') {
            return 'Movement or posture appears abnormal. Consider contacting patient.';
        }
        return null;
    };

    const pillToneForHr = (status: FlatLive['hrStatus']) => {
        if (status === 'Normal') return 'active';
        if (status === 'High' || status === 'Low') return 'critical';
        return 'muted';
    };

    const pillToneForSpo2 = (status: FlatLive['spo2Status']) => {
        if (status === 'Good') return 'active';
        if (status === 'Warning') return 'warning';
        if (status === 'Critical') return 'critical';
        return 'muted';
    };

    const pillToneForMovement = (status: FlatLive['movement']) => {
        if (status === 'Stable') return 'active';
        if (status === 'Unstable') return 'critical';
        return 'muted';
    };

    const pillToneForPosture = (status: FlatLive['posture']) => {
        if (status === 'Normal') return 'active';
        if (status === 'Abnormal') return 'critical';
        return 'muted';
    };

    const freshnessLabel = (freshness: FlatLive['freshness']) => {
        if (freshness === 'live') return 'Live';
        if (freshness === 'active') return 'Active';
        if (freshness === 'stale') return 'Stale';
        return 'Offline';
    };

    return (
        <div className="stack-column">
            <div className="card">
                <div className="card-header">
                    <div className="card-title">Assigned Patients</div>
                    <span className="mini-tag">{patients.length} Registered</span>
                </div>

                {!patients.length ? (
                    <div className="text-muted">
                        {authLoading ? (
                            <div>Loading authentication...</div>
                        ) : error ? (
                            <div style={{ color: 'var(--red)', marginBottom: '8px' }}>{error}</div>
                        ) : (
                            <div>No patients assigned to you yet. When patients select you as their recovery doctor, they will appear here.</div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {patients.map((patient) => (
                            <div
                                key={patient.uid}
                                style={{
                                    border: '1px solid var(--border-light)',
                                    background: 'var(--surface-2)',
                                    borderRadius: '999px',
                                    padding: '8px 12px',
                                    fontSize: '12px',
                                    color: "var(--color-text)",
                                }}
                            >
                                <span style={{ fontWeight: 700, color: "var(--color-text)" }}>
                                    {patientLabel(patient.displayName, patient.uid)}
                                </span>
                                <span style={{ marginLeft: '8px', fontFamily: 'var(--mono)', color: "var(--color-text)" }}>
                                    {patient.uid.slice(0, 8)}...
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <div className="card-title">Live Monitoring Board</div>
                    <div className="doctor-live-meta">
                        <span className="mini-tag tag-live">{activeCount} Active</span>
                        <span className="mini-tag" style={{ background: 'rgba(248,113,113,.12)', color: "var(--color-text)" }}>
                            {criticalCount} Critical
                        </span>
                    </div>
                </div>

                <div className="doctor-filter-row">
                    {([
                        { key: 'all', label: `All (${rows.length})` },
                        { key: 'active', label: `Active (${activeCount})` },
                        { key: 'critical', label: `Critical (${criticalCount})` },
                    ] as { key: FilterMode; label: string }[]).map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className={`doctor-filter-chip ${filterMode === item.key ? 'active' : ''}`}
                            onClick={() => setFilterMode(item.key)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                {error ? <div className="auth-error">{error}</div> : null}
                {!rows.length && !error ? <div className="text-muted">No patient streams available yet.</div> : null}

                {rows.length && !filteredRows.length ? (
                    <div className="text-muted">No patients match the selected filter.</div>
                ) : null}

                {filteredRows.length ? (
                    <div className="doctor-live-grid">
                        {filteredRows.map((row) => {
                            const alert = alertMessage(row);
                            const series = hrSeriesByUid[row.uid] ?? [];
                            const sparkline = series.length > 1 && !row.isOffline ? trendPath(series) : '';
                            const fresh = row.freshness === 'live';

                            return (
                                <article
                                    key={row.uid}
                                    className={`doctor-live-card tone-${row.tone}${fresh ? ' is-fresh' : ''}`}
                                >
                                    <header className="doctor-live-card-head">
                                        <div>
                                            <div className="doctor-live-name">{row.name}</div>
                                            <div className="doctor-live-updated">Last update: {row.lastUpdatedLabel}</div>
                                        </div>
                                        <span className={`doctor-live-state ${row.freshness}`}>
                                            <span className="doctor-live-dot" />
                                            {freshnessLabel(row.freshness)}
                                        </span>
                                    </header>

                                    {row.isOffline ? <div className="doctor-live-offline-banner">Device Offline</div> : null}

                                    <div className="doctor-live-metrics">
                                        <div className="doctor-live-metric">
                                            <div className="doctor-live-label">HR</div>
                                            <div className="doctor-live-value">{metricValue(row.heart_rate, ' BPM', 0, row.isOffline)}</div>
                                            <span className={`doctor-status-pill ${statusClass(pillToneForHr(row.hrStatus))}`}>
                                                {row.hrStatus}
                                            </span>
                                        </div>

                                        <div className="doctor-live-metric">
                                            <div className="doctor-live-label">SpO2</div>
                                            <div className="doctor-live-value">{metricValue(row.spo2, '%', 0, row.isOffline)}</div>
                                            <span className={`doctor-status-pill ${statusClass(pillToneForSpo2(row.spo2Status))}`}>
                                                {row.spo2Status}
                                            </span>
                                        </div>

                                        <div className="doctor-live-metric">
                                            <div className="doctor-live-label">Movement</div>
                                            <div className="doctor-live-value">{row.isOffline ? 'No data available' : row.movement}</div>
                                            <span className={`doctor-status-pill ${statusClass(pillToneForMovement(row.movement))}`}>
                                                {row.movement}
                                            </span>
                                        </div>

                                        <div className="doctor-live-metric">
                                            <div className="doctor-live-label">Posture</div>
                                            <div className="doctor-live-value">{row.isOffline ? 'No data available' : row.posture}</div>
                                            <span className={`doctor-status-pill ${statusClass(pillToneForPosture(row.posture))}`}>
                                                {row.posture}
                                            </span>
                                        </div>
                                    </div>

                                    {!row.isOffline ? (
                                        <div className="doctor-live-trend">
                                            <div className="doctor-live-trend-label">HR trend</div>
                                            {sparkline ? (
                                                <svg viewBox="0 0 180 44" preserveAspectRatio="none" className="doctor-live-sparkline">
                                                    <path d={sparkline} fill="none" stroke="rgba(96,165,250,.95)" strokeWidth="2" />
                                                </svg>
                                            ) : (
                                                <div className="doctor-live-trend-empty">Trend unavailable</div>
                                            )}
                                        </div>
                                    ) : null}

                                    {alert ? <div className="doctor-live-alert">{alert}</div> : null}
                                </article>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
