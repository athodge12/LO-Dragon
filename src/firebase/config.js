import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyA-qE5_CAep-pyJWxG6S6cQpgEiOoXJ6WE",
  authDomain: "dragonslo.firebaseapp.com",
  databaseURL: "https://dragonslo-default-rtdb.firebaseio.com",
  projectId: "dragonslo",
  storageBucket: "dragonslo.firebasestorage.app",
  messagingSenderId: "78101830579",
  appId: "1:78101830579:web:d7c8d709d3e13bb80bc9c6",
  measurementId: "G-H22H7PXJ2N"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Messaging is not supported in all browsers (e.g. Firefox private mode, iOS < 16.4)
export const messaging = await isSupported().then(ok => ok ? getMessaging(app) : null).catch(() => null);

export default app;
