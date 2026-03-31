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
    timestamp: string;
    heart_rate: number;
    temperature: number;
    spo2: number;
    acc_x: number;
    acc_y: number;
    acc_z: number;
    gyro_x: number;
    gyro_y: number;
    gyro_z: number;
};

export default function DoctorLiveBoard() {
    const [liveData, setLiveData] = useState<LiveDataMap>({});
    const [patients, setPatients] = useState<PatientProfile[]>([]);
    const [error, setError] = useState('');
    const [authUser, setAuthUser] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);

    // First: Wait for auth state to be ready
    useEffect(() => {
        console.log('🔐 Setting up auth state listener...');
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            console.log('🔐 Auth state changed, user:', user?.uid);
            setAuthUser(user);
            setAuthLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Second: Load patients once auth is ready
    useEffect(() => {
        if (authLoading) {
            console.log('⏳ Still waiting for auth state...');
            return;
        }

        const loadPatients = async () => {
            try {
                if (!authUser) {
                    console.log('❌ No authenticated user found');
                    setError('User not authenticated');
                    return;
                }

                console.log('🔍 Loading patients assigned to doctor:', authUser.uid);

                // Query only patients assigned to this doctor
                const q = query(
                    collection(db, 'patients'),
                    where('assignedDoctorId', '==', authUser.uid)
                );
                const snapshot = await getDocs(q);

                console.log('✅ Found', snapshot.size, 'patients assigned to this doctor');

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
                console.error('❌ Error loading patients:', err);
                const errorMsg = err instanceof Error ? err.message : 'Failed to load patient list from Firestore';
                setError(errorMsg);
            }
        };

        loadPatients();
    }, [authLoading, authUser]);

    useEffect(() => {
        const unsubscribe = subscribeToAllPatientsLiveData(
            (incoming) => {
                setLiveData((prev) => smoothByUid(prev, incoming));
            },
            (err) => setError(err.message || 'Failed to read /liveData stream.'),
        );
        return unsubscribe;
    }, []);

    const rows = useMemo<FlatLive[]>(() => {
        const nameByUid = new Map(patients.map((p) => [p.uid, p.displayName]));

        const knownRows = patients.map((patient) => {
            const sample = liveData[patient.uid];
            return {
                uid: patient.uid,
                name: patient.displayName,
                timestamp: sample?.timestamp ?? '--',
                heart_rate: sample?.heart_rate ?? Number.NaN,
                temperature: sample?.temperature ?? Number.NaN,
                spo2: sample?.spo2 ?? Number.NaN,
                acc_x: sample?.acc_x ?? Number.NaN,
                acc_y: sample?.acc_y ?? Number.NaN,
                acc_z: sample?.acc_z ?? Number.NaN,
                gyro_x: sample?.gyro_x ?? Number.NaN,
                gyro_y: sample?.gyro_y ?? Number.NaN,
                gyro_z: sample?.gyro_z ?? Number.NaN,
            };
        });

        const unknownRows = Object.entries(liveData)
            .filter(([uid]) => !nameByUid.has(uid))
            .map(([uid, sample]) => ({
                uid,
                name: 'Unknown Patient',
                ...sample,
            }));

        return [...knownRows, ...unknownRows].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }, [liveData, patients]);

    const onlineCount = rows.filter((row) => row.timestamp !== '--').length;

    const formatMaybe = (value: number, fixed = 2) => (Number.isFinite(value) ? value.toFixed(fixed) : '--');

    return (
        <div className="stack-column">
            <div className="card">
                <div className="card-header">
                    <div className="card-title">Patient List</div>
                    <span className="mini-tag">{patients.length} Registered</span>
                </div>

                {!patients.length ? (
                    <div className="text-muted">
                        {authLoading ? (
                            <div>🔐 Loading authentication...</div>
                        ) : error ? (
                            <div style={{ color: 'var(--red)', marginBottom: '8px' }}>❌ {error}</div>
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
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{patient.displayName}</span>
                                <span style={{ marginLeft: '8px', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                                    {patient.uid.slice(0, 8)}...
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <div className="card-title">Live Sensor Feed (Per Patient)</div>
                    <span className="mini-tag tag-live">{onlineCount} ONLINE</span>
                </div>

                {error ? <div className="auth-error">{error}</div> : null}
                {!rows.length && !error ? <div className="text-muted">No patient rows available yet.</div> : null}

                {rows.length ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                                    <th style={{ padding: '8px' }}>Patient Name</th>
                                    <th style={{ padding: '8px' }}>Patient UID</th>
                                    <th style={{ padding: '8px' }}>Time</th>
                                    <th style={{ padding: '8px' }}>HR</th>
                                    <th style={{ padding: '8px' }}>Temp</th>
                                    <th style={{ padding: '8px' }}>SpO2</th>
                                    <th style={{ padding: '8px' }}>Acc (x,y,z)</th>
                                    <th style={{ padding: '8px' }}>Gyro (x,y,z)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.uid} style={{ borderTop: '1px solid rgba(148,163,184,.15)' }}>
                                        <td style={{ padding: '8px', fontWeight: 700 }}>{row.name}</td>
                                        <td style={{ padding: '8px', fontFamily: 'var(--mono)' }}>{row.uid}</td>
                                        <td style={{ padding: '8px' }}>{row.timestamp}</td>
                                        <td style={{ padding: '8px' }}>{formatMaybe(row.heart_rate, 0)}</td>
                                        <td style={{ padding: '8px' }}>{formatMaybe(row.temperature, 2)} {Number.isFinite(row.temperature) ? 'C' : ''}</td>
                                        <td style={{ padding: '8px' }}>{formatMaybe(row.spo2, 0)}{Number.isFinite(row.spo2) ? '%' : ''}</td>
                                        <td style={{ padding: '8px' }}>
                                            {formatMaybe(row.acc_x)}, {formatMaybe(row.acc_y)}, {formatMaybe(row.acc_z)}
                                        </td>
                                        <td style={{ padding: '8px' }}>
                                            {formatMaybe(row.gyro_x)}, {formatMaybe(row.gyro_y)}, {formatMaybe(row.gyro_z)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
