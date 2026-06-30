import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { FIREBASE_URL } from './firebaseConfig';
import { SIZE_OPTIONS, COLOR_OPTIONS, COLOR_MAP, getFormatStyle, sortCoatingsGrouped, canMoveCoatingInGroup } from './formatHelpers';
import { printHTML } from './printUtils';

export default function CoatingsScreen({ coatings, setCoatings, isAdmin = false, onClose }) {
  const [form, setForm] = useState('');
  const [fmtBold, setFmtBold] = useState(false);
  const [fmtSize, setFmtSize] = useState('M');
  const [fmtColor, setFmtColor] = useState('black');
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const resetForm = () => { setForm(''); setFmtBold(false); setFmtSize('M'); setFmtColor('black'); setEditingId(null); };

  const syncToCloud = async (coating) => {
    try {
      await fetch(`${FIREBASE_URL}/coatings/${coating.id}.json`, { method: 'PUT', body: JSON.stringify(coating) });
    } catch { Alert.alert("Σφάλμα", "Δεν αποθηκεύτηκε στο Cloud."); }
  };

  const propagateCoatingRename = async (oldName, newName) => {
    if (oldName === newName) return;
    try {
      const res = await fetch(`${FIREBASE_URL}/std_orders.json`);
      const data = await res.json();
      if (!data) return;
      const patch = {};
      for (const [id, order] of Object.entries(data)) {
        if (order.coatings && order.coatings.includes(oldName)) {
          patch[id] = { ...order, coatings: order.coatings.map(c => c === oldName ? newName : c) };
        }
      }
      if (Object.keys(patch).length === 0) return;
      await fetch(`${FIREBASE_URL}/std_orders.json`, { method: 'PATCH', body: JSON.stringify(patch) });
    } catch(e) { console.warn('Propagate coating rename error:', e); }
  };

  const deleteFromCloud = async (id) => {
    try { await fetch(`${FIREBASE_URL}/coatings/${id}.json`, { method: 'DELETE' }); } catch(e) {}
  };

  const moveCoating = async (index, direction) => {
    const newList = [...sorted];
    const swapIndex = index + direction;
    if (!canMoveCoatingInGroup(newList, index, direction)) return;
    [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];
    const withOrder = newList.map((c, i) => ({ ...c, order: i }));
    setCoatings(withOrder);
    await Promise.all(withOrder.map(c => fetch(`${FIREBASE_URL}/coatings/${c.id}.json`, { method: 'PATCH', body: JSON.stringify({ order: c.order }) })));
  };

  const saveCoating = async () => {
    if (!form.trim()) return Alert.alert("Προσοχή", "Βάλτε όνομα επένδυσης.");
    const badChar = (form.match(/[.#$/\[\]]/) || [])[0];
    if (badChar) return Alert.alert("Μη επιτρεπτός χαρακτήρας", `Το όνομα «${form.trim()}» έχει τον χαρακτήρα « ${badChar} » που δεν επιτρέπεται ( . / # $ [ ] ).\nΑφαίρεσέ τον (π.χ. «PVC. ΕΞΩ» → «PVC ΕΞΩ»).`);
    if (editingId) {
      const existing = coatings.find(c => c.id === editingId);
      if (!existing) return Alert.alert("Προσοχή", "Η εγγραφή δεν βρέθηκε, ανανεώστε τη σελίδα.");
      const oldName = existing.name;
      const updated = { ...existing, name: form.trim(), bold: fmtBold, size: fmtSize, color: fmtColor };
      setCoatings(coatings.map(c => c.id === editingId ? updated : c));
      await syncToCloud(updated);
      await propagateCoatingRename(oldName, form.trim());
      Alert.alert("VAICON", `Η επένδυση ενημερώθηκε!\n${form.trim()}`);
    } else {
      const exists = coatings.some(c => c.name.toLowerCase() === form.trim().toLowerCase());
      if (exists) return Alert.alert("Προσοχή", "Αυτή η επένδυση υπάρχει ήδη.");
      const newCoating = { id: Date.now().toString(), name: form.trim(), createdAt: Date.now(), order: coatings.length, bold: fmtBold, size: fmtSize, color: fmtColor };
      setCoatings([...coatings, newCoating]);
      await syncToCloud(newCoating);
      Alert.alert("VAICON", `Επένδυση αποθηκεύτηκε!\n${form.trim()}`);
    }
    resetForm();
  };

  const editCoating = (coating) => {
    setForm(coating.name);
    setFmtBold(!!coating.bold);
    setFmtSize(coating.size || 'M');
    setFmtColor(coating.color || 'black');
    setEditingId(coating.id);
  };

  const deleteCoating = (id) => {
    Alert.alert("Διαγραφή", "Οριστική διαγραφή επένδυσης;", [
      { text: "Όχι" },
      { text: "Ναι", style: "destructive", onPress: async () => {
        setCoatings(coatings.filter(c => c.id !== id));
        await deleteFromCloud(id);
      }}
    ]);
  };

  const getCoatingBg = (name) => {
    const n = name?.toLowerCase() || '';
    if (n.includes('μέσα') || n.includes('μεσα')) return '#E8F4FD';
    if (n.includes('έξω') || n.includes('εξω')) return '#FFF3E0';
    return '#ffffff';
  };

  const getCoatingBorder = (name) => {
    const n = name?.toLowerCase() || '';
    if (n.includes('μέσα') || n.includes('μεσα')) return '#90CAF9';
    if (n.includes('έξω') || n.includes('εξω')) return '#FFCC80';
    return '#007AFF';
  };

  const sorted = sortCoatingsGrouped(coatings);
  const filtered = sorted.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const printCoatings = () => {
    const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const cat = (name) => { const n = String(name || '').toUpperCase(); if (n.includes('ΜΕΣΑ') || n.includes('ΕΣΩΤ')) return 0; if (n.includes('ΕΞΩ')) return 1; return 2; };
    const buckets = [[], [], []];
    sorted.forEach(c => buckets[cat(c.name)].push(c.name));
    const titles = ['ΕΣΩΤΕΡΙΚΕΣ', 'ΕΞΩΤΕΡΙΚΕΣ', 'ΛΟΙΠΕΣ'];
    const colors = ['#1565C0', '#e65100', '#444'];
    const sections = buckets.map((arr, i) => arr.length
      ? `<div class="grp"><h2 style="color:${colors[i]}">${titles[i]} (${arr.length})</h2><ol>${arr.map(n => `<li>${esc(n)}</li>`).join('')}</ol></div>` : '').join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>ΕΠΕΝΔΥΣΕΙΣ</title><style>
      body{font-family:Arial,sans-serif;margin:12mm;color:#000}
      h1{font-size:22px;margin:0 0 12px}
      .grp{margin-bottom:18px}
      h2{font-size:15px;margin:0 0 6px;border-bottom:2px solid #ccc;padding-bottom:3px}
      ol{margin:0;padding-left:26px}
      li{font-size:13px;padding:2px 0}
      @media print{@page{size:A4 portrait;margin:12mm}}
    </style></head><body><h1>🎨 ΕΠΕΝΔΥΣΕΙΣ — ΛΙΣΤΑ</h1>${sections || '<p>Καμία επένδυση.</p>'}</body></html>`;
    printHTML(html, 'VAICON — ΕΠΕΝΔΥΣΕΙΣ');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎨 ΕΠΕΝΔΥΣΕΙΣ</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>{editingId ? 'ΕΠΕΞΕΡΓΑΣΙΑ ΕΠΕΝΔΥΣΗΣ' : 'ΝΕΑ ΕΠΕΝΔΥΣΗ'}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="π.χ. Δερματίνη, Inox, Ξύλο..."
            value={form}
            onChangeText={setForm}
            autoCapitalize="characters"
          />
          <TouchableOpacity style={styles.saveBtn} onPress={saveCoating}>
            <Text style={styles.saveTxt}>{editingId ? '✓' : '+'}</Text>
          </TouchableOpacity>
        </View>

        {/* ΜΟΡΦΟΠΟΙΗΣΗ — bold/μέγεθος/χρώμα, όπως στο vaicon-eidikes */}
        <View style={styles.fmtBox}>
          <Text style={styles.fmtTitle}>🎨 ΜΟΡΦΟΠΟΙΗΣΗ</Text>
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Προεπισκόπηση:</Text>
            <Text style={[styles.previewText, getFormatStyle({bold:fmtBold,size:fmtSize,color:fmtColor}, 14)]}>
              {form.trim() || 'ΠΛΗΚΤΡΟΛΟΓΗΣΤΕ...'}
            </Text>
          </View>

          <View style={styles.fmtRow}>
            <Text style={styles.fmtLabel}>💪 Bold:</Text>
            <TouchableOpacity style={[styles.fmtBtn, !fmtBold && styles.fmtBtnActive]} onPress={()=>setFmtBold(false)}>
              <Text style={[styles.fmtBtnTxt, !fmtBold && styles.fmtBtnTxtActive]}>ΟΧΙ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.fmtBtn, fmtBold && styles.fmtBtnActive]} onPress={()=>setFmtBold(true)}>
              <Text style={[styles.fmtBtnTxt, fmtBold && styles.fmtBtnTxtActive]}>ΝΑΙ</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fmtRow}>
            <Text style={styles.fmtLabel}>🔠 Μέγεθος:</Text>
            {SIZE_OPTIONS.map(s=>(
              <TouchableOpacity key={s} style={[styles.fmtBtn, fmtSize===s && styles.fmtBtnActive]} onPress={()=>setFmtSize(s)}>
                <Text style={[styles.fmtBtnTxt, fmtSize===s && styles.fmtBtnTxtActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.fmtRow}>
            <Text style={styles.fmtLabel}>🎨 Χρώμα:</Text>
            {COLOR_OPTIONS.map(co=>(
              <TouchableOpacity key={co.key} style={[styles.colorBtn, {borderColor: fmtColor===co.key ? '#000' : 'transparent', backgroundColor: COLOR_MAP[co.key]+'22'}]} onPress={()=>setFmtColor(co.key)}>
                <Text style={{fontSize:18}}>{co.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {editingId && (
          <TouchableOpacity onPress={resetForm} style={styles.cancelEdit}>
            <Text style={styles.cancelTxt}>ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        )}

        <View style={styles.toolbar}>
          {isAdmin && (
            <TouchableOpacity style={styles.printBtn} onPress={printCoatings}>
              <Text style={styles.printTxt}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
            </TouchableOpacity>
          )}
          <TextInput style={styles.search} placeholder="🔍 Αναζήτηση..." value={search} onChangeText={setSearch} />
        </View>

        <Text style={styles.count}>Σύνολο: {coatings.length} επενδύσεις</Text>

        <ScrollView>
          {sorted.map((c, sortedIdx) => {
            if (!c.name.toLowerCase().includes(search.toLowerCase())) return null;
            return (
              <View key={c.id} style={[styles.card, {backgroundColor: getCoatingBg(c.name), borderLeftColor: getCoatingBorder(c.name)}]}>
                <View style={styles.orderBtns}>
                  <TouchableOpacity onPress={() => moveCoating(sortedIdx, -1)} disabled={!canMoveCoatingInGroup(sorted, sortedIdx, -1)}>
                    <Text style={[styles.orderBtn, !canMoveCoatingInGroup(sorted, sortedIdx, -1) && {opacity:0.2}]}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveCoating(sortedIdx, 1)} disabled={!canMoveCoatingInGroup(sorted, sortedIdx, 1)}>
                    <Text style={[styles.orderBtn, !canMoveCoatingInGroup(sorted, sortedIdx, 1) && {opacity:0.2}]}>▼</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.cardName, getFormatStyle(c, 14)]}>{c.name}</Text>
                <View style={styles.cardBtns}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => editCoating(c)}>
                    <Text style={styles.editTxt}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteCoating(c.id)}>
                    <Text style={styles.deleteTxt}>🗑</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {filtered.length === 0 && <Text style={styles.empty}>Δεν βρέθηκαν επενδύσεις.</Text>}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#1a1a1a', padding: 16, paddingTop: 48, flexDirection: 'row', alignItems: 'center' },
  closeBtn: { marginRight: 16, padding: 4 },
  closeTxt: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  headerTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  body: { flex: 1, padding: 16 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: { flex: 1, backgroundColor: 'white', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#ddd', fontSize: 14 },
  saveBtn: { backgroundColor: '#007AFF', borderRadius: 8, width: 48, justifyContent: 'center', alignItems: 'center' },
  saveTxt: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  cancelEdit: { alignSelf: 'flex-start', marginBottom: 8 },
  cancelTxt: { color: '#ff4444', fontSize: 12, fontWeight: 'bold' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  printBtn: { backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, justifyContent: 'center' },
  printTxt: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  search: { flex: 1, maxWidth: 260, backgroundColor: 'white', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#ddd' },
  count: { fontSize: 11, color: '#999', marginBottom: 8 },
  card: { backgroundColor: 'white', borderRadius: 8, padding: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', elevation: 1, borderLeftWidth: 4, borderLeftColor: '#007AFF' },
  orderBtns: { flexDirection: 'column', marginRight: 8, gap: 2 },
  orderBtn: { fontSize: 14, color: '#8B0000', fontWeight: 'bold', paddingHorizontal: 2 },
  cardName: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  cardBtns: { flexDirection: 'row', gap: 8 },
  editBtn: { padding: 6 },
  editTxt: { fontSize: 16 },
  deleteBtn: { padding: 6 },
  deleteTxt: { fontSize: 16 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
  fmtBox: { backgroundColor: '#fafafa', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#e0e0e0' },
  fmtTitle: { fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 6 },
  previewBox: { backgroundColor: 'white', borderRadius: 6, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  previewLabel: { fontSize: 9, color: '#999', marginBottom: 2 },
  previewText: { fontSize: 14, color: '#000' },
  fmtRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  fmtLabel: { fontSize: 11, color: '#555', minWidth: 75 },
  fmtBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5, backgroundColor: '#e0e0e0', minWidth: 32, alignItems: 'center' },
  fmtBtnActive: { backgroundColor: '#007AFF' },
  fmtBtnTxt: { fontSize: 11, fontWeight: 'bold', color: '#555' },
  fmtBtnTxtActive: { color: 'white' },
  colorBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
