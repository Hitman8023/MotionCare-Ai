import { useState, type FormEvent, type ChangeEvent } from 'react';
import type { IncidentInfo } from '../../types/onboarding';

const INCIDENT_TYPES = ['Fall', 'Tremor Episode', 'Dizziness', 'Unknown'] as const;

type Props = {
    data: IncidentInfo;
    onNext: (data: IncidentInfo) => void;
    onBack: () => void;
};

type FieldErrors = Partial<Record<keyof IncidentInfo, string>>;

export default function Step2Incident({ data, onNext, onBack }: Props) {
    const [form, setForm]     = useState<IncidentInfo>(data);
    const [errors, setErrors] = useState<FieldErrors>({});

    const set =
        (field: keyof IncidentInfo) =>
        (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setForm((prev) => ({ ...prev, [field]: e.target.value }));

    function validate(): boolean {
        const next: FieldErrors = {};
        if (!form.type)
            next.type = 'Please select an incident type.';
        if (!form.time)
            next.time = 'Please provide the date and time of the incident.';
        if (!form.location.trim())
            next.location = 'Location is required.';
        if (form.description.trim().length < 10)
            next.description = 'Please provide a description (at least 10 characters).';
        setErrors(next);
        return Object.keys(next).length === 0;
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (validate()) onNext(form);
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="ob-step-form">
            <div className="ob-step-header">
                <div className="ob-step-icon">⚡</div>
                <h2>Incident Information</h2>
                <p>Help us understand what happened so we can provide targeted support.</p>
            </div>

            <div className="ob-field-grid">
                {/* Incident Type */}
                <div className={`ob-field${errors.type ? ' error' : ''}`}>
                    <label htmlFor="ob-inc-type">Incident Type</label>
                    <select id="ob-inc-type" value={form.type} onChange={set('type')}>
                        <option value="">Select type…</option>
                        {INCIDENT_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                    {errors.type && <span className="ob-error">{errors.type}</span>}
                </div>

                {/* Date & Time */}
                <div className={`ob-field${errors.time ? ' error' : ''}`}>
                    <label htmlFor="ob-inc-time">Incident Date &amp; Time</label>
                    <input
                        id="ob-inc-time"
                        type="datetime-local"
                        value={form.time}
                        onChange={set('time')}
                    />
                    {errors.time && <span className="ob-error">{errors.time}</span>}
                </div>

                {/* Location */}
                <div className={`ob-field ob-field-full${errors.location ? ' error' : ''}`}>
                    <label htmlFor="ob-inc-loc">Location of Incident</label>
                    <input
                        id="ob-inc-loc"
                        value={form.location}
                        onChange={set('location')}
                        placeholder="e.g. At home – bedroom"
                    />
                    {errors.location && <span className="ob-error">{errors.location}</span>}
                </div>

                {/* Description */}
                <div className={`ob-field ob-field-full${errors.description ? ' error' : ''}`}>
                    <label htmlFor="ob-inc-desc">Short Description</label>
                    <textarea
                        id="ob-inc-desc"
                        value={form.description}
                        onChange={set('description')}
                        rows={4}
                        placeholder="Briefly describe what happened…"
                    />
                    {errors.description && <span className="ob-error">{errors.description}</span>}
                </div>
            </div>

            <div className="ob-actions">
                <button type="button" className="ob-btn-secondary" onClick={onBack}>
                    ← Back
                </button>
                <button type="submit" className="ob-btn-primary">
                    Continue <span aria-hidden>→</span>
                </button>
            </div>
        </form>
    );
}
