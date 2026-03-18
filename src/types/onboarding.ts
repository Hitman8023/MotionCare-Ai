export type BasicInfo = {
    name: string;
    age: string;
    gender: string;
    phone: string;
    emergencyContact: string;
};

export type IncidentInfo = {
    type: string;
    time: string;
    location: string;
    description: string;
};

export type MedicalInfo = {
    conditions: string;
    medications: string;
    allergies: string;
    previousIncidents: boolean;
};

export type DoctorInfo = {
    doctorId: string;
};

export type OnboardingFormData = {
    basicInfo: BasicInfo;
    incident: IncidentInfo;
    medical: MedicalInfo;
    doctor: DoctorInfo;
};

export const INITIAL_FORM_DATA: OnboardingFormData = {
    basicInfo: { name: '', age: '', gender: '', phone: '', emergencyContact: '' },
    incident: { type: '', time: '', location: '', description: '' },
    medical: { conditions: '', medications: '', allergies: '', previousIncidents: false },
    doctor: { doctorId: '' },
};
