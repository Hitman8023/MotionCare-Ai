export type UserRole = 'doctor' | 'patient';

export type SessionUser = {
    uid: string;
    role: UserRole;
    displayName: string;
};
