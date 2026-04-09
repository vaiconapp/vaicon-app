import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';

const PERIODS = ['ΣΗΜΕΡΑ', 'ΕΒΔΟΜΑΔΑ', 'ΜΗΝΑΣ', 'ΟΛΕΣ'];

export default function StatsScreen({ customOrders, soldOrders, sasiOrders, soldSasiOrders }) {
  const [period, setPeriod] = useState('ΜΗΝΑΣ');

  sasiOrders = sasiOrders || [];
  soldSasiOrders = soldSasiOrders || [];

  // Πόρτες = ειδικές + σασι. Κάσες ΔΕΝ μετράνε στα στατιστικά
  const allOrders = [...customOrders, ...soldOrders, ...sasiOrders, ...soldSasiOrders];
  const allSold = [...soldOrders, ...soldSasiOrders];

  const now = Date.now();
  const periodMs = {
    'ΣΗΜΕΡΑ': 24 * 60 * 60 * 1000,
    'ΕΒΔΟΜΑΔΑ': 7 * 24 * 60 * 60 * 1000,
    'ΜΗΝΑΣ': 30 * 24 * 60 * 60 * 1000,
    'ΟΛΕΣ': Infinity,
  };

  const filtered = useMemo(() => {
    const ms = periodMs[period];
    return allOrders.filter(o => o.createdAt && (now - o.createdAt) <= ms);
  }, [period, allOrders]);

  const filteredSold = useMemo(() => {
    const ms = periodMs[period];
    return allSold.filter(o => o.soldAt && (now - o.soldAt) <= ms);
  }, [period, allSold]);

  const liveCustom = customOrders.length;
  const liveStandard = sasiOrders.length;
  const pendingCount = [...customOrders, ...sasiOrders].filter(o => o.status === 'PENDING').length;
  const prodCount = [...customOrders, ...sasiOrders].filter(o => o.status === 'PROD').length;
  const readyCount = [...customOrders, ...sasiOrders].filter(o => o.status === 'READY').length;

  const avgTime = useMemo(() => {
    const calcAvg = (orders, fromKey, toKey) => {
      const valid = orders.filter(o => o[fromKey] && o[toKey]);
      if (!valid.length) return null;
      const total = valid.reduce((sum, o) => sum + (o[toKey] - o[fromKey]), 0);
      return Math.round(total / valid.length / 3600000);
    };
    const all = [...customOrders, ...soldOrders, ...sasiOrders, ...soldSasiOrders];
    return {
      toProd: calcAvg(all, 'createdAt', 'prodAt'),
      toReady: calcAvg(all, 'prodAt', 'readyAt'),
      toSold: calcAvg(all, 'readyAt', 'soldAt'),
    };
  }, [customOrders, soldOrders, sasiOrders, soldSasiOrders]);

  // Δημοφιλέστερα μοντέλα (μόνο σασι)
  const topModels = useMemo(() => {
    const counts = {};
    [...sasiOrders, ...soldSasiOrders].forEach(o => {
      if (o.model) counts[o.model] = (counts[o.model] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sasiOrders, soldSasiOrders]);

  // Δημοφιλέστερα μεγέθη — μόνο από πωλήσεις πορτών, top 20
  const topSizes = useMemo(() => {
    const counts = {};
    [...soldOrders, ...soldSasiOrders].forEach(o => {
      const size = o.size || (o.w && o.h ? `${o.h}x${o.w}` : null);
      const side = o.side || '—';
      const armor = o.armor || o.model || '—';
      if (size) {
        const key = `${size} | ${side} | ${armor}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  }, [soldOrders, soldSasiOrders]);

  // Πωλήσεις ανά ημέρα (τελευταίες 7 ημέρες)
  const salesByDay = useMemo(() => {
    const days = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      days[key] = 0;
    }
    allSold.forEach(o => {
      const date = new Date(o.soldAt || o.createdAt || 0);
      const key = `${date.getDate()}/${date.getMonth() + 1}`;
      if (days[key] !== undefined) days[key]++;
    });
    return days;
  }, [allSold]);

  const maxSales = Math.max(...Object.values(salesByDay), 1);

  // Συνολικές πωλήσεις (αξία)
  const totalRevenue = useMemo(() => {
    return filteredSold.reduce((sum, o) => sum + (o.totalPrice || o.price || 0), 0);
  }, [filteredSold]);

  return (
    <ScrollView style={styles.container}>
      <View style={{ paddingBottom: 40 }}>

        {/* ΦΙΛΤΡΟ ΠΕΡΙΟΔΟΥ */}
        <View style={styles.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ΚΟΥΤΙΑ ΣΥΝΟΨΗΣ */}
        <Text style={styles.sectionTitle}>ΣΥΝΟΨΗ</Text>
        <View style={styles.summaryGrid}>
          <StatBox label="Νέες Παραγγελίες" value={filtered.length} color="#007AFF" />
          <StatBox label="Πωλήσεις" value={filteredSold.length} color="#00C851" />
          <StatBox label="Έσοδα" value={totalRevenue > 0 ? `${totalRevenue}€` : '—'} color="#ff9500" />
          <StatBox label="Εκκρεμούν" value={pendingCount + prodCount + readyCount} color="#ff4444" />
        </View>

        {/* LIVE ΚΑΤΑΣΤΑΣΗ */}
        <Text style={styles.sectionTitle}>LIVE ΚΑΤΑΣΤΑΣΗ</Text>
        <View style={styles.card}>
          <StatusRow label="🔴 Προς Παραγωγή" value={pendingCount} />
          <StatusRow label="🟡 Στην Παραγωγή" value={prodCount} />
          <StatusRow label="🟢 Έτοιμα Αποθήκης" value={readyCount} />
          <View style={styles.divider} />
          <StatusRow label="📦 Ειδικές (ενεργές)" value={liveCustom} />
          <StatusRow label="📋 Τυποποιημένες (ενεργές)" value={liveStandard} />
        </View>

        {/* ΜΕΣΟΣ ΧΡΟΝΟΣ */}
        <Text style={styles.sectionTitle}>ΜΕΣΟΣ ΧΡΟΝΟΣ ΠΑΡΑΓΩΓΗΣ</Text>
        <View style={styles.card}>
          <TimeRow label="PENDING → ΠΑΡΑΓΩΓΗ" hours={avgTime.toProd} />
          <TimeRow label="ΠΑΡΑΓΩΓΗ → ΕΤΟΙΜΗ" hours={avgTime.toReady} />
          <TimeRow label="ΕΤΟΙΜΗ → ΠΩΛΗΣΗ" hours={avgTime.toSold} />
        </View>

        {/* ΠΩΛΗΣΕΙΣ ΤΕΛΕΥΤΑΙΕΣ 7 ΜΕΡΕΣ (bar chart) */}
        <Text style={styles.sectionTitle}>ΠΩΛΗΣΕΙΣ ΤΕΛΕΥΤΑΙΕΣ 7 ΗΜΕΡΕΣ</Text>
        <View style={[styles.card, { paddingTop: 16 }]}>
          <View style={styles.barChart}>
            {Object.entries(salesByDay).map(([day, count]) => (
              <View key={day} style={styles.barCol}>
                <Text style={styles.barValue}>{count > 0 ? count : ''}</Text>
                <View style={[styles.bar, { height: Math.max(4, (count / maxSales) * 80) }]} />
                <Text style={styles.barLabel}>{day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ΔΗΜΟΦΙΛΕΣΤΕΡΑ ΜΟΝΤΕΛΑ */}
        {topModels.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>🏆 ΔΗΜΟΦΙΛΕΣΤΕΡΑ ΜΟΝΤΕΛΑ</Text>
            <View style={styles.card}>
              {topModels.map(([model, count], i) => (
                <RankRow key={model} rank={i + 1} label={model} value={`${count} παρ.`} />
              ))}
            </View>
          </>
        )}

        {/* ΔΗΜΟΦΙΛΕΣΤΕΡΑ ΜΕΓΕΘΗ */}
        {topSizes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>📐 ΔΗΜΟΦΙΛΕΣΤΕΡΑ ΜΕΓΕΘΗ (ΑΠΟ ΠΩΛΗΣΕΙΣ)</Text>
            <View style={styles.card}>
              {topSizes.map(([combo, count], i) => (
                <RankRow key={combo} rank={i + 1} label={combo} value={`${count} πωλ.`} />
              ))}
            </View>
          </>
        )}

        {/* ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ */}
        <Text style={styles.sectionTitle}>💰 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ</Text>
        <View style={styles.card}>
          <StatusRow label="Ειδικές πωλήσεις" value={soldOrders.length} />
          <StatusRow label="Τυποποιημένες πωλήσεις" value={soldSasiOrders.length} />
          <StatusRow label="Σύνολο πωλήσεων" value={soldOrders.length + soldSasiOrders.length} bold />
        </View>

      </View>
    </ScrollView>
  );
}

// ---- ΜΙΚΡΑ COMPONENTS ----

function StatBox({ label, value, color }) {
  return (
    <View style={[styles.statBox, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StatusRow({ label, value, bold }) {
  return (
    <View style={styles.statusRow}>
      <Text style={[styles.statusLabel, bold && { fontWeight: 'bold' }]}>{label}</Text>
      <Text style={[styles.statusValue, bold && { fontWeight: 'bold', color: '#007AFF' }]}>{value}</Text>
    </View>
  );
}

function TimeRow({ label, hours }) {
  const display = hours === null ? '—' : hours < 24 ? `${hours}ω` : `${Math.round(hours / 24)}μ`;
  const color = hours === null ? '#ccc' : hours < 24 ? '#00C851' : hours < 72 ? '#ffbb33' : '#ff4444';
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color, fontWeight: 'bold' }]}>{display}</Text>
    </View>
  );
}

function RankRow({ rank, label, value }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{medals[rank - 1] || `${rank}.`} {label}</Text>
      <Text style={[styles.statusValue, { color: '#007AFF' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#f5f5f5' },
  periodRow: { flexDirection: 'row', marginBottom: 16, gap: 6 },
  periodBtn: { flex: 1, paddingVertical: 8, backgroundColor: '#e0e0e0', borderRadius: 20, alignItems: 'center' },
  periodBtnActive: { backgroundColor: '#1a1a1a' },
  periodText: { fontSize: 11, fontWeight: '700', color: '#777' },
  periodTextActive: { color: 'white' },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#888', marginTop: 16, marginBottom: 8, letterSpacing: 1 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statBox: { width: '47%', backgroundColor: '#fff', borderRadius: 10, padding: 14, borderTopWidth: 4, elevation: 1 },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 4, elevation: 1 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  statusLabel: { fontSize: 13, color: '#444' },
  statusValue: { fontSize: 13, color: '#333' },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 110, paddingBottom: 24 },
  barCol: { alignItems: 'center', flex: 1 },
  bar: { width: 28, backgroundColor: '#007AFF', borderRadius: 4 },
  barValue: { fontSize: 10, color: '#007AFF', fontWeight: 'bold', marginBottom: 2 },
  barLabel: { fontSize: 9, color: '#888', position: 'absolute', bottom: 0 },
});