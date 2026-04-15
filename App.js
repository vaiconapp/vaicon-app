import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet, Text, View, ScrollView, ActivityIndicator, Platform, UIManager,
  StatusBar, TouchableOpacity, Modal, TextInput,
  PanResponder, Alert, BackHandler
} from 'react-native';
import CustomScreen, { ParadoseisScreen } from './CustomScreen';
import SasiScreen from './SasiScreen';
import CaseScreen from './CaseScreen';
import StatsScreen from './StatsScreen';
import CustomersScreen from './CustomersScreen';
import CoatingsScreen from './CoatingsScreen';
import LocksScreen from './LocksScreen';
import ActivityScreen from './ActivityScreen';
import { FIREBASE_URL, hasFirebaseRealtime } from './firebaseConfig';
import { applyFetchedBundle, subscribeFirebaseRealtime } from './firebaseRealtime';
import { collectGlobalSearchHits } from './globalSearch';
import { printHTML, buildGlobalSearchOrderPrintHTML, buildGlobalSearchOrdersPrintHTML } from './printUtils';

// ============================================================
//  🔐 ΚΩΔΙΚΟΣ ΠΡΟΣΒΑΣΗΣ — ορίζεται στο αρχείο .env
//  EXPO_PUBLIC_VAICON_PASSWORD=vaicon2024
// ============================================================
const VAICON_PASSWORD = process.env.EXPO_PUBLIC_VAICON_PASSWORD || '';
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

const TABS = ['customNew', 'customMoni', 'customDipli', 'sasi', 'cases', 'deliveries', 'stats'];
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
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [paradoseisSearchOrderName, setParadoseisSearchOrderName] = useState('');
  const [paradoseisSearchOther, setParadoseisSearchOther] = useState('');
  const [paradoseisSearchOther2, setParadoseisSearchOther2] = useState('');
  const [paradoseisSearchOther3, setParadoseisSearchOther3] = useState('');
  const [globalSearchModalVisible, setGlobalSearchModalVisible] = useState(false);
  const [globalSearchHits, setGlobalSearchHits] = useState([]);
  /** Δείκτες γραμμών (index) με ενεργή επιλογή για εκτύπωση πολλαπλών παραγγελιών */
  const [globalSearchPrintSelected, setGlobalSearchPrintSelected] = useState(() => new Set());
  const [globalSearchHighlightOrderId, setGlobalSearchHighlightOrderId] = useState(null);
  const [globalSearchStockMeta, setGlobalSearchStockMeta] = useState(null);

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
  };

  const printSearchResultOrder = async (hit) => {
    if (!hit.order) {
      Alert.alert('Εκτύπωση', 'Δεν βρέθηκαν αποθηκευμένα στοιχεία παραγγελίας.');
      return;
    }
    try {
      const html = buildGlobalSearchOrderPrintHTML(hit.order, { where: hit.where });
      await printHTML(html, `VAICON — #${hit.orderNo}`);
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η εκτύπωση δεν ολοκληρώθηκε.');
    }
  };

  const printAllSearchResults = async () => {
    const withOrder = globalSearchHits.filter((h) => h.order);
    if (!withOrder.length) {
      Alert.alert('Εκτύπωση', 'Δεν βρέθηκαν αποθηκευμένα στοιχεία παραγγελίας.');
      return;
    }
    try {
      const html = buildGlobalSearchOrdersPrintHTML(withOrder);
      await printHTML(html, 'VAICON — αποτελέσματα');
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η εκτύπωση δεν ολοκληρώθηκε.');
    }
  };

  const printableHitIndices = useMemo(
    () => globalSearchHits.map((h, i) => (h.order ? i : -1)).filter((i) => i >= 0),
    [globalSearchHits]
  );

  const selectedPrintableCount = useMemo(() => {
    let n = 0;
    for (const i of globalSearchPrintSelected) {
      if (i >= 0 && i < globalSearchHits.length && globalSearchHits[i]?.order) n += 1;
    }
    return n;
  }, [globalSearchPrintSelected, globalSearchHits]);

  const toggleGlobalSearchPrintSelect = useCallback((index) => {
    if (!globalSearchHits[index]?.order) return;
    setGlobalSearchPrintSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, [globalSearchHits]);

  const selectAllPrintableSearchHits = useCallback(() => {
    setGlobalSearchPrintSelected(new Set(printableHitIndices));
  }, [printableHitIndices]);

  const clearGlobalSearchPrintSelection = useCallback(() => {
    setGlobalSearchPrintSelected(new Set());
  }, []);

  const closeGlobalSearchModal = useCallback(() => {
    setGlobalSearchPrintSelected(new Set());
    setGlobalSearchModalVisible(false);
  }, []);

  const printSelectedSearchResults = async () => {
    const picked = [...globalSearchPrintSelected]
      .filter((i) => i >= 0 && i < globalSearchHits.length && globalSearchHits[i]?.order)
      .sort((a, b) => a - b)
      .map((i) => globalSearchHits[i]);
    if (!picked.length) {
      Alert.alert('Εκτύπωση', 'Διάλεξε τουλάχιστον μία παραγγελία με το τετραγωνάκι επιλογής.');
      return;
    }
    try {
      const html = buildGlobalSearchOrdersPrintHTML(picked);
      await printHTML(html, `VAICON — ${picked.length} επιλεγμένες`);
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η εκτύπωση δεν ολοκληρώθηκε.');
    }
  };

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
      let hits = collectGlobalSearchHits(q1, qOther, {
        customOrders,
        soldOrders,
        sasiOrders,
        soldSasiOrders,
        caseOrders,
        soldCaseOrders,
      });
      hits = [...hits].sort((a, b) => {
        const ao = String(a.orderNo ?? '');
        const bo = String(b.orderNo ?? '');
        if (ao !== bo) return ao.localeCompare(bo, undefined, { numeric: true });
        return a.where.localeCompare(b.where);
      });
      setGlobalSearchHits(hits);
      setGlobalSearchPrintSelected(new Set());
      setGlobalSearchModalVisible(true);
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η αναζήτηση απέτυχε.');
    }
  };

  useEffect(() => {
    if (hasFirebaseRealtime()) {
      try {
        return subscribeFirebaseRealtime({
          setCustomOrders, setSoldOrders, setSasiOrders, setSoldSasiOrders,
          setCaseOrders, setSoldCaseOrders, setCustomers, setCoatings,
          setDipliSasiStock, setLocks, setSasiStock, setCaseStock,
          setLoading, setActivityRefreshKey,
        });
      } catch (e) {
        console.error('Firebase realtime:', e);
        fetchData();
        return () => { if (fetchAbortRef.current) fetchAbortRef.current.abort(); };
      }
    }
    fetchData();
    return () => { if (fetchAbortRef.current) fetchAbortRef.current.abort(); };
  }, []);

  // Back button handler
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) { setMenuOpen(false); return true; }
      if (showActivity) { setShowActivity(false); return true; }
      if (showCoatings) { setShowCoatings(false); return true; }
      if (showLocks) { setShowLocks(false); return true; }
      if (showCustomers) { setShowCustomers(false); return true; }
      if (globalSearchModalVisible) {
        closeGlobalSearchModal();
        return true;
      }
      if (tabIndex !== 0) { setTabIndex(0); return true; }
      return false; // έξοδος από app αν ήδη στην 1η καρτέλα
    });
    return () => sub.remove();
  }, [menuOpen, showActivity, showCoatings, showLocks, showCustomers, tabIndex, globalSearchModalVisible, closeGlobalSearchModal]);

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
    try {
      const [
        dataStd, data2, data3, data4, data5, data6, data7, dataSasiStock, dataCaseStock
      ] = await Promise.all([
        fetchJSON(`${FIREBASE_URL}/std_orders.json`),
        fetchJSON(`${FIREBASE_URL}/sasi_orders.json`),
        fetchJSON(`${FIREBASE_URL}/case_orders.json`),
        fetchJSON(`${FIREBASE_URL}/customers.json`),
        fetchJSON(`${FIREBASE_URL}/coatings.json`),
        fetchJSON(`${FIREBASE_URL}/dipli_sasi_stock.json`),
        fetchJSON(`${FIREBASE_URL}/locks.json`),
        fetchJSON(`${FIREBASE_URL}/sasi_stock.json`),
        fetchJSON(`${FIREBASE_URL}/case_stock.json`),
      ]);

      applyFetchedBundle(
        {
          setCustomOrders, setSoldOrders, setSasiOrders, setSoldSasiOrders,
          setCaseOrders, setSoldCaseOrders, setCustomers, setCoatings,
          setDipliSasiStock, setLocks, setSasiStock, setCaseStock,
        },
        {
          dataStd, data2, data3, data4, data5, data6, data7, dataSasiStock, dataCaseStock,
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

  if (Platform.OS === 'web' && !isLoggedIn) return <LoginScreen onSuccess={() => setIsLoggedIn(true)} />;

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

  const view = TABS[tabIndex];

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5', position: 'relative' }}>
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
                  onPress={() => {
                    clearSearchNavigationHighlight();
                    setTabIndex(TABS.indexOf(tab));
                  }}>
                  <Text style={styles.sidebarIcon}>{TAB_ICONS[tab]}</Text>
                  <Text style={[styles.sidebarLabel, isActive && styles.sidebarLabelActive]}>
                    {TAB_LABELS[tab]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.sidebarDivider} />
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
            style={[styles.sidebarBtn, TABS[tabIndex] === 'deliveries' && styles.sidebarBtnActive]}
            onPress={() => {
              clearSearchNavigationHighlight();
              setTabIndex(TABS.indexOf('deliveries'));
            }}>
            <Text style={styles.sidebarIcon}>📅</Text>
            <Text style={[styles.sidebarLabel, TABS[tabIndex] === 'deliveries' && styles.sidebarLabelActive]}>
              ΠΑΡΑΔΟΣΕΙΣ
            </Text>
          </TouchableOpacity>
        </View>

        {/* ═══ ΚΥΡΙΟ ΠΕΡΙΕΧΟΜΕΝΟ δεξιά ═══ */}
        <View style={{ flex: 1 }} {...panResponder.panHandlers}>
          <View style={{ flex: 1, display: (view === 'customMoni' || view === 'customDipli' || view === 'customNew') ? 'flex' : 'none' }}>
            <CustomScreen customOrders={customOrders} setCustomOrders={setCustomOrders} soldOrders={soldOrders} setSoldOrders={setSoldOrders} customers={customers} onRequestAddCustomer={(name, cb)=>{ setPendingCustomer(name); setPendingCustomerCallback(()=>cb); setShowCustomers(true); }} sasiStock={sasiStock} setSasiStock={setSasiStock} caseStock={caseStock} setCaseStock={setCaseStock} sasiOrders={sasiOrders} setSasiOrders={setSasiOrders} caseOrders={caseOrders} setCaseOrders={setCaseOrders} coatings={coatings} dipliSasiStock={dipliSasiStock} setDipliSasiStock={setDipliSasiStock} locks={locks} formOnly={view === 'customNew'} forcedTab={view === 'customMoni' ? 'ΜΟΝΗ' : view === 'customDipli' ? 'ΔΙΠΛΗ' : null} setTabIndex={setTabIndex} highlightOrderId={globalSearchHighlightOrderId} onClearSearchHighlight={clearSearchNavigationHighlight} />
          </View>
          {view === 'sasi'   && <SasiScreen sasiStock={sasiStock} setSasiStock={setSasiStock} stockHighlight={globalSearchStockMeta} onClearSearchHighlight={clearSearchNavigationHighlight} />}
          {view === 'cases'  && <CaseScreen caseStock={caseStock} setCaseStock={setCaseStock} stockHighlight={globalSearchStockMeta} onClearSearchHighlight={clearSearchNavigationHighlight} />}
          {view === 'deliveries' && <ParadoseisScreen customOrders={customOrders} highlightOrderId={globalSearchHighlightOrderId} onClearSearchHighlight={clearSearchNavigationHighlight} />}
          {view === 'stats'  && <StatsScreen customOrders={customOrders} soldOrders={soldOrders} setSoldOrders={setSoldOrders} sasiOrders={sasiOrders} soldSasiOrders={soldSasiOrders} FIREBASE_URL={FIREBASE_URL} onClearSearchHighlight={clearSearchNavigationHighlight} />}
        </View>
      </View>

        {/* HAMBURGER MENU */}
        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuPanel}>
              <Text style={styles.menuTitle}>ΜΕΝΟΥ</Text>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); clearSearchNavigationHighlight(); setTabIndex(TABS.indexOf('stats')); }}>
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
              <TouchableOpacity style={styles.menuItem} onPress={async () => { setMenuOpen(false); await fetchData(); Alert.alert("VAICON", "Τα δεδομένα ανανεώθηκαν!"); }}>
                <Text style={styles.menuItemText}>🔄 ΑΝΑΝΕΩΣΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff0f0', marginTop: 12 }]} onPress={() => {
                setMenuOpen(false);
                const doLogout = () => { forgetLogin(); setIsLoggedIn(false); };
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
                <Text style={styles.searchModalTitle}>Αποτελέσματα ({globalSearchHits.length})</Text>
                {globalSearchHits.length > 0 ? (
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
                {globalSearchHits.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: '#888', padding: 20 }}>Δεν βρέθηκε καμία εγγραφή.</Text>
                ) : (
                  globalSearchHits.map((hit, i) => {
                    const canPrint = !!hit.order;
                    const isSel = globalSearchPrintSelected.has(i);
                    return (
                      <View key={`${hit.id}-${i}-${hit.where}`} style={styles.searchHitRow}>
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
                          style={styles.searchHitMain}
                          activeOpacity={0.7}
                          onPress={() => {
                            setGlobalSearchHighlightOrderId(String(hit.id));
                            setGlobalSearchStockMeta(hit.stockMeta || null);
                            const ix = TABS.indexOf(hit.tab);
                            if (ix >= 0) setTabIndex(ix);
                            closeGlobalSearchModal();
                          }}
                        >
                          <Text style={styles.searchHitSummary}>{hit.summary}</Text>
                          <Text style={styles.searchHitWhere}>{hit.where}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.searchHitPrintBtn}
                          onPress={() => printSearchResultOrder(hit)}
                          accessibilityLabel="Εκτύπωση στοιχείων παραγγελίας"
                        >
                          <Text style={styles.searchHitPrintBtnText}>🖨️</Text>
                        </TouchableOpacity>
                      </View>
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
  sidebarDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', marginHorizontal: 12, marginBottom: 4 },
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
    maxWidth: 520,
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
  searchModalClose: {
    marginTop: 12,
    backgroundColor: '#333',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
});