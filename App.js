import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ActivityIndicator, Platform, UIManager,
  StatusBar, TouchableOpacity, Modal, TextInput,
  PanResponder, Alert, BackHandler
} from 'react-native';
import CustomScreen from './CustomScreen';
import SasiScreen from './SasiScreen';
import CaseScreen from './CaseScreen';
import StatsScreen from './StatsScreen';
import CustomersScreen from './CustomersScreen';
import CoatingsScreen from './CoatingsScreen';
import LocksScreen from './LocksScreen';
import ActivityScreen from './ActivityScreen';
import { FIREBASE_URL } from './firebaseConfig';

export { FIREBASE_URL };

// ============================================================
//  🔐 ΚΩΔΙΚΟΣ ΠΡΟΣΒΑΣΗΣ — αλλάξτε εδώ τον κωδικό σας
// ============================================================
const VAICON_PASSWORD = "vaicon2024";
const STORAGE_KEY = "vaicon_auth_v1";

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

// Αποσύνδεση (διαγράφει την αποθήκευση)
const forgetLogin = () => {
  if (Platform.OS !== 'web') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

// ============================================================
//  Οθόνη Login
// ============================================================
function LoginScreen({ onSuccess }) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleLogin = () => {
    if (pwd === VAICON_PASSWORD) {
      rememberLogin();
      onSuccess();
    } else {
      setError(true);
      setPwd('');
      setTimeout(() => setError(false), 2000);
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

        {/* ΚΩΔΙΚΟΣ */}
        <Text style={loginStyles.label}>Κωδικός Πρόσβασης</Text>
        <View style={loginStyles.inputRow}>
          <TextInput
            style={[loginStyles.input, error && loginStyles.inputError]}
            placeholder="Εισάγετε κωδικό..."
            placeholderTextColor="#aaa"
            secureTextEntry={!showPwd}
            value={pwd}
            onChangeText={v => { setPwd(v); setError(false); }}
            onSubmitEditing={handleLogin}
            autoFocus
          />
          <TouchableOpacity style={loginStyles.eyeBtn} onPress={() => setShowPwd(v => !v)}>
            <Text style={{ fontSize: 20 }}>{showPwd ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <Text style={loginStyles.errorTxt}>❌ Λάθος κωδικός. Δοκιμάστε ξανά.</Text>
        )}

        <TouchableOpacity style={loginStyles.btn} onPress={handleLogin}>
          <Text style={loginStyles.btnTxt}>🔓 ΕΙΣΟΔΟΣ</Text>
        </TouchableOpacity>

        <Text style={loginStyles.hint}>
          Μετά την πρώτη σύνδεση, αυτός ο υπολογιστής δεν θα ξαναρωτηθεί.
        </Text>
      </View>
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TABS = ['customNew', 'customMoni', 'customDipli', 'sasi', 'cases', 'stats'];
const TAB_LABELS = { customNew: 'ΚΑΤΑΧΩΡΗΣΗ', customMoni: 'ΤΥΠΟΠΟΙΗΜΕΝΕΣ\nΜΟΝΗ ΘΩΡΑΚΙΣΗ', customDipli: 'ΤΥΠΟΠΟΙΗΜΕΝΕΣ\nΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', sasi: 'STOCK ΣΑΣΙ', cases: 'STOCK ΚΑΣΑ', stats: 'ΣΤΑΤΙΣΤΙΚΑ' };
const TAB_ICONS  = { customNew: '✏️', customMoni: '🛡️', customDipli: '🔰', sasi: '🔧', cases: '🚪', stats: '📊' };
const NAV_TABS = ['customNew', 'customMoni', 'customDipli', 'sasi', 'cases'];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(isRemembered());
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCustomers, setShowCustomers] = useState(false);
  const [showCoatings, setShowCoatings] = useState(false);
  const [showLocks, setShowLocks] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState(null); // όνομα πελάτη από CustomScreen
  const [pendingCustomerCallback, setPendingCustomerCallback] = useState(null);

  const [customOrders, setCustomOrders] = useState([]);
  const [soldOrders, setSoldOrders] = useState([]);
  const [sasiOrders, setSasiOrders] = useState([]);
  const [soldSasiOrders, setSoldSasiOrders] = useState([]);
  const [caseOrders, setCaseOrders] = useState([]);
  const [soldCaseOrders, setSoldCaseOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [coatings, setCoatings] = useState([]);
  const [locks, setLocks] = useState([]);
  const [dipliSasiStock, setDipliSasiStock] = useState([]);
  const [sasiStock, setSasiStock] = useState({});
  const [caseStock, setCaseStock] = useState({});

  useEffect(() => { fetchData(); }, []);

  // Back button handler
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) { setMenuOpen(false); return true; }
      if (showActivity) { setShowActivity(false); return true; }
      if (showCoatings) { setShowCoatings(false); return true; }
      if (showLocks) { setShowLocks(false); return true; }
      if (showCustomers) { setShowCustomers(false); return true; }
      if (tabIndex !== 0) { setTabIndex(0); return true; }
      return false; // έξοδος από app αν ήδη στην 1η καρτέλα
    });
    return () => sub.remove();
  }, [menuOpen, showActivity, showCoatings, showLocks, showCustomers, tabIndex]);

  const fetchData = async () => {
    try {

      const resStd = await fetch(`${FIREBASE_URL}/std_orders.json`);
      const dataStd = await resStd.json();
      if (dataStd) {
        const loadedStd = Object.keys(dataStd).map(key => ({ id: key, ...dataStd[key] }));
        setCustomOrders(loadedStd.filter(o => o.status !== 'SOLD'));
        setSoldOrders(loadedStd.filter(o => o.status === 'SOLD'));
      }
      const res2 = await fetch(`${FIREBASE_URL}/sasi_orders.json`);
      const data2 = await res2.json();
      if (data2) {
        const loaded2 = Object.keys(data2).map(key => ({ id: key, ...data2[key] }));
        setSasiOrders(loaded2.filter(o => o.status !== 'SOLD'));
        setSoldSasiOrders(loaded2.filter(o => o.status === 'SOLD'));
      }
      const res3 = await fetch(`${FIREBASE_URL}/case_orders.json`);
      const data3 = await res3.json();
      if (data3) {
        const loaded3 = Object.keys(data3).map(key => ({ id: key, ...data3[key] }));
        setCaseOrders(loaded3.filter(o => o.status !== 'SOLD'));
        setSoldCaseOrders(loaded3.filter(o => o.status === 'SOLD'));
      }
      const res4 = await fetch(`${FIREBASE_URL}/customers.json`);
      const data4 = await res4.json();
      if (data4) {
        const loaded4 = Object.keys(data4).map(key => ({ id: key, ...data4[key] }));
        setCustomers(loaded4);
      }
      const res5 = await fetch(`${FIREBASE_URL}/coatings.json`);
      const data5 = await res5.json();
      if (data5) {
        const loaded5 = Object.keys(data5).map(key => ({ id: key, ...data5[key] }));
        setCoatings(loaded5);
      }
      const res6 = await fetch(`${FIREBASE_URL}/dipli_sasi_stock.json`);
      const data6 = await res6.json();
      if (data6) {
        const loaded6 = Object.keys(data6).map(key => ({ id: key, ...data6[key] }));
        setDipliSasiStock(loaded6);
      }
      const res7 = await fetch(`${FIREBASE_URL}/locks.json`);
      const data7 = await res7.json();
      if (data7) {
        const loaded7 = Object.keys(data7).map(key => ({ id: key, ...data7[key] }));
        setLocks(loaded7);
      }
      // Φόρτωση νέου stock
      const resSasiStock = await fetch(`${FIREBASE_URL}/sasi_stock.json`);
      const dataSasiStock = await resSasiStock.json();
      if (dataSasiStock) setSasiStock(dataSasiStock);

      const resCaseStock = await fetch(`${FIREBASE_URL}/case_stock.json`);
      const dataCaseStock = await resCaseStock.json();
      if (dataCaseStock) setCaseStock(dataCaseStock);

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // SWIPE handler
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 && Math.abs(g.dy) < 20,
    onPanResponderRelease: (_, g) => {
      if (g.dx < -10) setTabIndex(i => Math.min(i + 1, TABS.length - 1));
      else if (g.dx > 10) setTabIndex(i => Math.max(i - 1, 0));
    },
  })).current;

  if (Platform.OS === 'web' && !isLoggedIn) return <LoginScreen onSuccess={() => setIsLoggedIn(true)} />;

  if (loading) return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#8B0000" />
      <Text style={styles.loadingText}>Σύνδεση με Vaicon Cloud...</Text>
    </View>
  );

  const view = TABS[tabIndex];

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" translucent={false} />

      {/* ═══ TOP BAR — οριζόντια πάνω ═══ */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>VAICON</Text>
        <Text style={styles.topBarSub}>Σύστημα Διαχείρισης Τυποποιημένων Παραγγελιών</Text>
        <TouchableOpacity style={styles.topBarMenu} onPress={() => setMenuOpen(true)}>
          <Text style={styles.topBarMenuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>

        {/* ═══ SIDEBAR — κάθετη αριστερά ═══ */}
        <View style={styles.sidebar}>
          {/* TAB BUTTONS */}
          <View style={{ flex: 1 }}>
            {NAV_TABS.map((tab) => {
              const isActive = TABS[tabIndex] === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.sidebarBtn, isActive && styles.sidebarBtnActive]}
                  onPress={() => setTabIndex(TABS.indexOf(tab))}>
                  <Text style={styles.sidebarIcon}>{TAB_ICONS[tab]}</Text>
                  <Text style={[styles.sidebarLabel, isActive && styles.sidebarLabelActive]}>
                    {TAB_LABELS[tab]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ═══ ΚΥΡΙΟ ΠΕΡΙΕΧΟΜΕΝΟ δεξιά ═══ */}
        <View style={{ flex: 1 }} {...panResponder.panHandlers}>
          <View style={{ flex: 1, display: (view === 'customMoni' || view === 'customDipli' || view === 'customNew') ? 'flex' : 'none' }}>
            <CustomScreen customOrders={customOrders} setCustomOrders={setCustomOrders} soldOrders={soldOrders} setSoldOrders={setSoldOrders} customers={customers} onRequestAddCustomer={(name, cb)=>{ setPendingCustomer(name); setPendingCustomerCallback(()=>cb); setShowCustomers(true); }} sasiStock={sasiStock} setSasiStock={setSasiStock} caseStock={caseStock} setCaseStock={setCaseStock} sasiOrders={sasiOrders} setSasiOrders={setSasiOrders} caseOrders={caseOrders} setCaseOrders={setCaseOrders} coatings={coatings} dipliSasiStock={dipliSasiStock} setDipliSasiStock={setDipliSasiStock} locks={locks} formOnly={view === 'customNew'} forcedTab={view === 'customMoni' ? 'ΜΟΝΗ' : view === 'customDipli' ? 'ΔΙΠΛΗ' : null} setTabIndex={setTabIndex} />
          </View>
          {view === 'sasi'   && <SasiScreen sasiStock={sasiStock} setSasiStock={setSasiStock} />}
          {view === 'cases'  && <CaseScreen caseStock={caseStock} setCaseStock={setCaseStock} />}
          {view === 'stats'  && <StatsScreen customOrders={customOrders} soldOrders={soldOrders} sasiOrders={sasiOrders} soldSasiOrders={soldSasiOrders} />}
        </View>

        {/* HAMBURGER MENU */}
        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuPanel}>
              <Text style={styles.menuTitle}>ΜΕΝΟΥ</Text>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setTabIndex(TABS.indexOf('stats')); }}>
                <Text style={styles.menuItemText}>📊 ΣΤΑΤΙΣΤΙΚΑ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCustomers(true); }}>
                <Text style={styles.menuItemText}>👥 ΠΕΛΑΤΕΣ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCoatings(true); }}>
                <Text style={styles.menuItemText}>🎨 ΕΠΕΝΔΥΣΕΙΣ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowLocks(true); }}>
                <Text style={styles.menuItemText}>🔒 ΚΛΕΙΔΑΡΙΕΣ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowActivity(true); }}>
                <Text style={styles.menuItemText}>📜 ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); fetchData(); Alert.alert("VAICON", "Ανανέωση δεδομένων..."); }}>
                <Text style={styles.menuItemText}>🔄 ΑΝΑΝΕΩΣΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff0f0', marginTop: 12 }]} onPress={() => {
                Alert.alert("🔐 Αποσύνδεση", "Θέλεις να αποσυνδεθείς;\n\nΤην επόμενη φορά θα ζητηθεί ξανά κωδικός σε αυτόν τον υπολογιστή.", [
                  { text: "ΑΚΥΡΟ", style: "cancel" },
                  { text: "ΑΠΟΣΥΝΔΕΣΗ", style: "destructive", onPress: () => { forgetLogin(); setIsLoggedIn(false); setMenuOpen(false); } }
                ]);
              }}>
                <Text style={[styles.menuItemText, { color: '#8B0000' }]}>🔐 ΑΠΟΣΥΝΔΕΣΗ</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ */}
        <Modal visible={showActivity} animationType="slide" onRequestClose={() => setShowActivity(false)}>
          <ActivityScreen onClose={() => setShowActivity(false)} />
        </Modal>

        {/* ΕΠΕΝΔΥΣΕΙΣ SCREEN */}
        <Modal visible={showCoatings} animationType="slide" onRequestClose={() => setShowCoatings(false)}>
          <CoatingsScreen
            coatings={coatings}
            setCoatings={setCoatings}
            onClose={() => setShowCoatings(false)}
          />
        </Modal>

        <Modal visible={showLocks} animationType="slide" onRequestClose={() => setShowLocks(false)}>
          <LocksScreen locks={locks} setLocks={setLocks} onClose={() => setShowLocks(false)} />
        </Modal>

        {/* ΠΕΛΑΤΕΣ SCREEN */}
        <Modal visible={showCustomers} animationType="slide" onRequestClose={() => setShowCustomers(false)}>
          <CustomersScreen
            customers={customers}
            setCustomers={setCustomers}
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
          />
        </Modal>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#555', fontSize: 14 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  menuPanel: { backgroundColor: '#fff', width: 220, marginTop: 80, marginRight: 10, borderRadius: 12, padding: 16, elevation: 10 },
  menuTitle: { fontSize: 12, fontWeight: 'bold', color: '#999', marginBottom: 12, letterSpacing: 2 },
  menuItem: { padding: 14, borderRadius: 8, backgroundColor: '#f5f5f5', marginBottom: 8 },
  menuItemText: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
  // ── TOP BAR styles ──
  topBar: { backgroundColor: '#1a1a2e', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, paddingTop: (StatusBar.currentHeight || 0) + 12 },
  topBarTitle: { color: '#E53935', fontSize: 38, fontWeight: '900', fontStyle: 'italic', letterSpacing: 4, marginRight: 14 },
  topBarSub: { color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: '700', flex: 1 },
  topBarMenu: { padding: 8 },
  topBarMenuIcon: { color: 'white', fontSize: 30 },
  // ── SIDEBAR styles ──
  sidebar: { width: 300, backgroundColor: '#1a1a2e', flexDirection: 'column', alignItems: 'stretch', paddingVertical: 8, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)' },
  sidebarBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20, borderLeftWidth: 5, borderLeftColor: 'transparent', gap: 14 },
  sidebarBtnActive: { backgroundColor: 'rgba(255,255,255,0.08)', borderLeftColor: '#E53935' },
  sidebarIcon: { fontSize: 26 },
  sidebarLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700', flex: 1 },
  sidebarLabelActive: { color: 'white' },
});