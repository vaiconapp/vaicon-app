import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, LayoutAnimation, Modal } from 'react-native';
import { FIREBASE_URL } from './App';

function SellModal({ visible, totalQty, onConfirm, onCancel }) {
  const [qty, setQty] = React.useState('');
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>ΜΕΡΙΚΗ ΠΩΛΗΣΗ</Text>
          <Text style={styles.modalSub}>Πόσα τεμάχια θα πουληθούν;</Text>
          <Text style={styles.modalTotal}>Σύνολο: {totalQty} τεμ.</Text>
          <TextInput style={styles.modalInput} keyboardType="numeric" value={qty} onChangeText={setQty} placeholder="π.χ. 2" autoFocus />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => { setQty(''); onCancel(); }}><Text style={{ fontWeight: 'bold' }}>ΑΚΥΡΟ</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#8B0000' }]} onPress={() => { const n = parseInt(qty); if (!n || n < 1 || n > totalQty) return Alert.alert('Σφάλμα', 'Βάλτε έγκυρο αριθμό'); setQty(''); onConfirm(n); }}><Text style={{ fontWeight: 'bold', color: 'white' }}>ΠΩΛΗΣΗ</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const fmtDate = (ts) => { if (!ts) return null; const d = new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };

const HEIGHTS = ['203', '208', '213', '218', '223'];
const WIDTHS  = ['83', '88', '93', '98', '103'];
const MODELS  = ['ΚΑΣΑ ΚΛΕΙΣΤΗ', 'ΚΑΣΑ ΑΝΟΙΧΤΗ'];

const INIT = { model: MODELS[0], selectedHeight: '', selectedWidth: '', qty: '1', side: 'ΔΕΞΙΑ', notes: '', status: 'PENDING' };

export default function CaseScreen({ caseOrders, setCaseOrders, soldCaseOrders, setSoldCaseOrders }) {
  const [expanded, setExpanded] = useState({ pending: false, prod: false, ready: false, archive: false });
  const [form, setForm] = useState(INIT);
  const [sellModal, setSellModal] = useState({ visible: false, orderId: null, totalQty: 1 });

  const syncToCloud = async (order) => {
    try { await fetch(`${FIREBASE_URL}/case_orders/${order.id}.json`, { method: 'PUT', body: JSON.stringify(order) }); }
    catch { Alert.alert("Σφάλμα", "Δεν αποθηκεύτηκε στο Cloud."); }
  };
  const deleteFromCloud = async (id) => { try { await fetch(`${FIREBASE_URL}/case_orders/${id}.json`, { method: 'DELETE' }); } catch(e){} };

  const saveOrder = async () => {
    if (!form.selectedHeight) return Alert.alert("Προσοχή", "Επιλέξτε Ύψος.");
    if (!form.selectedWidth)  return Alert.alert("Προσοχή", "Επιλέξτε Πλάτος.");
    if (!form.qty || parseInt(form.qty) < 1) return Alert.alert("Προσοχή", "Βάλτε ποσότητα.");
    const newOrder = { ...form, id: Date.now().toString(), size: `${form.selectedHeight}x${form.selectedWidth}`, createdAt: Date.now() };
    setCaseOrders([newOrder, ...caseOrders]);
    await syncToCloud(newOrder);
    setForm(INIT);
    Alert.alert("VAICON", `Αποθηκεύτηκε!\n${form.model}\n${newOrder.size} | ${form.side}`);
  };

  const editOrder = (order) => {
    const p = order.size?.split('x') || ['',''];
    setForm({ ...order, selectedHeight: p[0], selectedWidth: p[1] });
    setCaseOrders(caseOrders.filter(o => o.id !== order.id));
    deleteFromCloud(order.id);
  };

  const updateStatus = async (id, newStatus) => {
    const now = Date.now();
    const order = caseOrders.find(o => o.id === id);
    if (!order) return;
    if (newStatus === 'SOLD') {
      const totalQty = parseInt(order.qty) || 1;
      if (totalQty <= 1) {
        const upd = { ...order, status: 'SOLD', soldAt: now };
        setSoldCaseOrders([upd, ...soldCaseOrders]);
        setCaseOrders(caseOrders.filter(o => o.id !== id));
        await syncToCloud(upd);
      } else {
        setSellModal({ visible: true, orderId: id, totalQty });
      }
    } else {
      let upd;
      setCaseOrders(caseOrders.map(o => { if (o.id === id) { upd = { ...o, status: newStatus, [`${newStatus.toLowerCase()}At`]: now }; return upd; } return o; }));
      if (upd) await syncToCloud(upd);
    }
  };

  const handleSellConfirm = async (sellQty) => {
    const now = Date.now();
    const { orderId, totalQty } = sellModal;
    setSellModal({ visible: false, orderId: null, totalQty: 1 });
    const order = caseOrders.find(o => o.id === orderId);
    if (!order) return;
    if (sellQty === totalQty) {
      const upd = { ...order, status: 'SOLD', soldAt: now };
      setSoldCaseOrders([upd, ...soldCaseOrders]);
      setCaseOrders(caseOrders.filter(o => o.id !== orderId));
      await syncToCloud(upd);
    } else {
      const soldEntry = { ...order, id: Date.now().toString(), qty: String(sellQty), status: 'SOLD', soldAt: now, partialNote: `${sellQty} από ${totalQty}` };
      const remaining = { ...order, qty: String(totalQty - sellQty), remainingNote: `Υπόλοιπο: ${totalQty - sellQty} από ${totalQty}` };
      setSoldCaseOrders([soldEntry, ...soldCaseOrders]);
      setCaseOrders(caseOrders.map(o => o.id === orderId ? remaining : o));
      await syncToCloud(soldEntry);
      await syncToCloud(remaining);
    }
  };

  const moveBack = async (id, currentStatus) => {
    const prev = currentStatus === 'READY' ? 'PROD' : 'PENDING';
    const order = caseOrders.find(o => o.id === id);
    const upd = { ...order, status: prev };
    setCaseOrders(caseOrders.map(o => o.id === id ? upd : o));
    await syncToCloud(upd);
  };

  const cancelOrder = (id) => Alert.alert("Ακύρωση", "Οριστική διαγραφή;", [{ text: "Όχι" }, { text: "Ναι", style: "destructive", onPress: async () => { setCaseOrders(caseOrders.filter(o => o.id !== id)); await deleteFromCloud(id); } }]);
  const deleteFromArchive = (id) => Alert.alert("Διαγραφή", "Διαγραφή από αρχείο;", [{ text: "Όχι" }, { text: "Ναι", style: "destructive", onPress: async () => { setSoldCaseOrders(soldCaseOrders.filter(o => o.id !== id)); await deleteFromCloud(id); } }]);
  const toggle = (s) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setExpanded({ ...expanded, [s]: !expanded[s] }); };

  const renderCard = (order, isArchive = false) => {
    const bc = isArchive ? '#333' : (order.status==='PENDING'?'#ff4444':order.status==='PROD'?'#ffbb33':'#00C851');
    const next = order.status==='PENDING'?'PROD':order.status==='PROD'?'READY':'SOLD';
    const btn = isArchive?'ΔΙΑΓΡΑΦΗ':(order.status==='PENDING'?'ΕΝΑΡΞΗ':order.status==='PROD'?'ΕΤΟΙΜΗ':'ΠΩΛΗΣΗ');
    const btnC = isArchive?'#000':(order.status==='PENDING'?'#ffbb33':order.status==='PROD'?'#00C851':'#222');
    return (
      <TouchableOpacity key={order.id} onLongPress={() => !isArchive && editOrder(order)} delayLongPress={1000} activeOpacity={0.7} style={[styles.orderCard, { borderLeftColor: bc }, order.isAuto && {backgroundColor:'#fffde7', borderLeftColor:'#FFC107'}]}>
        <View style={styles.cardContent}>
          <Text style={styles.cardModel}>{order.model}{order.isAuto ? ' ⚡' : ''}</Text>
          <Text style={styles.cardDetails}>{order.size} | {order.side}</Text>
          <Text style={styles.cardSub}>Τεμ: <Text style={{ fontWeight:'bold', color:'#007AFF' }}>{order.qty}</Text>{order.remainingNote ? <Text style={{ color:'#ff6600' }}> ({order.remainingNote})</Text> : null}</Text>
          {order.autoNote ? (()=>{
            const totalQtyNum = parseInt(order.qty)||1;
            const reserved = order.autoNote.split(',').reduce((sum, entry) => {
              const match = entry.trim().match(/^(.+)\s+\((\d+)τεμ\)$/);
              return sum + (match ? parseInt(match[2]) : 0);
            }, 0);
            const free = totalQtyNum - reserved;
            return (<>
              <Text style={{fontSize:11, color:'#E65100', fontWeight:'bold', marginTop:2}}>📌 {order.autoNote}</Text>
              <Text style={{fontSize:11, color:'#555', marginTop:1}}>Δεσμευμένα: <Text style={{fontWeight:'bold', color:'#E65100'}}>{reserved}</Text> | Υπόλοιπο αποθήκης: <Text style={{fontWeight:'bold', fontSize:16, color:'#00796B'}}>{free}</Text></Text>
            </>);
          })() : null}
          {order.notes ? <Text style={styles.cardNotes}>Σημ: {order.notes}</Text> : null}
          <View style={styles.datesRow}>
            {fmtDate(order.createdAt) && <Text style={styles.dateChip}>📅 {fmtDate(order.createdAt)}</Text>}
            {fmtDate(order.prodAt)    && <Text style={styles.dateChip}>🔨 {fmtDate(order.prodAt)}</Text>}
            {fmtDate(order.readyAt)   && <Text style={styles.dateChip}>✅ {fmtDate(order.readyAt)}</Text>}
            {fmtDate(order.soldAt)    && <Text style={styles.dateChip}>💰 {fmtDate(order.soldAt)}</Text>}
          </View>
        </View>
        <View style={styles.sideBtns}>
          {!isArchive && <TouchableOpacity style={[styles.upperBtn, { backgroundColor: order.status==='PENDING'?'#000':'#666' }]} onPress={() => order.status==='PENDING'?cancelOrder(order.id):moveBack(order.id,order.status)}><Text style={[styles.upperTxt, { color: order.status==='PENDING'?'#ff4444':'white' }]}>{order.status==='PENDING'?'ΑΚΥΡΩΣΗ':'⟲'}</Text></TouchableOpacity>}
          <TouchableOpacity style={[styles.lowerBtn, { backgroundColor: btnC }]} onPress={() => isArchive?deleteFromArchive(order.id):updateStatus(order.id,next)}><Text style={styles.lowerTxt}>{btn}</Text></TouchableOpacity>        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <SellModal visible={sellModal.visible} totalQty={sellModal.totalQty} onConfirm={handleSellConfirm} onCancel={() => setSellModal({ visible: false, orderId: null, totalQty: 1 })} />
    <ScrollView style={{ padding: 10 }}>
      <View style={{ paddingBottom: 120 }}>
        <View style={styles.bigHeader}><Text style={styles.bigHeaderTxt}>🔲 ΤΥΠΟΠΟΙΗΜΕΝΕΣ ΚΑΣΕΣ ΣΤΟΚ</Text></View>
        <Text style={styles.sectionTitle}>ΚΑΤΑΧΩΡΗΣΗ ΤΥΠΟΠΟΙΗΜΕΝΗΣ ΚΑΣΑΣ</Text>

        <Text style={styles.label}>Τύπος Κάσας:</Text>
        <View style={[styles.row, { marginBottom: 12 }]}>
          {MODELS.map(m => <TouchableOpacity key={m} style={[styles.tab, form.model===m && styles.activeTab]} onPress={() => setForm({...form, model:m})}><Text style={{ color: form.model===m?'white':'black', fontWeight:'bold', fontSize:12 }}>{m}</Text></TouchableOpacity>)}
        </View>

        <Text style={styles.label}>Ύψος (cm):</Text>
        <View style={[styles.row, { flexWrap:'wrap', marginBottom:4 }]}>
          {HEIGHTS.map(h => <TouchableOpacity key={h} style={[styles.dimBtn, form.selectedHeight===h && styles.dimActive]} onPress={() => setForm({...form, selectedHeight:h})}><Text style={[styles.dimTxt, form.selectedHeight===h && styles.dimActiveTxt]}>{h}</Text></TouchableOpacity>)}
        </View>

        <Text style={styles.label}>Πλάτος (cm):</Text>
        <View style={[styles.row, { flexWrap:'wrap', marginBottom:4 }]}>
          {WIDTHS.map(w => <TouchableOpacity key={w} style={[styles.dimBtn, form.selectedWidth===w && styles.dimActive]} onPress={() => setForm({...form, selectedWidth:w})}><Text style={[styles.dimTxt, form.selectedWidth===w && styles.dimActiveTxt]}>{w}</Text></TouchableOpacity>)}
        </View>

        {(form.selectedHeight && form.selectedWidth) ? <View style={styles.preview}><Text>📐 <Text style={{ color:'#007AFF', fontWeight:'bold', fontSize:20 }}>{form.selectedHeight}x{form.selectedWidth}</Text></Text></View> : null}

        <Text style={styles.label}>Φορά Πόρτας:</Text>
        <View style={[styles.row, { marginBottom:12 }]}>
          {['ΔΕΞΙΑ','ΑΡΙΣΤΕΡΗ'].map(s => <TouchableOpacity key={s} style={[styles.tab, form.side===s && styles.activeTab]} onPress={() => setForm({...form, side:s})}><Text style={{ color:form.side===s?'white':'black', fontWeight:'bold' }}>{s}</Text></TouchableOpacity>)}
        </View>

        <Text style={styles.label}>Τεμάχια:</Text>
        <TextInput style={styles.qtyInput} keyboardType="numeric" value={form.qty} onChangeText={v => setForm({...form, qty:v})} selectTextOnFocus />

        <TextInput style={[styles.input, { height:120, textAlignVertical:'top', marginTop:8 }]} placeholder="Παρατηρήσεις" value={form.notes} multiline onChangeText={v => setForm({...form, notes:v})} />

        <TouchableOpacity style={styles.saveBtn} onPress={saveOrder}><Text style={{ color:'white', fontWeight:'bold', fontSize:15 }}>ΑΠΟΘΗΚΕΥΣΗ ΠΡΟΣ ΠΑΡΑΓΩΓΗ</Text></TouchableOpacity>

        <Text style={styles.mainTitle}>ΡΟΗ ΠΑΡΑΓΩΓΗΣ</Text>
        {[['pending','ΠΡΟΣ ΠΑΡΑΓΩΓΗ','#ff4444'],['prod','ΣΤΗΝ ΠΑΡΑΓΩΓΗ','#ffbb33'],['ready','ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ','#00C851']].map(([key,label,color]) => (
          <View key={key}>
            <TouchableOpacity style={[styles.listHeader, { backgroundColor:color }]} onPress={() => toggle(key)}><Text style={styles.listHeaderTxt}>● {label} ({caseOrders.filter(o=>o.status===key.toUpperCase()).length})</Text></TouchableOpacity>
            {expanded[key] && caseOrders.filter(o=>o.status===key.toUpperCase()).map(o=>renderCard(o))}
          </View>
        ))}
        <TouchableOpacity style={[styles.listHeader, { backgroundColor:'#333', marginTop:20 }]} onPress={() => toggle('archive')}><Text style={styles.listHeaderTxt}>📂 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ({soldCaseOrders.length})</Text></TouchableOpacity>
        {expanded.archive && soldCaseOrders.map(o => renderCard(o, true))}
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bigHeader: { backgroundColor:'#1a1a1a', padding:14, borderRadius:8, marginBottom:16, alignItems:'center' },
  bigHeaderTxt: { color:'white', fontSize:16, fontWeight:'bold', letterSpacing:2 },
  sectionTitle: { fontWeight:'bold', marginBottom:10, fontSize:14, color:'#333' },
  label: { fontSize:12, marginBottom:6, fontWeight:'bold', color:'#555' },
  input: { backgroundColor:'#fff', padding:12, borderRadius:5, marginBottom:8, borderWidth:1, borderColor:'#ddd' },
  qtyInput: { backgroundColor:'#fff', padding:10, borderRadius:8, borderWidth:2, borderColor:'#007AFF', fontSize:26, fontWeight:'bold', textAlign:'left', color:'#007AFF', marginBottom:8, width:90 },
  row: { flexDirection:'row', justifyContent:'space-between', marginBottom:8 },
  tab: { flex:1, padding:12, backgroundColor:'#e0e0e0', alignItems:'center', margin:2, borderRadius:8 },
  activeTab: { backgroundColor:'#1a1a1a' },
  dimBtn: { paddingHorizontal:14, paddingVertical:10, backgroundColor:'#e8e8e8', borderRadius:8, marginRight:8, marginBottom:8, minWidth:62, alignItems:'center' },
  dimActive: { backgroundColor:'#1a1a1a' },
  dimTxt: { fontSize:15, fontWeight:'700', color:'#555' },
  dimActiveTxt: { color:'white' },
  preview: { backgroundColor:'#f0f8ff', padding:12, borderRadius:10, marginBottom:12, borderWidth:1, borderColor:'#cce0ff', alignItems:'center' },
  saveBtn: { backgroundColor:'#007AFF', padding:16, borderRadius:8, alignItems:'center', marginTop:4 },
  mainTitle: { fontSize:16, fontWeight:'bold', textAlign:'center', marginTop:24, marginBottom:10 },
  listHeader: { padding:12, borderRadius:5, marginTop:10 },
  listHeaderTxt: { color:'white', fontWeight:'bold' },
  orderCard: { backgroundColor:'#fff', borderRadius:8, marginBottom:5, borderLeftWidth:10, flexDirection:'row', elevation:2, minHeight:90 },
  cardContent: { flex:1, padding:10, justifyContent:'center' },
  cardModel: { fontSize:14, fontWeight:'800', color:'#1a1a1a', marginBottom:2 },
  cardDetails: { fontSize:13, color:'#444', fontWeight:'600' },
  cardSub: { fontSize:12, color:'#666' },
  cardNotes: { fontSize:11, color:'#888', fontStyle:'italic' },
  datesRow: { flexDirection:'row', flexWrap:'wrap', marginTop:5, gap:4 },
  dateChip: { fontSize:10, color:'#555', backgroundColor:'#f0f0f0', paddingHorizontal:6, paddingVertical:2, borderRadius:4, overflow:'hidden' },
  sideBtns: { width:95, borderTopRightRadius:8, borderBottomRightRadius:8, overflow:'hidden' },
  upperBtn: { flex:1, justifyContent:'center', alignItems:'center', borderBottomWidth:1, borderBottomColor:'#444' },
  upperTxt: { fontWeight:'bold', fontSize:10 },
  lowerBtn: { flex:2, justifyContent:'center', alignItems:'center' },
  lowerTxt: { color:'white', fontWeight:'bold', fontSize:12, textAlign:'center' },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' },
  modalBox: { backgroundColor:'#fff', borderRadius:16, padding:24, width:'80%', alignItems:'center' },
  modalTitle: { fontSize:18, fontWeight:'bold', color:'#8B0000', marginBottom:6 },
  modalSub: { fontSize:14, color:'#444', marginBottom:4, textAlign:'center' },
  modalTotal: { fontSize:13, color:'#888', marginBottom:16 },
  modalInput: { borderWidth:2, borderColor:'#8B0000', borderRadius:8, padding:12, fontSize:28, fontWeight:'bold', textAlign:'center', color:'#8B0000', width:'60%', marginBottom:20 },
  modalBtn: { flex:1, padding:14, borderRadius:8, alignItems:'center' },
});