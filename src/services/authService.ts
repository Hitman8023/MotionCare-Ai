/**
 * Firestore layout
 * ─────────────────────────────────────────────────────────
 *  doctors/doctor_1, doctor_2, …   – doctor profiles
 *  patients/patient_1, patient_2, … – patient profiles
 *  _counters/doctor                – { count: N }
 *  _counters/patient               – { count: N }
 *  _counters/user_index            – { count: N }
 *  user_index/{user_index_N}       – { uid, docId, role, displayName }
 *                                     UID -> role doc mapping for sign-in
 * ─────────────────────────────────────────────────────────
 */

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
} from 'firebase/auth';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    where,
    runTransaction,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserRole, SessionUser } from '../types/auth';

// ─── Demo accounts – auto-seeded into Firebase on first use ───────────────────

const DEMO_ACCOUNTS = [
    {
        email: 'doctor@motioncare.ai',
        password: 'doctor123',
        fullName: 'Rachel Moore',
        role: 'doctor' as UserRole,
    },
    {
        email: 'patient@motioncare.ai',
        password: 'patient123',
        fullName: 'James Davidson',
        role: 'patient' as UserRole,
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Atomically allocates the next sequential document ID, e.g. "doctor_3". */
async function allocateDocId(role: UserRole): Promise<string> {
    const prefix = role === 'doctor' ? 'doctor' : 'patient';
    const counterRef = doc(db, '_counters', prefix);

    const next = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const count = snap.exists() ? (snap.data().count as number) + 1 : 1;
        tx.set(counterRef, { count });
        return count;
    });

    return `${prefix}_${next}`;
}

/** Atomically allocates user index IDs like "user_index_12". */
async function allocateUserIndexDocId(): Promise<string> {
    const counterRef = doc(db, '_counters', 'user_index');

    const next = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const count = snap.exists() ? (snap.data().count as number) + 1 : 1;
        tx.set(counterRef, { count });
        return count;
    });

    return `user_index_${next}`;
}

async function getUserIndexByUid(uid: string): Promise<{ docId: string; role: UserRole; displayName: string } | null> {
    // Backward compatibility: first check the legacy uid-keyed document.
    const legacySnap = await getDoc(doc(db, 'user_index', uid));
    if (legacySnap.exists()) {
        return legacySnap.data() as { docId: string; role: UserRole; displayName: string };
    }

    const q = query(collection(db, 'user_index'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return null;

    return snap.docs[0].data() as { docId: string; role: UserRole; displayName: string };
}

function mapFirebaseError(code: string): string {
    switch (code) {
        case 'auth/email-already-in-use':
            return 'An account with this email already exists.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/weak-password':
            return 'Password must be at least 6 characters.';
        case 'auth/operation-not-allowed':
            return 'Email/password sign-in is not enabled in Firebase Authentication.';
        case 'auth/configuration-not-found':
            return 'Firebase Authentication is not configured for this project.';
        case 'auth/invalid-api-key':
            return 'Firebase API key is invalid for this project.';
        case 'auth/app-not-authorized':
            return 'This app is not authorized for the configured Firebase project.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Invalid email or password.';
        case 'auth/too-many-requests':
            return 'Too many failed attempts. Please try again later.';
        case 'auth/network-request-failed':
            return 'Network error. Check your connection.';
        case 'permission-denied':
            return 'Firestore permission denied. Update your Firestore security rules to allow authenticated reads/writes for this app.';
        case 'unauthenticated':
            return 'You are not authenticated to access Firestore.';
        case 'failed-precondition':
            return 'Firestore is not enabled yet for this Firebase project. Enable Firestore Database in Firebase Console.';
        default:
            return code ? `Something went wrong (${code}). Please try again.` : 'Something went wrong. Please try again.';
    }
}

function getErrorCode(err: unknown): string {
    return (err as { code?: string })?.code ?? '';
}

function getRoleMismatchMessage(expectedRole: UserRole): string {
    return expectedRole === 'patient'
        ? 'Only patient accounts can sign in on the patient page.'
        : 'Only doctor accounts can sign in on the doctor page.';
}

async function getPatientNeedsOnboarding(patientUid: string): Promise<boolean> {
    const indexData = await getUserIndexByUid(patientUid);
    if (!indexData) return true;
    const { docId } = indexData;
    const profileSnap = await getDoc(doc(db, 'patients', docId));
    return !(profileSnap.exists() && profileSnap.data()?.onboardedAt);
}

async function getSessionProfileByUid(
    uid: string,
): Promise<{ role: UserRole; displayName: string; profileDocId: string } | null> {
    const indexData = await getUserIndexByUid(uid);
    if (!indexData) return null;

    return {
        role: indexData.role,
        displayName: indexData.displayName,
        profileDocId: indexData.docId,
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a Firebase Auth user and writes a profile document into Firestore.
 * Doctors and patients both keep sequential role-doc IDs:
 * doctors/{doctor_N}, patients/{patient_N}.
 */
export async function registerUser(
    fullName: string,
    email: string,
    password: string,
    role: UserRole,
): Promise<SessionUser> {
    const normalizedEmail = email.trim().toLowerCase();
    const displayName = role === 'doctor' ? `Dr. ${fullName.trim()}` : fullName.trim();

    let cred;
    try {
        cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (err: unknown) {
        const code = getErrorCode(err);
        throw new Error(mapFirebaseError(code));
    }

    const uid = cred.user.uid;
    const collectionName = role === 'doctor' ? 'doctors' : 'patients';
    const docId = await allocateDocId(role);
    const userIndexDocId = await allocateUserIndexDocId();

    const profile = {
        uid,
        displayName,
        email: normalizedEmail,
        role,
        createdAt: new Date().toISOString(),
    };

    // Keep all role data in a single role profile document and store a minimal
    // UID-searchable index only for auth lookup to that document.
    try {
        await Promise.all([
            setDoc(doc(db, collectionName, docId), profile),
            setDoc(doc(db, 'user_index', userIndexDocId), { uid, docId, role, displayName }),
        ]);
    } catch (err: unknown) {
        const code = getErrorCode(err);
        throw new Error(mapFirebaseError(code));
    }

    return {
        uid,
        profileDocId: docId,
        role,
        displayName,
        needsOnboarding: role === 'patient',
    };
}

/**
 * Signs in with Firebase Auth and resolves the user's role + display name.
 * user_index/{user_index_N} stores uid -> role document mappings.
 * Demo accounts are auto-seeded on first use.
 */
export async function signInUser(
    email: string,
    password: string,
    expectedRole?: UserRole,
): Promise<SessionUser> {
    const normalizedEmail = email.trim().toLowerCase();

    try {
        const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        const sessionProfile = await getSessionProfileByUid(cred.user.uid);

        if (!sessionProfile) {
            throw new Error('User profile not found. Please contact support.');
        }
        const { role, displayName, profileDocId } = sessionProfile;

        if (expectedRole && role !== expectedRole) {
            await firebaseSignOut(auth);
            throw new Error(getRoleMismatchMessage(expectedRole));
        }

        const needsOnboarding = role === 'patient'
            ? await getPatientNeedsOnboarding(cred.user.uid)
            : false;

        return {
            uid: cred.user.uid,
            profileDocId,
            role,
            displayName,
            needsOnboarding,
        };

    } catch (err: unknown) {
        const code = getErrorCode(err);

        // Auto-seed demo account on first sign-in attempt
        if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
            const demo = DEMO_ACCOUNTS.find(
                (d) => d.email === normalizedEmail
                    && d.password === password
                    && (!expectedRole || d.role === expectedRole),
            );
            if (demo) {
                return registerUser(demo.fullName, demo.email, demo.password, demo.role);
            }
        }

        if (code) throw new Error(mapFirebaseError(code));
        throw err;
    }
}

/** Signs out the current Firebase Auth user. */
export async function signOutUser(): Promise<void> {
    await firebaseSignOut(auth);
}
