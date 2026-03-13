import { useEffect, useState } from 'react';
import { subscribeToPatientLiveData } from '../services/realtimeDbService';
import type { SensorSample } from '../types/sensor';

type PatientLiveDashboardProps = {
    patientUid: string;
};

function smooth(prev: number, next: number, alpha = 0.25): number {
    return Number((prev + alpha * (next - prev)).toFixed(3));
}

function smoothMotion(prev: SensorSample, next: SensorSample): SensorSample {
    return {
        ...next,
        acc_x: smooth(prev.acc_x, next.acc_x, 0.3),
        acc_y: smooth(prev.acc_y, next.acc_y, 0.3),
        acc_z: smooth(prev.acc_z, next.acc_z, 0.3),
        gyro_x: smooth(prev.gyro_x, next.gyro_x, 0.22),
        gyro_y: smooth(prev.gyro_y, next.gyro_y, 0.22),
        gyro_z: smooth(prev.gyro_z, next.gyro_z, 0.22),
    };
}

export default function PatientLiveDashboard({ patientUid }: PatientLiveDashboardProps) {
    const [sample, setSample] = useState<SensorSample | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!patientUid) {
            setError('No patient UID found. Please sign in again.');
            return;
        }
        setError('');

        const unsubscribe = subscribeToPatientLiveData(
            patientUid,
            (next) => {
                if (!next) {
                    setSample(null);
                    return;
                }
                setSample((prev) => (prev ? smoothMotion(prev, next) : next));
            },
            (err) => setError(err.message || 'Failed to subscribe to live sensor data.'),
        );

        return unsubscribe;
    }, [patientUid]);

    return (
        <div className="section">
            <div className="card">
                <div className="card-header" style={{ marginBottom: '10px' }}>
                    <div className="card-title">Patient Live Sensors</div>
                    <span className="mini-tag tag-live">STREAMING</span>
                </div>

                {error ? <div className="auth-error">{error}</div> : null}
                {!sample && !error ? <div className="text-muted">Waiting for sensor data on /liveData/{patientUid}</div> : null}

                {sample ? (
                    <>
                        <div className="stats-grid-4" style={{ marginTop: '12px' }}>
                            <div className="card" style={{ padding: '12px' }}>
                                <div className="doctor-kpi-label">Heart Rate</div>
                                <div style={{ fontSize: '28px', fontWeight: 800 }}>{sample.heart_rate} BPM</div>
                            </div>
                            <div className="card" style={{ padding: '12px' }}>
                                <div className="doctor-kpi-label">Temperature</div>
                                <div style={{ fontSize: '28px', fontWeight: 800 }}>{String(sample.temperature)} C</div>
                            </div>
                            <div className="card" style={{ padding: '12px' }}>
                                <div className="doctor-kpi-label">SpO2</div>
                                <div style={{ fontSize: '28px', fontWeight: 800 }}>{sample.spo2}%</div>
                            </div>
                            <div className="card" style={{ padding: '12px' }}>
                                <div className="doctor-kpi-label">Timestamp</div>
                                <div style={{ fontSize: '16px', fontWeight: 700 }}>{sample.timestamp}</div>
                            </div>
                        </div>

                        <div className="grid-main" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '14px' }}>
                            <div className="card" style={{ padding: '12px' }}>
                                <div className="doctor-kpi-label">Accelerometer (g)</div>
                                <div style={{ marginTop: '8px', lineHeight: 1.8 }}>
                                    <div>X: {String(sample.acc_x)}</div>
                                    <div>Y: {String(sample.acc_y)}</div>
                                    <div>Z: {String(sample.acc_z)}</div>
                                </div>
                            </div>
                            <div className="card" style={{ padding: '12px' }}>
                                <div className="doctor-kpi-label">Gyroscope (rad/s)</div>
                                <div style={{ marginTop: '8px', lineHeight: 1.8 }}>
                                    <div>X: {String(sample.gyro_x)}</div>
                                    <div>Y: {String(sample.gyro_y)}</div>
                                    <div>Z: {String(sample.gyro_z)}</div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}
