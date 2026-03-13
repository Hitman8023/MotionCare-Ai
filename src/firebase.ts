import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    apiKey: 'AIzaSyBhPQ7cT6b6XF6rrF9-8G0i0agH94JZ0TE',
    authDomain: 'motioncare-f84e0.firebaseapp.com',
    databaseURL: 'https://motioncare-f84e0-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'motioncare-f84e0',
    storageBucket: 'motioncare-f84e0.firebasestorage.app',
    messagingSenderId: '389635219404',
    appId: '1:389635219404:web:59c5473b4a8d765e0d4769',
    measurementId: 'G-P3K6J5J6EW',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
