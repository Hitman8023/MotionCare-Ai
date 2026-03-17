import { useEffect, useState, type FormEvent } from 'react';
import type { DoctorInfo } from '../../types/onboarding';
import {
    fetchDoctors,
    suggestDoctors,
    type DoctorOption,
} from '../../services/onboardingService';

type Props = {
    data: DoctorInfo;
    /** Passed from Step 2 so doctor suggestions can be matched to it. */
    incidentType: string;
    onSubmit: (data: DoctorInfo) => void;
    onBack: () => void;
    submitting: boolean;
};

export default function Step4Doctor({
    data,
    incidentType,
    onSubmit,
    onBack,
    submitting,
}: Props) {
    const [form, setForm]             = useState<DoctorInfo>(data);
    const [allDoctors, setAllDoctors] = useState<DoctorOption[]>([]);
    const [displayed, setDisplayed]   = useState<DoctorOption[]>([]);
    const [loading, setLoading]       = useState(true);
    const [suggested, setSuggested]   = useState(false);
    const [error, setError]           = useState('');

    useEffect(() => {
        fetchDoctors()
            .then((docs) => {
                setAllDoctors(docs);
                setDisplayed(docs);
            })
            .catch(() => setError('Could not load doctors. Please try again.'))
            .finally(() => setLoading(false));
    }, []);

    function handleSuggest() {
        const matched = suggestDoctors(allDoctors, incidentType);
        setDisplayed(matched);
        setSuggested(true);
        setForm({ doctorId: '' });
        setError('');
    }

    function handleShowAll() {
        setDisplayed(allDoctors);
        setSuggested(false);
    }

    function validate(): boolean {
        if (!form.doctorId) {
            setError('Please select a doctor to continue.');
            return false;
        }
        setError('');
        return true;
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!submitting && validate()) onSubmit(form);
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="ob-step-form">
            <div className="ob-step-header">
                <div className="ob-step-icon">🏥</div>
                <h2>Select Your Doctor</h2>
                <p>Choose a physician who will oversee your recovery journey.</p>
            </div>

            <div className="ob-field-grid">
                <div className="ob-field ob-field-full">
                    {/* Label row with suggest button */}
                    <div className="ob-doctor-label-row">
                        <label>Assigned Doctor</label>
                        <div className="ob-suggest-btns">
                            {!suggested ? (
                                <button
                                    type="button"
                                    className="ob-btn-suggest"
                                    onClick={handleSuggest}
                                    disabled={!incidentType || loading}
                                    title={
                                        !incidentType
                                            ? 'Complete Step 2 first to enable suggestions'
                                            : `Suggest doctors for "${incidentType}"`
                                    }
                                >
                                    ✦ Suggest Doctor
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="ob-btn-suggest outline"
                                    onClick={handleShowAll}
                                >
                                    Show All
                                </button>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className="ob-doctor-loading">Loading doctors…</div>
                    ) : displayed.length === 0 ? (
                        <p className="ob-text-muted">No doctors found in the system.</p>
                    ) : (
                        <div className="ob-doctor-cards" role="radiogroup" aria-label="Doctor selection">
                            {displayed.map((doctor) => (
                                <label
                                    key={doctor.id}
                                    className={`ob-doctor-card${form.doctorId === doctor.id ? ' selected' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="doctorId"
                                        value={doctor.id}
                                        checked={form.doctorId === doctor.id}
                                        onChange={() => {
                                            setForm({ doctorId: doctor.id });
                                            setError('');
                                        }}
                                    />
                                    <div className="ob-doctor-avatar" aria-hidden>
                                        {doctor.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="ob-doctor-info">
                                        <span className="ob-doctor-name">{doctor.name}</span>
                                        {doctor.specialty && (
                                            <span className="ob-doctor-specialty">
                                                {doctor.specialty}
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        className={`ob-doctor-check${form.doctorId === doctor.id ? ' visible' : ''}`}
                                        aria-hidden
                                    >
                                        ✓
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}

                    {error && <span className="ob-error" style={{ marginTop: 8 }}>{error}</span>}

                    {suggested && (
                        <p className="ob-suggest-note">
                            ✦ Showing doctors matched to your{' '}
                            <strong>{incidentType}</strong> incident.
                        </p>
                    )}
                </div>
            </div>

            <div className="ob-actions">
                <button
                    type="button"
                    className="ob-btn-secondary"
                    onClick={onBack}
                    disabled={submitting}
                >
                    ← Back
                </button>
                <button type="submit" className="ob-btn-primary" disabled={submitting}>
                    {submitting ? (
                        <span className="ob-spinner" aria-label="Saving…" />
                    ) : (
                        'Complete Setup ✓'
                    )}
                </button>
            </div>
        </form>
    );
}
