import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ActivityIndicator, Platform, UIManager,
  StatusBar, TouchableOpacity, ScrollView, Modal, TextInput,
  Animated, PanResponder, Dimensions, Alert
} from 'react-native';
import CustomScreen from './CustomScreen';
import SasiScreen from './SasiScreen';
import CaseScreen from './CaseScreen';
import StatsScreen from './StatsScreen';
import CustomersScreen from './CustomersScreen';
import CoatingsScreen from './CoatingsScreen';
import ActivityScreen from './ActivityScreen';

export const FIREBASE_URL = "https://vaiconcloud-default-rtdb.europe-west1.firebasedatabase.app";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TABS = ['custom', 'sasi', 'cases', 'stats'];
const TAB_LABELS = { custom: 'ΠΑΡΑΓΓΕΛΙΕΣ', sasi: 'ΣΑΣΙ ΣΤΟΚ', cases: 'ΚΑΣΕΣ ΣΤΟΚ', stats: 'ΣΤΑΤΙΣΤΙΚΑ' };
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function App() {
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCustomers, setShowCustomers] = useState(false);
  const [showCoatings, setShowCoatings] = useState(false);
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
  const [dipliSasiStock, setDipliSasiStock] = useState([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res1 = await fetch(`${FIREBASE_URL}/orders.json`);
      const data1 = await res1.json();
      if (data1) {
        const loaded = Object.keys(data1).map(key => ({ id: key, ...data1[key] }));
        setCustomOrders(loaded.filter(o => o.status !== 'SOLD'));
        setSoldOrders(loaded.filter(o => o.status === 'SOLD'));
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

  if (loading) return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#8B0000" />
      <Text style={styles.loadingText}>Σύνδεση με Vaicon Cloud...</Text>
    </View>
  );

  const view = TABS[tabIndex];

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" translucent={false} />
      <View style={styles.container}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>VAICON</Text>
          <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(true)}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
        </View>

        {/* NAV */}
        <View style={styles.nav}>
          {TABS.map((tab, i) => (
            <TouchableOpacity key={tab} style={[styles.navBtn, tabIndex === i && styles.activeNav]} onPress={() => setTabIndex(i)}>
              <Text style={[styles.navText, tabIndex === i && styles.activeNavText]}>{TAB_LABELS[tab]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* SCREENS με swipe */}
        <View style={{ flex: 1 }} {...panResponder.panHandlers}>
          {view === 'custom' && <CustomScreen customOrders={customOrders} setCustomOrders={setCustomOrders} soldOrders={soldOrders} setSoldOrders={setSoldOrders} customers={customers} onRequestAddCustomer={(name, cb)=>{ setPendingCustomer(name); setPendingCustomerCallback(()=>cb); setShowCustomers(true); }} sasiOrders={sasiOrders} setSasiOrders={setSasiOrders} caseOrders={caseOrders} setCaseOrders={setCaseOrders} coatings={coatings} dipliSasiStock={dipliSasiStock} setDipliSasiStock={setDipliSasiStock} />}
          {view === 'sasi'   && <SasiScreen sasiOrders={sasiOrders} setSasiOrders={setSasiOrders} soldSasiOrders={soldSasiOrders} setSoldSasiOrders={setSoldSasiOrders} />}
          {view === 'cases'  && <CaseScreen caseOrders={caseOrders} setCaseOrders={setCaseOrders} soldCaseOrders={soldCaseOrders} setSoldCaseOrders={setSoldCaseOrders} />}
          {view === 'stats'  && <StatsScreen customOrders={customOrders} soldOrders={soldOrders} sasiOrders={sasiOrders} soldSasiOrders={soldSasiOrders} caseOrders={caseOrders} soldCaseOrders={soldCaseOrders} />}
        </View>

        {/* HAMBURGER MENU */}
        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuPanel}>
              <Text style={styles.menuTitle}>ΜΕΝΟΥ</Text>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCustomers(true); }}>
                <Text style={styles.menuItemText}>👥 ΠΕΛΑΤΕΣ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCoatings(true); }}>
                <Text style={styles.menuItemText}>🎨 ΕΠΕΝΔΥΣΕΙΣ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowActivity(true); }}>
                <Text style={styles.menuItemText}>📜 ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); fetchData(); Alert.alert("VAICON", "Ανανέωση δεδομένων..."); }}>
                <Text style={styles.menuItemText}>🔄 ΑΝΑΝΕΩΣΗ</Text>
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

        {/* ΠΕΛΑΤΕΣ SCREEN */}
        <Modal visible={showCustomers} animationType="slide" onRequestClose={() => setShowCustomers(false)}>
          <CustomersScreen
            customers={customers}
            setCustomers={setCustomers}
            customOrders={[...customOrders, ...soldOrders]}
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#555', fontSize: 14 },
  header: { backgroundColor: '#8B0000', paddingVertical: 14, alignItems: 'center', borderRadius: 18, marginHorizontal: 8, marginTop: (StatusBar.currentHeight || 0) + 6, flexDirection: 'row', justifyContent: 'center' },
  headerTitle: { color: 'white', fontSize: 32, fontWeight: '300', letterSpacing: 18 },
  menuBtn: { position: 'absolute', right: 16, padding: 8 },
  menuIcon: { color: 'white', fontSize: 24 },
  nav: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#ddd' },
  navBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  activeNav: { borderBottomWidth: 3, borderBottomColor: '#8B0000' },
  navText: { fontWeight: '700', fontSize: 13, color: '#888' },
  activeNavText: { color: '#8B0000' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  menuPanel: { backgroundColor: '#fff', width: 220, marginTop: 80, marginRight: 10, borderRadius: 12, padding: 16, elevation: 10 },
  menuTitle: { fontSize: 12, fontWeight: 'bold', color: '#999', marginBottom: 12, letterSpacing: 2 },
  menuItem: { padding: 14, borderRadius: 8, backgroundColor: '#f5f5f5', marginBottom: 8 },
  menuItemText: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
});