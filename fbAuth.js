/**
 * Firebase Authentication (email/password) για το vaicon-app.
 *
 * - Χρησιμοποιεί το ίδιο Firebase app instance με το firebaseRealtime.js,
 *   ώστε οι αναγνώσεις του SDK (onValue) να στέλνουν αυτόματα το auth token.
 * - Για τις εγγραφές μέσω REST (fetch), εγκαθιστά έναν interceptor στο
 *   window.fetch που προσθέτει αυτόματα `?auth=<token>` σε κάθε αίτημα
 *   προς τη Realtime Database. Έτσι δεν χρειάζεται να αλλάξουμε δεκάδες
 *   σημεία κλήσης fetch στον κώδικα.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { firebaseAppConfig, FIREBASE_URL } from './firebaseConfig';

function getFirebaseApp() {
  return getApps().length === 0 ? initializeApp(firebaseAppConfig) : getApp();
}

function authInstance() {
  return getAuth(getFirebaseApp());
}

/** Επιστρέφει φρέσκο ID token (το SDK κάνει refresh αυτόματα κοντά στη λήξη). */
async function getFreshIdToken() {
  const user = authInstance().currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

let interceptorInstalled = false;
let lastAuthAlertAt = 0;

/** Ηχηρή ειδοποίηση (μέγ. 1/30s) όταν αποτυγχάνει εγγραφή λόγω auth — αλλιώς οι αποτυχίες είναι αόρατες. */
function alertAuthProblem(msg) {
  console.error('[VAICON AUTH]', msg);
  const now = Date.now();
  if (now - lastAuthAlertAt < 30000) return;
  lastAuthAlertAt = now;
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert('⚠️ Πρόβλημα σύνδεσης με τη βάση:\n\n' + msg);
  }
}

/**
 * Εγκαθιστά interceptor στο window.fetch που προσθέτει το auth token
 * μόνο στα αιτήματα προς τη Realtime Database (FIREBASE_URL).
 */
export function installFetchAuthInterceptor() {
  if (interceptorInstalled) return;
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    let url = '';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
    } catch { url = ''; }

    if (url && url.indexOf(FIREBASE_URL) === 0) {
      const method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
      const token = await getFreshIdToken();

      if (!token && method !== 'GET') {
        alertAuthProblem(`Δεν υπάρχει ενεργή σύνδεση χρήστη (currentUser=null).\nΗ ενέργεια (${method}) ΔΕΝ αποθηκεύτηκε.\nΚάνε αποσύνδεση και ξανά είσοδο.`);
      }

      let finalInput = input;
      if (token && url.indexOf('auth=') === -1) {
        const sep = url.indexOf('?') === -1 ? '?' : '&';
        const newUrl = `${url}${sep}auth=${token}`;
        if (typeof input === 'string') {
          finalInput = newUrl;
        } else {
          try { finalInput = new Request(newUrl, input); } catch { finalInput = newUrl; }
        }
      }

      const res = await originalFetch(finalInput, init);
      if ((res.status === 401 || res.status === 403) && method !== 'GET') {
        alertAuthProblem(`Η βάση απέρριψε την εγγραφή (${res.status}).\nΗ ενέργεια (${method}) ΔΕΝ αποθηκεύτηκε.\nΚάνε αποσύνδεση και ξανά είσοδο.`);
      }
      return res;
    }
    return originalFetch(input, init);
  };

  interceptorInstalled = true;
}

/** Σύνδεση με email/password. Πετάει error αν αποτύχει. */
export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(authInstance(), email, password);
  return cred.user;
}

/** Αποσύνδεση. */
export async function signOutUser() {
  try { await fbSignOut(authInstance()); } catch {}
}

/**
 * Παρακολουθεί την κατάσταση σύνδεσης.
 * Καλεί cb(user|null). Επιστρέφει unsubscribe.
 */
export function watchAuth(cb) {
  return onAuthStateChanged(authInstance(), cb);
}
