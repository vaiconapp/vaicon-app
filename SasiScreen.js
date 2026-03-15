import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, LayoutAnimation, Modal, Platform } from 'react-native';
import { FIREBASE_URL } from './App';
import { logActivity } from './activityLog';

const printHTML = async (html, title) => {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (!win) { Alert.alert("Σφάλμα", "Επιτρέψτε τα pop-ups."); return; }
    const inner = html.replace(/<html[\s\S]*?<body[^>]*>/i,'').replace(/<\/body[\s\S]*?<\/html>/i,'');
    const previewHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title||'VAICON'}</title><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:#f5f5f5;}#toolbar{position:fixed;top:0;left:0;right:0;background:#1a1a1a;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;z-index:999;}#toolbar h2{color:white;font-size:14px;}#printBtn{background:#007AFF;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:15px;font-weight:bold;cursor:pointer;}#closeBtn{background:#555;color:white;border:none;padding:10px 16px;border-radius:8px;font-size:14px;cursor:pointer;margin-left:8px;}#content{margin-top:56px;padding:16px;background:white;}@media print{#toolbar{display:none;}#content{margin-top:0;padding:0;}@page{size:A4 landscape;margin:5mm;}}</style></head><body><div id="toolbar"><h2>🖨️ ${title||'VAICON'}</h2><div><button id="printBtn" onclick="window.print()">🖨️ ΕΚΤΥΠΩΣΗ</button><button id="closeBtn" onclick="window.close()">✕ ΚΛΕΙΣΙΜΟ</button></div></div><div id="content">${inner}</div></body></html>`;
    win.document.write(previewHTML);
    win.document.close();
    win.focus();
  } else {
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
  }
};

function ProdQtyModal({ visible, suggestedQty, onConfirm, onCancel }) {
  const [qty, setQty] = React.useState('');
  React.useEffect(() => { if (visible) setQty(String(suggestedQty||'')); }, [visible, suggestedQty]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>▶ ΕΝΑΡΞΗ ΠΑΡΑΓΩΓΗΣ</Text>
          <Text style={styles.modalSub}>Προτεινόμενη ποσότητα: {suggestedQty} τεμ.</Text>
          <Text style={styles.modalSub}>Πόσα τεμάχια να παραχθούν;</Text>
          <TextInput style={styles.modalInput} keyboardType="numeric" value={qty} onChangeText={setQty} placeholder="π.χ. 5" autoFocus />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => { setQty(''); onCancel(); }}><Text style={{ fontWeight: 'bold' }}>ΑΚΥΡΟ</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#1565C0' }]} onPress={() => { const n = parseInt(qty); if (!n || n < 1) return Alert.alert('Σφάλμα', 'Βάλτε έγκυρο αριθμό'); setQty(''); onConfirm(n); }}><Text style={{ fontWeight: 'bold', color: 'white' }}>ΕΝΑΡΞΗ</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SellModal({ visible, totalQty, mode, onConfirm, onCancel }) {
  const [qty, setQty] = React.useState('');
  const isRestore = mode === 'restore';
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>{isRestore ? '↩ ΕΠΙΣΤΡΟΦΗ ΣΤΗΝ ΑΠΟΘΗΚΗ' : 'ΕΚΤΟΣ ΠΡΟΔΙΑΓΡΑΦΩΝ'}</Text>
          <Text style={styles.modalSub}>{isRestore ? 'Πόσα τεμάχια επιστρέφουν;' : 'Πόσα τεμάχια εκτός προδιαγραφών;'}</Text>
          <Text style={styles.modalTotal}>Σύνολο: {totalQty} τεμ.</Text>
          <TextInput style={styles.modalInput} keyboardType="numeric" value={qty} onChangeText={setQty} placeholder="π.χ. 2" autoFocus />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => { setQty(''); onCancel(); }}><Text style={{ fontWeight: 'bold' }}>ΑΚΥΡΟ</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: isRestore?'#00796B':'#8B0000' }]} onPress={() => { const n = parseInt(qty); if (!n || n < 1 || n > totalQty) return Alert.alert('Σφάλμα', 'Βάλτε έγκυρο αριθμό'); setQty(''); onConfirm(n); }}><Text style={{ fontWeight: 'bold', color: 'white' }}>ΕΠΙΒΕΒΑΙΩΣΗ</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const fmtDate = (ts) => { if (!ts) return null; const d = new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };

const HEIGHTS = ['208', '213', '218', '223'];
const WIDTHS  = ['83', '88', '93', '98'];
const MODELS  = ['ΜΟΝΗ ΘΩΡΑΚΙΣΗ', 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'];

const INIT = { model: MODELS[0], selectedHeight: '', selectedWidth: '', qty: '1', side: 'ΔΕΞΙΑ', notes: '', status: 'PENDING' };

export default function SasiScreen({ sasiOrders=[], setSasiOrders, soldSasiOrders=[], setSoldSasiOrders }) {
  const [expanded, setExpanded] = useState({ pending: false, prod: false, ready: false, archive: false });
  const [form, setForm] = useState(INIT);
  const [sellModal, setSellModal] = useState({ visible: false, orderId: null, totalQty: 1 });
  const [prodQtyModal, setProdQtyModal] = useState({ visible: false, orderId: null, suggestedQty: 1 });

  const syncToCloud = async (order) => {
    try { await fetch(`${FIREBASE_URL}/sasi_orders/${order.id}.json`, { method: 'PUT', body: JSON.stringify(order) }); }
    catch { Alert.alert("Σφάλμα", "Δεν αποθηκεύτηκε στο Cloud."); }
  };
  const deleteFromCloud = async (id) => { try { await fetch(`${FIREBASE_URL}/sasi_orders/${id}.json`, { method: 'DELETE' }); } catch(e){} };

  const saveOrder = async () => {
    if (!form.selectedHeight) return Alert.alert("Προσοχή", "Επιλέξτε Ύψος.");
    if (!form.selectedWidth)  return Alert.alert("Προσοχή", "Επιλέξτε Πλάτος.");
    if (!form.qty || parseInt(form.qty) < 1) return Alert.alert("Προσοχή", "Βάλτε ποσότητα.");
    const newOrder = { ...form, id: Date.now().toString(), size: `${form.selectedHeight}x${form.selectedWidth}`, createdAt: Date.now() };
    setSasiOrders([newOrder, ...sasiOrders]);
    await syncToCloud(newOrder);
    await logActivity('ΣΑΣΙ ΣΤΟΚ', 'Νέα παραγγελία', { model: newOrder.model, size: newOrder.size, qty: newOrder.qty, extra: newOrder.side });
    setForm(INIT);
    Alert.alert("VAICON", `Αποθηκεύτηκε!\n${form.model}\n${newOrder.size} | ${form.side}`);
  };

  const editOrder = (order) => {
    const p = order.size?.split('x') || ['',''];
    setForm({ ...order, selectedHeight: p[0], selectedWidth: p[1] });
    setSasiOrders(sasiOrders.filter(o => o.id !== order.id));
    deleteFromCloud(order.id);
  };

  const updateStatus = async (id, newStatus) => {
    const now = Date.now();
    const order = sasiOrders.find(o => o.id === id);
    if (!order) return;
    if (newStatus === 'REJECTED') {
      const totalQty = parseInt(order.qty) || 1;
      setSellModal({ visible: true, orderId: id, totalQty, mode: 'reject' });
    } else if (newStatus === 'PROD' && order.isAuto) {
      // Αυτόματη πρόταση → modal για ποσότητα παραγωγής
      setProdQtyModal({ visible: true, orderId: id, suggestedQty: parseInt(order.qty) || 1 });
    } else {
      let upd;
      setSasiOrders(sasiOrders.map(o => { if (o.id === id) { upd = { ...o, status: newStatus, [`${newStatus.toLowerCase()}At`]: now }; return upd; } return o; }));
      if (upd) {
        await syncToCloud(upd);
        const actionMap = { PROD: 'Φάση → ΠΑΡΑΓΩΓΗ', READY: 'Φάση → ΕΤΟΙΜΟ' };
        if (actionMap[newStatus]) await logActivity('ΣΑΣΙ ΣΤΟΚ', actionMap[newStatus], { model: order.model, size: order.size, qty: order.qty });
      }
    }
  };

  const handleProdQtyConfirm = async (qty) => {
    const { orderId } = prodQtyModal;
    setProdQtyModal({ visible: false, orderId: null, suggestedQty: 1 });
    const order = sasiOrders.find(o => o.id === orderId);
    if (!order) return;
    const now = Date.now();
    const upd = { ...order, status: 'PROD', prodAt: now, qty: String(qty) };
    setSasiOrders(sasiOrders.map(o => o.id === orderId ? upd : o));
    await syncToCloud(upd);
    await logActivity('ΣΑΣΙ ΣΤΟΚ', 'Φάση → ΠΑΡΑΓΩΓΗ', { model: order.model, size: order.size, qty: String(qty) });
  };

  const handleSellConfirm = async (qty) => {
    const now = Date.now();
    const { orderId, totalQty, mode } = sellModal;
    setSellModal({ visible: false, orderId: null, totalQty: 1, mode: 'reject' });

    if (mode === 'restore') {
      const restoreOrder = soldSasiOrders.find(o => o.id === orderId);
      if (!restoreOrder) return;
      if (qty === totalQty) {
        const upd = { ...restoreOrder, status: 'READY', readyAt: now, rejectedAt: null };
        setSasiOrders([upd, ...sasiOrders]);
        setSoldSasiOrders(soldSasiOrders.filter(o => o.id !== orderId));
        await syncToCloud(upd);
        await logActivity('ΣΑΣΙ ΣΤΟΚ', 'Επιστροφή στην αποθήκη', { model: restoreOrder.model, size: restoreOrder.size, qty: String(qty) });
      } else {
        const restored = { ...restoreOrder, id: Date.now().toString(), qty: String(qty), status: 'READY', readyAt: now };
        const remaining = { ...restoreOrder, qty: String(totalQty - qty) };
        setSasiOrders([restored, ...sasiOrders]);
        setSoldSasiOrders(soldSasiOrders.map(o => o.id === orderId ? remaining : o));
        await syncToCloud(restored);
        await syncToCloud(remaining);
        await logActivity('ΣΑΣΙ ΣΤΟΚ', 'Επιστροφή (μερική)', { model: restoreOrder.model, size: restoreOrder.size, qty: `${qty}/${totalQty}` });
      }
      return;
    }

    const order = sasiOrders.find(o => o.id === orderId);
    if (!order) return;
    if (qty === totalQty) {
      const upd = { ...order, status: 'REJECTED', rejectedAt: now };
      setSoldSasiOrders([upd, ...soldSasiOrders]);
      setSasiOrders(sasiOrders.filter(o => o.id !== orderId));
      await syncToCloud(upd);
      await logActivity('ΣΑΣΙ ΣΤΟΚ', 'Απόρριψη', { model: order.model, size: order.size, qty: String(qty) });
    } else {
      const rejected = { ...order, id: Date.now().toString(), qty: String(qty), status: 'REJECTED', rejectedAt: now };
      const remaining = { ...order, qty: String(totalQty - qty) };
      setSoldSasiOrders([rejected, ...soldSasiOrders]);
      setSasiOrders(sasiOrders.map(o => o.id === orderId ? remaining : o));
      await syncToCloud(rejected);
      await syncToCloud(remaining);
      await logActivity('ΣΑΣΙ ΣΤΟΚ', 'Απόρριψη (μερική)', { model: order.model, size: order.size, qty: `${qty}/${totalQty}` });
    }
  };

  const moveBack = async (id, currentStatus) => {
    const prev = currentStatus === 'READY' ? 'PROD' : 'PENDING';
    const order = sasiOrders.find(o => o.id === id);
    const upd = { ...order, status: prev };
    setSasiOrders(sasiOrders.map(o => o.id === id ? upd : o));
    await syncToCloud(upd);
  };

  const cancelOrder = (id) => Alert.alert("Ακύρωση", "Οριστική διαγραφή;", [{ text: "Όχι" }, { text: "Ναι", style: "destructive", onPress: async () => { const o = sasiOrders.find(x=>x.id===id); setSasiOrders(sasiOrders.filter(o => o.id !== id)); await deleteFromCloud(id); if(o) await logActivity('ΣΑΣΙ ΣΤΟΚ', 'Ακύρωση', { model: o.model, size: o.size, qty: o.qty }); } }]);
  const deleteFromArchive = (id) => Alert.alert("Διαγραφή", "Διαγραφή από αρχείο;", [{ text: "Όχι" }, { text: "Ναι", style: "destructive", onPress: async () => { setSoldSasiOrders(soldSasiOrders.filter(o => o.id !== id)); await deleteFromCloud(id); } }]);
  const toggle = (s) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setExpanded({ ...expanded, [s]: !expanded[s] }); };

  const renderCard = (order, isArchive = false) => {
    const bc = isArchive ? '#8B0000' : (order.status==='PENDING'?'#ff4444':order.status==='PROD'?'#ffbb33':'#00C851');
    const next = order.status==='PENDING'?'PROD':order.status==='PROD'?'READY':'REJECTED';
    const btn = isArchive?'ΔΙΑΓΡΑΦΗ':(order.status==='PENDING'?'ΕΝΑΡΞΗ':order.status==='PROD'?'ΕΤΟΙΜΗ':'ΕΚΤΟΣ ΠΡΟΔ.');
    const btnC = isArchive?'#000':(order.status==='PENDING'?'#ffbb33':order.status==='PROD'?'#00C851':'#8B0000');
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
          {isArchive && <TouchableOpacity style={[styles.upperBtn, {backgroundColor:'#00796B'}]} onPress={()=>setSellModal({visible:true, orderId:order.id, totalQty:parseInt(order.qty)||1, mode:'restore'})}><Text style={[styles.upperTxt,{color:'white'}]}>↩ ΕΠΙΣΤ.</Text></TouchableOpacity>}
          <TouchableOpacity style={[styles.lowerBtn, { backgroundColor: btnC }]} onPress={() => isArchive?deleteFromArchive(order.id):updateStatus(order.id,next)}><Text style={styles.lowerTxt}>{btn}</Text></TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const handlePrint = async (orders, title) => {
    if (!orders.length) return Alert.alert("Προσοχή", "Δεν υπάρχουν εγγραφές.");
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    // Υπολογισμός δεσμεύσεων από autoNote
    const getReserved = (o) => {
      if (!o.autoNote) return 0;
      return o.autoNote.split(',').reduce((sum, entry) => {
        const m = entry.match(/x(\d+)/i);
        return sum + (m ? parseInt(m[1]) : 1);
      }, 0);
    };

    // Ταξινόμηση: ΔΕΞΙΑ πρώτα, μετά ΑΡΙΣΤΕΡΗ, κατά διάσταση, κατά μοντέλο
    const sortFn = (a, b) => {
      if (a.side === 'ΔΕΞΙΑ' && b.side !== 'ΔΕΞΙΑ') return -1;
      if (a.side !== 'ΔΕΞΙΑ' && b.side === 'ΔΕΞΙΑ') return 1;
      const hDiff = (parseInt(b.selectedHeight)||0) - (parseInt(a.selectedHeight)||0);
      if (hDiff !== 0) return hDiff;
      const wDiff = (parseInt(b.selectedWidth)||0) - (parseInt(a.selectedWidth)||0);
      if (wDiff !== 0) return wDiff;
      return (a.model||'').localeCompare(b.model||'');
    };

    const left  = [...orders].filter(o => o.side !== 'ΔΕΞΙΑ').sort(sortFn);
    const right = [...orders].filter(o => o.side === 'ΔΕΞΙΑ').sort(sortFn);
    const maxRows = Math.max(right.length, left.length);

    const makeRow = (o) => {
      if (!o) return '<td colspan="4" style="background:#fafafa"></td>';
      const reserved = getReserved(o);
      const available = Math.max(0, (parseInt(o.qty)||1) - reserved);
      return `
        <td style="font-weight:bold;font-size:14px;padding:3px 5px">${o.model||'—'}</td>
        <td style="font-weight:bold;font-size:16px;padding:3px 5px">${o.selectedHeight||'—'}x${o.selectedWidth||'—'}</td>
        <td style="font-weight:bold;font-size:18px;color:#00796B;text-align:center;padding:3px 5px">${available}</td>
        <td style="font-size:18px;color:#E65100;text-align:center;padding:3px 5px">${reserved > 0 ? reserved : '—'}</td>
      `;
    };

    const rows = Array.from({length: maxRows}, (_, i) => `
      <tr style="border-bottom:1px solid #ddd">
        ${makeRow(left[i])}
        <td style="width:10px;background:#ddd"></td>
        ${makeRow(right[i])}
      </tr>
    `).join('');

    const html = `<html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:Arial,sans-serif;margin:6mm;}
      h1{font-size:15px;font-weight:bold;margin-bottom:2px;}
      h2{font-size:12px;margin-bottom:8px;color:#555;}
      .wrapper{display:flex;gap:0;}
      table{width:100%;border-collapse:collapse;}
      .box-left{border:2px solid #1565C0;border-radius:4px;overflow:hidden;width:49%;margin-right:2%;}
      .box-right{border:2px solid #8B0000;border-radius:4px;overflow:hidden;width:49%;}
      .box-header-left{background:#1565C0;color:white;text-align:center;padding:5px;font-size:14px;font-weight:bold;}
      .box-header-right{background:#8B0000;color:white;text-align:center;padding:5px;font-size:14px;font-weight:bold;}
      th{padding:3px 5px;text-align:left;border-bottom:2px solid #000;font-weight:bold;background:#f0f0f0;font-size:13px;}
      td{padding:2px 5px;vertical-align:middle;}
      @media print{@page{size:A4 landscape;margin:5mm;}}
    </style></head><body>
      <h1>VAICON — ΣΑΣΙ ΣΤΟΚ — ${title}</h1>
      <h2>📅 ${dateStr} &nbsp;|&nbsp; ΑΡΙΣΤΕΡΕΣ: ${left.length} &nbsp;|&nbsp; ΔΕΞΙΕΣ: ${right.length}</h2>
      <div class="wrapper">
        <div class="box-left">
          <div class="box-header-left">⬅️ ΑΡΙΣΤΕΡΕΣ (${left.length})</div>
          <table>
            <thead><tr><th>Μοντέλο</th><th>Διάσταση</th><th>Διαθ.</th><th>Δεσμ.</th></tr></thead>
            <tbody>
              ${left.map(o => { const r=getReserved(o); const av=Math.max(0,(parseInt(o.qty)||1)-r); return `<tr style="border-bottom:1px solid #eee"><td style="font-size:16px;font-weight:bold">${o.model||'—'}</td><td style="font-size:18px;font-weight:bold;letter-spacing:2px">${o.selectedHeight||'—'}x${o.selectedWidth||'—'}</td><td style="font-size:18px;font-weight:bold;color:#00796B;text-align:center">${av}</td><td style="font-size:18px;color:#E65100;text-align:center">${r>0?r:'—'}</td></tr>`; }).join('')}
            </tbody>
          </table>
        </div>
        <div class="box-right">
          <div class="box-header-right">➡️ ΔΕΞΙΕΣ (${right.length})</div>
          <table>
            <thead><tr><th>Μοντέλο</th><th>Διάσταση</th><th>Διαθ.</th><th>Δεσμ.</th></tr></thead>
            <tbody>
              ${right.map(o => { const r=getReserved(o); const av=Math.max(0,(parseInt(o.qty)||1)-r); return `<tr style="border-bottom:1px solid #eee"><td style="font-size:16px;font-weight:bold">${o.model||'—'}</td><td style="font-size:18px;font-weight:bold;letter-spacing:2px">${o.selectedHeight||'—'}x${o.selectedWidth||'—'}</td><td style="font-size:18px;font-weight:bold;color:#00796B;text-align:center">${av}</td><td style="font-size:18px;color:#E65100;text-align:center">${r>0?r:'—'}</td></tr>`; }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </body></html>`;
    try { await printHTML(html, `VAICON — ΣΑΣΙ — ${title}`); }
    catch(e) { Alert.alert("Σφάλμα", "Δεν δημιουργήθηκε το PDF."); }
  };

  return (
    <View style={{ flex: 1 }}>
      <SellModal visible={sellModal.visible} totalQty={sellModal.totalQty} mode={sellModal.mode} onConfirm={handleSellConfirm} onCancel={() => setSellModal({ visible: false, orderId: null, totalQty: 1, mode:'reject' })} />
      <ProdQtyModal visible={prodQtyModal.visible} suggestedQty={prodQtyModal.suggestedQty} onConfirm={handleProdQtyConfirm} onCancel={() => setProdQtyModal({ visible: false, orderId: null, suggestedQty: 1 })} />
    <ScrollView style={{ padding: 10 }}>
      <View style={{ paddingBottom: 120 }}>
        <View style={styles.bigHeader}><Text style={styles.bigHeaderTxt}>🚪 ΤΥΠΟΠΟΙΗΜΕΝΑ ΣΑΣΙ ΣΤΟΚ</Text></View>
        <Text style={styles.sectionTitle}>ΚΑΤΑΧΩΡΗΣΗ ΤΥΠΟΠΟΙΗΜΕΝΟΥ ΣΑΣΙ</Text>

        {/* ΔΙΑΣΤΑΣΕΙΣ + ΘΩΡΑΚΙΣΗ/ΤΕΜΑΧΙΑ — side by side */}
        <View style={{flexDirection:'row', gap:10, marginBottom:8}}>

          {/* ΑΡΙΣΤΕΡΑ: Ύψος + Πλάτος chips + ΑΡ/ΔΕΞ κάτω */}
          <View style={{flex:3}}>
            <View style={{alignSelf:'flex-start'}}>
              <Text style={styles.label}>Ύψος</Text>
              <View style={{flexDirection:'row', gap:4, marginBottom:8}}>
                {HEIGHTS.map(h => (
                  <TouchableOpacity key={h} style={[styles.dimBtn, form.selectedHeight===h && styles.dimActive]} onPress={() => setForm({...form, selectedHeight:h})}>
                    <Text style={[styles.dimTxt, form.selectedHeight===h && styles.dimActiveTxt]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Πλάτος</Text>
              <View style={{flexDirection:'row', gap:4, marginBottom:8}}>
                {WIDTHS.map(w => (
                  <TouchableOpacity key={w} style={[styles.dimBtn, form.selectedWidth===w && styles.dimActive]} onPress={() => setForm({...form, selectedWidth:w})}>
                    <Text style={[styles.dimTxt, form.selectedWidth===w && styles.dimActiveTxt]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* ΑΡ/ΔΕΞ — ίδιο πλάτος με chips row */}
              <View style={{flexDirection:'row', gap:4}}>
                <TouchableOpacity style={[styles.dimBtn, {flex:1, alignItems:'center'}, form.side==='ΑΡΙΣΤΕΡΗ' && styles.dimActive]} onPress={() => setForm({...form, side:'ΑΡΙΣΤΕΡΗ'})}>
                  <Text style={[styles.dimTxt, form.side==='ΑΡΙΣΤΕΡΗ' && styles.dimActiveTxt]}>◄ ΑΡ.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dimBtn, {flex:1, alignItems:'center'}, form.side==='ΔΕΞΙΑ' && styles.dimActive]} onPress={() => setForm({...form, side:'ΔΕΞΙΑ'})}>
                  <Text style={[styles.dimTxt, form.side==='ΔΕΞΙΑ' && styles.dimActiveTxt]}>ΔΕΞ. ►</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ΔΕΞΙΑ: ΘΩΡΑΚΙΣΗ + Τεμάχια */}
          <View style={{flex:2}}>
            <Text style={[styles.label,{textAlign:'center'}]}>ΘΩΡΑΚΙΣΗ</Text>
            <View style={{flexDirection:'row', gap:4, marginBottom:8}}>
              {MODELS.map(m => (
                <TouchableOpacity key={m} style={[styles.tab, form.model===m && styles.activeTab]} onPress={() => setForm({...form, model:m})}>
                  <Text style={{color:form.model===m?'white':'black', fontWeight:'bold', fontSize:11}}>{m==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'?'ΜΟΝΗ':'ΔΙΠΛΗ'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
              <Text style={[styles.label,{marginBottom:0}]}>Τεμάχια</Text>
              <TextInput style={[styles.qtyInput,{width:70, marginBottom:0}]} keyboardType="numeric" value={form.qty} onChangeText={v => setForm({...form, qty:v})} selectTextOnFocus />
            </View>
          </View>

        </View>

        <TextInput style={[styles.input, { height:120, textAlignVertical:'top', marginTop:8 }]} placeholder="Παρατηρήσεις" value={form.notes} multiline onChangeText={v => setForm({...form, notes:v})} />

        <TouchableOpacity style={styles.saveBtn} onPress={saveOrder}><Text style={{ color:'white', fontWeight:'bold', fontSize:15 }}>ΑΠΟΘΗΚΕΥΣΗ ΠΡΟΣ ΠΑΡΑΓΩΓΗ</Text></TouchableOpacity>

        <Text style={styles.mainTitle}>ΡΟΗ ΠΑΡΑΓΩΓΗΣ</Text>
        {[['pending','ΠΡΟΣ ΠΑΡΑΓΩΓΗ','#ff4444'],['prod','ΣΤΗΝ ΠΑΡΑΓΩΓΗ','#ffbb33'],['ready','ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ','#00C851']].map(([key,label,color]) => (
          <View key={key}>
            <TouchableOpacity style={[styles.listHeader, { backgroundColor:color, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }]} onPress={() => toggle(key)}>
              <Text style={styles.listHeaderTxt}>● {label} ({sasiOrders.filter(o=>o.status===key.toUpperCase()).length})</Text>
              <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                {expanded[key] && sasiOrders.filter(o=>o.status===key.toUpperCase()).length>0 &&
                  <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                    onPress={()=>handlePrint(sasiOrders.filter(o=>o.status===key.toUpperCase()), label)}>
                    <Text style={{color:'#333', fontSize:11, fontWeight:'bold'}}>🖨️</Text>
                  </TouchableOpacity>
                }
                <Text style={{color:'white'}}>{expanded[key]?'▲':'▼'}</Text>
              </View>
            </TouchableOpacity>
            {expanded[key] && sasiOrders.filter(o=>o.status===key.toUpperCase()).map(o=>renderCard(o))}
          </View>
        ))}
        <TouchableOpacity style={[styles.listHeader, { backgroundColor:'#8B0000', marginTop:20 }]} onPress={() => toggle('archive')}><Text style={styles.listHeaderTxt}>🗑 ΑΠΟΡΡΙΦΘΕΝΤΑ ({soldSasiOrders.length})</Text></TouchableOpacity>
        {expanded.archive && soldSasiOrders.map(o => renderCard(o, true))}
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