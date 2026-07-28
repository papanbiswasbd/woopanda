import { initializeApp, getApps, getApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Firebase Project Configuration
 * NOTE TO USER: Replace these placeholder credentials with your Firebase console project settings.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyAfcp5hR7xw_BtOxjxdErDWbPLFQObpDT0",
  authDomain: "woopanda-c05e3.firebaseapp.com",
  projectId: "woopanda-c05e3",
  storageBucket: "woopanda-c05e3.firebasestorage.app",
  messagingSenderId: "1023242965403",
  appId: "1:1023242965403:android:71af156d62b4e5433ad13e",
};

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Auth with persistent AsyncStorage session handling (type-safe dynamic resolution)
let auth: ReturnType<typeof FirebaseAuth.getAuth>;
try {
  const getRNPersistence = (FirebaseAuth as any).getReactNativePersistence;
  auth = FirebaseAuth.initializeAuth(app, {
    persistence: getRNPersistence ? getRNPersistence(AsyncStorage) : undefined,
  });
} catch (error) {
  // If initializeAuth was previously called during React hot module reloading, fallback to getAuth
  auth = FirebaseAuth.getAuth(app);
}

// Initialize Firestore cloud database
const db = getFirestore(app);

export { app, auth, db };
