import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Platform } from 'react-native';
import { FIREBASE_URL } from './firebaseConfig';
import { logActivity } from './activityLog';
import { caseKey as stockKey, resDeferred } from './stockUtils';

const HEIGHTS = ['208', '213', '218', '223'];
const WIDTHS  = ['83', '88', '93', '98'];
const SIDES   = ['ΑΡΙΣΤΕΡΗ', 'ΔΕΞΙΑ'];
const CASE_TYPES = ['ΚΑΣΑ ΚΛΕΙΣΤΗ', 'ΚΑΣΑ ΑΝΟΙΧΤΗ'];
const STATUS_LABEL = { STD_PENDING:'Καταχωρημένη', PENDING:'Καταχωρημένη', STD_BUILD:'Προς κατασκευή', DIPLI_PROD:'Σε παραγωγή', PROD:'Σε παραγωγή', STD_READY:'Έτοιμη', STD_SOLD:'Πουλημένη', SOLD:'Πουλημένη', QUOTE:'Προσφορά' };

const initStockMap = () => {
  const map = {};
  SIDES.forEach(side => {
    HEIGHTS.forEach(h => {
      WIDTHS.forEach(w => {
        CASE_TYPES.forEach(ct => {
          map[stockKey(h,w,side,ct)] = { qty: 0, reservations: [], caseType: ct, pending: 0 };
        });
      });
    });
  });
  return map;
};

// ── Καλάθι εκκρεμοτήτων: εφαρμογή μιας πράξης σε entry (καθαρή συνάρτηση) ──
const applyOpToEntry = (e0, op) => {
  const e = { ...e0, qty: e0.qty||0, pending: e0.pending||0, reservations: e0.reservations||[] };
  if (op.mode === 'pending') e.pending += op.n;
  else if (op.mode === 'add') e.qty += op.n;
  else if (op.mode === 'pendingIn') { e.qty += op.n; e.pending = Math.max(0, e.pending - op.n); }
  else if (op.mode === 'subPending') e.pending = Math.max(0, e.pending - op.n);
  else if (op.mode === 'sub') e.qty = op.allowNeg ? (e.qty - op.n) : Math.max(0, e.qty - op.n);
  return e;
};
const foldOps = (base, ops) => {
  if (!ops.length) return base;
  const out = { ...base };
  ops.forEach(o => { out[o.key] = applyOpToEntry(out[o.key] || { qty:0, pending:0, reservations:[] }, o); });
  return out;
};
const OP_LABEL = { pending:'➕ Παραγωγή', add:'➕ Αποθήκη', pendingIn:'📦 Παραλαβή (→Αποθήκη)', subPending:'➖ Παραγωγή', sub:'➖ Αποθήκη' };
const OP_LOG   = { pending:'PENDING', add:'Προσθήκη', pendingIn:'Παραλαβή από PENDING', subPending:'Αφαίρεση από ΠΑΡΑΓΩΓΗ', sub:'Αφαίρεση από ΑΠΟΘΗΚΗ' };

function QtyModal({ visible, title, onConfirm, onCancel }) {
  const [val, setVal] = useState('');
  useEffect(() => { if (visible) setVal(''); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.modalBox, {width:'72%', maxWidth:260}]}>
          <Text style={[styles.modalTitle, {fontSize:21, lineHeight:28}]}>{title}</Text>
          <TextInput
            style={[styles.modalInput, {width:'80%'}]}
            keyboardType="numeric"
            value={val}
            onChangeText={setVal}
            placeholder="Τεμάχια..."
            autoFocus
          />
          <View style={{flexDirection:'row', gap:10}}>
            <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#ccc'}]} onPress={()=>{setVal('');onCancel();}}>
              <Text style={{fontWeight:'bold'}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#E65100'}]} onPress={()=>{
              const n = parseInt(val);
              if (!n || n < 1) return Alert.alert('Σφάλμα','Βάλτε έγκυρο αριθμό');
              setVal(''); onConfirm(n);
            }}>
              <Text style={{fontWeight:'bold',color:'white'}}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function CaseScreen({ caseStock={}, setCaseStock, opsBasket=[], setOpsBasket, stockHighlight=null, onClearSearchHighlight, locked=false, isAdmin=false, customOrders=[] }) {
  const readyNos = React.useMemo(() => new Set(customOrders.filter(o=>o.status==='STD_READY').map(o=>String(o.orderNo))), [customOrders]);
  // Χρησιμοποιούμε απευθείας το κεντρικό state από App.js
  const baseMap = { ...initStockMap(), ...caseStock };
  const [qtyModal, setQtyModal] = useState({ visible:false, key:'', mode:'add', label:'', dim:'' });
  const [choiceModal, setChoiceModal] = useState({ visible:false, key:'', label:'', action:'add', pending:0, available:0 });
  const [showReservations, setShowReservations] = useState(null);
  const [activeCaseType, setActiveCaseType] = useState('ΚΑΣΑ ΚΛΕΙΣΤΗ');
  const [confirmApply, setConfirmApply] = useState(false);
  const [oldSel, setOldSel] = useState([]);
  const [oldConfirm, setOldConfirm] = useState(false);
  const [resDetail, setResDetail] = useState(null);
  const stockMap = foldOps(baseMap, opsBasket);
  const pendingKeys = new Set(opsBasket.map(o => o.key));

  useEffect(() => {
    if (stockHighlight?.kind === 'case' && stockHighlight.caseTypeTab) {
      setActiveCaseType(stockHighlight.caseTypeTab);
    }
  }, [stockHighlight]);

  const syncKey = async (key, entry) => {
    try {
      await fetch(`${FIREBASE_URL}/case_stock/${key}.json`, {
        method: 'PUT',
        body: JSON.stringify(entry)
      });
    } catch(e) { Alert.alert('Σφάλμα','Δεν αποθηκεύτηκε.'); }
  };

  const handleAdd = (key, label, pending, available) => {
    if (locked) return;
    setChoiceModal({ visible:true, key, label, action:'add', pending, available });
  };

  const handlePendingIn = (key, label, pendingQty) => {
    if (locked) return;
    if (pendingQty <= 0) return Alert.alert('Προσοχή','Δεν υπάρχει ποσότητα σε PENDING.');
    setQtyModal({ visible:true, key, mode:'pendingIn', label:`📦 Παραλαβή από PENDING\n\n${label}\n(έως ${pendingQty} τεμ.)`, dim: label });
  };

  const handleSubtract = (key, label, available, pending) => {
    if (locked) return;
    if (available <= 0 && pending <= 0 && !isAdmin) return Alert.alert('Προσοχή','Δεν υπάρχει διαθέσιμη ποσότητα για αφαίρεση.');
    setChoiceModal({ visible:true, key, label, action:'sub', pending, available });
  };

  // ── Αυτόματη αναπλήρωση δανεισμένων δεσμεύσεων με προτεραιότητα ──
  const replenishPriorityReservations = async (key, updEntry) => {
    const reservations = updEntry.reservations || [];
    const priorityRes = reservations.filter(r => r.priorityReservation && r.borrowedTo);
    if (priorityRes.length === 0) return updEntry;

    const totalQty = parseInt(updEntry.qty) || 0;
    let cumulative = 0;
    const newReservations = reservations.map(r => {
      cumulative += (parseInt(r.qty) || 1);
      if (r.priorityReservation && r.borrowedTo && cumulative <= totalQty) {
        // Η παραγγελία αυτή μπορεί τώρα να αναπληρωθεί — αφαιρώ τα flags
        const { borrowedTo, priorityReservation, ...cleanRes } = r;
        return cleanRes;
      }
      return r;
    });

    const finalEntry = { ...updEntry, reservations: newReservations };
    return finalEntry;
  };

  // Δεν εφαρμόζεται αμέσως: η πράξη μπαίνει στο καλάθι εκκρεμοτήτων (έλεγχος ορίων στην προβολή = base + καλάθι).
  const handleQtyConfirm = (n) => {
    if (locked) return;
    const { key, mode, dim } = qtyModal;
    setQtyModal(m => ({...m, visible:false}));
    const e = stockMap[key] || { qty:0, pending:0, reservations:[] };
    const reserved = (e.reservations||[]).reduce((s,r)=>s+(parseInt(r.qty)||1),0);
    const available = (e.qty||0) - reserved;
    const maxPending = e.pending || 0;
    if (mode === 'subPending' && n > maxPending) return Alert.alert('Προσοχή',`Μπορείτε να αφαιρέσετε έως ${maxPending} τεμάχια από ΠΑΡΑΓΩΓΗ.`);
    if (mode === 'pendingIn' && n > maxPending) return Alert.alert('Προσοχή',`Μπορείτε να παραλάβετε έως ${maxPending} τεμάχια.`);
    if (mode === 'sub' && n > available && !isAdmin) return Alert.alert('Προσοχή',`Μπορείτε να αφαιρέσετε έως ${available} τεμάχια.`);
    setOpsBasket(prev => [...prev, { id: Date.now()+'_'+Math.random(), key, mode, n, dim: dim || key, allowNeg: isAdmin && mode==='sub' }]);
  };

  const commitOps = async () => {
    const ops = opsBasket;
    const keys = [...new Set(ops.map(o => o.key))];
    const updates = {};
    for (const key of keys) {
      let entry = { ...(baseMap[key] || { qty:0, pending:0, reservations:[] }) };
      ops.filter(o => o.key === key).forEach(o => { entry = applyOpToEntry(entry, o); });
      updates[key] = await replenishPriorityReservations(key, entry);
    }
    setCaseStock(prev => ({ ...prev, ...updates }));
    setOpsBasket([]);
    for (const key of keys) await syncKey(key, updates[key]);
    for (const o of ops) await logActivity('ΚΑΣΕΣ ΣΤΟΚ', OP_LOG[o.mode] || o.mode, { size: o.key, qty: String(o.n) });
  };

  const applyOldCover = async (key) => {
    const entry = baseMap[key];
    if (!entry) { setOldConfirm(false); setOldSel([]); return; }
    const sel = new Set(oldSel.map(String));
    const reservations = (entry.reservations||[]).map(r => sel.has(String(r.orderNo)) ? {...r, oldCovered:true} : r);
    const upd = { ...entry, reservations };
    setCaseStock(prev => ({ ...prev, [key]: upd }));
    setOldConfirm(false); setOldSel([]);
    await syncKey(key, upd);
    for (const no of oldSel) await logActivity('ΚΑΣΕΣ ΣΤΟΚ', 'Κάλυψη από παλιό στοκ', { size: key, qty: '#'+no });
  };

  const undoOldCover = (key, orderNo) => {
    const doIt = async () => {
      const entry = baseMap[key]; if (!entry) return;
      const reservations = (entry.reservations||[]).map(r => String(r.orderNo)===String(orderNo) ? (({oldCovered, ...rest})=>rest)(r) : r);
      const upd = { ...entry, reservations };
      setCaseStock(prev => ({ ...prev, [key]: upd }));
      await syncKey(key, upd);
      await logActivity('ΚΑΣΕΣ ΣΤΟΚ', 'Αναίρεση κάλυψης παλιού στοκ', { size: key, qty: '#'+orderNo });
    };
    const msg = `Αναίρεση κάλυψης από παλιό στοκ για #${orderNo};`;
    if (Platform.OS==='web') { if (window.confirm(msg)) doIt(); }
    else Alert.alert('Αναίρεση', msg, [{text:'ΑΚΥΡΟ',style:'cancel'},{text:'ΝΑΙ',onPress:doIt}]);
  };

  const renderTable = (side, caseType) => {
    return (
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={[styles.thWrap, {width:34}]}><Text style={styles.thCell}>ACT</Text></View>
          <View style={[styles.thWrap, {width:60}]}><Text style={[styles.thCell,{textAlign:'center'}]}>PEND.</Text></View>
          <View style={[styles.thWrap, {width:80}]}><Text style={styles.thCell}>ΔΙΑΣΤΑΣΗ</Text></View>
          <View style={[styles.thWrap, {width:60}]}><Text style={[styles.thCell,{textAlign:'center'}]}>ΥΠΟ/ΠΟ</Text></View>
          <View style={[styles.thWrap, {flex:1, borderRightWidth:0}]}><Text style={styles.thCell}>ΔΕΣΜΕΥΣΕΙΣ</Text></View>
        </View>
        {HEIGHTS.map(h => WIDTHS.map(w => {
          const key = stockKey(h, w, side, caseType);
          const entry = stockMap[key] || { qty:0, reservations:[], pending:0 };
          const reserved = (entry.reservations||[]).reduce((s,r)=>r.oldCovered?s:s+(parseInt(r.qty)||1),0);
          const totalQ = parseInt(entry.qty)||0;
          let _rem=totalQ, readyDoors=0, greenDoors=0, redDoors=0, deferredDoors=0;
          (entry.reservations||[]).forEach(r=>{ const q=parseInt(r.qty)||1; if(resDeferred(r)){deferredDoors+=q; return;} if(r.oldCovered){greenDoors+=q; return;} if(readyNos.has(String(r.orderNo))){readyDoors+=q; _rem-=q;} else if(q<=_rem){greenDoors+=q; _rem-=q;} else {redDoors+=q;} });
          const available = (entry.qty||0) - reserved;
          const pending = entry.pending || 0;
          const label = `${h}x${w} ${side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}`;
          const hasReservations = (entry.reservations||[]).length > 0;
          const availColor = available <= 0 ? '#ff4444' : available <= 3 ? '#ff9800' : '#1b5e20';
          const rowHL = stockHighlight?.kind === 'case' && stockHighlight.stockKey === key;

          return (
            <View key={key} style={[styles.tableRow, available<0&&{backgroundColor:'#fff5f5'}, rowHL && { backgroundColor: '#fff8e1', borderWidth: 2, borderColor: '#FFC107' }, pendingKeys.has(key) && { backgroundColor:'#e3f2fd', borderWidth:2, borderColor:'#1976d2' }]}>
              {/* ΕΝΕΡΓΕΙΕΣ — μόνο το - */}
              <View style={[styles.tdWrap, {width:34, justifyContent:'center', alignItems:'center'}]}>
                {!locked&&<TouchableOpacity style={[styles.subBtn, (available<=0&&pending<=0)&&{opacity:0.35}]}
                  disabled={!isAdmin&&available<=0&&pending<=0}
                  onPress={()=>handleSubtract(key, label, available, pending)}>
                  <Text style={styles.btnTxt}>-</Text>
                </TouchableOpacity>}
              </View>
              {/* PENDING */}
              <TouchableOpacity
                style={[styles.tdWrap, {width:60, alignItems:'center', backgroundColor: pending>0?'#fff8e1':'transparent'}]}
                disabled={locked}
                onPress={locked?undefined:()=>handleAdd(key, label, pending, available)}
                onLongPress={locked?undefined:()=>pending>0&&handlePendingIn(key, label, pending)}>
                <Text style={{fontSize:16, fontWeight:'900', color: pending>0?'#e65100':'#ccc'}}>{pending>0?pending:(locked?'':'+')}</Text>
                {pending>0&&<Text style={{fontSize:8, color:'#e65100', fontWeight:'bold'}}>PENDING</Text>}
                {pending>0&&<Text style={{fontSize:8, color:'#888'}}>πάτα παρ/βή</Text>}
              </TouchableOpacity>
              {/* ΔΙΑΣΤΑΣΗ */}
              <View style={[styles.tdWrap, {width:80}]}>
                <Text style={styles.dimCell}>{h}x{w}</Text>
              </View>
              {/* ΥΠΟΛΟΙΠΟ */}
              <View style={[styles.tdWrap, {width:60, alignItems:'center'}]}>
                <Text style={[styles.qtyCell, {color: availColor}]}>{available}</Text>
                {entry.qty > 0 && <Text style={{fontSize:12, color:'#666', fontWeight:'600'}}>/{entry.qty}</Text>}
              </View>
              {/* ΔΕΣΜΕΥΣΕΙΣ */}
              <TouchableOpacity
                style={[styles.tdWrap, {flex:1, borderRightWidth:0}]}
                onPress={()=>hasReservations?(setOldSel([]),setShowReservations(key)):null}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                  <View style={{flexDirection:'row', flexWrap:'wrap', gap:2, flex:1}}>
                  {hasReservations
                    ? (() => {
                        const totalQty = parseInt(entry.qty) || 0;
                        let _rem = totalQty;
                        return (entry.reservations||[]).map((r, i) => {
                          const deferred = resDeferred(r);
                          const q = parseInt(r.qty) || 1;
                          const isReady = readyNos.has(String(r.orderNo));
                          const covered = !deferred && (r.oldCovered || isReady || q <= _rem);
                          if (!deferred && !r.oldCovered && covered) _rem -= q;
                          const chipHL = stockHighlight?.kind === 'case' && String(r.orderNo ?? '') === String(stockHighlight.orderNo ?? '');
                          return (
                            <Text key={i} style={{
                              fontSize:12, fontWeight:'bold',
                              color: deferred ? '#8a6d1b' : (covered ? '#1b5e20' : '#c62828'),
                              backgroundColor: chipHL ? '#FFE082' : (deferred ? '#fff8e1' : (isReady ? '#d7ecd9' : (covered ? '#f1f8f1' : 'transparent'))),
                              paddingHorizontal: (chipHL || covered || isReady || deferred) ? 4 : 0,
                              borderRadius: isReady ? 5 : 3,
                              borderWidth: chipHL ? 1 : (isReady ? 1 : 0),
                              borderColor: chipHL ? '#F57F17' : (isReady ? '#7cb342' : 'transparent'),
                            }}>
                              #{r.orderNo}({r.qty||1}){deferred ? '⏳' : ''}
                            </Text>
                          );
                        });
                      })()
                    : <Text style={{color:'#bbb'}}>—</Text>
                  }
                  </View>
                  {(readyDoors>0||greenDoors>0||redDoors>0||deferredDoors>0)&&(
                    <View style={{flexDirection:'row', gap:5, marginLeft:6, alignItems:'center'}}>
                      {readyDoors>0&&<Text style={{fontSize:12, fontWeight:'900', color:'#2e7d32', backgroundColor:'#d7ecd9', borderWidth:1, borderColor:'#7cb342', borderRadius:5, paddingHorizontal:5}}>{readyDoors}</Text>}
                      {greenDoors>0&&<Text style={{fontSize:12, fontWeight:'900', color:'#2e7d32'}}>{greenDoors}</Text>}
                      {redDoors>0&&<Text style={{fontSize:12, fontWeight:'900', color:'#c62828'}}>{redDoors}</Text>}
                      {deferredDoors>0&&<Text style={{fontSize:12, fontWeight:'900', color:'#8a6d1b'}}>⏳{deferredDoors}</Text>}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          );
        }))}
      </View>
    );
  };

  const reservationEntry = showReservations ? stockMap[showReservations] : null;

  const handlePrintProd = (caseType) => {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()} ${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;
    const label = caseType==='ΚΑΣΑ ΚΛΕΙΣΤΗ'?'ΚΛΕΙΣΤΗ':'ΑΝΟΙΧΤΗ';
    const buildSide = (side) => {
      const abbr = side === 'ΑΡΙΣΤΕΡΗ' ? 'ΑΡ' : 'ΔΕ';
      const rows = HEIGHTS.flatMap(h => WIDTHS.map(w => {
        const pending = (stockMap[stockKey(h, w, side, caseType)] || {}).pending || 0;
        return pending > 0 ? `<div class="prow"><span class="qty">${pending}</span><span class="dim">- ${h}x${w} ${abbr}</span></div>` : '';
      })).join('');
      return rows;
    };
    const sideBlock = (title, side) => { const rows = buildSide(side); return rows ? `<div class="side"><h3>${title}</h3>${rows}</div>` : ''; };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:8mm;}body{font-family:Arial,sans-serif;margin:0;color:#000;}h1{font-size:18px;margin:0 0 2px;font-weight:bold;}h2{font-size:11px;color:#555;margin:0 0 10px;}.side{margin-bottom:14mm;page-break-inside:avoid;}.side h3{font-size:24px;font-weight:900;border-bottom:3px solid #000;padding:4px 2px;margin:0 0 2px;letter-spacing:1px;-webkit-text-stroke:0.5px #000}.prow{display:flex;justify-content:flex-start;align-items:center;gap:8px;border-bottom:1px solid #999;min-height:62px;padding:4px 8px;}.prow .qty{font-size:26px;font-weight:900;color:#cc0000;min-width:40px;text-align:right}.prow .dim{font-size:26px;font-weight:900;letter-spacing:0.5px}</style></head><body><h1>ΠΑΡΑΓΩΓΗ ΚΑΣΑ ${label}</h1><h2>📅 ${dateStr}</h2>${sideBlock('◄ ΑΡΙΣΤΕΡΗ','ΑΡΙΣΤΕΡΗ')}${sideBlock('ΔΕΞΙΑ ►','ΔΕΞΙΑ')}</body></html>`;
    if (Platform.OS === 'web') {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }
  };

  const handlePrint = (caseType) => {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()} ${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;
    const label = caseType==='ΚΑΣΑ ΚΛΕΙΣΤΗ'?'ΚΛΕΙΣΤΗ':'ΑΝΟΙΧΤΗ';
    const buildRows = (side) => HEIGHTS.flatMap(h => WIDTHS.map(w => {
      const key = stockKey(h, w, side, caseType);
      const entry = stockMap[key] || { qty:0, reservations:[], pending:0 };
      const reserved = (entry.reservations||[]).reduce((s,r)=>s+(parseInt(r.qty)||1),0);
      const available = (entry.qty||0) - reserved;
      const pending = entry.pending || 0;
      const resText = (entry.reservations||[]).map(r=>`${r.orderNo}(${r.qty||1})`).join(', ') || '—';
      const availColor = available < 0 ? '#cc0000' : available === 0 ? '#888' : '#155724';
      return `<tr>
        <td class="dim">${h}x${w}</td>
        <td class="pend" style="color:${pending>0?'#e65100':'#aaa'}">${pending>0?pending:'—'}</td>
        <td class="avail" style="color:${availColor}">${available}</td>
        <td class="res">${resText}</td>
      </tr>`;
    })).join('');
    const colHeader = `<tr><th style="width:90px">ΔΙΑΣΤΑΣΗ</th><th style="width:55px;text-align:center">PEND.</th><th style="width:55px;text-align:center">ΥΠΟ/ΠΟ</th><th>ΔΕΣΜΕΥΣΕΙΣ</th></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:4mm;color:#000;}h1{font-size:14px;margin:0 0 1px 0;font-weight:bold;}h2{font-size:10px;color:#555;margin:0 0 4px 0;}.wrapper{display:flex;gap:6mm;}.half{flex:1;}.half h3{font-size:22px;font-weight:900;color:#000;padding:4px 8px;margin:0;letter-spacing:1px;border-bottom:3px solid #000;-webkit-text-stroke:0.5px #000;}table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;}th{padding:3px 5px;text-align:left;border-bottom:2px solid #000;overflow:hidden;}td{padding:4px 5px;border-bottom:1px solid #ccc;overflow:hidden;white-space:nowrap;vertical-align:top;}td.dim{font-weight:900;font-size:18px;letter-spacing:0.5px}td.pend{text-align:center;font-weight:900;font-size:18px}td.avail{text-align:center;font-weight:900;font-size:18px}td.res{font-size:10px;color:#555;white-space:normal;word-break:break-word;overflow-wrap:anywhere;line-height:1.25;vertical-align:top;overflow:visible}@media print{@page{size:A4 landscape;margin:4mm;}html,body{height:auto;}table{page-break-inside:avoid;}}</style></head><body><h1>STOCK ΚΑΣΑ ${label} (ΑΠΟΘΗΚΗ)</h1><h2>📅 ${dateStr}</h2><div class="wrapper"><div class="half"><h3>◄ ΑΡΙΣΤΕΡΗ</h3><table><thead>${colHeader}</thead><tbody>${buildRows('ΑΡΙΣΤΕΡΗ')}</tbody></table></div><div class="half"><h3>ΔΕΞΙΑ ►</h3><table><thead>${colHeader}</thead><tbody>${buildRows('ΔΕΞΙΑ')}</tbody></table></div></div></body></html>`;
    if (Platform.OS === 'web') {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }
  };

  const sumNeg = (side) => HEIGHTS.reduce((t,h)=>t+WIDTHS.reduce((s,w)=>{
    const e=stockMap[stockKey(h,w,side,activeCaseType)]||{qty:0,reservations:[]};
    const av=(e.qty||0)-(e.reservations||[]).reduce((a,r)=>r.oldCovered?a:a+(parseInt(r.qty)||1),0);
    return s+(av<0?av:0);
  },0),0);
  const negLeft=sumNeg('ΑΡΙΣΤΕΡΗ'), negRight=sumNeg('ΔΕΞΙΑ');

  return (
    <View style={{flex:1, backgroundColor:'#f5f5f5', flexDirection:'column'}}>
      {/* Tab ΚΛΕΙΣΤΗ / ΑΝΟΙΧΤΗ */}
      <View style={{flexDirection:'row', padding:10, gap:8}}>
        {CASE_TYPES.map(ct => (
          <TouchableOpacity
            key={ct}
            style={[styles.typeTab, activeCaseType===ct && styles.typeTabActive]}
            onPress={()=>setActiveCaseType(ct)}>
            <Text style={{fontWeight:'bold', color: activeCaseType===ct?'white':'#555', fontSize:13}}>
              {ct==='ΚΑΣΑ ΚΛΕΙΣΤΗ'?'ΚΛΕΙΣΤΗ':'ΑΝΟΙΧΤΗ'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ΚΥΡΙΑ ΠΕΡΙΟΧΗ ΜΕ SIDEBAR */}
      <View style={{flex:1, flexDirection:'row'}}>
        {/* ΚΥΡΙΑ ΠΕΡΙΟΧΗ - ΠΙΝΑΚΕΣ */}
        <ScrollView
          style={{flex:1, paddingHorizontal:10}}
          onScrollBeginDrag={onClearSearchHighlight}
          onTouchStart={onClearSearchHighlight}
        >
          {/* ΑΡΙΣΤΕΡΗ */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>◄ ΑΡΙΣΤΕΡΗ — {activeCaseType}</Text>
          </View>
          {renderTable('ΑΡΙΣΤΕΡΗ', activeCaseType)}

          {/* ΔΕΞΙΑ */}
          <View style={[styles.sectionHeader, {marginTop:16}]}>
            <Text style={styles.sectionTitle}>ΔΕΞΙΑ ► — {activeCaseType}</Text>
          </View>
          {renderTable('ΔΕΞΙΑ', activeCaseType)}

          <View style={{height:40}}/>
        </ScrollView>

        {/* ΣΤΑΘΕΡΗ ΔΕΞΙΑ ΜΠΑΡΑ - ΚΟΥΜΠΙΑ ΕΚΤΥΠΩΣΗΣ */}
        <View style={{width:200, backgroundColor:'#2c2c2c', padding:12, gap:12, justifyContent:'flex-start', alignItems:'center'}}>
          <TouchableOpacity
            style={{backgroundColor:'#e65100', paddingHorizontal:12, paddingVertical:18, borderRadius:8, width:'100%', alignItems:'center'}}
            onPress={()=>handlePrintProd(activeCaseType)}>
            <Text style={{color:'white', fontWeight:'bold', fontSize:18, textAlign:'center'}}>🖨️</Text>
            <Text style={{color:'white', fontWeight:'bold', fontSize:14, marginTop:4, textAlign:'center'}}>ΠΑΡΑΓΩΓΗ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{backgroundColor:'white', paddingHorizontal:12, paddingVertical:18, borderRadius:8, width:'100%', alignItems:'center'}}
            onPress={()=>handlePrint(activeCaseType)}>
            <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:18, textAlign:'center'}}>🖨️</Text>
            <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:14, marginTop:4, textAlign:'center'}}>ΑΠΟΘΗΚΗ</Text>
          </TouchableOpacity>
          <View style={styles.negBox}>
            <Text style={styles.negTitle}>ΕΛΛΕΙΨΕΙΣ</Text>
            <View style={{flexDirection:'row', justifyContent:'space-around'}}>
              <View style={{alignItems:'center', flex:1}}>
                <Text style={styles.negLabel}>ΑΡΙΣΤΕΡΕΣ</Text>
                <Text style={[styles.negNum, {color: negLeft<0?'#ff1744':'#2e7d32'}]}>{negLeft}</Text>
              </View>
              <View style={{alignItems:'center', flex:1}}>
                <Text style={styles.negLabel}>ΔΕΞΙΕΣ</Text>
                <Text style={[styles.negNum, {color: negRight<0?'#ff1744':'#2e7d32'}]}>{negRight}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Modal επιλογής ΠΑΡΑΓΩΓΗ / ΑΠΟΘΗΚΗ (add ή sub) */}
      <Modal visible={choiceModal.visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modalBox, {width:'72%', maxWidth:260}]}>
            <Text style={[styles.modalTitle, {fontSize:21, marginBottom:8}]}>{choiceModal.action==='sub'?'Από πού αφαιρείς;':'Πού προσθέτεις;'}</Text>
            <Text style={{fontSize:23, fontWeight:'bold', color:'#1a1a1a', marginBottom:18, textAlign:'center'}}>{choiceModal.label}</Text>
            {(() => {
              const isSub = choiceModal.action === 'sub';
              const prodDisabled = isSub && choiceModal.pending <= 0;
              const stockDisabled = isSub && choiceModal.available <= 0 && !isAdmin;
              const adminNeg = isSub && isAdmin && choiceModal.available <= 0;
              const prodMode = isSub ? 'subPending' : 'pending';
              const stockMode = isSub ? 'sub' : 'pendingIn';
              const prodLabel = isSub ? `🏭 ΠΑΡΑΓΩΓΗ\n\n${choiceModal.label}\n(έως ${choiceModal.pending} τεμ.)` : `🏭 ΠΑΡΑΓΩΓΗ\n\n${choiceModal.label}`;
              const stockLabel = isSub ? `📦 ΑΠΟΘΗΚΗ\n\n${choiceModal.label}${adminNeg ? '' : `\n(έως ${choiceModal.available} τεμ.)`}` : `📦 ΑΠΟΘΗΚΗ\n\n${choiceModal.label}`;
              const openStockQty = () => { setChoiceModal(m=>({...m,visible:false})); setQtyModal({visible:true, key:choiceModal.key, mode:stockMode, label:stockLabel, dim:choiceModal.label}); };
              const confirmStock = () => {
                if (!adminNeg) return openStockQty();
                const msg = `Η αποθήκη (${choiceModal.available}) θα γίνει αρνητική.\n\nΣίγουρα;`;
                if (Platform.OS === 'web') { if (window.confirm(msg)) openStockQty(); }
                else Alert.alert('Αφαίρεση κάτω από το μηδέν', msg, [{text:'ΑΚΥΡΟ',style:'cancel'},{text:'ΝΑΙ',onPress:openStockQty}]);
              };
              return <>
                <TouchableOpacity
                  disabled={prodDisabled}
                  style={{width:'100%', paddingVertical:12, borderRadius:8, alignItems:'center', backgroundColor:'#e65100', opacity:prodDisabled?0.4:1, marginBottom:8}}
                  onPress={()=>{ setChoiceModal(m=>({...m,visible:false})); setQtyModal({visible:true, key:choiceModal.key, mode:prodMode, label:prodLabel, dim:choiceModal.label}); }}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>🏭 ΠΑΡΑΓΩΓΗ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={stockDisabled}
                  style={{width:'100%', paddingVertical:12, borderRadius:8, alignItems:'center', backgroundColor:'#2e7d32', opacity:(isSub&&choiceModal.available<=0)?0.4:1}}
                  onPress={confirmStock}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>📦 ΑΠΟΘΗΚΗ</Text>
                </TouchableOpacity>
              </>;
            })()}
            <TouchableOpacity style={{marginTop:14, paddingVertical:6, width:'100%', alignItems:'center'}} onPress={()=>setChoiceModal(m=>({...m,visible:false}))}>
              <Text style={{color:'#999', fontSize:14, fontWeight:'bold'}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <QtyModal
        visible={qtyModal.visible}
        title={qtyModal.label}
        onConfirm={handleQtyConfirm}
        onCancel={()=>setQtyModal(m=>({...m,visible:false}))}
      />

      <Modal visible={!!showReservations} transparent animationType="fade" onRequestClose={()=>setShowReservations(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, {width:'92%', maxWidth:480}]}>
            <Text style={styles.modalTitle}>📦 Δεσμεύσεις</Text>
            {(() => {
              const totalQty = parseInt(reservationEntry?.qty) || 0;
              const oldCount = (reservationEntry?.reservations||[]).reduce((s,r)=>r.oldCovered?s+(parseInt(r.qty)||1):s,0);
              const remaining = totalQty<0 ? Math.abs(totalQty)-oldCount : 0;
              const canBorrowOld = isAdmin && remaining>0;
              const selDoors = oldSel.reduce((s,no)=>{ const r=(reservationEntry?.reservations||[]).find(x=>String(x.orderNo)===String(no)); return s+(parseInt(r?.qty)||1); },0);
              let _rem = totalQty;
              return <>
                {canBorrowOld && <Text style={{fontSize:12, color:'#e65100', textAlign:'center', marginBottom:6}}>Κάλυψη από παλιό στοκ — μέχρι {remaining} τεμ.</Text>}
                <ScrollView style={{maxHeight:300, width:'100%'}}>
                  {(reservationEntry?.reservations||[]).length === 0
                    ? <Text style={{color:'#999', textAlign:'center', padding:20}}>Δεν υπάρχουν δεσμεύσεις</Text>
                    : (reservationEntry?.reservations||[]).map((r,i) => {
                        const isOld = !!r.oldCovered;
                        const rq = parseInt(r.qty)||1;
                        const covered = isOld || rq <= _rem;
                        if(!isOld && covered) _rem -= rq;
                        const selected = oldSel.some(no=>String(no)===String(r.orderNo));
                        const showChk = canBorrowOld && !covered;
                        const canPick = selected || (selDoors+rq)<=remaining;
                        return (
                          <View key={i} style={{flexDirection:'row', alignItems:'center',
                            justifyContent:'space-between', padding:8,
                            borderBottomWidth:1, borderBottomColor:'#f0f0f0',
                            backgroundColor: covered ? '#f1f8f1' : 'white'}}>
                            {showChk && <TouchableOpacity disabled={!canPick} onPress={()=>setOldSel(prev=>selected?prev.filter(no=>String(no)!==String(r.orderNo)):[...prev,r.orderNo])}
                              style={{width:22, height:22, borderRadius:4, borderWidth:2, borderColor:selected?'#2e7d32':'#bbb', backgroundColor:selected?'#2e7d32':'#fff', alignItems:'center', justifyContent:'center', marginRight:8, opacity:canPick?1:0.4}}>
                              <Text style={{color:'#fff', fontWeight:'bold', fontSize:14}}>{selected?'✓':''}</Text>
                            </TouchableOpacity>}
                            <TouchableOpacity style={{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}
                              onPress={()=>setResDetail({orderNo:r.orderNo, order:customOrders.find(o=>String(o.orderNo)===String(r.orderNo))||null})}>
                              <View style={{flexDirection:'row', alignItems:'center', flex:1}}>
                                <Text style={{fontWeight:'bold', textDecorationLine:'underline',
                                  color: covered ? '#1b5e20' : '#c62828'}}>
                                  #{r.orderNo}{isOld?' 📦':''}
                                </Text>
                                {isOld && isAdmin && <TouchableOpacity onPress={()=>undoOldCover(showReservations, r.orderNo)}
                                  style={{marginLeft:6, backgroundColor:'#e65100', borderRadius:6, width:24, height:24, alignItems:'center', justifyContent:'center'}}>
                                  <Text style={{color:'#fff', fontWeight:'bold', fontSize:15}}>↺</Text>
                                </TouchableOpacity>}
                              </View>
                              <Text style={{color:'#555'}}>{r.customer||'—'}</Text>
                              <Text style={{fontWeight:'bold', marginLeft:8,
                                color: covered ? '#1b5e20' : '#c62828'}}>
                                {rq} τεμ.
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })
                  }
                </ScrollView>
                <TouchableOpacity
                  style={[styles.modalBtn, {backgroundColor:'#8B0000', marginTop:16, width:'100%'}]}
                  onPress={()=>{ if(oldSel.length>0){ setOldConfirm(showReservations); setShowReservations(null); } else setShowReservations(null); }}>
                  <Text style={{color:'white', fontWeight:'bold'}}>ΚΛΕΙΣΙΜΟ</Text>
                </TouchableOpacity>
              </>;
            })()}
          </View>
        </View>
      </Modal>

      {/* Καλάθι εκκρεμοτήτων */}
      {opsBasket.length > 0 && (
        <View style={[{backgroundColor:'#fff', borderRadius:12, borderWidth:2, borderColor:'#1976d2', padding:14, width:360, maxHeight:'90%', elevation:24, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.3, shadowRadius:12, zIndex:9999}, Platform.OS==='web'?{position:'fixed', right:20, bottom:20}:{position:'absolute', right:20, bottom:20}]}>
          <Text style={{fontSize:19, fontWeight:'bold', color:'#0d47a1', marginBottom:2}}>Αλλαγές προς εφαρμογή ({opsBasket.length})</Text>
          <Text style={{fontSize:13, color:'#666', marginBottom:8}}>Έλεγξε τις αλλαγές. Πάτα ✕ για ακύρωση μίας.</Text>
          <ScrollView style={{maxHeight:300}}>
            {opsBasket.map(o => (
              <View key={o.id} style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:5, borderBottomWidth:1, borderBottomColor:'#eee'}}>
                <Text style={{fontSize:15, fontWeight:'bold', color:'#1a1a1a', flex:1}}>{o.dim}</Text>
                <Text style={{fontSize:14, fontWeight:'bold', color: o.mode==='subPending'||o.mode==='sub'?'#c62828':'#2e7d32', marginRight:8}}>{OP_LABEL[o.mode]} {o.n}</Text>
                <TouchableOpacity onPress={()=>setOpsBasket(prev=>prev.filter(x=>x.id!==o.id))} style={{width:28, height:28, borderRadius:14, backgroundColor:'#ffeaea', alignItems:'center', justifyContent:'center'}}>
                  <Text style={{color:'#ff4444', fontWeight:'bold', fontSize:16}}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <View style={{flexDirection:'row', gap:8, marginTop:10}}>
            <TouchableOpacity onPress={()=>setOpsBasket([])} style={{flex:1, paddingVertical:11, borderRadius:8, backgroundColor:'#f0f0f0', alignItems:'center'}}>
              <Text style={{fontWeight:'bold', color:'#666', fontSize:16}}>Άκυρο</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setConfirmApply(true)} style={{flex:1, paddingVertical:11, borderRadius:8, backgroundColor:'#1976d2', alignItems:'center'}}>
              <Text style={{fontWeight:'bold', color:'#fff', fontSize:16}}>ΟΚ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Στοιχεία παραγγελίας (από δέσμευση) */}
      <Modal visible={!!resDetail} transparent animationType="fade" onRequestClose={()=>setResDetail(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, {width:'86%', maxWidth:380, alignItems:'stretch'}]}>
            {resDetail?.order ? (()=>{const o=resDetail.order; const row=(l,v)=>v?<View key={l} style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4, borderBottomWidth:1, borderBottomColor:'#f2f2f2'}}><Text style={{color:'#777', fontSize:13}}>{l}</Text><Text style={{fontWeight:'bold', fontSize:14, color:'#1a1a1a', flexShrink:1, textAlign:'right'}}>{v}</Text></View>:null;
              return <>
              <Text style={[styles.modalTitle, {fontSize:18}]}>Παραγγελία #{o.orderNo}</Text>
              <ScrollView style={{maxHeight:400, width:'100%'}}>
              {row('Πελάτης', o.customer)}
              {row('Καταχώρηση', o.createdAt?new Date(o.createdAt).toLocaleDateString('el-GR'):null)}
              {row('Παράδοση', o.deliveryDate)}
              {row('Διάσταση', `${o.h}x${o.w} ${o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}`)}
              {row('Θωράκιση', o.sasiType||'ΜΟΝΗ ΘΩΡΑΚΙΣΗ')}
              {row('Μοντέλο (διπλή)', o.dipliModel)}
              {row('Τύπος κάσας', o.caseType)}
              {row('Κλειδαριά', o.lock)}
              {row('Αφαλός', o.cylinder)}
              {row('Κυπρί', o.kypri && o.kypri!=='ΟΧΙ' ? o.kypri : null)}
              {row('Μείωση ύψους', o.heightReduction)}
              {row('Τοποθέτηση', o.installation)}
              {row('Τεμάχια', o.qty)}
              {row('Κατάσταση', STATUS_LABEL[o.status]||o.status||'—')}
              {row('Σημειώσεις', o.notes)}
              </ScrollView>
            </>;})() : (
              <View style={{alignItems:'center', paddingVertical:10}}>
                <Text style={{fontSize:16, fontWeight:'bold', color:'#c62828', textAlign:'center'}}>⚠️ Δεν βρέθηκε παραγγελία #{resDetail?.orderNo}</Text>
                <Text style={{fontSize:13, color:'#777', textAlign:'center', marginTop:8}}>Πιθανό «φάντασμα» — δέσμευση χωρίς παραγγελία.</Text>
              </View>
            )}
            <TouchableOpacity style={[styles.modalBtn, {backgroundColor:'#8B0000', marginTop:16}]} onPress={()=>setResDetail(null)}>
              <Text style={{color:'white', fontWeight:'bold'}}>ΚΛΕΙΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Επιβεβαίωση κάλυψης από παλιό στοκ */}
      <Modal visible={!!oldConfirm} transparent animationType="fade" onRequestClose={()=>{setOldConfirm(false);setOldSel([]);}}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, {width:'72%', maxWidth:320}]}>
            <Text style={[styles.modalTitle, {fontSize:19}]}>Κάλυψη από παλιό στοκ</Text>
            <Text style={{fontSize:15, color:'#444', marginBottom:18, textAlign:'center'}}>Να καλυφθούν {oldSel.length} δεσμεύσεις από παλιό (μη περασμένο) στοκ;</Text>
            <TouchableOpacity style={{width:'100%', paddingVertical:12, borderRadius:8, alignItems:'center', backgroundColor:'#2e7d32', marginBottom:8}}
              onPress={()=>applyOldCover(oldConfirm)}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>ΝΑΙ, ΚΑΛΥΨΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{width:'100%', paddingVertical:10, alignItems:'center'}} onPress={()=>{setOldConfirm(false);setOldSel([]);}}>
              <Text style={{color:'#999', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Δεύτερη επιβεβαίωση */}
      <Modal visible={confirmApply} transparent animationType="fade" onRequestClose={()=>setConfirmApply(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, {width:'72%', maxWidth:300}]}>
            <Text style={[styles.modalTitle, {fontSize:19}]}>Επιβεβαίωση</Text>
            <Text style={{fontSize:15, color:'#444', marginBottom:18, textAlign:'center'}}>Να εφαρμοστούν {opsBasket.length} αλλαγές;</Text>
            <TouchableOpacity style={{width:'100%', paddingVertical:12, borderRadius:8, alignItems:'center', backgroundColor:'#2e7d32', marginBottom:8}}
              onPress={()=>{ setConfirmApply(false); commitOps(); }}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>ΝΑΙ, ΕΦΑΡΜΟΓΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{width:'100%', paddingVertical:10, alignItems:'center'}} onPress={()=>setConfirmApply(false)}>
              <Text style={{color:'#999', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  typeTab: { flex:1, padding:12, backgroundColor:'#e0e0e0', borderRadius:8, alignItems:'center' },
  typeTabActive: { backgroundColor:'#E65100' },
  sectionHeader: { backgroundColor:'#1a1a1a', padding:10, borderRadius:8, marginBottom:2, marginTop:4 },
  sectionTitle: { color:'white', fontWeight:'bold', fontSize:13, letterSpacing:1 },
  table: { backgroundColor:'white', borderRadius:8, overflow:'hidden', elevation:2, borderWidth:1, borderColor:'#ddd' },
  tableHeader: { flexDirection:'row', backgroundColor:'#2c2c2c' },
  thWrap: { paddingVertical:8, paddingHorizontal:6, borderRightWidth:1, borderRightColor:'#555' },
  thCell: { color:'white', fontWeight:'bold', fontSize:11 },
  tableRow: { flexDirection:'row', alignItems:'center', borderBottomWidth:1, borderBottomColor:'#e0e0e0' },
  tdWrap: { paddingVertical:6, paddingHorizontal:6, borderRightWidth:1, borderRightColor:'#e0e0e0', justifyContent:'center' },
  dimCell: { fontSize:14, fontWeight:'bold', color:'#1a1a1a' },
  qtyCell: { fontSize:18, fontWeight:'900' },
  btnTxt: { color:'white', fontWeight:'bold', fontSize:16 },
  addBtn: { backgroundColor:'#2e7d32', width:28, height:28, borderRadius:6, alignItems:'center', justifyContent:'center' },
  subBtn: { backgroundColor:'#c62828', width:28, height:28, borderRadius:6, alignItems:'center', justifyContent:'center' },
  overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' },
  modalBox: { backgroundColor:'#fff', borderRadius:16, padding:24, width:'80%', alignItems:'center' },
  modalTitle: { fontSize:15, fontWeight:'bold', color:'#1a1a1a', marginBottom:16, textAlign:'center' },
  modalInput: { borderWidth:2, borderColor:'#E65100', borderRadius:8, padding:12, fontSize:28, fontWeight:'bold', textAlign:'center', color:'#E65100', width:'60%', marginBottom:20 },
  modalBtn: { flex:1, padding:14, borderRadius:8, alignItems:'center' },
  negBox: { width:'100%', backgroundColor:'#fff', borderRadius:8, padding:10, marginTop:'auto', borderWidth:3, borderColor:'#ff1744' },
  negTitle: { color:'#888', fontSize:11, fontWeight:'bold', textAlign:'center', marginBottom:6, letterSpacing:1 },
  negLabel: { color:'#888', fontSize:11, fontWeight:'bold' },
  negNum: { fontSize:34, fontWeight:'900' },
});
