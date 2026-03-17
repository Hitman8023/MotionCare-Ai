import { useState, type FormEvent, type ChangeEvent } from 'react';
import type { BasicInfo } from '../../types/onboarding';

type Props = {
    data: BasicInfo;
    onNext: (data: BasicInfo) => void;
};

type FieldErrors = Partial<Record<keyof BasicInfo, string>>;

const PHONE_RE = /^\+?[0-9\s\-]{7,15}$/;

export default function Step1BasicInfo({ data, onNext }: Props) {
    const [form, setForm]     = useState<BasicInfo>(data);
    const [errors, setErrors] = useState<FieldErrors>({});

    const set =
        (field: keyof BasicInfo) =>
        (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
            setForm((prev) => ({ ...prev, [field]: e.target.value }));

    function validate(): boolean {
        const next: FieldErrors = {};
        if (!form.name.trim())
            next.name = 'Full name is required.';
        if (!form.age || Number(form.age) < 1 || Number(form.age) > 120)
            next.age = 'Enter a valid age (1 – 120).';
        if (!form.gender)
            next.gender = 'Please select a gender.';
        if (!PHONE_RE.test(form.phone.trim()))
            next.phone = 'Enter a valid phone number.';
        if (!PHONE_RE.test(form.emergencyContact.trim()))
            next.emergencyContact = 'Enter a valid emergency contact number.';
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
                <div className="ob-step-icon">👤</div>
                <h2>Basic Information</h2>
                <p>Tell us a little about yourself to personalise your care.</p>
            </div>

            <div className="ob-field-grid">
                {/* Full Name */}
                <div className={`ob-field ob-field-full${errors.name ? ' error' : ''}`}>
                    <label htmlFor="ob-name">Full Name</label>
                    <input
                        id="ob-name"
                        value={form.name}
                        onChange={set('name')}
                        placeholder="e.g. James Davidson"
                        autoComplete="name"
                    />
                    {errors.name && <span className="ob-error">{errors.name}</span>}
                </div>

                {/* Age */}
                <div className={`ob-field${errors.age ? ' error' : ''}`}>
                    <label htmlFor="ob-age">Age</label>
                    <input
                        id="ob-age"
                        type="number"
                        min={1}
                        max={120}
                        value={form.age}
                        onChange={set('age')}
                        placeholder="e.g. 45"
                    />
                    {errors.age && <span className="ob-error">{errors.age}</span>}
                </div>

                {/* Gender */}
                <div className={`ob-field${errors.gender ? ' error' : ''}`}>
                    <label htmlFor="ob-gender">Gender</label>
                    <select id="ob-gender" value={form.gender} onChange={set('gender')}>
                        <option value="">Select gender…</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Non-binary">Non-binary</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                    {errors.gender && <span className="ob-error">{errors.gender}</span>}
                </div>

                {/* Phone */}
                <div className={`ob-field${errors.phone ? ' error' : ''}`}>
                    <label htmlFor="ob-phone">Phone Number</label>
                    <input
                        id="ob-phone"
                        type="tel"
                        value={form.phone}
                        onChange={set('phone')}
                        placeholder="+1 234 567 8900"
                        autoComplete="tel"
                    />
                    {errors.phone && <span className="ob-error">{errors.phone}</span>}
                </div>

                {/* Emergency Contact */}
                <div className={`ob-field ob-field-full${errors.emergencyContact ? ' error' : ''}`}>
                    <label htmlFor="ob-emergency">Emergency Contact Number</label>
                    <input
                        id="ob-emergency"
                        type="tel"
                        value={form.emergencyContact}
                        onChange={set('emergencyContact')}
                        placeholder="+1 234 567 8901"
                    />
                    {errors.emergencyContact && (
                        <span className="ob-error">{errors.emergencyContact}</span>
                    )}
                </div>
            </div>

            <div className="ob-actions">
                <button type="submit" className="ob-btn-primary">
                    Continue <span aria-hidden>→</span>
                </button>
            </div>
        </form>
    );
}
