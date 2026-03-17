import { useState, type FormEvent, type ChangeEvent } from 'react';
import type { MedicalInfo } from '../../types/onboarding';

type Props = {
    data: MedicalInfo;
    onNext: (data: MedicalInfo) => void;
    onBack: () => void;
};

type FieldErrors = Partial<Record<keyof MedicalInfo, string>>;
type TextareaField = keyof Omit<MedicalInfo, 'previousIncidents'>;

export default function Step3Medical({ data, onNext, onBack }: Props) {
    const [form, setForm]     = useState<MedicalInfo>(data);
    const [errors, setErrors] = useState<FieldErrors>({});

    const setTextarea =
        (field: TextareaField) =>
        (e: ChangeEvent<HTMLTextAreaElement>) =>
            setForm((prev) => ({ ...prev, [field]: e.target.value }));

    function validate(): boolean {
        const next: FieldErrors = {};
        if (!form.conditions.trim())
            next.conditions = 'Please list known conditions, or enter "None".';
        if (!form.medications.trim())
            next.medications = 'Please list current medications, or enter "None".';
        if (!form.allergies.trim())
            next.allergies = 'Please list allergies, or enter "None".';
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
                <div className="ob-step-icon">🩺</div>
                <h2>Medical Information</h2>
                <p>Your medical background helps us provide safer, more targeted support.</p>
            </div>

            <div className="ob-field-grid">
                {/* Conditions */}
                <div className={`ob-field ob-field-full${errors.conditions ? ' error' : ''}`}>
                    <label htmlFor="ob-conditions">Known Medical Conditions</label>
                    <textarea
                        id="ob-conditions"
                        value={form.conditions}
                        onChange={setTextarea('conditions')}
                        rows={3}
                        placeholder="e.g. Hypertension, Type 2 Diabetes — or None"
                    />
                    {errors.conditions && <span className="ob-error">{errors.conditions}</span>}
                </div>

                {/* Medications */}
                <div className={`ob-field ob-field-full${errors.medications ? ' error' : ''}`}>
                    <label htmlFor="ob-medications">Current Medications</label>
                    <textarea
                        id="ob-medications"
                        value={form.medications}
                        onChange={setTextarea('medications')}
                        rows={3}
                        placeholder="e.g. Metformin 500 mg, Lisinopril — or None"
                    />
                    {errors.medications && <span className="ob-error">{errors.medications}</span>}
                </div>

                {/* Allergies */}
                <div className={`ob-field ob-field-full${errors.allergies ? ' error' : ''}`}>
                    <label htmlFor="ob-allergies">Allergies</label>
                    <textarea
                        id="ob-allergies"
                        value={form.allergies}
                        onChange={setTextarea('allergies')}
                        rows={2}
                        placeholder="e.g. Penicillin, Peanuts — or None"
                    />
                    {errors.allergies && <span className="ob-error">{errors.allergies}</span>}
                </div>

                {/* Previous Similar Incidents */}
                <div className="ob-field ob-field-full">
                    <label>Previous Similar Incidents</label>
                    <div className="ob-radio-group" role="radiogroup" aria-label="Previous similar incidents">
                        <label className="ob-radio">
                            <input
                                type="radio"
                                name="previousIncidents"
                                checked={form.previousIncidents === true}
                                onChange={() =>
                                    setForm((prev) => ({ ...prev, previousIncidents: true }))
                                }
                            />
                            <span className="ob-radio-mark" aria-hidden />
                            Yes
                        </label>
                        <label className="ob-radio">
                            <input
                                type="radio"
                                name="previousIncidents"
                                checked={form.previousIncidents === false}
                                onChange={() =>
                                    setForm((prev) => ({ ...prev, previousIncidents: false }))
                                }
                            />
                            <span className="ob-radio-mark" aria-hidden />
                            No
                        </label>
                    </div>
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
