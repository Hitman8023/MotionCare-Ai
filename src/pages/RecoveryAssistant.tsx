import { useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../firebase';
import type { ExerciseType } from '../services/exerciseDetection';
import {
    askRecoveryAssistantWithGemini,
    type RecoveryAssistantTurn,
} from '../services/geminiRecoveryAssistant';

type RecoveryChatMessage = RecoveryAssistantTurn & {
    id: string;
    createdAt: number;
};

type WeeklyExerciseSummary = {
    todayTotal: number;
    weeklyTotal: number;
    skippedDays: number;
    activeDays: number;
    bestExercise: ExerciseType;
    bestExerciseReps: number;
};

const DAILY_REP_STORAGE_KEY_PREFIX = 'motioncare:daily-reps:v1';

const EXERCISE_ORDER: ExerciseType[] = [
    'wrist_flexion',
    'wrist_extension',
    'front_shoulder_raise',
    'radial_deviation',
    'ulnar_deviation',
];

const CHAT_QUICK_PROMPTS = [
    'Give me 3 practical tips to improve my recovery score this week.',
    'What should I do if I am skipping exercise days?',
    'How can I improve my wrist range of motion safely?',
    'Suggest a simple day plan for rehab + diet compliance.',
];

const EXERCISE_LABELS: Record<ExerciseType, string> = {
    wrist_flexion: 'Wrist Flexion',
    wrist_extension: 'Wrist Extension',
    front_shoulder_raise: 'Front Shoulder Raise',
    radial_deviation: 'Radial Deviation',
    ulnar_deviation: 'Ulnar Deviation',
};

export default function RecoveryAssistant() {
    const [nowDateKey, setNowDateKey] = useState(() => getLocalDateKey());
    const [statsTick, setStatsTick] = useState(0);
    const [chatMessages, setChatMessages] = useState<RecoveryChatMessage[]>(() => [
        createChatMessage(
            'model',
            'Hi, I am your MotionCare recovery assistant. Ask rehab-only questions about movement, exercise adherence, diet, and improving recovery outcomes.',
        ),
    ]);
    const [chatInput, setChatInput] = useState('');
    const [chatSending, setChatSending] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const threadEndRef = useRef<HTMLDivElement | null>(null);

    const patientUid = auth.currentUser?.uid ?? 'local';

    useEffect(() => {
        const interval = window.setInterval(() => {
            setNowDateKey(getLocalDateKey());
            setStatsTick((prev) => prev + 1);
        }, 5000);

        return () => window.clearInterval(interval);
    }, []);

    const summary = useMemo(
        () => summarizeWeeklyExercise(patientUid, nowDateKey),
        [patientUid, nowDateKey, statsTick],
    );

    const chatContextSummary = useMemo(
        () => [
            `Today reps: ${summary.todayTotal}`,
            `Weekly reps: ${summary.weeklyTotal}`,
            `Active days this week: ${summary.activeDays}`,
            `Skipped days this week: ${summary.skippedDays}`,
            `Top exercise: ${EXERCISE_LABELS[summary.bestExercise]} (${summary.bestExerciseReps} reps)`,
        ].join('\n'),
        [summary],
    );

    useEffect(() => {
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [chatMessages, chatSending]);

    const sendRecoveryQuestion = async (prefilledQuestion?: string) => {
        const question = (prefilledQuestion ?? chatInput).trim();
        if (!question || chatSending) return;

        const historySnapshot = chatMessages.map(({ role, text }) => ({ role, text }));

        setChatMessages((prev) => [...prev, createChatMessage('user', question)]);
        setChatInput('');
        setChatSending(true);
        setChatError(null);

        try {
            const answer = await askRecoveryAssistantWithGemini({
                message: question,
                history: historySnapshot,
                contextSummary: chatContextSummary,
            });

            setChatMessages((prev) => [...prev, createChatMessage('model', answer)]);
        } catch {
            const fallback =
                'I could not answer right now. Please retry with a rehab-related question.';
            setChatMessages((prev) => [...prev, createChatMessage('model', fallback)]);
            setChatError('Assistant request failed. Please retry.');
        } finally {
            setChatSending(false);
        }
    };

    const copyMessage = async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMessageId(id);
            window.setTimeout(() => {
                setCopiedMessageId((current) => (current === id ? null : current));
            }, 1400);
        } catch {
            setCopiedMessageId(null);
        }
    };

    return (
        <div className="aii-page recovery-assistant-page">
            <div className="section recovery-assistant-section">
                <section className="card aii-chatbot-card recovery-assistant-card">
                    <div className="aii-chatbot-head">
                        <div>
                            <h3 className="aii-chatbot-title">Recovery Assistant</h3>
                            <p className="aii-chatbot-intro">
                                Ask project-related questions only: exercise form, adherence improvement, recovery strategies, and diet compliance.
                            </p>
                        </div>
                        <span className="aii-chatbot-status">Live tips mode</span>
                    </div>

                    <div className="aii-chatbot-quick-row recovery-assistant-quick-row">
                        {CHAT_QUICK_PROMPTS.map((prompt) => (
                            <button
                                key={prompt}
                                type="button"
                                className="aii-chatbot-quick-btn"
                                onClick={() => {
                                    void sendRecoveryQuestion(prompt);
                                }}
                                disabled={chatSending}
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>

                    <div className="aii-chatbot-thread recovery-assistant-thread" role="log" aria-live="polite">
                        {chatMessages.map((message) => (
                            <div
                                key={message.id}
                                className={`aii-chatbot-row aii-chatbot-row-${message.role}`}
                            >
                                <div className={`aii-chatbot-avatar aii-chatbot-avatar-${message.role}`}>
                                    {message.role === 'model' ? 'AI' : 'YOU'}
                                </div>
                                <div className="aii-chatbot-bubble-wrap">
                                    <div className="aii-chatbot-meta">
                                        <span>{message.role === 'model' ? 'Recovery Assistant' : 'You'}</span>
                                        <time dateTime={new Date(message.createdAt).toISOString()}>
                                            {formatTime(message.createdAt)}
                                        </time>
                                        {message.role === 'model' && (
                                            <button
                                                type="button"
                                                className="aii-chatbot-copy"
                                                onClick={() => {
                                                    void copyMessage(message.id, message.text);
                                                }}
                                            >
                                                {copiedMessageId === message.id ? 'Copied' : 'Copy'}
                                            </button>
                                        )}
                                    </div>
                                    <article className={`aii-chatbot-msg aii-chatbot-msg-${message.role}`}>
                                        {message.role === 'model' ? (
                                            <AssistantResponseContent text={message.text} />
                                        ) : (
                                            message.text
                                        )}
                                    </article>
                                </div>
                            </div>
                        ))}
                        {chatSending && (
                            <div className="aii-chatbot-row aii-chatbot-row-model">
                                <div className="aii-chatbot-avatar aii-chatbot-avatar-model">AI</div>
                                <div className="aii-chatbot-bubble-wrap">
                                    <div className="aii-chatbot-meta">
                                        <span>Recovery Assistant</span>
                                        <span>typing</span>
                                    </div>
                                    <div className="aii-chatbot-typing">
                                        <span className="aii-chatbot-typing-indicator" aria-hidden="true">
                                            <span />
                                            <span />
                                            <span />
                                        </span>
                                        Assistant is thinking...
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={threadEndRef} />
                    </div>

                    {chatError && <p className="aii-chatbot-error">{chatError}</p>}

                    <form
                        className="aii-chatbot-form recovery-assistant-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void sendRecoveryQuestion();
                        }}
                    >
                        <textarea
                            className="aii-chatbot-input"
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    void sendRecoveryQuestion();
                                }
                            }}
                            placeholder="Ask tips and tricks to improve recovery based on your current progress..."
                            rows={3}
                        />
                        <button
                            type="submit"
                            className="aii-chatbot-send"
                            disabled={chatSending || !chatInput.trim()}
                        >
                            {chatSending ? 'Sending...' : 'Ask Assistant'}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
}

function getLocalDateKey(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function summarizeWeeklyExercise(uid: string, todayKey: string): WeeklyExerciseSummary {
    const dayKeys = getPreviousDateKeys(todayKey, 7);
    let weeklyTotal = 0;
    let skippedDays = 0;
    let activeDays = 0;

    const weeklyByExercise: Partial<Record<ExerciseType, number>> = {};
    for (const exercise of EXERCISE_ORDER) {
        weeklyByExercise[exercise] = 0;
    }

    for (const dateKey of dayKeys) {
        const dayMap = readDailyRepMap(uid, dateKey);
        const dayTotal = EXERCISE_ORDER.reduce((sum, exercise) => sum + (dayMap[exercise] ?? 0), 0);

        weeklyTotal += dayTotal;
        if (dayTotal > 0) {
            activeDays += 1;
        } else {
            skippedDays += 1;
        }

        for (const exercise of EXERCISE_ORDER) {
            weeklyByExercise[exercise] = (weeklyByExercise[exercise] ?? 0) + (dayMap[exercise] ?? 0);
        }
    }

    const todayMap = readDailyRepMap(uid, todayKey);
    const todayTotal = EXERCISE_ORDER.reduce((sum, exercise) => sum + (todayMap[exercise] ?? 0), 0);

    let bestExercise: ExerciseType = EXERCISE_ORDER[0];
    let bestExerciseReps = weeklyByExercise[bestExercise] ?? 0;
    for (const exercise of EXERCISE_ORDER) {
        const reps = weeklyByExercise[exercise] ?? 0;
        if (reps > bestExerciseReps) {
            bestExercise = exercise;
            bestExerciseReps = reps;
        }
    }

    return {
        todayTotal,
        weeklyTotal,
        skippedDays,
        activeDays,
        bestExercise,
        bestExerciseReps,
    };
}

function getPreviousDateKeys(todayKey: string, count: number): string[] {
    const [y, m, d] = todayKey.split('-').map(Number);
    const start = new Date(y, (m ?? 1) - 1, d ?? 1);
    const keys: string[] = [];

    for (let i = 0; i < count; i += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() - i);
        keys.push(getLocalDateKey(date));
    }

    return keys;
}

function readDailyRepMap(uid: string, dateKey: string): Partial<Record<ExerciseType, number>> {
    if (typeof window === 'undefined') {
        return {};
    }

    const key = `${DAILY_REP_STORAGE_KEY_PREFIX}:${uid}:${dateKey}`;
    const fallbackKey = `${DAILY_REP_STORAGE_KEY_PREFIX}:local:${dateKey}`;
    const raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(fallbackKey);
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw) as Partial<Record<ExerciseType, unknown>>;
        const map: Partial<Record<ExerciseType, number>> = {};

        for (const exercise of EXERCISE_ORDER) {
            const value = parsed[exercise];
            map[exercise] =
                typeof value === 'number' && Number.isFinite(value) && value > 0
                    ? Math.floor(value)
                    : 0;
        }

        return map;
    } catch {
        return {};
    }
}

function createChatMessage(role: 'user' | 'model', text: string): RecoveryChatMessage {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        role,
        text,
    };
}

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

type AssistantBlock =
    | { kind: 'heading'; text: string }
    | { kind: 'paragraph'; text: string }
    | { kind: 'unordered-list'; items: string[] }
    | { kind: 'ordered-list'; items: string[] };

function AssistantResponseContent({ text }: { text: string }) {
    const blocks = parseAssistantBlocks(text);

    return (
        <div className="aii-chatbot-rich">
            {blocks.map((block, index) => {
                if (block.kind === 'heading') {
                    return (
                        <h4 key={`assistant-block-${index}`} className="aii-chatbot-rich-heading">
                            {block.text}
                        </h4>
                    );
                }

                if (block.kind === 'unordered-list') {
                    return (
                        <ul key={`assistant-block-${index}`} className="aii-chatbot-rich-list">
                            {block.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    );
                }

                if (block.kind === 'ordered-list') {
                    return (
                        <ol key={`assistant-block-${index}`} className="aii-chatbot-rich-list aii-chatbot-rich-list-ordered">
                            {block.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ol>
                    );
                }

                return (
                    <p key={`assistant-block-${index}`} className="aii-chatbot-rich-paragraph">
                        {block.text}
                    </p>
                );
            })}
        </div>
    );
}

function parseAssistantBlocks(input: string): AssistantBlock[] {
    const text = input.replace(/\r\n/g, '\n').trim();
    if (!text) {
        return [{ kind: 'paragraph', text: 'No response available.' }];
    }

    const chunks = text
        .split(/\n{2,}/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);

    return chunks.map((chunk) => {
        const lines = chunk
            .split('\n')
            .map((line) => sanitizeAssistantLine(line.trim()))
            .filter(Boolean);

        const unorderedItems = lines
            .map((line) => {
                const match = line.match(/^(?:[-*•])\s+(.*)$/);
                return match ? match[1].trim() : null;
            })
            .filter((item): item is string => Boolean(item));

        if (unorderedItems.length > 0 && unorderedItems.length === lines.length) {
            return { kind: 'unordered-list', items: unorderedItems } as AssistantBlock;
        }

        const orderedItems = lines
            .map((line) => {
                const match = line.match(/^\d+[.)]\s+(.*)$/);
                return match ? match[1].trim() : null;
            })
            .filter((item): item is string => Boolean(item));

        if (orderedItems.length > 0 && orderedItems.length === lines.length) {
            return { kind: 'ordered-list', items: orderedItems } as AssistantBlock;
        }

        if (lines.length === 1 && lines[0].endsWith(':') && lines[0].length <= 72) {
            return { kind: 'heading', text: lines[0].slice(0, -1) } as AssistantBlock;
        }

        return {
            kind: 'paragraph',
            text: lines.join(' '),
        } as AssistantBlock;
    });
}

function sanitizeAssistantLine(line: string): string {
    if (!line) return '';

    const normalized = line
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, '$1$2')
        .replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, '$1$2')
        .replace(/\*\*/g, '')
        .replace(/__/g, '');

    return normalized.replace(/\s+/g, ' ').trim();
}