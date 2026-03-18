import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Platform } from 'react-native';
import { FIREBASE_URL } from './App';
import { logActivity } from './activityLog';

const HEIGHTS = ['208', '213', '218', '223'];
const WIDTHS  = ['83', '88', '93', '98'];
const SIDES   = ['ΑΡΙΣΤΕΡΗ', 'ΔΕΞΙΑ'];
const CASE_TYPES = ['ΚΑΣΑ ΚΛΕΙΣΤΗ', 'ΚΑΣΑ ΑΝΟΙΧΤΗ'];

const stockKey = (h, w, side, caseType) => `${h}_${w}_${side}_${caseType==='ΚΑΣΑ ΚΛΕΙΣΤΗ'?'KL':'AN'}`;

const initStockMap = () => {
  const map = {};
  SIDES.forEach(side => {
    HEIGHTS.forEach(h => {
      WIDTHS.forEach(w => {
        CASE_TYPES.forEach(ct => {
          map[stockKey(h,w,side,ct)] = { qty: 0, reservations: [], caseType: ct };
        });
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

export default function CaseScreen({ caseStock={}, setCaseStock }) {
  // Χρησιμοποιούμε απευθείας το κεντρικό state από App.js
  const stockMap = { ...initStockMap(), ...caseStock };
  const [qtyModal, setQtyModal] = useState({ visible:false, key:'', mode:'add', label:'' });
  const [showReservations, setShowReservations] = useState(null);
  const [activeCaseType, setActiveCaseType] = useState('ΚΑΣΑ ΚΛΕΙΣΤΗ');

  const syncKey = async (key, entry) => {
    try {
      await fetch(`${FIREBASE_URL}/case_stock/${key}.json`, {
        method: 'PUT',
        body: JSON.stringify(entry)
      });
    } catch(e) { Alert.alert('Σφάλμα','Δεν αποθηκεύτηκε.'); }
  };

  const handleAdd = (key, label) => {
    setQtyModal({ visible:true, key, mode:'add', label:`+ Προσθήκη στοκ\n${label}` });
  };

  const handleSubtract = (key, label, maxQty) => {
    if (maxQty <= 0) return Alert.alert('Προσοχή','Δεν υπάρχει διαθέσιμο απόθεμα.');
    setQtyModal({ visible:true, key, mode:'sub', label:`- Αφαίρεση από στοκ\n${label}` });
  };

  const handleQtyConfirm = async (n) => {
    const { key, mode } = qtyModal;
    setQtyModal(m => ({...m, visible:false}));
    const entry = {...(stockMap[key] || { qty:0, reservations:[], caseType: activeCaseType })};
    if (mode === 'add') {
      entry.qty = (entry.qty || 0) + n;
    } else {
      const available = (entry.qty || 0) - (entry.reservations||[]).reduce((s,r)=>s+(parseInt(r.qty)||1),0);
      if (n > available) return Alert.alert('Προσοχή',`Μπορείτε να αφαιρέσετε έως ${available} τεμάχια.`);
      entry.qty = Math.max(0, (entry.qty||0) - n);
    }
    setCaseStock(prev => ({...prev, [key]: entry}));
    await syncKey(key, entry);
    await logActivity('ΚΑΣΕΣ ΣΤΟΚ', mode==='add'?'Προσθήκη':'Αφαίρεση', { size: key, qty: String(n) });
  };

  const renderTable = (side, caseType) => {
    return (
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={[styles.thWrap, {width:60}]}><Text style={styles.thCell}>ACT</Text></View>
          <View style={[styles.thWrap, {width:80}]}><Text style={styles.thCell}>ΔΙΑΣΤΑΣΗ</Text></View>
          <View style={[styles.thWrap, {width:60}]}><Text style={[styles.thCell,{textAlign:'center'}]}>ΥΠΟ/ΠΟ</Text></View>
          <View style={[styles.thWrap, {flex:1, borderRightWidth:0}]}><Text style={styles.thCell}>ΔΕΣΜΕΥΣΕΙΣ</Text></View>
        </View>
        {HEIGHTS.map(h => WIDTHS.map(w => {
          const key = stockKey(h, w, side, caseType);
          const entry = stockMap[key] || { qty:0, reservations:[] };
          const reserved = (entry.reservations||[]).reduce((s,r)=>s+(parseInt(r.qty)||1),0);
          const available = (entry.qty||0) - reserved;
          const label = `${h}x${w} ${side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}`;
          const hasReservations = (entry.reservations||[]).length > 0;
          const availColor = available <= 0 ? '#ff4444' : available <= 3 ? '#ff9800' : '#1b5e20';

          return (
            <View key={key} style={[styles.tableRow, available<0&&{backgroundColor:'#fff5f5'}]}>
              <View style={[styles.tdWrap, {width:60, flexDirection:'row', gap:4, justifyContent:'center'}]}>
                <TouchableOpacity style={styles.addBtn} onPress={()=>handleAdd(key, label)}>
                  <Text style={styles.btnTxt}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.subBtn, available<=0&&{opacity:0.35}]}
                  onPress={()=>handleSubtract(key, label, available)}>
                  <Text style={styles.btnTxt}>-</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.tdWrap, {width:80}]}>
                <Text style={styles.dimCell}>{h}x{w}</Text>
              </View>
              <View style={[styles.tdWrap, {width:60, alignItems:'center'}]}>
                <Text style={[styles.qtyCell, {color: availColor}]}>{available}</Text>
                {entry.qty > 0 && <Text style={{fontSize:9, color:'#aaa'}}>/{entry.qty}</Text>}
              </View>
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

  return (
    <View style={{flex:1, backgroundColor:'#f5f5f5'}}>
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

      <ScrollView style={{flex:1, paddingHorizontal:10}}>
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

      <QtyModal
        visible={qtyModal.visible}
        title={qtyModal.label}
        onConfirm={handleQtyConfirm}
        onCancel={()=>setQtyModal(m=>({...m,visible:false}))}
      />

      <Modal visible={!!showReservations} transparent animationType="fade" onRequestClose={()=>setShowReservations(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, {width:'90%', maxWidth:400}]}>
            <Text style={styles.modalTitle}>📦 Δεσμεύσεις</Text>
            <ScrollView style={{maxHeight:300, width:'100%'}}>
              {(reservationEntry?.reservations||[]).length === 0
                ? <Text style={{color:'#999', textAlign:'center', padding:20}}>Δεν υπάρχουν δεσμεύσεις</Text>
                : (reservationEntry?.reservations||[]).map((r,i) => (
                  <View key={i} style={{flexDirection:'row', justifyContent:'space-between', padding:8, borderBottomWidth:1, borderBottomColor:'#f0f0f0'}}>
                    <Text style={{fontWeight:'bold'}}>#{r.orderNo}</Text>
                    <Text style={{color:'#555'}}>{r.customer||'—'}</Text>
                    <Text style={{color:'#E65100', fontWeight:'bold'}}>{r.qty||1} τεμ.</Text>
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
});
