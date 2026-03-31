import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { createNotification } from './notificationService';
import type { OnboardingFormData } from '../types/onboarding';

export type DoctorOption = {
    id: string;
    name: string;
    specialty: string;
};

const INCIDENT_SPECIALTY_MAP: Record<string, string> = {
    Fall: 'orthop',
    'Tremor Episode': 'neuro',
    Dizziness: 'neuro',
    Unknown: '',
};

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

            // 🔥 EXISTING (keep it)
            doctor: {
                doctorId: data.doctor.doctorId,
            },

            // ✅ 🔥 CRITICAL FIX FOR CHAT SYSTEM
            assignedDoctorId: data.doctor.doctorId,

            onboardedAt: new Date().toISOString(),
        },
        { merge: true },
    );

    // 📢 Send notification to doctor
    if (data.doctor.doctorId) {
        try {
            const patientName = data.basicInfo.name || 'New Patient';
            await createNotification(
                data.doctor.doctorId,
                `New patient assigned: ${patientName} has selected you as their recovery doctor.`,
                'report'
            );
        } catch (error) {
            console.error('Error sending notification to doctor:', error);
        }
    }
}

/** Fetch all doctors */
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

/** Suggest doctors based on incident */
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