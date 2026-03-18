/**
 * Backend-style MPU6050 exercise detection example in plain JavaScript.
 *
 * This script demonstrates:
 * - Exercise selection from a predefined list
 * - Accelerometer-based angle estimation
 * - Threshold + direction based movement detection
 * - Repetition counting using a full-cycle state machine
 * - Stability score from gyroscope variance
 */

const RAD_TO_DEG = 180 / Math.PI;

const EXERCISES = {
  wrist_flexion: {
    targetAngle: -40,
    neutralBand: 8,
    activationDelta: 5,
    tolerance: 4,
    wrongDirTolerance: 7,
    angleSource: "flexion",
    gyroAxis: "x",
  },
  wrist_extension: {
    targetAngle: 40,
    neutralBand: 8,
    activationDelta: 5,
    tolerance: 4,
    wrongDirTolerance: 7,
    angleSource: "flexion",
    gyroAxis: "x",
  },
  wrist_rotation: {
    targetAngle: 60,
    neutralBand: 10,
    activationDelta: 6,
    tolerance: 5,
    wrongDirTolerance: 10,
    angleSource: "rotation",
    gyroAxis: "z",
  },
  radial_deviation: {
    targetAngle: 20,
    neutralBand: 6,
    activationDelta: 4,
    tolerance: 3,
    wrongDirTolerance: 6,
    angleSource: "deviation",
    gyroAxis: "y",
  },
  ulnar_deviation: {
    targetAngle: -25,
    neutralBand: 6,
    activationDelta: 4,
    tolerance: 3,
    wrongDirTolerance: 6,
    angleSource: "deviation",
    gyroAxis: "y",
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
}

function stabilityFromVariance(v) {
  const score = 100 - (v / 180) * 100;
  return Math.round(clamp(score, 0, 100));
}

function calculateAngles(sample) {
  const pitchDeg =
    Math.atan2(
      sample.accelX,
      Math.sqrt(sample.accelY * sample.accelY + sample.accelZ * sample.accelZ),
    ) * RAD_TO_DEG;

  const rollDeg = Math.atan2(sample.accelY, sample.accelZ) * RAD_TO_DEG;

  return {
    flexionDeg: sample.flexionAngle ?? pitchDeg,
    deviationDeg: rollDeg,
  };
}

class ExerciseDetector {
  constructor(exercise) {
    this.exercise = exercise;
    this.config = EXERCISES[exercise];
    this.repetitions = 0;
    this.phase = "idle";
    this.reachedTarget = false;
    this.movedWrongDirection = false;
    this.rotationAngle = 0;
    this.lastTimestampMs = null;
    this.gyroWindow = [];
  }

  selectExercise(exercise, resetRepetitions = false) {
    this.exercise = exercise;
    this.config = EXERCISES[exercise];
    this.phase = "idle";
    this.reachedTarget = false;
    this.movedWrongDirection = false;
    this.rotationAngle = 0;
    this.lastTimestampMs = null;
    this.gyroWindow = [];
    if (resetRepetitions) this.repetitions = 0;
  }

  update(sample) {
    this.#updateRotation(sample);
    this.#updateStability(sample);

    const angles = calculateAngles(sample);
    const currentAngle =
      this.config.angleSource === "rotation"
        ? this.rotationAngle
        : this.config.angleSource === "deviation"
          ? angles.deviationDeg
          : angles.flexionDeg;

    this.#updateCycle(currentAngle);

    const quality = this.#movementQuality(currentAngle);
    const stabilityScore = stabilityFromVariance(variance(this.gyroWindow));

    return {
      exercise: this.exercise,
      current_angle: Math.round(currentAngle),
      target_angle: this.config.targetAngle,
      repetitions: this.repetitions,
      stability_score: stabilityScore,
      movement_quality: quality,
    };
  }

  #updateRotation(sample) {
    const now = sample.timestampMs ?? Date.now();
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = now;
      return;
    }
    const dtSec = clamp((now - this.lastTimestampMs) / 1000, 0, 0.2);
    this.lastTimestampMs = now;
    this.rotationAngle = clamp(this.rotationAngle + sample.gyroZ * dtSec, -180, 180);
  }

  #updateStability(sample) {
    const axis = this.config.gyroAxis;
    const value = axis === "x" ? sample.gyroX : axis === "y" ? sample.gyroY : sample.gyroZ;
    this.gyroWindow.push(value);
    if (this.gyroWindow.length > 25) this.gyroWindow.shift();
  }

  #updateCycle(currentAngle) {
    const targetDir = sign(this.config.targetAngle);
    const angleDir = sign(currentAngle);
    const nearNeutral = Math.abs(currentAngle) <= this.config.neutralBand;
    const reachedTarget =
      targetDir < 0
        ? currentAngle <= this.config.targetAngle + this.config.tolerance
        : currentAngle >= this.config.targetAngle - this.config.tolerance;

    const wrongDirection =
      angleDir !== 0 &&
      angleDir !== targetDir &&
      Math.abs(currentAngle) > this.config.wrongDirTolerance;

    if (this.phase === "idle") {
      if (nearNeutral) this.movedWrongDirection = false;

      const movedTowardTarget =
        targetDir < 0
          ? currentAngle <= -this.config.activationDelta
          : currentAngle >= this.config.activationDelta;
      if (movedTowardTarget && !this.movedWrongDirection) this.phase = "moving_to_target";
      return;
    }

    if (this.phase === "moving_to_target") {
      if (wrongDirection) this.movedWrongDirection = true;

      if (reachedTarget) {
        this.reachedTarget = true;
        this.phase = "returning_to_start";
      }
      if (nearNeutral && !this.reachedTarget) {
        this.phase = "idle";
        this.movedWrongDirection = false;
      }
      return;
    }

    if (this.phase === "returning_to_start" && nearNeutral) {
      if (this.reachedTarget && !this.movedWrongDirection) this.repetitions += 1;
      this.phase = "idle";
      this.reachedTarget = false;
      this.movedWrongDirection = false;
    }
  }

  #movementQuality(currentAngle) {
    const targetDir = sign(this.config.targetAngle);
    const angleDir = sign(currentAngle);
    if (this.movedWrongDirection) return "incorrect";
    if (this.phase === "idle") return "incorrect";
    if (angleDir !== 0 && angleDir !== targetDir) return "incorrect";
    return "correct";
  }
}

// ----------------------
// Demo stream
// ----------------------

const detector = new ExerciseDetector("wrist_flexion");

for (let i = 0; i < 120; i += 1) {
  const t = i / 10;
  const flexionDeg = -Math.sin(t) * 42;
  const sample = {
    timestampMs: Date.now() + i * 50,
    accelX: Math.sin(flexionDeg / 50),
    accelY: 0.1 * Math.cos(t),
    accelZ: 0.95,
    gyroX: Math.cos(t) * 18,
    gyroY: Math.sin(t * 0.7) * 8,
    gyroZ: Math.sin(t * 0.9) * 6,
    flexionAngle: flexionDeg,
  };

  const result = detector.update(sample);

  if (i % 12 === 0) {
    console.log(result);
  }
}
