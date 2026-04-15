import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import * as XLSX from 'xlsx';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { fmtDate, fmtDateTime, parseDateStr } from './utils';

const PERIODS = ['ΣΗΜΕΡΑ', 'ΕΒΔΟΜΑΔΑ', 'ΜΗΝΑΣ', 'ΟΛΕΣ'];
const YEAR_START = 2026;
const MONTHS_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

function getSelectableYears() {
  const maxY = Math.max(YEAR_START, new Date().getFullYear());
  const arr = [];
  for (let y = YEAR_START; y <= maxY; y++) arr.push(y);
  return arr;
}

function filterSoldByYear(orders, year) {
  return orders.filter((o) => {
    if (o.soldAt == null) return false;
    return new Date(o.soldAt).getFullYear() === year;
  });
}

function moniDipliLabel(o) {
  return o.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' ? 'ΔΙΠΛΗ' : 'ΜΟΝΗ';
}

function dimensionStr(o) {
  if (o.h != null && o.w != null && String(o.h) !== '' && String(o.w) !== '') return `${o.h}x${o.w}`;
  return o.size || '—';
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function computeYearStats(orders) {
  let moni = 0;
  let dipli = 0;
  const byMonth = Array(12).fill(0);
  const dimCount = {};
  orders.forEach((o) => {
    if (o.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ') dipli += 1;
    else moni += 1;
    if (o.soldAt) {
      byMonth[new Date(o.soldAt).getMonth()] += 1;
    }
    const dk = dimensionStr(o);
    dimCount[dk] = (dimCount[dk] || 0) + 1;
  });
  const top10 = Object.entries(dimCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  return { total: orders.length, moni, dipli, byMonth, top10 };
}

function deliveryDisplay(o) {
  if (!o.deliveryDate) return '';
  const p = parseDateStr(o.deliveryDate);
  if (p) return fmtDate(p.getTime());
  return String(o.deliveryDate);
}

function buildExcelRows(orders) {
  const header = [
    '#Παρ.',
    'Πελάτης',
    'Διάσταση',
    'Φορά',
    'ΜΟΝΗ/ΔΙΠΛΗ',
    'Hardware',
    'Lock',
    'Ημ.Καταχώρησης',
    'Ημ.Παράδοσης',
    'Ημ.Πώλησης',
  ];
  const sorted = [...orders].sort((a, b) => (a.soldAt || 0) - (b.soldAt || 0));
  const rows = sorted.map((o) => [
    o.orderNo ?? '',
    o.customer ?? '',
    dimensionStr(o),
    o.side || '—',
    moniDipliLabel(o),
    o.hardware || '—',
    o.lock || '—',
    o.createdAt ? fmtDateTime(o.createdAt) : '',
    deliveryDisplay(o),
    o.soldAt ? fmtDateTime(o.soldAt) : '',
  ]);
  return [header, ...rows];
}

function buildReportHtml(year, orders, stats) {
  const sorted = [...orders].sort((a, b) => (a.soldAt || 0) - (b.soldAt || 0));
  const monthRows = stats.byMonth
    .map((c, i) => `<tr><td>${MONTHS_EL[i]}</td><td style="text-align:right">${c}</td></tr>`)
    .join('');
  const topRows = stats.top10
    .map(([dim, c]) => `<tr><td>${escHtml(dim)}</td><td style="text-align:right">${c}</td></tr>`)
    .join('');
  const tableRows = sorted
    .map(
      (o) =>
        `<tr>
          <td>${escHtml(o.orderNo)}</td>
          <td>${escHtml(o.customer)}</td>
          <td>${escHtml(dimensionStr(o))}</td>
          <td>${escHtml(o.side || '—')}</td>
          <td>${escHtml(moniDipliLabel(o))}</td>
          <td>${escHtml(o.hardware || '—')}</td>
          <td>${escHtml(o.lock || '—')}</td>
          <td>${escHtml(o.createdAt ? fmtDateTime(o.createdAt) : '')}</td>
          <td>${escHtml(deliveryDisplay(o))}</td>
          <td>${escHtml(o.soldAt ? fmtDateTime(o.soldAt) : '')}</td>
        </tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>VAICON ${year}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 16px; color: #1a1a1a; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h2 { font-size: 14px; margin: 20px 0 8px; color: #444; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #eee; }
  .stats { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 8px; }
  .box { background: #f5f5f5; padding: 10px 14px; border-radius: 8px; }
</style></head><body>
  <h1>VAICON — Πωλήσεις ${year}</h1>
  <div class="stats">
    <div class="box"><strong>Σύνολο</strong><br/>${stats.total} παραγγελίες</div>
    <div class="box"><strong>ΜΟΝΗ</strong><br/>${stats.moni}</div>
    <div class="box"><strong>ΔΙΠΛΗ</strong><br/>${stats.dipli}</div>
  </div>
  <h2>Ανά μήνα</h2>
  <table><thead><tr><th>Μήνας</th><th>Πωλήσεις</th></tr></thead><tbody>${monthRows}</tbody></table>
  <h2>Top 10 διαστάσεις</h2>
  <table><thead><tr><th>Διάσταση</th><th>Πλήθος</th></tr></thead><tbody>${topRows}</tbody></table>
  <h2>Λίστα παραγγελιών</h2>
  <table>
    <thead><tr>
      <th>#Παρ.</th><th>Πελάτης</th><th>Διάσταση</th><th>Φορά</th><th>ΜΟΝΗ/ΔΙΠΛΗ</th><th>Hardware</th><th>Lock</th>
      <th>Ημ.Καταχ.</th><th>Ημ.Παράδ.</th><th>Ημ.Πώλησης</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</body></html>`;
}

async function downloadXlsxFile(year, rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Πωλήσεις');
  const filename = `vaicon_${year}.xlsx`;
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const base = cacheDirectory || '';
    const path = base + filename;
    await writeAsStringAsync(path, b64, { encoding: EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: filename,
      });
    }
  }
}

async function openSalesPdf(year, html) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0');
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }, 1000);
  } else {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `vaicon_${year}.pdf`,
      });
    }
  }
}

/** Διαγραφή επιτρέπεται από 1/2/(year+1) */
function isDeleteDateAllowed(year) {
  const now = new Date();
  const febFirst = new Date(year + 1, 1, 1);
  now.setHours(0, 0, 0, 0);
  febFirst.setHours(0, 0, 0, 0);
  return now >= febFirst;
}

export default function StatsScreen({
  customOrders,
  soldOrders,
  setSoldOrders,
  sasiOrders,
  soldSasiOrders,
  FIREBASE_URL,
  onClearSearchHighlight,
}) {
  const [period, setPeriod] = useState('ΜΗΝΑΣ');
  const [exportedYear, setExportedYear] = useState(null);
  const [showExportYearModal, setShowExportYearModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const sasiOrdersSafe = sasiOrders || [];
  const soldSasiOrdersSafe = soldSasiOrders || [];

  const allOrders = useMemo(
    () => [...customOrders, ...soldOrders, ...sasiOrdersSafe, ...soldSasiOrdersSafe],
    [customOrders, soldOrders, sasiOrdersSafe, soldSasiOrdersSafe]
  );
  const allSold = useMemo(
    () => [...soldOrders, ...soldSasiOrdersSafe],
    [soldOrders, soldSasiOrdersSafe]
  );

  const now = Date.now();
  const startOfToday = (() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const periodCutoff = {
    ΣΗΜΕΡΑ: startOfToday,
    ΕΒΔΟΜΑΔΑ: now - 7 * 24 * 60 * 60 * 1000,
    ΜΗΝΑΣ: now - 30 * 24 * 60 * 60 * 1000,
    ΟΛΕΣ: 0,
  };

  const filtered = useMemo(() => {
    const cutoff = periodCutoff[period];
    return allOrders.filter((o) => o.createdAt && o.createdAt >= cutoff);
  }, [period, allOrders]);

  const filteredSold = useMemo(() => {
    const cutoff = periodCutoff[period];
    return allSold.filter((o) => o.soldAt && o.soldAt >= cutoff);
  }, [period, allSold]);

  const liveStd = customOrders.length;
  const liveSasi = sasiOrdersSafe.length;
  const pendingCount =
    customOrders.filter(
      (o) => o.status === 'STD_PENDING' || o.status === 'STD_BUILD' || !o.status
    ).length + sasiOrdersSafe.filter((o) => o.status === 'PENDING').length;
  const prodCount =
    customOrders.filter((o) => o.status === 'MONI_PROD' || o.status === 'PROD').length +
    sasiOrdersSafe.filter((o) => o.status === 'PROD').length;
  const readyCount =
    customOrders.filter((o) => o.status === 'STD_READY' || o.status === 'READY').length +
    sasiOrdersSafe.filter((o) => o.status === 'READY').length;

  const avgTime = useMemo(() => {
    const calcAvg = (orders, fromKey, toKey) => {
      const valid = orders.filter((o) => o[fromKey] && o[toKey]);
      if (!valid.length) return null;
      const total = valid.reduce((sum, o) => sum + (o[toKey] - o[fromKey]), 0);
      return Math.round(total / valid.length / 3600000);
    };
    const all = [...customOrders, ...soldOrders, ...sasiOrdersSafe, ...soldSasiOrdersSafe];
    return {
      toProd: calcAvg(all, 'createdAt', 'prodAt'),
      toReady: calcAvg(all, 'prodAt', 'readyAt'),
      toSold: calcAvg(all, 'readyAt', 'soldAt'),
    };
  }, [customOrders, soldOrders, sasiOrdersSafe, soldSasiOrdersSafe]);

  const topModels = useMemo(() => {
    const counts = {};
    [...sasiOrdersSafe, ...soldSasiOrdersSafe].forEach((o) => {
      if (o.model) counts[o.model] = (counts[o.model] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [sasiOrdersSafe, soldSasiOrdersSafe]);

  const topSizes = useMemo(() => {
    const counts = {};
    [...soldOrders, ...soldSasiOrdersSafe].forEach((o) => {
      const size = o.size || (o.w && o.h ? `${o.h}x${o.w}` : null);
      const side = o.side || '—';
      const armor = o.armor || o.model || '—';
      if (size) {
        const key = `${size} | ${side} | ${armor}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [soldOrders, soldSasiOrdersSafe]);

  const salesByDay = useMemo(() => {
    const days = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      days[key] = 0;
    }
    allSold.forEach((o) => {
      const date = new Date(o.soldAt || o.createdAt || 0);
      const key = `${date.getDate()}/${date.getMonth() + 1}`;
      if (days[key] !== undefined) days[key] += 1;
    });
    return days;
  }, [allSold]);

  const maxSales = Math.max(...Object.values(salesByDay), 1);

  const totalRevenue = useMemo(() => {
    return filteredSold.reduce((sum, o) => sum + (o.totalPrice || o.price || 0), 0);
  }, [filteredSold]);

  const selectableYears = useMemo(() => getSelectableYears(), []);
  const deleteTargetCount = exportedYear != null ? filterSoldByYear(soldOrders, exportedYear).length : 0;

  const runExportForYear = async (year) => {
    const list = filterSoldByYear(soldOrders, year);
    if (list.length === 0) {
      Alert.alert('', `Δεν υπάρχουν πωλήσεις για το ${year}`);
      return;
    }
    const stats = computeYearStats(list);
    const rows = buildExcelRows(list);
    try {
      await downloadXlsxFile(year, rows);
      const html = buildReportHtml(year, list, stats);
      await openSalesPdf(year, html);
      setExportedYear(year);
      setShowExportYearModal(false);
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η εξαγωγή δεν ολοκληρώθηκε.');
    }
  };

  const onPressDeleteYear = () => {
    if (exportedYear !== null && !isDeleteDateAllowed(exportedYear)) {
      Alert.alert(
        '',
        `Η διαγραφή των παραγγελιών του ${exportedYear} επιτρέπεται από 1/2/${exportedYear + 1}. Δεν μπορείς να διαγράψεις ακόμα.`
      );
      return;
    }
    if (exportedYear === null) {
      Alert.alert('', 'Πρέπει πρώτα να κάνεις Εξαγωγή!');
      return;
    }
    const n = filterSoldByYear(soldOrders, exportedYear).length;
    if (n === 0) {
      Alert.alert('', 'Δεν υπάρχουν παραγγελίες για διαγραφή.');
      return;
    }
    setShowDeleteModal(true);
  };

  const confirmDeleteYear = async () => {
    if (exportedYear === null || !FIREBASE_URL) {
      setShowDeleteModal(false);
      return;
    }
    const list = filterSoldByYear(soldOrders, exportedYear);
    const ids = list.map((o) => o.id).filter(Boolean);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`${FIREBASE_URL}/std_orders/${id}.json`, { method: 'DELETE' })
        )
      );
      setSoldOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
      setExportedYear(null);
    } catch (e) {
      console.error(e);
      Alert.alert('Σφάλμα', 'Η διαγραφή δεν ολοκληρώθηκε.');
    }
    setShowDeleteModal(false);
  };

  return (
    <ScrollView
      style={styles.container}
      onScrollBeginDrag={onClearSearchHighlight}
      onTouchStart={onClearSearchHighlight}
    >
      <View style={{ paddingBottom: 40 }}>
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>ΣΥΝΟΨΗ</Text>
        <View style={styles.summaryGrid}>
          <StatBox label="Νέες Παραγγελίες" value={filtered.length} color="#007AFF" />
          <StatBox label="Πωλήσεις" value={filteredSold.length} color="#00C851" />
          <StatBox label="Έσοδα" value={totalRevenue > 0 ? `${totalRevenue}€` : '—'} color="#ff9500" />
          <StatBox label="Εκκρεμούν" value={pendingCount + prodCount + readyCount} color="#ff4444" />
        </View>

        <Text style={styles.sectionTitle}>LIVE ΚΑΤΑΣΤΑΣΗ</Text>
        <View style={styles.card}>
          <StatusRow label="🔴 Προς Παραγωγή" value={pendingCount} />
          <StatusRow label="🟡 Στην Παραγωγή" value={prodCount} />
          <StatusRow label="🟢 Έτοιμα Αποθήκης" value={readyCount} />
          <View style={styles.divider} />
          <StatusRow label="🚪 Τυποποιημένες πόρτες (ενεργές)" value={liveStd} />
          <StatusRow label="🔧 Παραγγελίες Σασί (ενεργές)" value={liveSasi} />
        </View>

        <Text style={styles.sectionTitle}>ΜΕΣΟΣ ΧΡΟΝΟΣ ΠΑΡΑΓΩΓΗΣ</Text>
        <View style={styles.card}>
          <TimeRow label="PENDING → ΠΑΡΑΓΩΓΗ" hours={avgTime.toProd} />
          <TimeRow label="ΠΑΡΑΓΩΓΗ → ΕΤΟΙΜΗ" hours={avgTime.toReady} />
          <TimeRow label="ΕΤΟΙΜΗ → ΠΩΛΗΣΗ" hours={avgTime.toSold} />
        </View>

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

        <Text style={styles.sectionTitle}>💰 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ</Text>
        <View style={styles.card}>
          <StatusRow label="Ειδικές πωλήσεις" value={soldOrders.length} />
          <StatusRow label="Τυποποιημένες πωλήσεις" value={soldSasiOrdersSafe.length} />
          <StatusRow label="Σύνολο πωλήσεων" value={soldOrders.length + soldSasiOrdersSafe.length} bold />
        </View>

        <View style={styles.exportBtnRow}>
          <TouchableOpacity
            style={[styles.exportBtn, styles.exportBtnGreen]}
            onPress={() => setShowExportYearModal(true)}
          >
            <Text style={styles.exportBtnText}>📥 Εξαγωγή Έτους</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportBtn, styles.exportBtnRed]} onPress={onPressDeleteYear}>
            <Text style={styles.exportBtnText}>🗑️ Διαγραφή Έτους</Text>
          </TouchableOpacity>
        </View>
        {exportedYear != null && (
          <Text style={styles.exportedHint}>Τελευταία εξαγωγή: {exportedYear}</Text>
        )}
      </View>

      <Modal
        visible={showExportYearModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportYearModal(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.yearModalBox}>
            <Text style={styles.yearModalTitle}>Επιλογή έτους εξαγωγής</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {selectableYears.map((y) => (
                <TouchableOpacity
                  key={y}
                  style={styles.yearRow}
                  onPress={() => runExportForYear(y)}
                >
                  <Text style={styles.yearRowText}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalCloseBtn, { marginTop: 12 }]}
              onPress={() => setShowExportYearModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>ΚΛΕΙΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.yearModalBox}>
            <Text style={styles.deleteModalText}>
              {`Θέλεις να διαγράψεις ΟΡΙΣΤΙΚΑ τις ${deleteTargetCount} παραγγελίες του ${exportedYear} από το Firebase; Η ενέργεια αυτή είναι μη αναστρέψιμη. (Επιτρεπτή από 1/2/${exportedYear != null ? exportedYear + 1 : '—'})`}
            </Text>
            <View style={styles.deleteModalBtns}>
              <TouchableOpacity style={[styles.exportBtn, styles.exportBtnRed, { flex: 1 }]} onPress={confirmDeleteYear}>
                <Text style={styles.exportBtnText}>ΝΑΙ, ΔΙΑΓΡΑΦΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportBtn, { flex: 1, backgroundColor: '#666' }]}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.exportBtnText}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

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
      <Text style={styles.statusLabel}>
        {medals[rank - 1] || `${rank}.`} {label}
      </Text>
      <Text style={[styles.statusValue, { color: '#007AFF' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#f5f5f5' },
  periodRow: { flexDirection: 'row', marginBottom: 16, gap: 6 },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 20,
    alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: '#1a1a1a' },
  periodText: { fontSize: 11, fontWeight: '700', color: '#777' },
  periodTextActive: { color: 'white' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#888',
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: 1,
  },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statBox: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderTopWidth: 4,
    elevation: 1,
  },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
    elevation: 1,
  },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statusLabel: { fontSize: 13, color: '#444' },
  statusValue: { fontSize: 13, color: '#333' },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 110,
    paddingBottom: 24,
  },
  barCol: { alignItems: 'center', flex: 1 },
  bar: { width: 28, backgroundColor: '#007AFF', borderRadius: 4 },
  barValue: { fontSize: 10, color: '#007AFF', fontWeight: 'bold', marginBottom: 2 },
  barLabel: { fontSize: 9, color: '#888', position: 'absolute', bottom: 0 },
  exportBtnRow: { gap: 10, marginTop: 12 },
  exportBtn: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
  },
  exportBtnGreen: { backgroundColor: '#1b5e20' },
  exportBtnRed: { backgroundColor: '#8B0000' },
  exportBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  exportedHint: { fontSize: 12, color: '#666', marginTop: 8, textAlign: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  yearModalBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxWidth: 360,
  },
  yearModalTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  yearRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  yearRowText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  modalCloseBtn: { backgroundColor: '#333', padding: 12, borderRadius: 8, alignItems: 'center' },
  modalCloseBtnText: { color: 'white', fontWeight: 'bold' },
  deleteModalText: { fontSize: 14, color: '#333', lineHeight: 22, marginBottom: 16 },
  deleteModalBtns: { flexDirection: 'row', gap: 10 },
});
