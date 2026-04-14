/** Κεντρικό URL Firebase Realtime Database — χρησιμοποιείται από όλα τα modules */
export const FIREBASE_URL =
  'https://vaiconcloud-default-rtdb.europe-west1.firebasedatabase.app';

/**
 * Ρύθμιση για Firebase JS SDK (live sync μεταξύ PC).
 * Βάλε στο .env: EXPO_PUBLIC_FIREBASE_API_KEY=... (Web API Key από Firebase Console → Ρυθμίσεις έργου)
 */
export const firebaseAppConfig = {
  apiKey: 'AIzaSyB04iN9S_MfYMsx3V3Jn1j2rOyz5ySf-sQ',
  authDomain: 'vaiconcloud.firebaseapp.com',
  databaseURL: FIREBASE_URL,
  projectId: 'vaiconcloud',
};

/** Αν λείπει apiKey, η εφαρμογή χρησιμοποιεί μόνο REST (fetch) όπως πριν */
export const hasFirebaseRealtime = () =>
  typeof firebaseAppConfig.apiKey === 'string' && firebaseAppConfig.apiKey.length > 10;
