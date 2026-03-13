import { onValue, ref, set, update } from 'firebase/database';
import { realtimeDb } from '../firebase';
import type { HistoryBucket, LiveDataMap, SensorAggregate, SensorSample } from '../types/sensor';

export function subscribeToPatientLiveData(
    patientUid: string,
    onData: (data: SensorSample | null) => void,
    onError?: (error: Error) => void,
): () => void {
    const liveRef = ref(realtimeDb, `liveData/${patientUid}`);
    return onValue(
        liveRef,
        (snapshot) => {
            onData((snapshot.val() as SensorSample | null) ?? null);
        },
        (error) => {
            if (onError) onError(error as Error);
        },
    );
}

export function subscribeToAllPatientsLiveData(
    onData: (data: LiveDataMap) => void,
    onError?: (error: Error) => void,
): () => void {
    const liveRootRef = ref(realtimeDb, 'liveData');
    return onValue(
        liveRootRef,
        (snapshot) => {
            onData((snapshot.val() as LiveDataMap | null) ?? {});
        },
        (error) => {
            if (onError) onError(error as Error);
        },
    );
}

export async function writeLiveSensorData(patientUid: string, sample: SensorSample): Promise<void> {
    await set(ref(realtimeDb, `liveData/${patientUid}`), sample);
}

/**
 * Writes a prepared aggregate payload under:
 * history/{patientUid}/{bucket}/{periodKey}
 * Example periodKey values:
 * - minute: 2026-03-14T13:25
 * - hour: 2026-03-14T13
 * - day: 2026-03-14
 */
export async function writeHistoryAggregate(
    patientUid: string,
    bucket: HistoryBucket,
    periodKey: string,
    aggregate: SensorAggregate,
): Promise<void> {
    await set(ref(realtimeDb, `history/${patientUid}/${bucket}/${periodKey}`), aggregate);
}

export async function upsertHistorySummary(
    patientUid: string,
    summary: Partial<Record<HistoryBucket, SensorAggregate>>,
): Promise<void> {
    const payload: Record<string, SensorAggregate> = {};
    if (summary.minute) payload.minute = summary.minute;
    if (summary.hour) payload.hour = summary.hour;
    if (summary.day) payload.day = summary.day;
    await update(ref(realtimeDb, `history/${patientUid}/latest`), payload);
}
