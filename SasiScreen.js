import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Platform } from 'react-native';
import { FIREBASE_URL } from './App';
import { logActivity } from './activityLog';

const HEIGHTS = ['208', '213', '218', '223'];
const WIDTHS  = ['83', '88', '93', '98'];
const SIDES   = ['ΑΡΙΣΤΕΡΗ', 'ΔΕΞΙΑ'];

const stockKey = (h, w, side) => `${h}_${w}_${side}`;

// Αρχικοποίηση κενού πίνακα για όλες τις διαστάσεις
const initStockMap = () => {
  const map = {};
  SIDES.forEach(side => {
    HEIGHTS.forEach(h => {
      WIDTHS.forEach(w => {
        map[stockKey(h,w,side)] = { qty: 0, reservations: [], pending: 0 };
      });
    });
  });
  return map;
};

function QtyModal({ visible, title, onConfirm, onCancel }) {
  const [val, setVal] = useState('');
  useEffect(() => { if (visible) setVal(''); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TextInput
            style={styles.modalInput}
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
            <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#007AFF'}]} onPress={()=>{
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

export default function SasiScreen({ sasiStock={}, setSasiStock }) {
  // Χρησιμοποιούμε απευθείας το κεντρικό state από App.js
  const stockMap = { ...initStockMap(), ...sasiStock };
  const [qtyModal, setQtyModal] = useState({ visible:false, key:'', mode:'add', label:'' });
  const [showReservations, setShowReservations] = useState(null);

  const syncKey = async (key, entry) => {
    try {
      await fetch(`${FIREBASE_URL}/sasi_stock/${key}.json`, {
        method: 'PUT',
        body: JSON.stringify(entry)
      });
    } catch(e) { Alert.alert('Σφάλμα','Δεν αποθηκεύτηκε.'); }
  };

  const handleAdd = (key, label) => {
    setQtyModal({ visible:true, key, mode:'pending', label:`+ PENDING\n${label}` });
  };

  const handlePendingIn = (key, label, pendingQty) => {
    if (pendingQty <= 0) return Alert.alert('Προσοχή','Δεν υπάρχει ποσότητα σε PENDING.');
    setQtyModal({ visible:true, key, mode:'pendingIn', label:`📦 Παραλαβή από PENDING\n${label}\n(έως ${pendingQty} τεμ.)` });
  };

  const handleSubtract = (key, label, maxQty) => {
    if (maxQty <= 0) return Alert.alert('Προσοχή','Δεν υπάρχει διαθέσιμο απόθεμα.');
    setQtyModal({ visible:true, key, mode:'sub', label:`- Αφαίρεση από στοκ\n${label}` });
  };

  const handleQtyConfirm = async (n) => {
    const { key, mode } = qtyModal;
    setQtyModal(m => ({...m, visible:false}));
    const entry = {...(stockMap[key] || { qty:0, reservations:[], pending:0 })};
    if (mode === 'pending') {
      entry.pending = (entry.pending || 0) + n;
    } else if (mode === 'pendingIn') {
      const maxPending = entry.pending || 0;
      if (n > maxPending) return Alert.alert('Προσοχή',`Μπορείτε να παραλάβετε έως ${maxPending} τεμάχια.`);
      entry.qty = (entry.qty || 0) + n;
      entry.pending = maxPending - n;
    } else {
      const available = (entry.qty || 0) - (entry.reservations||[]).reduce((s,r)=>s+(parseInt(r.qty)||1),0);
      if (n > available) return Alert.alert('Προσοχή',`Μπορείτε να αφαιρέσετε έως ${available} τεμάχια.`);
      entry.qty = Math.max(0, (entry.qty||0) - n);
    }
    setSasiStock(prev => ({...prev, [key]: entry}));
    await syncKey(key, entry);
    const modeLabel = mode==='pending'?'PENDING':mode==='pendingIn'?'Παραλαβή από PENDING':'Αφαίρεση';
    await logActivity('ΣΑΣΙ ΣΤΟΚ', modeLabel, { size: key.replace(/_/g,'x'), qty: String(n) });
  };

  const renderTable = (side) => {
    return (
      <View style={styles.table}>
        {/* Header */}
        <View style={styles.tableHeader}>
          <View style={[styles.thWrap, {width:34}]}><Text style={styles.thCell}>ACT</Text></View>
          <View style={[styles.thWrap, {width:60}]}><Text style={[styles.thCell,{textAlign:'center'}]}>PEND.</Text></View>
          <View style={[styles.thWrap, {width:80}]}><Text style={styles.thCell}>ΔΙΑΣΤΑΣΗ</Text></View>
          <View style={[styles.thWrap, {width:60}]}><Text style={[styles.thCell,{textAlign:'center'}]}>ΥΠΟ/ΠΟ</Text></View>
          <View style={[styles.thWrap, {flex:1, borderRightWidth:0}]}><Text style={styles.thCell}>ΔΕΣΜΕΥΣΕΙΣ</Text></View>
        </View>
        {/* Rows */}
        {HEIGHTS.map(h => WIDTHS.map(w => {
          const key = stockKey(h, w, side);
          const entry = stockMap[key] || { qty:0, reservations:[], pending:0 };
          const reserved = (entry.reservations||[]).reduce((s,r)=>s+(parseInt(r.qty)||1),0);
          const available = (entry.qty||0) - reserved;
          const pending = entry.pending || 0;
          const label = `${h}x${w} ${side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}`;
          const hasReservations = (entry.reservations||[]).length > 0;
          const availColor = available <= 0 ? '#ff4444' : available <= 3 ? '#ff9800' : '#1b5e20';

          return (
            <View key={key} style={[styles.tableRow, available<0&&{backgroundColor:'#fff5f5'}]}>
              {/* ΕΝΕΡΓΕΙΕΣ — μόνο το - */}
              <View style={[styles.tdWrap, {width:34, justifyContent:'center', alignItems:'center'}]}>
                <TouchableOpacity style={[styles.subBtn, available<=0&&{opacity:0.35}]}
                  onPress={()=>handleSubtract(key, label, available)}>
                  <Text style={styles.btnTxt}>-</Text>
                </TouchableOpacity>
              </View>
              {/* PENDING */}
              <TouchableOpacity
                style={[styles.tdWrap, {width:60, alignItems:'center', backgroundColor: pending>0?'#fff8e1':'transparent'}]}
                onPress={()=>handleAdd(key, label)}
                onLongPress={()=>pending>0&&handlePendingIn(key, label, pending)}>
                <Text style={{fontSize:16, fontWeight:'900', color: pending>0?'#e65100':'#ccc'}}>{pending>0?pending:'+'}</Text>
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
                {entry.qty > 0 && <Text style={{fontSize:9, color:'#aaa'}}>/{entry.qty}</Text>}
              </View>
              {/* ΔΕΣΜΕΥΣΕΙΣ */}
              <TouchableOpacity
                style={[styles.tdWrap, {flex:1, borderRightWidth:0}]}
                onPress={()=>hasReservations?setShowReservations(key):null}>
                <Text style={{fontSize:11, color: hasReservations?'#c62828':'#bbb'}} numberOfLines={2}>
                  {hasReservations
                    ? (entry.reservations||[]).map(r=>`#${r.orderNo}(${r.qty||1})`).join('  ')
                    : '—'
                  }
                </Text>
              </TouchableOpacity>
            </View>
          );
        }))}
      </View>
    );
  };

  const reservationEntry = showReservations ? stockMap[showReservations] : null;

  const handlePrintProd = () => {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    const buildRows = (side) => HEIGHTS.flatMap(h => WIDTHS.map(w => {
      const key = stockKey(h, w, side);
      const entry = stockMap[key] || { qty:0, reservations:[], pending:0 };
      const pending = entry.pending || 0;
      return `<tr>
        <td style="width:45px;font-weight:bold;text-align:center;color:${pending>0?'#e65100':'#aaa'}">${pending>0?pending:'—'}</td>
        <td style="width:60px;font-weight:bold">${h}x${w}</td>
        <td></td>
      </tr>`;
    })).join('');
    const colHeader = `<tr style="background:#1a1a1a"><th style="color:white;padding:4px 6px;width:45px;text-align:center">PEND.</th><th style="color:white;padding:4px 6px;width:60px">ΔΙΑΣΤΑΣΗ</th><th style="color:white;padding:4px 6px">ΠΑΡΑΤΗΡΗΣΕΙΣ</th></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:6mm;color:#000;}h1{font-size:16px;margin-bottom:2px;font-weight:bold;}h2{font-size:11px;color:#555;margin-top:0;margin-bottom:8px;}.wrapper{display:flex;gap:8mm;}.half{flex:1;}.half h3{font-size:13px;font-weight:bold;background:#333;color:white;padding:5px 8px;margin-bottom:0;}table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}th{padding:5px 6px;text-align:left;border-bottom:2px solid #000;}td{padding:10px 6px;border-bottom:1px solid #ccc;}@media print{@page{size:A4 landscape;margin:6mm;}}</style></head><body><h1>ΠΑΡΑΓΩΓΗ ΣΑΣΙ</h1><h2>📅 ${dateStr}</h2><div class="wrapper"><div class="half"><h3>◄ ΑΡΙΣΤΕΡΗ</h3><table><thead>${colHeader}</thead><tbody>${buildRows('ΑΡΙΣΤΕΡΗ')}</tbody></table></div><div class="half"><h3>ΔΕΞΙΑ ►</h3><table><thead>${colHeader}</thead><tbody>${buildRows('ΔΕΞΙΑ')}</tbody></table></div></div><script>window.onload=()=>window.print();<\/script></body></html>`;
    if (Platform.OS === 'web') {
      const win = window.open('', '_blank');
      if (!win) return Alert.alert('Σφάλμα','Επιτρέψτε τα pop-ups.');
      win.document.write(html);
      win.document.close();
    }
  };
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    const buildRows = (side) => HEIGHTS.flatMap(h => WIDTHS.map(w => {
      const key = stockKey(h, w, side);
      const entry = stockMap[key] || { qty:0, reservations:[], pending:0 };
      const reserved = (entry.reservations||[]).reduce((s,r)=>s+(parseInt(r.qty)||1),0);
      const available = (entry.qty||0) - reserved;
      const pending = entry.pending || 0;
      const resText = (entry.reservations||[]).map(r=>`#${r.orderNo}(${r.qty||1})`).join(', ') || '—';
      const availColor = available < 0 ? '#cc0000' : available === 0 ? '#888' : '#155724';
      return `<tr>
        <td style="font-weight:bold">${h}x${w}</td>
        <td style="text-align:center;color:${pending>0?'#e65100':'#aaa'};font-weight:bold">${pending>0?pending:'—'}</td>
        <td style="text-align:center;font-weight:900;color:${availColor}">${available}</td>
        <td style="font-size:10px;color:#555">${resText}</td>
      </tr>`;
    })).join('');
    const colHeader = `<tr style="background:#1a1a1a"><th style="color:white;padding:4px 4px;width:50px">ΔΙΑΣΤΑΣΗ</th><th style="color:white;padding:4px 4px;width:40px;text-align:center">PEND.</th><th style="color:white;padding:4px 4px;width:45px;text-align:center">ΥΠΟ/ΠΟ</th><th style="color:white;padding:4px 4px">ΔΕΣΜΕΥΣΕΙΣ</th></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:6mm;color:#000;}h1{font-size:16px;margin-bottom:2px;font-weight:bold;}h2{font-size:11px;color:#555;margin-top:0;margin-bottom:8px;}.wrapper{display:flex;gap:8mm;}.half{flex:1;}.half h3{font-size:13px;font-weight:bold;background:#333;color:white;padding:5px 8px;margin-bottom:0;}table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;}th{padding:4px 6px;text-align:left;border-bottom:2px solid #000;overflow:hidden;}td{padding:3px 6px;border-bottom:1px solid #ddd;overflow:hidden;white-space:nowrap;}td:last-child{white-space:normal;}@media print{@page{size:A4 landscape;margin:6mm;}}</style></head><body><h1>STOCK ΣΑΣΙ (ΑΠΟΘΗΚΗ)</h1><h2>📅 ${dateStr}</h2><div class="wrapper"><div class="half"><h3>◄ ΑΡΙΣΤΕΡΗ</h3><table><thead>${colHeader}</thead><tbody>${buildRows('ΑΡΙΣΤΕΡΗ')}</tbody></table></div><div class="half"><h3>ΔΕΞΙΑ ►</h3><table><thead>${colHeader}</thead><tbody>${buildRows('ΔΕΞΙΑ')}</tbody></table></div></div><script>window.onload=()=>window.print();<\/script></body></html>`;
    if (Platform.OS === 'web') {
      const win = window.open('', '_blank');
      if (!win) return Alert.alert('Σφάλμα','Επιτρέψτε τα pop-ups.');
      win.document.write(html);
      win.document.close();
    }
  };

  return (
    <View style={{flex:1, backgroundColor:'#f5f5f5'}}>
      <ScrollView style={{flex:1, padding:10}}>

        {/* ΑΡΙΣΤΕΡΗ — με κουμπί εκτύπωσης */}
        <View style={[styles.sectionHeader, {flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}>
          <Text style={styles.sectionTitle}>◄ ΑΡΙΣΤΕΡΗ</Text>
          <View style={{flexDirection:'row', gap:6}}>
            <TouchableOpacity
              style={{backgroundColor:'#e65100', paddingHorizontal:8, paddingVertical:5, borderRadius:6}}
              onPress={handlePrintProd}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🖨️ ΠΑΡΑΓΩΓΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{backgroundColor:'white', paddingHorizontal:8, paddingVertical:5, borderRadius:6}}
              onPress={handlePrint}>
              <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:11}}>🖨️ ΑΠΟΘΗΚΗ</Text>
            </TouchableOpacity>
          </View>
        </View>
        {renderTable('ΑΡΙΣΤΕΡΗ')}

        {/* ΔΕΞΙΑ */}
        <View style={[styles.sectionHeader, {marginTop:16}]}>
          <Text style={styles.sectionTitle}>ΔΕΞΙΑ ►</Text>
        </View>
        {renderTable('ΔΕΞΙΑ')}

        <View style={{height:40}}/>
      </ScrollView>

      {/* Modal ποσότητας */}
      <QtyModal
        visible={qtyModal.visible}
        title={qtyModal.label}
        onConfirm={handleQtyConfirm}
        onCancel={()=>setQtyModal(m=>({...m,visible:false}))}
      />

      {/* Modal δεσμεύσεων */}
      <Modal visible={!!showReservations} transparent animationType="fade" onRequestClose={()=>setShowReservations(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, {width:'90%', maxWidth:400}]}>
            <Text style={styles.modalTitle}>
              📦 Δεσμεύσεις {showReservations?.replace(/_/g,' ')}
            </Text>
            <ScrollView style={{maxHeight:300, width:'100%'}}>
              {(reservationEntry?.reservations||[]).length === 0
                ? <Text style={{color:'#999', textAlign:'center', padding:20}}>Δεν υπάρχουν δεσμεύσεις</Text>
                : (reservationEntry?.reservations||[]).map((r,i) => (
                  <View key={i} style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderBottomColor:'#f0f0f0'}}>
                    <Text style={{fontWeight:'bold'}}>#{r.orderNo}</Text>
                    <Text style={{color:'#555'}}>{r.customer||'—'}</Text>
                    <Text style={{color:'#007AFF', fontWeight:'bold'}}>{r.qty||1} τεμ.</Text>
                  </View>
                ))
              }
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalBtn, {backgroundColor:'#8B0000', marginTop:16, width:'100%'}]}
              onPress={()=>setShowReservations(null)}>
              <Text style={{color:'white', fontWeight:'bold'}}>ΚΛΕΙΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { backgroundColor:'#1a1a1a', padding:10, borderRadius:8, marginBottom:2, marginTop:4 },
  sectionTitle: { color:'white', fontWeight:'bold', fontSize:14, letterSpacing:2 },
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
  modalInput: { borderWidth:2, borderColor:'#007AFF', borderRadius:8, padding:12, fontSize:28, fontWeight:'bold', textAlign:'center', color:'#007AFF', width:'60%', marginBottom:20 },
  modalBtn: { flex:1, padding:14, borderRadius:8, alignItems:'center' },
});
