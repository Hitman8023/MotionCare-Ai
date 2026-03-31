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
    'meal',
    'snack',
    'hydration',
    'junk food',
    'vitals',
    'spo2',
    'heart rate',
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
                return 'Recovery assistant quota is currently exhausted. Please try again later.';
            }
            if (response.status >= 500) {
                return `Recovery assistant backend failed${detail ? `: ${detail}` : ''}.`;
            }
            if (response.status === 404) {
                return 'Recovery assistant backend endpoint not found. Verify FastAPI is running on /api/llm/generate.';
            }
            return `Recovery assistant request failed (${response.status})${detail ? `: ${detail}` : ''}.`;
        }

        const data = (await response.json()) as FastApiGenerateResponse;
        const text = typeof data.answer === 'string' ? data.answer.trim() : '';
        if (!text.length) {
            return 'I could not generate a helpful response right now. Please rephrase your question.';
        }

        return text;
    } catch {
        return 'Cannot reach recovery assistant backend. Start FastAPI server and retry.';
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

    // Allow short practical prompts often used by patients.
    if (/\b(improve|better|faster|tips?|how to)\b/.test(normalized)) {
        return true;
    }

    return false;
}
