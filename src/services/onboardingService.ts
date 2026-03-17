import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { OnboardingFormData } from '../types/onboarding';

export type DoctorOption = {
    id: string;
    name: string;
    specialty: string;
};

/** Maps incident type to a specialty keyword used for doctor suggestion. */
const INCIDENT_SPECIALTY_MAP: Record<string, string> = {
    Fall: 'orthop',
    'Tremor Episode': 'neuro',
    Dizziness: 'neuro',
    Unknown: '',
};

/**
 * Persists the full onboarding form to Firestore.
 *
 * Collection : patients
 * Document ID: authenticated user's Firebase UID
 *
 * Uses setDoc with { merge: true } so re-submissions only overwrite
 * the onboarding fields without destroying any existing data.
 */
export async function savePatientOnboarding(
    patientDocId: string,
    data: OnboardingFormData,
): Promise<void> {
    const ref = doc(db, 'patients', patientDocId);
    await setDoc(
        ref,
        {
            basicInfo: {
                name: data.basicInfo.name.trim(),
                age: Number(data.basicInfo.age),
                gender: data.basicInfo.gender,
                phone: data.basicInfo.phone.trim(),
                emergencyContact: data.basicInfo.emergencyContact.trim(),
            },
            incident: {
                type: data.incident.type,
                time: data.incident.time,
                location: data.incident.location.trim(),
                description: data.incident.description.trim(),
            },
            medical: {
                conditions: data.medical.conditions.trim(),
                medications: data.medical.medications.trim(),
                allergies: data.medical.allergies.trim(),
                previousIncidents: data.medical.previousIncidents,
            },
            doctor: {
                doctorId: data.doctor.doctorId,
            },
            onboardedAt: new Date().toISOString(),
        },
        { merge: true },
    );
}

/** Fetches all documents from the `doctors` collection. */
export async function fetchDoctors(): Promise<DoctorOption[]> {
    const snap = await getDocs(collection(db, 'doctors'));
    return snap.docs.map((d) => {
        const raw = d.data() as {
            displayName?: string;
            fullName?: string;
            specialty?: string;
        };
        return {
            id: d.id,
            name: raw.displayName ?? raw.fullName ?? d.id,
            specialty: raw.specialty ?? '',
        };
    });
}

/**
 * Returns the subset of doctors whose specialty matches the given incident
 * type.  Falls back to the full list when no specialty keyword is mapped or
 * no doctors match.
 */
export function suggestDoctors(
    doctors: DoctorOption[],
    incidentType: string,
): DoctorOption[] {
    const keyword = INCIDENT_SPECIALTY_MAP[incidentType] ?? '';
    if (!keyword) return doctors;
    const matched = doctors.filter((d) =>
        d.specialty.toLowerCase().includes(keyword),
    );
    return matched.length ? matched : doctors;
}
