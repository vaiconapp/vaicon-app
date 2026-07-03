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

/** Επιστρέφει φρέσκο ID token (το SDK κάνει refresh αυτόματα κοντά στη λήξη· force=true εξαναγκάζει refresh). */
async function getFreshIdToken(force = false) {
  const user = authInstance().currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(force);
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
        // Πιθανό ληγμένο token: ζήτα φρέσκο (force) και ξαναπροσπάθησε μία φορά.
        const fresh = await getFreshIdToken(true);
        if (fresh) {
          const sep = url.indexOf('?') === -1 ? '?' : '&';
          const retryUrl = `${url}${sep}auth=${fresh}`;
          let retryInput = retryUrl;
          if (typeof input !== 'string') { try { retryInput = new Request(retryUrl, input); } catch { retryInput = retryUrl; } }
          const res2 = await originalFetch(retryInput, init);
          if (res2.status === 401 || res2.status === 403) {
            alertAuthProblem(`Η βάση απέρριψε την εγγραφή (${res2.status}).\nΗ ενέργεια (${method}) ΔΕΝ αποθηκεύτηκε.\nΚάνε αποσύνδεση και ξανά είσοδο.`);
          }
          return res2;
        }
        alertAuthProblem(`Η βάση απέρριψε την εγγραφή (${res.status}).\nΗ ενέργεια (${method}) ΔΕΝ αποθηκεύτηκε.\nΚάνε αποσύνδεση και ξανά είσοδο.`);
      }
      return res;
    }
    return originalFetch(input, init);
  };

  interceptorInstalled = true;
}

// ── Φύλακας ετικετών Firebase (πάντα ενεργός, ανεξάρτητα από auth) ──
// Η βάση απορρίπτει . / # $ [ ] σε ΟΝΟΜΑΤΑ πεδίων/διαδρομής (όχι σε τιμές).
const FB_BAD_KEY = /[.#$/\[\]]/;
const firstBadFbKey = (val) => {
  if (Array.isArray(val)) { for (const v of val) { const b = firstBadFbKey(v); if (b) return b; } return null; }
  if (val && typeof val === 'object') {
    for (const k of Object.keys(val)) { if (FB_BAD_KEY.test(k)) return k; const b = firstBadFbKey(val[k]); if (b) return b; }
  }
  return null;
};
const badKeyInWrite = (url, body) => {
  const path = String(url).split('?')[0].replace(FIREBASE_URL, '').replace(/\.json$/, '').replace(/^\//, '');
  for (const seg of path.split('/')) { if (seg && FB_BAD_KEY.test(decodeURIComponent(seg))) return decodeURIComponent(seg); }
  if (typeof body === 'string' && body) { try { return firstBadFbKey(JSON.parse(body)); } catch {} }
  return null;
};

let keyGuardInstalled = false;
export function installFbKeyGuard() {
  if (keyGuardInstalled) return;
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  keyGuardInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    let url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch { url = ''; }
    if (url && url.indexOf(FIREBASE_URL) === 0) {
      const method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'DELETE') {
        const bad = badKeyInWrite(url, init && init.body);
        if (bad) {
          if (typeof window.alert === 'function') window.alert(`⚠️ Δεν αποθηκεύτηκε.\nΤο πεδίο «${bad}» έχει χαρακτήρα που δεν επιτρέπεται ( . / # $ [ ] ).\nΔιόρθωσέ το (π.χ. «PVC. ΕΞΩ» → «PVC ΕΞΩ»).`);
          return new Response(JSON.stringify({ error: 'invalid key' }), { status: 400 });
        }
      }
    }
    return originalFetch(input, init);
  };
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
