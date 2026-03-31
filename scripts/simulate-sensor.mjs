import { initializeApp } from 'firebase/app';
import { get, getDatabase, ref, set } from 'firebase/database';
import { collection, getDocs, getFirestore, limit, orderBy, query } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBhPQ7cT6b6XF6rrF9-8G0i0agH94JZ0TE',
  authDomain: 'motioncare-f84e0.firebaseapp.com',
  databaseURL: 'https://motioncare-f84e0-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'motioncare-f84e0',
  storageBucket: 'motioncare-f84e0.firebasestorage.app',
  messagingSenderId: '389635219404',
  appId: '1:389635219404:web:59c5473b4a8d765e0d4769',
  measurementId: 'G-P3K6J5J6EW'
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const firestore = getFirestore(app);

async function resolvePatientUID() {
  const cliUid = process.argv[2];
  if (cliUid) return cliUid;

  const activeUidSnap = await get(ref(db, 'active_uid/uid'));
  const activeUid = activeUidSnap.val();
  if (activeUid && typeof activeUid === 'string') {
    return activeUid;
  }

  const activeUsersSnap = await get(ref(db, 'activeUsers'));
  const activeUsers = activeUsersSnap.val();
  if (activeUsers && typeof activeUsers === 'object') {
    const firstActiveUid = Object.keys(activeUsers)[0];
    if (firstActiveUid) return firstActiveUid;
  }

  try {
    const newestPatientSnap = await getDocs(
      query(collection(firestore, 'patients'), orderBy('createdAt', 'desc'), limit(1)),
    );
    const newestPatientUid = newestPatientSnap.docs[0]?.data()?.uid;
    if (newestPatientUid && typeof newestPatientUid === 'string') {
      return newestPatientUid;
    }
  } catch {
    // Firestore may deny reads from this script context; ignore and fall through.
  }

  throw new Error('No UID found automatically. Pass your Firebase UID: npm run simulate:sensor -- <your_uid>');
}

async function markUidActive(patientUID) {
  const timestamp = new Date().toISOString();

  await Promise.allSettled([
    set(ref(db, 'active_uid'), {
      uid: patientUID,
      updatedAt: timestamp,
    }),
    set(ref(db, `activeUsers/${patientUID}`), {
      uid: patientUID,
      isActive: true,
      updatedAt: timestamp,
    }),
  ]);
}

const WRITE_INTERVAL_MS = 140;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundTo = (value, digits = 2) => Number(value.toFixed(digits));

const noiseState = {
  temp: 0,
  hr: 0,
  spo2: 0,
  accX: 0,
  accY: 0,
  accZ: 0,
  gyroX: 0,
  gyroY: 0,
  gyroZ: 0,
};

function walkNoise(current, step, limit) {
  const next = current + (Math.random() * 2 - 1) * step;
  return clamp(next, -limit, limit);
}

function buildSmoothPayload(elapsedSec) {
  noiseState.temp = walkNoise(noiseState.temp, 0.01, 0.12);
  noiseState.hr = walkNoise(noiseState.hr, 0.02, 0.32);
  noiseState.spo2 = walkNoise(noiseState.spo2, 0.01, 0.2);
  noiseState.accX = walkNoise(noiseState.accX, 0.004, 0.06);
  noiseState.accY = walkNoise(noiseState.accY, 0.004, 0.06);
  noiseState.accZ = walkNoise(noiseState.accZ, 0.004, 0.06);
  noiseState.gyroX = walkNoise(noiseState.gyroX, 0.08, 1.6);
  noiseState.gyroY = walkNoise(noiseState.gyroY, 0.08, 1.6);
  noiseState.gyroZ = walkNoise(noiseState.gyroZ, 0.08, 1.8);

  const t = elapsedSec;

  const temperature =
    36.7 +
    Math.sin(t * 0.26) * 0.28 +
    Math.sin(t * 0.08 + 1.4) * 0.14 +
    noiseState.temp;

  const heartRate =
    78 +
    Math.sin(t * 0.42 + 0.3) * 7 +
    Math.sin(t * 0.12 + 1.2) * 4 +
    noiseState.hr * 10;

  const spo2 =
    97 +
    Math.sin(t * 0.2 + 2.3) * 0.6 +
    Math.sin(t * 0.07) * 0.25 +
    noiseState.spo2;

  const accX =
    Math.sin(t * 1.15) * 0.16 +
    Math.sin(t * 0.48 + 0.8) * 0.06 +
    noiseState.accX;
  const accY =
    -0.98 +
    Math.cos(t * 1.1 + 0.4) * 0.14 +
    Math.sin(t * 0.32 + 2.2) * 0.05 +
    noiseState.accY;
  const accZ =
    0.12 +
    Math.sin(t * 1.3 + 1.1) * 0.15 +
    Math.cos(t * 0.37) * 0.05 +
    noiseState.accZ;

  const gyroX =
    Math.sin(t * 1.28 + 0.6) * 24 +
    Math.sin(t * 0.34 + 2.4) * 8 +
    noiseState.gyroX;
  const gyroY =
    Math.cos(t * 1.04 + 1.7) * 18 +
    Math.sin(t * 0.43 + 0.9) * 6 +
    noiseState.gyroY;
  const gyroZ =
    Math.sin(t * 1.4 + 2.1) * 20 +
    Math.cos(t * 0.38 + 0.2) * 7 +
    noiseState.gyroZ;

  return {
    timestamp: new Date().toISOString(),
    temperature: roundTo(clamp(temperature, 35.8, 38.3), 2),
    heart_rate: Math.round(clamp(heartRate, 58, 126)),
    spo2: Math.round(clamp(spo2, 93, 100)),
    acc_x: roundTo(clamp(accX, -2, 2), 3),
    acc_y: roundTo(clamp(accY, -2, 2), 3),
    acc_z: roundTo(clamp(accZ, -2, 2), 3),
    gyro_x: roundTo(clamp(gyroX, -220, 220), 3),
    gyro_y: roundTo(clamp(gyroY, -220, 220), 3),
    gyro_z: roundTo(clamp(gyroZ, -220, 220), 3),
  };
}

async function start() {
  try {
    const patientUID = await resolvePatientUID();
    await markUidActive(patientUID);
    console.log(`Streaming smooth sensor data to /liveData/${patientUID} every ${WRITE_INTERVAL_MS}ms...`);

    const startedAt = Date.now();
    let sampleCount = 0;

    while (true) {
      const tickStartedAt = Date.now();
      const elapsedSec = (tickStartedAt - startedAt) / 1000;
      const payload = buildSmoothPayload(elapsedSec);

      try {
        await set(ref(db, `liveData/${patientUID}`), payload);
        sampleCount += 1;

        if (sampleCount % Math.round(1000 / WRITE_INTERVAL_MS) === 0) {
          console.log(
            `[${payload.timestamp}] smooth stream ok | HR ${payload.heart_rate} bpm | SpO2 ${payload.spo2}% | gyroX ${payload.gyro_x}`,
          );
        }
      } catch (error) {
        console.error('Write failed:', error?.message || error);
      }

      const elapsedMs = Date.now() - tickStartedAt;
      const sleepMs = Math.max(0, WRITE_INTERVAL_MS - elapsedMs);
      if (sleepMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }
    }
  } catch (error) {
    console.error(error?.message || error);
    console.error('Usage: node scripts/simulate-sensor.mjs <patientUID>');
    process.exit(1);
  }
}

start();
