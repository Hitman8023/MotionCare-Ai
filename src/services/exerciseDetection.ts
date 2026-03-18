const RAD_TO_DEG = 180 / Math.PI;

export type ExerciseType =
  | "wrist_flexion"
  | "wrist_extension"
  | "wrist_rotation"
  | "radial_deviation"
  | "ulnar_deviation";

export type MovementQuality = "correct" | "incorrect";

export interface Mpu6050Sample {
  timestampMs?: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  flexionAngle?: number;
}

export interface WristAngles {
  pitchDeg: number;
  rollDeg: number;
  flexionDeg: number;
  deviationDeg: number;
}

export interface ExerciseDetectionOutput {
  exercise: ExerciseType;
  current_angle: number;
  target_angle: number;
  repetitions: number;
  stability_score: number;
  movement_quality: MovementQuality;
}

type Axis = "x" | "y" | "z";
type Phase = "idle" | "moving_to_target" | "returning_to_start";

interface ExerciseConfig {
  targetAngle: number;
  startNeutralBand: number;
  activationDelta: number;
  angleTolerance: number;
  wrongDirectionTolerance: number;
  angleSource: "flexion" | "deviation" | "rotation";
  primaryGyroAxis: Axis;
}

interface CycleState {
  phase: Phase;
  reachedTarget: boolean;
  movedWrongDirection: boolean;
}

const EXERCISE_CONFIG: Record<ExerciseType, ExerciseConfig> = {
  wrist_flexion: {
    targetAngle: -40,
    startNeutralBand: 8,
    activationDelta: 5,
    angleTolerance: 4,
    wrongDirectionTolerance: 7,
    angleSource: "flexion",
    primaryGyroAxis: "x",
  },
  wrist_extension: {
    targetAngle: 40,
    startNeutralBand: 8,
    activationDelta: 5,
    angleTolerance: 4,
    wrongDirectionTolerance: 7,
    angleSource: "flexion",
    primaryGyroAxis: "x",
  },
  wrist_rotation: {
    targetAngle: 60,
    startNeutralBand: 10,
    activationDelta: 6,
    angleTolerance: 5,
    wrongDirectionTolerance: 10,
    angleSource: "rotation",
    primaryGyroAxis: "z",
  },
  radial_deviation: {
    targetAngle: 20,
    startNeutralBand: 6,
    activationDelta: 4,
    angleTolerance: 3,
    wrongDirectionTolerance: 6,
    angleSource: "deviation",
    primaryGyroAxis: "y",
  },
  ulnar_deviation: {
    targetAngle: -25,
    startNeutralBand: 6,
    activationDelta: 4,
    angleTolerance: 3,
    wrongDirectionTolerance: 6,
    angleSource: "deviation",
    primaryGyroAxis: "y",
  },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundInt = (value: number): number => Math.round(value);

const sign = (value: number): -1 | 0 | 1 => {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
};

export function calculateWristAngles(sample: Mpu6050Sample): WristAngles {
  const pitchDeg =
    Math.atan2(
      sample.accelX,
      Math.sqrt(sample.accelY * sample.accelY + sample.accelZ * sample.accelZ),
    ) * RAD_TO_DEG;

  const rollDeg = Math.atan2(sample.accelY, sample.accelZ) * RAD_TO_DEG;

  return {
    pitchDeg,
    rollDeg,
    flexionDeg: sample.flexionAngle ?? pitchDeg,
    deviationDeg: rollDeg,
  };
}

function calculateVariance(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => {
      const delta = v - mean;
      return sum + delta * delta;
    }, 0) / values.length;

  return variance;
}

function toStabilityScore(variance: number): number {
  const maxVarianceForZeroScore = 180;
  const score = 100 - (variance / maxVarianceForZeroScore) * 100;
  return roundInt(clamp(score, 0, 100));
}

export class ExerciseDetector {
  private selectedExercise: ExerciseType;
  private repetitions = 0;
  private cycleState: CycleState = {
    phase: "idle",
    reachedTarget: false,
    movedWrongDirection: false,
  };

  private rotationAngle = 0;
  private lastTimestampMs: number | null = null;
  private gyroWindow: number[] = [];

  constructor(exercise: ExerciseType, private readonly gyroWindowSize = 25) {
    this.selectedExercise = exercise;
  }

  setExercise(exercise: ExerciseType, resetRepetitions = false): void {
    this.selectedExercise = exercise;
    this.rotationAngle = 0;
    this.lastTimestampMs = null;
    this.gyroWindow = [];
    this.cycleState = {
      phase: "idle",
      reachedTarget: false,
      movedWrongDirection: false,
    };
    if (resetRepetitions) {
      this.repetitions = 0;
    }
  }

  reset(): void {
    this.repetitions = 0;
    this.rotationAngle = 0;
    this.lastTimestampMs = null;
    this.gyroWindow = [];
    this.cycleState = {
      phase: "idle",
      reachedTarget: false,
      movedWrongDirection: false,
    };
  }

  update(sample: Mpu6050Sample): ExerciseDetectionOutput {
    const config = EXERCISE_CONFIG[this.selectedExercise];
    const angles = calculateWristAngles(sample);
    this.updateRotationAngle(sample);

    const currentAngle = this.resolveCurrentAngle(config, angles);
    this.updateStabilityWindow(sample, config.primaryGyroAxis);
    this.updateCycle(currentAngle, config);

    const variance = calculateVariance(this.gyroWindow);
    const stabilityScore = toStabilityScore(variance);
    const movementQuality = this.resolveMovementQuality(config, currentAngle);

    return {
      exercise: this.selectedExercise,
      current_angle: roundInt(currentAngle),
      target_angle: config.targetAngle,
      repetitions: this.repetitions,
      stability_score: stabilityScore,
      movement_quality: movementQuality,
    };
  }

  private resolveCurrentAngle(config: ExerciseConfig, angles: WristAngles): number {
    if (config.angleSource === "rotation") {
      return this.rotationAngle;
    }
    if (config.angleSource === "deviation") {
      return angles.deviationDeg;
    }
    return angles.flexionDeg;
  }

  private updateRotationAngle(sample: Mpu6050Sample): void {
    const currentTimestamp = sample.timestampMs ?? Date.now();
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = currentTimestamp;
      return;
    }

    const dtSec = clamp((currentTimestamp - this.lastTimestampMs) / 1000, 0, 0.2);
    this.lastTimestampMs = currentTimestamp;

    this.rotationAngle += sample.gyroZ * dtSec;
    this.rotationAngle = clamp(this.rotationAngle, -180, 180);
  }

  private updateStabilityWindow(sample: Mpu6050Sample, axis: Axis): void {
    const axisValue =
      axis === "x" ? sample.gyroX : axis === "y" ? sample.gyroY : sample.gyroZ;
    this.gyroWindow.push(axisValue);
    if (this.gyroWindow.length > this.gyroWindowSize) {
      this.gyroWindow.shift();
    }
  }

  private updateCycle(currentAngle: number, config: ExerciseConfig): void {
    const targetDirection = sign(config.targetAngle);
    const angleDirection = sign(currentAngle);
    const nearNeutral = Math.abs(currentAngle) <= config.startNeutralBand;
    const reachedTarget =
      targetDirection < 0
        ? currentAngle <= config.targetAngle + config.angleTolerance
        : currentAngle >= config.targetAngle - config.angleTolerance;

    const wrongDirection =
      targetDirection !== 0 &&
      angleDirection !== 0 &&
      angleDirection !== targetDirection &&
      Math.abs(currentAngle) > config.wrongDirectionTolerance;

    if (this.cycleState.phase === "idle") {
      if (nearNeutral) {
        this.cycleState.movedWrongDirection = false;
      }

      const movedTowardTarget =
        targetDirection < 0
          ? currentAngle <= -config.activationDelta
          : currentAngle >= config.activationDelta;

      if (movedTowardTarget && !this.cycleState.movedWrongDirection) {
        this.cycleState.phase = "moving_to_target";
      }
      return;
    }

    if (this.cycleState.phase === "moving_to_target") {
      if (wrongDirection) {
        this.cycleState.movedWrongDirection = true;
      }

      if (reachedTarget) {
        this.cycleState.reachedTarget = true;
        this.cycleState.phase = "returning_to_start";
      }

      // If user goes back to neutral before target range, the partial cycle is invalid.
      if (nearNeutral && !this.cycleState.reachedTarget) {
        this.cycleState.phase = "idle";
        this.cycleState.movedWrongDirection = false;
      }
      return;
    }

    if (this.cycleState.phase === "returning_to_start" && nearNeutral) {
      if (this.cycleState.reachedTarget && !this.cycleState.movedWrongDirection) {
        this.repetitions += 1;
      }
      this.cycleState.phase = "idle";
      this.cycleState.reachedTarget = false;
      this.cycleState.movedWrongDirection = false;
    }
  }

  private resolveMovementQuality(
    config: ExerciseConfig,
    currentAngle: number,
  ): MovementQuality {
    const targetDirection = sign(config.targetAngle);
    const angleDirection = sign(currentAngle);

    if (this.cycleState.movedWrongDirection) {
      return "incorrect";
    }

    if (this.cycleState.phase === "idle") {
      return "incorrect";
    }

    if (targetDirection !== 0 && angleDirection !== 0 && angleDirection !== targetDirection) {
      return "incorrect";
    }

    return "correct";
  }
}

/**
 * Convenience helper for API-style usage:
 * 1) create detector once
 * 2) call with each incoming sample
 */
export function createExerciseDetector(exercise: ExerciseType): ExerciseDetector {
  return new ExerciseDetector(exercise);
}
