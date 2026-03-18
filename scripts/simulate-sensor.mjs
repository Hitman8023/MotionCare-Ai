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

const jitter = (base, range) => Number((base + (Math.random() * 2 - 1) * range).toFixed(2));

async function start() {
  try {
    const patientUID = await resolvePatientUID();
    await markUidActive(patientUID);
    console.log(`Streaming random sensor data to /liveData/${patientUID} every 1 second...`);

    setInterval(async () => {
      const payload = {
        timestamp: new Date().toISOString(),
        temperature: jitter(36.7, 0.7),
        heart_rate: Math.round(jitter(78, 12)),
        spo2: Math.round(jitter(97, 2)),
        acc_x: jitter(0.02, 0.15),
        acc_y: jitter(-0.98, 0.15),
        acc_z: jitter(0.11, 0.15),
        gyro_x: jitter(0.01, 0.08),
        gyro_y: jitter(0.03, 0.08),
        gyro_z: jitter(-0.02, 0.08)
      };

      try {
        await set(ref(db, `liveData/${patientUID}`), payload);
        console.log(`[${payload.timestamp}] write ok`, payload);
      } catch (error) {
        console.error('Write failed:', error?.message || error);
      }
    }, 1000);
  } catch (error) {
    console.error(error?.message || error);
    console.error('Usage: node scripts/simulate-sensor.mjs <patientUID>');
    process.exit(1);
  }
}

start();
