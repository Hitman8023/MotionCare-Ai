import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionUser } from '../types/auth';
import { signOutUser } from '../services/authService';
import { INITIAL_FORM_DATA, type OnboardingFormData } from '../types/onboarding';
import { savePatientOnboarding } from '../services/onboardingService';
import OnboardingProgress from '../components/onboarding/OnboardingProgress';
import Step1BasicInfo from '../components/onboarding/Step1BasicInfo';
import Step2Incident from '../components/onboarding/Step2Incident';
import Step3Medical from '../components/onboarding/Step3Medical';
import Step4Doctor from '../components/onboarding/Step4Doctor';

type Props = {
    session: SessionUser;
    onComplete: () => void;
};

export default function Onboarding({ session, onComplete }: Props) {
    const [step, setStep]           = useState(1);
    const [formData, setFormData]   = useState<OnboardingFormData>(INITIAL_FORM_DATA);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const navigate = useNavigate();

    /* ── Step handlers ──────────────────────────────────────── */

    function handleStep1(basicInfo: OnboardingFormData['basicInfo']) {
        setFormData((prev) => ({ ...prev, basicInfo }));
        setStep(2);
    }

    function handleStep2(incident: OnboardingFormData['incident']) {
        setFormData((prev) => ({ ...prev, incident }));
        setStep(3);
    }

    function handleStep3(medical: OnboardingFormData['medical']) {
        setFormData((prev) => ({ ...prev, medical }));
        setStep(4);
    }

    async function handleBackToLogin() {
        if (submitting) return;
        setSubmitError('');
        try {
            await signOutUser();
            navigate('/login', { replace: true });
        } catch (err: unknown) {
            setSubmitError(
                (err as Error).message ?? 'Failed to leave setup. Please try again.',
            );
        }
    }

    async function handleStep4(doctor: OnboardingFormData['doctor']) {
        const finalData: OnboardingFormData = { ...formData, doctor };
        setSubmitting(true);
        setSubmitError('');
        try {
            await savePatientOnboarding(session.profileDocId, finalData);
            onComplete();
            navigate('/', { replace: true });
        } catch (err: unknown) {
            setSubmitError(
                (err as Error).message ?? 'Failed to save your profile. Please try again.',
            );
        } finally {
            setSubmitting(false);
        }
    }

    /* ── Render ─────────────────────────────────────────────── */

    return (
        <div className="ob-shell">
            {/* Ambient background blobs */}
            <div className="ob-blob ob-blob-1" aria-hidden />
            <div className="ob-blob ob-blob-2" aria-hidden />

            <div className="ob-card" role="main">
                {/* ── Card header ── */}
                <div className="ob-card-header">
                    <div className="ob-logo">
                        <svg
                            width="28"
                            height="28"
                            viewBox="0 0 28 28"
                            fill="none"
                            aria-hidden
                        >
                            <circle cx="14" cy="14" r="14" fill="url(#ob-logo-grad)" />
                            <path
                                d="M9 14h10M14 9v10"
                                stroke="#fff"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                            />
                            <defs>
                                <linearGradient
                                    id="ob-logo-grad"
                                    x1="0" y1="0" x2="28" y2="28"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#22d3ee" />
                                    <stop offset="1" stopColor="#3b82f6" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <span>MotionCare AI</span>
                    </div>
                    <p className="ob-welcome">
                        Welcome, <strong>{session.displayName}</strong>!
                        Let's set up your patient profile.
                    </p>
                </div>

                {/* ── Step progress indicator ── */}
                <OnboardingProgress currentStep={step} />

                {/* ── Active step form ── */}
                <div className="ob-step-wrapper">
                    {step === 1 && (
                        <Step1BasicInfo
                            data={formData.basicInfo}
                            onBack={handleBackToLogin}
                            onNext={handleStep1}
                        />
                    )}
                    {step === 2 && (
                        <Step2Incident
                            data={formData.incident}
                            onNext={handleStep2}
                            onBack={() => setStep(1)}
                        />
                    )}
                    {step === 3 && (
                        <Step3Medical
                            data={formData.medical}
                            onNext={handleStep3}
                            onBack={() => setStep(2)}
                        />
                    )}
                    {step === 4 && (
                        <Step4Doctor
                            data={formData.doctor}
                            incidentType={formData.incident.type}
                            onSubmit={handleStep4}
                            onBack={() => setStep(3)}
                            submitting={submitting}
                        />
                    )}

                    {submitError && (
                        <p className="ob-submit-error" role="alert">{submitError}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
