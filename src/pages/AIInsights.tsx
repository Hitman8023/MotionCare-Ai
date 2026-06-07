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

type ForecastSeriesPoint = {
    dateKey: string;
    recoveryScore: number;
    vitalScore: number;
    exerciseScore: number;
    dietScore: number;
    sessionLoad: number;
    signalStrength: number;
};

type ForecastWindow = {
    minWeek: number;
    maxWeek: number;
    confidence: number;
    delayDays: number;
};

type FittedArxModel = {
    coefficients: number[];
    mae: number;
};

type WeightedTrainingRow = {
    x: number[];
    y: number;
    weight: number;
};

type DailyVitalsAggregate = {
    dateKey: string;
    sampleCount: number;
    sumRecoveryScore: number;
    avgRecoveryScore: number;
    lastRecoveryScore: number;
};

const DAILY_REP_STORAGE_KEY_PREFIX = 'motioncare:daily-reps:v1';
const DIET_LOG_STORAGE_KEY_PREFIX = 'motioncare:diet-log:v1';
const DAILY_VITALS_STORAGE_KEY_PREFIX = 'motioncare:daily-vitals:v1';
const MAX_SAMPLE_HISTORY = 120;
const MIN_DAILY_REP_TARGET = 15;
const FORECAST_LOOKBACK_DAYS = 28;
const FORECAST_HORIZON_DAYS = 84;
const FORECAST_TARGET_RECOVERY_SCORE = 88;

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
            recordDailyVitalsSample(patientUid, sample);
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
        () =>
            buildDynamicMetrics(
                latestSample,
                sampleHistory,
                exerciseStats,
                dietSummary,
                storageUid,
                currentDateKey,
                dietLog,
            ),
        [latestSample, sampleHistory, exerciseStats, dietSummary, storageUid, currentDateKey, dietLog],
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
    storageUid: string,
    currentDateKey: string,
    dietLog: DailyDietLog,
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

    const sessionTrendDelta = roundToOne(recentScore - baselineScore);

    const movementAccuracy = latestSample
        ? computeAccuracy(latestSample)
        : clamp(roundInt(recentScore * 0.9), 55, 95);

    const flexRange = latestSample ? computeFlexRange(latestSample) : 18;
    const alertCount = latestSample ? detectAlertCount(latestSample) : 0;

    const forecastSeries = buildForecastTimeSeries(
        storageUid,
        currentDateKey,
        dietLog,
        recentScore,
        exerciseStats,
        dietSummary,
    );

    const historicalTrendDelta = computeSeriesTrendDelta(forecastSeries);
    const trendDelta = roundToOne(sessionTrendDelta * 0.45 + historicalTrendDelta * 0.55);

    const intraSessionConsistency = scoreSeries.length > 6
        ? clamp(roundInt(100 - standardDeviation(scoreSeries) * 1.8), 30, 100)
        : 72;
    const interDayConsistency = forecastSeries.length > 6
        ? clamp(
            roundInt(100 - standardDeviation(forecastSeries.map((point) => point.recoveryScore)) * 1.5),
            35,
            100,
        )
        : 72;
    const consistencyScore = clamp(
        roundInt(intraSessionConsistency * 0.45 + interDayConsistency * 0.55),
        30,
        100,
    );

    const readinessScore = clamp(
        roundInt(
            recentScore * 0.42 +
                exerciseStats.adherenceScore * 0.3 +
                dietSummary.weeklyScore * 0.18 +
                consistencyScore * 0.1 +
                Math.max(0, trendDelta) * 0.6 -
                alertCount * 5,
        ),
        25,
        99,
    );

    const forecastWindow = estimateSystemForecastFromSeries(
        forecastSeries,
        recentScore,
        trendDelta,
        alertCount,
        exerciseStats,
        dietSummary,
    );

    return {
        recoveryScore: clamp(roundInt(recentScore), 0, 100),
        movementAccuracy,
        flexRange,
        alertCount,
        trendDelta,
        consistencyScore,
        readinessScore,
        systemMinWeek: forecastWindow.minWeek,
        systemMaxWeek: forecastWindow.maxWeek,
        systemConfidence: forecastWindow.confidence,
        delayDays: forecastWindow.delayDays,
    };
}

function buildForecastTimeSeries(
    storageUid: string,
    currentDateKey: string,
    todayDietLog: DailyDietLog,
    todayRecoveryScore: number,
    exerciseStats: ExerciseWeeklyStats,
    dietSummary: WeeklyDietSummary,
): ForecastSeriesPoint[] {
    const series: ForecastSeriesPoint[] = [];
    const defaultExerciseScore = clamp(roundInt(exerciseStats.adherenceScore * 0.9), 30, 90);
    const defaultDietScore = clamp(roundInt(dietSummary.weeklyScore * 0.9), 30, 90);

    for (let daysAgo = FORECAST_LOOKBACK_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
        const dateKey = getDateKeyDaysAgo(daysAgo);
        const rawRepMap =
            typeof window === 'undefined'
                ? null
                : window.localStorage.getItem(getDailyRepStorageKey(storageUid, dateKey));
        const repMap = parseRepMap(rawRepMap);
        const repsTotal = sumExerciseReps(repMap);

        const dayDietLog = dateKey === currentDateKey
            ? todayDietLog
            : readDietLog(storageUid, dateKey);
        const dayDietSummary = summarizeDietDay(dayDietLog);
        const dailyVitals = readDailyVitalsAggregate(storageUid, dateKey);
        const hasVitalSignal = dailyVitals !== null && dailyVitals.sampleCount > 0;
        const hasExerciseSignal = repsTotal > 0;
        const hasDietSignal = dayDietSummary.touched;
        const hasSignal = hasVitalSignal || hasExerciseSignal || hasDietSignal || daysAgo === 0;

        const exerciseScore = hasExerciseSignal
            ? clamp(roundInt((repsTotal / MIN_DAILY_REP_TARGET) * 100), 0, 100)
            : defaultExerciseScore;
        const dietScore = hasDietSignal ? dayDietSummary.score : defaultDietScore;

        const sessionLoad = hasExerciseSignal
            ? clamp(roundToOne(repsTotal / MIN_DAILY_REP_TARGET), 0, 1.8)
            : clamp(roundToOne(exerciseScore / 100), 0.1, 1.1);

        const inferredVital = daysAgo === 0
            ? clamp(roundInt(todayRecoveryScore), 25, 99)
            : clamp(roundInt(48 + exerciseScore * 0.26 + dietScore * 0.23), 30, 96);

        const vitalScore = hasVitalSignal && dailyVitals
            ? clamp(roundInt(dailyVitals.avgRecoveryScore), 25, 99)
            : inferredVital;

        const vitalSignalStrength = hasVitalSignal && dailyVitals
            ? clamp(dailyVitals.sampleCount / 40, 0.35, 1)
            : daysAgo === 0
              ? 0.65
              : 0.25;
        const exerciseSignalStrength = hasExerciseSignal ? 1 : 0.45;
        const dietSignalStrength = hasDietSignal ? 1 : 0.5;
        const signalStrength = clamp(
            roundToOne(
                vitalSignalStrength * 0.5 +
                    exerciseSignalStrength * 0.3 +
                    dietSignalStrength * 0.2,
            ),
            0.2,
            1,
        );

        const recoveryScoreRaw = hasSignal
            ? hasVitalSignal
              ? vitalScore * 0.6 + exerciseScore * 0.24 + dietScore * 0.16
              : vitalScore * 0.48 + exerciseScore * 0.32 + dietScore * 0.2
            : inferredVital * 0.5 + defaultExerciseScore * 0.3 + defaultDietScore * 0.2;

        const recoveryScore = clamp(roundInt(recoveryScoreRaw), 25, 99);

        series.push({
            dateKey,
            recoveryScore,
            vitalScore,
            exerciseScore,
            dietScore,
            sessionLoad,
            signalStrength,
        });
    }

    return series;
}

function estimateSystemForecastFromSeries(
    series: ForecastSeriesPoint[],
    recentScore: number,
    trendDelta: number,
    alertCount: number,
    exerciseStats: ExerciseWeeklyStats,
    dietSummary: WeeklyDietSummary,
): ForecastWindow {
    const model = fitArxModel(series);
    if (!model) {
        return estimateSystemForecastHeuristic(
            recentScore,
            trendDelta,
            alertCount,
            exerciseStats,
            dietSummary,
        );
    }

    const targetRecovery = FORECAST_TARGET_RECOVERY_SCORE / 100;
    const projectedPath = forecastRecoveryPath(series, model.coefficients, FORECAST_HORIZON_DAYS);
    const projectedDaysToTarget = estimateDaysToReachTarget(projectedPath, targetRecovery);

    const idealPath = forecastRecoveryPath(series, model.coefficients, FORECAST_HORIZON_DAYS, {
        exerciseScore: 95,
        dietScore: 92,
        sessionLoad: 1.1,
    });
    const idealDaysToTarget = estimateDaysToReachTarget(idealPath, targetRecovery);

    const signalQuality = clamp(average(series.map((point) => point.signalStrength)), 0.2, 1);
    const seriesVolatility = standardDeviation(series.map((point) => point.recoveryScore));
    const volatilityPenalty = clamp(seriesVolatility / 18, 0, 1);

    const compliancePenaltyDays = roundInt(
        Math.max(0, 75 - exerciseStats.adherenceScore) * 0.22 +
        Math.max(0, 75 - dietSummary.weeklyScore) * 0.18,
    );
    const stabilityPenaltyDays = roundInt(volatilityPenalty * 10);

    const delayDays = clamp(
        roundInt(
            Math.max(0, projectedDaysToTarget - idealDaysToTarget) +
                compliancePenaltyDays +
                stabilityPenaltyDays,
        ),
        0,
        120,
    );

    const midWeek = clamp(
        roundToOne(8 + (projectedDaysToTarget + alertCount * 2 + stabilityPenaltyDays * 0.8) / 7),
        6,
        52,
    );

    const dataCoverageScore = clamp((series.length - 2) / (FORECAST_LOOKBACK_DAYS - 2), 0.2, 1);
    const fitScore = clamp(1 - model.mae / 0.1, 0, 1);
    const complianceScore = clamp(
        (exerciseStats.adherenceScore * 0.55 + dietSummary.weeklyScore * 0.45) / 100,
        0,
        1,
    );
    const trendScore = clamp((trendDelta + 8) / 16, 0, 1);

    const confidence = clamp(
        roundInt(
            34 +
            dataCoverageScore * 18 +
            fitScore * 28 +
            signalQuality * 10 +
            complianceScore * 10 +
            trendScore * 7 -
            volatilityPenalty * 8 -
            alertCount * 4,
        ),
        35,
        98,
    );

    const spread = confidence >= 82 ? 1 : confidence >= 68 ? 2 : 3;
    const minWeek = clamp(roundInt(midWeek - spread), 6, 52);
    const maxWeek = clamp(roundInt(midWeek + spread), minWeek + 1, 60);

    return {
        minWeek,
        maxWeek,
        confidence,
        delayDays,
    };
}

function estimateSystemForecastHeuristic(
    recentScore: number,
    trendDelta: number,
    alertCount: number,
    exerciseStats: ExerciseWeeklyStats,
    dietSummary: WeeklyDietSummary,
): ForecastWindow {
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

    const minWeek = clamp(roundInt(adjustedMidWeek - 1), 6, 52);
    const maxWeek = clamp(roundInt(adjustedMidWeek + 1), minWeek + 1, 60);

    const delayDays = Math.max(
        0,
        roundInt((skipPenalty + junkPenalty + lowDietPenalty + lowAdherencePenalty) * 7),
    );

    const confidence = clamp(
        roundInt(
            85 - skipPenalty * 9 - junkPenalty * 7 - vitalPenalty * 8 + Math.max(0, trendDelta) * 1.6,
        ),
        35,
        98,
    );

    return {
        minWeek,
        maxWeek,
        confidence,
        delayDays,
    };
}

function fitArxModel(series: ForecastSeriesPoint[]): FittedArxModel | null {
    if (series.length < 10) {
        return null;
    }

    const rows: WeightedTrainingRow[] = [];

    for (let idx = 2; idx < series.length; idx += 1) {
        const prev = clamp(series[idx - 1].recoveryScore / 100, 0.2, 1);
        const prev2 = clamp(series[idx - 2].recoveryScore / 100, 0.2, 1);
        const vital = clamp(series[idx].vitalScore / 100, 0.2, 1);
        const exercise = clamp(series[idx].exerciseScore / 100, 0, 1);
        const diet = clamp(series[idx].dietScore / 100, 0, 1);
        const session = clamp(series[idx].sessionLoad / 1.8, 0, 1.2);
        const signal = clamp(series[idx].signalStrength, 0.2, 1);
        const current = clamp(series[idx].recoveryScore / 100, 0.2, 1);

        const recencyWeight = 0.7 + (idx / Math.max(series.length - 1, 1)) * 0.6;
        const qualityWeight = 0.55 + signal * 0.45;
        const weight = clamp(recencyWeight * qualityWeight, 0.45, 1.35);

        rows.push({
            x: [1, prev, prev2, vital, exercise, diet, session, signal],
            y: current,
            weight,
        });
    }

    if (rows.length < 8) {
        return null;
    }

    const splitIndex = rows.length >= 12 ? Math.floor(rows.length * 0.75) : rows.length;
    const trainingRows = rows.slice(0, splitIndex);
    const validationRows = rows.slice(splitIndex);

    const lambdaCandidates = [0.02, 0.05, 0.08, 0.12, 0.2, 0.35];
    let bestLambda = 0.08;
    let bestMae = Number.POSITIVE_INFINITY;

    for (const lambda of lambdaCandidates) {
        const candidate = solveRidgeRegressionWeighted(trainingRows, lambda);
        if (!candidate) continue;

        const evaluationSet = validationRows.length > 0 ? validationRows : trainingRows;
        const mae = computeWeightedMae(evaluationSet, candidate);
        if (mae < bestMae) {
            bestMae = mae;
            bestLambda = lambda;
        }
    }

    if (!Number.isFinite(bestMae)) {
        return null;
    }

    const coefficients = solveRidgeRegressionWeighted(rows, bestLambda);
    if (!coefficients) {
        return null;
    }

    const mae = computeWeightedMae(rows, coefficients);

    return {
        coefficients,
        mae,
    };
}

function solveRidgeRegressionWeighted(rows: WeightedTrainingRow[], lambda: number): number[] | null {
    if (rows.length === 0) {
        return null;
    }

    const scaledFeatures = rows.map((row) => {
        const scale = Math.sqrt(clamp(row.weight, 0.01, 5));
        return row.x.map((value) => value * scale);
    });
    const scaledTargets = rows.map((row) => {
        const scale = Math.sqrt(clamp(row.weight, 0.01, 5));
        return row.y * scale;
    });

    return solveRidgeRegression(scaledFeatures, scaledTargets, lambda);
}

function computeWeightedMae(rows: WeightedTrainingRow[], coefficients: number[]): number {
    let weightedError = 0;
    let weightSum = 0;

    for (const row of rows) {
        const prediction = row.x.reduce(
            (sum, value, coeffIdx) => sum + value * coefficients[coeffIdx],
            0,
        );
        const weight = clamp(row.weight, 0.01, 5);
        weightedError += Math.abs(prediction - row.y) * weight;
        weightSum += weight;
    }

    if (weightSum <= 0) {
        return Number.POSITIVE_INFINITY;
    }

    return weightedError / weightSum;
}

function solveRidgeRegression(
    features: number[][],
    targets: number[],
    lambda: number,
): number[] | null {
    if (features.length === 0 || targets.length !== features.length) {
        return null;
    }

    const featureCount = features[0].length;
    const xtx = Array.from({ length: featureCount }, () => Array.from({ length: featureCount }, () => 0));
    const xty = Array.from({ length: featureCount }, () => 0);

    for (let rowIdx = 0; rowIdx < features.length; rowIdx += 1) {
        const row = features[rowIdx];
        if (row.length !== featureCount) {
            return null;
        }

        for (let i = 0; i < featureCount; i += 1) {
            xty[i] += row[i] * targets[rowIdx];
            for (let j = 0; j < featureCount; j += 1) {
                xtx[i][j] += row[i] * row[j];
            }
        }
    }

    for (let i = 1; i < featureCount; i += 1) {
        xtx[i][i] += lambda;
    }

    return solveLinearSystem(xtx, xty);
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] | null {
    const size = values.length;
    if (matrix.length !== size || size === 0) {
        return null;
    }

    const augmented: number[][] = [];
    for (let rowIdx = 0; rowIdx < size; rowIdx += 1) {
        const row = matrix[rowIdx];
        if (row.length !== size) {
            return null;
        }
        augmented.push([...row, values[rowIdx]]);
    }

    try {
        for (let col = 0; col < size; col += 1) {
            let pivot = col;
            for (let row = col + 1; row < size; row += 1) {
                if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) {
                    pivot = row;
                }
            }

            if (Math.abs(augmented[pivot][col]) < 1e-8) {
                return null;
            }

            if (pivot !== col) {
                [augmented[pivot], augmented[col]] = [augmented[col], augmented[pivot]];
            }

            const pivotValue = augmented[col][col];
            for (let k = col; k <= size; k += 1) {
                augmented[col][k] /= pivotValue;
            }

            for (let row = 0; row < size; row += 1) {
                if (row === col) continue;
                const factor = augmented[row][col];
                if (Math.abs(factor) < 1e-12) continue;
                for (let k = col; k <= size; k += 1) {
                    augmented[row][k] -= factor * augmented[col][k];
                }
            }
        }
    } catch {
        return null;
    }

    const solution = augmented.map((row) => row[size]);
    return solution.every((value) => Number.isFinite(value)) ? solution : null;
}

function forecastRecoveryPath(
    series: ForecastSeriesPoint[],
    coefficients: number[],
    horizonDays: number,
    overrides?: { exerciseScore: number; dietScore: number; sessionLoad: number },
): number[] {
    const current = series[series.length - 1];
    const previous = series[series.length - 2] ?? current;

    let prev = clamp((current?.recoveryScore ?? 68) / 100, 0.2, 1);
    let prev2 = clamp((previous?.recoveryScore ?? 66) / 100, 0.2, 1);

    const recentWindow = series.slice(Math.max(0, series.length - 7));
    const avgExercise = recentWindow.length
        ? average(recentWindow.map((point) => point.exerciseScore)) / 100
        : 0.7;
    const avgDiet = recentWindow.length
        ? average(recentWindow.map((point) => point.dietScore)) / 100
        : 0.72;
    const avgSession = recentWindow.length
        ? average(recentWindow.map((point) => clamp(point.sessionLoad / 1.8, 0, 1.2)))
        : 0.72;
    const avgSignal = recentWindow.length
        ? average(recentWindow.map((point) => point.signalStrength))
        : 0.72;

    const targetExercise = clamp(
        (overrides?.exerciseScore ?? current?.exerciseScore ?? 70) / 100,
        0.1,
        1.1,
    );
    const targetDiet = clamp(
        (overrides?.dietScore ?? current?.dietScore ?? 72) / 100,
        0.1,
        1.1,
    );
    const targetSession = clamp(
        (overrides?.sessionLoad ?? current?.sessionLoad ?? 0.8) / 1.8,
        0.05,
        1.2,
    );
    const targetSignal = clamp(overrides ? 0.95 : (current?.signalStrength ?? 0.72), 0.25, 1);

    const path: number[] = [prev];

    for (let day = 1; day <= horizonDays; day += 1) {
        const blend = clamp(day / 21, 0, 1);
        const exercise = clamp(avgExercise * (1 - blend) + targetExercise * blend, 0.1, 1.1);
        const diet = clamp(avgDiet * (1 - blend) + targetDiet * blend, 0.1, 1.1);
        const session = clamp(avgSession * (1 - blend) + targetSession * blend, 0.05, 1.2);
        const signal = clamp(avgSignal * (1 - blend) + targetSignal * blend, 0.25, 1);
        const vital = clamp(prev * 0.74 + exercise * 0.14 + diet * 0.1 + session * 0.08, 0.25, 0.99);

        const next = clamp(
            coefficients[0] +
                coefficients[1] * prev +
                coefficients[2] * prev2 +
                coefficients[3] * vital +
                coefficients[4] * exercise +
                coefficients[5] * diet +
                coefficients[6] * session +
                coefficients[7] * signal,
            0.25,
            0.99,
        );

        path.push(next);
        prev2 = prev;
        prev = next;
    }

    return path;
}

function estimateDaysToReachTarget(path: number[], target: number): number {
    for (let day = 0; day < path.length; day += 1) {
        if (path[day] >= target) {
            return day;
        }
    }

    const tail = path.slice(Math.max(0, path.length - 14));
    const slope = tail.length > 1
        ? average(tail.slice(1).map((value, idx) => value - tail[idx]))
        : 0;

    if (slope > 0.0005) {
        const last = path[path.length - 1] ?? 0;
        const extraDays = (target - last) / slope;
        return clamp(
            roundInt(path.length - 1 + extraDays),
            path.length - 1,
            FORECAST_HORIZON_DAYS + 120,
        );
    }

    return FORECAST_HORIZON_DAYS + 120;
}

function computeSeriesTrendDelta(series: ForecastSeriesPoint[]): number {
    if (series.length < 4) {
        return 0;
    }

    const trendWindow = Math.max(3, Math.min(7, Math.floor(series.length / 3)));
    const leadingAverage = average(series.slice(0, trendWindow).map((point) => point.recoveryScore));
    const trailingAverage = average(
        series.slice(Math.max(0, series.length - trendWindow)).map((point) => point.recoveryScore),
    );

    return roundToOne(trailingAverage - leadingAverage);
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

function recordDailyVitalsSample(storageUid: string, sample: SensorSample): void {
    if (typeof window === 'undefined') return;

    const recoveryScore = clamp(roundInt(computeRecoveryScore(sample)), 0, 100);
    const dateKey = resolveDateKeyFromTimestamp(sample.timestamp);
    const current = readDailyVitalsAggregate(storageUid, dateKey);

    const sampleCount = (current?.sampleCount ?? 0) + 1;
    const sumRecoveryScore = (current?.sumRecoveryScore ?? 0) + recoveryScore;
    const avgRecoveryScore = clamp(roundToOne(sumRecoveryScore / sampleCount), 0, 100);

    const next: DailyVitalsAggregate = {
        dateKey,
        sampleCount,
        sumRecoveryScore,
        avgRecoveryScore,
        lastRecoveryScore: recoveryScore,
    };

    const storageKey = getDailyVitalsStorageKey(storageUid, dateKey);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
}

function readDailyVitalsAggregate(storageUid: string, dateKey: string): DailyVitalsAggregate | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const storageKey = getDailyVitalsStorageKey(storageUid, dateKey);
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as {
            dateKey?: unknown;
            sampleCount?: unknown;
            sumRecoveryScore?: unknown;
            avgRecoveryScore?: unknown;
            lastRecoveryScore?: unknown;
        };

        const sampleCount =
            typeof parsed.sampleCount === 'number' && Number.isFinite(parsed.sampleCount)
                ? Math.max(0, Math.floor(parsed.sampleCount))
                : 0;
        if (sampleCount <= 0) {
            return null;
        }

        const parsedSum =
            typeof parsed.sumRecoveryScore === 'number' && Number.isFinite(parsed.sumRecoveryScore)
                ? parsed.sumRecoveryScore
                : undefined;
        const parsedAvg =
            typeof parsed.avgRecoveryScore === 'number' && Number.isFinite(parsed.avgRecoveryScore)
                ? parsed.avgRecoveryScore
                : undefined;

        const avgFromSource =
            parsedAvg !== undefined
                ? parsedAvg
                : parsedSum !== undefined
                  ? parsedSum / sampleCount
                  : 0;
        const normalizedAvg = clamp(roundToOne(avgFromSource), 0, 100);

        const normalizedSum = parsedSum !== undefined
            ? parsedSum
            : normalizedAvg * sampleCount;

        const lastRecoveryScore =
            typeof parsed.lastRecoveryScore === 'number' && Number.isFinite(parsed.lastRecoveryScore)
                ? clamp(roundInt(parsed.lastRecoveryScore), 0, 100)
                : clamp(roundInt(normalizedAvg), 0, 100);

        return {
            dateKey: typeof parsed.dateKey === 'string' ? parsed.dateKey : dateKey,
            sampleCount,
            sumRecoveryScore: normalizedSum,
            avgRecoveryScore: normalizedAvg,
            lastRecoveryScore,
        };
    } catch {
        return null;
    }
}

function getDailyRepStorageKey(storageUid: string, dateKey: string): string {
    return `${DAILY_REP_STORAGE_KEY_PREFIX}:${storageUid}:${dateKey}`;
}

function getDietLogStorageKey(storageUid: string, dateKey: string): string {
    return `${DIET_LOG_STORAGE_KEY_PREFIX}:${storageUid}:${dateKey}`;
}

function getDailyVitalsStorageKey(storageUid: string, dateKey: string): string {
    return `${DAILY_VITALS_STORAGE_KEY_PREFIX}:${storageUid}:${dateKey}`;
}

function resolveDateKeyFromTimestamp(timestamp?: string): string {
    if (!timestamp) {
        return getLocalDateKey();
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return getLocalDateKey();
    }

    return toDateKey(date);
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
