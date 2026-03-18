export type UserRole = 'doctor' | 'patient';

export type SessionUser = {
    uid: string;
    profileDocId: string;
    role: UserRole;
    displayName: string;
    /** True for patients who have not yet completed the onboarding form. */
    needsOnboarding?: boolean;
};
