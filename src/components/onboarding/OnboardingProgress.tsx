type Props = {
    /** 1-based current step number (1 – 4). */
    currentStep: number;
};

const STEPS = [
    { label: 'Basic Info', icon: '👤' },
    { label: 'Incident',   icon: '⚡' },
    { label: 'Medical',    icon: '🩺' },
    { label: 'Doctor',     icon: '🏥' },
];

export default function OnboardingProgress({ currentStep }: Props) {
    return (
        <div className="ob-progress">
            {STEPS.map((step, idx) => {
                const stepNum    = idx + 1;
                const isCompleted = stepNum < currentStep;
                const isActive    = stepNum === currentStep;

                return (
                    <div
                        key={step.label}
                        className={[
                            'ob-progress-item',
                            isActive    ? 'active'    : '',
                            isCompleted ? 'completed' : '',
                        ].join(' ').trim()}
                    >
                        <div className="ob-progress-circle">
                            {isCompleted ? (
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path
                                        d="M2 7l4 4 6-7"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            ) : (
                                <span>{stepNum}</span>
                            )}
                        </div>

                        <span className="ob-progress-label">{step.label}</span>

                        {idx < STEPS.length - 1 && (
                            <div className={`ob-progress-line${isCompleted ? ' filled' : ''}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
