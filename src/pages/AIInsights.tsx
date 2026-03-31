import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { ExerciseType } from '../services/exerciseDetection';
import { getDoctorEstimation } from '../services/estimationService';
import { askRecoveryAssistantWithGemini } from '../services/geminiRecoveryAssistant';
import {
    computeAccuracy,
    computeFlexRange,
    computeRecoveryScore,
    detectAlertCount,
} from '../services/recoveryMetrics';
import { subscribeToPatientLiveData } from '../services/realtimeDbService';
import type { DoctorEstimation } from '../types/estimation';
import type { SensorSample } from '../types/sensor';

type InsightSeverity = 'info' | 'success' | 'warn';

type InsightItem = {
    severity: InsightSeverity;
    title: string;
    desc: string;
    time: string;
    confidence: number;
};

type LlmSections = {
    recoveryGaps: string[];
    recoveryTips: string[];
    analysisFeed: InsightItem[];
};

type LlmSectionsResponse = {
    where_recovery_is_lacking?: unknown;
    tips_to_recover_better?: unknown;
    ai_analysis_feed?: unknown;
    recovery_gaps?: unknown;
    recovery_tips?: unknown;
    analysis_feed?: unknown;
};

type PredictionCardTone = 'doctor' | 'system' | 'alignment';

type PredictionCard = {
    label: string;
    value: string;
    confidence: number;
    tone: PredictionCardTone;
    note: string;
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

type DietDaySummary = {
    touched: boolean;
    score: number;
    completionRate: number;
    junkMeals: number;
    outsideMeals: number;
};

type WeeklyDietSummary = {
    todayScore: number;
    todayCompletionRate: number;
    weeklyScore: number;
    junkMeals: number;
    outsideMeals: number;
    loggedDays: number;
};

type ExerciseWeeklyStats = {
    todayTotal: number;
    weeklyTotal: number;
    skippedDays: number;
    activeDays: number;
    adherenceScore: number;
    todayByExercise: Partial<Record<ExerciseType, number>>;
    weeklyByExercise: Partial<Record<ExerciseType, number>>;
};

type DynamicMetrics = {
    recoveryScore: number;
    movementAccuracy: number;
    flexRange: number;
    alertCount: number;
    trendDelta: number;
    consistencyScore: number;
    readinessScore: number;
    systemMinWeek: number;
    systemMaxWeek: number;
    systemConfidence: number;
    delayDays: number;
};

const DAILY_REP_STORAGE_KEY_PREFIX = 'motioncare:daily-reps:v1';
const DIET_LOG_STORAGE_KEY_PREFIX = 'motioncare:diet-log:v1';
const MAX_SAMPLE_HISTORY = 120;
const MIN_DAILY_REP_TARGET = 15;

const EXERCISE_ORDER: ExerciseType[] = [
    'wrist_flexion',
    'wrist_extension',
    'front_shoulder_raise',
    'radial_deviation',
    'ulnar_deviation',
];

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks', 'beverages'];

const DIET_PLAN: Record<MealType, { title: string; time: string; items: string[] }> = {
    breakfast: {
        title: 'Breakfast',
        time: '7:30 AM',
        items: ['Oats or poha', '2 eggs or sprouts', '1 fruit'],
    },
    lunch: {
        title: 'Lunch',
        time: '1:00 PM',
        items: ['2 rotis or brown rice', 'Dal or grilled protein', 'Cooked vegetables'],
    },
    dinner: {
        title: 'Dinner',
        time: '8:00 PM',
        items: ['Light khichdi or soup', 'Paneer/fish/chicken', 'Salad'],
    },
    snacks: {
        title: 'Snacks',
        time: '5:00 PM',
        items: ['Nuts or seeds', 'Yogurt', 'Roasted chana'],
    },
    beverages: {
        title: 'Beverages',
        time: 'All day',
        items: ['2.5L water', 'Coconut water', 'No sugary soda'],
    },
};

export default function AIInsights() {
    const llmRequestIdRef = useRef(0);
    const [doctorEstimation, setDoctorEstimation] = useState<DoctorEstimation | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [dietExpanded, setDietExpanded] = useState(false);
    const [patientUid, setPatientUid] = useState<string | null>(null);
    const [currentDateKey, setCurrentDateKey] = useState<string>(() => getLocalDateKey());
    const [latestSample, setLatestSample] = useState<SensorSample | null>(null);
    const [sampleHistory, setSampleHistory] = useState<SensorSample[]>([]);
    const [exerciseStats, setExerciseStats] = useState<ExerciseWeeklyStats>(() => createEmptyExerciseStats());
    const [dietLog, setDietLog] = useState<DailyDietLog>(() => createEmptyDietLog(getLocalDateKey()));
    const [dietReady, setDietReady] = useState(false);
    const [llmSections, setLlmSections] = useState<LlmSections | null>(null);
    const [llmLoading, setLlmLoading] = useState(false);
    const [llmError, setLlmError] = useState<string | null>(null);
    const [llmUpdatedAt, setLlmUpdatedAt] = useState<string | null>(null);

    const storageUid = patientUid ?? auth.currentUser?.uid ?? 'local';

    const fetchEstimation = async () => {
        const user = auth.currentUser;
        if (!user) {
            setDoctorEstimation(null);
            setPatientUid(null);
            return;
        }

        setPatientUid(user.uid);

        try {
            const q = query(collection(db, 'patients'), where('uid', '==', user.uid));
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                setDoctorEstimation(null);
                return;
            }

            const patientData = snapshot.docs[0].data() as { assignedDoctorId?: string };
            const assignedDoctorId = patientData.assignedDoctorId;
            if (!assignedDoctorId) {
                setDoctorEstimation(null);
                return;
            }

            const estimation = await getDoctorEstimation(user.uid, assignedDoctorId);
            setDoctorEstimation(estimation ?? null);
        } catch (error) {
            console.error('Error fetching estimation', error);
        }
    };

    useEffect(() => {
        void fetchEstimation();
        const interval = setInterval(() => {
            void fetchEstimation();
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            const nextDateKey = getLocalDateKey();
            setCurrentDateKey((prev) => (prev === nextDateKey ? prev : nextDateKey));
        }, 60000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!patientUid) return;

        const unsubscribe = subscribeToPatientLiveData(patientUid, (sample) => {
            if (!sample) return;
            setLatestSample(sample);
            setSampleHistory((prev) => {
                const next = [...prev, sample];
                return next.length > MAX_SAMPLE_HISTORY
                    ? next.slice(next.length - MAX_SAMPLE_HISTORY)
                    : next;
            });
        });

        return unsubscribe;
    }, [patientUid]);

    useEffect(() => {
        setExerciseStats(summarizeWeeklyExerciseStats(storageUid));
        setDietLog(readDietLog(storageUid, currentDateKey));
        setDietReady(true);
    }, [storageUid, currentDateKey]);

    useEffect(() => {
        const sync = () => {
            setExerciseStats(summarizeWeeklyExerciseStats(storageUid));
        };

        sync();
        const interval = setInterval(sync, 5000);
        return () => clearInterval(interval);
    }, [storageUid]);

    useEffect(() => {
        if (!dietReady) return;
        writeDietLog(storageUid, dietLog);
    }, [storageUid, dietLog, dietReady]);

    const dietSummary = useMemo(
        () => summarizeWeeklyDiet(storageUid, currentDateKey, dietLog),
        [storageUid, currentDateKey, dietLog],
    );

    const dynamicMetrics = useMemo(
        () => buildDynamicMetrics(latestSample, sampleHistory, exerciseStats, dietSummary),
        [latestSample, sampleHistory, exerciseStats, dietSummary],
    );

    const modelAlignment = useMemo(() => {
        if (!doctorEstimation) {
            return null;
        }

        const doctorMid = (doctorEstimation.minWeeks + doctorEstimation.maxWeeks) / 2;
        const systemMid = (dynamicMetrics.systemMinWeek + dynamicMetrics.systemMaxWeek) / 2;
        const weekGap = Math.abs(doctorMid - systemMid);
        return clamp(roundInt(100 - weekGap * 12), 35, 99);
    }, [doctorEstimation, dynamicMetrics.systemMaxWeek, dynamicMetrics.systemMinWeek]);

    const predictions: PredictionCard[] = [
        {
            label: 'Doctor Forecast',
            value: doctorEstimation
                ? `Week ${doctorEstimation.minWeeks}-${doctorEstimation.maxWeeks}`
                : 'Pending review',
            confidence: doctorEstimation?.confidence ?? 0,
            tone: 'doctor',
            note: doctorEstimation
                ? `Updated ${new Date(doctorEstimation.updatedAt).toLocaleDateString()}`
                : 'Waiting for clinician input',
        },
        {
            label: 'System Forecast',
            value: `Week ${dynamicMetrics.systemMinWeek}-${dynamicMetrics.systemMaxWeek}`,
            confidence: dynamicMetrics.systemConfidence,
            tone: 'system',
            note:
                dynamicMetrics.delayDays > 0
                    ? `Estimated delay ${dynamicMetrics.delayDays} day(s) from compliance risk`
                    : 'On-track recovery pattern from vitals, reps and nutrition',
        },
        {
            label: 'Model Alignment',
            value: modelAlignment !== null ? `${modelAlignment}%` : 'Pending',
            confidence: modelAlignment ?? dynamicMetrics.readinessScore,
            tone: 'alignment',
            note:
                modelAlignment !== null
                    ? 'Agreement between clinician and AI model'
                    : `Recovery readiness ${dynamicMetrics.readinessScore}%`,
        },
    ];

    const insights = useMemo(
        () =>
            buildDynamicInsights(
                dynamicMetrics,
                exerciseStats,
                dietSummary,
                latestSample?.timestamp,
            ),
        [dynamicMetrics, exerciseStats, dietSummary, latestSample?.timestamp],
    );

    const primaryInsights = useMemo(() => insights.slice(0, 4), [insights]);

    const recoveryGaps = useMemo(
        () => buildRecoveryGaps(dynamicMetrics, exerciseStats, dietSummary),
        [dynamicMetrics, exerciseStats, dietSummary],
    );

    const recoveryTips = useMemo(
        () => buildRecoveryTips(dynamicMetrics, exerciseStats, dietSummary),
        [dynamicMetrics, exerciseStats, dietSummary],
    );

    const llmStatusText = useMemo(() => {
        if (llmLoading) return 'Generating with LLM from current patient data.';
        if (llmError) return `${llmError} Showing computed fallback output.`;
        if (llmUpdatedAt) return `LLM-generated guidance updated at ${llmUpdatedAt}.`;
        return 'LLM guidance will appear once data sync completes.';
    }, [llmLoading, llmError, llmUpdatedAt]);

    const sectionRecoveryGaps = useMemo(
        () => (llmSections?.recoveryGaps.length ? llmSections.recoveryGaps : recoveryGaps),
        [llmSections?.recoveryGaps, recoveryGaps],
    );

    const sectionRecoveryTips = useMemo(
        () => (llmSections?.recoveryTips.length ? llmSections.recoveryTips : recoveryTips),
        [llmSections?.recoveryTips, recoveryTips],
    );

    const sectionAnalysisFeed = useMemo(
        () => (llmSections?.analysisFeed.length ? llmSections.analysisFeed : primaryInsights),
        [llmSections?.analysisFeed, primaryInsights],
    );

    const generateLlmSections = async () => {
        const requestId = ++llmRequestIdRef.current;
        setLlmLoading(true);
        setLlmError(null);

        try {
            const contextSummary = buildLlmContextSummary(
                currentDateKey,
                dynamicMetrics,
                exerciseStats,
                dietSummary,
                latestSample,
            );

            const responseText = await askRecoveryAssistantWithGemini({
                message: buildLlmSectionsPrompt(),
                history: [],
                contextSummary,
            });

            if (requestId !== llmRequestIdRef.current) {
                return;
            }

            const parsed = parseLlmSectionsResponse(responseText, formatTimeLabel(latestSample?.timestamp));
            if (!parsed) {
                setLlmError('LLM response format was invalid.');
                return;
            }

            setLlmSections(parsed);
            setLlmUpdatedAt(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            );
            setLlmError(null);
        } catch {
            if (requestId !== llmRequestIdRef.current) {
                return;
            }
            setLlmError('Unable to generate LLM guidance right now.');
        } finally {
            if (requestId === llmRequestIdRef.current) {
                setLlmLoading(false);
            }
        }
    };

    useEffect(() => {
        if (!dietReady) return;
        void generateLlmSections();
    }, [dietReady, storageUid, currentDateKey]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await fetchEstimation();
            setExerciseStats(summarizeWeeklyExerciseStats(storageUid));
            setDietLog(readDietLog(storageUid, currentDateKey));
            await generateLlmSections();
        } finally {
            setRefreshing(false);
        }
    };

    const toggleMealItem = (mealType: MealType, item: string) => {
        setDietLog((prev) => {
            const current = prev.meals[mealType];
            const nextItems = current.selectedItems.includes(item)
                ? current.selectedItems.filter((value) => value !== item)
                : [...current.selectedItems, item];

            return {
                ...prev,
                meals: {
                    ...prev.meals,
                    [mealType]: {
                        ...current,
                        selectedItems: nextItems,
                    },
                },
            };
        });
    };

    const updateOutsideItems = (mealType: MealType, value: string) => {
        setDietLog((prev) => ({
            ...prev,
            meals: {
                ...prev.meals,
                [mealType]: {
                    ...prev.meals[mealType],
                    outsideItems: value,
                },
            },
        }));
    };

    const toggleJunk = (mealType: MealType) => {
        setDietLog((prev) => ({
            ...prev,
            meals: {
                ...prev.meals,
                [mealType]: {
                    ...prev.meals[mealType],
                    includesJunk: !prev.meals[mealType].includesJunk,
                },
            },
        }));
    };

    return (
        <div className="aii-page">
            <div className="page-header aii-hero">
                <div className="aii-hero-content">
                    <div className="page-title">AI Insights</div>
                    <div className="page-subtitle">
                        Dynamic recovery guidance from live vitals, exercise adherence, and
                        nutrition compliance.
                    </div>
                    <div className="aii-chip-row">
                        <span className="aii-chip aii-chip-live">
                            {latestSample ? 'Live stream connected' : 'Waiting for live stream'}
                        </span>
                        <span className="aii-chip">Adherence {exerciseStats.adherenceScore}%</span>
                        <span className="aii-chip">Diet score {dietSummary.todayScore}%</span>
                        <span className="aii-chip">Date: {new Date().toLocaleDateString()}</span>
                    </div>
                </div>
                <button className="aii-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                        <polyline points="21 3 21 9 15 9" />
                    </svg>
                    {refreshing ? 'Refreshing' : 'Refresh Data'}
                </button>
            </div>

            <div className="section stats-grid-3 aii-predictions">
                {predictions.map((prediction, index) => (
                    <article key={prediction.label} className={`card aii-pred-card aii-${prediction.tone}`}>
                        <p className="aii-pred-label">{prediction.label}</p>
                        <p className="aii-pred-value">{prediction.value}</p>
                        <div className="aii-progress-wrap">
                            <div className="aii-progress-track">
                                <div
                                    className="aii-progress-fill"
                                    style={{ width: `${prediction.confidence}%` }}
                                />
                            </div>
                            <span className="aii-progress-text">
                                {prediction.confidence > 0 ? `${prediction.confidence}%` : '--'}
                            </span>
                        </div>
                        <p className="aii-pred-note">{prediction.note}</p>
                        <div className="aii-card-index">0{index + 1}</div>
                    </article>
                ))}
            </div>

            <div className="section aii-overview-grid">
                <section className="aii-health-grid">
                    <article className="card aii-health-card">
                        <p className="aii-health-label">Recovery Score</p>
                        <p className="aii-health-value">{dynamicMetrics.recoveryScore}%</p>
                        <p className="aii-health-note">
                            Trend {formatSigned(dynamicMetrics.trendDelta)}% vs baseline
                        </p>
                    </article>
                    <article className="card aii-health-card">
                        <p className="aii-health-label">Movement Accuracy</p>
                        <p className="aii-health-value">{dynamicMetrics.movementAccuracy}%</p>
                        <p className="aii-health-note">Consistency {dynamicMetrics.consistencyScore}%</p>
                    </article>
                    <article className="card aii-health-card">
                        <p className="aii-health-label">Exercise Adherence</p>
                        <p className="aii-health-value">{exerciseStats.adherenceScore}%</p>
                        <p className="aii-health-note">
                            Weekly reps {exerciseStats.weeklyTotal} | Skipped days {exerciseStats.skippedDays}
                        </p>
                    </article>
                    <article className="card aii-health-card">
                        <p className="aii-health-label">Diet Compliance</p>
                        <p className="aii-health-value">{dietSummary.weeklyScore}%</p>
                        <p className="aii-health-note">
                            Junk meals {dietSummary.junkMeals} | Outside meals {dietSummary.outsideMeals}
                        </p>
                    </article>
                </section>

                <section className="card aii-rom-card">
                    <div className="aii-rom-head">
                        <div>
                            <p className="aii-rom-label">Joint Range of Motion</p>
                            <p className="aii-rom-value">{dynamicMetrics.flexRange}°</p>
                        </div>
                        <div className={`aii-rom-chip ${dynamicMetrics.trendDelta >= 0 ? 'aii-rom-chip-up' : 'aii-rom-chip-down'}`}>
                            {dynamicMetrics.trendDelta >= 0 ? 'Improving' : 'Needs Attention'}
                        </div>
                    </div>

                    <div className="aii-rom-meter">
                        <div
                            className="aii-rom-meter-fill"
                            style={{
                                width: `${clamp(roundInt((dynamicMetrics.flexRange / 45) * 100), 0, 100)}%`,
                            }}
                        />
                    </div>

                    <p className="aii-rom-note">
                        Functional target is around 45°. Build mobility by maintaining smooth, pain-free
                        reps across all prescribed movements.
                    </p>
                </section>
            </div>

            <div className="section aii-focus-grid">
                <section className="card aii-focus-card">
                    <div className="aii-focus-head">
                        <h3 className="aii-focus-title">Where Recovery Is Lacking</h3>
                        <span className="aii-focus-badge">LLM</span>
                    </div>
                    <p className="aii-llm-status">{llmStatusText}</p>
                    <ul className="aii-focus-list">
                        {sectionRecoveryGaps.map((item) => (
                            <li key={item} className="aii-focus-item">
                                {item}
                            </li>
                        ))}
                    </ul>
                </section>
                <section className="card aii-focus-card">
                    <div className="aii-focus-head">
                        <h3 className="aii-focus-title">Tips To Recover Better</h3>
                        <span className="aii-focus-badge">LLM</span>
                    </div>
                    <p className="aii-llm-status">{llmStatusText}</p>
                    <ul className="aii-focus-list">
                        {sectionRecoveryTips.map((item) => (
                            <li key={item} className="aii-focus-item">
                                {item}
                            </li>
                        ))}
                    </ul>
                </section>
            </div>

            <div className="section">
                <section className="card aii-feed-card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon aii-feed-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 12h4l3-8 4 16 3-8h2" />
                                </svg>
                            </div>
                            AI Analysis Feed
                        </div>
                        <div className="aii-badge">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="12" r="10" />
                            </svg>
                            LLM ENGINE
                        </div>
                    </div>
                    <p className="aii-llm-status">{llmStatusText}</p>

                    <div className="aii-feed-list">
                        {sectionAnalysisFeed.map((insight, index) => (
                            <article key={`${insight.title}-${index}`} className={`aii-insight aii-insight-${insight.severity}`}>
                                <div className="aii-insight-icon" aria-hidden="true">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                        {insight.severity === 'success' ? (
                                            <polyline points="20 6 9 17 4 12" />
                                        ) : insight.severity === 'warn' ? (
                                            <>
                                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                                <line x1="12" y1="9" x2="12" y2="13" />
                                                <line x1="12" y1="17" x2="12.01" y2="17" />
                                            </>
                                        ) : (
                                            <>
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="8" x2="12" y2="12" />
                                                <line x1="12" y1="16" x2="12.01" y2="16" />
                                            </>
                                        )}
                                    </svg>
                                </div>
                                <div className="aii-insight-content">
                                    <h4 className="aii-insight-title">{insight.title}</h4>
                                    <p className="aii-insight-desc">{insight.desc}</p>
                                    <div className="aii-insight-meta">
                                        <span>{insight.time}</span>
                                        <span>Confidence {insight.confidence}%</span>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </div>

            <div className="section">
                <section className="card aii-diet-panel">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon aii-feed-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 2v20" />
                                    <path d="M18 6c0-2.2-1.8-4-4-4H6v20h8c2.2 0 4-1.8 4-4V6z" />
                                </svg>
                            </div>
                            Recovery Diet Plan (Track What You Ate)
                        </div>
                        <div className="aii-diet-actions">
                            <div className="aii-badge">Today {dietSummary.todayScore}%</div>
                            <button
                                type="button"
                                className="aii-toggle-btn"
                                onClick={() => setDietExpanded((prev) => !prev)}
                            >
                                {dietExpanded ? 'Hide tracker' : 'Open tracker'}
                            </button>
                        </div>
                    </div>

                    <p className="aii-diet-intro">
                        Use the summary below for quick review. Open tracker only when you want to log
                        meals, outside-plan items, or junk intake.
                    </p>

                    <div className="aii-diet-summary-grid">
                        <div className="aii-diet-kpi">
                            <p>Today plan completion</p>
                            <strong>{dietSummary.todayCompletionRate}%</strong>
                        </div>
                        <div className="aii-diet-kpi">
                            <p>Weekly diet consistency</p>
                            <strong>{dietSummary.weeklyScore}%</strong>
                        </div>
                        <div className="aii-diet-kpi">
                            <p>Junk meals this week</p>
                            <strong>{dietSummary.junkMeals}</strong>
                        </div>
                        <div className="aii-diet-kpi">
                            <p>Projected delay impact</p>
                            <strong>{dynamicMetrics.delayDays} day(s)</strong>
                        </div>
                    </div>

                    {dietExpanded ? (
                        <div className="aii-diet-grid">
                            {MEAL_ORDER.map((mealType) => {
                                const plan = DIET_PLAN[mealType];
                                const mealLog = dietLog.meals[mealType];

                                return (
                                    <article key={mealType} className="aii-meal-card">
                                        <div className="aii-meal-head">
                                            <h4 className="aii-meal-title">{plan.title}</h4>
                                            <div className="aii-meal-head-meta">
                                                <span className="aii-meal-time">{plan.time}</span>
                                                <span className="aii-meal-progress">
                                                    {mealLog.selectedItems.length}/{plan.items.length} done
                                                </span>
                                            </div>
                                        </div>

                                        <div className="aii-meal-list" role="group" aria-label={`${plan.title} plan items`}>
                                            {plan.items.map((item) => (
                                                <button
                                                    key={item}
                                                    type="button"
                                                    className={`aii-meal-chip${mealLog.selectedItems.includes(item) ? ' is-selected' : ''}`}
                                                    onClick={() => toggleMealItem(mealType, item)}
                                                    aria-pressed={mealLog.selectedItems.includes(item)}
                                                >
                                                    <span className="aii-meal-chip-indicator" aria-hidden="true">
                                                        {mealLog.selectedItems.includes(item) ? '✓' : '+'}
                                                    </span>
                                                    <span>{item}</span>
                                                </button>
                                            ))}
                                        </div>

                                        <label className="aii-outside-label">
                                            Outside of plan
                                            <textarea
                                                className="aii-outside-input"
                                                placeholder="Example: burger, sweets, fried snacks"
                                                value={mealLog.outsideItems}
                                                onChange={(event) =>
                                                    updateOutsideItems(mealType, event.target.value)
                                                }
                                            />
                                        </label>

                                        <button
                                            type="button"
                                            className={`aii-junk-toggle${mealLog.includesJunk ? ' is-on' : ''}`}
                                            onClick={() => toggleJunk(mealType)}
                                            aria-pressed={mealLog.includesJunk}
                                        >
                                            <span className="aii-junk-track" aria-hidden="true">
                                                <span className="aii-junk-thumb" />
                                            </span>
                                            <span className="aii-junk-text">
                                                {mealLog.includesJunk ? 'Includes junk food' : 'No junk food logged'}
                                            </span>
                                        </button>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="aii-diet-collapsed-note">
                            Tracker is collapsed to keep this page clean. Open tracker when you want to
                            log today&apos;s meals.
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
}

function buildDynamicInsights(
    metrics: DynamicMetrics,
    exerciseStats: ExerciseWeeklyStats,
    dietSummary: WeeklyDietSummary,
    sampleTimestamp?: string,
): InsightItem[] {
    const timeLabel = formatTimeLabel(sampleTimestamp);
    const insights: InsightItem[] = [];

    if (metrics.trendDelta >= 3) {
        insights.push({
            severity: 'success',
            title: 'Recovery momentum is improving',
            desc: `Recovery score is up by ${roundInt(metrics.trendDelta)}% compared with baseline. Keep the same exercise rhythm to sustain gains.`,
            time: timeLabel,
            confidence: clamp(roundInt(78 + metrics.trendDelta * 2), 60, 98),
        });
    } else {
        insights.push({
            severity: 'warn',
            title: 'Progress is slower than expected',
            desc: `Recovery trend is ${formatSigned(metrics.trendDelta)}%. Increase controlled reps and hydration consistency to push score upward.`,
            time: timeLabel,
            confidence: clamp(roundInt(82 - Math.abs(metrics.trendDelta) * 3), 55, 92),
        });
    }

    if (exerciseStats.skippedDays > 0) {
        insights.push({
            severity: 'warn',
            title: 'Exercise adherence is affecting timeline',
            desc: `${exerciseStats.skippedDays} skipped day(s) this week detected. Skips are extending projected recovery duration.`,
            time: timeLabel,
            confidence: clamp(roundInt(80 + exerciseStats.skippedDays * 2), 65, 97),
        });
    } else {
        insights.push({
            severity: 'success',
            title: 'Exercise consistency is strong',
            desc: `Adherence is ${exerciseStats.adherenceScore}%. Consistent daily movement lowers delay risk and improves motion quality.`,
            time: timeLabel,
            confidence: clamp(roundInt(70 + exerciseStats.adherenceScore * 0.25), 60, 97),
        });
    }

    if (dietSummary.junkMeals > 0) {
        insights.push({
            severity: 'warn',
            title: 'Diet quality is limiting recovery speed',
            desc: `${dietSummary.junkMeals} junk meal(s) logged this week. Reduce processed foods to improve inflammation control and tissue healing.`,
            time: timeLabel,
            confidence: clamp(roundInt(75 + dietSummary.junkMeals * 4), 60, 98),
        });
    } else {
        insights.push({
            severity: 'success',
            title: 'Diet plan adherence is supporting healing',
            desc: `Weekly diet score is ${dietSummary.weeklyScore}%. Continue balanced protein, hydration and anti-inflammatory meals.`,
            time: timeLabel,
            confidence: clamp(roundInt(68 + dietSummary.weeklyScore * 0.25), 60, 98),
        });
    }

    if (metrics.alertCount > 0) {
        insights.push({
            severity: 'warn',
            title: 'Vitals instability needs attention',
            desc: `${metrics.alertCount} vital alert(s) in the latest stream. Stabilize rest intervals and breathing before increasing intensity.`,
            time: timeLabel,
            confidence: clamp(roundInt(82 + metrics.alertCount * 3), 65, 98),
        });
    } else {
        insights.push({
            severity: 'info',
            title: 'Vitals are currently in a healthy band',
            desc: `No live vital alerts right now. You can focus on form precision and full-range controlled repetitions.`,
            time: timeLabel,
            confidence: clamp(roundInt(72 + metrics.consistencyScore * 0.2), 60, 96),
        });
    }

    insights.push({
        severity: 'info',
        title: 'Recovery boost strategy for next 48 hours',
        desc: 'Hit daily rep target, avoid junk meals, complete hydration goal, and keep each movement slow on the return phase.',
        time: timeLabel,
        confidence: 90,
    });

    return insights;
}

function buildRecoveryGaps(
    metrics: DynamicMetrics,
    exerciseStats: ExerciseWeeklyStats,
    dietSummary: WeeklyDietSummary,
): string[] {
    const items: string[] = [];

    if (exerciseStats.skippedDays > 0) {
        items.push(`${exerciseStats.skippedDays} day(s) missed weekly exercise target.`);
    }
    if (dietSummary.junkMeals > 0) {
        items.push(`${dietSummary.junkMeals} junk meal(s) increased recovery delay risk.`);
    }
    if (metrics.alertCount > 0) {
        items.push(`${metrics.alertCount} live vital alert(s) need monitoring.`);
    }
    if (metrics.trendDelta < 2) {
        items.push('Recovery trend is flat; intensity or consistency should increase.');
    }

    if (items.length === 0) {
        items.push('No major risk gaps detected in current data stream.');
    }

    return items;
}

function buildRecoveryTips(
    metrics: DynamicMetrics,
    exerciseStats: ExerciseWeeklyStats,
    dietSummary: WeeklyDietSummary,
): string[] {
    const items: string[] = [
        `Complete at least ${MIN_DAILY_REP_TARGET} quality reps every day.`,
        'Prioritize controlled eccentric phase to improve motion accuracy.',
        'Maintain hydration and protein-rich meals for tissue repair.',
    ];

    if (exerciseStats.skippedDays > 0) {
        items.push('Use two fixed reminder slots daily to avoid skipped sessions.');
    }
    if (dietSummary.junkMeals > 0) {
        items.push('Replace junk snacks with nuts, yogurt, or fruit in the same time slot.');
    }
    if (metrics.alertCount > 0) {
        items.push('Add 2-minute breathing reset between sets when vitals spike.');
    }

    return items.slice(0, 5);
}

function buildLlmSectionsPrompt(): string {
    return [
        'Generate MotionCare recovery guidance using the provided patient data.',
        'Return STRICT JSON only with this schema and no extra text:',
        '{',
        '  "where_recovery_is_lacking": ["string"],',
        '  "tips_to_recover_better": ["string"],',
        '  "ai_analysis_feed": [',
        '    {',
        '      "severity": "warn|success|info",',
        '      "title": "string",',
        '      "desc": "string",',
        '      "confidence": 0',
        '    }',
        '  ]',
        '}',
        'Requirements:',
        '- Keep each list concise and practical for patient use.',
        '- 3 to 5 items for lacking and tips.',
        '- 3 to 4 items for analysis feed.',
        '- Use patient-safe language and no diagnosis.',
    ].join('\n');
}

function buildLlmContextSummary(
    dateKey: string,
    metrics: DynamicMetrics,
    exerciseStats: ExerciseWeeklyStats,
    dietSummary: WeeklyDietSummary,
    latestSample: SensorSample | null,
): string {
    const exerciseBreakdown = EXERCISE_ORDER.map((exercise) => {
        const today = exerciseStats.todayByExercise[exercise] ?? 0;
        const weekly = exerciseStats.weeklyByExercise[exercise] ?? 0;
        return `${exercise}: today ${today}, weekly ${weekly}`;
    }).join('; ');

    return [
        `Date: ${dateKey}`,
        `Recovery score: ${metrics.recoveryScore}%`,
        `Movement accuracy: ${metrics.movementAccuracy}%`,
        `Flex range: ${metrics.flexRange} degrees`,
        `Trend delta: ${metrics.trendDelta}%`,
        `Consistency score: ${metrics.consistencyScore}%`,
        `Readiness score: ${metrics.readinessScore}%`,
        `Vitals alerts: ${metrics.alertCount}`,
        `System recovery forecast: week ${metrics.systemMinWeek} to ${metrics.systemMaxWeek}`,
        `Projected delay days: ${metrics.delayDays}`,
        `Exercise adherence score: ${exerciseStats.adherenceScore}%`,
        `Weekly reps total: ${exerciseStats.weeklyTotal}`,
        `Skipped exercise days this week: ${exerciseStats.skippedDays}`,
        `Exercise contribution: ${exerciseBreakdown}`,
        `Diet today score: ${dietSummary.todayScore}%`,
        `Diet weekly score: ${dietSummary.weeklyScore}%`,
        `Diet completion today: ${dietSummary.todayCompletionRate}%`,
        `Junk meals this week: ${dietSummary.junkMeals}`,
        `Outside-plan meals this week: ${dietSummary.outsideMeals}`,
        `Latest stream timestamp: ${latestSample?.timestamp ?? 'unavailable'}`,
    ].join('\n');
}

function parseLlmSectionsResponse(raw: string, fallbackTime: string): LlmSections | null {
    const jsonText = extractJsonBlock(raw);
    if (!jsonText) return null;

    try {
        const parsed = JSON.parse(jsonText) as LlmSectionsResponse;
        const recoveryGaps = coerceStringList(
            parsed.where_recovery_is_lacking ?? parsed.recovery_gaps,
            5,
        );
        const recoveryTips = coerceStringList(
            parsed.tips_to_recover_better ?? parsed.recovery_tips,
            5,
        );
        const analysisFeed = coerceInsightList(
            parsed.ai_analysis_feed ?? parsed.analysis_feed,
            fallbackTime,
            4,
        );

        if (recoveryGaps.length === 0 || recoveryTips.length === 0 || analysisFeed.length === 0) {
            return null;
        }

        return {
            recoveryGaps,
            recoveryTips,
            analysisFeed,
        };
    } catch {
        return null;
    }
}

function extractJsonBlock(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed.length) return null;

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return trimmed;
    }

    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return trimmed.slice(start, end + 1).trim();
    }

    return null;
}

function coerceStringList(value: unknown, maxItems: number): string[] {
    if (!Array.isArray(value)) return [];

    const list = value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

    return list.slice(0, maxItems);
}

function coerceInsightList(value: unknown, fallbackTime: string, maxItems: number): InsightItem[] {
    if (!Array.isArray(value)) return [];

    const out: InsightItem[] = [];

    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as { severity?: unknown; title?: unknown; desc?: unknown; confidence?: unknown };
        const title = typeof raw.title === 'string' ? raw.title.trim() : '';
        const desc = typeof raw.desc === 'string' ? raw.desc.trim() : '';
        if (!title || !desc) continue;

        const confidence =
            typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
                ? clamp(roundInt(raw.confidence), 0, 100)
                : 80;

        out.push({
            severity: toInsightSeverity(raw.severity),
            title,
            desc,
            time: fallbackTime,
            confidence,
        });

        if (out.length >= maxItems) {
            break;
        }
    }

    return out;
}

function toInsightSeverity(value: unknown): InsightSeverity {
    const normalized = typeof value === 'string' ? value.toLowerCase() : 'info';
    if (normalized === 'success') return 'success';
    if (normalized === 'warn') return 'warn';
    return 'info';
}

function buildDynamicMetrics(
    latestSample: SensorSample | null,
    sampleHistory: SensorSample[],
    exerciseStats: ExerciseWeeklyStats,
    dietSummary: WeeklyDietSummary,
): DynamicMetrics {
    const scoreSeries = sampleHistory.map((sample) => computeRecoveryScore(sample));
    const recentScore = scoreSeries.length
        ? average(scoreSeries.slice(Math.max(0, scoreSeries.length - 20)))
        : latestSample
          ? computeRecoveryScore(latestSample)
          : 68;

    const baselineScore = scoreSeries.length >= 20
        ? average(scoreSeries.slice(0, 20))
        : recentScore;

    const trendDelta = roundToOne(recentScore - baselineScore);

    const movementAccuracy = latestSample
        ? computeAccuracy(latestSample)
        : clamp(roundInt(recentScore * 0.9), 55, 95);

    const flexRange = latestSample ? computeFlexRange(latestSample) : 18;
    const alertCount = latestSample ? detectAlertCount(latestSample) : 0;

    const consistencyScore = scoreSeries.length > 6
        ? clamp(roundInt(100 - standardDeviation(scoreSeries) * 1.8), 30, 100)
        : 72;

    const readinessScore = clamp(
        roundInt(
            recentScore * 0.45 +
                exerciseStats.adherenceScore * 0.35 +
                dietSummary.weeklyScore * 0.2 -
                alertCount * 5,
        ),
        25,
        99,
    );

    const baseMidWeek = 17 - (recentScore - 70) / 18 - Math.max(0, trendDelta) / 12;
    const skipPenalty = exerciseStats.skippedDays * 0.45;
    const junkPenalty = dietSummary.junkMeals * 0.25;
    const lowDietPenalty = Math.max(0, 70 - dietSummary.weeklyScore) / 28;
    const lowAdherencePenalty = Math.max(0, 70 - exerciseStats.adherenceScore) / 24;
    const vitalPenalty = alertCount * 0.4;

    const adjustedMidWeek =
        baseMidWeek +
        skipPenalty +
        junkPenalty +
        lowDietPenalty +
        lowAdherencePenalty +
        vitalPenalty;

    const systemMinWeek = clamp(roundInt(adjustedMidWeek - 1), 6, 52);
    const systemMaxWeek = clamp(roundInt(adjustedMidWeek + 1), systemMinWeek + 1, 60);

    const delayDays = Math.max(
        0,
        roundInt((skipPenalty + junkPenalty + lowDietPenalty + lowAdherencePenalty) * 7),
    );

    const systemConfidence = clamp(
        roundInt(
            85 - skipPenalty * 9 - junkPenalty * 7 - vitalPenalty * 8 + Math.max(0, trendDelta) * 1.6,
        ),
        35,
        98,
    );

    return {
        recoveryScore: clamp(roundInt(recentScore), 0, 100),
        movementAccuracy,
        flexRange,
        alertCount,
        trendDelta,
        consistencyScore,
        readinessScore,
        systemMinWeek,
        systemMaxWeek,
        systemConfidence,
        delayDays,
    };
}

function summarizeWeeklyExerciseStats(storageUid: string): ExerciseWeeklyStats {
    if (typeof window === 'undefined') {
        return createEmptyExerciseStats();
    }

    let weeklyTotal = 0;
    let todayTotal = 0;
    let activeDays = 0;
    let hasAnyLoggedDay = false;

    const todayByExercise: Partial<Record<ExerciseType, number>> = {};
    const weeklyByExercise: Partial<Record<ExerciseType, number>> = {};

    for (const exercise of EXERCISE_ORDER) {
        weeklyByExercise[exercise] = 0;
    }

    for (let daysAgo = 0; daysAgo < 7; daysAgo += 1) {
        const dateKey = getDateKeyDaysAgo(daysAgo);
        const storageKey = getDailyRepStorageKey(storageUid, dateKey);
        const raw = window.localStorage.getItem(storageKey);
        const byExercise = parseRepMap(raw);
        const total = sumExerciseReps(byExercise);

        if (raw !== null) {
            hasAnyLoggedDay = true;
        }

        weeklyTotal += total;
        if (total >= MIN_DAILY_REP_TARGET) {
            activeDays += 1;
        }

        if (daysAgo === 0) {
            todayTotal = total;
            for (const exercise of EXERCISE_ORDER) {
                todayByExercise[exercise] = byExercise[exercise] ?? 0;
            }
        }

        for (const exercise of EXERCISE_ORDER) {
            weeklyByExercise[exercise] =
                (weeklyByExercise[exercise] ?? 0) + (byExercise[exercise] ?? 0);
        }
    }

    const skippedDays = hasAnyLoggedDay ? 7 - activeDays : 0;
    const adherenceScore = hasAnyLoggedDay ? clamp(roundInt((activeDays / 7) * 100), 0, 100) : 70;

    return {
        todayTotal,
        weeklyTotal,
        skippedDays,
        activeDays,
        adherenceScore,
        todayByExercise,
        weeklyByExercise,
    };
}

function summarizeWeeklyDiet(
    storageUid: string,
    currentDateKey: string,
    todayOverride: DailyDietLog,
): WeeklyDietSummary {
    if (typeof window === 'undefined') {
        return {
            todayScore: 75,
            todayCompletionRate: 0,
            weeklyScore: 75,
            junkMeals: 0,
            outsideMeals: 0,
            loggedDays: 0,
        };
    }

    let scoreSum = 0;
    let loggedDays = 0;
    let junkMeals = 0;
    let outsideMeals = 0;
    let todayScore = 75;
    let todayCompletionRate = 0;

    for (let daysAgo = 0; daysAgo < 7; daysAgo += 1) {
        const dayKey = getDateKeyDaysAgo(daysAgo);
        const dayLog = dayKey === currentDateKey ? todayOverride : readDietLog(storageUid, dayKey);
        const daySummary = summarizeDietDay(dayLog);

        if (daysAgo === 0) {
            todayScore = daySummary.score;
            todayCompletionRate = daySummary.completionRate;
        }

        junkMeals += daySummary.junkMeals;
        outsideMeals += daySummary.outsideMeals;

        if (daySummary.touched) {
            scoreSum += daySummary.score;
            loggedDays += 1;
        }
    }

    const weeklyScore = loggedDays > 0 ? roundInt(scoreSum / loggedDays) : 75;

    return {
        todayScore,
        todayCompletionRate,
        weeklyScore: clamp(weeklyScore, 0, 100),
        junkMeals,
        outsideMeals,
        loggedDays,
    };
}

function summarizeDietDay(log: DailyDietLog): DietDaySummary {
    let selectedCount = 0;
    let plannedCount = 0;
    let junkMeals = 0;
    let outsideMeals = 0;

    for (const mealType of MEAL_ORDER) {
        const planItems = DIET_PLAN[mealType].items;
        const mealLog = log.meals[mealType];
        plannedCount += planItems.length;
        selectedCount += mealLog.selectedItems.length;

        if (mealLog.includesJunk) {
            junkMeals += 1;
        }
        if (mealLog.outsideItems.trim().length > 0) {
            outsideMeals += 1;
        }
    }

    const completionRate = plannedCount > 0 ? roundInt((selectedCount / plannedCount) * 100) : 0;
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

function parseRepMap(raw: string | null): Partial<Record<ExerciseType, number>> {
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const out: Partial<Record<ExerciseType, number>> = {};

        for (const exercise of EXERCISE_ORDER) {
            const value = parsed[exercise];
            out[exercise] =
                typeof value === 'number' && Number.isFinite(value) && value >= 0
                    ? Math.floor(value)
                    : 0;
        }

        return out;
    } catch {
        return {};
    }
}

function sumExerciseReps(repMap: Partial<Record<ExerciseType, number>>): number {
    return EXERCISE_ORDER.reduce((sum, exercise) => sum + (repMap[exercise] ?? 0), 0);
}

function createEmptyExerciseStats(): ExerciseWeeklyStats {
    const byExercise: Partial<Record<ExerciseType, number>> = {};
    for (const exercise of EXERCISE_ORDER) {
        byExercise[exercise] = 0;
    }

    return {
        todayTotal: 0,
        weeklyTotal: 0,
        skippedDays: 0,
        activeDays: 0,
        adherenceScore: 70,
        todayByExercise: { ...byExercise },
        weeklyByExercise: { ...byExercise },
    };
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
        ? next.selectedItems.filter((value): value is string => typeof value === 'string')
        : [];

    return {
        selectedItems,
        outsideItems: typeof next.outsideItems === 'string' ? next.outsideItems : '',
        includesJunk: Boolean(next.includesJunk),
    };
}

function readDietLog(storageUid: string, dateKey: string): DailyDietLog {
    if (typeof window === 'undefined') {
        return createEmptyDietLog(dateKey);
    }

    const storageKey = getDietLogStorageKey(storageUid, dateKey);
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return createEmptyDietLog(dateKey);

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

function writeDietLog(storageUid: string, log: DailyDietLog): void {
    if (typeof window === 'undefined') return;
    const storageKey = getDietLogStorageKey(storageUid, log.dateKey);
    window.localStorage.setItem(storageKey, JSON.stringify(log));
}

function getDailyRepStorageKey(storageUid: string, dateKey: string): string {
    return `${DAILY_REP_STORAGE_KEY_PREFIX}:${storageUid}:${dateKey}`;
}

function getDietLogStorageKey(storageUid: string, dateKey: string): string {
    return `${DIET_LOG_STORAGE_KEY_PREFIX}:${storageUid}:${dateKey}`;
}

function getDateKeyDaysAgo(daysAgo: number): string {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    return toDateKey(date);
}

function getLocalDateKey(): string {
    return toDateKey(new Date());
}

function toDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatTimeLabel(timestamp?: string): string {
    if (!timestamp) return new Date().toLocaleTimeString();
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return new Date().toLocaleTimeString();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = average(values);
    const variance = values.reduce((sum, value) => {
        const delta = value - mean;
        return sum + delta * delta;
    }, 0) / values.length;
    return Math.sqrt(variance);
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSigned(value: number): string {
    if (value > 0) return `+${roundToOne(value)}`;
    if (value < 0) return `${roundToOne(value)}`;
    return '0';
}

function roundInt(value: number): number {
    return Math.round(value);
}

function roundToOne(value: number): number {
    return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
