import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet, Text, View, ScrollView, ActivityIndicator, Platform, UIManager,
  StatusBar, TouchableOpacity, Modal, TextInput,
  PanResponder, Alert, BackHandler, Animated,
} from 'react-native';
import CustomScreen, { ParadoseisScreen, hasParadoseisReminderOrders } from './CustomScreen';
import SasiScreen from './SasiScreen';
import CaseScreen from './CaseScreen';
import StatsScreen from './StatsScreen';
import CustomersScreen from './CustomersScreen';
import CoatingsScreen from './CoatingsScreen';
import LocksScreen from './LocksScreen';
import PricedListScreen from './PricedListScreen';
import { seedExtras } from './seedExtras';
import PriceCatalogScreen from './PriceCatalogScreen';
import ActivityScreen from './ActivityScreen';
import MessagesScreen from './MessagesScreen';
import SellerLogScreen from './SellerLogScreen';
import ApprovalScreen from './ApprovalScreen';
import ApprovalHistoryScreen from './ApprovalHistoryScreen';
import SellerSubmissionsScreen from './SellerSubmissionsScreen';
import { FIREBASE_URL, hasFirebaseRealtime, USE_FIREBASE_AUTH } from './firebaseConfig';
import { applyFetchedBundle, subscribeFirebaseRealtime } from './firebaseRealtime';
import { installFetchAuthInterceptor, installFbKeyGuard, signIn as fbSignIn, signInWithToken as fbSignInWithToken, signOutUser as fbSignOutUser, watchAuth } from './fbAuth';
import { IS_DEV, start2FA, verify2FA, loginDirect, verifyPasswordOnly } from './twoFactor';
import { collectGlobalSearchHits, collectStaveraOrdersHits } from './globalSearch';
import {
  printHTML,
  buildGlobalSearchOrderPrintHTML,
  buildGlobalSearchOrdersPrintHTML,
  buildStaveraSearchOrderPrintHTML,
  buildStaveraSearchOrdersPrintHTML,
} from './printUtils';
import { resolveLiveStdOrder, staveraSearchBadgeLine } from './utils';
import { APP_VERSION } from './version';

// ============================================================
//  🔐 ΚΩΔΙΚΟΣ ΠΡΟΣΒΑΣΗΣ — ορίζεται στο αρχείο .env
//  EXPO_PUBLIC_VAICON_PASSWORD=vaicon2024
// ============================================================
const VAICON_PASSWORD = process.env.EXPO_PUBLIC_VAICON_PASSWORD || '';
const STORAGE_KEY = "vaicon_auth_v1";

// ============================================================
//  Χρήστες & ρόλοι — ίδιο μοντέλο με το vaicon-eidikes.
//  Με Firebase Auth (dev/μετά το go-live) η ταυτότητα βγαίνει από το email
//  (user10@vaicon.local → USER 10). Με κοινό κωδικό (παραγωγή σήμερα) δεν
//  υπάρχει ταυτότητα χρήστη και τα μηνύματα μένουν ανενεργά.
// ============================================================
const APP_USERS = ['USER 10', 'USER 12', 'USER 14', 'USER 16', 'USER 18', 'SELLER 1', 'SELLER 2', 'SELLER 3', 'SELLER 4', 'SELLER 5', 'GUEST', 'ADMIN'];
const SELLERS = ['SELLER 1', 'SELLER 2', 'SELLER 3', 'SELLER 4', 'SELLER 5'];
const lockKey = (u) => String(u || '').toUpperCase().replace(/\s+/g, '');
const roleForEmail = (e) => e.startsWith('admin') ? 'admin' : e.startsWith('guest') ? 'guest' : 'user';
const isSellerEmail = (e) => String(e || '').toLowerCase().startsWith('seller');
const userFromEmail = (email) => {
  if (!email) return null;
  const e = String(email).toLowerCase();
  const local = e.split('@')[0].toUpperCase();
  const username = local.replace(/^(USER|SELLER)(\d+)$/, '$1 $2');
  return { username, role: roleForEmail(e), email: e };
};

// 2FA: όλοι πλην διαχειριστή/guest χρειάζονται κωδικό μιας χρήσης σε φρέσκο login.
const TWOFA_SS = 'vaicon_2fa_ok';
const needsTwoFactor = (u) => !!u && u.role !== 'admin' && u.role !== 'guest';
const twofaSessionOk = (u) => { try { return sessionStorage.getItem(TWOFA_SS) === lockKey(u.username); } catch { return false; } };
const markTwofa = (u) => { try { sessionStorage.setItem(TWOFA_SS, lockKey(u.username)); } catch {} };
const clearTwofa = () => { try { sessionStorage.removeItem(TWOFA_SS); } catch {} };

// Φύλακας ετικετών Firebase — πάντα ενεργός (dev & prod, με ή χωρίς auth).
installFbKeyGuard();
// Με Firebase Auth ενεργό, προσθέτουμε αυτόματα το token σε όλα τα REST writes.
if (USE_FIREBASE_AUTH) installFetchAuthInterceptor();

// Έλεγχος αν ο browser θυμάται τη σύνδεση
const isRemembered = () => {
  if (Platform.OS !== 'web') return false;
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
};

// Αποθήκευση στον browser
const rememberLogin = () => {
  if (Platform.OS !== 'web') return;
  try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
};

const USER_KEY = 'vaicon_user_v1';
const saveSavedUser = (u) => { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch {} };
const loadSavedUser = () => { try { const s = localStorage.getItem(USER_KEY); return s ? JSON.parse(s) : null; } catch { return null; } };
const clearSavedUser = () => { try { localStorage.removeItem(USER_KEY); } catch {} };

const forgetLogin = () => {
  if (Platform.OS !== 'web') return;
  try { localStorage.removeItem(STORAGE_KEY); clearSavedUser(); } catch {}
};

// ============================================================
//  Οθόνη Login
// ============================================================
function LoginScreen({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (busy) return;
    setError('');

    if (USE_FIREBASE_AUTH) {
      if (!email.trim() || !pwd) { setError('Συμπλήρωσε όνομα χρήστη και κωδικό.'); return; }
      setBusy(true);
      const username = email.trim().toUpperCase().replace(/\s+/g, '').replace(/@.*$/, '');
      try {
        if (IS_DEV) {
          const addr = email.trim().toLowerCase().replace(/\s+/g, '').includes('@') ? email.trim().toLowerCase().replace(/\s+/g, '') : `${email.trim().toLowerCase().replace(/\s+/g, '')}@vaicon.local`;
          await fbSignIn(addr, pwd);
          rememberLogin();
          onSuccess();
        } else {
          const isAdminOrGuest = username.startsWith('ADMIN') || username.startsWith('GUEST');
          if (isAdminOrGuest) {
            const res = await loginDirect(username, pwd);
            if (!res.ok) { setError('❌ ' + (res.error || 'Λάθος κωδικός.')); setPwd(''); setTimeout(() => setError(''), 3000); return; }
            await fbSignInWithToken(res.customToken);
            rememberLogin();
            onSuccess({ username, role: res.role, email: res.email });
          } else {
            const r = await verifyPasswordOnly(username, pwd);
            if (!r.ok) { setError('❌ ' + (r.error || 'Λάθος κωδικός.')); setPwd(''); setTimeout(() => setError(''), 3000); return; }
            onSuccess({ username, role: 'user', email: `${username.toLowerCase()}@vaicon.local`, _password: pwd });
          }
        }
      } catch (e) {
        setPwd('');
        setError('❌ Λάθος email ή κωδικός.');
        setTimeout(() => setError(''), 3000);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Παραγωγή: απλός κωδικός όπως πριν
    if (pwd === VAICON_PASSWORD) {
      rememberLogin();
      onSuccess();
    } else {
      setError('❌ Λάθος κωδικός. Δοκιμάστε ξανά.');
      setPwd('');
      setTimeout(() => setError(''), 2000);
    }
  };

  return (
    <View style={loginStyles.bg}>
      <View style={loginStyles.card}>
        {/* LOGO */}
        <View style={loginStyles.logoBox}>
          <Text style={loginStyles.logoText}>VAICON</Text>
          <Text style={loginStyles.logoSub}>Σύστημα Διαχείρισης Παραγγελιών</Text>
        </View>

        {/* EMAIL — μόνο με Firebase Auth */}
        {USE_FIREBASE_AUTH && (
          <>
            <Text style={loginStyles.label}>Όνομα Χρήστη</Text>
            <View style={loginStyles.inputRow}>
              <TextInput
                style={[loginStyles.input, { letterSpacing: 0 }, !!error && loginStyles.inputError]}
                placeholder="π.χ. admin"
                placeholderTextColor="#aaa"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={v => { setEmail(v); setError(''); }}
                autoFocus
              />
            </View>
          </>
        )}

        {/* ΚΩΔΙΚΟΣ */}
        <Text style={loginStyles.label}>Κωδικός Πρόσβασης</Text>
        <View style={loginStyles.inputRow}>
          <TextInput
            style={[loginStyles.input, !!error && loginStyles.inputError]}
            placeholder="Εισάγετε κωδικό..."
            placeholderTextColor="#aaa"
            secureTextEntry={!showPwd}
            value={pwd}
            onChangeText={v => { setPwd(v); setError(''); }}
            onSubmitEditing={handleLogin}
            autoFocus={!USE_FIREBASE_AUTH}
          />
          <TouchableOpacity style={loginStyles.eyeBtn} onPress={() => setShowPwd(v => !v)}>
            <Text style={{ fontSize: 20 }}>{showPwd ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        {!!error && (
          <Text style={loginStyles.errorTxt}>{error}</Text>
        )}

        <TouchableOpacity style={[loginStyles.btn, busy && { opacity: 0.6 }]} onPress={handleLogin} disabled={busy}>
          <Text style={loginStyles.btnTxt}>{busy ? '⏳ ΣΥΝΔΕΣΗ...' : '🔓 ΕΙΣΟΔΟΣ'}</Text>
        </TouchableOpacity>

        <Text style={loginStyles.hint}>
          Μετά την πρώτη σύνδεση, αυτός ο υπολογιστής δεν θα ξαναρωτηθεί.
        </Text>
      </View>
    </View>
  );
}

function LockedScreen({ name, onLogout }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#7f0000', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ fontSize: 80 }}>🔒</Text>
      <Text style={{ fontSize: 34, fontWeight: 'bold', color: '#fff', marginTop: 10, letterSpacing: 2 }}>ΚΛΕΙΔΩΜΕΝΟ</Text>
      <Text style={{ fontSize: 16, color: '#ffd6d6', marginTop: 14, textAlign: 'center', lineHeight: 24 }}>
        Η πρόσβαση έχει κλειδωθεί από τον διαχειριστή.{'\n'}Επικοινωνήστε με τον διαχειριστή για ξεκλείδωμα.
      </Text>
      {name ? <Text style={{ fontSize: 14, color: '#ffb3b3', marginTop: 18 }}>Χρήστης: {name}</Text> : null}
      {onLogout ? (
        <TouchableOpacity onPress={onLogout} style={{ marginTop: 30, borderWidth: 2, borderColor: '#fff', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>🔐 ΑΠΟΣΥΝΔΕΣΗ</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function TwoFactorScreen({ user, onSuccess, onLogout }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState(null);
  const [timeLeft, setTimeLeft] = useState(300);

  const send = async () => {
    setError(''); setBusy(true); setDevCode(null); setTimeLeft(300);
    const r = await start2FA(user.username, user._password || '');
    setBusy(false);
    if (r.ok) setDevCode(r.devCode || null);
    else setError(r.error || 'Αποτυχία αποστολής κωδικού.');
  };
  useEffect(() => { send(); }, []);
  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft]);

  const submit = async () => {
    if (busy || code.trim().length < 6) return;
    setError(''); setBusy(true);
    const r = await verify2FA(user.username, code, user._password || '');
    setBusy(false);
    if (r.ok) onSuccess(r);
    else { setError(r.error || 'Λάθος κωδικός.'); setCode(''); }
  };

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const ss = String(timeLeft % 60).padStart(2, '0');
  const expired = timeLeft <= 0;

  return (
    <View style={loginStyles.bg}>
      <View style={loginStyles.card}>
        <View style={loginStyles.logoBox}>
          <Text style={loginStyles.logoText}>VAICON</Text>
          <Text style={loginStyles.logoSub}>Κωδικός επιβεβαίωσης</Text>
        </View>
        <Text style={{ fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 8, lineHeight: 20 }}>
          Καλέστε τον διαχειριστή συστήματος.{'\n'}Ζητήστε τον εξαψήφιο κωδικό και γράψτε τον εδώ.
        </Text>
        <Text style={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 14, color: expired ? '#c62828' : timeLeft < 60 ? '#e65100' : '#2e7d32' }}>
          ⏱ {expired ? 'Έληξε — ζητήστε νέο' : `${mm}:${ss}`}
        </Text>
        {devCode ? (
          <View style={{ backgroundColor: '#fff8e1', borderColor: '#ffb300', borderWidth: 2, borderRadius: 10, padding: 12, marginBottom: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: '#a67c00' }}>ΔΟΚΙΜΗ (τοπικά) — κωδικός:</Text>
            <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#a67c00', letterSpacing: 6 }}>{devCode}</Text>
          </View>
        ) : null}
        <View style={loginStyles.inputRow}>
          <TextInput
            style={[loginStyles.input, { textAlign: 'center' }, !!error && loginStyles.inputError]}
            placeholder="______"
            placeholderTextColor="#ccc"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={v => { setCode(v.replace(/\D/g, '')); setError(''); }}
            onSubmitEditing={submit}
            autoFocus
          />
        </View>
        {!!error && <Text style={loginStyles.errorTxt}>{error}</Text>}
        <TouchableOpacity style={[loginStyles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          <Text style={loginStyles.btnTxt}>{busy ? '⏳ ΕΛΕΓΧΟΣ...' : '✓ ΕΠΙΒΕΒΑΙΩΣΗ'}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
          <TouchableOpacity onPress={send} disabled={busy}><Text style={{ color: '#1565C0', fontWeight: 'bold', fontSize: 13 }}>↻ Νέος κωδικός</Text></TouchableOpacity>
          <TouchableOpacity onPress={onLogout}><Text style={{ color: '#999', fontSize: 13 }}>Ακύρωση</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PwdInput({ value, onChangeText, error, onSubmit, autoFocus = true }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextInput
        style={[statsAuthStyles.input, error && statsAuthStyles.inputError, { flex: 1 }]}
        secureTextEntry={!show}
        value={value}
        onChangeText={onChangeText}
        placeholder="Κωδικός..."
        autoComplete="off"
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
      />
      <TouchableOpacity onPress={() => setShow(v => !v)} style={{ padding: 10, marginLeft: 4 }}>
        <Text style={{ fontSize: 22 }}>{show ? '🙈' : '👁️'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const loginStyles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 32, width: '90%', maxWidth: 400, alignItems: 'center', elevation: 10 },
  logoBox: { alignItems: 'center', marginBottom: 32 },
  logoText: { fontSize: 42, fontWeight: '300', letterSpacing: 16, color: '#8B0000' },
  logoSub: { fontSize: 12, color: '#888', marginTop: 4, textAlign: 'center' },
  label: { alignSelf: 'flex-start', fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 8 },
  input: { flex: 1, backgroundColor: '#f5f5f5', padding: 14, borderRadius: 8, borderWidth: 2, borderColor: '#ddd', fontSize: 18, color: '#1a1a1a', letterSpacing: 4 },
  inputError: { borderColor: '#ff4444', backgroundColor: '#fff0f0' },
  eyeBtn: { position: 'absolute', right: 12 },
  errorTxt: { color: '#ff4444', fontSize: 13, marginBottom: 12, alignSelf: 'flex-start' },
  btn: { backgroundColor: '#8B0000', padding: 16, borderRadius: 10, alignItems: 'center', width: '100%', marginTop: 8 },
  btnTxt: { color: 'white', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  hint: { fontSize: 11, color: '#aaa', marginTop: 20, textAlign: 'center', lineHeight: 16 },
});

// Στυλ για τα modal των μηνυμάτων (ίδια εμφάνιση με vaicon-eidikes)
const msgStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  box: { backgroundColor: 'white', borderRadius: 14, padding: 20, width: '100%', elevation: 8, borderTopWidth: 10, borderTopColor: '#1565C0' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1565C0', textAlign: 'center', marginBottom: 6 },
  btn: { backgroundColor: '#1565C0', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnTxt: { color: 'white', fontWeight: 'bold', fontSize: 15, letterSpacing: 0.5 },
});

const statsAuthStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  box: { backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, elevation: 10 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#8B0000', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 2, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 18, letterSpacing: 2, textAlign: 'center' },
  inputError: { borderColor: '#ff4444' },
  errorTxt: { color: '#ff4444', fontSize: 13, marginTop: 8, textAlign: 'center', fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  btnTxt: { color: 'white', fontWeight: 'bold', fontSize: 14 },
});

const adminStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { width: 70, fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  labelInput: { flex: 1, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, backgroundColor: '#fafafa' },
  badge: { fontSize: 14, fontWeight: 'bold' },
  badgeLocked: { color: '#E65100' },
  badgeOpen: { color: '#2e7d32' },
  toggle: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  toggleTxt: { color: 'white', fontWeight: 'bold', fontSize: 12 },
});

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TABS = ['customNew', 'customQuotes', 'customMoni', 'customDipli', 'sasi', 'cases', 'deliveries', 'stats'];
const TAB_LABELS = { customNew: 'ΚΑΤΑΧΩΡΗΣΗ', customQuotes: 'ΠΡΟΣΦΟΡΕΣ', customMoni: 'ΤΥΠΟΠΟΙΗΜΕΝΕΣ\nΜΟΝΗ ΘΩΡΑΚΙΣΗ', customDipli: 'ΤΥΠΟΠΟΙΗΜΕΝΕΣ\nΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', sasi: 'STOCK ΣΑΣΙ', cases: 'STOCK ΚΑΣΑ', stats: 'ΣΤΑΤΙΣΤΙΚΑ' };
const TAB_ICONS  = { customNew: '✏️', customQuotes: '💼', customMoni: '🛡️', customDipli: '🔰', sasi: '🔧', cases: '🚪', stats: '📊' };
const NAV_TABS = ['customNew', 'customQuotes', 'customMoni', 'customDipli', 'sasi', 'cases'];
// Καρτέλες με ελεγχόμενα δικαιώματα ανά χρήστη (view = hide, edit = readonly)
const RIGHT_TABS = [
  { key: 'customNew', label: 'Καταχώρηση', edit: false },
  { key: 'customMoni', label: 'Μονή θωράκιση', edit: true },
  { key: 'customDipli', label: 'Διπλή θωράκιση', edit: true },
  { key: 'sasi', label: 'Stock Σασί', edit: true },
  { key: 'cases', label: 'Stock Κάσα', edit: true },
  { key: 'deliveries', label: 'Παραδόσεις', edit: false },
];

export default function App() {
  const pendingUserInfoRef = useRef(null);
  const [pendingLogin, setPendingLogin] = useState(null);
  // Με Firebase Auth, η αλήθεια έρχεται από το watchAuth (παρακάτω). Αλλιώς, από το localStorage.
  const [isLoggedIn, setIsLoggedIn] = useState(USE_FIREBASE_AUTH ? false : isRemembered());
  const [currentUser, setCurrentUser] = useState(null);
  const [twofaPassed, setTwofaPassed] = useState(false);
  const [tabIndex, setTabIndex] = useState(TABS.indexOf('customMoni'));
  const [unlockedTab, setUnlockedTab] = useState(null); // ποια καρτέλα είναι ξεκλείδωτη για αλλαγές (μία τη φορά)
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCustomers, setShowCustomers] = useState(false);
  const [showCoatings, setShowCoatings] = useState(false);
  const [showLocks, setShowLocks] = useState(false);
  const [showCylinders, setShowCylinders] = useState(false);
  const [showMisc, setShowMisc] = useState(false);
  const [showPriceCatalog, setShowPriceCatalog] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showSellerLog, setShowSellerLog] = useState(false);
  const [sellerFilter, setSellerFilter] = useState('');
  const [sellerFilterOpen, setSellerFilterOpen] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showApprovalHistory, setShowApprovalHistory] = useState(false);
  const [showApprovalRights, setShowApprovalRights] = useState(false);
  const [approvalRights, setApprovalRights] = useState({});
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [showSellerSubs, setShowSellerSubs] = useState(false);
  const [editSubmission, setEditSubmission] = useState(null);
  // Μηνύματα (ίδιο σύστημα με vaicon-eidikes, κοινός κόμβος messages στη βάση)
  const [showMessages, setShowMessages] = useState(false);
  const [incomingMsg, setIncomingMsg] = useState(null);
  const [showInbox, setShowInbox] = useState(false);
  const [inbox, setInbox] = useState([]);
  const [unreadPrompt, setUnreadPrompt] = useState(0);
  const nextPromptAtRef = useRef(0);
  const tabRightsDirty = useRef(0); // παράθυρο προστασίας: το polling δεν πατάει πρόσφατες αλλαγές
  const [userLabels, setUserLabels] = useState({});
  const [lockedUsers, setLockedUsers] = useState({}); // app_lock: κλείδωμα συσκευής ανά χρήστη
  const [tabRights, setTabRights] = useState({}); // tab_rights: περιορισμοί καρτελών ανά χρήστη
  const [showTabRights, setShowTabRights] = useState(false);
  const [tabRightsUser, setTabRightsUser] = useState(null);
  const [tabRightsProg, setTabRightsProg] = useState('std');
  const [labelDrafts, setLabelDrafts] = useState({});
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [adminAuthPwd, setAdminAuthPwd] = useState('');
  const [adminAuthError, setAdminAuthError] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [twofaPending, setTwofaPending] = useState({});
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(null);
  const [restorePayload, setRestorePayload] = useState(null);
  const [restoreFileError, setRestoreFileError] = useState(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState(null); // όνομα πελάτη από CustomScreen
  const [pendingCustomerCallback, setPendingCustomerCallback] = useState(null);

  const [customOrders, setCustomOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [soldOrders, setSoldOrders] = useState([]);
  const [sasiOrders, setSasiOrders] = useState([]);
  const [soldSasiOrders, setSoldSasiOrders] = useState([]);
  const [caseOrders, setCaseOrders] = useState([]);
  const [soldCaseOrders, setSoldCaseOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [coatings, setCoatings] = useState([]);
  const [locks, setLocks] = useState([]);
  const [cylinders, setCylinders] = useState([]);
  const [misc, setMisc] = useState([]);
  const [dipliSasiStock, setDipliSasiStock] = useState([]);
  const [sasiStock, setSasiStock] = useState({});
  const [caseStock, setCaseStock] = useState({});
  const [sasiOps, setSasiOps] = useState([]); // καλάθι εκκρεμοτήτων stock — μένει ανοιχτό σε αλλαγή καρτέλας
  const [caseOps, setCaseOps] = useState([]);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [paradoseisSearchOrderName, setParadoseisSearchOrderName] = useState('');
  const [paradoseisSearchOther, setParadoseisSearchOther] = useState('');
  const [paradoseisSearchOther2, setParadoseisSearchOther2] = useState('');
  const [paradoseisSearchOther3, setParadoseisSearchOther3] = useState('');
  /** Λογική μεταξύ «Λοιπών πεδίων» (1/2/3). Το πρώτο πεδίο (όνομα/αρ.) πάντα must-match. */
  const [paradoseisSearchLogic, setParadoseisSearchLogic] = useState('AND');
  const [globalSearchModalVisible, setGlobalSearchModalVisible] = useState(false);
  /** Φίλτρο πριν τη λίστα σταθερών (Alert στο web δεν δουλεύει σωστά με πολλά κουμπιά) */
  const [staveraFilterModalVisible, setStaveraFilterModalVisible] = useState(false);
  /** true = λίστα από «Αναζήτηση σταθερών» (εκτύπωση με άλλο layout) */
  const [globalSearchModalStaveraMode, setGlobalSearchModalStaveraMode] = useState(false);
  const [globalSearchHits, setGlobalSearchHits] = useState([]);
  /** Δείκτες γραμμών (index) με ενεργή επιλογή για εκτύπωση πολλαπλών παραγγελιών */
  const [globalSearchPrintSelected, setGlobalSearchPrintSelected] = useState(() => new Set());
  const [globalSearchHighlightOrderId, setGlobalSearchHighlightOrderId] = useState(null);
  const [globalSearchStockMeta, setGlobalSearchStockMeta] = useState(null);

  /**
   * Στη λειτουργία «Σταθερά» ενημερώνουμε κάθε γραμμή με την τρέχουσα παραγγελία από `customOrders`
   * (τα hits κρατούν παλιό `order`· επιπλέον το `id` του hit μπορεί να μην ταιριάζει με το `id` στη λίστα).
   */
  const effectiveSearchHits = useMemo(() => {
    if (!globalSearchModalStaveraMode) return globalSearchHits;
    return globalSearchHits.map((h) => ({
      ...h,
      order: resolveLiveStdOrder(h, customOrders) || h.order,
    }));
  }, [globalSearchModalStaveraMode, globalSearchHits, customOrders]);

  /** Τουλάχιστον μία παραγγελία όπως στην οθόνη ΠΑΡΑΔΟΣΕΙΣ → LED υπενθύμισης. */
  const paradoseisReminderActive = useMemo(
    () => hasParadoseisReminderOrders(customOrders),
    [customOrders]
  );

  const paradoseisLedOpacity = useRef(new Animated.Value(0)).current;
  const prevAppTabIndexRef = useRef(null);
  const prevParadoseisReminderRef = useRef(false);

  useEffect(() => {
    const reminderTurnedOn = paradoseisReminderActive && !prevParadoseisReminderRef.current;
    prevParadoseisReminderRef.current = paradoseisReminderActive;

    if (!paradoseisReminderActive) {
      paradoseisLedOpacity.setValue(0);
      prevAppTabIndexRef.current = tabIndex;
      return undefined;
    }

    const prevTab = prevAppTabIndexRef.current;
    const tabChanged = prevTab !== tabIndex;
    prevAppTabIndexRef.current = tabIndex;
    if (!tabChanged && !reminderTurnedOn) return undefined;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(paradoseisLedOpacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(paradoseisLedOpacity, {
          toValue: 0.15,
          duration: 420,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    const timer = setTimeout(() => {
      loop.stop();
      paradoseisLedOpacity.setValue(0);
    }, 10000);
    return () => {
      clearTimeout(timer);
      loop.stop();
      paradoseisLedOpacity.setValue(0);
    };
  }, [tabIndex, paradoseisReminderActive, paradoseisLedOpacity]);

  const fetchAbortRef = useRef(null);

  const clearSearchNavigationHighlight = useCallback(() => {
    setGlobalSearchHighlightOrderId(null);
    setGlobalSearchStockMeta(null);
  }, []);

  /** Web: οποιοδήποτε κλικ/άγγιγμα αφαιρεί την επισήμανση αναζήτησης (capture πριν το στοιχείο-στόχος). */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const has =
      globalSearchHighlightOrderId != null || globalSearchStockMeta != null;
    if (!has) return undefined;
    const onPointerDown = () => {
      clearSearchNavigationHighlight();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [
    globalSearchHighlightOrderId,
    globalSearchStockMeta,
    clearSearchNavigationHighlight,
  ]);

  const clearAllSidebarSearchFilters = () => {
    setParadoseisSearchOrderName('');
    setParadoseisSearchOther('');
    setParadoseisSearchOther2('');
    setParadoseisSearchOther3('');
    setParadoseisSearchLogic('AND');
  };

  const printSearchResultOrder = async (hit) => {
    const order = resolveLiveStdOrder(hit, customOrders) || hit.order;
    if (!order) {
      Alert.alert('Εκτύπωση', 'Δεν βρέθηκαν αποθηκευμένα στοιχεία παραγγελίας.');
      return;
    }
    try {
      const html = globalSearchModalStaveraMode
        ? buildStaveraSearchOrderPrintHTML(order, { where: hit.where })
        : buildGlobalSearchOrderPrintHTML(order, { where: hit.where });
      await printHTML(html, `VAICON — ${hit.orderNo}`);
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η εκτύπωση δεν ολοκληρώθηκε.');
    }
  };

  const printAllSearchResults = async () => {
    const withOrder = effectiveSearchHits.filter((h) => h.order);
    if (!withOrder.length) {
      Alert.alert('Εκτύπωση', 'Δεν βρέθηκαν αποθηκευμένα στοιχεία παραγγελίας.');
      return;
    }
    try {
      const html = globalSearchModalStaveraMode
        ? buildStaveraSearchOrdersPrintHTML(withOrder)
        : buildGlobalSearchOrdersPrintHTML(withOrder);
      await printHTML(html, globalSearchModalStaveraMode ? 'VAICON — σταθερά' : 'VAICON — αποτελέσματα');
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η εκτύπωση δεν ολοκληρώθηκε.');
    }
  };

  const printableHitIndices = useMemo(
    () => effectiveSearchHits.map((h, i) => (h.order ? i : -1)).filter((i) => i >= 0),
    [effectiveSearchHits]
  );

  const selectedPrintableCount = useMemo(() => {
    let n = 0;
    for (const i of globalSearchPrintSelected) {
      if (i >= 0 && i < effectiveSearchHits.length && effectiveSearchHits[i]?.order) n += 1;
    }
    return n;
  }, [globalSearchPrintSelected, effectiveSearchHits]);

  const toggleGlobalSearchPrintSelect = useCallback((index) => {
    if (!effectiveSearchHits[index]?.order) return;
    setGlobalSearchPrintSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, [effectiveSearchHits]);

  const selectAllPrintableSearchHits = useCallback(() => {
    setGlobalSearchPrintSelected(new Set(printableHitIndices));
  }, [printableHitIndices]);

  // Επιλογή για εκτύπωση όλων ΕΚΤΟΣ αρχείου (τι «τρέχει»: έτοιμα + εν εξελίξει).
  const selectActiveSearchHits = useCallback(() => {
    setGlobalSearchPrintSelected(new Set(
      effectiveSearchHits.map((h, i) => (h.order && !h.isSold) ? i : -1).filter((i) => i >= 0)
    ));
  }, [effectiveSearchHits]);

  const clearGlobalSearchPrintSelection = useCallback(() => {
    setGlobalSearchPrintSelected(new Set());
  }, []);

  const closeGlobalSearchModal = useCallback(() => {
    setGlobalSearchPrintSelected(new Set());
    setGlobalSearchModalStaveraMode(false);
    setGlobalSearchModalVisible(false);
  }, []);

  const printSelectedSearchResults = async () => {
    const picked = [...globalSearchPrintSelected]
      .filter((i) => i >= 0 && i < effectiveSearchHits.length && effectiveSearchHits[i]?.order)
      .sort((a, b) => a - b)
      .map((i) => effectiveSearchHits[i]);
    if (!picked.length) {
      Alert.alert('Εκτύπωση', 'Διάλεξε τουλάχιστον μία παραγγελία με το τετραγωνάκι επιλογής.');
      return;
    }
    try {
      const html = globalSearchModalStaveraMode
        ? buildStaveraSearchOrdersPrintHTML(picked)
        : buildGlobalSearchOrdersPrintHTML(picked);
      await printHTML(html, `VAICON — ${picked.length} επιλεγμένες`);
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η εκτύπωση δεν ολοκληρώθηκε.');
    }
  };

  const openStaveraSidebarSearchWithFilter = (filterMode) => {
    try {
      const hits = collectStaveraOrdersHits(
        {
          customOrders,
          soldOrders,
          sasiOrders,
          soldSasiOrders,
          caseOrders,
          soldCaseOrders,
        },
        filterMode
      );
      setGlobalSearchHits(hits);
      setGlobalSearchModalStaveraMode(true);
      setGlobalSearchPrintSelected(new Set());
      setGlobalSearchModalVisible(true);
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η αναζήτηση σταθερών απέτυχε.');
    }
  };

  /** Modal αντί για Alert: στο web το Alert με πολλά κουμπιά δεν εκτελεί σωστά τα onPress. */
  const applyStaveraFilterChoice = (filterMode) => {
    setStaveraFilterModalVisible(false);
    openStaveraSidebarSearchWithFilter(filterMode);
  };

  const runStaveraSidebarSearch = () => setStaveraFilterModalVisible(true);

  const runGlobalSidebarSearch = () => {
    try {
      const q1 = paradoseisSearchOrderName;
      const qOther = [paradoseisSearchOther, paradoseisSearchOther2, paradoseisSearchOther3];
      const hasAny =
        String(q1).trim() ||
        qOther.some((s) => String(s || '').trim());
      if (!hasAny) {
        Alert.alert('', 'Γράψε τουλάχιστον σε ένα από τα πεδία αναζήτησης.');
        return;
      }
      let hits = collectGlobalSearchHits(
        q1,
        qOther,
        {
          customOrders,
          soldOrders,
          sasiOrders,
          soldSasiOrders,
          caseOrders,
          soldCaseOrders,
          quotes,
        },
        paradoseisSearchLogic
      );
      hits = [...hits].sort((a, b) => {
        if (a.isSold !== b.isSold) return a.isSold ? 1 : -1;
        const an = parseInt(a.orderNo, 10), bn = parseInt(b.orderNo, 10);
        const av = Number.isNaN(an) ? Infinity : an, bv = Number.isNaN(bn) ? Infinity : bn;
        if (av !== bv) return av - bv;
        return String(a.orderNo ?? '').localeCompare(String(b.orderNo ?? ''), undefined, { numeric: true });
      });
      setGlobalSearchHits(hits);
      setGlobalSearchModalStaveraMode(false);
      setGlobalSearchPrintSelected(new Set());
      setGlobalSearchModalVisible(true);
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η αναζήτηση απέτυχε.');
    }
  };

  // Με Firebase Auth: παρακολούθηση κατάστασης σύνδεσης (πηγή αλήθειας).
  // Από το email βγαίνει και η ταυτότητα/ρόλος του χρήστη (για τα μηνύματα).
  useEffect(() => {
    if (!USE_FIREBASE_AUTH) return;
    const unsub = watchAuth(user => {
      setIsLoggedIn(!!user);
      if (user) {
        const cu = (user.email ? userFromEmail(user.email) : null)
          || pendingUserInfoRef.current
          || loadSavedUser();
        pendingUserInfoRef.current = null;
        setCurrentUser(cu);
        // Custom token users (no email) έχουν ήδη περάσει 2FA
        setTwofaPassed(!user.email ? true : (cu ? (!needsTwoFactor(cu) || twofaSessionOk(cu)) : false));
      } else {
        setCurrentUser(null);
        setTwofaPassed(false);
      }
    });
    return unsub;
  }, []);

  // Δικαιώματα έγκρισης + αριθμός παραγγελιών προς έγκριση (για όσους εγκρίνουν).
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => {
      try { const r = await fetch(`${FIREBASE_URL}/approval_rights.json`); setApprovalRights((await r.json()) || {}); } catch {}
      if (isSellerEmail(currentUser?.email)) { setPendingApprovalCount(0); return; }
      try {
        const r = await fetch(`${FIREBASE_URL}/seller_submissions.json`); const d = await r.json();
        const n = d ? Object.values(d).filter(s => s.status === 'PENDING' && s.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ').length : 0;
        setPendingApprovalCount(n);
      } catch {}
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [isLoggedIn]);

  // Έλεγχος για αδιάβαστα μηνύματα (μόνο απλοί χρήστες). Επαναλαμβανόμενη
  // υπενθύμιση: το popup ξαναβγαίνει κάθε 5' μέχρι να διαβαστούν όλα.
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.username || currentUser.role !== 'user') return;
    const myKey = lockKey(currentUser.username);
    const pickUnread = (data) => {
      const unread = Object.values(data || {}).filter(m => m && m.read === false);
      if (!unread.length) { nextPromptAtRef.current = 0; setUnreadPrompt(0); return; }
      if (Date.now() >= (nextPromptAtRef.current || 0)) setUnreadPrompt(unread.length);
    };
    const load = async () => { try { const r = await fetch(`${FIREBASE_URL}/messages/${myKey}.json`); pickUnread(await r.json()); } catch {} };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [isLoggedIn, currentUser]);

  // Ονόματα χρηστών (user_labels) — φορτώνονται σε όλους τους χρήστες γραφείου (όχι πωλητές/guest).
  useEffect(() => {
    if (!isLoggedIn || isSellerEmail(currentUser?.email) || currentUser?.role === 'guest') return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/user_labels.json`);
        const data = (await r.json()) || {};
        if (alive) { setUserLabels(data); setLabelDrafts(data); }
      } catch {}
    })();
    return () => { alive = false; };
  }, [isLoggedIn, currentUser]);

  // Κλείδωμα συσκευής ανά χρήστη (app_lock). Polling — όχι μόνιμη σύνδεση.
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => { try { const r = await fetch(`${FIREBASE_URL}/app_lock.json`); setLockedUsers((await r.json()) || {}); } catch {} };
    load();
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [isLoggedIn]);

  const writeLock = async (key, val) => {
    setLockedUsers(prev => { const n = { ...prev }; if (val) n[key] = true; else delete n[key]; return n; });
    try { await fetch(`${FIREBASE_URL}/app_lock/${key}.json`, val ? { method: 'PUT', body: 'true' } : { method: 'DELETE' }); } catch {}
  };

  // Δικαιώματα καρτελών ανά χρήστη (tab_rights). Polling — χωρίς εγγραφή = πλήρης πρόσβαση.
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => { if (Date.now() < tabRightsDirty.current) return; try { const r = await fetch(`${FIREBASE_URL}/tab_rights.json`); setTabRights((await r.json()) || {}); } catch {} };
    load();
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [isLoggedIn]);

  const writeTabRight = async (userKey, dim, tab, restricted) => {
    tabRightsDirty.current = Date.now() + 8000;
    const n = { ...tabRights }; const u = { ...(n[userKey] || {}) }; const d = { ...(u[dim] || {}) };
    if (restricted) d[tab] = true; else delete d[tab];
    if (Object.keys(d).length) u[dim] = d; else delete u[dim];
    const nextUser = Object.keys(u).length ? u : null;
    if (nextUser) n[userKey] = u; else delete n[userKey];
    setTabRights(n);
    try {
      const res = await fetch(`${FIREBASE_URL}/tab_rights/${userKey}.json`,
        nextUser ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextUser) }
                 : { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch { if (Platform.OS === 'web') window.alert('Η αλλαγή δεν αποθηκεύτηκε. Δοκίμασε ξανά.'); }
  };
  const lockAllUsers = async () => {
    const obj = {}; APP_USERS.filter(u => u !== 'GUEST' && u !== 'ADMIN').forEach(u => { obj[lockKey(u)] = true; });
    setLockedUsers(prev => ({ ...prev, ...obj }));
    try { const cur = (await (await fetch(`${FIREBASE_URL}/app_lock.json`)).json()) || {}; await fetch(`${FIREBASE_URL}/app_lock.json`, { method: 'PUT', body: JSON.stringify({ ...cur, ...obj }) }); } catch {}
  };
  const unlockAllUsers = async () => {
    setLockedUsers({});
    try { await fetch(`${FIREBASE_URL}/app_lock.json`, { method: 'DELETE' }); } catch {}
  };
  // ΕΡΓΑΛΕΙΟ ΜΙΑΣ ΧΡΗΣΗΣ: σφραγίδα πωλητή στις παλιές παραγγελίες/προσφορές (από τον πελάτη τους). Αφαιρείται μετά.
  const stampSellersOnOldOrders = async () => {
    if (Platform.OS === 'web' && !window.confirm('Να μπει η σφραγίδα πωλητή σε όλες τις παλιές παραγγελίες & προσφορές;')) return;
    const [stdRaw, qRaw, custRaw] = await Promise.all([
      fetch(`${FIREBASE_URL}/std_orders.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/std_quotes.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/customers.json`).then(r => r.json()).catch(() => null),
    ]);
    const custs = custRaw ? Object.keys(custRaw).map(k => ({ id: k, ...custRaw[k] })) : [];
    const sellerOf = (o) => {
      const c = o.customerId ? custs.find(x => x.id === o.customerId) : custs.find(x => String(x.name) === String(o.customer));
      return c?.seller || '';
    };
    let total = 0, updated = 0;
    const run = async (node, raw) => {
      for (const key of Object.keys(raw || {})) {
        total++;
        const seller = sellerOf(raw[key]);
        if ((raw[key].seller || '') !== seller) {
          try { await fetch(`${FIREBASE_URL}/${node}/${key}.json`, { method: 'PATCH', body: JSON.stringify({ seller }) }); updated++; } catch {}
        }
      }
    };
    await run('std_orders', stdRaw);
    await run('std_quotes', qRaw);
    const msg = `Ελέγχθηκαν ${total}, ενημερώθηκαν ${updated}.`;
    if (Platform.OS === 'web') window.alert(`Σφραγίδα πωλητή\n${msg}`); else Alert.alert('Σφραγίδα πωλητή', msg);
    await fetchData();
  };

  // ── Πάνελ Διαχειριστή: κωδικός (owner code = κωδικός του admin), ονόματα, backup/restore ──
  const verifyAdminCode = async (code) => {
    if (IS_DEV) {
      try { await fbSignIn(currentUser?.email || 'admin@vaicon.local', code); return true; } catch { return false; }
    }
    const res = await verifyPasswordOnly('ADMIN', code);
    return res.ok;
  };

  useEffect(() => {
    if (!isLoggedIn || currentUser?.role !== 'admin') return;
    const poll = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/twofa_pending.json`);
        const d = await r.json();
        setTwofaPending(d && typeof d === 'object' ? d : {});
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [isLoggedIn, currentUser]);
  const openAdmin = () => {
    setMenuOpen(false);
    if (adminUnlocked) { setAdminPanelOpen(true); }
    else { setAdminAuthPwd(''); setAdminAuthError(false); setAdminAuthOpen(true); }
  };
  const tryOpenAdmin = async () => {
    if (await verifyAdminCode(adminAuthPwd)) {
      setAdminAuthOpen(false); setAdminAuthPwd(''); setAdminAuthError(false);
      setAdminUnlocked(true); setAdminPanelOpen(true);
    } else { setAdminAuthError(true); setAdminAuthPwd(''); setTimeout(() => setAdminAuthError(false), 2000); }
  };
  const saveLabel = async (k, val) => {
    const trimmed = (val || '').trim();
    if ((userLabels[k] || '') === trimmed) return;
    try {
      await fetch(`${FIREBASE_URL}/user_labels/${k}.json`, trimmed
        ? { method: 'PUT', body: JSON.stringify(trimmed) }
        : { method: 'DELETE' });
      setUserLabels(prev => { const n = { ...prev }; if (trimmed) n[k] = trimmed; else delete n[k]; return n; });
    } catch {}
  };

  const downloadBlob = (text, filename) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const BACKUP_NODES = ['std_orders', 'std_quotes', 'sasi_orders', 'case_orders', 'sasi_stock', 'case_stock', 'dipli_sasi_stock', 'customers', 'coatings', 'locks', 'cylinders', 'misc', 'user_labels', 'activity_log', 'messages', 'app_lock', 'order_files', 'upload_tokens', 'order_seq', 'seller_submissions', 'approval_log', 'approval_rights', 'tab_rights'];
  const doBackup = async () => {
    if (Platform.OS !== 'web') { Alert.alert('Μη διαθέσιμο', 'Το backup είναι διαθέσιμο μόνο από browser.'); return; }
    setBackupRunning(true);
    try {
      const fullData = {};
      for (const p of BACKUP_NODES) {
        const r = await fetch(`${FIREBASE_URL}/${p}.json`);
        if (!r.ok) continue;
        const d = await r.json();
        if (d !== null && d !== undefined) fullData[p] = d;
      }
      if (Object.keys(fullData).length === 0) throw new Error('Σφάλμα ανάγνωσης βάσης');
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const createdAtStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const payload = { createdAt: now.getTime(), createdAtStr, version: APP_VERSION, data: fullData };
      const json = JSON.stringify(payload, null, 2);
      const filename = `vaicon-app-backup-${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
          const writable = await handle.createWritable();
          await writable.write(json); await writable.close();
        } catch (e) {
          if (e.name === 'AbortError') { setBackupRunning(false); return; }
          downloadBlob(json, filename);
        }
      } else { downloadBlob(json, filename); }
      setBackupSuccess(createdAtStr);
    } catch (e) {
      Alert.alert('Σφάλμα', 'Το backup απέτυχε: ' + (e.message || String(e)));
    } finally { setBackupRunning(false); }
  };
  const validateBackup = (parsed) => {
    if (!parsed || typeof parsed !== 'object') return 'Το αρχείο δεν είναι έγκυρο.';
    if (typeof parsed.createdAt !== 'number' || !parsed.data || typeof parsed.data !== 'object') return 'Το αρχείο δεν είναι έγκυρο backup του VAICON.';
    const present = ['std_orders', 'customers', 'coatings', 'locks'].filter(k => k in parsed.data);
    if (present.length === 0) return 'Το backup δεν περιέχει δεδομένα της εφαρμογής.';
    return null;
  };
  const openRestoreFilePicker = () => {
    if (Platform.OS !== 'web') { Alert.alert('Μη διαθέσιμο', 'Η επαναφορά είναι διαθέσιμη μόνο από browser.'); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const err = validateBackup(parsed);
        if (err) { setRestoreFileError(err); return; }
        setRestorePayload(parsed); setRestoreConfirmText('');
      } catch { setRestoreFileError('Το αρχείο δεν διαβάζεται ως JSON.'); }
    };
    input.click();
  };
  const doRestore = async () => {
    if (!restorePayload?.data) return;
    setRestoreRunning(true);
    try {
      for (const p of BACKUP_NODES) {
        const val = (p in restorePayload.data) ? restorePayload.data[p] : null;
        const res = await fetch(`${FIREBASE_URL}/${p}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) });
        if (!res.ok) throw new Error(`${p} (${res.status})`);
      }
      if (Platform.OS === 'web') window.location.reload();
      else Alert.alert('Επαναφορά', 'Ολοκληρώθηκε. Επανεκκινήστε την εφαρμογή.');
    } catch (e) {
      setRestoreRunning(false);
      Alert.alert('Σφάλμα', 'Η επαναφορά απέτυχε: ' + (e.message || String(e)));
    }
  };

  const loadInbox = async () => {
    if (!currentUser?.username) return [];
    try {
      const r = await fetch(`${FIREBASE_URL}/messages/${lockKey(currentUser.username)}.json`);
      const d = (await r.json()) || {};
      const arr = Object.keys(d).map(id => ({ id, ...d[id] }));
      [...arr].sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach((m, i) => { m._num = i + 1; });
      const sorted = arr.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setInbox(sorted);
      return sorted;
    } catch { setInbox([]); return []; }
  };

  // Ανοίγει το inbox και αναδύει αυτόματα το παλαιότερο αδιάβαστο (αναγκαστική ανάγνωση).
  const openInbox = async () => {
    setMenuOpen(false);
    setUnreadPrompt(0);
    setShowInbox(true);
    const arr = await loadInbox();
    const oldestUnread = arr.filter(m => m.read === false).sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
    if (oldestUnread) setIncomingMsg(oldestUnread);
  };

  useEffect(() => {
    if (!showInbox) return;
    const iv = setInterval(loadInbox, 12000);
    return () => clearInterval(iv);
  }, [showInbox]);

  const dismissMsg = async () => {
    const m = incomingMsg;
    if (!m || !currentUser?.username) { setIncomingMsg(null); return; }
    const wasUnread = m.read === false;
    if (wasUnread) {
      setInbox(prev => prev.map(x => x.id === m.id ? { ...x, read: true, readAt: Date.now() } : x));
      try { await fetch(`${FIREBASE_URL}/messages/${lockKey(currentUser.username)}/${m.id}.json`, { method: 'PATCH', body: JSON.stringify({ read: true, readAt: Date.now() }) }); } catch {}
    }
    // Αναγκαστική ουρά: μόλις διαβαστεί, αναδύεται αυτόματα το επόμενο (παλαιότερο) αδιάβαστο.
    const next = wasUnread
      ? inbox.filter(x => x.id !== m.id && x.read === false).sort((a, b) => (a.ts || 0) - (b.ts || 0))[0]
      : null;
    setIncomingMsg(next || null);
    if (!next) setUnreadPrompt(0);
  };

  const isSeller = isSellerEmail(currentUser?.email);
  const sellerKey = isSeller && currentUser?.username ? lockKey(currentUser.username) : null;

  useEffect(() => {
    // Με Firebase Auth ξεκινάμε το sync μόνο αφού συνδεθεί ο χρήστης
    // (ώστε οι αναγνώσεις/εγγραφές να φέρουν έγκυρο token).
    if (USE_FIREBASE_AUTH && !isLoggedIn) return;
    if (hasFirebaseRealtime()) {
      try {
        return subscribeFirebaseRealtime({
          setCustomOrders, setSoldOrders, setSasiOrders, setSoldSasiOrders,
          setCaseOrders, setSoldCaseOrders, setCustomers, setCoatings,
          setDipliSasiStock, setLocks, setSasiStock, setCaseStock, setQuotes,
          setLoading, setActivityRefreshKey, isSeller, sellerKey,
        });
      } catch (e) {
        console.error('Firebase realtime:', e);
        fetchData();
        return () => { if (fetchAbortRef.current) fetchAbortRef.current.abort(); };
      }
    }
    fetchData();
    return () => { if (fetchAbortRef.current) fetchAbortRef.current.abort(); };
  }, [USE_FIREBASE_AUTH ? isLoggedIn : 0, isSeller, sellerKey]);

  // Back button handler
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (incomingMsg) { return true; } // αναγκαστική ανάγνωση — δεν παρακάμπτεται
      if (unreadPrompt > 0) { setUnreadPrompt(0); nextPromptAtRef.current = Date.now() + 5 * 60 * 1000; return true; }
      if (showInbox) { setShowInbox(false); return true; }
      if (showMessages) { setShowMessages(false); return true; }
      if (menuOpen) { setMenuOpen(false); return true; }
      if (showActivity) { setShowActivity(false); return true; }
      if (showCoatings) { setShowCoatings(false); return true; }
      if (showLocks) { setShowLocks(false); return true; }
      if (showCylinders) { setShowCylinders(false); return true; }
      if (showMisc) { setShowMisc(false); return true; }
      if (showCustomers) { setShowCustomers(false); return true; }
      if (staveraFilterModalVisible) {
        setStaveraFilterModalVisible(false);
        return true;
      }
      if (globalSearchModalVisible) {
        closeGlobalSearchModal();
        return true;
      }
      if (tabIndex !== 0) { setTabIndex(0); return true; }
      return false; // έξοδος από app αν ήδη στην 1η καρτέλα
    });
    return () => sub.remove();
  }, [menuOpen, showActivity, showCoatings, showLocks, showCylinders, showMisc, showCustomers, tabIndex, staveraFilterModalVisible, globalSearchModalVisible, closeGlobalSearchModal, incomingMsg, unreadPrompt, showInbox, showMessages]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, m] = await Promise.all([
          fetch(`${FIREBASE_URL}/cylinders.json`).then(r => r.ok ? r.json() : null),
          fetch(`${FIREBASE_URL}/misc.json`).then(r => r.ok ? r.json() : null),
        ]);
        if (!alive) return;
        setCylinders(c ? Object.keys(c).map(k => ({ id: k, ...c[k] })) : []);
        setMisc(m ? Object.keys(m).map(k => ({ id: k, ...m[k] })) : []);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  // ΠΡΟΣΩΡΙΝΟ: εφάπαξ γέμισμα ΑΦΑΛΩΝ & ΔΙΑΦΟΡΩΝ από PDF — μόνο αφού συνδεθεί ο admin.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !isLoggedIn || currentUser?.role !== 'admin') return;
    seededRef.current = true;
    seedExtras(setCylinders, setMisc);
  }, [isLoggedIn, currentUser]);

  const fetchData = async () => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const { signal } = controller;
    setLoading(true);

    const fetchJSON = (url) => fetch(url, { signal }).then(r => {
      if (!r.ok) throw new Error(`Firebase error ${r.status}: ${url}`);
      return r.json();
    });
    // Πωλητής: φέρνει από τη βάση ΜΟΝΟ τα δικά του (seller == sellerKey).
    const sellerQ = (isSeller && sellerKey) ? `?orderBy=${encodeURIComponent('"seller"')}&equalTo=${encodeURIComponent(`"${sellerKey}"`)}` : '';
    try {
      const [
        dataStd, data2, data3, data4, data5, data6, data7, dataSasiStock, dataCaseStock, dataQuotes
      ] = await Promise.all([
        fetchJSON(`${FIREBASE_URL}/std_orders.json${sellerQ}`),
        fetchJSON(`${FIREBASE_URL}/sasi_orders.json`),
        fetchJSON(`${FIREBASE_URL}/case_orders.json`),
        fetchJSON(`${FIREBASE_URL}/customers.json${sellerQ}`),
        fetchJSON(`${FIREBASE_URL}/coatings.json`),
        fetchJSON(`${FIREBASE_URL}/dipli_sasi_stock.json`),
        fetchJSON(`${FIREBASE_URL}/locks.json`),
        fetchJSON(`${FIREBASE_URL}/sasi_stock.json`),
        fetchJSON(`${FIREBASE_URL}/case_stock.json`),
        fetchJSON(`${FIREBASE_URL}/std_quotes.json${sellerQ}`),
      ]);

      applyFetchedBundle(
        {
          setCustomOrders, setSoldOrders, setSasiOrders, setSoldSasiOrders,
          setCaseOrders, setSoldCaseOrders, setCustomers, setCoatings,
          setDipliSasiStock, setLocks, setSasiStock, setCaseStock, setQuotes,
        },
        {
          dataStd, data2, data3, data4, data5, data6, data7, dataSasiStock, dataCaseStock, dataQuotes,
        }
      );
      setActivityRefreshKey(k => k + 1);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(error);
        Alert.alert("Σφάλμα", "Αποτυχία σύνδεσης με το Cloud. Ελέγξτε τη σύνδεση και ξαναπροσπαθήστε.");
      }
    } finally {
      setLoading(false);
    }
  };

  // SWIPE handler
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 && Math.abs(g.dy) < 20,
    onPanResponderRelease: (_, g) => {
      if (g.dx < -10) {
        clearSearchNavigationHighlight();
        setTabIndex(i => Math.min(i + 1, TABS.length - 1));
      } else if (g.dx > 10) {
        clearSearchNavigationHighlight();
        setTabIndex(i => Math.max(i - 1, 0));
      }
    },
  })).current;

  const isGuest = currentUser?.role === 'guest';
  const isAdmin = currentUser?.role === 'admin';
  const canApprove = !isSeller && !isGuest && (isAdmin || (!!currentUser?.username && !!approvalRights[lockKey(currentUser.username)]));
  const myLockKey = currentUser?.username ? lockKey(currentUser.username) : null;
  const isForeman = myLockKey === 'USER14';
  const amLocked = !!(myLockKey && currentUser?.role === 'user' && lockedUsers[myLockKey]);
  const GUEST_TABS = ['customMoni', 'customDipli'];
  const SELLER_TABS = ['customNew', 'customQuotes', 'customMoni', 'customDipli'];
  // Δικαιώματα καρτελών — ισχύουν μόνο για κανονικούς χρήστες (όχι admin/guest/seller).
  const myTabRights = (currentUser?.role === 'user' && !isSeller && myLockKey) ? (tabRights[myLockKey] || {}) : {};
  const tabHidden = (tab) => (isForeman && (tab === 'customNew' || tab === 'customQuotes')) || !!(myTabRights.hide && myTabRights.hide[tab]);
  const tabReadonly = (tab) => !!(myTabRights.readonly && myTabRights.readonly[tab]);
  const allowedNavTabs = NAV_TABS.filter(t => !tabHidden(t));
  // Ο guest βλέπει μόνο ΜΟΝΗ/ΔΙΠΛΗ — αν βρεθεί αλλού, τον γυρνάμε στη ΜΟΝΗ.
  useEffect(() => {
    if (isGuest && !GUEST_TABS.includes(TABS[tabIndex])) setTabIndex(TABS.indexOf('customMoni'));
  }, [isGuest, tabIndex]);
  // Ο πωλητής βλέπει μόνο ΚΑΤΑΧΩΡΗΣΗ/ΜΟΝΗ/ΔΙΠΛΗ.
  useEffect(() => {
    if (isSeller && !SELLER_TABS.includes(TABS[tabIndex])) setTabIndex(TABS.indexOf('customMoni'));
  }, [isSeller, tabIndex]);
  // Κανονικός χρήστης σε κρυμμένη καρτέλα → πρώτη επιτρεπτή.
  useEffect(() => {
    if (currentUser?.role !== 'user' || isSeller) return;
    if (tabHidden(TABS[tabIndex])) setTabIndex(TABS.indexOf(allowedNavTabs[0] || 'customMoni'));
  }, [tabRights, tabIndex, isSeller, currentUser]);

  // Αυτόματο κλείδωμα: μόλις φύγεις από την ξεκλείδωτη καρτέλα, ξανακλειδώνει.
  useEffect(() => {
    if (unlockedTab && TABS[tabIndex] !== unlockedTab) setUnlockedTab(null);
  }, [tabIndex, unlockedTab]);

  if (Platform.OS === 'web' && !isLoggedIn && !pendingLogin)
    return <LoginScreen onSuccess={(userInfo) => {
      if (userInfo && userInfo._password) {
        setPendingLogin(userInfo);
      } else if (userInfo) {
        pendingUserInfoRef.current = userInfo;
        saveSavedUser(userInfo);
      }
    }} />;

  // PROD: user/seller περιμένει 2FA (δεν έχει μπει στη Firebase ακόμα)
  if (Platform.OS === 'web' && pendingLogin)
    return <TwoFactorScreen user={pendingLogin}
      onSuccess={async (r) => {
        if (r && r.customToken) {
          const ui = { username: pendingLogin.username, role: r.role || pendingLogin.role, email: r.email || pendingLogin.email };
          pendingUserInfoRef.current = ui;
          saveSavedUser(ui);
          rememberLogin();
          markTwofa(ui);
          await fbSignInWithToken(r.customToken);
        } else {
          markTwofa(pendingLogin);
          setTwofaPassed(true);
        }
        setPendingLogin(null);
      }}
      onLogout={() => { setPendingLogin(null); }} />;

  // DEV: client-side 2FA (Firebase Auth ήδη έγινε)
  if (IS_DEV && Platform.OS === 'web' && isLoggedIn && currentUser && needsTwoFactor(currentUser) && !twofaPassed)
    return <TwoFactorScreen user={currentUser}
      onSuccess={(r) => { markTwofa(currentUser); setTwofaPassed(true); }}
      onLogout={() => { clearTwofa(); forgetLogin(); if (USE_FIREBASE_AUTH) { void fbSignOutUser(); } setIsLoggedIn(false); setTwofaPassed(false); }} />;

  if (amLocked) return <LockedScreen name={userLabels[myLockKey] || currentUser.username} onLogout={() => { clearTwofa(); setTwofaPassed(false); forgetLogin(); if (USE_FIREBASE_AUTH) { void fbSignOutUser(); } setAdminUnlocked(false); setAdminPanelOpen(false); setIsLoggedIn(false); }} />;

  if (loading) return (
    <View style={styles.loading}>
      <View style={styles.loadingCard}>
        <Text style={styles.loadingLogo}>VAICON</Text>
        <View style={styles.loadingDivider} />
        <ActivityIndicator size="large" color="#E53935" style={{ marginBottom: 14 }} />
        <Text style={styles.loadingText}>Σύνδεση με το Cloud...</Text>
      </View>
    </View>
  );

  const view = (isGuest && !GUEST_TABS.includes(TABS[tabIndex])) || (isSeller && !SELLER_TABS.includes(TABS[tabIndex])) || (currentUser?.role === 'user' && !isSeller && tabHidden(TABS[tabIndex])) ? (allowedNavTabs[0] || 'customMoni') : TABS[tabIndex];
  const navTabs = isGuest ? GUEST_TABS : isSeller ? SELLER_TABS : allowedNavTabs;

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5', position: 'relative' }}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" translucent={false} />

      {/* ═══ TOP BAR — οριζόντια πάνω ═══ */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>VAICON</Text>
        <Text style={styles.topBarVersion}>{APP_VERSION}</Text>
        {currentUser?.username ? (
          <View style={{ backgroundColor: '#8B0000', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3, marginLeft: 8, marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
            <Text style={{ color: 'white', fontSize: 13, fontWeight: 'bold' }}>
              👤 {userLabels[lockKey(currentUser.username)] || currentUser.username}
            </Text>
          </View>
        ) : null}
        <Text style={styles.topBarSub}>Σύστημα Διαχείρισης Τυποποιημένων Παραγγελιών</Text>
        {currentUser?.role === 'user' && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 8 }}
            onPress={openInbox}>
            <Text style={{ fontSize: 18 }}>✉️</Text>
            <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 }}>ΜΗΝΥΜΑΤΑ</Text>
          </TouchableOpacity>
        )}
        {currentUser?.role === 'admin' && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 8 }}
            onPress={() => setShowMessages(true)}>
            <Text style={{ fontSize: 18 }}>✉️</Text>
            <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 }}>ΜΗΝΥΜΑΤΑ</Text>
          </TouchableOpacity>
        )}
        {canApprove && pendingApprovalCount > 0 && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ff9800', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 8 }}
            onPress={() => setShowApprovals(true)}>
            <Text style={{ fontSize: 16 }}>🔔</Text>
            <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>ΠΡΟΣ ΕΓΚΡΙΣΗ ({pendingApprovalCount})</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.topBarMenu} onPress={() => setMenuOpen(true)}>
          <Text style={styles.topBarMenuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>

        {/* ═══ SIDEBAR — κάθετη αριστερά ═══ */}
        <View style={styles.sidebar}>
          {/* TAB BUTTONS */}
          <View style={{ flex: 1 }}>
            {navTabs.map((tab) => {
              const isActive = TABS[tabIndex] === tab;
              const lockable = !isGuest && !isSeller && !tabReadonly(tab) && ['customMoni','customDipli','sasi','cases'].includes(tab);
              const unlocked = unlockedTab === tab;
              return (
                <View key={tab} style={{ flexDirection:'row', alignItems:'stretch' }}>
                  <TouchableOpacity
                    style={[styles.sidebarBtn, { flex:1 }, isActive && styles.sidebarBtnActive]}
                    onPress={() => {
                      clearSearchNavigationHighlight();
                      setTabIndex(TABS.indexOf(tab));
                    }}>
                    <Text style={styles.sidebarIcon}>{TAB_ICONS[tab]}</Text>
                    <Text style={[styles.sidebarLabel, isActive && styles.sidebarLabelActive]}>
                      {TAB_LABELS[tab]}
                    </Text>
                  </TouchableOpacity>
                  {lockable && (
                    <TouchableOpacity
                      style={[styles.sidebarLockBtn, unlocked && styles.sidebarLockBtnOpen]}
                      onPress={() => {
                        clearSearchNavigationHighlight();
                        setTabIndex(TABS.indexOf(tab));
                        setUnlockedTab(u => u === tab ? null : tab);
                      }}>
                      <Text style={styles.sidebarLockIcon}>{unlocked ? '🔓' : '🔒'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {isSeller && (
              <TouchableOpacity
                style={[styles.sidebarBtn, { marginTop: 28, backgroundColor: '#0d47a1', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }]}
                onPress={() => setShowSellerSubs(true)}>
                <Text style={styles.sidebarIcon}>📤</Text>
                <Text style={[styles.sidebarLabel, { color: 'white' }]}>ΟΙ ΥΠΟΒΟΛΕΣ{'\n'}ΜΟΥ</Text>
              </TouchableOpacity>
            )}
            {!isGuest && !isSeller && !tabHidden('deliveries') && <TouchableOpacity
              style={[styles.sidebarBtn, TABS[tabIndex] === 'deliveries' && styles.sidebarBtnActive]}
              onPress={() => {
                clearSearchNavigationHighlight();
                setTabIndex(TABS.indexOf('deliveries'));
              }}>
              <Text style={styles.sidebarIcon}>📅</Text>
              <View style={styles.sidebarParadoseisLabelRow}>
                <Text
                  style={[
                    styles.sidebarLabel,
                    styles.sidebarLabelParadoseis,
                    TABS[tabIndex] === 'deliveries' && styles.sidebarLabelActive,
                  ]}
                >
                  ΠΑΡΑΔΟΣΕΙΣ
                </Text>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.paradoseisLedDot, { opacity: paradoseisLedOpacity }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              </View>
            </TouchableOpacity>}
          </View>
          {!isGuest && !isSeller && (<>
          <View style={styles.sidebarDivider} />
          {/* ΦΙΛΤΡΟ ΠΩΛΗΤΗ — δείχνει μόνο τα δικά του */}
          <View style={{ zIndex: 30 }}>
            <TouchableOpacity
              onPress={() => setSellerFilterOpen(o => !o)}
              style={[styles.sidebarLookupBtn, sellerFilter && styles.sidebarLookupBtnActive]}>
              <Text style={styles.sidebarLookupBtnText} numberOfLines={1}>
                {sellerFilter ? `🧑‍💼 ${userLabels[sellerFilter] || (SELLERS.find(s => lockKey(s) === sellerFilter) || sellerFilter)}` : '🧑‍💼 ΠΩΛΗΤΗΣ'}
              </Text>
            </TouchableOpacity>
            {sellerFilterOpen && (
              <View style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#1565C0', marginHorizontal: 10, marginBottom: 6, overflow: 'hidden' }}>
                <TouchableOpacity onPress={() => { setSellerFilter(''); setSellerFilterOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <Text style={{ color: '#555', fontWeight: 'bold', fontSize: 14 }}>— Όλοι</Text>
                </TouchableOpacity>
                {SELLERS.map(s => { const k = lockKey(s); return (
                  <TouchableOpacity key={k} onPress={() => { setSellerFilter(k); setSellerFilterOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: sellerFilter === k ? '#e3f2fd' : '#fff' }}>
                    <Text style={{ color: '#1a1a1a', fontWeight: 'bold', fontSize: 14 }}>{userLabels[k] || s}</Text>
                  </TouchableOpacity>
                ); })}
              </View>
            )}
          </View>
          <TouchableOpacity
            style={[styles.sidebarLookupBtn, showCustomerLookup && styles.sidebarLookupBtnActive]}
            onPress={() => {
              if (!['customNew','customQuotes','customMoni','customDipli'].includes(TABS[tabIndex])) setTabIndex(TABS.indexOf('customMoni'));
              setShowCustomerLookup(v => !v);
            }}>
            <Text style={styles.sidebarLookupBtnText}>🔍 ΠΕΛΑΤΕΣ</Text>
          </TouchableOpacity>
          <View style={styles.sidebarSearchRow}>
            <TextInput
              style={[styles.sidebarSearchInput, styles.sidebarSearchInputOrderName]}
              placeholder="Αρ. παρ. · όνομα"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={paradoseisSearchOrderName}
              onChangeText={setParadoseisSearchOrderName}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.sidebarSearchInputWide}
              placeholder="Λοιπά πεδία (1)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={paradoseisSearchOther}
              onChangeText={setParadoseisSearchOther}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.sidebarSearchRow}>
            <TextInput
              style={[styles.sidebarSearchInputWide, { flex: 1 }]}
              placeholder="Λοιπά πεδία (2)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={paradoseisSearchOther2}
              onChangeText={setParadoseisSearchOther2}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.sidebarSearchInputWide, { flex: 1 }]}
              placeholder="Λοιπά πεδία (3)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={paradoseisSearchOther3}
              onChangeText={setParadoseisSearchOther3}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.sidebarSearchActionsRow}>
            <TouchableOpacity
              style={[
                styles.sidebarSearchLogicBtn,
                paradoseisSearchLogic === 'OR' && styles.sidebarSearchLogicBtnOr,
              ]}
              onPress={() =>
                setParadoseisSearchLogic((v) => (v === 'AND' ? 'OR' : 'AND'))
              }
              activeOpacity={0.75}
              accessibilityLabel="Εναλλαγή λογικής λοιπών πεδίων (AND/OR)"
            >
              <Text style={styles.sidebarSearchLogicBtnText}>{paradoseisSearchLogic}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sidebarSearchRun} onPress={runGlobalSidebarSearch} activeOpacity={0.75}>
              <Text style={styles.sidebarSearchRunText}>🔍 Αναζήτηση</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sidebarSearchClear}
              onPress={clearAllSidebarSearchFilters}
              activeOpacity={0.75}
              accessibilityLabel="Καθαρισμός φίλτρων αναζήτησης"
            >
              <Text style={styles.sidebarSearchClearText}>✕</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.sidebarSearchStaveraBtn}
            onPress={runStaveraSidebarSearch}
            activeOpacity={0.75}
            accessibilityLabel="Αναζήτηση παραγγελιών με σταθερά"
          >
            <Text style={styles.sidebarSearchStaveraBtnText}>📐 Σταθερά</Text>
          </TouchableOpacity>
          </>)}
        </View>

        {/* ═══ ΚΥΡΙΟ ΠΕΡΙΕΧΟΜΕΝΟ δεξιά ═══ */}
        <View style={{ flex: 1 }} {...panResponder.panHandlers}>
          <View style={{ flex: 1, display: (view === 'customMoni' || view === 'customDipli' || view === 'customNew' || view === 'customQuotes') ? 'flex' : 'none' }}>
            <CustomScreen isForeman={isForeman} quotes={quotes} setQuotes={setQuotes} quotesOnly={view === 'customQuotes'} customOrders={customOrders} setCustomOrders={setCustomOrders} soldOrders={soldOrders} setSoldOrders={setSoldOrders} customers={customers} onRequestAddCustomer={(name, cb)=>{ setPendingCustomer(name); setPendingCustomerCallback(()=>cb); setShowCustomers(true); }} sasiStock={sasiStock} setSasiStock={setSasiStock} caseStock={caseStock} setCaseStock={setCaseStock} sasiOrders={sasiOrders} setSasiOrders={setSasiOrders} caseOrders={caseOrders} setCaseOrders={setCaseOrders} coatings={coatings} dipliSasiStock={dipliSasiStock} setDipliSasiStock={setDipliSasiStock} locks={locks} cylinders={cylinders} misc={misc} isGuest={isGuest || (view !== 'customNew' && unlockedTab !== view)} locked={!isGuest && view !== 'customNew' && unlockedTab !== view} formOnly={view === 'customNew'} forcedTab={view === 'customMoni' ? 'ΜΟΝΗ' : view === 'customDipli' ? 'ΔΙΠΛΗ' : null} setTabIndex={setTabIndex} highlightOrderId={globalSearchHighlightOrderId} onClearSearchHighlight={clearSearchNavigationHighlight} currentUserName={currentUser?.username ? (userLabels[lockKey(currentUser.username)] || currentUser.username) : ''} isAdmin={isAdmin} resolveName={(u) => userLabels[lockKey(u)] || u} showCustomerLookup={showCustomerLookup} setShowCustomerLookup={setShowCustomerLookup} isSeller={isSeller} sellerKey={sellerKey} filterSellerKey={sellerFilter || null} editSubmission={editSubmission} onEditSubmissionDone={() => setEditSubmission(null)} />
          </View>
          {view === 'sasi'   && <SasiScreen sasiStock={sasiStock} setSasiStock={setSasiStock} opsBasket={sasiOps} setOpsBasket={setSasiOps} stockHighlight={globalSearchStockMeta} onClearSearchHighlight={clearSearchNavigationHighlight} locked={isGuest || unlockedTab !== 'sasi'} isAdmin={isAdmin} isForeman={isForeman} customOrders={customOrders} />}
          {view === 'cases'  && <CaseScreen caseStock={caseStock} setCaseStock={setCaseStock} opsBasket={caseOps} setOpsBasket={setCaseOps} stockHighlight={globalSearchStockMeta} onClearSearchHighlight={clearSearchNavigationHighlight} locked={isGuest || unlockedTab !== 'cases'} isAdmin={isAdmin} isForeman={isForeman} customOrders={customOrders} />}
          {view === 'deliveries' && <ParadoseisScreen customOrders={customOrders} highlightOrderId={globalSearchHighlightOrderId} onClearSearchHighlight={clearSearchNavigationHighlight} />}
          {view === 'stats'  && <StatsScreen customOrders={customOrders} soldOrders={soldOrders} setSoldOrders={setSoldOrders} sasiOrders={sasiOrders} soldSasiOrders={soldSasiOrders} FIREBASE_URL={FIREBASE_URL} onClearSearchHighlight={clearSearchNavigationHighlight} />}
        </View>
      </View>

        {/* HAMBURGER MENU */}
        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuPanel}>
              <ScrollView showsVerticalScrollIndicator={false}>
              {!isGuest && !isSeller && !isForeman && (<>
              <View style={styles.menuGroup}>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCustomers(true); }}>
                <Text style={styles.menuItemText}>👥 ΠΕΛΑΤΕΣ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCoatings(true); }}>
                <Text style={styles.menuItemText}>🎨 ΕΠΕΝΔΥΣΕΙΣ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowLocks(true); }}>
                <Text style={styles.menuItemText}>🔒 ΚΛΕΙΔΑΡΙΕΣ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCylinders(true); }}>
                <Text style={styles.menuItemText}>🗝️ ΑΦΑΛΟΙ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowMisc(true); }}>
                <Text style={styles.menuItemText}>📦 ΔΙΑΦΟΡΑ</Text>
              </TouchableOpacity>
              {currentUser?.role === 'admin' && (
                <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#eef4ff' }]} onPress={() => { setMenuOpen(false); setShowPriceCatalog(true); }}>
                  <Text style={[styles.menuItemText, { color: '#1565C0' }]}>💶 ΤΙΜΟΚΑΤΑΛΟΓΟΣ</Text>
                </TouchableOpacity>
              )}
              </View>
              <View style={styles.menuGroup}>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowActivity(true); }}>
                <Text style={styles.menuItemText}>📜 ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowApprovalHistory(true); }}>
                <Text style={styles.menuItemText}>📋 ΙΣΤΟΡΙΚΟ ΕΓΚΡΙΣΕΩΝ</Text>
              </TouchableOpacity>
              </View>
              </>)}
              {currentUser?.role === 'admin' && (
                <View style={styles.menuGroup}>
                <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#eef4ff' }]} onPress={() => { setMenuOpen(false); setShowSellerLog(true); }}>
                  <Text style={[styles.menuItemText, { color: '#1565C0' }]}>📒 ΑΝΑΘΕΣΕΙΣ ΠΩΛΗΤΩΝ</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#eef4ff' }]} onPress={() => { setMenuOpen(false); setShowApprovalRights(true); }}>
                  <Text style={[styles.menuItemText, { color: '#1565C0' }]}>✅ ΕΓΚΡΙΣΕΙΣ ΠΑΡΑΓΓΕΛΙΩΝ</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff4e6' }]} onPress={() => { setMenuOpen(false); stampSellersOnOldOrders(); }}>
                  <Text style={[styles.menuItemText, { color: '#E65100' }]}>🏷 ΣΦΡΑΓΙΔΑ ΠΩΛΗΤΗ (μία φορά)</Text>
                </TouchableOpacity>
                </View>
              )}
              {currentUser?.role === 'admin' && (
                <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff4e6' }]} onPress={openAdmin}>
                  <Text style={[styles.menuItemText, { color: '#E65100' }]}>🛡️ ΔΙΑΧΕΙΡΙΣΤΗΣ</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.menuItem} onPress={async () => { setMenuOpen(false); await fetchData(); Alert.alert("VAICON", "Τα δεδομένα ανανεώθηκαν!"); }}>
                <Text style={styles.menuItemText}>🔄 ΑΝΑΝΕΩΣΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff0f0', marginTop: 12 }]} onPress={() => {
                setMenuOpen(false);
                const doLogout = () => {
                  clearTwofa(); setTwofaPassed(false);
                  forgetLogin();
                  if (USE_FIREBASE_AUTH) { void fbSignOutUser(); }
                  setAdminUnlocked(false); setAdminPanelOpen(false);
                  setIsLoggedIn(false);
                };
                if (Platform.OS === 'web') {
                  if (window.confirm('Θέλεις να αποσυνδεθείς;\n\nΤην επόμενη φορά θα ζητηθεί ξανά κωδικός σε αυτόν τον υπολογιστή.')) doLogout();
                } else {
                  Alert.alert("Αποσύνδεση", "Θέλεις να αποσυνδεθείς;\n\nΤην επόμενη φορά θα ζητηθεί ξανά κωδικός.", [
                    { text: "ΑΚΥΡΟ", style: "cancel" },
                    { text: "ΑΠΟΣΥΝΔΕΣΗ", style: "destructive", onPress: doLogout }
                  ]);
                }
              }}>
                <Text style={[styles.menuItemText, { color: '#8B0000' }]}>🔐 ΑΠΟΣΥΝΔΕΣΗ</Text>
              </TouchableOpacity>
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ */}
        <Modal visible={showActivity} animationType="slide" onRequestClose={() => setShowActivity(false)}>
          <ActivityScreen
            visible={showActivity}
            refreshKey={activityRefreshKey}
            onClose={() => setShowActivity(false)}
          />
        </Modal>

        {/* ΑΝΑΘΕΣΕΙΣ ΠΩΛΗΤΩΝ — μόνο διαχειριστής */}
        <Modal visible={showSellerLog} animationType="slide" onRequestClose={() => setShowSellerLog(false)}>
          <SellerLogScreen
            onClose={() => setShowSellerLog(false)}
            resolveLabel={(k) => userLabels[k] || (SELLERS.find(s => lockKey(s) === k) || k)}
          />
        </Modal>

        {/* ΠΡΟΣ ΕΓΚΡΙΣΗ — όσοι έχουν δικαίωμα */}
        <Modal visible={showApprovals} animationType="slide" onRequestClose={() => setShowApprovals(false)}>
          <ApprovalScreen
            onClose={() => setShowApprovals(false)}
            currentUserName={currentUser?.username ? (userLabels[lockKey(currentUser.username)] || currentUser.username) : ''}
            resolveLabel={(k) => userLabels[k] || (SELLERS.find(s => lockKey(s) === k) || k)}
            coatings={coatings}
            customers={customers}
            onOpenSubmission={(sub) => { setShowApprovals(false); setTabIndex(TABS.indexOf('customNew')); setEditSubmission({ ...sub, _approve: true }); }}
          />
        </Modal>

        {/* ΙΣΤΟΡΙΚΟ ΕΓΚΡΙΣΕΩΝ */}
        <Modal visible={showApprovalHistory} animationType="slide" onRequestClose={() => setShowApprovalHistory(false)}>
          <ApprovalHistoryScreen
            onClose={() => setShowApprovalHistory(false)}
            resolveLabel={(k) => userLabels[k] || (SELLERS.find(s => lockKey(s) === k) || k)}
          />
        </Modal>

        {/* ΟΙ ΥΠΟΒΟΛΕΣ ΜΟΥ — πωλητής */}
        <Modal visible={showSellerSubs} animationType="slide" onRequestClose={() => setShowSellerSubs(false)}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a1a2e', paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>📤 ΟΙ ΥΠΟΒΟΛΕΣ ΜΟΥ</Text>
              <TouchableOpacity onPress={() => setShowSellerSubs(false)}><Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>✕</Text></TouchableOpacity>
            </View>
            <SellerSubmissionsScreen sellerKey={sellerKey} coatings={coatings} onEditSubmission={(sub) => { setShowSellerSubs(false); setTabIndex(TABS.indexOf('customNew')); setEditSubmission(sub); }} />
          </View>
        </Modal>

        {/* ΔΙΚΑΙΩΜΑΤΑ ΕΓΚΡΙΣΗΣ — admin */}
        <Modal visible={showApprovalRights} transparent animationType="fade" onRequestClose={() => setShowApprovalRights(false)}>
          <View style={statsAuthStyles.overlay}>
            <View style={[statsAuthStyles.box, { maxWidth: 460 }]}>
              <Text style={[statsAuthStyles.title, { color: '#1565C0' }]}>✅ Δικαιώματα Έγκρισης</Text>
              <Text style={statsAuthStyles.subtitle}>Τσέκαρε ποιοι χρήστες μπορούν να εγκρίνουν παραγγελίες πωλητών. (Ο διαχειριστής εγκρίνει πάντα.)</Text>
              {APP_USERS.filter(u => u !== 'GUEST' && u !== 'ADMIN' && !SELLERS.includes(u)).map((u) => {
                const k = lockKey(u);
                const on = !!approvalRights[k];
                return (
                  <TouchableOpacity key={k} style={adminStyles.row} onPress={async () => {
                    const next = !on;
                    setApprovalRights(prev => ({ ...prev, [k]: next }));
                    try {
                      const res = await fetch(`${FIREBASE_URL}/approval_rights/${k}.json`, next ? { method: 'PUT', body: 'true' } : { method: 'DELETE' });
                      if (!res.ok) throw new Error();
                    } catch {
                      setApprovalRights(prev => ({ ...prev, [k]: on }));
                      Alert.alert('Σφάλμα', 'Η αλλαγή δεν αποθηκεύτηκε. Δοκίμασε ξανά.');
                    }
                  }}>
                    <Text style={[adminStyles.name, { width: 120 }]}>{userLabels[k] || u}</Text>
                    <View style={{ marginLeft: 'auto', width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: on ? '#1565C0' : '#bbb', backgroundColor: on ? '#1565C0' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#1565C0', marginTop: 14 }]} onPress={() => setShowApprovalRights(false)}>
                <Text style={statsAuthStyles.btnTxt}>ΕΝΤΑΞΕΙ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ΕΠΕΝΔΥΣΕΙΣ SCREEN */}
        <Modal visible={showCoatings} animationType="slide" onRequestClose={() => setShowCoatings(false)}>
          <CoatingsScreen
            coatings={coatings}
            setCoatings={setCoatings}
            isAdmin={isAdmin}
            onClose={() => setShowCoatings(false)}
          />
        </Modal>

        <Modal visible={showPriceCatalog} animationType="slide" onRequestClose={() => setShowPriceCatalog(false)}>
          <PriceCatalogScreen coatings={coatings} locks={locks} onClose={() => setShowPriceCatalog(false)} />
        </Modal>
        <Modal visible={showLocks} animationType="slide" onRequestClose={() => setShowLocks(false)}>
          <LocksScreen locks={locks} setLocks={setLocks} onClose={() => setShowLocks(false)} />
        </Modal>
        <Modal visible={showCylinders} animationType="slide" onRequestClose={() => setShowCylinders(false)}>
          <PricedListScreen title="ΑΦΑΛΟΙ" icon="🗝️" items={cylinders} setItems={setCylinders} fbNode="cylinders" placeholder="π.χ. ISEO R-50 με 5 κλειδιά..." onClose={() => setShowCylinders(false)} />
        </Modal>
        <Modal visible={showMisc} animationType="slide" onRequestClose={() => setShowMisc(false)}>
          <PricedListScreen title="ΔΙΑΦΟΡΑ" icon="📦" items={misc} setItems={setMisc} fbNode="misc" placeholder="π.χ. 3ος μεντεσές, μόνωση φελιζόλ..." showFlags isAdmin={isAdmin} onClose={() => setShowMisc(false)} />
        </Modal>

        {/* ΠΕΛΑΤΕΣ SCREEN */}
        <Modal visible={showCustomers} animationType="slide" onRequestClose={() => setShowCustomers(false)}>
          <CustomersScreen
            customers={customers}
            setCustomers={setCustomers}
            isAdmin={isAdmin}
            allOrders={[...customOrders, ...soldOrders]}
            setCustomOrders={setCustomOrders}
            setSoldOrders={setSoldOrders}
            onClose={() => { setShowCustomers(false); setPendingCustomer(null); setPendingCustomerCallback(null); }}
            prefillName={pendingCustomer}
            onCustomerAdded={(newCustomer) => {
              setShowCustomers(false);
              setPendingCustomer(null);
              if (pendingCustomerCallback) { pendingCustomerCallback(newCustomer); setPendingCustomerCallback(null); }
            }}
            sellers={SELLERS}
            currentUserName={currentUser?.username ? (userLabels[lockKey(currentUser.username)] || currentUser.username) : ''}
            resolveLabel={(k) => userLabels[k] || (SELLERS.find(s => lockKey(s) === k) || k)}
          />
        </Modal>

        {/* ΜΗΝΥΜΑΤΑ — οθόνη admin (αποστολή/αρχείο) */}
        <Modal visible={showMessages} animationType="slide" onRequestClose={() => setShowMessages(false)}>
          <MessagesScreen
            users={APP_USERS.filter(u => u !== 'GUEST' && u !== 'ADMIN')}
            userLabels={userLabels}
            lockKey={lockKey}
            onClose={() => setShowMessages(false)}
          />
        </Modal>

        {/* ΔΙΑΧΕΙΡΙΣΤΗΣ — κωδικός πρόσβασης (owner code) */}
        <Modal visible={adminAuthOpen} transparent animationType="fade" onRequestClose={() => setAdminAuthOpen(false)}>
          <View style={statsAuthStyles.overlay}>
            <View style={statsAuthStyles.box}>
              <Text style={[statsAuthStyles.title, { color: '#E65100' }]}>🛡️ Διαχειριστής</Text>
              <Text style={statsAuthStyles.subtitle}>Δώσε τον κωδικό διαχειριστή</Text>
              <PwdInput value={adminAuthPwd} onChangeText={setAdminAuthPwd} error={adminAuthError} onSubmit={tryOpenAdmin} />
              {adminAuthError && <Text style={statsAuthStyles.errorTxt}>❌ Λάθος κωδικός</Text>}
              <View style={statsAuthStyles.btnRow}>
                <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666' }]} onPress={() => { setAdminAuthOpen(false); setAdminAuthPwd(''); }}>
                  <Text style={statsAuthStyles.btnTxt}>ΑΚΥΡΟ</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#E65100' }]} onPress={tryOpenAdmin}>
                  <Text style={statsAuthStyles.btnTxt}>ΕΙΣΟΔΟΣ</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* 2FA PENDING — popup για τον admin */}
        {currentUser?.role === 'admin' && Object.keys(twofaPending).length > 0 && (
          <View style={{ position: 'absolute', bottom: 80, right: 16, zIndex: 9999, maxWidth: 300 }}>
            {Object.entries(twofaPending).map(([ukey, rec]) => {
              if (!rec) return null;
              const secs = Math.max(0, Math.floor(((rec.exp || 0) - Date.now()) / 1000));
              if (secs <= 0) return null;
              const tm = String(Math.floor(secs / 60)).padStart(2, '0');
              const ts = String(secs % 60).padStart(2, '0');
              return (
                <View key={ukey} style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 2, borderColor: '#ffb300', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 10 }}>
                  <Text style={{ color: '#ffb300', fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>🔐 ΑΙΤΗΜΑ ΕΙΣΟΔΟΥ</Text>
                  <Text style={{ color: '#fff', fontSize: 13, marginBottom: 6 }}>{decodeURIComponent(ukey)} ζητά είσοδο</Text>
                  <Text style={{ color: '#ffb300', fontSize: 30, fontWeight: 'bold', letterSpacing: 8, textAlign: 'center' }}>{rec.code}</Text>
                  <Text style={{ color: secs < 60 ? '#ff7043' : '#81c784', fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginTop: 6 }}>⏱ {tm}:{ts}</Text>
                  <Text style={{ color: '#aaa', fontSize: 10, textAlign: 'center', marginTop: 2 }}>Πείτε τον κωδικό στον χρήστη</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ΔΙΑΧΕΙΡΙΣΤΗΣ — πάνελ */}
        <Modal visible={adminPanelOpen} transparent animationType="fade" onRequestClose={() => setAdminPanelOpen(false)}>
          <View style={statsAuthStyles.overlay}>
            <View style={[statsAuthStyles.box, { maxWidth: 460 }]}>
              <Text style={[statsAuthStyles.title, { color: '#E65100' }]}>🛡️ Κλείδωμα Χρηστών</Text>
              <Text style={statsAuthStyles.subtitle}>Πάτησε για να κλειδώσεις/ξεκλειδώσεις. Ισχύει αμέσως.</Text>
              {APP_USERS.filter(u => u !== 'GUEST' && u !== 'ADMIN').map((u) => {
                const k = lockKey(u);
                const isLocked = !!(lockedUsers && lockedUsers[k]);
                return (
                  <View key={k} style={adminStyles.row}>
                    <Text style={adminStyles.name}>{u}</Text>
                    <TextInput
                      style={adminStyles.labelInput}
                      placeholder="Όνομα..."
                      placeholderTextColor="#aaa"
                      value={labelDrafts[k] || ''}
                      onChangeText={(t) => setLabelDrafts(d => ({ ...d, [k]: t }))}
                      onBlur={() => saveLabel(k, labelDrafts[k])}
                      onSubmitEditing={() => saveLabel(k, labelDrafts[k])}
                      maxLength={20}
                    />
                    <Text style={[adminStyles.badge, isLocked ? adminStyles.badgeLocked : adminStyles.badgeOpen]}>{isLocked ? '🔒' : '🔓'}</Text>
                    <TouchableOpacity style={[adminStyles.toggle, { backgroundColor: isLocked ? '#2e7d32' : '#E65100' }]} onPress={() => writeLock(k, !isLocked)}>
                      <Text style={adminStyles.toggleTxt}>{isLocked ? 'Ξεκλείδωσε' : 'Κλείδωσε'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              <View style={[statsAuthStyles.btnRow, { marginTop: 14 }]}>
                <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#E65100' }]} onPress={lockAllUsers}>
                  <Text style={statsAuthStyles.btnTxt}>🔒 ΚΛΕΙΔΩΜΑ ΟΛΩΝ</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#2e7d32' }]} onPress={unlockAllUsers}>
                  <Text style={statsAuthStyles.btnTxt}>🔓 ΞΕΚΛΕΙΔΩΜΑ ΟΛΩΝ</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 1, backgroundColor: '#eee', marginTop: 14, marginBottom: 10 }} />
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#6a1b9a' }]} onPress={() => { setAdminPanelOpen(false); setTabRightsProg('std'); setTabRightsUser(null); setShowTabRights(true); }}>
                <Text style={statsAuthStyles.btnTxt}>🔑 ΔΙΚΑΙΩΜΑΤΑ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#1976d2', marginTop: 8 }]} onPress={() => { setAdminPanelOpen(false); setTabIndex(TABS.indexOf('stats')); }}>
                <Text style={statsAuthStyles.btnTxt}>📊 ΣΤΑΤΙΣΤΙΚΑ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#2e7d32', marginTop: 8 }]} onPress={() => { setAdminPanelOpen(false); doBackup(); }}>
                <Text style={statsAuthStyles.btnTxt}>💾 BACKUP</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#E65100', marginTop: 8 }]} onPress={() => { setAdminPanelOpen(false); openRestoreFilePicker(); }}>
                <Text style={statsAuthStyles.btnTxt}>♻️ ΕΠΑΝΑΦΟΡΑ</Text>
              </TouchableOpacity>
              <View style={{ height: 1, backgroundColor: '#eee', marginTop: 14, marginBottom: 10 }} />
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#8B0000' }]} onPress={() => { setAdminUnlocked(false); setAdminPanelOpen(false); }}>
                <Text style={statsAuthStyles.btnTxt}>🔐 ΚΛΕΙΔΩΜΑ ΠΡΟΣΒΑΣΗΣ (απαιτεί κωδικό ξανά)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666', marginTop: 10 }]} onPress={() => setAdminPanelOpen(false)}>
                <Text style={statsAuthStyles.btnTxt}>ΚΛΕΙΣΙΜΟ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ΔΙΚΑΙΩΜΑΤΑ ΧΡΗΣΤΩΝ — admin */}
        <Modal visible={showTabRights} transparent animationType="fade" onRequestClose={() => setShowTabRights(false)}>
          <View style={statsAuthStyles.overlay}>
            <View style={[statsAuthStyles.box, { maxWidth: 540 }]}>
              <Text style={[statsAuthStyles.title, { color: '#6a1b9a' }]}>🔑 Δικαιώματα Χρηστών</Text>
              <Text style={statsAuthStyles.subtitle}>👁 Βλέπει = εμφανίζεται η καρτέλα · ✏️ Επεξεργάζεται = μπορεί να την αλλάξει.</Text>
              <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 6 }}>
                {[{ key: 'std', label: 'Τυποποιημένες' }, { key: 'eid', label: 'Ειδικές' }, { key: 'inst', label: 'Τοποθετήσεις' }].map(prog => {
                  const open = tabRightsProg === prog.key;
                  return (
                    <View key={prog.key} style={{ marginBottom: 8, borderWidth: 1, borderColor: '#e0d4ee', borderRadius: 10, overflow: 'hidden' }}>
                      <TouchableOpacity onPress={() => { setTabRightsProg(open ? null : prog.key); setTabRightsUser(null); }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: open ? '#6a1b9a' : '#f3e9fb', paddingHorizontal: 14, paddingVertical: 12 }}>
                        <Text style={{ fontSize: 15, fontWeight: 'bold', color: open ? '#fff' : '#4a148c' }}>{prog.label}</Text>
                        <Text style={{ fontSize: 16, color: open ? '#fff' : '#4a148c' }}>{open ? '▾' : '▸'}</Text>
                      </TouchableOpacity>
                      {open && prog.key !== 'std' && (
                        <Text style={{ textAlign: 'center', color: '#999', padding: 16, fontStyle: 'italic' }}>Σύντομα</Text>
                      )}
                      {open && prog.key === 'std' && (
                        <View style={{ padding: 8 }}>
                          {APP_USERS.filter(u => u !== 'GUEST' && u !== 'ADMIN' && !SELLERS.includes(u)).map(u => {
                            const k = lockKey(u);
                            const uOpen = tabRightsUser === k;
                            const r = tabRights[k] || {};
                            const restricted = !!((r.hide && Object.keys(r.hide).length) || (r.readonly && Object.keys(r.readonly).length));
                            return (
                              <View key={k} style={{ marginBottom: 6, borderWidth: 1, borderColor: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                                <TouchableOpacity onPress={() => setTabRightsUser(uOpen ? null : k)}
                                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: uOpen ? '#ede7f6' : '#fafafa', paddingHorizontal: 12, paddingVertical: 10 }}>
                                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#333' }}>{userLabels[k] ? `${userLabels[k]} (${u})` : u}</Text>
                                  <Text style={{ fontSize: 12, color: restricted ? '#c62828' : '#2e7d32', fontWeight: 'bold' }}>{restricted ? 'Περιορισμένος' : 'Πλήρης'}</Text>
                                </TouchableOpacity>
                                {uOpen && (
                                  <View style={{ padding: 8 }}>
                                    <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6 }}>
                                      <View style={{ flex: 1 }} />
                                      <Text style={{ width: 70, textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#666' }}>👁</Text>
                                      <Text style={{ width: 70, textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#666' }}>✏️</Text>
                                    </View>
                                    {RIGHT_TABS.map(t => {
                                      const hidden = !!(r.hide && r.hide[t.key]);
                                      const readonly = !!(r.readonly && r.readonly[t.key]);
                                      return (
                                        <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: '#f3f3f3' }}>
                                          <Text style={{ flex: 1, fontSize: 13, color: '#333' }}>{t.label}</Text>
                                          <TouchableOpacity onPress={() => writeTabRight(k, 'hide', t.key, !hidden)} style={{ width: 70, alignItems: 'center' }}>
                                            <Text style={{ fontSize: 20 }}>{hidden ? '⬜' : '✅'}</Text>
                                          </TouchableOpacity>
                                          <View style={{ width: 70, alignItems: 'center' }}>
                                            {t.edit ? (
                                              <TouchableOpacity disabled={hidden} onPress={() => writeTabRight(k, 'readonly', t.key, !readonly)}>
                                                <Text style={{ fontSize: 20, opacity: hidden ? 0.25 : 1 }}>{(readonly || hidden) ? '⬜' : '✅'}</Text>
                                              </TouchableOpacity>
                                            ) : (
                                              <Text style={{ fontSize: 15, color: '#bbb' }}>—</Text>
                                            )}
                                          </View>
                                        </View>
                                      );
                                    })}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666', marginTop: 12 }]} onPress={() => { if (tabRightsUser) setTabRightsUser(null); else setShowTabRights(false); }}>
                <Text style={statsAuthStyles.btnTxt}>ΚΛΕΙΣΙΜΟ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* BACKUP — σε εξέλιξη */}
        <Modal visible={backupRunning} transparent animationType="fade">
          <View style={statsAuthStyles.overlay}>
            <View style={[statsAuthStyles.box, { alignItems: 'center' }]}>
              <ActivityIndicator size="large" color="#2e7d32" />
              <Text style={{ marginTop: 14, fontWeight: 'bold', color: '#2e7d32', fontSize: 15 }}>Δημιουργία αντιγράφου...</Text>
            </View>
          </View>
        </Modal>

        {/* BACKUP — επιτυχία */}
        <Modal visible={!!backupSuccess} transparent animationType="fade" onRequestClose={() => setBackupSuccess(null)}>
          <View style={statsAuthStyles.overlay}>
            <View style={statsAuthStyles.box}>
              <Text style={[statsAuthStyles.title, { color: '#2e7d32' }]}>✅ Backup Ολοκληρώθηκε</Text>
              <Text style={statsAuthStyles.subtitle}>Αποθηκεύτηκε στον υπολογιστή σου.{"\n"}Ημερομηνία: {backupSuccess}</Text>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#2e7d32', marginTop: 8 }]} onPress={() => setBackupSuccess(null)}>
                <Text style={statsAuthStyles.btnTxt}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ΕΠΑΝΑΦΟΡΑ — μη έγκυρο αρχείο */}
        <Modal visible={!!restoreFileError} transparent animationType="fade" onRequestClose={() => setRestoreFileError(null)}>
          <View style={statsAuthStyles.overlay}>
            <View style={statsAuthStyles.box}>
              <Text style={[statsAuthStyles.title, { color: '#8B0000' }]}>⚠️ Μη έγκυρο αρχείο</Text>
              <Text style={statsAuthStyles.subtitle}>{restoreFileError}</Text>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#8B0000', marginTop: 8 }]} onPress={() => setRestoreFileError(null)}>
                <Text style={statsAuthStyles.btnTxt}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ΕΠΑΝΑΦΟΡΑ — επιβεβαίωση */}
        <Modal visible={!!restorePayload} transparent animationType="fade" onRequestClose={() => { if (!restoreRunning) { setRestorePayload(null); setRestoreConfirmText(''); } }}>
          <View style={statsAuthStyles.overlay}>
            <View style={[statsAuthStyles.box, { maxWidth: 460 }]}>
              <Text style={[statsAuthStyles.title, { color: '#8B0000', fontSize: 20 }]}>⚠️ ΠΡΟΣΟΧΗ</Text>
              <View style={{ backgroundColor: '#fff0f0', borderLeftWidth: 4, borderLeftColor: '#8B0000', padding: 12, borderRadius: 6, marginBottom: 12 }}>
                <Text style={{ color: '#8B0000', fontWeight: 'bold', fontSize: 14, lineHeight: 20 }}>
                  Θα αντικατασταθούν ΟΛΑ τα τρέχοντα δεδομένα από το backup της:{"\n"}
                  <Text style={{ fontSize: 16 }}>{restorePayload?.createdAtStr || '—'}</Text>{"\n\n"}
                  Όλες οι αλλαγές μετά από αυτή την ημερομηνία θα χαθούν οριστικά.
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Πληκτρολόγησε <Text style={{ fontWeight: 'bold', color: '#8B0000' }}>ΕΠΑΝΑΦΟΡΑ</Text> για επιβεβαίωση:</Text>
              <TextInput
                style={[statsAuthStyles.input, { textAlign: 'left' }]}
                value={restoreConfirmText} onChangeText={setRestoreConfirmText}
                placeholder="ΕΠΑΝΑΦΟΡΑ" autoCapitalize="characters" editable={!restoreRunning}
              />
              <View style={statsAuthStyles.btnRow}>
                <TouchableOpacity disabled={restoreRunning} style={[statsAuthStyles.btn, { backgroundColor: '#666', opacity: restoreRunning ? 0.5 : 1 }]} onPress={() => { setRestorePayload(null); setRestoreConfirmText(''); }}>
                  <Text style={statsAuthStyles.btnTxt}>ΑΚΥΡΟ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={restoreRunning || restoreConfirmText.trim().toUpperCase() !== 'ΕΠΑΝΑΦΟΡΑ'}
                  style={[statsAuthStyles.btn, { backgroundColor: '#8B0000', opacity: (restoreRunning || restoreConfirmText.trim().toUpperCase() !== 'ΕΠΑΝΑΦΟΡΑ') ? 0.4 : 1 }]}
                  onPress={doRestore}
                >
                  <Text style={statsAuthStyles.btnTxt}>{restoreRunning ? 'ΕΠΑΝΑΦΟΡΑ...' : 'ΕΠΑΝΑΦΟΡΑ'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ΜΗΝΥΜΑΤΑ — inbox χρήστη */}
        <Modal visible={showInbox} transparent animationType="slide" onRequestClose={() => setShowInbox(false)}>
          <View style={msgStyles.overlay}>
            <View style={[msgStyles.box, { maxWidth: 560, maxHeight: '85%' }]}>
              <Text style={msgStyles.title}>📬 Τα μηνύματά μου</Text>
              {inbox.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#aaa', marginVertical: 30, fontSize: 15 }}>Δεν υπάρχουν μηνύματα.</Text>
              ) : (
                <ScrollView style={{ marginVertical: 12 }}>
                  {inbox.map(m => (
                    <TouchableOpacity key={m.id} onPress={() => setIncomingMsg(m)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: m.read ? '#f5f5f5' : '#bcd4ff', borderRadius: 10, padding: 14, marginBottom: 8, borderLeftWidth: 6, borderLeftColor: m.read ? '#bbb' : '#0d47a1' }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: m.read ? '#bbb' : '#0d47a1', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 15, fontWeight: '900', color: 'white' }}>{m._num}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={2} style={{ fontSize: 16, color: m.read ? '#222' : '#0d2c66', fontWeight: m.read ? '400' : '700', marginBottom: 6 }}>{m.text}</Text>
                        <Text style={{ fontSize: 13, color: m.read ? '#444' : '#0d47a1', fontWeight: '700' }}>
                          {m.ts ? new Date(m.ts).toLocaleString('el-GR') : ''}{m.read ? '  ·  ✓ διαβασμένο' : '  ·  ● νέο'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity style={msgStyles.btn} onPress={() => setShowInbox(false)}>
                <Text style={msgStyles.btnTxt}>ΚΛΕΙΣΙΜΟ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ΜΗΝΥΜΑΤΑ — αναγκαστική ανάγνωση (κλείνει ΜΟΝΟ με το κουμπί ΔΙΑΒΑΣΤΗΚΕ) */}
        <Modal visible={!!incomingMsg} transparent animationType="fade" onRequestClose={() => {}}>
          <View style={msgStyles.overlay}>
            <View style={[msgStyles.box, { maxWidth: 560, padding: 26 }, showInbox && { marginBottom: 70, marginLeft: 40 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {incomingMsg?._num ? (
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#0d47a1', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: 'white' }}>{incomingMsg._num}</Text>
                  </View>
                ) : null}
                <Text style={[msgStyles.title, { fontSize: 19, marginBottom: 0 }]}>Μήνυμα από τον Διαχειριστή</Text>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
                  <Text style={{ fontSize: 24 }}>✉️</Text>
                </View>
              </View>
              <ScrollView style={{ maxHeight: 380, marginVertical: 22 }}>
                <Text style={{ fontSize: 27, color: '#222', textAlign: 'center', lineHeight: 38 }}>{incomingMsg?.text}</Text>
              </ScrollView>
              <TouchableOpacity style={[msgStyles.btn, { backgroundColor: '#2e7d32', padding: 18 }]} onPress={dismissMsg}>
                <Text style={[msgStyles.btnTxt, { fontSize: 18 }]}>✓ ΔΙΑΒΑΣΤΗΚΕ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ΜΗΝΥΜΑΤΑ — υπενθύμιση νέων μηνυμάτων (επαναλαμβάνεται κάθε 5') */}
        <Modal visible={unreadPrompt > 0 && !incomingMsg} transparent animationType="fade" onRequestClose={() => { setUnreadPrompt(0); nextPromptAtRef.current = Date.now() + 5 * 60 * 1000; }}>
          <View style={msgStyles.overlay}>
            <View style={[msgStyles.box, { maxWidth: 420, padding: 28, alignItems: 'center' }]}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center', marginBottom: 12, elevation: 4 }}>
                <Text style={{ fontSize: 30 }}>✉️</Text>
              </View>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1565C0', textAlign: 'center' }}>
                {unreadPrompt === 1 ? 'Έχεις 1 νέο μήνυμα' : `Έχεις ${unreadPrompt} νέα μηνύματα`}
              </Text>
              <TouchableOpacity
                style={[msgStyles.btn, { padding: 16, alignSelf: 'stretch', marginTop: 20 }]}
                onPress={() => { nextPromptAtRef.current = Date.now() + 5 * 60 * 1000; openInbox(); }}>
                <Text style={[msgStyles.btnTxt, { fontSize: 17 }]}>ΔΙΑΒΑΣΕ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[msgStyles.btn, { backgroundColor: '#999', padding: 12, alignSelf: 'stretch', marginTop: 10 }]}
                onPress={() => { setUnreadPrompt(0); nextPromptAtRef.current = Date.now() + 5 * 60 * 1000; }}>
                <Text style={[msgStyles.btnTxt, { fontSize: 14 }]}>ΑΡΓΟΤΕΡΑ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {staveraFilterModalVisible ? (
          <View
            style={[styles.searchOverlayRoot, Platform.OS === 'web' && { position: 'fixed' }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={styles.searchBackdrop}
              activeOpacity={1}
              onPress={() => setStaveraFilterModalVisible(false)}
            />
            <View style={[styles.searchModalBox, styles.staveraFilterModalBox]} pointerEvents="box-none">
              <Text style={styles.searchModalTitle}>Σταθερά</Text>
              <Text style={styles.staveraFilterHint}>Διάλεξε ποιες παραγγελίες να εμφανιστούν:</Text>
              <TouchableOpacity
                style={styles.staveraFilterOption}
                onPress={() => applyStaveraFilterChoice('pending')}
                activeOpacity={0.75}
              >
                <Text style={styles.staveraFilterOptionText}>Χωρίς «δόθηκαν για παραγωγή» και χωρίς ✓ DONE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.staveraFilterOption}
                onPress={() => applyStaveraFilterChoice('done')}
                activeOpacity={0.75}
              >
                <Text style={styles.staveraFilterOptionText}>Έτοιμα (τσεκ «δόθηκαν» ή ✓ DONE)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.staveraFilterOption}
                onPress={() => applyStaveraFilterChoice('all')}
                activeOpacity={0.75}
              >
                <Text style={styles.staveraFilterOptionText}>Όλα</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.staveraFilterCancel}
                onPress={() => setStaveraFilterModalVisible(false)}
                activeOpacity={0.75}
              >
                <Text style={styles.staveraFilterCancelText}>Ακύρωση</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {globalSearchModalVisible ? (
          <View
            style={[styles.searchOverlayRoot, Platform.OS === 'web' && { position: 'fixed' }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={styles.searchBackdrop}
              activeOpacity={1}
              onPress={closeGlobalSearchModal}
            />
            <View style={styles.searchModalBox} pointerEvents="box-none">
              <View style={styles.searchModalHeaderRow}>
                <Text style={styles.searchModalTitle}>
                  {globalSearchModalStaveraMode
                    ? `Σταθερά (${effectiveSearchHits.length})`
                    : `Αποτελέσματα (${effectiveSearchHits.length})`}
                </Text>
                {effectiveSearchHits.length > 0 ? (
                  <TouchableOpacity
                    onPress={printAllSearchResults}
                    accessibilityLabel="Εκτύπωση όλων των αποτελεσμάτων σε ένα έγγραφο"
                  >
                    <Text style={styles.searchModalPrintAll}>Όλες 🖨️</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {printableHitIndices.length > 0 ? (
                <View style={styles.searchModalSelectRow}>
                  <View style={styles.searchModalSelectLeft}>
                    <TouchableOpacity onPress={selectAllPrintableSearchHits} style={styles.searchModalSelectChip}>
                      <Text style={styles.searchModalSelectChipText}>Όλα ✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={selectActiveSearchHits} style={[styles.searchModalSelectChip, { backgroundColor:'#2e7d32' }]}>
                      <Text style={[styles.searchModalSelectChipText, { color:'#fff' }]}>Τρέχουσες ✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={clearGlobalSearchPrintSelection} style={styles.searchModalSelectChip}>
                      <Text style={styles.searchModalSelectChipText}>Καθάρισμα</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={printSelectedSearchResults}
                    disabled={selectedPrintableCount === 0}
                    style={[
                      styles.searchModalSelectChip,
                      styles.searchModalSelectChipPrimary,
                      selectedPrintableCount === 0 && styles.searchModalSelectChipDisabled,
                    ]}
                    accessibilityLabel="Εκτύπωση επιλεγμένων παραγγελιών"
                  >
                    <Text
                      style={[
                        styles.searchModalSelectChipText,
                        selectedPrintableCount > 0 && styles.searchModalSelectChipTextPrimary,
                      ]}
                    >
                      Επιλογή ({selectedPrintableCount}) 🖨️
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                {effectiveSearchHits.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: '#888', padding: 20 }}>
                    {globalSearchModalStaveraMode
                      ? 'Δεν υπάρχει παραγγελία με τουλάχιστον ένα σταθερό (διάσταση).'
                      : 'Δεν βρέθηκε καμία εγγραφή.'}
                  </Text>
                ) : (
                  effectiveSearchHits.map((hit, i) => {
                    const canPrint = !!hit.order;
                    const isSel = globalSearchPrintSelected.has(i);
                    const prev = effectiveSearchHits[i - 1];
                    const showArchiveSep = hit.isSold && (!prev || !prev.isSold);
                    const rowTint = hit.isSold ? '#eceff1'
                      : hit.onHold ? '#fff8e1'
                      : (hit.status === 'STD_READY' || hit.status === 'READY') ? '#e8f5e9'
                      : (hit.status === 'STD_BUILD') ? '#fff3e0'
                      : (hit.status === 'STD_PENDING' || hit.status === 'PENDING' || !hit.status) ? '#e3f2fd'
                      : '#fff';
                    return (
                      <React.Fragment key={`${hit.id}-${i}-${hit.where}`}>
                        {showArchiveSep ? (
                          <View style={{ backgroundColor:'#455a64', paddingVertical:5, paddingHorizontal:10, marginTop:6, borderRadius:4 }}>
                            <Text style={{ color:'#fff', fontWeight:'bold', fontSize:12 }}>🗂 ΑΡΧΕΙΟ (πουλημένες)</Text>
                          </View>
                        ) : null}
                      <View style={[styles.searchHitRow, { backgroundColor: rowTint }]}>
                        <TouchableOpacity
                          style={styles.searchHitMain}
                          activeOpacity={0.7}
                          onPress={() => {
                            const live = resolveLiveStdOrder(hit, customOrders);
                            setGlobalSearchHighlightOrderId(String(live?.id ?? hit.id));
                            setGlobalSearchStockMeta(hit.stockMeta || null);
                            const ix = TABS.indexOf(hit.tab);
                            if (ix >= 0) setTabIndex(ix);
                            closeGlobalSearchModal();
                          }}
                        >
                          <Text style={styles.searchHitSummary}>{hit.summary}</Text>
                          <Text style={styles.searchHitWhere}>
                            {String(hit.where || '').includes('Διπλή θωράκιση')
                              ? (<>{String(hit.where).split('Διπλή θωράκιση')[0]}<Text style={{ fontWeight: 'bold' }}>Διπλή θωράκιση</Text></>)
                              : hit.where}
                          </Text>
                          {globalSearchModalStaveraMode && hit.order ? (
                            <Text style={styles.searchHitStaveraLine}>
                              Σταθερά: {staveraSearchBadgeLine(hit.order)}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                        {canPrint ? (
                          <TouchableOpacity
                            style={styles.searchHitCheckbox}
                            onPress={() => toggleGlobalSearchPrintSelect(i)}
                            accessibilityLabel={isSel ? 'Αποεπιλογή για εκτύπωση' : 'Επιλογή για εκτύπωση'}
                            accessibilityState={{ selected: isSel }}
                          >
                            <Text style={styles.searchHitCheckboxMark}>{isSel ? '☑' : '☐'}</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.searchHitCheckboxPlaceholder} />
                        )}
                        <TouchableOpacity
                          style={styles.searchHitPrintBtn}
                          onPress={() => printSearchResultOrder(hit)}
                          accessibilityLabel="Εκτύπωση στοιχείων παραγγελίας"
                        >
                          <Text style={styles.searchHitPrintBtnText}>🖨️</Text>
                        </TouchableOpacity>
                      </View>
                      </React.Fragment>
                    );
                  })
                )}
              </ScrollView>
              <TouchableOpacity style={styles.searchModalClose} onPress={closeGlobalSearchModal}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>ΚΛΕΙΣΙΜΟ</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' },
  loadingCard: { backgroundColor: '#fff', borderRadius: 20, padding: 36, alignItems: 'center', width: 260, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 },
  loadingLogo: { fontSize: 36, fontWeight: '900', fontStyle: 'italic', color: '#E53935', letterSpacing: 6, marginBottom: 16 },
  loadingDivider: { width: 40, height: 3, backgroundColor: '#E53935', borderRadius: 2, marginBottom: 24 },
  loadingText: { color: '#888', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  menuPanel: { backgroundColor: '#fff', width: 220, marginTop: 60, marginRight: 10, marginBottom: 16, maxHeight: '85%', borderRadius: 12, padding: 14, elevation: 10 },
  menuGroup: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, padding: 6, paddingBottom: 0, marginBottom: 10, backgroundColor: '#fafafa' },
  menuItem: { padding: 10, borderRadius: 8, backgroundColor: '#f5f5f5', marginBottom: 6 },
  menuItemText: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
  // ── TOP BAR styles ──
  topBar: { backgroundColor: '#1a1a2e', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, paddingTop: (StatusBar.currentHeight || 0) + 12 },
  topBarTitle: { color: '#E53935', fontSize: 38, fontWeight: '900', fontStyle: 'italic', letterSpacing: 4, marginRight: 14 },
  topBarSub: { color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: '700', flex: 1 },
  topBarMenu: { padding: 8 },
  topBarMenuIcon: { color: 'white', fontSize: 30 },
  topBarVersion: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, letterSpacing: 0.5, marginLeft: 20, marginRight: 20 },
  // ── SIDEBAR styles ──
  sidebar: { width: 300, backgroundColor: '#1a1a2e', flexDirection: 'column', alignItems: 'stretch', paddingVertical: 8, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)' },
  sidebarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderLeftWidth: 5,
    borderLeftColor: 'transparent',
    gap: 14,
  },
  sidebarParadoseisLabelRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  sidebarLabelParadoseis: {
    flex: 0,
    flexShrink: 0,
  },
  paradoseisLedDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#ff1744',
    shadowColor: '#ff0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 5,
    elevation: 6,
  },
  sidebarLockBtn: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  sidebarLockBtnOpen: {},
  sidebarLockIcon: { fontSize: 28 },
  sidebarBtnActive: { backgroundColor: 'rgba(255,255,255,0.08)', borderLeftColor: '#E53935' },
  sidebarIcon: { fontSize: 26 },
  sidebarLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700', flex: 1 },
  sidebarLabelActive: { color: 'white' },
  sidebarDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', marginHorizontal: 12, marginBottom: 4 },
  sidebarLookupBtn: { backgroundColor: '#0d47a1', borderRadius: 8, marginHorizontal: 10, marginBottom: 6, paddingVertical: 10, alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  sidebarLookupBtnActive: { backgroundColor: '#1565c0', borderColor: 'rgba(255,255,255,0.45)' },
  sidebarLookupBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  sidebarSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 6,
  },
  sidebarSearchInput: {
    flex: 4,
    minWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    color: '#fff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  /** Λίγο πιο φωτεινό από τα «λοιπά πεδία» — ξεχωριστό κριτήριο αναζήτησης */
  sidebarSearchInputOrderName: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.26)',
  },
  sidebarSearchInputWide: {
    flex: 6,
    minWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    color: '#fff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sidebarSearchActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 10,
    marginBottom: 6,
    gap: 6,
  },
  sidebarSearchLogicBtn: {
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(25,118,210,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(100,181,246,0.55)',
  },
  sidebarSearchLogicBtnOr: {
    backgroundColor: 'rgba(255,152,0,0.35)',
    borderColor: 'rgba(255,183,77,0.55)',
  },
  sidebarSearchLogicBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  /** 3/4 πλάτος — το υπόλοιπο 1/4 για το ✕ */
  sidebarSearchRun: {
    flex: 3,
    minWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sidebarSearchRunText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  sidebarSearchClear: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(229,57,53,0.35)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.55)',
  },
  sidebarSearchClearText: { color: 'white', fontWeight: 'bold', fontSize: 18, lineHeight: 22 },
  sidebarSearchStaveraBtn: {
    marginHorizontal: 10,
    marginTop: 20,
    marginBottom: 8,
    backgroundColor: 'rgba(21,101,192,0.45)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(144,202,249,0.5)',
  },
  sidebarSearchStaveraBtnText: { color: '#e3f2fd', fontWeight: 'bold', fontSize: 14 },
  staveraFilterModalBox: { maxWidth: 420 },
  staveraFilterHint: { color: '#555', fontSize: 14, marginBottom: 12 },
  staveraFilterOption: {
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#90caf9',
  },
  staveraFilterOptionText: { fontSize: 15, fontWeight: '600', color: '#0d47a1' },
  staveraFilterCancel: {
    marginTop: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  staveraFilterCancelText: { fontSize: 15, fontWeight: '600', color: '#666' },
  searchOverlayRoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 99999,
    elevation: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  searchBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 0,
  },
  searchModalBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    maxWidth: 760,
    maxHeight: '88%',
    zIndex: 2,
    elevation: 10,
  },
  searchModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  searchModalTitle: { fontSize: 17, fontWeight: 'bold', color: '#1a1a1a' },
  searchModalPrintAll: { fontSize: 14, color: '#1565C0', fontWeight: '600' },
  searchModalSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchModalSelectLeft: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  searchModalSelectChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#eceff1',
    borderWidth: 1,
    borderColor: '#cfd8dc',
  },
  searchModalSelectChipPrimary: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1565C0',
  },
  searchModalSelectChipDisabled: {
    opacity: 0.45,
  },
  searchModalSelectChipText: { fontSize: 13, fontWeight: '600', color: '#455a64' },
  searchModalSelectChipTextPrimary: { color: '#0d47a1' },
  searchHitRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 10,
    paddingLeft: 4,
    paddingRight: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 4,
  },
  searchHitCheckbox: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    alignSelf: 'stretch',
    paddingVertical: 4,
  },
  searchHitCheckboxPlaceholder: { width: 36 },
  searchHitCheckboxMark: { fontSize: 22, color: '#1565C0', lineHeight: 26 },
  searchHitMain: { flex: 1, minWidth: 0, paddingRight: 6 },
  searchHitPrintBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#eceff1',
    borderWidth: 1,
    borderColor: '#cfd8dc',
    alignSelf: 'center',
  },
  searchHitPrintBtnText: { fontSize: 20 },
  searchHitSummary: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  searchHitWhere: { fontSize: 12, color: '#666', marginTop: 4, lineHeight: 17 },
  searchHitStaveraLine: { fontSize: 12, color: '#1565C0', marginTop: 2, fontWeight: '600' },
  searchModalClose: {
    marginTop: 12,
    backgroundColor: '#333',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
});