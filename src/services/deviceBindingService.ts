import { get, ref, set } from 'firebase/database';
import { realtimeDb } from '../firebase';

export async function getDeviceBinding(deviceUid: string): Promise<string | null> {
    const normalized = deviceUid.trim();
    if (!normalized) return null;

    const snap = await get(ref(realtimeDb, `deviceBindings/${normalized}`));
    const value = snap.val();
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function bindDeviceToPatient(
    deviceUid: string,
    patientUid: string,
    assignedByUid: string,
): Promise<void> {
    const normalizedDeviceUid = deviceUid.trim();
    const normalizedPatientUid = patientUid.trim();

    if (!normalizedDeviceUid) {
        throw new Error('Device UID is required.');
    }
    if (!normalizedPatientUid) {
        throw new Error('Patient UID is required.');
    }

    await Promise.all([
        set(ref(realtimeDb, `deviceBindings/${normalizedDeviceUid}`), normalizedPatientUid),
        set(ref(realtimeDb, `deviceBindingsMeta/${normalizedDeviceUid}`), {
            patientUid: normalizedPatientUid,
            assignedBy: assignedByUid,
            assignedAt: new Date().toISOString(),
        }),
    ]);
}
