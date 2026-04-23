export type RecoveryAssistantTurn = {
    role: 'user' | 'model';
    text: string;
};

type AskRecoveryAssistantInput = {
    message: string;
    history: RecoveryAssistantTurn[];
    contextSummary: string;
};

type FastApiGenerateResponse = {
    model?: string;
    answer?: string;
};

const FASTAPI_BASE_URL =
    (import.meta.env.VITE_LLM_API_BASE_URL?.trim() || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const FASTAPI_MODEL = import.meta.env.VITE_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
const DOMAIN_LIMIT_MESSAGE =
    'I can only help with MotionCare recovery, exercise form, diet compliance, and rehab tips.';

const DOMAIN_KEYWORDS = [
    'motioncare',
    'recovery',
    'rehab',
    'exercise',
    'workout',
    'wrist',
    'flexion',
    'extension',
    'shoulder',
    'radial',
    'ulnar',
    'rep',
    'range of motion',
    'rom',
    'pain',
    'stiffness',
    'diet',
    'food',
    'nutrition',
    'nutritional',
    'meal',
    'snack',
    'hydration',
    'junk food',
    'junk',
    'adherence',
    'compliance',
    'progress',
    'status',
    'stats',
    'tracking',
    'track',
    'plan',
    'routine',
    'vitals',
    'spo2',
    'heart rate',
    'heart',
    'pulse',
    'temperature',
    'recovery score',
    'timeline',
    'tips',
    'tricks',
    'physio',
    'therapy',
];

const SYSTEM_INSTRUCTION =
    'You are MotionCare Recovery Assistant, an in-app helper for patients in MotionCare AI. '
    + 'Only answer questions related to recovery, rehabilitation exercises, movement form, diet compliance, adherence, '
    + 'vitals, and improving recovery outcomes. '
    + 'If the user asks unrelated topics, refuse briefly and suggest asking rehab-related questions. '
    + 'Always ground your answer in the provided patient context from MotionCare and reference concrete stats when available. '
    + 'If a value is marked unavailable, clearly state that limitation and provide a safe next step without inventing numbers. '
    + 'Keep answers practical, safe, and concise. '
    + 'Do not provide diagnosis, emergency instructions, or medication prescriptions. '
    + 'Use supportive language and provide step-by-step tips where useful.';

export async function askRecoveryAssistantWithGemini(
    input: AskRecoveryAssistantInput,
): Promise<string> {
    const message = input.message.trim();
    if (!message) {
        return 'Ask a recovery question to get started.';
    }

    if (!looksProjectRelated(message)) {
        return DOMAIN_LIMIT_MESSAGE;
    }

    const endpoint = `${FASTAPI_BASE_URL}/api/llm/generate`;
    const payload = {
        prompt: buildBackendPrompt(input),
        model: FASTAPI_MODEL,
    };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const detail = await parseFastApiError(response);
            if (response.status === 429) {
                return buildLocalRecoveryFallback(
                    input,
                    'Recovery assistant quota is currently exhausted. Showing guidance from your latest synced stats.',
                );
            }
            if (response.status >= 500) {
                return buildLocalRecoveryFallback(
                    input,
                    `Recovery assistant backend failed${detail ? `: ${detail}` : ''}. Showing guidance from your latest synced stats.`,
                );
            }
            if (response.status === 404) {
                return buildLocalRecoveryFallback(
                    input,
                    'Recovery assistant backend endpoint not found. Showing guidance from your latest synced stats.',
                );
            }
            return buildLocalRecoveryFallback(
                input,
                `Recovery assistant request failed (${response.status})${detail ? `: ${detail}` : ''}. Showing guidance from your latest synced stats.`,
            );
        }

        const data = (await response.json()) as FastApiGenerateResponse;
        const text = typeof data.answer === 'string' ? data.answer.trim() : '';
        if (!text.length) {
            return 'I could not generate a helpful response right now. Please rephrase your question.';
        }

        return text;
    } catch {
        return buildLocalRecoveryFallback(
            input,
            'Cannot reach recovery assistant backend. Showing guidance from your latest synced stats.',
        );
    }
}

function buildBackendPrompt(input: AskRecoveryAssistantInput): string {
    const recentHistory = input.history
        .slice(-6)
        .map((turn) => `[${turn.role.toUpperCase()}] ${turn.text}`)
        .join('\n');

    return [
        SYSTEM_INSTRUCTION,
        '',
        'Patient context from MotionCare:',
        input.contextSummary,
        '',
        'Recent conversation:',
        recentHistory || 'No previous conversation.',
        '',
        'Patient question:',
        input.message.trim(),
        '',
        'Answer as a practical, concise rehab assistant.',
    ].join('\n');
}

async function parseFastApiError(response: Response): Promise<string> {
    try {
        const json = (await response.json()) as { detail?: string };
        return typeof json.detail === 'string' ? json.detail.trim() : '';
    } catch {
        return '';
    }
}

function looksProjectRelated(question: string): boolean {
    const normalized = question.toLowerCase();
    let hits = 0;

    for (const keyword of DOMAIN_KEYWORDS) {
        if (normalized.includes(keyword)) {
            hits += 1;
            if (hits >= 1) return true;
        }
    }

    // Allow practical prompts often used by patients.
    if (/\b(improve|better|faster|tips?|how to)\b/.test(normalized)) {
        return true;
    }

    // Common "status" requests like "food track status" should be considered in-scope.
    if (/\b(food|diet|exercise|vitals|recovery|stats?|status|progress|track(?:ing)?)\b/.test(normalized)) {
        return true;
    }

    return false;
}

function buildLocalRecoveryFallback(
    input: AskRecoveryAssistantInput,
    backendNotice: string,
): string {
    const stats = parseContextSummary(input.contextSummary);
    const normalizedQuestion = input.message.toLowerCase();

    const wantsDiet = /\b(food|diet|nutrition|meal|snack|hydration|junk)\b/.test(normalizedQuestion);
    const wantsExercise = /\b(exercise|workout|rep|reps|adherence|active|skipped|mobility|rom|range|flex)\b/.test(
        normalizedQuestion,
    );
    const wantsVitals = /\b(vital|spo2|heart|pulse|temperature|alert|trend|recovery)\b/.test(
        normalizedQuestion,
    );
    const wantsStatus = /\b(status|stats?|progress|summary|track(?:ing)?)\b/.test(normalizedQuestion);

    const includeDiet = wantsDiet || (wantsStatus && !wantsExercise && !wantsVitals);
    const includeExercise = wantsExercise || (!wantsDiet && !wantsVitals && !wantsStatus);
    const includeVitals = wantsVitals || (!wantsDiet && !wantsExercise && wantsStatus);

    const sections: string[] = [backendNotice, ''];

    if (includeDiet) {
        const todayDietScore = readNumberStat(stats, 'Diet today score');
        const weeklyDietScore = readNumberStat(stats, 'Diet weekly score');
        const todayCompletion = readNumberStat(stats, 'Diet completion today');
        const junkMeals = readNumberStat(stats, 'Junk meals this week');
        const outsideMeals = readNumberStat(stats, 'Outside-plan meals this week');

        sections.push('Diet status:');
        sections.push(`- Today diet score: ${formatPercent(todayDietScore)}`);
        sections.push(`- Weekly diet score: ${formatPercent(weeklyDietScore)}`);
        sections.push(`- Today meal-plan completion: ${formatPercent(todayCompletion)}`);
        sections.push(`- Junk meals this week: ${formatCount(junkMeals)}`);
        sections.push(`- Outside-plan meals this week: ${formatCount(outsideMeals)}`);

        sections.push('Diet improvements:');
        if (todayCompletion !== null && todayCompletion < 70) {
            sections.push('- Complete at least 1 more planned meal today to lift compliance.');
        }
        if (junkMeals !== null && junkMeals > 0) {
            sections.push('- Swap junk snack slots with fruit, nuts, or yogurt for the same time window.');
        }
        if (outsideMeals !== null && outsideMeals > 1) {
            sections.push('- Reduce outside-plan meals by 1 this week and pre-plan alternatives.');
        }
        if (
            (todayCompletion === null || todayCompletion >= 70)
            && (junkMeals === null || junkMeals === 0)
            && (outsideMeals === null || outsideMeals <= 1)
        ) {
            sections.push('- Keep your current food routine consistent for the next 3 days.');
        }
        sections.push('');
    }

    if (includeExercise) {
        const todayReps = readNumberStat(stats, 'Today reps');
        const weeklyReps = readNumberStat(stats, 'Weekly reps');
        const adherence = readNumberStat(stats, 'Exercise adherence score');
        const activeDays = readNumberStat(stats, 'Active days this week');
        const skippedDays = readNumberStat(stats, 'Skipped days this week');
        const topExercise = readTextStat(stats, 'Top exercise');

        sections.push('Exercise status:');
        sections.push(`- Today reps: ${formatCount(todayReps)}`);
        sections.push(`- Weekly reps: ${formatCount(weeklyReps)}`);
        sections.push(`- Adherence score: ${formatPercent(adherence)}`);
        sections.push(`- Active days this week: ${formatCount(activeDays)}`);
        sections.push(`- Skipped days this week: ${formatCount(skippedDays)}`);
        sections.push(`- Top exercise: ${topExercise || 'unavailable'}`);

        sections.push('Exercise improvements:');
        if (skippedDays !== null && skippedDays > 0) {
            sections.push('- Add two fixed reminder slots daily to avoid missed rehab sessions.');
        }
        if (adherence !== null && adherence < 75) {
            sections.push('- Target one short extra set today to raise weekly adherence.');
        }
        if (todayReps !== null && todayReps < 15) {
            sections.push('- Aim for at least 15 controlled reps today with proper form.');
        }
        if (
            (skippedDays === null || skippedDays === 0)
            && (adherence === null || adherence >= 75)
            && (todayReps === null || todayReps >= 15)
        ) {
            sections.push('- Your exercise consistency looks good. Maintain this pace.');
        }
        sections.push('');
    }

    if (includeVitals) {
        const recoveryScore = readNumberStat(stats, 'Recovery score');
        const trendDelta = readSignedNumberStat(stats, 'Recovery trend delta from baseline');
        const heartRate = readNumberStat(stats, 'Heart rate');
        const spo2 = readNumberStat(stats, 'SpO2');
        const temperature = readNumberStat(stats, 'Temperature');
        const alertCount = readNumberStat(stats, 'Current vitals alerts');

        sections.push('Vitals status:');
        sections.push(`- Recovery score: ${formatPercent(recoveryScore)}`);
        sections.push(`- Recovery trend: ${formatSignedPercent(trendDelta)}`);
        sections.push(`- Heart rate: ${formatUnit(heartRate, 'bpm')}`);
        sections.push(`- SpO2: ${formatUnit(spo2, '%')}`);
        sections.push(`- Temperature: ${formatUnit(temperature, 'C')}`);
        sections.push(`- Current alerts: ${formatCount(alertCount)}`);

        sections.push('Vitals improvements:');
        if (alertCount !== null && alertCount > 0) {
            sections.push('- Add a 2-minute breathing reset between exercise sets when vitals spike.');
        }
        if (trendDelta !== null && trendDelta < 0) {
            sections.push('- Reduce intensity by one level today and prioritize quality over speed.');
        }
        if (spo2 !== null && spo2 < 94) {
            sections.push('- Pause and recover between sets; restart only when breathing is comfortable.');
        }
        if (
            (alertCount === null || alertCount === 0)
            && (trendDelta === null || trendDelta >= 0)
            && (spo2 === null || spo2 >= 94)
        ) {
            sections.push('- Vitals appear stable right now; continue your current rehab rhythm.');
        }
        sections.push('');
    }

    sections.push('Ask another question like: "show my food progress" or "what should I improve today?"');
    return sections.join('\n').trim();
}

function parseContextSummary(summary: string): Record<string, string> {
    const out: Record<string, string> = {};

    const lines = summary
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    for (const line of lines) {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex <= 0) continue;

        const key = line.slice(0, separatorIndex).trim().toLowerCase();
        const value = line.slice(separatorIndex + 1).trim();
        out[key] = value;
    }

    return out;
}

function readTextStat(stats: Record<string, string>, key: string): string | null {
    const value = stats[key.toLowerCase()];
    if (!value || /^unavailable$/i.test(value)) {
        return null;
    }
    return value;
}

function readNumberStat(stats: Record<string, string>, key: string): number | null {
    const raw = readTextStat(stats, key);
    if (!raw) return null;

    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;

    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function readSignedNumberStat(stats: Record<string, string>, key: string): number | null {
    return readNumberStat(stats, key);
}

function formatPercent(value: number | null): string {
    if (value === null) return 'unavailable';
    return `${Math.round(value)}%`;
}

function formatSignedPercent(value: number | null): string {
    if (value === null) return 'unavailable';
    if (value > 0) return `+${value.toFixed(1)}%`;
    if (value < 0) return `${value.toFixed(1)}%`;
    return '0.0%';
}

function formatCount(value: number | null): string {
    if (value === null) return 'unavailable';
    return `${Math.round(value)}`;
}

function formatUnit(value: number | null, unit: string): string {
    if (value === null) return 'unavailable';
    const rounded = Number.isInteger(value) ? `${Math.round(value)}` : value.toFixed(1);
    return `${rounded} ${unit}`;
}
