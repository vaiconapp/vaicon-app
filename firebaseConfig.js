/**
 * Κεντρικό Firebase config.
 * DEV  (expo start / localhost) → vaicon-test (δοκιμαστική βάση)
 * PROD (Netlify build)           → vaiconcloud  (παραγωγή)
 */

const PROD = {
  url:       'https://vaiconcloud-default-rtdb.europe-west1.firebasedatabase.app',
  apiKey:    'AIzaSyB04iN9S_MfYMsx3V3Jn1j2rOyz5ySf-sQ',
  authDomain: 'vaiconcloud.firebaseapp.com',
  projectId:  'vaiconcloud',
  useAuth:    false, // η παραγωγή κρατά τον υπάρχοντα κωδικό μέχρι να ολοκληρωθούν οι δοκιμές
};

const DEV = {
  url:       'https://vaicon-test-default-rtdb.europe-west1.firebasedatabase.app',
  apiKey:    'AIzaSyC2p46fX-FD5sszWHnkJB2hEJBN1bTkHWI',
  authDomain: 'vaicon-test.firebaseapp.com',
  projectId:  'vaicon-test',
  useAuth:    true, // η δοκιμαστική χρησιμοποιεί Firebase Authentication (email/password)
};

const cfg = (typeof __DEV__ !== 'undefined' && __DEV__) ? DEV : PROD;

export const FIREBASE_URL = cfg.url;

/** true → η εφαρμογή κάνει login μέσω Firebase Authentication (email/password) */
export const USE_FIREBASE_AUTH = cfg.useAuth;

export const firebaseAppConfig = {
  apiKey:      cfg.apiKey,
  authDomain:  cfg.authDomain,
  databaseURL: cfg.url,
  projectId:   cfg.projectId,
};

/** Αν λείπει apiKey, η εφαρμογή χρησιμοποιεί μόνο REST (fetch) όπως πριν */
export const hasFirebaseRealtime = () =>
  typeof firebaseAppConfig.apiKey === 'string' && firebaseAppConfig.apiKey.length > 10;
