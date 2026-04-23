import { useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../firebase';
import type { ExerciseType } from '../services/exerciseDetection';
import {
    computeAccuracy,
    computeFlexRange,
    computeRecoveryScore,
    detectAlertCount,
    formatTimestampLabel,
} from '../services/recoveryMetrics';
import {
    subscribeToPatientLiveData,
    subscribeToPatientSessionHistory,
} from '../services/realtimeDbService';
import {
    askRecoveryAssistantWithGemini,
    type RecoveryAssistantTurn,
} from '../services/geminiRecoveryAssistant';
import type { SensorSample, SessionSummary } from '../types/sensor';

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

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'beverages';

type MealLog = {
    selectedItems: string[];
    outsideItems: string;
    includesJunk: boolean;
};

type DailyDietLog = {
    dateKey: string;
    meals: Record<MealType, MealLog>;
};

type WeeklyDietSummary = {
    todayScore: number;
    weeklyScore: number;
    todayCompletionRate: number;
    loggedDays: number;
    junkMeals: number;
    outsideMeals: number;
};

type LiveVitalsSummary = {
    hasLiveData: boolean;
    timestampLabel: string;
    heartRate: number | null;
    spo2: number | null;
    temperature: number | null;
    recoveryScore: number;
    movementAccuracy: number;
    flexRange: number;
    alertCount: number;
    trendDelta: number;
};

type SessionHistorySummary = {
    totalSessions: number;
    completedSessions: number;
    avgCompletionRate: number;
    avgFormQuality: number;
    totalReps: number;
    lastSessionLabel: string;
};

type DietDaySummary = {
    touched: boolean;
    score: number;
    completionRate: number;
    junkMeals: number;
    outsideMeals: number;
};

const DAILY_REP_STORAGE_KEY_PREFIX = 'motioncare:daily-reps:v1';
const DIET_LOG_STORAGE_KEY_PREFIX = 'motioncare:diet-log:v1';
const MAX_SAMPLE_HISTORY = 120;

const EXERCISE_ORDER: ExerciseType[] = [
    'wrist_flexion',
    'wrist_extension',
    'front_shoulder_raise',
    'radial_deviation',
    'ulnar_deviation',
];

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks', 'beverages'];

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
            'Hi, I am your MotionCare recovery assistant. I use your vitals, exercise, diet, and session stats to personalize answers. Ask rehab-only questions about movement, adherence, and safer recovery outcomes.',
        ),
    ]);
    const [chatInput, setChatInput] = useState('');
    const [chatSending, setChatSending] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [latestSample, setLatestSample] = useState<SensorSample | null>(null);
    const [sampleHistory, setSampleHistory] = useState<SensorSample[]>([]);
    const [sessionHistory, setSessionHistory] = useState<Record<string, SessionSummary>>({});
    const threadEndRef = useRef<HTMLDivElement | null>(null);

    const patientUid = auth.currentUser?.uid ?? 'local';

    useEffect(() => {
        const interval = window.setInterval(() => {
            setNowDateKey(getLocalDateKey());
            setStatsTick((prev) => prev + 1);
        }, 5000);

        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!patientUid || patientUid === 'local') {
            setLatestSample(null);
            setSampleHistory([]);
            return;
        }

        const unsubscribe = subscribeToPatientLiveData(
            patientUid,
            (sample) => {
                if (!sample) return;

                setLatestSample(sample);
                setSampleHistory((prev) => {
                    const next = [...prev, sample];
                    return next.length > MAX_SAMPLE_HISTORY
                        ? next.slice(next.length - MAX_SAMPLE_HISTORY)
                        : next;
                });
            },
            (error) => {
                console.error('Live vitals stream error', error);
            },
        );

        return unsubscribe;
    }, [patientUid]);

    useEffect(() => {
        if (!patientUid || patientUid === 'local') {
            setSessionHistory({});
            return;
        }

        const unsubscribe = subscribeToPatientSessionHistory(
            patientUid,
            (next) => {
                setSessionHistory(next);
            },
            (error) => {
                console.error('Session history stream error', error);
            },
        );

        return unsubscribe;
    }, [patientUid]);

    const summary = useMemo(
        () => summarizeWeeklyExercise(patientUid, nowDateKey),
        [patientUid, nowDateKey, statsTick],
    );

    const vitalsSummary = useMemo(
        () => summarizeLiveVitals(latestSample, sampleHistory),
        [latestSample, sampleHistory],
    );

    const sessionSummary = useMemo(
        () => summarizeSessionHistory(sessionHistory),
        [sessionHistory],
    );

    const dietSummary = useMemo(
        () => summarizeWeeklyDiet(patientUid, nowDateKey),
        [patientUid, nowDateKey, statsTick],
    );

    const exerciseAdherenceScore = useMemo(
        () => clamp(roundInt((summary.activeDays / 7) * 100), 0, 100),
        [summary.activeDays],
    );

    const chatContextSummary = useMemo(
        () =>
            buildChatContextSummary(
                nowDateKey,
                summary,
                exerciseAdherenceScore,
                vitalsSummary,
                sessionSummary,
                dietSummary,
            ),
        [
            nowDateKey,
            summary,
            exerciseAdherenceScore,
            vitalsSummary,
            sessionSummary,
            dietSummary,
        ],
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

function summarizeLiveVitals(
    latestSample: SensorSample | null,
    sampleHistory: SensorSample[],
): LiveVitalsSummary {
    if (!latestSample) {
        return {
            hasLiveData: false,
            timestampLabel: 'unavailable',
            heartRate: null,
            spo2: null,
            temperature: null,
            recoveryScore: 0,
            movementAccuracy: 0,
            flexRange: 0,
            alertCount: 0,
            trendDelta: 0,
        };
    }

    const scoreSeries = sampleHistory.map((sample) => computeRecoveryScore(sample));
    const recentWindow = scoreSeries.slice(Math.max(0, scoreSeries.length - 20));
    const baselineWindow = scoreSeries.length >= 20 ? scoreSeries.slice(0, 20) : scoreSeries;

    const recentAverage = recentWindow.length
        ? average(recentWindow)
        : computeRecoveryScore(latestSample);
    const baselineAverage = baselineWindow.length ? average(baselineWindow) : recentAverage;

    return {
        hasLiveData: true,
        timestampLabel: formatTimestampLabel(latestSample.timestamp),
        heartRate: roundInt(latestSample.heart_rate),
        spo2: roundInt(latestSample.spo2),
        temperature: roundToOne(latestSample.temperature),
        recoveryScore: clamp(roundInt(recentAverage), 0, 100),
        movementAccuracy: clamp(computeAccuracy(latestSample), 0, 100),
        flexRange: clamp(computeFlexRange(latestSample), 0, 180),
        alertCount: Math.max(0, detectAlertCount(latestSample)),
        trendDelta: roundToOne(recentAverage - baselineAverage),
    };
}

function summarizeSessionHistory(history: Record<string, SessionSummary>): SessionHistorySummary {
    const entries = Object.values(history);
    if (!entries.length) {
        return {
            totalSessions: 0,
            completedSessions: 0,
            avgCompletionRate: 0,
            avgFormQuality: 0,
            totalReps: 0,
            lastSessionLabel: 'unavailable',
        };
    }

    const completionRates = entries.map((entry) => clamp(entry.completionRatio * 100, 0, 100));
    const formQualityScores = entries.map((entry) => clamp(entry.formQuality, 0, 100));
    const totalReps = entries.reduce(
        (sum, entry) => sum + Math.max(0, roundInt(entry.repsDone)),
        0,
    );
    const completedSessions = entries.filter((entry) => entry.completionRatio > 0).length;

    const lastSessionTimestamp = entries
        .map((entry) => entry.updatedAt || entry.startedAt || entry.dateKey)
        .sort((a, b) => toTimestampMs(b) - toTimestampMs(a))[0];

    return {
        totalSessions: entries.length,
        completedSessions,
        avgCompletionRate: roundInt(average(completionRates)),
        avgFormQuality: roundInt(average(formQualityScores)),
        totalReps,
        lastSessionLabel: formatTimestampLabel(lastSessionTimestamp),
    };
}

function summarizeWeeklyDiet(uid: string, todayDateKey: string): WeeklyDietSummary {
    if (typeof window === 'undefined') {
        return {
            todayScore: 0,
            weeklyScore: 0,
            todayCompletionRate: 0,
            loggedDays: 0,
            junkMeals: 0,
            outsideMeals: 0,
        };
    }

    const dayKeys = getPreviousDateKeys(todayDateKey, 7);
    let scoreSum = 0;
    let loggedDays = 0;
    let junkMeals = 0;
    let outsideMeals = 0;
    let todayScore = 0;
    let todayCompletionRate = 0;

    dayKeys.forEach((dateKey, index) => {
        const dayLog = readDietLog(uid, dateKey);
        const daySummary = summarizeDietDay(dayLog);

        if (index === 0) {
            todayScore = daySummary.score;
            todayCompletionRate = daySummary.completionRate;
        }

        junkMeals += daySummary.junkMeals;
        outsideMeals += daySummary.outsideMeals;

        if (daySummary.touched) {
            scoreSum += daySummary.score;
            loggedDays += 1;
        }
    });

    return {
        todayScore,
        weeklyScore: loggedDays > 0 ? clamp(roundInt(scoreSum / loggedDays), 0, 100) : 0,
        todayCompletionRate,
        loggedDays,
        junkMeals,
        outsideMeals,
    };
}

function summarizeDietDay(log: DailyDietLog): DietDaySummary {
    let selectedCount = 0;
    let plannedCount = 0;
    let junkMeals = 0;
    let outsideMeals = 0;

    for (const mealType of MEAL_ORDER) {
        const meal = log.meals[mealType];
        selectedCount += meal.selectedItems.length;
        plannedCount += 3;

        if (meal.includesJunk) {
            junkMeals += 1;
        }

        if (meal.outsideItems.trim().length > 0) {
            outsideMeals += 1;
        }
    }

    const completionRate = plannedCount > 0
        ? roundInt((selectedCount / plannedCount) * 100)
        : 0;
    const touched = selectedCount > 0 || junkMeals > 0 || outsideMeals > 0;
    const score = clamp(
        roundInt(
            completionRate * 0.72 +
                (junkMeals === 0 ? 28 : Math.max(0, 28 - junkMeals * 10)) -
                outsideMeals * 2,
        ),
        0,
        100,
    );

    return {
        touched,
        score,
        completionRate,
        junkMeals,
        outsideMeals,
    };
}

function readDietLog(uid: string, dateKey: string): DailyDietLog {
    if (typeof window === 'undefined') {
        return createEmptyDietLog(dateKey);
    }

    const key = `${DIET_LOG_STORAGE_KEY_PREFIX}:${uid}:${dateKey}`;
    const fallbackKey = `${DIET_LOG_STORAGE_KEY_PREFIX}:local:${dateKey}`;
    const raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(fallbackKey);
    if (!raw) {
        return createEmptyDietLog(dateKey);
    }

    try {
        const parsed = JSON.parse(raw) as { meals?: Record<string, unknown> };
        const base = createEmptyDietLog(dateKey);

        for (const mealType of MEAL_ORDER) {
            base.meals[mealType] = coerceMealLog(parsed.meals?.[mealType]);
        }

        return base;
    } catch {
        return createEmptyDietLog(dateKey);
    }
}

function createEmptyDietLog(dateKey: string): DailyDietLog {
    return {
        dateKey,
        meals: {
            breakfast: { selectedItems: [], outsideItems: '', includesJunk: false },
            lunch: { selectedItems: [], outsideItems: '', includesJunk: false },
            dinner: { selectedItems: [], outsideItems: '', includesJunk: false },
            snacks: { selectedItems: [], outsideItems: '', includesJunk: false },
            beverages: { selectedItems: [], outsideItems: '', includesJunk: false },
        },
    };
}

function coerceMealLog(raw: unknown): MealLog {
    if (!raw || typeof raw !== 'object') {
        return { selectedItems: [], outsideItems: '', includesJunk: false };
    }

    const next = raw as { selectedItems?: unknown; outsideItems?: unknown; includesJunk?: unknown };
    const selectedItems = Array.isArray(next.selectedItems)
        ? next.selectedItems
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    return {
        selectedItems,
        outsideItems: typeof next.outsideItems === 'string' ? next.outsideItems : '',
        includesJunk: Boolean(next.includesJunk),
    };
}

function buildChatContextSummary(
    dateKey: string,
    exerciseSummary: WeeklyExerciseSummary,
    exerciseAdherenceScore: number,
    vitalsSummary: LiveVitalsSummary,
    sessionSummary: SessionHistorySummary,
    dietSummary: WeeklyDietSummary,
): string {
    const vitalsLines = vitalsSummary.hasLiveData
        ? [
            `Latest vitals timestamp: ${vitalsSummary.timestampLabel}`,
            `Heart rate: ${vitalsSummary.heartRate} bpm`,
            `SpO2: ${vitalsSummary.spo2}%`,
            `Temperature: ${vitalsSummary.temperature} C`,
            `Recovery score: ${vitalsSummary.recoveryScore}%`,
            `Movement accuracy: ${vitalsSummary.movementAccuracy}%`,
            `Flex range: ${vitalsSummary.flexRange} degrees`,
            `Current vitals alerts: ${vitalsSummary.alertCount}`,
            `Recovery trend delta from baseline: ${formatSigned(vitalsSummary.trendDelta)}%`,
        ]
        : [
            'Latest vitals timestamp: unavailable',
            'Heart rate: unavailable',
            'SpO2: unavailable',
            'Temperature: unavailable',
            'Recovery score: unavailable',
            'Movement accuracy: unavailable',
            'Flex range: unavailable',
            'Current vitals alerts: unavailable',
            'Recovery trend delta from baseline: unavailable',
        ];

    return [
        `Date: ${dateKey}`,
        ...vitalsLines,
        `Today reps: ${exerciseSummary.todayTotal}`,
        `Weekly reps: ${exerciseSummary.weeklyTotal}`,
        `Exercise adherence score: ${exerciseAdherenceScore}%`,
        `Active days this week: ${exerciseSummary.activeDays}`,
        `Skipped days this week: ${exerciseSummary.skippedDays}`,
        `Top exercise: ${EXERCISE_LABELS[exerciseSummary.bestExercise]} (${exerciseSummary.bestExerciseReps} reps)`,
        `Diet today score: ${dietSummary.todayScore}%`,
        `Diet completion today: ${dietSummary.todayCompletionRate}%`,
        `Diet weekly score: ${dietSummary.weeklyScore}%`,
        `Diet logged days this week: ${dietSummary.loggedDays}`,
        `Junk meals this week: ${dietSummary.junkMeals}`,
        `Outside-plan meals this week: ${dietSummary.outsideMeals}`,
        `Session records: ${sessionSummary.totalSessions}`,
        `Completed sessions: ${sessionSummary.completedSessions}`,
        `Average session completion: ${sessionSummary.avgCompletionRate}%`,
        `Average session form quality: ${sessionSummary.avgFormQuality}%`,
        `Total rehab reps from session history: ${sessionSummary.totalReps}`,
        `Last session update: ${sessionSummary.lastSessionLabel}`,
        'Use these patient stats directly in recommendations. If a stat is unavailable, say unavailable instead of guessing.',
    ].join('\n');
}

function toTimestampMs(value: string): number {
    const date = new Date(value);
    const time = date.getTime();
    return Number.isFinite(time) ? time : 0;
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value);
}

function roundToOne(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 10) / 10;
}

function formatSigned(value: number): string {
    if (!Number.isFinite(value)) return '0';
    if (value > 0) return `+${roundToOne(value)}`;
    if (value < 0) return `${roundToOne(value)}`;
    return '0';
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
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