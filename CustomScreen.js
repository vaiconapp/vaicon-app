import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, LayoutAnimation, Modal, Share, PanResponder, Dimensions, Platform, Keyboard } from 'react-native';
const SCREEN_WIDTH = Dimensions.get('window').width;
import { FIREBASE_URL } from './App';
import { logActivity } from './activityLog';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Helper εκτύπωσης — web: window.print(), mobile: expo-print + sharing
const printHTML = async (html, title) => {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (!win) { Alert.alert("Σφάλμα", "Ο browser μπλόκαρε το παράθυρο εκτύπωσης. Επιτρέψτε τα pop-ups."); return; }
    const previewHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title || 'VAICON'}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; background: #f5f5f5; }
          #toolbar {
            position: fixed; top: 0; left: 0; right: 0;
            background: #1a1a1a; padding: 10px 16px;
            display: flex; align-items: center; justify-content: space-between;
            z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          }
          #toolbar h2 { color: white; font-size: 14px; }
          #printBtn {
            background: #007AFF; color: white; border: none;
            padding: 10px 24px; border-radius: 8px; font-size: 15px;
            font-weight: bold; cursor: pointer; letter-spacing: 1px;
          }
          #printBtn:hover { background: #0056b3; }
          #closeBtn {
            background: #555; color: white; border: none;
            padding: 10px 16px; border-radius: 8px; font-size: 14px;
            cursor: pointer; margin-left: 8px;
          }
          #content { margin-top: 56px; padding: 16px; background: white; min-height: calc(100vh - 56px); }
          @media print {
            #toolbar { display: none; }
            #content { margin-top: 0; padding: 0; }
            @page { size: A4 landscape; margin: 5mm; }
          }
        </style>
      </head>
      <body>
        <div id="toolbar">
          <h2>🖨️ ${title || 'VAICON'}</h2>
          <div>
            <button id="printBtn" onclick="window.print()">🖨️ ΕΚΤΥΠΩΣΗ</button>
            <button id="closeBtn" onclick="window.close()">✕ ΚΛΕΙΣΙΜΟ</button>
          </div>
        </div>
        <div id="content">
          ${html.replace(/<html>.*?<body>/s,'').replace(/<\/body>.*?<\/html>/s,'')}
        </div>
      </body>
      </html>
    `;
    win.document.write(previewHTML);
    win.document.close();
    win.focus();
  } else {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title || 'VAICON', UTI: 'com.adobe.pdf' });
  }
};

// ── Helpers για νέο stock σύστημα ──
const sasiKey = (h, w, side) => `${h}_${w}_${side}`;
const caseKey = (h, w, side, caseType) => `${h}_${w}_${side}_${(caseType||'').includes('ΑΝΟΙΧΤΟΥ')||caseType==='ΚΑΣΑ ΑΝΟΙΧΤΗ'?'AN':'KL'}`;
const stockAvailable = (stockMap, key) => {
  const entry = stockMap?.[key];
  if (!entry) return 0;
  const reserved = (entry.reservations||[]).reduce((s,r)=>s+(parseInt(r.qty)||1),0);
  return (parseInt(entry.qty)||0) - reserved;
};

const fmtDate = (ts) => { if (!ts) return null; const d = new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };
const fmtDateTime = (ts) => { if (!ts) return null; const d = new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

const STD_HEIGHTS = ['208','213','218','223'];
const STD_WIDTHS  = ['83','88','93','98'];
const INIT_FORM   = { customer:'', orderNo:'', h:'', w:'', hinges:'2', qty:'1', glassDim:'', glassNotes:'', armor:'ΜΟΝΗ', side:'ΔΕΞΙΑ', lock:'', notes:'', status:'PENDING', hardware:'', installation:'ΟΧΙ', caseType:'ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ', caseMaterial:'DKP', deliveryDate:'', sasiType:'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', coatings:[], stavera:[], heightReduction:'' };




function SellModal({ visible, totalQty, onConfirm, onCancel }) {
  const [qty, setQty] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>ΜΕΡΙΚΗ ΠΩΛΗΣΗ</Text>
          <Text style={styles.modalSub}>Πόσα τεμάχια θα πουληθούν;</Text>
          <Text style={styles.modalTotal}>Σύνολο: {totalQty} τεμ.</Text>
          <TextInput style={styles.modalInput} keyboardType="numeric" value={qty} onChangeText={setQty} placeholder="π.χ. 2" autoFocus />
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#ccc'}]} onPress={()=>{setQty('');onCancel();}}>
              <Text style={{fontWeight:'bold'}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#8B0000'}]} onPress={()=>{
              const n=parseInt(qty);
              if(!n||n<1||n>totalQty) return Alert.alert("Σφάλμα",`Βάλτε αριθμό 1 έως ${totalQty}`);
              setQty(''); onConfirm(n);
            }}>
              <Text style={{fontWeight:'bold',color:'white'}}>ΠΩΛΗΣΗ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── ConfirmModal — γενική επιβεβαίωση ──
function ConfirmModal({ visible, title, message, confirmText, onConfirm, onCancel }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
        <View style={{ backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380 }}>
          <Text style={{ fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:12, textAlign:'center' }}>{title}</Text>
          <Text style={{ fontSize:14, color:'#444', marginBottom:24, textAlign:'center', lineHeight:20 }}>{message}</Text>
          <TouchableOpacity
            style={{ backgroundColor:'#00C851', padding:14, borderRadius:10, alignItems:'center', marginBottom:8 }}
            onPress={onConfirm}>
            <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>{confirmText}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd' }}
            onPress={onCancel}>
            <Text style={{ color:'#555', fontWeight:'bold', fontSize:14 }}>ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Helper: βρίσκει πρόταση για διπλότυπο νούμερο ──
const computeSuggested = (base, allOrders, editingId) => {
  const letters = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
  for(let i=0; i<letters.length; i++){
    const candidate = base+'-'+letters[i];
    if(!allOrders.some(o=>o.orderNo===candidate && o.id!==editingId)) return candidate;
  }
  return base+'-?';
};

// ── DuplicateModal — 3 επιλογές ──
function DuplicateModal({ visible, base, suggested, onUse, onKeep, onCancel }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
        <View style={{ backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380 }}>
          <Text style={{ fontSize:17, fontWeight:'bold', color:'#8B0000', marginBottom:8, textAlign:'center' }}>⚠️ Διπλότυπο Νούμερο</Text>
          <Text style={{ fontSize:14, color:'#444', marginBottom:4, textAlign:'center' }}>
            Το νούμερο <Text style={{ fontWeight:'bold' }}>{base}</Text> υπάρχει ήδη.
          </Text>
          <Text style={{ fontSize:13, color:'#888', marginBottom:20, textAlign:'center' }}>
            Πρόταση: <Text style={{ fontWeight:'bold', color:'#007AFF' }}>{suggested}</Text>
          </Text>
          <TouchableOpacity
            style={{ backgroundColor:'#007AFF', padding:14, borderRadius:10, alignItems:'center', marginBottom:8 }}
            onPress={onUse}>
            <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>✅ ΧΡΗΣΙΜΟΠΟΙΩ {suggested}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', marginBottom:8, borderWidth:1, borderColor:'#ddd' }}
            onPress={onKeep}>
            <Text style={{ color:'#1a1a1a', fontWeight:'bold', fontSize:14 }}>🔒 ΚΡΑΤΩ {base}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor:'#ff4444', padding:14, borderRadius:10, alignItems:'center' }}
            onPress={onCancel}>
            <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>✕ ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function CustomScreen({ customOrders, setCustomOrders, soldOrders, setSoldOrders, customers, onRequestAddCustomer, sasiStock={}, setSasiStock, caseStock={}, setCaseStock, sasiOrders=[], setSasiOrders, caseOrders=[], setCaseOrders, coatings=[], dipliSasiStock=[], setDipliSasiStock, locks=[], specialOrders=[] }) {
  const [expanded, setExpanded] = useState({ pending:false, prod:false, ready:false, archive:false, stdList:true, stdMoni:true, stdDipli:true, stdReady:true, stdSold:false, stdReadyD:true, stdSoldD:false, stdMoniOpen:false, stdDipliOpen:false, dipliProd:true, dipliSasiStock:false, moniProd:true, moniSasiStock:false });
  const [showHardwarePicker, setShowHardwarePicker] = useState(false);
  const [showLockPicker, setShowLockPicker] = useState(false);
  const [showCoatingsPicker, setShowCoatingsPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customHardwareText, setCustomHardwareText] = useState('');
  const [showCustomHardwareInput, setShowCustomHardwareInput] = useState(false);
  const [stdTab, setStdTab] = useState('ΜΟΝΗ');
  const [customForm, setCustomForm] = useState(INIT_FORM);
  const [editingOrder, setEditingOrder] = useState(null); // η πόρτα που επεξεργαζόμαστε
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [sellModal, setSellModal]  = useState({ visible:false, orderId:null, totalQty:1 });
  const [readyConfirmModal, setReadyConfirmModal] = useState({ visible:false, order:null, sasiItem:null, caseItem:null });
  const [confirmModal, setConfirmModal] = useState({ visible:false, title:'', message:'', confirmText:'', onConfirm:null });
  const [dupModal, setDupModal] = useState({ visible:false, base:'', suggested:'', onUse:null, onKeep:null, onCancel:null });

  const customerRef=useRef(); const orderNoRef=useRef(); const hRef=useRef(); const wRef=useRef(); const qtyEidikiRef=useRef();
  const hingeRef=useRef(); const glassRef=useRef(); const glassNotesRef=useRef(); const lockRef=useRef(); const notesRef=useRef();
  const customerSelectedRef = useRef(false);
  const prodScrollRef = useRef(null);
  const mainScrollRef = useRef(null);
  const staveraWidthRefs = useRef({});
  const staveraNoteRefs = useRef({});
  const staveraHRefs = useRef({});
  const staveraWRefs = useRef({});
  const staveraGridNoteRefs = useRef({});
  const [pageWidth, setPageWidth] = useState(SCREEN_WIDTH);


  const syncToCloud = async (o) => { try { await fetch(`${FIREBASE_URL}/std_orders/${o.id}.json`,{method:'PUT',body:JSON.stringify(o)}); } catch { Alert.alert("Σφάλμα","Δεν αποθηκεύτηκε."); } };
  const deleteFromCloud = async (id) => { try { await fetch(`${FIREBASE_URL}/std_orders/${id}.json`,{method:'DELETE'}); } catch(e){} };

  const resetForm = () => { setCustomForm(INIT_FORM); setCustomerSearch(''); setSelectedCustomer(null); setShowCustomerList(false); setEditingOrder(null); };

  const blurAll = () => {
    Object.values(staveraHRefs.current).forEach(r=>r?.blur());
    Object.values(staveraGridNoteRefs.current).forEach(r=>r?.blur());
  };
  useEffect(()=>{ setTimeout(()=>customerRef.current?.focus(), 300); }, []);

  useEffect(() => {
    let updated = false;
    const newOrders = customOrders.map(o=>{
      if(o.orderType!=='ΤΥΠΟΠΟΙΗΜΕΝΗ') return o;
      const isMoniNoLock = (o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType) && !o.lock;
      const hasMontage = o.installation==='ΝΑΙ';
      const hasStavera = o.stavera && o.stavera.length > 0;
      const sk = sasiKey(String(o.h), String(o.w), o.side);
      const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
      const sasiAvail = stockAvailable(sasiStock, sk);
      const caseAvail = stockAvailable(caseStock, ck);

      if(o.status==='STD_PENDING' && isMoniNoLock && (hasMontage || hasStavera)){
        const hasSasiOk = sasiAvail > 0 || (sasiStock[sk]?.reservations||[]).some(r=>r.orderNo===o.orderNo);
        const hasCaseOk = caseAvail > 0 || (caseStock[ck]?.reservations||[]).some(r=>r.orderNo===o.orderNo);
        if(!hasCaseOk || !hasSasiOk) return o;
        if(hasMontage){
          if(o.stdInProd) return o;
          updated = true;
          const upd = {...o, stdInProd:true};
          syncToCloud(upd);
          return upd;
        } else {
          updated = true;
          const upd = {...o, status:'STD_READY', readyAt:Date.now(), staveraPendingAtReady:true};
          syncToCloud(upd);
          return upd;
        }
      }

      if(o.status!=='DIPLI_PROD' && o.status!=='MONI_PROD') return o;
      const phases = o.status==='DIPLI_PROD' ? o.dipliPhases : o.moniPhases;
      const allDone = phases && Object.keys(phases).every(k=>!phases[k].active||phases[k].done);
      if(!allDone) return o;
      const staveraPending = hasStavera && !o.staveraDone;
      const hasCaseOk2 = caseAvail > 0 || (caseStock[ck]?.reservations||[]).some(r=>r.orderNo===o.orderNo);
      if(!hasCaseOk2) return o;
      updated = true;
      const upd2 = {...o, status:'STD_READY', readyAt:Date.now(), ...(staveraPending?{staveraPendingAtReady:true}:{})};
      syncToCloud(upd2);
      return upd2;
    });
    if(updated) setCustomOrders(newOrders);
  }, [customOrders, caseStock, sasiStock]);

  const saveOrder = async () => {
    if (!customForm.orderNo) return Alert.alert("Προσοχή","Το Νούμερο Παραγγελίας είναι υποχρεωτικό.");
    if (!customForm.h||!customForm.w) return Alert.alert("Προσοχή","Βάλτε Ύψος και Πλάτος.");

    // Έλεγχος αν ο πελάτης είναι καταχωρημένος
    if (customForm.customer && !selectedCustomer) {
      const exists = (customers||[]).some(c=>c.name?.toLowerCase()===customForm.customer.trim().toLowerCase());
      if (!exists) {
        Alert.alert(
          "Πελάτης δεν βρέθηκε",
          `Ο πελάτης "${customForm.customer.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`,
          [
            { text:"ΟΧΙ", style:"destructive", onPress:()=>{ setCustomerSearch(''); setCustomForm(f=>({...f,customer:''})); }},
            { text:"ΝΑΙ", onPress:()=>{
              if (onRequestAddCustomer) {
                onRequestAddCustomer(customForm.customer.trim(), (newCustomer)=>{
                  setSelectedCustomer(newCustomer);
                  setCustomerSearch(newCustomer.name);
                  setCustomForm(f=>({...f, customer:newCustomer.name, customerId:newCustomer.id}));
                });
              }
            }}
          ]
        );
        return;
      }
    }
    const isMoniWithLock = (customForm.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!customForm.sasiType) && customForm.lock;
    const isMoniWithInstallation = (customForm.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!customForm.sasiType) && !customForm.lock && customForm.installation==='ΝΑΙ';
    const moniPhases = isMoniWithLock ? {
      laser:   {active:true, done:false, printHistory:[]},
      montSasi:{active:true, done:false, printHistory:[]},
      montDoor:{active:true, done:false, printHistory:[]}
    } : null;
    const newOrder = {...customForm, orderType:'ΤΥΠΟΠΟΙΗΜΕΝΗ', id:Date.now().toString(), createdAt:Date.now(),
      status: isMoniWithLock ? 'MONI_PROD' : 'STD_PENDING',
      ...(isMoniWithLock ? {moniPhases} : {})
    };
    setCustomOrders([newOrder,...customOrders]);
    await syncToCloud(newOrder);
    await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Νέα παραγγελία', { orderNo: newOrder.orderNo, customer: newOrder.customer, size: `${newOrder.h}x${newOrder.w}`, qty: newOrder.qty });

    // ── Δέσμευση στοκ (νέο σύστημα) ──
    if (newOrder.status === 'STD_PENDING' && setSasiStock && setCaseStock) {
      const orderQtyR = parseInt(newOrder.qty)||1;
      const isMoniR = (newOrder.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!newOrder.sasiType) && !newOrder.lock;
      const sk = sasiKey(String(newOrder.h), String(newOrder.w), newOrder.side);
      const ck = caseKey(String(newOrder.h), String(newOrder.w), newOrder.side, newOrder.caseType);
      const newRes = { orderNo: newOrder.orderNo, customer: newOrder.customer||'', qty: orderQtyR };

      // ΣΑΣΙ (μόνο ΜΟΝΗ χωρίς κλειδαριά)
      if (isMoniR) {
        const existingSasi = sasiStock[sk] || { qty: 0, reservations: [] };
        const updSasiEntry = {
          ...existingSasi,
          reservations: [...(existingSasi.reservations||[]), newRes]
        };
        setSasiStock(prev=>({...prev, [sk]: updSasiEntry}));
        await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`,{method:'PUT',body:JSON.stringify(updSasiEntry)});
      }

      // ΚΑΣΑ (ΜΟΝΗ + ΔΙΠΛΗ)
      const existingCase = caseStock[ck] || { qty: 0, reservations: [], caseType: (newOrder.caseType||'').includes('ΑΝΟΙΧΤΟΥ')?'ΚΑΣΑ ΑΝΟΙΧΤΗ':'ΚΑΣΑ ΚΛΕΙΣΤΗ' };
      const updCaseEntry = {
        ...existingCase,
        reservations: [...(existingCase.reservations||[]), newRes]
      };
      setCaseStock(prev=>({...prev, [ck]: updCaseEntry}));
      await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`,{method:'PUT',body:JSON.stringify(updCaseEntry)});
    }

    resetForm();

    if (Platform.OS === 'web') {
      window.alert('✅ Η παραγγελία αποθηκεύτηκε!');
    } else {
      Alert.alert("VAICON", "Η παραγγελία αποθηκεύτηκε!");
    }

  };


  // ── Helper: αφαίρεση δέσμευσης από νέο stock ──
  const removeStockReservation = async (orderNo, h, w, side, caseType, isMoni) => {
    if (!setSasiStock || !setCaseStock) return;
    const sk = sasiKey(String(h), String(w), side);
    const ck = caseKey(String(h), String(w), side, caseType);
    if (isMoni && sasiStock[sk]) {
      const updEntry = {...sasiStock[sk], reservations: (sasiStock[sk].reservations||[]).filter(r=>r.orderNo!==orderNo)};
      setSasiStock(prev=>({...prev, [sk]: updEntry}));
      await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`,{method:'PUT',body:JSON.stringify(updEntry)});
    }
    if (caseStock[ck]) {
      const updEntry = {...caseStock[ck], reservations: (caseStock[ck].reservations||[]).filter(r=>r.orderNo!==orderNo)};
      setCaseStock(prev=>({...prev, [ck]: updEntry}));
      await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`,{method:'PUT',body:JSON.stringify(updEntry)});
    }
  };

  const editOrder = async (order) => {
    setCustomForm(order); setOrderType(order.orderType||'ΕΙΔΙΚΗ');
    setCustomerSearch(order.customer||'');
    setEditingOrder(order);
    setCustomOrders(customOrders.filter(o=>o.id!==order.id));
    deleteFromCloud(order.id);

    if (order.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ') {
      const isMoni = (order.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!order.sasiType) && !order.lock;
      await removeStockReservation(order.orderNo, order.h, order.w, order.side, order.caseType, isMoni);
    }
  };

  // Μεταφορά PENDING → PROD: αρχικοποιεί τις φάσεις παραγωγής
  const moveToProd = async (id) => {
    const order = customOrders.find(o=>o.id===id); if(!order) return;
    const phases = {};
    PHASES.forEach(ph => {
      // Το ΜΟΝΤΑΡΙΣΜΑ/ΕΠΕΝΔΥΣΗ μπαίνει μόνο αν είναι τσεκαρισμένο ΝΑΙ
      if (ph.key==='montDoor' && order.installation!=='ΝΑΙ') {
        phases[ph.key] = { active:false, printed:false, done:false };
      } else {
        phases[ph.key] = { active:true, printed:false, done:false };
      }
    });
    const upd = {...order, status:'PROD', prodAt:Date.now(), phases};
    setCustomOrders(customOrders.map(o=>o.id===id?upd:o));
    await syncToCloud(upd);
    await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Φάση → ΠΑΡΑΓΩΓΗ', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
  };

  const updateStatus = async (id, newStatus) => {
    const now=Date.now(); const order=customOrders.find(o=>o.id===id); if(!order) return;
    if (newStatus==='PROD') { moveToProd(id); return; }
    if (newStatus==='READY') {
      const hasStavera = order.stavera && order.stavera.filter(s=>s.dim).length > 0;
      if (hasStavera && !order.staveraDone) {
        Alert.alert('⚠️ Προσοχή', 'Τα σταθερά δεν έχουν ολοκληρωθεί (DONE). Δεν μπορεί να πάει ΕΤΟΙΜΗ.');
        return;
      }
    }
    if (newStatus==='SOLD') {
      const totalQty=parseInt(order.qty)||1;
      if (totalQty<=1) {
        const upd={...order,status:'SOLD',soldAt:now};
        setSoldOrders([upd,...soldOrders]); setCustomOrders(customOrders.filter(o=>o.id!==id)); await syncToCloud(upd);
        await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Πώληση', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
      } else { setSellModal({visible:true,orderId:id,totalQty}); }
    } else {
      let upd;
      setCustomOrders(customOrders.map(o=>{ if(o.id===id){upd={...o,status:newStatus,[`${newStatus.toLowerCase()}At`]:now};return upd;} return o; }));
      if(upd) {
        await syncToCloud(upd);
        if(newStatus==='READY') await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Φάση → ΕΤΟΙΜΟ', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
      }
    }
  };

  const handleSellConfirm = async (sellQty) => {
    const now=Date.now(); const {orderId,totalQty}=sellModal;
    setSellModal({visible:false,orderId:null,totalQty:1});
    const order=customOrders.find(o=>o.id===orderId); if(!order) return;
    if (sellQty===totalQty) {
      const upd={...order,status:'SOLD',soldAt:now};
      setSoldOrders([upd,...soldOrders]); setCustomOrders(customOrders.filter(o=>o.id!==orderId)); await syncToCloud(upd);
      await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Πώληση', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}`, qty: String(sellQty) });
    } else {
      const soldEntry={...order,id:Date.now().toString(),qty:String(sellQty),status:'SOLD',soldAt:now,partialNote:`${sellQty} από ${totalQty}`};
      const remaining={...order,qty:String(totalQty-sellQty),remainingNote:`Υπόλοιπο: ${totalQty-sellQty} από ${totalQty}`};
      setSoldOrders([soldEntry,...soldOrders]);
      setCustomOrders(customOrders.map(o=>o.id===orderId?remaining:o));
      await syncToCloud(soldEntry); await syncToCloud(remaining);
      await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Πώληση (μερική)', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}`, qty: `${sellQty}/${totalQty}` });
    }
  };

  const moveBack = async (id, cur) => {
    const order=customOrders.find(o=>o.id===id);
    const upd={...order,status:cur==='READY'?'PROD':'PENDING'};
    setCustomOrders(customOrders.map(o=>o.id===id?upd:o)); await syncToCloud(upd);
  };

  // Βοηθητική: δημιουργεί HTML πίνακα από λίστα παραγγελιών με τίτλο
  const buildPrintHTML = (copies, phaseKey=null) => {
    const isMounting = phaseKey==='montDoor';
    const isProductionPhase = phaseKey !== null;
    const showCoatings = !isProductionPhase || isMounting;
    const isCases = phaseKey==='cases';
    const isSasi     = phaseKey==='montSasi';
    const isMontDoor = phaseKey==='montDoor';
    const isVafio    = phaseKey==='vafio';
    const isLaser = copies.some(c => c.title && c.title.includes('LASER') || c.title.includes('ΚΑΣΣΕΣ') || c.title.includes('ΣΑΣΙ') || c.title.includes('ΠΡΟΦΙΛ') || c.title.includes('ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ'));
    const tableCSS = `
      body{font-family:Arial,sans-serif;margin:5mm;color:#000;background:#fff;}
      h1{font-size:22px;margin-bottom:2px;font-weight:bold;}
      h2{font-size:13px;margin-top:0;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;font-size:10px;}
      th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;white-space:nowrap;}
      td{padding:5px 4px;border-bottom:1px solid #000;vertical-align:top;}
      tr:last-child td{border-bottom:2px solid #000;}
      .page-break{page-break-after:always;}
      @media print{@page{size:A4 landscape;margin:5mm;}*{color:#000!important;background:#fff!important;}}
    `;

    const buildCasesTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const kleidaria = o.lock||'—';
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        return `<tr>
          <td style="font-weight:bold;font-size:20px">${o.orderNo||'—'}</td>
          <td style="font-size:20px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="font-size:16px">${mentesedesVal}</td>
          <td style="font-size:15px">${kleidaria}</td>
          <td style="font-size:15px">${o.caseType||'—'}</td>
          <td style="font-size:15px">${o.caseMaterial||'DKP'}</td>
          <td style="min-width:140px;font-size:13px">${o.notes||''}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table><thead><tr>
        <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Μεντ.</th><th>Κλειδαριά</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const buildSasiTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        return `<tr>
          <td style="font-weight:bold;font-size:20px">${o.orderNo||'—'}</td>
          <td style="font-size:20px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="font-size:16px">${thorakisi}</td>
          <td style="font-size:16px">${mentesedesVal}</td>
          <td style="font-size:15px">${tzami}</td>
          <td style="font-size:15px">${kleidaria}</td>
          <td style="min-width:140px;font-size:13px">${o.notes||''}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table><thead><tr>
        <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const buildMontDoorTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
        const coatings = (o.coatings&&o.coatings.length>0)?o.coatings.join(', '):'';
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        return `<tr>
          <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
          <td style="font-size:17px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="font-size:13px">${thorakisi}</td>
          <td style="font-size:13px">${o.hardware||'—'}</td>
          <td style="font-size:13px">${mentesedesVal}</td>
          <td style="font-size:13px">${tzami}</td>
          <td style="font-size:13px">${kleidaria}</td>
          <td style="font-size:13px">${o.caseType||'—'}</td>
          <td style="font-size:13px">${coatings}</td>
          <td style="min-width:140px;font-size:13px">${o.notes||''}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table><thead><tr>
        <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Χρώμα</th><th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Τ.Κάσας</th><th>Επένδυση</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const buildVafioTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const qtyVal = o.qty&&parseInt(o.qty)>1?`<span style="font-size:15px;font-weight:900;color:#cc0000">${o.qty}</span>`:'';
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        return `<tr>
          <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
          <td style="font-size:15px;text-align:center">${qtyVal}</td>
          <td style="font-size:17px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="font-size:13px">${mentesedesVal}</td>
          <td style="font-size:13px">${o.caseType||'—'}</td>
          <td style="font-size:13px">${o.caseMaterial||'DKP'}</td>
          <td style="min-width:140px;font-size:13px">${o.notes||''}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table><thead><tr>
        <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Μεντ.</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const dimCell = (o) => `<span style="font-size:15px;font-weight:900;letter-spacing:0.5px">${o.h||'—'} × ${o.w||'—'}</span>`;
    const qtyDisplay = (o) => { const q=parseInt(o.qty)||1; return q>1?`<span style="font-size:15px;font-weight:900;color:#cc0000">${q}</span>`:""; };
    const totalQty = (orders) => orders.reduce((sum,o)=>sum+(parseInt(o.qty)||1),0);

    const buildLaserTable = (orders, copyTitle) => {
      const isKasses  = copyTitle && copyTitle.includes('ΚΑΣΣΕΣ');
      const isSasi    = copyTitle && copyTitle.includes('ΣΑΣΙ');
      const isProfil  = false; // ΠΡΟΦΙΛ ίδιο με ΠΡΟΓΡΑΜΜΑ

      // ΠΡΟΦΙΛ: μόνο διαστάσεις
      if (isProfil) {
        const rows = orders.map(o=>`<tr><td style="font-size:18px;font-weight:900;padding:7px 6px">${dimCell(o)}</td></tr>`).join('');
        return `<table><thead><tr><th>Διάσταση</th></tr></thead><tbody>${rows}</tbody></table>`;
      }

      // ΚΑΣΣΕΣ: χοντρή γραμμή όταν αλλάζει caseMaterial
      if (isKasses) {
        let prevMat = null;
        const rows = orders.map(o=>{
          const mat = o.caseMaterial||'DKP';
          const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
          const borderTop = (prevMat!==null && mat!==prevMat) ? 'border-top:3px solid #000;' : '';
          prevMat = mat;
          return `<tr style="${borderTop}">
            <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
            <td style="text-align:center">${qtyDisplay(o)}</td>
            <td>${dimCell(o)}</td>
            <td style="font-weight:bold">${fora}</td>
            <td>${(o.armor||'ΜΟΝΗ')+' ΘΩΡ.'}</td>
            <td>${o.caseType||'—'}</td>
            <td style="font-weight:bold">${mat}</td>
            <td style="min-width:180px">${o.notes||''}</td>
          </tr>`;
        }).join('');
        const total = totalQty(orders);
        const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="6"></td></tr>`;
        return `<table><thead><tr>
          <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th>
        </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
      }

      // ΣΑΣΙ: χοντρή γραμμή όταν αλλάζει θωράκιση
      if (isSasi) {
        let prevArmor = null;
        const rows = orders.map(o=>{
          const armor = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ')?'ΔΙΠΛΗ':'ΜΟΝΗ';
          const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
          const borderTop = (prevArmor!==null && armor!==prevArmor) ? 'border-top:3px solid #000;' : '';
          prevArmor = armor;
          return `<tr style="${borderTop}">
            <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
            <td style="text-align:center">${qtyDisplay(o)}</td>
            <td>${dimCell(o)}</td>
            <td style="font-weight:bold">${fora}</td>
            <td style="font-weight:bold">${armor} ΘΩΡ.</td>
            <td style="min-width:180px">${o.notes||''}</td>
          </tr>`;
        }).join('');
        const total = totalQty(orders);
        const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="4"></td></tr>`;
        return `<table><thead><tr>
          <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Παρατηρήσεις</th>
        </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
      }

      // ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ + ΠΡΟΦΙΛ: πλήρης πίνακας
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
        const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
        return `<tr>
          <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
          <td style="text-align:center">${qtyDisplay(o)}</td>
          <td>${dimCell(o)}</td>
          <td style="font-weight:bold;font-size:13px">${fora}</td>
          <td>${thorakisi}</td>
          <td style="font-weight:bold;font-size:13px">${mentesedesVal}</td>
          <td style="font-weight:bold;font-size:13px">${tzami}</td>
          <td>${kleidaria}</td>
          <td>${o.caseType||'—'}</td>
          <td>${o.caseMaterial||'DKP'}</td>
          <td style="min-width:180px">${o.notes||''}</td>
        </tr>`;
      }).join('');
      const total = totalQty(orders);
      const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="9"></td></tr>`;
      return `<table><thead><tr>
        <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th>
        <th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th>
      </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
    };
    const buildTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
        const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
        const qtyVal = o.qty&&parseInt(o.qty)>1?`&nbsp;<span style="font-size:15px;font-weight:900;color:#cc0000">${o.qty}</span>`:'';
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = createdFmt ? (createdFmt + (deliveryFmt ? `&nbsp;&nbsp;&nbsp;&nbsp;${deliveryFmt}` : '')) : '';
        return `<tr>
          <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
          <td style="font-weight:bold;font-size:13px">${o.h||'—'}x${o.w||'—'}${qtyVal}</td>
          <td style="font-weight:bold;font-size:13px">${fora}</td>
          <td>${thorakisi}</td>
          <td style="font-weight:bold">${o.hardware||'—'}</td>
          <td style="font-weight:bold;font-size:13px">${mentesedesVal}</td>
          <td style="font-weight:bold;font-size:13px">${tzami}</td>
          <td>${kleidaria}</td>
          <td>${o.caseType||'—'}</td>
          <td>${o.caseMaterial||'DKP'}</td>
          <td>${o.installation==='ΝΑΙ'?'✓':''}</td>
          ${showCoatings?`<td>${(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</td>`:''}
          <td style="min-width:120px">${o.notes||''}</td>
          <td style="font-size:10px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table><thead><tr>
        <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Χρώμα</th>
        <th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Μον.</th>${showCoatings?'<th>Επένδυση</th>':''}<th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const pages = copies.map((copy, idx) => `
      <div class="${idx < copies.length-1 ? 'page-break' : ''}">
        <h1>${copy.title}</h1>
        <h2>Σύνολο: ${copy.orders.length} παραγγελίες</h2>
        ${isLaser ? buildLaserTable(copy.orders, copy.title) : isCases ? buildCasesTable(copy.orders) : isSasi ? buildSasiTable(copy.orders) : isMontDoor ? buildMontDoorTable(copy.orders) : isVafio ? buildVafioTable(copy.orders) : buildTable(copy.orders)}
      </div>
    `).join('');

    return `<html><head><meta charset="utf-8"><style>${tableCSS}</style></head><body>${pages}</body></html>`;
  };

  // Ταξινομήσεις
  const sortByDimension = (arr) => [...arr].sort((a,b) => {
    const hDiff = (parseInt(b.h)||0) - (parseInt(a.h)||0);
    if (hDiff!==0) return hDiff;
    return (parseInt(b.w)||0) - (parseInt(a.w)||0);
  });

  const getCopies = (orders, phaseLabel, dateStr) => {
    if (phaseLabel.includes('LASER')) {
      const copy1 = [...orders].sort((a,b) => (parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));

      // ΚΑΣΣΕΣ: 1) Υλικό (DKP→ΓΑΛΒΑΝΙΖΕ) 2) Τύπος (ΑΝΟΙΧΤΟΥ→ΚΛΕΙΣΤΟΥ) 3) Διάσταση
      const copy2 = [...orders].sort((a,b) => {
        const matA = a.caseMaterial||'DKP';
        const matB = b.caseMaterial||'DKP';
        if (matA !== matB) return matA==='DKP' ? -1 : 1;
        const typeA = a.caseType||'';
        const typeB = b.caseType||'';
        if (typeA !== typeB) {
          if (typeA.includes('ΑΝΟΙΧΤΟΥ')) return -1;
          if (typeB.includes('ΑΝΟΙΧΤΟΥ')) return 1;
          return typeA.localeCompare(typeB);
        }
        const hDiff = (parseInt(b.h)||0) - (parseInt(a.h)||0);
        if (hDiff!==0) return hDiff;
        return (parseInt(b.w)||0) - (parseInt(a.w)||0);
      });

      // ΣΑΣΙ: 1) Θωράκιση (ΔΙΠΛΗ→ΜΟΝΗ) 2) Διάσταση
      const copy3 = [...orders].sort((a,b) => {
        const armorA = (a.armor||'').includes('ΔΙΠΛΗ');
        const armorB = (b.armor||'').includes('ΔΙΠΛΗ');
        if (armorA !== armorB) return armorA ? -1 : 1;
        const hDiff = (parseInt(b.h)||0) - (parseInt(a.h)||0);
        if (hDiff!==0) return hDiff;
        return (parseInt(b.w)||0) - (parseInt(a.w)||0);
      });

      // ΠΡΟΦΙΛ: μόνο διάσταση
      const copy4 = sortByDimension(orders);

      return [
        { title:`VAICON — ${dateStr} — ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ ΠΑΡΑΓΓΕΛΙΩΝ`, orders:copy1 },
        { title:`VAICON — ${dateStr} — ΚΑΣΣΕΣ`, orders:copy2 },
        { title:`VAICON — ${dateStr} — ΣΑΣΙ`, orders:copy3 },
        { title:`VAICON — ${dateStr} — ΠΡΟΦΙΛ`, orders:copy4 },
      ];
    }
    return [{ title:`VAICON — ${dateStr} — ${phaseLabel}`, orders:[...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)) }];
  };

  // Άνοιγμα preview εκτύπωσης
  const handlePrint = (phaseKey) => {
    const selected = Object.keys(printSelected).filter(id => printSelected[id]);
    if (selected.length===0) return Alert.alert("Προσοχή","Επίλεξε τουλάχιστον μία παραγγελία.");
    const orders = customOrders.filter(o => selected.includes(o.id) && o.phases?.[phaseKey]?.active);
    // Για LASER ΚΟΠΕΣ → popup επιλογής αντιγράφων
    if (phaseKey==='laser') {
      Alert.alert(
        "Εκτύπωση LASER ΚΟΠΕΣ",
        `Επιλέξατε ${orders.length} παραγγελίες.\nΠόσα αντίγραφα θέλετε;`,
        [
          { text:"ΑΚΥΡΟ", style:"cancel" },
          { text:"1 ΑΝΤΙΓΡΑΦΟ", onPress:()=>setPrintPreview({ visible:true, phaseKey, orders, copies:1 }) },
          { text:"4 ΑΝΤΙΓΡΑΦΑ", onPress:()=>setPrintPreview({ visible:true, phaseKey, orders, copies:4 }) },
        ]
      );
    } else {
      setPrintPreview({ visible:true, phaseKey, orders, copies:1 });
    }
  };

  // Εκτύπωση — καλείται μόνο αφού πατηθεί ΕΚΤΥΠΩΣΗ μέσα στο preview
  const handleConfirmPrint = async () => {
    const { phaseKey, orders, copies } = printPreview;
    const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label || phaseKey;
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    setPrintPreview({visible:false, phaseKey:null, orders:[], copies:1});

    try {
      if (phaseKey==='stavera') {
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
        const rows = orders.flatMap(o=>
          (o.stavera||[]).filter(s=>s.dim).map(s=>`<tr>
            <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
            <td style="font-size:13px">${o.caseType||'—'}</td>
            <td style="font-size:20px;font-weight:900">${s.dim||'—'}</td>
            <td style="font-size:13px;min-width:180px">${s.note||''}</td>
            <td style="font-size:12px;color:#444">${o.deliveryDate?new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}):''}</td>
          </tr>`)
        ).join('');
        const html = `<html><head><meta charset="utf-8"><style>
          body{font-family:Arial,sans-serif;margin:8mm;}
          h1{font-size:22px;font-weight:bold;margin-bottom:2px;}
          h2{font-size:13px;color:#555;margin-bottom:10px;}
          table{width:100%;border-collapse:collapse;}
          th{padding:6px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;}
          td{padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top;}
          tr:last-child td{border-bottom:2px solid #000;}
          @media print{@page{size:A4 landscape;margin:8mm;}}
        </style></head><body>
          <h1>📏 ΣΤΑΘΕΡΑ — ΕΙΔΙΚΗ</h1>
          <h2>📅 ${dateStr} | ${orders.length} παραγγελίες</h2>
          <table><thead><tr><th>Νο</th><th>Τ.Κάσας</th><th>Διάσταση Σταθερού</th><th>Παρατήρηση</th><th>Ημερομηνία</th></tr></thead>
          <tbody>${rows}</tbody></table>
        </body></html>`;
        await printHTML(html, 'ΣΤΑΘΕΡΑ — ΕΙΔΙΚΗ');
        const selectedIds = orders.map(o=>o.id);
        const updated = customOrders.map(o=>selectedIds.includes(o.id)?{...o,staveraPrinted:true}:o);
        setCustomOrders(updated);
        updated.filter(o=>selectedIds.includes(o.id)).forEach(o=>syncToCloud(o));
        return;
      }
      if (phaseKey==='cases') {
        const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
        const kleistou = sorted.filter(o=>(o.caseType||'').includes('ΚΛΕΙΣΤΟΥ'));
        const anoixtou = sorted.filter(o=>(o.caseType||'').includes('ΑΝΟΙΧΤΟΥ'));
        const caseCopies = [];
        if (kleistou.length>0) caseCopies.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ`, orders:kleistou });
        if (anoixtou.length>0) caseCopies.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ`, orders:anoixtou });
        if (caseCopies.length===0) return;
        const html = buildPrintHTML(caseCopies, phaseKey);
        await printHTML(html, `VAICON — ΚΑΣΕΣ`);
      } else {
        const allCopies = getCopies(orders, phaseLabel, dateStr);
        const selectedCopies = copies===4 ? allCopies : [allCopies[0]];
        const html = buildPrintHTML(selectedCopies, phaseKey);
        await printHTML(html, `VAICON — ${phaseLabel}`);
      }
      // Μαρκάρει ως printed
      const selectedIds = orders.map(o=>o.id);
      const updated = customOrders.map(o => {
        if (selectedIds.includes(o.id) && o.phases?.[phaseKey]?.active) {
          return {...o, phases:{...o.phases, [phaseKey]:{...o.phases[phaseKey], printed:true, printHistory:[...(o.phases[phaseKey].printHistory||[]), {ts:Date.now(), copies}]}}};
        }
        return o;
      });
      setCustomOrders(updated);
      for (const o of updated.filter(o=>selectedIds.includes(o.id))) await syncToCloud(o);
    } catch(e) {
      Alert.alert("Σφάλμα", "Δεν δημιουργήθηκε το PDF. Δοκιμάστε ξανά.");
    }
  };

  // Render του Print Preview Modal
  const renderPrintPreview = () => {
    if (!printPreview.visible) return null;
    const { phaseKey, orders, copies } = printPreview;
    const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label || phaseKey;
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    const allCopies = phaseKey==='stavera'
      ? [{ title:`VAICON — ${dateStr} — ΣΤΑΘΕΡΑ`, orders }]
      : phaseKey==='cases'
      ? (() => {
          const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
          const kleistou = sorted.filter(o=>(o.caseType||'').includes('ΚΛΕΙΣΤΟΥ'));
          const anoixtou = sorted.filter(o=>(o.caseType||'').includes('ΑΝΟΙΧΤΟΥ'));
          const result = [];
          if (kleistou.length>0) result.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ`, orders:kleistou });
          if (anoixtou.length>0) result.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ`, orders:anoixtou });
          return result.length>0 ? result : [{ title:`VAICON — ${dateStr} — ΚΑΣΕΣ`, orders:sorted }];
        })()
      : getCopies(orders, phaseLabel, dateStr);
    const previewCopies = copies===4 ? allCopies : [allCopies[0]];

    const COLS_CASES = [
      {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
      {label:'Μεντ.',w:35},{label:'Κλειδαριά',w:80},{label:'Τ.Κάσας',w:90},
      {label:'Υλ.Κάσας',w:65},{label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
    ];

    const COLS_SASI = [
      {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
      {label:'Θωράκιση',w:70},{label:'Μεντ.',w:35},{label:'Τζάμι',w:55},
      {label:'Κλειδαριά',w:70},{label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
    ];

    const COLS_MONTDOOR = [
      {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
      {label:'Θωράκιση',w:70},{label:'Χρώμα',w:50},{label:'Μεντ.',w:35},
      {label:'Τζάμι',w:55},{label:'Κλειδαριά',w:70},{label:'Τ.Κάσας',w:65},
      {label:'Επένδυση',w:120},{label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
    ];

    const COLS_VAFIO = [
      {label:'Νο',w:50},{label:'Τεμ.',w:35},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
      {label:'Μεντ.',w:35},{label:'Τ.Κάσας',w:90},{label:'Υλ.Κάσας',w:65},
      {label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
    ];

    const COLS = [
      {label:'Νο',w:50},{label:'Τεμ.',w:35},{label:'Διάσταση',w:80},{label:'Φορά',w:40},
      {label:'Θωράκιση',w:70},{label:'Μεντ.',w:35},{label:'Τζάμι',w:55},{label:'Κλειδαριά',w:70},
      {label:'Χρώμα',w:50},{label:'Τ.Κάσας',w:65},{label:'Υλ.Κάσας',w:65},{label:'Μον.',w:40},{label:'Επένδυση',w:120},{label:'Παρατηρήσεις',w:220},
    ];

    const renderTable = (sortedOrders) => {
      if (phaseKey==='stavera') {
        const COLS_STAVERA = [
          {label:'Νο',w:50},{label:'Τ.Κάσας',w:90},{label:'Διάσταση Σταθερού',w:130},
          {label:'Παρατήρηση',w:220},{label:'Ημερομηνία',w:110},
        ];
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_STAVERA.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.flatMap((o,i)=>
                (o.stavera||[]).filter(s=>s.dim).map((s,si)=>{
                  const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                  return (
                    <View key={o.id+'-'+si} style={[styles.previewTr,(i+si)%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                      <Text style={[styles.previewTd,{width:50,fontWeight:'bold'}]}>{si===0?o.orderNo||'—':''}</Text>
                      <Text style={[styles.previewTd,{width:90,fontSize:12}]}>{si===0?o.caseType||'—':''}</Text>
                      <Text style={[styles.previewTd,{width:130,fontWeight:'900',fontSize:15}]}>{s.dim||'—'}</Text>
                      <Text style={[styles.previewTd,{width:220,fontSize:12}]}>{s.note||''}</Text>
                      <Text style={[styles.previewTd,{width:110,fontSize:11,color:'#555'}]}>{si===0?deliveryFmt:''}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        );
      }
      if (phaseKey==='cases') {
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_CASES.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.map((o,i)=>{
                const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
                const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
                const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
                const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                return (
                  <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                    <Text style={[styles.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                    <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                    <Text style={[styles.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                    <Text style={[styles.previewTd,{width:80}]}>{o.lock||'—'}</Text>
                    <Text style={[styles.previewTd,{width:90}]}>{o.caseType||'—'}</Text>
                    <Text style={[styles.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                    <Text style={[styles.previewTd,{width:200}]}>{o.notes||''}</Text>
                    <Text style={[styles.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt,deliveryFmt].filter(Boolean).join('  ')}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );
      }
      if (phaseKey==='montSasi') {
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_SASI.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.map((o,i)=>{
                const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
                const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
                const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
                const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
                const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
                const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                return (
                  <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                    <Text style={[styles.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                    <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                    <Text style={[styles.previewTd,{width:70}]}>{thorakisi}</Text>
                    <Text style={[styles.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                    <Text style={[styles.previewTd,{width:55},...[bold]]}>{tzami}</Text>
                    <Text style={[styles.previewTd,{width:70}]}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text>
                    <Text style={[styles.previewTd,{width:200}]}>{o.notes||''}</Text>
                    <Text style={[styles.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt,deliveryFmt].filter(Boolean).join('  ')}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );
      }
      if (phaseKey==='montDoor') {
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_MONTDOOR.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.map((o,i)=>{
                const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
                const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
                const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
                const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
                const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
                const createdFmt2 = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                const deliveryFmt2 = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                return (
                  <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                    <Text style={[styles.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                    <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                    <Text style={[styles.previewTd,{width:70}]}>{thorakisi}</Text>
                    <Text style={[styles.previewTd,{width:50}]}>{o.hardware||'—'}</Text>
                    <Text style={[styles.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                    <Text style={[styles.previewTd,{width:55},...[bold]]}>{tzami}</Text>
                    <Text style={[styles.previewTd,{width:70}]}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text>
                    <Text style={[styles.previewTd,{width:65}]}>{o.caseType||'—'}</Text>
                    <Text style={[styles.previewTd,{width:120}]}>{(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</Text>
                    <Text style={[styles.previewTd,{width:200}]}>{o.notes||''}</Text>
                    <Text style={[styles.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt2,deliveryFmt2].filter(Boolean).join('  ')}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );
      }
      if (phaseKey==='vafio') {
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_VAFIO.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.map((o,i)=>{
                const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
                const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
                const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
                const createdFmt3 = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                const deliveryFmt3 = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                return (
                  <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                    <Text style={[styles.previewTd,{width:35},...[bold]]}>{o.qty||'1'}</Text>
                    <Text style={[styles.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                    <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                    <Text style={[styles.previewTd,{width:35}]}>{mentesedesVal}</Text>
                    <Text style={[styles.previewTd,{width:90}]}>{o.caseType||'—'}</Text>
                    <Text style={[styles.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                    <Text style={[styles.previewTd,{width:200}]}>{o.notes||''}</Text>
                    <Text style={[styles.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt3,deliveryFmt3].filter(Boolean).join('  ')}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );
      }
      return (
      <ScrollView horizontal>
        <View>
          <View style={styles.previewThead}>
            {COLS.map(h=>(
              <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
            ))}
          </View>
          {sortedOrders.map((o,i)=>{
            const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
            const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
            const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
            const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
            return (
              <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                <Text style={[styles.previewTd,{width:35},...[bold]]}>{o.qty||'1'}</Text>
                <Text style={[styles.previewTd,{width:80},...[bold]]}>{o.h||'—'}x{o.w||'—'}</Text>
                <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                <Text style={[styles.previewTd,{width:70}]}>{(o.armor||'ΜΟΝΗ')+' ΘΩΡ.'}</Text>
                <Text style={[styles.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                <Text style={[styles.previewTd,{width:55},...[bold]]}>{tzami}</Text>
                <Text style={[styles.previewTd,{width:70}]}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text>
                <Text style={[styles.previewTd,{width:50}]}>{o.hardware||'—'}</Text>
                <Text style={[styles.previewTd,{width:65}]}>{o.caseType||'—'}</Text>
                <Text style={[styles.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                <Text style={[styles.previewTd,{width:40}]}>{o.installation==='ΝΑΙ'?'✓':''}</Text>
                <Text style={[styles.previewTd,{width:120}]}>{(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</Text>
                <Text style={[styles.previewTd,{width:220}]}>{o.notes||''}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
    };

    return (
      <Modal visible={true} animationType="slide" onRequestClose={()=>setPrintPreview({visible:false,phaseKey:null,orders:[],copies:1})}>
        <View style={styles.previewContainer}>
          {/* HEADER */}
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>VAICON — {phaseLabel}</Text>
            <Text style={styles.previewSub}>📅 {dateStr}  |  {orders.length} παραγγελίες  |  {copies===4?'4 ΑΝΤΙΓΡΑΦΑ':'1 ΑΝΤΙΓΡΑΦΟ'}</Text>
          </View>

          {/* ΑΝΤΙΓΡΑΦΑ */}
          <ScrollView style={styles.previewScroll}>
            {previewCopies.map((copy, idx)=>(
              <View key={idx} style={{marginBottom:20}}>
                <View style={{backgroundColor:'#333',padding:8,marginBottom:4}}>
                  <Text style={{color:'white',fontWeight:'bold',fontSize:12}}>
                    {copy.title}
                  </Text>
                </View>
                {renderTable(copy.orders)}
              </View>
            ))}
          </ScrollView>

          {/* ΚΟΥΜΠΙΑ */}
          <View style={styles.previewBtns}>
            <TouchableOpacity style={styles.previewCancelBtn} onPress={()=>setPrintPreview({visible:false,phaseKey:null,orders:[],copies:1})}>
              <Text style={styles.previewCancelTxt}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.previewPrintBtn} onPress={handleConfirmPrint}>
              <Text style={styles.previewPrintTxt}>🖨️ ΕΚΤΥΠΩΣΗ {copies===4?'(4 PDF)':''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // Τσεκάρισμα ολοκλήρωσης φάσης — αν όλες done → ΕΤΟΙΜΑ
  const handlePhaseDone = async (orderId, phaseKey) => {
    const order = customOrders.find(o=>o.id===orderId); if(!order||!order.phases) return;
    if (phaseKey==='montDoor' && !order.phases?.vafio?.done) {
      setConfirmModal({ visible:true, title:'⚠️ Προσοχή', message:'Το Βαφείο δεν έχει ολοκληρωθεί.\nΔεν μπορεί να γίνει DONE το Μοντάρισμα.', confirmText:'ΟΚ', onConfirm:null });
      return;
    }
    const newPhases = {...order.phases, [phaseKey]:{...order.phases[phaseKey], done:true}};
    const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label?.replace(/🔴|🟡|🔵|🟢|⚫/g,'').trim() || phaseKey;
    const allDone = Object.keys(newPhases).every(k => !newPhases[k].active || newPhases[k].done);
    const hasStavera = order.stavera && order.stavera.filter(s=>s.dim).length > 0;
    const staveraPending = hasStavera && !order.staveraDone;

    if (allDone) {
      if (staveraPending) {
        Alert.alert(
          "⚠️ ΠΡΟΣΟΧΗ",
          "Όλες οι φάσεις παραγωγής ολοκληρώθηκαν.\n\n⚠️ ΕΚΚΡΕΜΕΙ ΣΤΑΘΕΡΟ — η παραγγελία μπορεί να κατέβει στην αποθήκη αλλά το σταθερό θα παραμείνει σε εξέλιξη.",
          [
            { text:"ΑΚΥΡΟ", style:"cancel" },
            { text:"ΚΑΤΕΒΑΣΗ ΣΤΗΝ ΑΠΟΘΗΚΗ", onPress: async () => {
              const upd = {...order, phases:newPhases, status:'READY', readyAt:Date.now(), staveraPendingAtReady:true};
              setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
              await syncToCloud(upd);
              await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Φάση → ΕΤΟΙΜΟ (εκκρεμές σταθερό)', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
            }}
          ]
        );
      } else {
        Alert.alert(
          "⚠️ ΠΡΟΣΟΧΗ",
          "Ολοκληρώνεται η διαδικασία παραγωγής.\nΗ πόρτα μεταφέρεται στην ΑΠΟΘΗΚΗ.",
          [
            { text:"ΑΚΥΡΟ", style:"cancel", onPress: ()=>{} },
            { text:"ΕΠΙΒΕΒΑΙΩΣΗ", style:"default", onPress: async () => {
              const upd = {...order, phases:newPhases, status:'READY', readyAt:Date.now()};
              setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
              await syncToCloud(upd);
              await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Φάση → ΕΤΟΙΜΟ (όλες done)', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
            }}
          ]
        );
      }
    } else {
      const upd = {...order, phases:newPhases};
      setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
      await syncToCloud(upd);
      await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', `Φάση ✓ ${phaseLabel}`, { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
    }
  };

  // Αναίρεση ολοκλήρωσης φάσης
  const handlePhaseUndone = async (orderId, phaseKey) => {
    const order = customOrders.find(o=>o.id===orderId); if(!order||!order.phases) return;
    const upd = {...order, phases:{...order.phases, [phaseKey]:{...order.phases[phaseKey], done:false}}};
    setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
    await syncToCloud(upd);
  };

  // ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — Έναρξη παραγωγής
  const handleDipliStart = async (order) => {
    const dipliPhases = {};
    DIPLI_PHASES.forEach(ph => {
      if (ph.key==='montDoor' && order.installation!=='ΝΑΙ') {
        dipliPhases[ph.key] = { active:false, done:false };
      } else {
        dipliPhases[ph.key] = { active:true, done:false };
      }
    });
    const upd = {...order, status:'DIPLI_PROD', dipliPhases, dipliStartAt:Date.now()};
    setCustomOrders(customOrders.map(o=>o.id===order.id?upd:o));
    await syncToCloud(upd);
  };

  // ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — Ολοκλήρωση φάσης
  const handleDipliPhaseDone = async (orderId, phaseKey) => {
    const order = customOrders.find(o=>o.id===orderId); if(!order||!order.dipliPhases) return;
    const newPhases = {...order.dipliPhases, [phaseKey]:{...order.dipliPhases[phaseKey], done:true}};
    const allPhasesDone = Object.keys(newPhases).every(k => !newPhases[k].active || newPhases[k].done);
    const upd = {...order, dipliPhases:newPhases};
    setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
    await syncToCloud(upd);
    // Αν όλες οι φάσεις done → ελέγχω αν υπάρχει κάσα (θα γίνει αυτόματα στο render)
    // Το πέρασμα στα ΕΤΟΙΜΑ γίνεται αυτόματα από το render όταν allPhasesDone && hasCase
  };

  // ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — Αναίρεση φάσης
  const handleDipliPhaseUndone = async (orderId, phaseKey) => {
    const order = customOrders.find(o=>o.id===orderId); if(!order||!order.dipliPhases) return;
    const upd = {...order, dipliPhases:{...order.dipliPhases, [phaseKey]:{...order.dipliPhases[phaseKey], done:false}}};
    setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
    await syncToCloud(upd);
  };
  const removeFromPhase = (orderId, phaseKey) => {
    Alert.alert("Αφαίρεση","Αφαίρεση από αυτή τη φάση παραγωγής;",[
      {text:"Όχι"},
      {text:"Ναι", onPress: async () => {
        const order = customOrders.find(o=>o.id===orderId); if(!order) return;
        const upd = {...order, phases:{...order.phases, [phaseKey]:{...order.phases[phaseKey], active:false}}};
        setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
        await syncToCloud(upd);
      }}
    ]);
  };

  const cancelOrder = async (id) => {
    if (!window.confirm('Ακύρωση — Οριστική διαγραφή;')) return;
    const order = customOrders.find(o=>o.id===id);
    setCustomOrders(customOrders.filter(o=>o.id!==id));
    await deleteFromCloud(id);
    if (!order || order.orderType!=='ΤΥΠΟΠΟΙΗΜΕΝΗ') return;
    const isMoni = (order.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!order.sasiType) && !order.lock;
    await removeStockReservation(order.orderNo, order.h, order.w, order.side, order.caseType, isMoni);
  };
  const deleteFromArchive = (id) => Alert.alert("Διαγραφή","Διαγραφή από αρχείο;",[{text:"Όχι"},{text:"Ναι",style:"destructive",onPress:async()=>{setSoldOrders(soldOrders.filter(o=>o.id!==id));await deleteFromCloud(id);}}]);
  const toggleSection = (s) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setExpanded({...expanded,[s]:!expanded[s]}); };

  const renderOrderCard = (order, isArchive=false) => {
    const isProd = order.status==='PROD';
    const bc = isArchive?'#333':(isProd?'#2e7d32':order.status==='PENDING'?'#ff4444':'#00C851');
    const next = order.status==='PENDING'?'PROD':order.status==='PROD'?'READY':'SOLD';
    const btn  = isArchive?'ΔΙΑΓΡΑΦΗ':(order.status==='PENDING'?'ΕΝΑΡΞΗ':order.status==='PROD'?'ΕΤΟΙΜΗ':'ΠΩΛΗΣΗ');
    const btnC = isArchive?'#000':(order.status==='PENDING'?'#ffbb33':order.status==='PROD'?'#00C851':'#222');
    const isStd = order.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ';
    return (
      <TouchableOpacity key={order.id} onLongPress={()=>!isArchive&&order.status==='PENDING'&&editOrder(order)} delayLongPress={1000} activeOpacity={0.7} style={[styles.orderCard,{borderLeftColor:bc, backgroundColor: isProd?'#e8f5e9':'white'}]}>
        <View style={styles.cardContent}>
          {isProd&&<View style={{backgroundColor:'#2e7d32', borderRadius:6, paddingHorizontal:10, paddingVertical:3, alignSelf:'flex-start', marginBottom:5}}>
            <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>⚙️ ΣΤΗΝ ΠΑΡΑΓΩΓΗ</Text>
          </View>}
          {order.staveraPendingAtReady&&!order.staveraDone&&<View style={{backgroundColor:'#e65100', borderRadius:6, paddingHorizontal:10, paddingVertical:3, alignSelf:'flex-start', marginBottom:5}}>
            <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>⏳ ΕΚΚΡΕΜΕΙ ΣΤΑΘΕΡΟ</Text>
          </View>}
          <View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,marginBottom:3}}>
            {order.customer?<Text style={[styles.cardCustomer]}>👤 {order.customer}</Text>:null}
            <Text style={[styles.cardDetails,{fontWeight:'bold'}]}>#{order.orderNo}</Text>
            <Text style={styles.cardDetails}>{order.h}x{order.w}</Text>
            {order.qty&&parseInt(order.qty)>1?<Text style={{fontWeight:'900',fontSize:15,color:'#cc0000'}}>{order.qty}τεμ</Text>:null}
            <Text style={styles.cardDetails}>{order.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}</Text>
            {!isStd?<Text style={styles.cardDetails}>{(order.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ')?'Δ/Θ':'Μ/Θ'}</Text>:null}
            {order.hardware?<Text style={[styles.cardDetails,{color:'#555'}]}>{order.hardware}</Text>:null}
          </View>
          {!isStd&&<Text style={styles.cardSubDetails}>Μεντ: {order.hinges}{order.glassDim?` | Τζ: ${order.glassDim}${order.glassNotes?' '+order.glassNotes:''}`:''}</Text>}
          {!isStd&&<Text style={styles.cardSubDetails}>Κλειδ: {order.lock||'—'}</Text>}
          {!isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:13}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {!isStd&&<Text style={styles.cardSubDetails}>Κάσα: {order.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | {order.caseMaterial||'DKP'}</Text>}
          {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&<Text style={styles.cardSubDetails}>📐 Σταθ: {order.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}</Text>}
          {isStd&&<Text style={styles.cardSubDetails}>{order.lock?`Κλειδ: ${order.lock} | `:''}  {order.hardware}</Text>}
          {isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:13}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {isStd&&order.heightReduction?<Text style={[styles.cardSubDetails,{color:'#b71c1c',fontWeight:'bold'}]}>📏 ΜΕΙΩΣΗ ΥΨΟΥΣ: {order.heightReduction} cm</Text>:null}
          {order.coatings&&order.coatings.length>0&&<Text style={[styles.cardSubDetails,{color:'#007AFF'}]}>🎨 {order.coatings.join(', ')}</Text>}
          {order.notes?<Text style={styles.cardSubDetails}>Σημ: {order.notes}</Text>:null}
          <View style={styles.datesRow}>
            {fmtDate(order.createdAt)&&<Text style={styles.dateChip}>📅 {fmtDate(order.createdAt)}</Text>}
            {order.deliveryDate?<Text style={[styles.dateChip,{backgroundColor:'#fff3e0',color:'#e65100'}]}>🚚 {order.deliveryDate}</Text>:null}
            {fmtDate(order.prodAt)&&<Text style={styles.dateChip}>🔨 {fmtDate(order.prodAt)}</Text>}
            {fmtDate(order.readyAt)&&<Text style={styles.dateChip}>✅ {fmtDate(order.readyAt)}</Text>}
          </View>
        </View>
        <View style={styles.sideBtnContainer}>
          {!isArchive&&<TouchableOpacity style={[styles.upperBtn,{backgroundColor:order.status==='PENDING'?'#000':'#666'}]} onPress={()=>order.status==='PENDING'?cancelOrder(order.id):moveBack(order.id,order.status)}><Text style={[styles.upperBtnText,{color:order.status==='PENDING'?'#ff4444':'white'}]}>{order.status==='PENDING'?'ΑΚΥΡΩΣΗ':'⟲'}</Text></TouchableOpacity>}
          {order.status!=='PROD'&&<TouchableOpacity style={[styles.lowerBtn,{backgroundColor:btnC}]} onPress={()=>isArchive?deleteFromArchive(order.id):updateStatus(order.id,next)}><Text style={styles.sideBtnText}>{btn}</Text></TouchableOpacity>}
        </View>
      </TouchableOpacity>
    );
  };

  // Κάρτα πόρτας μέσα σε υποκαρτέλα παραγωγής
  const renderProdPhaseCard = (order, phaseKey) => {
    const phase = order.phases?.[phaseKey];
    if (!phase || !phase.active) return null;
    const isStd = order.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ';
    const isSelected = !!printSelected[order.id];
    return (
      <View key={order.id} style={[styles.phaseCard, phase.done&&styles.phaseCardDone]}>
        {/* CHECKBOX ΕΠΙΛΟΓΗΣ — πάντα ορατό */}
        <TouchableOpacity style={styles.printCheck} onPress={()=>setPrintSelected(p=>({...p,[order.id]:!p[order.id]}))}>
          <View style={[styles.checkbox, isSelected&&styles.checkboxSelected]}>
            {isSelected&&<Text style={{color:'white',fontWeight:'bold',fontSize:12}}>✓</Text>}
          </View>
        </TouchableOpacity>
        {phase.printed && (
          <View style={styles.printedBadge}>
            <Text style={styles.printedBadgeTxt}>🖨️</Text>
          </View>
        )}

        {/* ΣΤΟΙΧΕΙΑ ΠΑΡΑΓΓΕΛΙΑΣ */}
        <View style={{flex:1, paddingHorizontal:8}}>
          <View style={{flexDirection:'row', alignItems:'center', flexWrap:'nowrap'}}>
            <Text style={[styles.cardDetails,{fontWeight:'bold'}]}>#{order.orderNo}</Text>
          </View>
          {order.customer?<Text style={[styles.cardSubDetails,{marginTop:2}]}>👤 {order.customer}</Text>:null}
          <Text style={styles.cardDetails}>{order.h}x{order.w} | {order.side}{!isStd?` | ${order.armor} ΘΩΡ.`:''}</Text>
          {!isStd&&<Text style={styles.cardSubDetails}>Μεντ: {order.hinges}{order.glassDim?` | Τζ: ${order.glassDim}${order.glassNotes?' '+order.glassNotes:''}`:''} | Κλειδ: {order.lock||'—'}</Text>}
          {!isStd&&<Text style={styles.cardSubDetails}>Κάσα: {order.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | {order.caseMaterial||'DKP'} | {order.hardware||'—'}</Text>}
          {!isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:13}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&<Text style={styles.cardSubDetails}>📐 Σταθ: {order.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}</Text>}
          {isStd&&<Text style={styles.cardSubDetails}>{order.hardware||''}</Text>}
          {isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:13}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {order.qty&&parseInt(order.qty)>1?<Text style={[styles.cardSubDetails,{color:'#007AFF',fontWeight:'bold'}]}>Τεμ: {order.qty}</Text>:null}
          {phase.printed&&!phase.done&&<Text style={styles.printedTxt}>🖨️ Εκτυπώθηκε</Text>}
          {phase.done&&<Text style={styles.doneTxt}>✅ Ολοκληρώθηκε</Text>}
          {/* ΗΜΕΡΟΜΗΝΙΑ ΕΙΣΟΔΟΥ + ΙΣΤΟΡΙΚΟ ΕΚΤΥΠΩΣΕΩΝ */}
          <View style={{marginTop:4, gap:2}}>
            {order.prodAt&&<Text style={{fontSize:10,color:'#666'}}>📥 Είσοδος: {fmtDateTime(order.prodAt)}</Text>}
            {(phase.printHistory||[]).map((entry,i)=>{
              const ts = typeof entry==='object' ? entry.ts : entry;
              const copies = typeof entry==='object' ? entry.copies : 1;
              return (
                <Text key={i} style={{fontSize:10,color:'#856404'}}>🖨️ Εκτύπωση {i+1}: {fmtDateTime(ts)} ({copies})</Text>
              );
            })}
          </View>
        </View>

        {/* ΚΟΥΜΠΙΑ ΔΕΞΙΑ */}
        <View style={{justifyContent:'space-between', paddingVertical:4}}>
          <TouchableOpacity
            style={[styles.doneBtn, phase.done && styles.doneBtnActive]}
            onPress={()=> phase.done ? handlePhaseUndone(order.id, phaseKey) : handlePhaseDone(order.id, phaseKey)}>
            <Text style={styles.doneBtnTxt}>{phase.done ? '↩️\nUNDO' : '✓\nDONE'}</Text>
          </TouchableOpacity>
          {!phase.done && (
            <TouchableOpacity style={styles.removeBtn} onPress={()=>removeFromPhase(order.id,phaseKey)}>
              <Text style={styles.removeBtnTxt}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Απλή εκτύπωση για ΚΑΤΑΧΩΡΗΜΕΝΕΣ / ΕΤΟΙΜΑ / ΑΡΧΕΙΟ — ταξινόμηση κατά αριθμό παραγγελίας
  const handleSimplePrint = async (orders, title) => {
    if (!orders.length) return Alert.alert("Προσοχή","Δεν υπάρχουν παραγγελίες για εκτύπωση.");
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
    const copies = [{ title:`VAICON — ${dateStr} — ${title}`, orders:sorted }];
    const html = buildPrintHTML(copies);
    try {
      await printHTML(html, `VAICON — ${title}`);
    } catch(e) {
      Alert.alert("Σφάλμα","Δεν δημιουργήθηκε το PDF.");
    }
  };

  // Εκτύπωση τυποποιημένων — με στήλες ΚΑΣΑ/ΣΑΣΙ/ΜΟΝΤΑΡΙΣΜΑ
  const handleStdPrint = async (orders, title, caseReady, sasiReady, isMounting=true) => {
    if (!orders.length) return Alert.alert("Προσοχή","Δεν υπάρχουν παραγγελίες για εκτύπωση.");
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));

    // FIFO για ΚΑΣΑ/ΣΑΣΙ
    const sasiUsed={}, caseUsed={};
    const rows = sorted.map(o=>{
      const key=`${o.h}_${o.w}_${o.side}`;
      const sasiStock=(sasiReady||[]).filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
      const caseStock=(caseReady||[]).filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
      const hasSasi=(sasiUsed[key]||0)<sasiStock;
      const hasCase=(caseUsed[key]||0)<caseStock;
      sasiUsed[key]=(sasiUsed[key]||0)+1;
      caseUsed[key]=(caseUsed[key]||0)+1;
      const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
      const kasaStatus = hasCase?'✓':'✗';
      const sasiStatus = hasSasi?'✓':'✗';
      const montStatus = o.installation==='ΝΑΙ'?'ΝΑΙ':'ΟΧΙ';
      return `<tr>
        <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
        <td style="font-weight:bold;font-size:13px">${o.customer||'—'}</td>
        <td style="font-weight:bold;font-size:13px">${o.h||'—'}x${o.w||'—'}</td>
        <td style="font-weight:bold;font-size:13px">${fora}</td>
        <td>${o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</td>
        <td>${o.caseType||'—'}</td>
        <td>${o.hardware||'—'}</td>
        <td style="text-align:center;font-weight:bold;color:${hasCase?'#155724':'#721c24'}">${kasaStatus}</td>
        <td style="text-align:center;font-weight:bold;color:${hasSasi?'#155724':'#721c24'}">${sasiStatus}</td>
        <td style="text-align:center;font-weight:bold">${montStatus}</td>
        ${isMounting?`<td>${(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</td>`:''}
        <td>${o.deliveryDate||'—'}</td>
        <td style="min-width:140px">${o.notes||''}</td>
      </tr>`;
    }).join('');

    const tableCSS = `
      body{font-family:Arial,sans-serif;margin:5mm;color:#000;background:#fff;}
      h1{font-size:15px;margin-bottom:2px;font-weight:bold;}
      h2{font-size:11px;margin-top:0;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;font-size:10px;}
      th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;white-space:nowrap;}
      td{padding:5px 4px;border-bottom:1px solid #000;vertical-align:top;}
      tr:last-child td{border-bottom:2px solid #000;}
      @media print{@page{size:A4 landscape;margin:5mm;}*{color:#000!important;background:#fff!important;}}
    `;
    const html = `<html><head><meta charset="utf-8"><style>${tableCSS}</style></head><body>
      <h1>VAICON — ${dateStr} — ${title}</h1>
      <h2>Σύνολο: ${sorted.length} παραγγελίες</h2>
      <table><thead><tr>
        <th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>Φορά</th><th>Τύπος</th>
        <th>Τ.Κάσας</th><th>Χρώμα</th><th>ΚΑΣΑ</th><th>ΣΑΣΙ</th><th>Μον.</th>${isMounting?'<th>Επένδυση</th>':''}<th>Παράδοση</th><th>Παρατηρήσεις</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    try {
      await printHTML(html, `VAICON — ${title}`);
    } catch(e) {
      Alert.alert("Σφάλμα","Δεν δημιουργήθηκε το PDF.");
    }
  };
  const handlePrintProdStatus = async (prodOrders) => {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    const phaseHeader = PHASES.map(ph=>`<th>${ph.label.replace(/🔴|🟡|🔵|🟢|⚫/g,'').trim()}</th>`).join('');

    const rows = prodOrders.map(o => {
      const phaseCells = PHASES.map(ph => {
        const phase = o.phases?.[ph.key];
        if (!phase?.active) return `<td style="background:#f0f0f0;text-align:center;color:#999">—</td>`;
        if (phase.done) return `<td style="background:#d4edda;text-align:center;font-weight:bold;color:#155724">✓</td>`;
        if (phase.printed) return `<td style="background:#fff3cd;text-align:center;color:#856404">🖨</td>`;
        return `<td style="background:#f8d7da;text-align:center;color:#721c24">●</td>`;
      }).join('');
      return `<tr>
        <td style="font-weight:bold">${o.orderNo||'—'}</td>
        <td>${o.customer||'—'}</td>
        <td style="font-weight:bold">${o.h||'—'}x${o.w||'—'}</td>
        <td>${o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}</td>
        <td>${(o.armor||'ΜΟΝΗ')+' ΘΩΡ.'}</td>
        ${phaseCells}
      </tr>`;
    }).join('');

    const legend = `
      <div style="margin-top:12px;font-size:10px;display:flex;gap:20px;">
        <span><span style="background:#d4edda;padding:2px 6px">✓</span> Ολοκληρώθηκε</span>
        <span><span style="background:#fff3cd;padding:2px 6px">🖨</span> Εκτυπώθηκε</span>
        <span><span style="background:#f8d7da;padding:2px 6px">●</span> Σε εξέλιξη</span>
        <span><span style="background:#f0f0f0;padding:2px 6px">—</span> Δεν αφορά</span>
      </div>`;

    const html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;margin:8mm;color:#000;}
      h1{font-size:14px;font-weight:bold;margin-bottom:2px;}
      h2{font-size:11px;margin-top:0;margin-bottom:10px;}
      table{width:100%;border-collapse:collapse;font-size:10px;}
      th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;white-space:nowrap;background:#fff;}
      td{padding:5px 4px;border-bottom:1px solid #ddd;vertical-align:middle;}
      @media print{@page{size:A4 landscape;margin:8mm;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
    </style></head><body>
      <h1>VAICON — ΚΑΤΑΣΤΑΣΗ ΠΑΡΑΓΩΓΗΣ</h1>
      <h2>📅 ${dateStr} &nbsp;|&nbsp; Σύνολο: ${prodOrders.length} παραγγελίες σε παραγωγή</h2>
      <table><thead><tr>
        <th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th>
        ${phaseHeader}
      </tr></thead><tbody>${rows}</tbody></table>
      ${legend}
    </body></html>`;

    try {
      await printHTML(html, 'VAICON — Κατάσταση Παραγωγής');
    } catch(e) {
      Alert.alert("Σφάλμα","Δεν δημιουργήθηκε το PDF.");
    }
  };

  // Ενότητα ΣΤΗΝ ΠΑΡΑΓΩΓΗ με υποκαρτέλες
  const renderProdSection = () => {
    const prodOrders = customOrders.filter(o=>o.status==='PROD').sort((a,b)=>(b.prodAt||0)-(a.prodAt||0));
    const maxPhaseCount = prodOrders.length === 0 ? 0 : Math.max(...PHASES.map(ph =>
      prodOrders.filter(o => o.phases?.[ph.key]?.active && !o.phases?.[ph.key]?.done).length
    ));

    const phaseKeys = [...PHASES.map(p=>p.key), 'stavera'];

    const handlePageScroll = (e) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (page >= 0 && page < phaseKeys.length) {
        setActiveProdPhase(phaseKeys[page]);
      }
    };
    return (
      <View>
        <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#ffbb33', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]} onPress={()=>toggleSection('prod')}>
          <Text style={styles.listHeaderText}>● ΠΑΡΑΓΓΕΛΙΕΣ ΣΤΗΝ ΠΑΡΑΓΩΓΗ ({maxPhaseCount})</Text>
          {expanded.prod&&(
            <TouchableOpacity
              style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20, marginRight:4}}
              onPress={()=>handlePrintProdStatus(prodOrders)}>
              <Text style={{color:'#8B0000', fontSize:11, fontWeight:'bold'}}>📋 ΚΑΤΑΣΤΑΣΗ</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {expanded.prod&&(
          <View style={styles.prodContainer}>
            {/* ΥΠΟΚΑΡΤΕΛΕΣ */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.phaseTabs}>
              {PHASES.map(ph=>(
                <TouchableOpacity key={ph.key} style={[styles.phaseTab, activeProdPhase===ph.key&&styles.phaseTabActive]} onPress={()=>{
                  setActiveProdPhase(ph.key);
                  const idx = phaseKeys.indexOf(ph.key);
                  prodScrollRef.current?.scrollTo({x: idx * pageWidth, animated:true});
                }}>
                  <Text style={[styles.phaseTabTxt, activeProdPhase===ph.key&&styles.phaseTabTxtActive]}>{ph.label}</Text>
                  <Text style={styles.phaseTabCount}>{prodOrders.filter(o=>o.phases?.[ph.key]?.active&&!o.phases?.[ph.key]?.done).length}</Text>
                </TouchableOpacity>
              ))}
              {/* ΣΤΑΘΕΡΑ tab */}
              <TouchableOpacity
                style={[styles.phaseTab, activeProdPhase==='stavera'&&styles.phaseTabActive, {backgroundColor: activeProdPhase==='stavera'?'#7b1fa2':'#f3e5f5', minWidth:0, paddingHorizontal:14}]}
                onPress={()=>{ setActiveProdPhase('stavera'); prodScrollRef.current?.scrollTo({x: phaseKeys.indexOf('stavera') * pageWidth, animated:true}); }}>
                <Text style={[styles.phaseTabTxt, activeProdPhase==='stavera'&&styles.phaseTabTxtActive]}>ΣΤΑΘΕΡΑ</Text>
                <Text style={styles.phaseTabCount}>{prodOrders.filter(o=>o.stavera&&o.stavera.length>0).length}</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* ΚΟΥΜΠΙΑ ΕΠΙΛΟΓΗΣ + ΕΚΤΥΠΩΣΗΣ */}
            {activeProdPhase!=='stavera'&&<View style={{flexDirection:'row', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap'}}>
              {/* ΕΠΙΛΟΓΗ ΟΛΩΝ */}
              <TouchableOpacity
                style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:8, paddingHorizontal:10, backgroundColor:'#f0f0f0', borderRadius:8, borderWidth:1, borderColor:'#ccc'}}
                onPress={()=>{
                  const phaseOrders = prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active && !o.phases?.[activeProdPhase]?.done);
                  const allSelected = phaseOrders.every(o=>printSelected[o.id]);
                  const newSelected = {...printSelected};
                  phaseOrders.forEach(o=>{ newSelected[o.id] = !allSelected; });
                  setPrintSelected(newSelected);
                }}>
                <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:'#555',backgroundColor:
                  prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active&&!o.phases?.[activeProdPhase]?.done).every(o=>printSelected[o.id])&&
                  prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active&&!o.phases?.[activeProdPhase]?.done).length>0
                  ?'#555':'white', alignItems:'center',justifyContent:'center'}}>
                  {prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active&&!o.phases?.[activeProdPhase]?.done).every(o=>printSelected[o.id])&&
                   prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active&&!o.phases?.[activeProdPhase]?.done).length>0
                   ?<Text style={{color:'white',fontSize:11,fontWeight:'bold'}}>✓</Text>:null}
                </View>
                <Text style={{fontSize:11,fontWeight:'bold',color:'#555'}}>ΟΛΩΝ</Text>
              </TouchableOpacity>

              {/* ΕΠΙΛΟΓΗ ΜΗ ΕΚΤΥΠΩΜΕΝΩΝ */}
              <TouchableOpacity
                style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:8, paddingHorizontal:10, backgroundColor:'#fff3cd', borderRadius:8, borderWidth:1, borderColor:'#ffc107'}}
                onPress={()=>{
                  const phaseOrders = prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active && !o.phases?.[activeProdPhase]?.done);
                  const newSelected = {...printSelected};
                  phaseOrders.forEach(o=>{ newSelected[o.id] = !o.phases?.[activeProdPhase]?.printed; });
                  setPrintSelected(newSelected);
                }}>
                <Text style={{fontSize:11,fontWeight:'bold',color:'#856404'}}>🖨️ ΜΗ ΕΚΤΥΠ.</Text>
              </TouchableOpacity>

              {/* ΕΚΤΥΠΩΣΗ */}
              <TouchableOpacity style={[styles.printBtn,{flex:1,marginBottom:0}]} onPress={()=>handlePrint(activeProdPhase)}>
                <Text style={styles.printBtnTxt}>🖨️ ΕΚΤΥΠΩΣΗ ΕΠΙΛΕΓΜΕΝΩΝ</Text>
              </TouchableOpacity>
            </View>}

            {/* PAGED SCROLL — ένα page ανά φάση + ΣΤΑΘΕΡΑ */}
            <ScrollView
              ref={prodScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onLayout={e=>{ setPageWidth(e.nativeEvent.layout.width); }}
              onMomentumScrollEnd={e=>{
                const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
                if (page >= 0 && page < phaseKeys.length) setActiveProdPhase(phaseKeys[page]);
              }}
              scrollEventThrottle={16}>
              {PHASES.map(ph=>(
                <View key={ph.key} style={{width:pageWidth}}>
                  {prodOrders.length===0?(
                    <Text style={{textAlign:'center',color:'#999',padding:20}}>Καμία παραγγελία στην παραγωγή</Text>
                  ):(
                    prodOrders.map(o=>renderProdPhaseCard(o, ph.key))
                  )}
                </View>
              ))}
              {/* ΣΤΑΘΕΡΑ — τελευταίο page */}
              <View style={{width:pageWidth}}>
                {(()=>{
                  const staveraOrders = [
                    ...prodOrders.filter(o=>o.stavera&&o.stavera.length>0),
                    ...customOrders.filter(o=>o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)
                  ];
                  return (
                    <View style={{marginTop:6}}>
                      {/* PRINT BAR για ΣΤΑΘΕΡΑ */}
                      <View style={{flexDirection:'row', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap'}}>
                        <TouchableOpacity
                          style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:8, paddingHorizontal:10, backgroundColor:'#f0f0f0', borderRadius:8, borderWidth:1, borderColor:'#ccc'}}
                          onPress={()=>{
                            const allSelected = staveraOrders.every(o=>printSelected[o.id]);
                            const newSelected = {...printSelected};
                            staveraOrders.forEach(o=>{ newSelected[o.id] = !allSelected; });
                            setPrintSelected(newSelected);
                          }}>
                          <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:'#555',backgroundColor:
                            staveraOrders.length>0&&staveraOrders.every(o=>printSelected[o.id])?'#555':'white',alignItems:'center',justifyContent:'center'}}>
                            {staveraOrders.length>0&&staveraOrders.every(o=>printSelected[o.id])&&<Text style={{color:'white',fontSize:11,fontWeight:'bold'}}>✓</Text>}
                          </View>
                          <Text style={{fontSize:11,fontWeight:'bold',color:'#555'}}>ΟΛΩΝ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:8, paddingHorizontal:10, backgroundColor:'#fff3cd', borderRadius:8, borderWidth:1, borderColor:'#ffc107'}}
                          onPress={()=>{
                            const newSelected = {...printSelected};
                            staveraOrders.forEach(o=>{ newSelected[o.id] = !o.staveraPrinted; });
                            setPrintSelected(newSelected);
                          }}>
                          <Text style={{fontSize:11,fontWeight:'bold',color:'#856404'}}>🖨️ ΜΗ ΕΚΤΥΠ.</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.printBtn,{flex:1,marginBottom:0}]}
                          onPress={()=>{
                            const selected = Object.keys(printSelected).filter(id=>printSelected[id]);
                            if (selected.length===0) return Alert.alert("Προσοχή","Επίλεξε τουλάχιστον μία παραγγελία.");
                            const orders = staveraOrders.filter(o=>selected.includes(o.id));
                            if (orders.length===0) return Alert.alert("Προσοχή","Καμία έγκυρη παραγγελία.");
                            setPrintPreview({ visible:true, phaseKey:'stavera', orders, copies:1 });
                          }}>
                          <Text style={styles.printBtnTxt}>🖨️ ΕΚΤΥΠΩΣΗ ΕΠΙΛΕΓΜΕΝΩΝ</Text>
                        </TouchableOpacity>
                      </View>
                      {staveraOrders.length===0?(
                        <Text style={{textAlign:'center',color:'#999',padding:16}}>Δεν υπάρχουν παραγγελίες με σταθερά</Text>
                      ):staveraOrders.map(o=>{
                        const isSelected = !!printSelected[o.id];
                        return (
                        <View key={o.id} style={{backgroundColor:o.staveraDone?'#e8f5e9':o.staveraGiven?'#ede7f6':'#f3e5f5', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:4, borderLeftColor:o.staveraDone?'#00C851':o.staveraGiven?'#4a148c':'#7b1fa2', elevation:1, flexDirection:'row', alignItems:'flex-start'}}>
                          <TouchableOpacity style={{marginRight:10, marginTop:2}} onPress={()=>setPrintSelected(p=>({...p,[o.id]:!p[o.id]}))}>
                            <View style={{width:28,height:28,borderRadius:6,borderWidth:2,borderColor:isSelected?'#1565c0':'#7b1fa2',backgroundColor:isSelected?'#1565c0':'white',alignItems:'center',justifyContent:'center'}}>
                              {isSelected&&<Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✓</Text>}
                            </View>
                          </TouchableOpacity>
                          <View style={{flex:1}}>
                            <Text style={{fontWeight:'bold', fontSize:13, marginBottom:4}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                            <Text style={{fontSize:12, color:'#555', marginBottom:6}}>{o.h}x{o.w} | {o.side}</Text>
                            {(o.stavera||[]).map((s,idx)=>(
                              <View key={idx} style={{backgroundColor:'white', borderRadius:6, padding:8, marginBottom:4, borderLeftWidth:2, borderLeftColor:'#ce93d8'}}>
                                <Text style={{fontWeight:'bold', fontSize:13, color:'#4a148c'}}>📐 {s.dim||'—'}</Text>
                                {s.note?<Text style={{fontSize:12, color:'#555', marginTop:2}}>{s.note}</Text>:null}
                              </View>
                            ))}
                            {o.staveraDone&&<Text style={{fontSize:11,color:'#00796B',fontWeight:'bold',marginTop:2}}>✅ Ολοκληρώθηκαν</Text>}
                          </View>
                          <View style={{justifyContent:'space-between', gap:6, marginLeft:8, paddingVertical:2}}>
                            <TouchableOpacity
                              style={[styles.doneBtn, o.staveraDone&&styles.doneBtnActive]}
                              onPress={async()=>{
                                const newDone = !o.staveraDone;
                                const upd={...o, staveraDone:newDone, ...(newDone && {staveraPendingAtReady:false})};
                                setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                await syncToCloud(upd);
                              }}>
                              <Text style={styles.doneBtnTxt}>{o.staveraDone?'↩️ UNDO':'✓ DONE'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignSelf:'stretch', alignItems:'center'}}
                              onPress={async()=>{
                                if(!window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) return;
                                setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                                await deleteFromCloud(o.id);
                              }}>
                              <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            </ScrollView>
          </View>
        )}
      </View>
    );
  };


  return (
    <View style={{flex:1}}>
      <SellModal visible={sellModal.visible} totalQty={sellModal.totalQty} onConfirm={handleSellConfirm} onCancel={()=>setSellModal({visible:false,orderId:null,totalQty:1})} />
      <DuplicateModal
        visible={dupModal.visible}
        base={dupModal.base}
        suggested={dupModal.suggested}
        onUse={dupModal.onUse}
        onKeep={dupModal.onKeep}
        onCancel={dupModal.onCancel}
      />
      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        onConfirm={()=>{ setConfirmModal(m=>({...m,visible:false})); if(confirmModal.onConfirm) confirmModal.onConfirm(); }}
        onCancel={()=>setConfirmModal(m=>({...m,visible:false}))}
      />

      {/* Modal επιβεβαίωσης ΕΤΟΙΜΗ */}
      <Modal visible={readyConfirmModal.visible} transparent animationType="fade">
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'white', borderRadius:16, padding:24, width:'85%', maxWidth:400}}>
            <Text style={{fontSize:18, fontWeight:'bold', color:'#00796B', marginBottom:8}}>✅ Επιβεβαίωση ΕΤΟΙΜΗ</Text>
            <Text style={{fontSize:14, color:'#444', marginBottom:4}}>Η παραγγελία <Text style={{fontWeight:'bold'}}>#{readyConfirmModal.order?.orderNo}</Text> είναι έτοιμη;</Text>
            <Text style={{fontSize:13, color:'#666', marginBottom:16}}>Το σασί θα αφαιρεθεί από το στοκ{readyConfirmModal.caseItem ? ' και η κάσα θα δεσμευτεί.' : '.'}</Text>
            <View style={{flexDirection:'row', gap:10}}>
              <TouchableOpacity
                style={{flex:1, padding:14, borderRadius:8, backgroundColor:'#eee', alignItems:'center'}}
                onPress={()=>setReadyConfirmModal({visible:false,order:null,sasiItem:null,caseItem:null})}>
                <Text style={{fontWeight:'bold', color:'#555'}}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flex:1, padding:14, borderRadius:8, backgroundColor:'#00C851', alignItems:'center'}}
                onPress={async()=>{
                  const {order:o, sasiItem, caseItem} = readyConfirmModal;
                  setReadyConfirmModal({visible:false,order:null,sasiItem:null,caseItem:null});
                  const label = `${o.customer||''}${o.customer?' ':''} #${o.orderNo}`;
                  const updOrder = {...o, status:'STD_READY', readyAt:Date.now(),
                    reservedSasiId: sasiItem?.id||null,
                    reservedCaseId: caseItem?.id||null
                  };
                  setCustomOrders(prev=>prev.map(x=>x.id===o.id?updOrder:x));
                  await syncToCloud(updOrder);
                  // Δεσμεύσεις στο νέο stock γίνονται κατά την αποθήκευση παραγγελίας
                  await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ','Φάση → ΕΤΟΙΜΟ',{orderNo:o.orderNo,customer:o.customer,size:`${o.h}x${o.w}`});
                }}>
                <Text style={{fontWeight:'bold', color:'white', fontSize:15}}>ΕΤΟΙΜΗ ✅</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView ref={mainScrollRef} style={{padding:10}} keyboardShouldPersistTaps="handled">
        <View style={{paddingBottom:120}}>
          <Text style={styles.sectionTitle}>ΚΑΤΑΧΩΡΗΣΗ ΤΥΠΟΠΟΙΗΜΕΝΗΣ ΠΑΡΑΓΓΕΛΙΑΣ</Text>



          {/* ═══ CARD: ΠΕΛΑΤΗΣ + ΑΡ. ΠΑΡΑΓΓΕΛΙΑΣ ═══ */}
          <View style={vstyles.card}>
            <View style={vstyles.cardHeader}><Text style={vstyles.cardHeaderTxt}>👤  ΣΤΟΙΧΕΙΑ ΠΑΡΑΓΓΕΛΙΑΣ</Text></View>
            <View style={vstyles.cardBody}>

          {/* ΠΕΛΑΤΗΣ */}
          <View style={{marginBottom:8,zIndex:100}}>
            {selectedCustomer ? (
              <TouchableOpacity style={styles.selectedCustomerBox} onPress={()=>setShowCustomerInfo(true)}>
                <View style={{flex:1}}>
                  <Text style={styles.selectedCustomerName}>👤 {selectedCustomer.name}</Text>
                  <Text style={styles.selectedCustomerHint}>Πάτα για να δεις τα στοιχεία</Text>
                </View>
                <TouchableOpacity onPress={()=>{setSelectedCustomer(null);setCustomerSearch('');setCustomForm({...customForm,customer:''});}}>
                  <Text style={{color:'#ff4444',fontWeight:'bold',fontSize:18,padding:6}}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ) : (
              <>
                <TextInput ref={customerRef} style={styles.input} placeholder="Αναζήτηση Πελάτη" value={customerSearch}
                  onChangeText={v=>{setCustomerSearch(v);setShowCustomerList(true);setCustomForm({...customForm,customer:v});}}
                  onSubmitEditing={()=>orderNoRef.current?.focus()}
                  returnKeyType="next" blurOnSubmit={false}
                />
                {showCustomerList&&customerSearch.length>0&&(customers||[]).filter(c=>
                  c.name?.toLowerCase().includes(customerSearch.toLowerCase())||
                  c.phone?.includes(customerSearch)||
                  c.identifier?.toLowerCase().includes(customerSearch.toLowerCase())
                ).slice(0,5).length>0&&(
                  <View style={styles.customerDropdown}>
                    {(customers||[]).filter(c=>
                      c.name?.toLowerCase().includes(customerSearch.toLowerCase())||
                      c.phone?.includes(customerSearch)||
                      c.identifier?.toLowerCase().includes(customerSearch.toLowerCase())
                    ).slice(0,5).map(c=>(
                      <TouchableOpacity key={c.id} style={styles.customerOption}
                        onPressIn={()=>{
                          customerSelectedRef.current = true;
                          setCustomForm({...customForm,customer:c.name,customerId:c.id});
                          setCustomerSearch(c.name); setSelectedCustomer(c); setShowCustomerList(false);
                          setTimeout(()=>orderNoRef.current?.focus(), 100);
                        }}>
                        <Text style={styles.customerOptionName}>{c.name}</Text>
                        {c.phone?<Text style={styles.customerOptionDetail}>📞 {c.phone}</Text>:null}
                        {c.identifier?<Text style={styles.customerOptionDetail}>🏷 {c.identifier}</Text>:null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          {/* MODAL ΕΠΑΛΗΘΕΥΣΗΣ */}
          {showCustomerInfo&&selectedCustomer&&(
            <Modal visible={showCustomerInfo} transparent animationType="fade">
              <View style={styles.modalOverlay}>
                <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>👤 ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ</Text>
                  <Text style={styles.infoRow}>📛 {selectedCustomer.name}</Text>
                  {selectedCustomer.phone?<Text style={styles.infoRow}>📞 {selectedCustomer.phone}</Text>:<Text style={styles.infoRowEmpty}>📞 Χωρίς τηλέφωνο</Text>}
                  {selectedCustomer.identifier?<Text style={styles.infoRow}>🏷 {selectedCustomer.identifier}</Text>:<Text style={styles.infoRowEmpty}>🏷 Χωρίς αναγνωριστικό</Text>}
                  <View style={{flexDirection:'row',gap:10,marginTop:16}}>
                    <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#ff4444',flex:1}]} onPress={()=>{setShowCustomerInfo(false);setSelectedCustomer(null);setCustomerSearch('');setCustomForm({...customForm,customer:''});}}>
                      <Text style={{color:'white',fontWeight:'bold'}}>ΑΛΛΑΓΗ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#00C851',flex:1}]} onPress={()=>setShowCustomerInfo(false)}>
                      <Text style={{color:'white',fontWeight:'bold'}}>ΣΩΣΤΟΣ ✓</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}

          {/* ΝΟΥΜΕΡΟ ΠΑΡΑΓΓΕΛΙΑΣ + ΠΑΡΑΔΟΣΗ ίδια γραμμή */}
          <View style={{flexDirection:'row', gap:8, alignItems:'flex-end', marginBottom:2}}>
          <TextInput ref={orderNoRef} style={[styles.input, {fontSize:18, fontWeight:'bold', width:90, letterSpacing:1, marginBottom:0}]} placeholder="Ν/Π" keyboardType="numeric" value={customForm.orderNo} selectTextOnFocus
            onFocus={()=>{
              if (!selectedCustomer && customerSearch.trim()) {
                const exists = (customers||[]).some(c=>c.name?.toLowerCase()===customerSearch.trim().toLowerCase());
                if (!exists) {
                  orderNoRef.current?.blur();
                  Alert.alert(
                    "Πελάτης δεν βρέθηκε",
                    `Ο πελάτης "${customerSearch.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`,
                    [
                      { text:"ΟΧΙ", style:"destructive", onPress:()=>{ setCustomerSearch(''); setCustomForm(f=>({...f,customer:''})); }},
                      { text:"ΝΑΙ", onPress:()=>{
                        if (onRequestAddCustomer) {
                          onRequestAddCustomer(customerSearch.trim(), (newCustomer)=>{
                            setSelectedCustomer(newCustomer);
                            setCustomerSearch(newCustomer.name);
                            setCustomForm(f=>({...f,customer:newCustomer.name,customerId:newCustomer.id}));
                          });
                        }
                      }}
                    ]
                  );
                }
              }
            }}
            onChangeText={v=>setCustomForm({...customForm,orderNo:v})}
            onSubmitEditing={()=>{
              if (!customForm.orderNo) { hRef.current?.focus(); return; }
              const exists = [...customOrders,...specialOrders].some(o=>o.orderNo===customForm.orderNo && o.id!==editingOrder?.id);
              if (exists) {
                const base = customForm.orderNo;
                const suggested = computeSuggested(base, [...customOrders,...specialOrders], editingOrder?.id);
                Keyboard.dismiss();
                setDupModal({
                  visible:true, base, suggested,
                  onUse:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:suggested})); setTimeout(()=>hRef.current?.focus(),100); },
                  onKeep:()=>{ setDupModal(m=>({...m,visible:false})); hRef.current?.focus(); },
                  onCancel:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:''})); }
                });
              } else {
                Keyboard.dismiss();
              }
            }}
            onBlur={()=>{
              if (!customForm.orderNo) return;
              const exists = [...customOrders,...specialOrders].some(o=>o.orderNo===customForm.orderNo && o.id!==editingOrder?.id);
              if (exists) {
                const base = customForm.orderNo;
                const suggested = computeSuggested(base, [...customOrders,...specialOrders], editingOrder?.id);
                setDupModal({
                  visible:true, base, suggested,
                  onUse:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:suggested})); },
                  onKeep:()=>{ setDupModal(m=>({...m,visible:false})); },
                  onCancel:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:''})); }
                });
              }
            }}
            blurOnSubmit={false} />
            <View style={{width:110}}>
              <Text style={[vstyles.fieldLabel,{marginBottom:3}]}>Παράδοση</Text>
              <TouchableOpacity style={[vstyles.selectBtn,{paddingVertical:8,paddingHorizontal:5}]} onPress={()=>setShowDatePicker(true)}>
                <Text style={{fontSize:11,color:customForm.deliveryDate?'#1a1a1a':'#aaa'}} numberOfLines={1}>📅 {customForm.deliveryDate||'—'}</Text>
              </TouchableOpacity>
            </View>
          </View>{/* end orderno+delivery row */}

            </View>{/* end cardBody */}
          </View>{/* end card */}

                      {/* CARD: ΔΙΑΣΤΑΣΕΙΣ + ΣΤΑΘΕΡΑ — σχέδιο χαρτί */}
            <View style={vstyles.card}>
              <View style={vstyles.cardHeader}><Text style={vstyles.cardHeaderTxt}>📐  ΔΙΑΣΤΑΣΕΙΣ & ΣΤΑΘΕΡΑ</Text></View>
              <View style={[vstyles.cardBody,{flexDirection:'row',gap:8}]}>

                {/* ── ΑΡΙΣΤΕΡΑ: chips + Τεμ/Μείωση/Μοντ (λιγότερο από μισό) ── */}
                <View style={{flex:5}}>
                  {/* Ύψος */}
                  <Text style={vstyles.fieldLabel}>Ύψος</Text>
                  <View style={[vstyles.chipRow,{marginTop:2}]}>
                    {STD_HEIGHTS.map(h=>(
                      <TouchableOpacity key={h} style={[vstyles.dimChip,customForm.h===h&&vstyles.dimChipOn]} onPress={()=>setCustomForm({...customForm,h:h})}>
                        <Text style={[vstyles.dimChipTxt,customForm.h===h&&vstyles.dimChipTxtOn]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Πλάτος */}
                  <Text style={[vstyles.fieldLabel,{marginTop:5}]}>Πλάτος</Text>
                  <View style={[vstyles.chipRow,{marginTop:2}]}>
                    {STD_WIDTHS.map(w=>(
                      <TouchableOpacity key={w} style={[vstyles.dimChip,customForm.w===w&&vstyles.dimChipOn]} onPress={()=>setCustomForm({...customForm,w:w})}>
                        <Text style={[vstyles.dimChipTxt,customForm.w===w&&vstyles.dimChipTxtOn]}>{w}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Φορά */}
                  <View style={{flexDirection:'row',gap:3,marginTop:5}}>
                    {['ΑΡΙΣΤΕΡΗ','ΔΕΞΙΑ'].map(s=>(
                      <TouchableOpacity key={s} style={[vstyles.sideChip,customForm.side===s&&vstyles.sideChipOn]} onPress={()=>setCustomForm({...customForm,side:s})}>
                        <Text style={[vstyles.sideChipTxt,customForm.side===s&&vstyles.sideChipTxtOn]}>{s==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ.':'ΔΕΞ. ►'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Τεμ. + Μείωση + Μοντάρισμα σε μία γραμμή */}
                  <View style={{flexDirection:'row',gap:4,marginTop:6,alignItems:'flex-end'}}>
                    <View style={{flex:1}}>
                      <Text style={vstyles.fieldLabelDark}>Τεμ.</Text>
                      <TextInput style={[styles.qtyInput,{marginTop:2,marginBottom:0,width:'100%',fontSize:16,padding:5}]} keyboardType="numeric" value={customForm.qty} onChangeText={v=>setCustomForm({...customForm,qty:v})} selectTextOnFocus/>
                    </View>
                    {(customForm.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!customForm.sasiType)&&(
                      <View style={{flex:1}}>
                        <Text style={[vstyles.fieldLabelDark,{textAlign:'center'}]}>Μείωση Ύψους</Text>
                        <TextInput style={[styles.qtyInput,{borderColor:'#ff9800',color:'#ff9800',marginTop:2,marginBottom:0,width:'100%',fontSize:16,padding:5}]} placeholder="—" keyboardType="numeric" maxLength={2} value={customForm.heightReduction} onChangeText={v=>{ const n=v.replace(/[^0-9]/g,''); setCustomForm({...customForm,heightReduction:n?'-'+n:''}); }} selectTextOnFocus/>
                      </View>
                    )}
                    <View style={{flex:2}}>
                      <Text style={[vstyles.fieldLabelDark,{textAlign:'center'}]}>Μοντάρισμα</Text>
                      <View style={{flexDirection:'row',gap:3,marginTop:2}}>
                        {['ΝΑΙ','ΟΧΙ'].map(v=>(
                          <TouchableOpacity key={v} style={[vstyles.togBtn,customForm.installation===v&&(v==='ΝΑΙ'?vstyles.togBtnGreen:vstyles.togBtnOn)]} onPress={()=>setCustomForm({...customForm,installation:v})}>
                            <Text style={[vstyles.togBtnTxt,customForm.installation===v&&vstyles.togBtnTxtOn]}>{v}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>

                {/* ΚΑΤΑΚΟΡΥΦΟ ΔΙΑΧΩΡΙΣΤΙΚΟ */}
                <View style={{width:1,backgroundColor:'#ddd',marginVertical:2}}/>

                {/* ── ΔΕΞΙΑ: ΣΤΑΘΕΡΑ grid ── */}
                <View style={{flex:6}}>
                  {/* Τίτλος ΣΤΑΘΕΡΑ */}
                  <Text style={{fontSize:11,fontWeight:'900',color:'#2c2c2c',letterSpacing:2,marginBottom:4,textAlign:'center'}}>ΣΤΑΘΕΡΑ</Text>
                  {/* Headers */}
                  <View style={{flexDirection:'row',gap:3,marginBottom:3}}>
                    <Text style={[vstyles.fieldLabel,{flex:1}]}>Διάσταση</Text>
                    <Text style={[vstyles.fieldLabel,{flex:2}]}>Παρατήρηση Σταθερά</Text>
                  </View>
                  {/* 4 έτοιμες γραμμές — ένα πλαίσιο διάστασης */}
                  {[0,1,2,3].map(i=>{
                    const s = (customForm.stavera||[])[i] || {dimH:'',dimW:'',dim:'',note:''};
                    // Το ενιαίο πλαίσιο δείχνει: ύψος → Enter → "208 × " → γράφεις πλάτος
                    return (
                      <View key={i} style={{flexDirection:'row',gap:3,marginBottom:4,alignItems:'center'}}>
                        {/* Ενιαίο πλαίσιο διάστασης */}
                        <TextInput
                          ref={el=>{staveraHRefs.current[i]=el;}}
                          style={[vstyles.staveraCell,{width:90,textAlign:'center',fontSize:13,fontWeight:'700'}]}
                          placeholder="Υ × Π"
                          keyboardType="numeric"
                          returnKeyType="next"
                          value={s.dim||''}
                          onChangeText={v=>{
                            // Απλή αποθήκευση — χωρίς καμία αυτόματη λογική
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dimH:'',dimW:'',dim:'',note:''})))];
                            while(upd.length<=i) upd.push({dimH:'',dimW:'',dim:'',note:''});
                            upd[i]={...upd[i],dim:v};
                            setCustomForm({...customForm,stavera:upd});
                          }}
                          onSubmitEditing={()=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dimH:'',dimW:'',dim:'',note:''})))];
                            while(upd.length<=i) upd.push({dimH:'',dimW:'',dim:'',note:''});
                            const cur=upd[i];
                            const dim=cur.dim||'';
                            if(dim && !dim.includes(' × ')){
                              // Πρώτο Enter: προσθέτουμε " × " στο τέλος
                              upd[i]={...cur,dim:dim+' × '};
                              setCustomForm({...customForm,stavera:upd});
                              setTimeout(()=>staveraHRefs.current[i]?.focus(),30);
                            } else {
                              // Δεύτερο Enter (έχει ήδη × ): πάμε παρατήρηση
                              staveraGridNoteRefs.current[i]?.focus();
                            }
                          }}
                        />
                        {/* Παρατήρηση */}
                        <TextInput
                          ref={el=>{staveraGridNoteRefs.current[i]=el;}}
                          style={[vstyles.staveraCell,{flex:1,minHeight:32}]}
                          placeholder="..."
                          returnKeyType="next"
                          blurOnSubmit={false}
                          value={s.note||''}
                          onChangeText={v=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dimH:'',dimW:'',dim:'',note:''})))];
                            while(upd.length<=i) upd.push({dimH:'',dimW:'',dim:'',note:''});
                            upd[i]={...upd[i],note:v};
                            setCustomForm({...customForm,stavera:upd});
                          }}
                          onSubmitEditing={()=>{ staveraHRefs.current[i+1]?.focus(); }}
                        />
                      </View>
                    );
                  })}
                </View>

              </View>
            </View>

            {/* CARD: ΛΟΙΠΑ ΣΤΟΙΧΕΙΑ — Τύπος+Κλειδαριά+Χρώμα+Επένδυση+Παρατηρήσεις */}
            <View style={vstyles.card}>
              <View style={vstyles.cardHeader}><Text style={vstyles.cardHeaderTxt}>⚙️  ΛΟΙΠΑ ΣΤΟΙΧΕΙΑ</Text></View>
              <View style={vstyles.cardBody}>

                {/* ΓΡΑΜΜΗ 1: Αριστερά Τύποι, Δεξιά Κλειδαριά + Χρώμα */}
                <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
                  {/* ΑΡΙΣΤΕΡΑ: Τύπος Κάσας + Τύπος Σασί κάθετα */}
                  <View style={{flex:1}}>
                    <Text style={vstyles.fieldLabelDark}>Τύπος Κάσας</Text>
                    <View style={{flexDirection:'row',gap:3,marginTop:2,marginBottom:6}}>
                      {['ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ','ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ'].map(t=>(
                        <TouchableOpacity key={t} style={[vstyles.togBtnSm,customForm.caseType===t&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,caseType:t})}>
                          <Text style={[vstyles.togBtnSmTxt,customForm.caseType===t&&vstyles.togBtnTxtOn]}>{t==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={vstyles.fieldLabelDark}>Τύπος Σασί</Text>
                    <View style={{flexDirection:'row',gap:3,marginTop:2}}>
                      {['ΜΟΝΗ ΘΩΡΑΚΙΣΗ','ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'].map(t=>(
                        <TouchableOpacity key={t} style={[vstyles.togBtnSm,customForm.sasiType===t&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,sasiType:t,heightReduction:t==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'':customForm.heightReduction})}>
                          <Text style={[vstyles.togBtnSmTxt,customForm.sasiType===t&&vstyles.togBtnTxtOn]}>{t==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'?'ΜΟΝΗ':'ΔΙΠΛΗ'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {/* ΔΕΞΙΑ: Κλειδαριά + Χρώμα Εξαρτημάτων */}
                  <View style={{flex:2}}>
                    <Text style={vstyles.fieldLabelDark}>Κλειδαριά</Text>
                    <TouchableOpacity style={[vstyles.selectBtn,{marginTop:2,marginBottom:6}]} onPress={()=>{blurAll();setShowLockPicker(true);}}>
                      <Text style={{fontSize:13,color:customForm.lock?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{customForm.lock||'Επιλέξτε...'}</Text>
                      <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                    </TouchableOpacity>
                    <Text style={vstyles.fieldLabelDark}>Χρώμα Εξαρτημάτων</Text>
                    <TouchableOpacity style={[vstyles.selectBtn,{marginTop:2}]} onPress={()=>{blurAll();setShowHardwarePicker(true);}}>
                      <Text style={{fontSize:13,color:customForm.hardware?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{customForm.hardware||'Επιλέξτε...'}</Text>
                      <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ΓΡΑΜΜΗ 2: Επένδυση — ολόκληρη γραμμή */}
                <Text style={vstyles.fieldLabelDark}>Επένδυση</Text>
                <TouchableOpacity style={[vstyles.selectBtn,{marginTop:2,marginBottom:8}]} onPress={()=>{blurAll();setShowCoatingsPicker(true);}}>
                  <Text style={{fontSize:13,color:(customForm.coatings&&customForm.coatings.length>0)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>
                    {(customForm.coatings&&customForm.coatings.length>0)?customForm.coatings.join(', '):'Επιλέξτε...'}
                  </Text>
                  <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                </TouchableOpacity>

                {/* ΓΡΑΜΜΗ 3: Παρατηρήσεις — ολόκληρη γραμμή */}
                <Text style={vstyles.fieldLabelDark}>Παρατηρήσεις</Text>
                <TextInput style={[vstyles.textInput,{height:55,textAlignVertical:'top',marginTop:2}]} placeholder="Προαιρετικά..." value={customForm.notes} multiline onChangeText={v=>setCustomForm({...customForm,notes:v})}/>

              </View>
            </View>

          

          <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#8B0000'}]} onPress={()=>{
            Keyboard.dismiss();
            saveOrder();
          }}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>
              📐 ΑΠΟΘΗΚΕΥΣΗ ΠΑΡΑΓΓΕΛΙΑΣ
            </Text>
          </TouchableOpacity>


          {/* ΠΑΡΑΓΓΕΛΙΕΣ ΤΥΠΟΠΟΙΗΜΕΝΩΝ — μόνο για ΤΥΠΟΠΟΙΗΜΕΝΗ tab */}
          <>
            <Text style={styles.mainTitle}>ΠΑΡΑΓΓΕΛΙΕΣ ΤΥΠΟΠΟΙΗΜΕΝΩΝ</Text>

            {/* --- helper για render κάρτας --- */}
            {(()=>{
              const renderStdCard = (o, hasSasi, hasCase, sasiActive) => {
                const canMount = sasiActive ? (hasCase && hasSasi) : hasCase;

                // ΔΙΠΛΗ indicators από dipliPhases
                const dipliSasiDone = !sasiActive && !!(o.dipliPhases?.laser?.done && o.dipliPhases?.montSasi?.done);
                const dipliMontDone = !sasiActive && !!(o.dipliPhases?.montDoor?.done);
                const sasiOk = sasiActive ? hasSasi : dipliSasiDone;

                const cardBorder = '#8B0000';
                return (
                  <TouchableOpacity key={o.id}
                    onLongPress={async()=>{
                      const isMoni = (o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType) && !o.lock;
                      setCustomForm(o);
                      setOrderType('ΤΥΠΟΠΟΙΗΜΕΝΗ');
                      setCustomerSearch(o.customer||'');
                      setEditingOrder(o);
                      setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                      deleteFromCloud(o.id);
                      await removeStockReservation(o.orderNo, o.h, o.w, o.side, o.caseType, isMoni);
                      setTimeout(()=>{
                        if(Platform.OS==='web') window.scrollTo({top:0, behavior:'smooth'});
                        else mainScrollRef.current?.scrollTo({y:0, animated:true});
                      }, 150);
                    }}
                    delayLongPress={600}
                    activeOpacity={0.8}
                    onStartShouldSetResponder={()=>true}
                    {...(Platform.OS==='web' ? {
                      onContextMenu: async(e)=>{
                        e.preventDefault();
                        if(!window.confirm(`✏️ Επεξεργασία παραγγελίας #${o.orderNo};`)) return;
                        const isMoni = (o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType) && !o.lock;
                        setCustomForm(o);
                        setOrderType('ΤΥΠΟΠΟΙΗΜΕΝΗ');
                        setCustomerSearch(o.customer||'');
                        setEditingOrder(o);
                        setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                        deleteFromCloud(o.id);
                        await removeStockReservation(o.orderNo, o.h, o.w, o.side, o.caseType, isMoni);
                        window.scrollTo({top:0, behavior:'smooth'});
                      }
                    } : {})}
                    style={{backgroundColor:'#fff', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor:cardBorder, elevation:2}}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                      <View style={{flex:1}}>
                        <Text style={{fontWeight:'bold', fontSize:13}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                        <Text style={{fontSize:12, color:'#555', marginTop:1}}>{o.h}x{o.w} | {o.side}</Text>
                        {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:13,fontWeight:'900',color:'#cc0000'}}>Τεμ: {o.qty}</Text>:null}
                        {o.hardware?<Text style={{fontSize:11, color:'#555'}}>🎨 {o.hardware}</Text>:null}
                        {o.installation==='ΝΑΙ'&&<View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:6,paddingVertical:2,alignSelf:'flex-start',marginTop:2}}><Text style={{color:'white',fontWeight:'bold',fontSize:11}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View>}
                        {o.stavera&&o.stavera.filter(s=>s.dim).length>0&&<Text style={{fontSize:11,color:'#555',marginTop:2}}>📐 Σταθ: {o.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}</Text>}
                        {o.notes?<Text style={{fontSize:11, color:'#888'}}>Σημ: {o.notes}</Text>:null}
                        {o.deliveryDate?<Text style={{fontSize:10, color:'#007AFF'}}>📅 Παράδοση: {o.deliveryDate}</Text>:null}
                        <Text style={{fontSize:10, color:'#999'}}>📋 {fmtDate(o.createdAt)}</Text>
                      </View>
                      <View style={{alignItems:'flex-end', gap:4, marginLeft:8}}>
                        <View style={{flexDirection:'row', gap:4}}>
                          {/* ΚΑΣΑ */}
                          <View style={{alignItems:'center', backgroundColor: hasCase?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: hasCase?'#00C851':'#ff4444', minWidth:44}}>
                            <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΚΑΣΑ</Text>
                            <Text style={{fontSize:14}}>{hasCase?'✅':'❌'}</Text>
                          </View>
                          {/* ΣΑΣΙ */}
                          <View style={{alignItems:'center', backgroundColor: sasiOk?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: sasiOk?'#00C851':'#ff4444', minWidth:44}}>
                            <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΣΑΣΙ</Text>
                            <Text style={{fontSize:14}}>{sasiOk?'✅':'❌'}</Text>
                          </View>
                        </View>

                        {/* ΔΙΑΓΡΑΦΗ */}
                        <TouchableOpacity
                          style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignSelf:'stretch', alignItems:'center'}}
                          onPress={async()=>{
                            if(!window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) return;
                            setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                            await deleteFromCloud(o.id);
                          }}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
                        </TouchableOpacity>

                        {sasiActive ? (<>
                          {/* ΜΟΝΗ: κουμπί ΕΤΟΙΜΗ — μόνο αν δεν έχει μοντάρισμα και υπάρχουν κάσα+σασί */}
                          {o.installation!=='ΝΑΙ' && (
                            <TouchableOpacity
                              disabled={!canMount}
                              style={{backgroundColor: canMount?'#00C851':'#ccc', paddingHorizontal:8, paddingVertical:6, borderRadius:5, alignItems:'center', minWidth:96, opacity:canMount?1:0.5}}
                              onPress={async()=>{
                                if(!canMount) return;
                                const sasiItem = sasiOrders.find(s=>s.status==='READY'&&String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side);
                                const caseModelBtn=(o.caseType||'').includes('ΑΝΟΙΧΤΟΥ')?'ΚΑΣΑ ΑΝΟΙΧΤΗ':'ΚΑΣΑ ΚΛΕΙΣΤΗ';
                const caseItem = caseOrders.find(s=>s.model===caseModelBtn&&s.status==='READY'&&String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side);
                                const doReady = async()=>{
                                  const label = `${o.customer||""}${o.customer?" ":""} #${o.orderNo}`;
                                  const updOrder = {...o, status:"STD_READY", readyAt:Date.now(), reservedSasiId:sasiItem?.id||null, reservedCaseId:caseItem?.id||null};
                                  setCustomOrders(prev=>prev.map(x=>x.id===o.id?updOrder:x));
                                  await syncToCloud(updOrder);
                                  if(sasiItem){const updSasi={...sasiItem,reservedBy:label,reservedOrderNo:o.orderNo,reservedAt:Date.now()};setSasiOrders(prev=>prev.map(s=>s.id===sasiItem.id?updSasi:s));await fetch(`${FIREBASE_URL}/sasi_orders/${sasiItem.id}.json`,{method:"PUT",body:JSON.stringify(updSasi)});}
                                  if(caseItem){const updCase={...caseItem,reservedBy:label,reservedOrderNo:o.orderNo,reservedAt:Date.now()};setCaseOrders(prev=>prev.map(s=>s.id===caseItem.id?updCase:s));await fetch(`${FIREBASE_URL}/case_orders/${caseItem.id}.json`,{method:"PUT",body:JSON.stringify(updCase)});}
                                  await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ','Φάση → ΕΤΟΙΜΟ',{orderNo:o.orderNo,customer:o.customer,size:`${o.h}x${o.w}`});
                                };
                                if(Platform.OS==='web'){
                                  if(window.confirm(`ΕΤΟΙΜΗ\nΠαραγγελία #${o.orderNo}${o.customer?" - "+o.customer:""}\n${o.h}x${o.w} | ${o.side}\n\nΕπιβεβαίωση;`)) await doReady();
                                } else {
                                  setReadyConfirmModal({visible:true, order:o, sasiItem, caseItem});
                                }
                              }}>
                              <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>{canMount?'✅ ΕΤΟΙΜΗ':'⏳ ΑΝΑΜΟΝΗ'}</Text>
                            </TouchableOpacity>
                          )}
                          {/* ΜΟΝΗ: κουμπί ΜΟΝΤΑΡΙΣΜΑ — μόνο αν installation=ΝΑΙ */}
                          {o.installation==='ΝΑΙ' ? (
                          <TouchableOpacity
                            disabled={!canMount}
                            style={{alignItems:'center', backgroundColor: !canMount?'#eee':'#f9f9f9', borderRadius:5, padding:4, borderWidth:1, borderColor: !canMount?'#ccc':'#00C851', minWidth:96, opacity:!canMount?0.5:1}}
                            onPress={()=>{
                              if(!canMount) return;
                              setConfirmModal({
                                visible:true,
                                title:'✅ Μοντάρισμα',
                                message:`Επιβεβαίωση μοντάρίσματος #${o.orderNo};`,
                                confirmText:'ΝΑΙ',
                                onConfirm:async()=>{
                                  const updated = customOrders.map(x=>x.id===o.id?{...x,stdMounted:true,status:'STD_READY'}:x);
                                  setCustomOrders(updated);
                                  await syncToCloud({...o,stdMounted:true,status:'STD_READY'});
                                }
                              });
                            }}>
                            <Text style={{fontSize:9, fontWeight:'bold', color:!canMount?'#aaa':'#1b5e20'}}>ΜΟΝΤΑΡΙΣΜΑ</Text>
                            <Text style={{fontSize:14}}>{canMount?'✅':'☐'}</Text>
                          </TouchableOpacity>
                          ) : null}
                        </>) : null}
                        {!sasiActive && (<>
                          {/* ΔΙΠΛΗ: ΜΟΝΤΑΡΙΣΜΑ indicator */}
                          {o.installation==='ΝΑΙ'&&(
                            <View style={{alignItems:'center', backgroundColor: dipliMontDone?'#e8f5e9':'#f9f9f9', borderRadius:5, padding:4, borderWidth:1, borderColor: dipliMontDone?'#00C851':'#aaa', minWidth:96}}>
                              <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΜΟΝΤΑΡΙΣΜΑ</Text>
                              <Text style={{fontSize:14}}>{dipliMontDone?'✅':'☐'}</Text>
                            </View>
                          )}
                          {/* ΔΙΠΛΗ: κουμπί ΕΝΑΡΞΗ — πάντα ενεργό */}
                          <TouchableOpacity
                            style={{backgroundColor:'#1976D2', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center', minWidth:96}}
                            onPress={()=>{
                              Alert.alert("🔵 Έναρξη Παραγωγής",`Έναρξη παραγωγής για #${o.orderNo};`,[
                                {text:"ΑΚΥΡΟ", style:"cancel"},
                                {text:"ΕΝΑΡΞΗ", onPress:()=>handleDipliStart(o)}
                              ]);
                            }}>
                            <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>▶ ΕΝΑΡΞΗ</Text>
                          </TouchableOpacity>
                        </>)}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              };

              // Κάρτα ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ
              const renderReadyCard = (o) => (
                <View key={o.id} style={{backgroundColor:'#e8f5e9', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor:'#00C851', elevation:2}}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <View style={{flex:1}}>
                      <Text style={{fontWeight:'bold', fontSize:13}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                      <Text style={{fontSize:12, color:'#555', marginTop:1}}>{o.h}x{o.w} | {o.side}</Text>
                      {o.notes?<Text style={{fontSize:11, color:'#888'}}>Σημ: {o.notes}</Text>:null}
                      {o.deliveryDate?<Text style={{fontSize:10, color:'#007AFF'}}>📅 Παράδοση: {o.deliveryDate}</Text>:null}
                      {/* BADGES: ΜΟΝΤΑΡΙΣΜΕΝΗ + ΣΤΑΘΕΡΑ */}
                      <View style={{flexDirection:'row', flexWrap:'wrap', gap:4, marginTop:4}}>
                        {o.stdMounted&&<View style={{backgroundColor:'#1565C0', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}><Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🔧 ΜΟΝΤΑΡΙΣΜΕΝΗ</Text></View>}
                        {(o.stavera&&o.stavera.length>0&&!o.staveraDone)&&<View style={{backgroundColor:'#c62828', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}><Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🔴 ΑΝΑΜΟΝΗ ΓΙΑ ΣΤΑΘΕΡΟ</Text></View>}
                        {(o.stavera&&o.stavera.length>0&&o.staveraDone)&&<View style={{backgroundColor:'#2e7d32', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}><Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🟢 ΣΤΑΘΕΡΑ</Text></View>}
                      </View>
                    </View>
                    <View style={{gap:4, marginLeft:8}}>
                      <TouchableOpacity
                        style={{backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                        onPress={()=>{
                          if(o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'){
                            setConfirmModal({
                              visible:true,
                              title:'Επιστροφή στην Παραγωγή',
                              message:'Η παραγγελία θα επιστρέψει στην παραγωγή.',
                              confirmText:'ΝΑΙ',
                              onConfirm:async()=>{
                                const firstActiveKey = ['laser','montSasi','montDoor'].find(k=>o.dipliPhases?.[k]?.active);
                                const newPhases = firstActiveKey ? {...o.dipliPhases, [firstActiveKey]:{...o.dipliPhases[firstActiveKey], done:false}} : o.dipliPhases;
                                const upd = {...o, status:'DIPLI_PROD', dipliPhases:newPhases};
                                setCustomOrders(prev=>prev.map(x=>x.id===o.id?upd:x));
                                await syncToCloud(upd);
                              }
                            });
                          } else if(o.installation==='NAI'){
                            setConfirmModal({
                              visible:true,
                              title:'Επιστροφή στο μοντάρισμα',
                              message:'Η παραγγελία θα επιστρέψει στο μοντάρισμα.',
                              confirmText:'ΝΑΙ',
                              onConfirm:async()=>{
                                const moniPhases = {laser:{active:false,done:false,printHistory:[]},montSasi:{active:false,done:false,printHistory:[]},montDoor:{active:true,done:false,printHistory:[]}};
                                const upd = {...o, stdMounted:false, status:'MONI_PROD', moniPhases};
                                setCustomOrders(prev=>prev.map(x=>x.id===o.id?upd:x));
                                await syncToCloud(upd);
                              }
                            });
                          } else {
                            setConfirmModal({
                              visible:true,
                              title:'Επιστροφή στις καταχωρημένες',
                              message:'Η παραγγελία θα επιστρέψει στις καταχωρημένες.',
                              confirmText:'ΝΑΙ',
                              onConfirm:async()=>{
                                const upd = {...o, status:'STD_PENDING', readyAt:null};
                                setCustomOrders(prev=>prev.map(x=>x.id===o.id?upd:x));
                                await syncToCloud(upd);
                              }
                            });
                          }
                        }}>
                        <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>ΠΙΣΩ</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{backgroundColor:'#555', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                        onPress={async()=>{
                          const doSell = async()=>{
                            const now = Date.now();
                            const updated = customOrders.map(x=>x.id===o.id?{...x,status:'STD_SOLD',soldAt:now}:x);
                            setCustomOrders(updated);
                            await syncToCloud({...o,status:'STD_SOLD',soldAt:now});
                            // Αφαίρεση δέσμευσης + qty από νέο stock
                            const isMoni = (o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType) && !o.lock;
                            const orderQty = parseInt(o.qty)||1;
                            const sk = sasiKey(String(o.h), String(o.w), o.side);
                            const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                            if (isMoni && setSasiStock && sasiStock[sk]) {
                              const entry = sasiStock[sk];
                              const newRes = (entry.reservations||[]).filter(r=>r.orderNo!==o.orderNo);
                              const newQty = Math.max(0, (parseInt(entry.qty)||0) - orderQty);
                              const upd = {...entry, qty: newQty, reservations: newRes};
                              setSasiStock(prev=>({...prev, [sk]: upd}));
                              await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`,{method:'PUT',body:JSON.stringify(upd)});
                            }
                            if (setCaseStock && caseStock[ck]) {
                              const entry = caseStock[ck];
                              const newRes = (entry.reservations||[]).filter(r=>r.orderNo!==o.orderNo);
                              const newQty = Math.max(0, (parseInt(entry.qty)||0) - orderQty);
                              const upd = {...entry, qty: newQty, reservations: newRes};
                              setCaseStock(prev=>({...prev, [ck]: upd}));
                              await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`,{method:'PUT',body:JSON.stringify(upd)});
                            }
                          };
                          if(Platform.OS==='web'){
                            if(window.confirm(`ΠΩΛΗΣΗ\nΠαραγγελία #${o.orderNo}${o.customer?' - '+o.customer:''}\nΕπιβεβαίωση;`)) await doSell();
                          } else {
                            Alert.alert('📦 Πώληση',`Παραγγελία #${o.orderNo} πωλήθηκε;`,[{text:'ΑΚΥΡΟ',style:'cancel'},{text:'ΝΑΙ',onPress:doSell}]);
                          }
                        }}>
                        <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>💰 ΠΩΛΗΣΗ</Text>
                      </TouchableOpacity>

                      {/* ΑΚΥΡΩΣΗ — για ΔΙΠΛΗ ή ΜΟΝΗ με κλειδαριά */}
                      {(o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' || ((o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType) && o.lock)) && (
                        <TouchableOpacity
                          style={{backgroundColor:'#c62828', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                          onPress={()=>Alert.alert("❌ ΑΚΥΡΩΣΗ","Ακύρωση παραγγελίας;\n\n• Η κάσα ξεδεσμεύεται\n• Το σασί πηγαίνει στο ΑΠΟΘΕΜΑ ΣΑΣΙ",[
                            {text:"ΟΧΙ", style:"cancel"},
                            {text:"ΝΑΙ", style:"destructive", onPress:async()=>{
                              const customer = o.customer || `#${o.orderNo}`;
                              const orderQty = parseInt(o.qty)||1;

                              // 1. Διαγράφω παραγγελία
                              setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                              await deleteFromCloud(o.id);

                              // 2. Ξεδεσμεύω κάσα
                              const removeRes = async (stockOrders, setStockOrders, firebasePath) => {
                                const sameSize = s => String(s.selectedHeight)===String(o.h) && String(s.selectedWidth)===String(o.w) && s.side===o.side;
                                let target = stockOrders.find(s=>sameSize(s)&&s.autoNote&&s.autoNote.includes(customer));
                                if (!target) target = stockOrders.find(s=>sameSize(s)&&s.status!=='SOLD');
                                if (!target) return;
                                const customerMap = {};
                                if (target.autoNote) {
                                  target.autoNote.split(',').forEach(entry => {
                                    const match = entry.trim().match(/^(.+)\s+\((\d+)τεμ\)$/);
                                    if (match) customerMap[match[1].trim()] = (customerMap[match[1].trim()]||0) + parseInt(match[2]);
                                  });
                                }
                                if (customerMap[customer]) { customerMap[customer] -= orderQty; if (customerMap[customer]<=0) delete customerMap[customer]; }
                                const newNote = Object.entries(customerMap).map(([n,q])=>`${n} (${q}τεμ)`).join(', ');
                                const hasRes = newNote.trim().length > 0;
                                const upd = {...target, autoNote: newNote, isAuto: hasRes};
                                setStockOrders(prev=>prev.map(s=>s.id===target.id?upd:s));
                                await fetch(`${FIREBASE_URL}/${firebasePath}/${upd.id}.json`,{method:'PUT',body:JSON.stringify(upd)});
                              };
                              // Αφαίρεση δέσμευσης κάσας από νέο stock
                              if (setCaseStock && caseStock[caseKey(String(o.h),String(o.w),o.side,o.caseType)]) {
                                const ckAk = caseKey(String(o.h),String(o.w),o.side,o.caseType);
                                const entryAk = {...caseStock[ckAk], reservations:(caseStock[ckAk].reservations||[]).filter(r=>r.orderNo!==o.orderNo)};
                                setCaseStock(prev=>({...prev,[ckAk]:entryAk}));
                                await fetch(`${FIREBASE_URL}/case_stock/${ckAk}.json`,{method:'PUT',body:JSON.stringify(entryAk)});
                              }

                              // 3. Σασί → ΑΠΟΘΕΜΑ ΣΑΣΙ
                              if (setDipliSasiStock) {
                                const sasiEntry = {
                                  id: `dsasi_${Date.now()}`,
                                  h: o.h, w: o.w, side: o.side,
                                  sasiType: o.sasiType||'ΜΟΝΗ ΘΩΡΑΚΙΣΗ',
                                  hardware: o.hardware||'', hardwareColor: o.hardwareColor||'',
                                  lock: o.lock||'',
                                  coating: o.coating||'', notes: o.notes||'',
                                  orderNo: o.orderNo, customer: o.customer||'',
                                  createdAt: Date.now(),
                                  reservedBy: null, reservedOrderNo: null
                                };
                                setDipliSasiStock(prev=>[sasiEntry,...prev]);
                                await fetch(`${FIREBASE_URL}/dipli_sasi_stock/${sasiEntry.id}.json`,{method:'PUT',body:JSON.stringify(sasiEntry)});
                              }
                            }}
                          ])}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>❌ ΑΚΥΡΩΣΗ</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );

              // Κάρτα ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ
              const renderSoldCard = (o) => (
                <View key={o.id} style={{backgroundColor:'#f5f5f5', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor:'#888', elevation:1}}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <View style={{flex:1}}>
                      <Text style={{fontWeight:'bold', fontSize:13, color:'#555'}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                      <Text style={{fontSize:12, color:'#888', marginTop:1}}>{o.h}x{o.w} | {o.side}</Text>
                      {o.notes?<Text style={{fontSize:11, color:'#aaa'}}>Σημ: {o.notes}</Text>:null}
                      {o.soldAt?<Text style={{fontSize:10, color:'#999'}}>📦 {fmtDate(o.soldAt)}</Text>:null}
                    </View>
                    <TouchableOpacity
                      style={{backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center', marginLeft:8}}
                      onPress={async()=>{
                        const updated = customOrders.map(x=>x.id===o.id?{...x,status:'STD_READY',soldAt:null}:x);
                        setCustomOrders(updated);
                        await syncToCloud({...o,status:'STD_READY',soldAt:null});

                        // Ξαναδέσμευση στο νέο stock
                        const isMoni11 = (o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType) && !o.lock;
                        await removeStockReservation(o.orderNo, o.h, o.w, o.side, o.caseType, isMoni11);
                        // Ξαναδεσμεύω
                        const orderQty11 = parseInt(o.qty)||1;
                        const newRes11 = { orderNo: o.orderNo, customer: o.customer||'', qty: orderQty11 };
                        const sk11 = sasiKey(String(o.h), String(o.w), o.side);
                        const ck11 = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                        if (isMoni11 && setSasiStock && sasiStock[sk11]) {
                          const upd = {...sasiStock[sk11], reservations:[...(sasiStock[sk11].reservations||[]), newRes11]};
                          setSasiStock(prev=>({...prev,[sk11]:upd}));
                          await fetch(`${FIREBASE_URL}/sasi_stock/${sk11}.json`,{method:'PUT',body:JSON.stringify(upd)});
                        }
                        if (setCaseStock && caseStock[ck11]) {
                          const upd = {...caseStock[ck11], reservations:[...(caseStock[ck11].reservations||[]), newRes11]};
                          setCaseStock(prev=>({...prev,[ck11]:upd}));
                          await fetch(`${FIREBASE_URL}/case_stock/${ck11}.json`,{method:'PUT',body:JSON.stringify(upd)});
                        }
                      }}>
                      <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΠΙΣΩ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );

              const sasiReady = sasiOrders.filter(o=>o.status==='READY');
              const caseReady = caseOrders.filter(o=>o.status==='READY');

              // Φιλτράρω ανά status
              const moniOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&((o.status==='STD_PENDING'||!o.status)||(o.status==='STD_READY'&&o.staveraPendingAtReady))).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const moniProdOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='MONI_PROD').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const staveraTabOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.stavera&&o.stavera.filter(s=>s.dim).length>0&&(o.status==='STD_PENDING'||o.status==='MONI_PROD'||(o.status==='STD_READY'&&o.staveraPendingAtReady))&&!o.staveraDone).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const montageTabOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&!o.lock&&o.installation==='ΝΑΙ'&&o.stdInProd&&!o.stdMontDone).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const dipliOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&(o.status==='STD_PENDING'||!o.status||o.status==='PENDING')).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const readyOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_READY').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const soldOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_SOLD').sort((a,b)=>(b.soldAt||0)-(a.soldAt||0));
              const dipliReadyOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_READY').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const dipliSoldOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_SOLD').sort((a,b)=>(b.soldAt||0)-(a.soldAt||0));

              // ΜΟΝΗ — έλεγχος με βάση reservations[]
              const moniCards = moniOrders.map(o=>{
                const sk = sasiKey(String(o.h), String(o.w), o.side);
                const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                // ✅ μόνο αν υπάρχει φυσικό διαθέσιμο απόθεμα (qty > reservations)
                const hasSasi = stockAvailable(sasiStock, sk) > 0 || (sasiStock[sk]?.reservations||[]).some(r=>r.orderNo===o.orderNo);
                const hasCase = stockAvailable(caseStock, ck) > 0 || (caseStock[ck]?.reservations||[]).some(r=>r.orderNo===o.orderNo);
                return renderStdCard(o, hasSasi, hasCase, true);
              });

              // ΔΙΠΛΗ — έλεγχος με νέο stock
              const dipliCards = dipliOrders.map(o=>{
                const ckD = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                const hasCase = stockAvailable(caseStock, ckD) > 0 || (caseStock[ckD]?.reservations||[]).some(r=>r.orderNo===o.orderNo);
                return renderStdCard(o, false, hasCase, false);
              });

              return (<>
                {/* TABS ΜΟΝΗ / ΔΙΠΛΗ */}
                <View style={{flexDirection:'row', marginTop:8, marginBottom:4}}>
                  <TouchableOpacity
                    style={{flex:1, padding:12, alignItems:'center', borderRadius:8, marginRight:4, backgroundColor: stdTab==='ΜΟΝΗ'?'#5c6bc0':'#e0e0e0'}}
                    onPress={()=>stdTab==='ΜΟΝΗ'?toggleSection('stdMoniOpen'):setStdTab('ΜΟΝΗ')}>
                    <Text style={{fontWeight:'bold', color: stdTab==='ΜΟΝΗ'?'white':'#555'}}>
                      ΜΟΝΗ ΘΩΡΑΚΙΣΗ ({moniOrders.length}) {stdTab==='ΜΟΝΗ'?(expanded.stdMoniOpen?'▲':'▼'):''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{flex:1, padding:12, alignItems:'center', borderRadius:8, marginLeft:4, backgroundColor: stdTab==='ΔΙΠΛΗ'?'#8B0000':'#e0e0e0'}}
                    onPress={()=>stdTab==='ΔΙΠΛΗ'?toggleSection('stdDipliOpen'):setStdTab('ΔΙΠΛΗ')}>
                    <Text style={{fontWeight:'bold', color: stdTab==='ΔΙΠΛΗ'?'white':'#555'}}>
                      ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ ({dipliOrders.length}) {stdTab==='ΔΙΠΛΗ'?(expanded.stdDipliOpen?'▲':'▼'):''}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΠΑΡΑΓΓΕΛΙΕΣ */}
                {stdTab==='ΜΟΝΗ'&&expanded.stdMoniOpen&&(<>
                  {/* Header παραγγελιών με εκτύπωση */}
                  <View style={[styles.listHeader,{backgroundColor:'#5c6bc0', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}>
                    <Text style={styles.listHeaderText}>● ΠΑΡΑΓΓΕΛΙΕΣ ({moniOrders.length})</Text>
                    <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
                      onPress={()=>handleStdPrint(moniOrders,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΠΑΡΑΓΓΕΛΙΕΣ',caseReady,sasiReady)}>
                      <Text style={{color:'#5c6bc0', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                    </TouchableOpacity>
                  </View>
                  {moniCards.length>0?moniCards:
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν παραγγελίες μονής θωράκισης</Text>
                  }

                  {/* ΠΑΡΑΓΓΕΛΙΕΣ ΠΡΟΣ ΠΑΡΑΓΩΓΗ — ΜΟΝΗ */}
                  {moniProdOrders.length>0&&(<>
                    {/* HEADER με 3 κουμπιά εκτύπωσης */}
                    <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#1565C0', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('moniProd')}>
                      <Text style={styles.listHeaderText}>🔵 ΠΑΡΑΓΓΕΛΙΕΣ ΠΡΟΣ ΠΑΡΑΓΩΓΗ ({moniProdOrders.length})</Text>
                      <Text style={{color:'white'}}>{expanded.moniProd?'▲':'▼'}</Text>
                    </TouchableOpacity>
                    {expanded.moniProd&&(
                      <View style={{flexDirection:'row', gap:6, marginBottom:6, marginTop:4, justifyContent:'flex-start'}}>
                        <TouchableOpacity
                          style={{width:'15%', backgroundColor:'#1565C0', paddingHorizontal:6, paddingVertical:10, borderRadius:8, alignItems:'center'}}
                          onPress={()=>handleStdPrint(moniProdOrders,'ΜΟΝΗ — ΠΑΡΑΓΓΕΛΙΕΣ ΠΡΟΣ ΠΑΡΑΓΩΓΗ',caseReady,sasiReady)}>
                          <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>🖨️</Text>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold', marginTop:2}}>ΟΛΕΣ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{width:'15%', backgroundColor:'#2e7d32', paddingHorizontal:6, paddingVertical:10, borderRadius:8, alignItems:'center'}}
                          onPress={()=>{
                            const checked = moniProdOrders.filter(o=>o.moniGivenToProd);
                            if(checked.length===0) return Alert.alert("Προσοχή","Δεν υπάρχουν τσεκαρισμένες παραγγελίες.");
                            handleStdPrint(checked,'ΜΟΝΗ — ΤΣΕΚΑΡΙΣΜΕΝΕΣ ΠΡΟΣ ΠΑΡΑΓΩΓΗ',caseReady,sasiReady);
                          }}>
                          <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>🖨️</Text>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold', marginTop:2}}>ΤΣΕΚ ✅</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{width:'15%', backgroundColor:'#c62828', paddingHorizontal:6, paddingVertical:10, borderRadius:8, alignItems:'center'}}
                          onPress={()=>{
                            const unchecked = moniProdOrders.filter(o=>!o.moniGivenToProd);
                            if(unchecked.length===0) return Alert.alert("Προσοχή","Δεν υπάρχουν ατσεκάριστες παραγγελίες.");
                            handleStdPrint(unchecked,'ΜΟΝΗ — ΑΤΣΕΚΑΡΙΣΤΕΣ ΠΡΟΣ ΠΑΡΑΓΩΓΗ',caseReady,sasiReady);
                          }}>
                          <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>🖨️</Text>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold', marginTop:2}}>ΑΤΣΕΚ ☐</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {/* TABS — ΚΑΤ.ΣΑΣΙ, ΜΟΝΤ., ΣΤΑΘΕΡΑ */}
                    {expanded.moniProd&&(
                      <View style={{flexDirection:'row', marginBottom:6, marginTop:2}}>
                        {['montSasi','montDoor','stavera'].map(key=>{
                          const label = key==='montSasi'?'🔵 ΚΑΤ.ΣΑΣΙ':key==='montDoor'?'🟢 ΜΟΝΤ.':'📏 ΣΤΑΘΕΡΑ';
                          const tabOrders = key==='stavera'
                            ? staveraTabOrders
                            : key==='montDoor'
                              ? [...montageTabOrders, ...moniProdOrders.filter(o=>o.moniPhases?.[key]?.active)]
                              : moniProdOrders.filter(o=>o.moniPhases?.[key]?.active);
                          return (
                            <TouchableOpacity key={key}
                              style={{flex:1, padding:8, alignItems:'center', borderRadius:6, marginHorizontal:2, backgroundColor: moniProdTab===key?'#1565C0':'#e0e0e0'}}
                              onPress={()=>setMoniProdTab(key)}>
                              <Text style={{fontSize:11, fontWeight:'bold', color: moniProdTab===key?'white':'#555'}}>{label} ({tabOrders.length})</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    {/* ΚΑΡΤΕΣ */}
                    {/* TAB ΣΤΑΘΕΡΑ */}
                    {expanded.moniProd&&moniProdTab==='stavera'&&(()=>{
                      const staveraOrders = staveraTabOrders;
                      return (<>
                        <TouchableOpacity
                          style={{backgroundColor:'#7b1fa2', paddingHorizontal:10, paddingVertical:7, borderRadius:6, alignSelf:'flex-start', marginBottom:8}}
                          onPress={()=>{
                            const today = new Date();
                            const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
                            const rows = staveraOrders.flatMap(o=>
                              (o.stavera||[]).map(s=>`<tr>
                                <td style="font-weight:bold">${o.orderNo||'—'}</td>
                                <td>${o.customer||'—'}</td>
                                <td style="font-weight:bold;font-size:14px">${s.dim||'—'}</td>
                                <td style="min-width:200px">${s.note||''}</td>
                              </tr>`)
                            ).join('');
                            const html = `<html><head><meta charset="utf-8"><style>
                              body{font-family:Arial,sans-serif;margin:8mm;}
                              h1{font-size:14px;font-weight:bold;margin-bottom:2px;}
                              h2{font-size:11px;color:#555;margin-bottom:10px;}
                              table{width:100%;border-collapse:collapse;font-size:11px;}
                              th{padding:6px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;}
                              td{padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top;}
                              @media print{@page{size:A4 landscape;margin:8mm;}}
                            </style></head><body>
                              <h1>📏 ΣΤΑΘΕΡΑ — ΜΟΝΗ ΘΩΡΑΚΙΣΗ</h1>
                              <h2>📅 ${dateStr} | ${staveraOrders.length} παραγγελίες</h2>
                              <table><thead><tr><th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>Παρατήρηση</th></tr></thead>
                              <tbody>${rows}</tbody></table>
                            </body></html>`;
                            printHTML(html, 'ΣΤΑΘΕΡΑ — ΜΟΝΗ');
                          }}>
                          <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ ΣΤΑΘΕΡΩΝ</Text>
                        </TouchableOpacity>
                        {staveraOrders.length===0?(
                          <Text style={{textAlign:'center',color:'#999',padding:16}}>Δεν υπάρχουν παραγγελίες με σταθερά</Text>
                        ):staveraOrders.map(o=>{
                          const isGiven = !!o.staveraGiven;
                          return (
                          <View key={o.id} style={{backgroundColor: o.staveraDone?'#e8f5e9': isGiven?'#ede7f6':'#f3e5f5', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:4, borderLeftColor: o.staveraDone?'#00C851': isGiven?'#4a148c':'#7b1fa2', elevation:1, flexDirection:'row', alignItems:'flex-start'}}>
                            {/* CHECKBOX */}
                            <TouchableOpacity
                              style={{marginRight:10, marginTop:2}}
                              onPress={()=>{
                                Alert.alert(isGiven?'☐ Ξετσεκάρισμα':'✅ Επιβεβαίωση',
                                  isGiven?`Ξετσεκάρισμα σταθερών #${o.orderNo};`:`Τα σταθερά της #${o.orderNo} δόθηκαν για παραγωγή;`,
                                  [{text:'ΑΚΥΡΟ',style:'cancel'},{text:'ΝΑΙ',onPress:async()=>{
                                    const upd={...o,staveraGiven:!isGiven};
                                    setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                    await syncToCloud(upd);
                                  }}]);
                              }}>
                              <View style={{width:28,height:28,borderRadius:6,borderWidth:2,borderColor:isGiven?'#4a148c':'#7b1fa2',backgroundColor:isGiven?'#4a148c':'white',alignItems:'center',justifyContent:'center'}}>
                                {isGiven&&<Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✓</Text>}
                              </View>
                            </TouchableOpacity>
                            <View style={{flex:1}}>
                              <Text style={{fontWeight:'bold', fontSize:13, marginBottom:4}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                              <Text style={{fontSize:12, color:'#555', marginBottom:6}}>{o.h}x{o.w} | {o.side}</Text>
                              {(o.stavera||[]).map((s,i)=>(
                                <View key={i} style={{backgroundColor:'white', borderRadius:6, padding:8, marginBottom:4, borderLeftWidth:2, borderLeftColor:'#ce93d8'}}>
                                  <Text style={{fontWeight:'bold', fontSize:13, color:'#4a148c'}}>📐 {s.dim||'—'}</Text>
                                  {s.note?<Text style={{fontSize:12, color:'#555', marginTop:2}}>{s.note}</Text>:null}
                                </View>
                              ))}
                              {o.staveraDone&&<Text style={{fontSize:11,color:'#00796B',fontWeight:'bold',marginTop:2}}>✅ Ολοκληρώθηκαν</Text>}
                            </View>
                            {/* DONE + ΠΙΣΩ */}
                            <View style={{justifyContent:'space-between', gap:6, marginLeft:8, paddingVertical:2}}>
                              <TouchableOpacity
                                style={[styles.doneBtn, o.staveraDone&&styles.doneBtnActive]}
                                onPress={async()=>{
                                  const newDone = !o.staveraDone;
                                  const upd={...o, staveraDone:newDone, ...(newDone && {staveraPendingAtReady:false})};
                                  setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                  await syncToCloud(upd);
                                }}>
                                <Text style={styles.doneBtnTxt}>{o.staveraDone?'↩️ UNDO':'✓ DONE'}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{backgroundColor:'#ff9800', paddingHorizontal:6, paddingVertical:6, borderRadius:6, alignItems:'center'}}
                                onPress={()=>Alert.alert("↩ Επιστροφή",`Επιστροφή σταθερών #${o.orderNo};`,[
                                  {text:"ΑΚΥΡΟ",style:"cancel"},
                                  {text:"ΝΑΙ",onPress:async()=>{
                                    const upd={...o,staveraGiven:false,staveraDone:false};
                                    setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                    await syncToCloud(upd);
                                  }}
                                ])}>
                                <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΠΙΣΩ</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          );
                        })}
                      </>);
                    })()}

                    {expanded.moniProd&&moniProdTab!=='stavera'&&moniProdOrders.filter(o=>o.moniPhases?.[moniProdTab]?.active).map(o=>{
                      const phase = o.moniPhases?.[moniProdTab];
                      if(!phase) return null;
                      const caseStk=caseReady.filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
                      const caseOk = caseStk > 0;
                      const isGiven = !!o.moniGivenToProd;
                      return (
                        <View key={o.id} style={{backgroundColor: phase.done?'#e8f5e9': isGiven?'#e3f2fd':'#fff3e0', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:4, borderLeftColor: phase.done?'#00C851': isGiven?'#42a5f5':'#1565C0', elevation:1, flexDirection:'row', alignItems:'flex-start'}}>

                          {/* CHECKBOX ΑΡΙΣΤΕΡΑ */}
                          <TouchableOpacity
                            style={{marginRight:10, marginTop:2}}
                            onPress={()=>{
                              const msg = isGiven
                                ? `Ξετσεκάρισμα παραγγελίας #${o.orderNo};\n\nΣημαίνει ΔΕΝ έχει δοθεί για παραγωγή.`
                                : `Επιβεβαίωση παραγγελίας #${o.orderNo};\n\nΣημαίνει έχει δοθεί για παραγωγή.`;
                              Alert.alert(isGiven?'☐ Ξετσεκάρισμα':'✅ Επιβεβαίωση', msg, [
                                {text:'ΑΚΥΡΟ', style:'cancel'},
                                {text: isGiven?'ΝΑΙ, ΞΕΤΣΕΚΑΡΙΣΜΑ':'ΝΑΙ, ΔΟΘΗΚΕ', onPress:async()=>{
                                  const upd = {...o, moniGivenToProd: !isGiven};
                                  setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                  await syncToCloud(upd);
                                }}
                              ]);
                            }}>
                            <View style={{width:28, height:28, borderRadius:6, borderWidth:2, borderColor: isGiven?'#2e7d32':'#1565C0', backgroundColor: isGiven?'#2e7d32':'white', alignItems:'center', justifyContent:'center'}}>
                              {isGiven&&<Text style={{color:'white', fontWeight:'bold', fontSize:14}}>✓</Text>}
                            </View>
                          </TouchableOpacity>

                          {/* ΣΤΟΙΧΕΙΑ ΠΑΡΑΓΓΕΛΙΑΣ */}
                          <View style={{flex:1}}>
                            <Text style={{fontWeight:'bold', fontSize:13}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                            <Text style={{fontSize:12, color:'#555', marginTop:1}}>{o.h}x{o.w} | {o.side}</Text>
                            {o.sasiType?<Text style={{fontSize:11, color:'#555'}}>🛡️ {o.sasiType}</Text>:null}
                            {o.lock?<Text style={{fontSize:11, color:'#555'}}>🔑 {o.lock}</Text>:null}
                            {o.heightReduction?<Text style={{fontSize:12, color:'#b71c1c', fontWeight:'bold'}}>📏 ΜΕΙΩΣΗ ΥΨΟΥΣ: {o.heightReduction} cm</Text>:null}
                            {o.hardware?<Text style={{fontSize:11, color:'#555'}}>🔩 {o.hardware}</Text>:null}
                            {o.caseType?<Text style={{fontSize:11, color:'#555'}}>📦 {o.caseType} {o.caseMaterial?`| ${o.caseMaterial}`:''}</Text>:null}
                            {o.coatings&&o.coatings.length>0?<Text style={{fontSize:11, color:'#007AFF'}}>🎨 {o.coatings.join(', ')}</Text>:null}
                            {o.installation==='ΝΑΙ'?<Text style={{fontSize:11, color:'#555'}}>🔧 Μοντάρισμα: ΝΑΙ</Text>:null}
                            {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:11, color:'#1565C0', fontWeight:'bold'}}>Τεμ: {o.qty}</Text>:null}
                            {o.notes?<Text style={{fontSize:11, color:'#888'}}>📝 {o.notes}</Text>:null}
                            {o.deliveryDate?<Text style={{fontSize:10, color:'#007AFF'}}>📅 Παράδοση: {o.deliveryDate}</Text>:null}
                            {/* Badge για μοντάρισμα χωρίς κλειδαριά */}
                            {(!o.lock && o.installation==='ΝΑΙ')&&<View style={{backgroundColor:'#e3f2fd', borderRadius:4, paddingHorizontal:6, paddingVertical:3, marginTop:4, alignSelf:'flex-start'}}><Text style={{color:'#1565C0', fontWeight:'bold', fontSize:11}}>📦 ΣΑΣΙ + ΚΑΣΑ ΑΠΟ STOCK</Text></View>}
                            <View style={{flexDirection:'row', alignItems:'center', marginTop:4, gap:4}}>
                              <View style={{backgroundColor: caseOk?'#e8f5e9':'#ffeaea', borderRadius:4, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor: caseOk?'#00C851':'#ff4444'}}>
                                <Text style={{fontSize:10, fontWeight:'bold', color: caseOk?'#155724':'#721c24'}}>ΚΑΣΑ {caseOk?'✅':'❌'}</Text>
                              </View>
                              {isGiven&&<View style={{backgroundColor:'#e3f2fd', borderRadius:4, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor:'#42a5f5'}}>
                                <Text style={{fontSize:10, fontWeight:'bold', color:'#1565C0'}}>✅ ΔΟΘΗΚΕ</Text>
                              </View>}
                            </View>
                            {phase.done&&<Text style={{fontSize:11, color:'#00796B', fontWeight:'bold', marginTop:2}}>✅ Ολοκληρώθηκε</Text>}
                          </View>

                          {/* ΚΟΥΜΠΙΑ ΔΕΞΙΑ */}
                          <View style={{justifyContent:'space-between', gap:6, marginLeft:8, paddingVertical:2}}>
                            <TouchableOpacity
                              style={[styles.doneBtn, phase.done&&styles.doneBtnActive]}
                              onPress={async()=>{
                                const newPhases = {...o.moniPhases, [moniProdTab]:{...phase, done:!phase.done}};
                                const upd = {...o, moniPhases:newPhases};
                                setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                await syncToCloud(upd);
                              }}>
                              <Text style={styles.doneBtnTxt}>{phase.done?'↩️ UNDO':'✓ DONE'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{backgroundColor:'#ff9800', paddingHorizontal:6, paddingVertical:6, borderRadius:6, alignItems:'center'}}
                              onPress={()=>{
                                if(!o.lock && o.installation==='ΝΑΙ'){
                                  // Χωρίς κλειδαριά — επιλογή διόρθωσης ή διαγραφής
                                  Alert.alert("↩ Επιστροφή",`Τι θέλεις να κάνεις με την #${o.orderNo};`,[
                                    {text:"ΑΚΥΡΟ", style:"cancel"},
                                    {text:"✏️ ΔΙΟΡΘΩΣΗ", onPress:()=>{
                                      setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                                      setCustomForm({...o});
                                      setOrderType(o.orderType||'ΤΥΠΟΠΟΙΗΜΕΝΗ');
                                      setEditingOrder(o);
                                      syncToCloud({...o, status:'EDITING'});
                                    }},
                                    {text:"🗑️ ΔΙΑΓΡΑΦΗ", style:"destructive", onPress:async()=>{
                                      Alert.alert("🗑️ Επιβεβαίωση","Σίγουρα διαγραφή της #"+o.orderNo+";",[
                                        {text:"ΑΚΥΡΟ", style:"cancel"},
                                        {text:"ΔΙΑΓΡΑΦΗ", style:"destructive", onPress:async()=>{
                                          setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                                          await fetch(`${FIREBASE_URL}/custom_orders/${o.id}.json`,{method:'DELETE'});
                                        }}
                                      ]);
                                    }}
                                  ]);
                                } else {
                                  Alert.alert("↩ Επιστροφή",`Επιστροφή της #${o.orderNo} στις παραγγελίες;`,[
                                    {text:"ΑΚΥΡΟ", style:"cancel"},
                                    {text:"ΝΑΙ", onPress:async()=>{
                                      const upd = {...o, status:'STD_PENDING', moniPhases:null, moniGivenToProd:false};
                                      setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                      await syncToCloud(upd);
                                    }}
                                  ]);
                                }
                              }}>
                              <Text style={{color:'white', fontSize:10, fontWeight:'bold', textAlign:'center'}}>↩ ΠΙΣΩ</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                    {/* ΜΟΝΤΑΡΙΣΜΑ: παραγγελίες χωρίς κλειδαριά που περιμένουν μοντάρισμα */}
                    {expanded.moniProd&&moniProdTab==='montDoor'&&montageTabOrders.map(o=>{
                      const hasStaveraO = o.stavera&&o.stavera.filter(s=>s.dim).length>0;
                      return (
                        <View key={o.id} style={{backgroundColor:'#f3e5f5', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:4, borderLeftColor:'#7b1fa2', elevation:1}}>
                          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                            <View style={{flex:1}}>
                              <Text style={{fontWeight:'bold', fontSize:13}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                              <Text style={{fontSize:12, color:'#555', marginTop:1}}>{o.h}x{o.w} | {o.side}</Text>
                              {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:12,fontWeight:'bold',color:'#cc0000'}}>Τεμ: {o.qty}</Text>:null}
                              {o.hardware?<Text style={{fontSize:11,color:'#555'}}>🎨 {o.hardware}</Text>:null}
                              {hasStaveraO&&<View style={{backgroundColor:'#E65100',borderRadius:4,paddingHorizontal:6,paddingVertical:2,alignSelf:'flex-start',marginTop:3}}><Text style={{color:'white',fontWeight:'bold',fontSize:10}}>⏳ ΕΚΚΡΕΜΕΙ ΣΤΑΘΕΡΟ</Text></View>}
                              {o.deliveryDate?<Text style={{fontSize:10,color:'#007AFF',marginTop:2}}>📅 {o.deliveryDate}</Text>:null}
                            </View>
                            <TouchableOpacity
                              style={{backgroundColor:'#00C851',paddingHorizontal:10,paddingVertical:6,borderRadius:6,alignItems:'center',minWidth:70}}
                              onPress={()=>setConfirmModal({
                                visible:true,
                                title:'✅ Μοντάρισμα',
                                message:`Ολοκλήρωση μοντάρίσματος #${o.orderNo};`,
                                confirmText:'ΝΑΙ',
                                onConfirm:async()=>{
                                  const upd = {...o, stdMontDone:true, status:'STD_READY', readyAt:Date.now(), ...(hasStaveraO?{staveraPendingAtReady:true}:{})};
                                  setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                  await syncToCloud(upd);
                                }
                              })}>
                              <Text style={{color:'white',fontWeight:'bold',fontSize:11}}>✓ DONE</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                    {expanded.moniProd&&moniProdTab!=='stavera'&&moniProdOrders.filter(o=>o.moniPhases?.[moniProdTab]?.active).length===0&&montageTabOrders.length===0&&(
                      <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν παραγγελίες σε αυτή τη φάση</Text>
                    )}
                  </>)}
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#00796B', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('stdReady')}>
                    <Text style={styles.listHeaderText}>📦 ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ ({readyOrders.length})</Text>
                    <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                      {expanded.stdReady&&<TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                        onPress={()=>handleStdPrint(readyOrders,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ',caseReady,sasiReady)}>
                        <Text style={{color:'#00796B', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>}
                      <Text style={{color:'white'}}>{expanded.stdReady?'▲':'▼'}</Text>
                    </View>
                  </TouchableOpacity>
                  {expanded.stdReady&&(readyOrders.length>0?readyOrders.map(o=>renderReadyCard(o)):
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν έτοιμα</Text>
                  )}

                  {/* ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ */}
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#555', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('stdSold')}>
                    <Text style={styles.listHeaderText}>🗂 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ({soldOrders.length})</Text>
                    <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                      {expanded.stdSold&&soldOrders.length>0&&<TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                        onPress={()=>handleStdPrint(soldOrders,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ',caseReady,sasiReady)}>
                        <Text style={{color:'#555', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>}
                      <Text style={{color:'white'}}>{expanded.stdSold?'▲':'▼'}</Text>
                    </View>
                  </TouchableOpacity>
                  {expanded.stdSold&&(soldOrders.length>0?soldOrders.map(o=>renderSoldCard(o)):
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν πωλήσεις</Text>
                  )}

                  {/* ΑΠΟΘΕΜΑ ΣΑΣΙ — ΜΟΝΗ */}
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#4a148c', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('moniSasiStock')}>
                    <Text style={styles.listHeaderText}>🗄️ ΑΠΟΘΕΜΑ ΣΑΣΙ ({dipliSasiStock.filter(s=>!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ').length})</Text>
                    <Text style={{color:'white'}}>{expanded.moniSasiStock?'▲':'▼'}</Text>
                  </TouchableOpacity>
                  {expanded.moniSasiStock&&dipliSasiStock.filter(s=>!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ').length===0&&(
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν αποθέματα σασί</Text>
                  )}
                  {expanded.moniSasiStock&&dipliSasiStock.filter(s=>!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ').map(s=>(
                    <View key={s.id} style={{backgroundColor: s.reservedBy?'#fffde7':'white', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:5, borderLeftColor: s.reservedBy?'#FFC107':'#9c27b0', elevation:1}}>
                      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <View style={{flex:1}}>
                          <Text style={{fontWeight:'bold', fontSize:14}}>📐 {s.h}x{s.w} | {s.side}</Text>
                          {s.hardware?<Text style={{fontSize:12, color:'#555'}}>🔩 {s.hardware} {s.hardwareColor?`— ${s.hardwareColor}`:''}</Text>:null}
                          {s.lock?<Text style={{fontSize:12, color:'#555'}}>🔑 {s.lock}</Text>:null}
                          {s.coating?<Text style={{fontSize:12, color:'#555'}}>🎨 {s.coating}</Text>:null}
                          {s.notes?<Text style={{fontSize:11, color:'#888'}}>📝 {s.notes}</Text>:null}
                          <Text style={{fontSize:10, color:'#aaa'}}>Από παραγγελία #{s.orderNo} {s.customer?`— ${s.customer}`:''}</Text>
                          {s.reservedBy?<Text style={{fontSize:11, color:'#E65100', fontWeight:'bold', marginTop:2}}>📌 Δεσμευμένο: {s.reservedBy} #{s.reservedOrderNo}</Text>:null}
                        </View>
                        <TouchableOpacity
                          style={{backgroundColor:'#c62828', paddingHorizontal:8, paddingVertical:5, borderRadius:5, marginLeft:8}}
                          onPress={()=>Alert.alert("Διαγραφή","Διαγραφή από αποθέματα;",[
                            {text:"Όχι"},
                            {text:"Ναι", style:"destructive", onPress:async()=>{
                              setDipliSasiStock(prev=>prev.filter(x=>x.id!==s.id));
                              await fetch(`${FIREBASE_URL}/dipli_sasi_stock/${s.id}.json`,{method:'DELETE'});
                            }}
                          ])}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>)}

                {/* ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ */}
                {stdTab==='ΔΙΠΛΗ'&&expanded.stdDipliOpen&&(<>

                  {/* Header παραγγελιών */}
                  <View style={[styles.listHeader,{backgroundColor:'#8B0000', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}>
                    <Text style={styles.listHeaderText}>● ΠΑΡΑΓΓΕΛΙΕΣ ({dipliOrders.length})</Text>
                    <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
                      onPress={()=>handleStdPrint(dipliOrders,'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — ΠΑΡΑΓΓΕΛΙΕΣ',caseReady,sasiReady)}>
                      <Text style={{color:'#8B0000', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                    </TouchableOpacity>
                  </View>
                  {dipliCards.length>0?dipliCards:
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν παραγγελίες διπλής θωράκισης</Text>
                  }

                  {/* ΠΑΡΑΓΓΕΛΙΕΣ ΣΤΗΝ ΠΑΡΑΓΩΓΗ ΔΙΠΛΗΣ */}
                  {(()=>{
                    const prodOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='DIPLI_PROD').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
                    if(prodOrders.length===0) return null;
                    return (<>
                      <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#1565C0', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('dipliProd')}>
                        <Text style={styles.listHeaderText}>🔵 ΠΑΡΑΓΓΕΛΙΕΣ ΣΤΗΝ ΠΑΡΑΓΩΓΗ ({prodOrders.length})</Text>
                        <Text style={{color:'white'}}>{expanded.dipliProd?'▲':'▼'}</Text>
                      </TouchableOpacity>
                      {expanded.dipliProd&&(()=>{
                        const tabDefs = [
                          {key:'laser', label:'🔴 LASER'},
                          {key:'montSasi', label:'🔵 ΚΑΤ.ΣΑΣΙ'},
                          {key:'montDoor', label:'🟢 ΜΟΝΤ.'},
                          {key:'stavera', label:'📏 ΣΤΑΘΕΡΑ'},
                        ];

                        // Ταξινόμηση ανά tab
                        const sortForTab = (orders, key) => {
                          if(key==='laser') return [...orders].sort((a,b)=>{
                            const hDiff=(parseInt(b.h)||0)-(parseInt(a.h)||0);
                            if(hDiff!==0) return hDiff;
                            return (parseInt(b.w)||0)-(parseInt(a.w)||0);
                          });
                          return [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
                        };

                        const tabLabels = {laser:'LASER ΚΟΠΕΣ', montSasi:'ΚΑΤΑΣΚΕΥΗ ΣΑΣΙ', montDoor:'ΜΟΝΤΑΡΙΣΜΑ'};

                        return (<>
                          {/* Sub-tabs */}
                          <View style={{flexDirection:'row', marginBottom:6, marginTop:4}}>
                            {tabDefs.map(t=>{
                              const tabOrders = t.key==='stavera'
                                ? prodOrders.filter(o=>o.stavera&&o.stavera.length>0)
                                : prodOrders.filter(o=>o.dipliPhases?.[t.key]?.active);
                              if(t.key==='montDoor' && tabOrders.length===0) return null;
                              return (
                                <TouchableOpacity key={t.key}
                                  style={{flex:1, padding:8, alignItems:'center', borderRadius:6, marginHorizontal:2, backgroundColor: dipliProdTab===t.key?'#1565C0':'#e0e0e0'}}
                                  onPress={()=>setDipliProdTab(t.key)}>
                                  <Text style={{fontSize:11, fontWeight:'bold', color: dipliProdTab===t.key?'white':'#555'}}>{t.label} ({tabOrders.length})</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          {/* Κουμπί εκτύπωσης για ενεργό tab */}
                          {(()=>{
                            const activeTabOrders = prodOrders.filter(o=>o.dipliPhases?.[dipliProdTab]?.active);
                            if(activeTabOrders.length===0) return null;
                            return (
                              <TouchableOpacity
                                style={{backgroundColor:'#1565C0', paddingHorizontal:12, paddingVertical:6, borderRadius:6, alignSelf:'flex-end', marginBottom:6}}
                                onPress={()=>handleStdPrint(sortForTab(activeTabOrders,dipliProdTab),`ΔΙΠΛΗ — ${tabLabels[dipliProdTab]}`,caseReady,sasiReady, dipliProdTab==='montDoor')}>
                                <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                              </TouchableOpacity>
                            );
                          })()}
                          {/* Tab ΣΤΑΘΕΡΑ ΔΙΠΛΗ */}
                          {dipliProdTab==='stavera'&&(()=>{
                            const staveraOrders = prodOrders.filter(o=>o.stavera&&o.stavera.length>0);
                            return (<>
                              <TouchableOpacity
                                style={{backgroundColor:'#7b1fa2', paddingHorizontal:10, paddingVertical:7, borderRadius:6, alignSelf:'flex-start', marginBottom:8}}
                                onPress={()=>{
                                  const today = new Date();
                                  const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
                                  const rows = staveraOrders.flatMap(o=>
                                    (o.stavera||[]).map(s=>`<tr>
                                      <td style="font-weight:bold">${o.orderNo||'—'}</td>
                                      <td>${o.customer||'—'}</td>
                                      <td style="font-weight:bold;font-size:14px">${s.dim||'—'}</td>
                                      <td style="min-width:200px">${s.note||''}</td>
                                    </tr>`)
                                  ).join('');
                                  const html = `<html><head><meta charset="utf-8"><style>
                                    body{font-family:Arial,sans-serif;margin:8mm;}
                                    h1{font-size:14px;font-weight:bold;margin-bottom:2px;}
                                    h2{font-size:11px;color:#555;margin-bottom:10px;}
                                    table{width:100%;border-collapse:collapse;font-size:11px;}
                                    th{padding:6px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;}
                                    td{padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top;}
                                    @media print{@page{size:A4 landscape;margin:8mm;}}
                                  </style></head><body>
                                    <h1>📏 ΣΤΑΘΕΡΑ — ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ</h1>
                                    <h2>📅 ${dateStr} | ${staveraOrders.length} παραγγελίες</h2>
                                    <table><thead><tr><th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>Παρατήρηση</th></tr></thead>
                                    <tbody>${rows}</tbody></table>
                                  </body></html>`;
                                  printHTML(html, 'ΣΤΑΘΕΡΑ — ΔΙΠΛΗ');
                                }}>
                                <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ ΣΤΑΘΕΡΩΝ</Text>
                              </TouchableOpacity>
                              {staveraOrders.length===0?(
                                <Text style={{textAlign:'center',color:'#999',padding:16}}>Δεν υπάρχουν παραγγελίες με σταθερά</Text>
                              ):staveraOrders.map(o=>{
                                const isGiven = !!o.staveraGiven;
                                return (
                                <View key={o.id} style={{backgroundColor:o.staveraDone?'#e8f5e9':isGiven?'#ede7f6':'#f3e5f5', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:4, borderLeftColor:o.staveraDone?'#00C851':isGiven?'#4a148c':'#7b1fa2', elevation:1, flexDirection:'row', alignItems:'flex-start'}}>
                                  {/* CHECKBOX */}
                                  <TouchableOpacity
                                    style={{marginRight:10, marginTop:2}}
                                    onPress={()=>{
                                      Alert.alert(isGiven?'☐ Ξετσεκάρισμα':'✅ Επιβεβαίωση',
                                        isGiven?`Ξετσεκάρισμα σταθερών #${o.orderNo};`:`Τα σταθερά της #${o.orderNo} δόθηκαν για παραγωγή;`,
                                        [{text:'ΑΚΥΡΟ',style:'cancel'},{text:'ΝΑΙ',onPress:async()=>{
                                          const upd={...o,staveraGiven:!isGiven};
                                          setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                          await syncToCloud(upd);
                                        }}]);
                                    }}>
                                    <View style={{width:28,height:28,borderRadius:6,borderWidth:2,borderColor:isGiven?'#4a148c':'#7b1fa2',backgroundColor:isGiven?'#4a148c':'white',alignItems:'center',justifyContent:'center'}}>
                                      {isGiven&&<Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✓</Text>}
                                    </View>
                                  </TouchableOpacity>
                                  <View style={{flex:1}}>
                                    <Text style={{fontWeight:'bold', fontSize:13, marginBottom:4}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                                    <Text style={{fontSize:12, color:'#555', marginBottom:6}}>{o.h}x{o.w} | {o.side}</Text>
                                    {(o.stavera||[]).map((s,idx)=>(
                                      <View key={idx} style={{backgroundColor:'white', borderRadius:6, padding:8, marginBottom:4, borderLeftWidth:2, borderLeftColor:'#ce93d8'}}>
                                        <Text style={{fontWeight:'bold', fontSize:13, color:'#4a148c'}}>📐 {s.dim||'—'}</Text>
                                        {s.note?<Text style={{fontSize:12, color:'#555', marginTop:2}}>{s.note}</Text>:null}
                                      </View>
                                    ))}
                                    {o.staveraDone&&<Text style={{fontSize:11,color:'#00796B',fontWeight:'bold',marginTop:2}}>✅ Ολοκληρώθηκαν</Text>}
                                  </View>
                                  {/* DONE + ΠΙΣΩ */}
                                  <View style={{justifyContent:'space-between', gap:6, marginLeft:8, paddingVertical:2}}>
                                    <TouchableOpacity
                                      style={[styles.doneBtn, o.staveraDone&&styles.doneBtnActive]}
                                      onPress={async()=>{
                                        const upd={...o, staveraDone:!o.staveraDone};
                                        setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                        await syncToCloud(upd);
                                      }}>
                                      <Text style={styles.doneBtnTxt}>{o.staveraDone?'↩️ UNDO':'✓ DONE'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={{backgroundColor:'#ff9800', paddingHorizontal:6, paddingVertical:6, borderRadius:6, alignItems:'center'}}
                                      onPress={()=>Alert.alert("↩ Επιστροφή",`Επιστροφή σταθερών #${o.orderNo};`,[
                                        {text:"ΑΚΥΡΟ",style:"cancel"},
                                        {text:"ΝΑΙ",onPress:async()=>{
                                          const upd={...o,staveraGiven:false,staveraDone:false};
                                          setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                          await syncToCloud(upd);
                                        }}
                                      ])}>
                                      <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΠΙΣΩ</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                                );
                              })}
                            </>);
                          })()}

                          {/* Κάρτες ενεργού tab */}
                          {dipliProdTab!=='stavera'&&(()=>{
                            // FIFO για ΚΑΣΑ στην παραγωγή
                            const caseUsedProd={};
                            return prodOrders.filter(o=>o.dipliPhases?.[dipliProdTab]?.active).map(o=>{
                            const phase = o.dipliPhases?.[dipliProdTab];
                            if(!phase) return null;
                            const key=`${o.h}_${o.w}_${o.side}`;
                            const caseStock=caseReady.filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side&&!s.reservedBy).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
                            const hasCase=(caseUsedProd[key]||0)<caseStock;
                            caseUsedProd[key]=(caseUsedProd[key]||0)+1;
                            return (
                              <View key={o.id} style={{backgroundColor: phase.done?'#e8f5e9':'#fff', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor: phase.done?'#00C851':'#1565C0', elevation:2}}>
                                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                                  <View style={{flex:1}}>
                                    <Text style={{fontWeight:'bold', fontSize:13}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                                    <Text style={{fontSize:12, color:'#555', marginTop:1}}>{o.h}x{o.w} | {o.side}</Text>
                                    {o.notes?<Text style={{fontSize:11, color:'#888'}}>Σημ: {o.notes}</Text>:null}
                                    {o.deliveryDate?<Text style={{fontSize:10, color:'#007AFF'}}>📅 {o.deliveryDate}</Text>:null}
                                    {/* ΕΝΔΕΙΞΗ ΚΑΣΑΣ */}
                                    <View style={{flexDirection:'row', alignItems:'center', marginTop:4, gap:4}}>
                                      <View style={{backgroundColor: hasCase?'#e8f5e9':'#ffeaea', borderRadius:4, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor: hasCase?'#00C851':'#ff4444'}}>
                                        <Text style={{fontSize:10, fontWeight:'bold', color: hasCase?'#155724':'#721c24'}}>ΚΑΣΑ {hasCase?'✅':'❌'}</Text>
                                      </View>
                                    </View>
                                    {phase.done&&<Text style={{fontSize:11, color:'#00C851', fontWeight:'bold', marginTop:2}}>✅ Ολοκληρώθηκε</Text>}
                                  </View>
                                  <View style={{justifyContent:'space-between', paddingVertical:4, gap:6}}>
                                    <TouchableOpacity
                                      style={[styles.doneBtn, phase.done&&styles.doneBtnActive]}
                                      onPress={()=>phase.done ? handleDipliPhaseUndone(o.id,dipliProdTab) : handleDipliPhaseDone(o.id,dipliProdTab)}>
                                      <Text style={styles.doneBtnTxt}>{phase.done?'↩️ UNDO':'✓ DONE'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={{backgroundColor:'#ff9800', paddingHorizontal:6, paddingVertical:4, borderRadius:5, alignItems:'center'}}
                                      onPress={()=>Alert.alert("↩ Επιστροφή",`Επιστροφή της #${o.orderNo} στις παραγγελίες;`,[
                                        {text:"ΑΚΥΡΟ", style:"cancel"},
                                        {text:"ΝΑΙ", onPress:async()=>{
                                          const upd = {...o, status:'STD_PENDING', dipliPhases:null, dipliStartAt:null};
                                          setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                          await syncToCloud(upd);
                                        }}
                                      ])}>
                                      <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΠΙΣΩ</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </View>
                            );
                          });
                          })()}
                          {dipliProdTab!=='stavera'&&prodOrders.filter(o=>o.dipliPhases?.[dipliProdTab]?.active).length===0&&(
                            <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν παραγγελίες σε αυτή τη φάση</Text>
                          )}
                        </>);
                      })()}
                    </>);
                  })()}

                  {/* ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ ΔΙΠΛΗ */}
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#00796B', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('stdReadyD')}>
                    <Text style={styles.listHeaderText}>📦 ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ ({dipliReadyOrders.length})</Text>
                    <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                      {expanded.stdReadyD&&dipliReadyOrders.length>0&&<TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                        onPress={()=>handleStdPrint(dipliReadyOrders,'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ',caseReady,sasiReady)}>
                        <Text style={{color:'#00796B', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>}
                      <Text style={{color:'white'}}>{expanded.stdReadyD?'▲':'▼'}</Text>
                    </View>
                  </TouchableOpacity>
                  {expanded.stdReadyD&&(dipliReadyOrders.length>0?dipliReadyOrders.map(o=>renderReadyCard(o)):
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν έτοιμα</Text>
                  )}

                  {/* ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ΔΙΠΛΗ */}
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#555', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('stdSoldD')}>
                    <Text style={styles.listHeaderText}>🗂 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ({dipliSoldOrders.length})</Text>
                    <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                      {expanded.stdSoldD&&dipliSoldOrders.length>0&&<TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                        onPress={()=>handleStdPrint(dipliSoldOrders,'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ',caseReady,sasiReady)}>
                        <Text style={{color:'#555', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>}
                      <Text style={{color:'white'}}>{expanded.stdSoldD?'▲':'▼'}</Text>
                    </View>
                  </TouchableOpacity>
                  {expanded.stdSoldD&&(dipliSoldOrders.length>0?dipliSoldOrders.map(o=>renderSoldCard(o)):
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν πωλήσεις</Text>
                  )}

                  {/* ΑΠΟΘΕΜΑ ΣΑΣΙ */}
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#4a148c', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('dipliSasiStock')}>
                    <Text style={styles.listHeaderText}>🗄️ ΑΠΟΘΕΜΑ ΣΑΣΙ ({dipliSasiStock.filter(s=>s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'||(!s.sasiType&&false)).length})</Text>
                    <Text style={{color:'white'}}>{expanded.dipliSasiStock?'▲':'▼'}</Text>
                  </TouchableOpacity>
                  {expanded.dipliSasiStock&&dipliSasiStock.filter(s=>s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').length===0&&(
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν αποθέματα σασί</Text>
                  )}
                  {expanded.dipliSasiStock&&dipliSasiStock.filter(s=>s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').map(s=>(
                    <View key={s.id} style={{backgroundColor: s.reservedBy?'#fffde7':'white', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:5, borderLeftColor: s.reservedBy?'#FFC107':'#9c27b0', elevation:1}}>
                      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <View style={{flex:1}}>
                          <Text style={{fontWeight:'bold', fontSize:14}}>📐 {s.h}x{s.w} | {s.side}</Text>
                          {s.hardware?<Text style={{fontSize:12, color:'#555'}}>🔩 {s.hardware} {s.hardwareColor?`— ${s.hardwareColor}`:''}</Text>:null}
                          {s.coating?<Text style={{fontSize:12, color:'#555'}}>🎨 {s.coating}</Text>:null}
                          {s.notes?<Text style={{fontSize:11, color:'#888'}}>📝 {s.notes}</Text>:null}
                          <Text style={{fontSize:10, color:'#aaa'}}>Από παραγγελία #{s.orderNo} {s.customer?`— ${s.customer}`:''}</Text>
                          {s.reservedBy?<Text style={{fontSize:11, color:'#E65100', fontWeight:'bold', marginTop:2}}>📌 Δεσμευμένο: {s.reservedBy} #{s.reservedOrderNo}</Text>:null}
                        </View>
                        <TouchableOpacity
                          style={{backgroundColor:'#c62828', paddingHorizontal:8, paddingVertical:5, borderRadius:5, marginLeft:8}}
                          onPress={()=>Alert.alert("Διαγραφή","Διαγραφή από αποθέματα;",[
                            {text:"Όχι"},
                            {text:"Ναι", style:"destructive", onPress:async()=>{
                              setDipliSasiStock(prev=>prev.filter(x=>x.id!==s.id));
                              await fetch(`${FIREBASE_URL}/dipli_sasi_stock/${s.id}.json`,{method:'DELETE'});
                            }}
                          ])}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>)}
              </>);
            })()}
          </>)}
        </View>
      </ScrollView>

      {/* MODAL ΧΡΩΜΑ ΕΞΑΡΤΗΜΑΤΩΝ */}
      <Modal visible={showHardwarePicker} transparent animationType="slide" onRequestClose={()=>setShowHardwarePicker(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16}}>
            <View style={{backgroundColor:'#8B0000',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>Χρώμα Εξαρτημάτων</Text>
              <TouchableOpacity onPress={()=>setShowHardwarePicker(false)}>
                <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            {['Nikel','Bronze','Nikel Best','Bronze Best','Best Παραγγελία',''].map((c,i)=>(
              <TouchableOpacity key={i}
                style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                onPress={()=>{
                  if(c===''){
                    setShowCustomHardwareInput(true);
                    setCustomHardwareText('');
                  } else {
                    setCustomForm({...customForm,hardware:c});
                    setShowCustomHardwareInput(false);
                    setShowHardwarePicker(false);
                  }
                }}>
                <Text style={{fontSize:15,color:c?'#000':'#888'}}>{c||'Άλλο (γράψτε εδώ)...'}</Text>
                {customForm.hardware===c&&c!==''&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
              </TouchableOpacity>
            ))}
            {showCustomHardwareInput&&(
              <View style={{padding:12}}>
                <TextInput
                  autoFocus
                  style={{backgroundColor:'#f5f5f5',padding:12,borderRadius:8,borderWidth:1,borderColor:'#8B0000',fontSize:15}}
                  placeholder="Γράψτε χρώμα εξαρτημάτων..."
                  value={customHardwareText}
                  onChangeText={v=>setCustomHardwareText(v)}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={{backgroundColor:'#8B0000',padding:12,borderRadius:8,alignItems:'center',marginTop:8}}
                  onPress={()=>{
                    if(customHardwareText.trim()){
                      setCustomForm({...customForm,hardware:customHardwareText.trim()});
                    }
                    setShowCustomHardwareInput(false);
                    setShowHardwarePicker(false);
                  }}>
                  <Text style={{color:'white',fontWeight:'bold'}}>ΟΚ</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{height:20}}/>
          </View>
        </View>
      </Modal>

      {/* MODAL ΚΛΕΙΔΑΡΙΕΣ */}
      <Modal visible={showLockPicker} transparent animationType="slide" onRequestClose={()=>setShowLockPicker(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'60%'}}>
            <View style={{backgroundColor:'#8B0000',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🔒 Κλειδαριά</Text>
              <TouchableOpacity onPress={()=>setShowLockPicker(false)}>
                <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                onPress={()=>{setCustomForm({...customForm,lock:''});setShowLockPicker(false);}}>
                <Text style={{fontSize:15,color:'#888'}}>— Χωρίς κλειδαριά</Text>
                {!customForm.lock&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
              </TouchableOpacity>
              {(locks||[]).map(l=>(
                <TouchableOpacity key={l.id}
                  style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                  onPress={()=>{setCustomForm({...customForm,lock:l.name+(l.type?' ('+l.type+')':'')});setShowLockPicker(false);}}>
                  <View>
                    <Text style={{fontSize:15,color:'#000',fontWeight:'600'}}>{l.name}</Text>
                    {l.type?<Text style={{fontSize:12,color:'#666'}}>{l.type}</Text>:null}
                  </View>
                  {customForm.lock===l.name+(l.type?' ('+l.type+')':'')&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
                </TouchableOpacity>
              ))}
              {(locks||[]).length===0&&<Text style={{textAlign:'center',color:'#aaa',padding:24}}>Δεν υπάρχουν καταχωρημένες κλειδαριές.</Text>}
            </ScrollView>
            <View style={{height:20}}/>
          </View>
        </View>
      </Modal>

      {/* MODAL ΕΠΕΝΔΥΣΕΙΣ */}
      <Modal visible={showCoatingsPicker} transparent animationType="slide" onRequestClose={()=>setShowCoatingsPicker(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'60%'}}>
            <View style={{backgroundColor:'#007AFF',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🎨 Επένδυση Πόρτας</Text>
              <TouchableOpacity onPress={()=>setShowCoatingsPicker(false)}>
                <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {coatings.length===0 && (
                <Text style={{padding:20,color:'#aaa',textAlign:'center'}}>Δεν υπάρχουν επενδύσεις. Προσθέστε από το μενού ☰.</Text>
              )}
              {coatings.map(c=>{
                const selected = (customForm.coatings||[]).includes(c.name);
                const n = c.name?.toLowerCase()||'';
                const bg = n.includes('μέσα')||n.includes('μεσα') ? '#E8F4FD' : n.includes('έξω')||n.includes('εξω') ? '#FFF3E0' : '#fff';
                return (
                  <TouchableOpacity key={c.id}
                    style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between', backgroundColor: bg}}
                    onPress={()=>{
                      const current = customForm.coatings||[];
                      const updated = selected ? current.filter(x=>x!==c.name) : [...current,c.name];
                      setCustomForm({...customForm,coatings:updated});
                      if (!selected && updated.length >= 2) {
                        setTimeout(()=>setShowCoatingsPicker(false), 150);
                      }
                    }}>
                    <Text style={{fontSize:15,color:'#000'}}>{c.name}</Text>
                    {selected && <Text style={{color:'#007AFF',fontSize:18,fontWeight:'bold'}}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
              {/* Κουμπί εκκαθάρισης */}
              {(customForm.coatings||[]).length>0&&(
                <TouchableOpacity
                  style={{margin:12,padding:12,backgroundColor:'#ff4444',borderRadius:8,alignItems:'center'}}
                  onPress={()=>setCustomForm({...customForm,coatings:[]})}>
                  <Text style={{color:'white',fontWeight:'bold'}}>ΕΚΚΑΘΑΡΙΣΗ ΕΠΙΛΟΓΩΝ</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            <TouchableOpacity
              style={{margin:12,padding:14,backgroundColor:'#007AFF',borderRadius:8,alignItems:'center'}}
              onPress={()=>setShowCoatingsPicker(false)}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>ΟΛΟΚΛΗΡΩΣΗ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL ΗΜΕΡΟΜΗΝΙΑ ΠΑΡΑΔΟΣΗΣ */}
      <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={()=>setShowDatePicker(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,padding:16}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <Text style={{fontWeight:'bold',fontSize:16}}>📅 Ημερομηνία Παράδοσης</Text>
              <TouchableOpacity onPress={()=>setShowDatePicker(false)}>
                <Text style={{fontSize:20,fontWeight:'bold',color:'#888'}}>✕</Text>
              </TouchableOpacity>
            </View>
            {(()=>{
              const months = ['ΙΑΝ','ΦΕΒ','ΜΑΡ','ΑΠΡ','ΜΑΙ','ΙΟΥΝ','ΙΟΥΛ','ΑΥΓ','ΣΕΠ','ΟΚΤ','ΝΟΕ','ΔΕΚ'];
              const now = new Date();
              const [selDay,setSelDay] = useState(String(now.getDate()));
              const [selMonth,setSelMonth] = useState(String(now.getMonth()+1));
              const [selYear,setSelYear] = useState(String(now.getFullYear()));
              const days = Array.from({length:31},(_,i)=>String(i+1));
              const years = [String(now.getFullYear()),String(now.getFullYear()+1)];
              return (<>
                <Text style={{fontWeight:'bold',color:'#555',marginBottom:6}}>Ημέρα:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
                  <View style={{flexDirection:'row',gap:6}}>
                    {days.map(d=>(
                      <TouchableOpacity key={d} onPress={()=>setSelDay(d)}
                        style={{width:36,height:36,borderRadius:18,backgroundColor:selDay===d?'#8B0000':'#eee',alignItems:'center',justifyContent:'center'}}>
                        <Text style={{color:selDay===d?'white':'#333',fontWeight:'bold',fontSize:12}}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Text style={{fontWeight:'bold',color:'#555',marginBottom:6}}>Μήνας:</Text>
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:12}}>
                  {months.map((m,i)=>(
                    <TouchableOpacity key={m} onPress={()=>setSelMonth(String(i+1))}
                      style={{paddingHorizontal:10,paddingVertical:6,borderRadius:6,backgroundColor:selMonth===String(i+1)?'#8B0000':'#eee'}}>
                      <Text style={{color:selMonth===String(i+1)?'white':'#333',fontWeight:'bold',fontSize:12}}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={{fontWeight:'bold',color:'#555',marginBottom:6}}>Έτος:</Text>
                <View style={{flexDirection:'row',gap:6,marginBottom:16}}>
                  {years.map(y=>(
                    <TouchableOpacity key={y} onPress={()=>setSelYear(y)}
                      style={{paddingHorizontal:16,paddingVertical:8,borderRadius:6,backgroundColor:selYear===y?'#8B0000':'#eee'}}>
                      <Text style={{color:selYear===y?'white':'#333',fontWeight:'bold'}}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={{backgroundColor:'#8B0000',padding:14,borderRadius:8,alignItems:'center'}}
                  onPress={()=>{
                    setCustomForm({...customForm,deliveryDate:`${selDay}/${selMonth}/${selYear}`});
                    setShowDatePicker(false);
                  }}>
                  <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>ΕΠΙΛΟΓΗ</Text>
                </TouchableOpacity>
              </>);
            })()}
            <View style={{height:20}}/>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const vstyles = StyleSheet.create({
  // Header φόρμας
  formHeader: { backgroundColor:'#1a1a1a', borderRadius:12, padding:14, marginBottom:10, flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  formHeaderTitle: { color:'white', fontSize:14, fontWeight:'900', letterSpacing:2 },
  editBadge: { backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:3, borderRadius:6 },
  editBadgeTxt: { color:'white', fontSize:10, fontWeight:'bold' },
  // Type selector
  typeSelector: { flexDirection:'row', marginBottom:10, backgroundColor:'#f0f0f0', borderRadius:10, padding:4, gap:4 },
  typeTab: { flex:1, paddingVertical:10, borderRadius:8, alignItems:'center' },
  typeTabBlue: { backgroundColor:'#007AFF' },
  typeTabRed: { backgroundColor:'#8B0000' },
  typeTabTxt: { fontWeight:'800', fontSize:13, color:'#888', letterSpacing:0.5 },
  // Cards — βασική μονάδα layout
  card: { backgroundColor:'#fff', borderRadius:10, marginBottom:7, overflow:'hidden', elevation:2, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.07, shadowRadius:4 },
  cardHeader: { backgroundColor:'#2c2c2c', paddingHorizontal:12, paddingVertical:7 },
  cardHeaderTxt: { fontSize:10, fontWeight:'800', color:'white', letterSpacing:2 },
  cardBody: { padding:9 },
  // Labels
  fieldLabel: { fontSize:9, fontWeight:'800', color:'#999', letterSpacing:0.8, textTransform:'uppercase', marginBottom:1 },
  fieldLabelDark: { fontSize:9, fontWeight:'900', color:'#444', letterSpacing:0.8, textTransform:'uppercase', marginBottom:1 },
  // Compact toggle για Τύπος Κάσας/Σασί — ίδιο ύψος με textInput (minHeight:36)
  togBtnSm: { flex:1, minHeight:36, borderRadius:5, alignItems:'center', justifyContent:'center', backgroundColor:'#f0f0f0', borderWidth:1.5, borderColor:'transparent' },
  togBtnSmTxt: { fontSize:10, fontWeight:'900', color:'#555', textAlign:'center' },
  // Dimension chips
  chipRow: { flexDirection:'row', gap:4, marginTop:2 },
  dimChip: { flex:1, paddingVertical:7, borderRadius:6, alignItems:'center', backgroundColor:'#f0f0f0', borderWidth:2, borderColor:'transparent' },
  dimChipOn: { backgroundColor:'#1a1a1a', borderColor:'#1a1a1a' },
  dimChipTxt: { fontSize:16, fontWeight:'800', color:'#666' },
  dimChipTxtOn: { color:'white' },
  // Side chips (ΑΡ. / ΔΕΞ.)
  sideChip: { flex:1, paddingVertical:7, borderRadius:6, alignItems:'center', backgroundColor:'#f0f0f0', borderWidth:2, borderColor:'transparent' },
  sideChipOn: { backgroundColor:'#8B0000', borderColor:'#8B0000' },
  sideChipTxt: { fontSize:11, fontWeight:'800', color:'#666', letterSpacing:0.3 },
  sideChipTxtOn: { color:'white' },
  // Toggle buttons (ΑΝΟΙΧΤΗ/ΚΛΕΙΣΤΗ, ΜΟΝΗ/ΔΙΠΛΗ, ΝΑΙ/ΟΧΙ)
  togBtn: { flex:1, paddingVertical:8, minHeight:36, borderRadius:6, alignItems:'center', justifyContent:'center', backgroundColor:'#f0f0f0', borderWidth:1.5, borderColor:'transparent' },
  togBtnOn: { backgroundColor:'#1a1a1a', borderColor:'#1a1a1a' },
  togBtnGreen: { backgroundColor:'#00C851', borderColor:'#00C851' },
  togBtnTxt: { fontSize:10, fontWeight:'800', color:'#666', textAlign:'center' },
  togBtnTxtOn: { color:'white' },
  // Text input
  textInput: { backgroundColor:'#f5f5f5', padding:8, minHeight:36, borderRadius:7, borderWidth:1.5, borderColor:'#e8e8e8', fontSize:13, color:'#1a1a1a' },
  // Select / dropdown button
  selectBtn: { backgroundColor:'#f5f5f5', paddingHorizontal:8, paddingVertical:7, minHeight:36, borderRadius:7, borderWidth:1.5, borderColor:'#e8e8e8', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  // Σταθερά grid cell
  staveraCell: { backgroundColor:'#f5f5f5', borderWidth:1, borderColor:'#ddd', borderRadius:5, paddingHorizontal:5, paddingVertical:4, fontSize:12, color:'#1a1a1a', minHeight:28 },
});

const styles = StyleSheet.create({
  sectionTitle: { fontWeight:'bold', marginBottom:10, fontSize:15 },
  smallLabel: { fontSize:12, marginBottom:4, fontWeight:'bold', color:'#555' },
  row: { flexDirection:'row', justifyContent:'space-between', marginBottom:8 },
  input: { backgroundColor:'#fff', padding:12, borderRadius:5, marginBottom:8, borderWidth:1, borderColor:'#ddd' },
  inputHalf: { width:'49%', backgroundColor:'#fff', padding:12, borderRadius:5, borderWidth:1, borderColor:'#ddd' },
  inputHalfContainer: { width:'49%' },
  inputFull: { backgroundColor:'#fff', padding:12, borderRadius:5, borderWidth:1, borderColor:'#ddd' },
  hingeInput: { backgroundColor:'#fff', padding:5, borderRadius:5, borderWidth:1, borderColor:'#ddd', fontSize:25, fontWeight:'bold', color:'red', textAlign:'center' },
  tab: { flex:1, padding:12, backgroundColor:'#e0e0e0', alignItems:'center', margin:2, borderRadius:8 },
  activeTab: { backgroundColor:'#007AFF' },
  saveBtn: { padding:15, borderRadius:8, alignItems:'center', marginTop:4 },
  mainTitle: { fontSize:18, fontWeight:'bold', textAlign:'center', marginTop:30, marginBottom:10 },
  listHeader: { padding:12, borderRadius:5, marginTop:10 },
  listHeaderText: { color:'white', fontWeight:'bold' },
  orderCard: { backgroundColor:'#fff', borderRadius:8, marginBottom:5, borderLeftWidth:10, flexDirection:'row', elevation:2, minHeight:90 },
  cardContent: { flex:1, padding:10, justifyContent:'center' },
  cardCustomer: { fontSize:13, fontWeight:'bold', color:'#1a1a1a' },
  cardDetails: { fontSize:12, color:'#444' },
  cardSubDetails: { fontSize:11, color:'#666' },
  datesRow: { flexDirection:'row', flexWrap:'wrap', marginTop:4, gap:4 },
  dateChip: { fontSize:10, color:'#555', backgroundColor:'#f0f0f0', paddingHorizontal:6, paddingVertical:2, borderRadius:4, overflow:'hidden' },
  sideBtnContainer: { width:95, borderTopRightRadius:8, borderBottomRightRadius:8, overflow:'hidden' },
  lowerBtn: { flex:2, justifyContent:'center', alignItems:'center' },
  upperBtn: { flex:1, justifyContent:'center', alignItems:'center', borderBottomWidth:1, borderBottomColor:'#444' },
  sideBtnText: { color:'white', fontWeight:'bold', fontSize:12, textAlign:'center' },
  upperBtnText: { fontWeight:'bold', fontSize:10 },
  // TYPE
  typeRow: { flexDirection:'row', gap:8, marginBottom:12 },
  typeBtn: { flex:1, padding:12, borderRadius:8, alignItems:'center', backgroundColor:'#e8e8e8', borderWidth:2, borderColor:'#ddd' },
  typeBtnActive: { backgroundColor:'#007AFF', borderColor:'#007AFF' },
  typeBtnActiveStd: { backgroundColor:'#8B0000', borderColor:'#8B0000' },
  typeBtnTxt: { fontWeight:'bold', fontSize:13, color:'#555' },
  typeBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:12 },
  typeBadgeCustom: { backgroundColor:'#e3f0ff' },
  typeBadgeStd: { backgroundColor:'#fde8e8' },
  typeBadgeTxt: { fontSize:11, fontWeight:'bold', color:'#333' },
  // ΔΙΑΣΤΑΣΕΙΣ
  dimBtn: { paddingHorizontal:14, paddingVertical:10, backgroundColor:'#e8e8e8', borderRadius:8, marginRight:8, marginBottom:8, minWidth:62, alignItems:'center' },
  dimActive: { backgroundColor:'#1a1a1a' },
  dimTxt: { fontSize:15, fontWeight:'700', color:'#555' },
  dimActiveTxt: { color:'white' },
  // HW
  hwRow: { flexDirection:'row', justifyContent:'space-between', marginBottom:10 },
  hwBox: { width:'49%', backgroundColor:'#fff', padding:10, borderRadius:8, borderWidth:1, borderColor:'#ddd' },
  hwBtns: { flexDirection:'row', gap:6, marginTop:4 },
  hwBtn: { flex:1, paddingVertical:6, paddingHorizontal:2, backgroundColor:'#e8e8e8', borderRadius:6, alignItems:'center', justifyContent:'center' },
  hwBtnActive: { backgroundColor:'#1a1a1a' },
  hwBtnYes: { backgroundColor:'#00C851' },
  hwBtnNo: { backgroundColor:'#1a1a1a' },
  hwBtnTxt: { fontSize:11, fontWeight:'bold', color:'#555', textAlign:'center' },
  qtyInput: { backgroundColor:'#fff', padding:8, borderRadius:8, borderWidth:2, borderColor:'#007AFF', fontSize:20, fontWeight:'bold', textAlign:'left', color:'#007AFF', marginBottom:8, width:70 },
  // ΠΕΛΑΤΗΣ
  selectedCustomerBox: { backgroundColor:'#e8f5e9', padding:12, borderRadius:8, borderWidth:2, borderColor:'#00C851', flexDirection:'row', alignItems:'center', marginBottom:8 },
  selectedCustomerName: { fontSize:15, fontWeight:'bold', color:'#1a1a1a' },
  selectedCustomerHint: { fontSize:11, color:'#888', marginTop:2 },
  customerDropdown: { backgroundColor:'#fff', borderWidth:1, borderColor:'#ddd', borderRadius:8, marginTop:-6, marginBottom:4, elevation:10 },
  customerOption: { padding:12, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  customerOptionName: { fontSize:14, fontWeight:'bold', color:'#1a1a1a' },
  customerOptionDetail: { fontSize:12, color:'#666' },
  infoRow: { fontSize:16, color:'#1a1a1a', marginBottom:8, fontWeight:'500' },
  infoRowEmpty: { fontSize:14, color:'#bbb', marginBottom:8, fontStyle:'italic' },
  // MODAL
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' },
  modalBox: { backgroundColor:'#fff', borderRadius:16, padding:24, width:'80%', alignItems:'center' },
  modalTitle: { fontSize:18, fontWeight:'bold', color:'#8B0000', marginBottom:6 },
  modalSub: { fontSize:14, color:'#444', marginBottom:4, textAlign:'center' },
  modalTotal: { fontSize:13, color:'#888', marginBottom:16 },
  modalInput: { borderWidth:2, borderColor:'#8B0000', borderRadius:8, padding:12, fontSize:28, fontWeight:'bold', textAlign:'center', color:'#8B0000', width:'60%', marginBottom:20 },
  modalBtn: { flex:1, padding:14, borderRadius:8, alignItems:'center' },
  // ΠΑΡΑΓΩΓΗ ΥΠΟΚΑΡΤΕΛΕΣ
  prodContainer: { backgroundColor:'#f9f9f9', borderRadius:8, marginTop:4, padding:8 },
  phaseTabs: { marginBottom:10 },
  phaseTab: { paddingHorizontal:14, paddingVertical:10, backgroundColor:'#e0e0e0', borderRadius:20, marginRight:8, alignItems:'center', minWidth:80 },
  phaseTabActive: { backgroundColor:'#8B0000' },
  phaseTabTxt: { fontSize:11, fontWeight:'bold', color:'#555', textAlign:'center' },
  phaseTabTxtActive: { color:'white' },
  phaseTabCount: { fontSize:10, color:'#888', marginTop:2 },
  printBtn: { backgroundColor:'#1a1a1a', padding:12, borderRadius:8, alignItems:'center', marginBottom:10 },
  printBtnTxt: { color:'white', fontWeight:'bold', fontSize:13 },
  phaseCard: { backgroundColor:'#fff', borderRadius:8, marginBottom:6, borderLeftWidth:5, borderLeftColor:'#ffbb33', flexDirection:'row', alignItems:'center', padding:10, elevation:2 },
  phaseCardDone: { borderLeftColor:'#00C851', opacity:0.7 },
  printCheck: { marginRight:4 },
  checkbox: { width:26, height:26, borderRadius:6, borderWidth:2, borderColor:'#8B0000', alignItems:'center', justifyContent:'center', backgroundColor:'#fff' },
  checkboxSelected: { backgroundColor:'#8B0000' },
  printedBadge: { width:30, alignItems:'center', marginRight:4 },
  printedBadgeTxt: { fontSize:18 },
  printedTxt: { fontSize:10, color:'#007AFF', fontStyle:'italic', marginTop:2 },
  doneTxt: { fontSize:10, color:'#00C851', fontWeight:'bold', marginTop:2 },
  doneBtn: { backgroundColor:'#00C851', borderRadius:6, padding:8, alignItems:'center', marginBottom:4, minWidth:50 },
  doneBtnActive: { backgroundColor:'#888' },
  doneBtnTxt: { color:'white', fontWeight:'bold', fontSize:10, textAlign:'center' },
  removeBtn: { backgroundColor:'#ff4444', borderRadius:6, padding:8, alignItems:'center', minWidth:50 },
  removeBtnTxt: { color:'white', fontWeight:'bold', fontSize:14 },
  // PRINT PREVIEW
  previewContainer: { flex:1, backgroundColor:'#fff' },
  previewHeader: { backgroundColor:'#fff', padding:16, borderBottomWidth:2, borderBottomColor:'#000' },
  previewTitle: { fontSize:18, fontWeight:'bold', color:'#000' },
  previewSub: { fontSize:13, color:'#000', marginTop:4 },
  previewScroll: { flex:1, padding:10 },
  previewThead: { flexDirection:'row', backgroundColor:'#fff', paddingVertical:8, borderBottomWidth:2, borderBottomColor:'#000', borderTopWidth:2, borderTopColor:'#000' },
  previewTh: { width:110, color:'#000', fontWeight:'bold', fontSize:11, paddingHorizontal:6 },
  previewTr: { flexDirection:'row', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#000' },
  previewTrEven: { backgroundColor:'#fff' },
  previewTrOdd: { backgroundColor:'#fff' },
  previewTd: { width:110, fontSize:11, color:'#000', paddingHorizontal:6 },
  previewBtns: { flexDirection:'row', padding:16, gap:12, borderTopWidth:1, borderTopColor:'#ddd', backgroundColor:'#fff' },
  previewCancelBtn: { flex:1, padding:16, borderRadius:10, backgroundColor:'#e0e0e0', alignItems:'center' },
  previewCancelTxt: { fontWeight:'bold', fontSize:15, color:'#333' },
  previewPrintBtn: { flex:2, padding:16, borderRadius:10, backgroundColor:'#000', alignItems:'center' },
  previewPrintTxt: { fontWeight:'bold', fontSize:15, color:'white' },
  // ΕΚΤΥΠΩΣΗ MODAL
  printHeader: { backgroundColor:'#8B0000', padding:16 },
  printHeaderTitle: { color:'white', fontWeight:'bold', fontSize:16 },
  printHeaderSub: { color:'#ffcccc', fontSize:12, marginTop:4 },
  printTableHeader: { flexDirection:'row', backgroundColor:'#333', padding:8, borderRadius:4, marginBottom:2 },
  printTableRow: { flexDirection:'row', padding:8, backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor:'#e0e0e0' },
  printTH: { color:'white', fontWeight:'bold', fontSize:11 },
  printTD: { fontSize:11, color:'#222' },
  printFooter: { flexDirection:'row', padding:16, gap:12, backgroundColor:'#fff', borderTopWidth:1, borderTopColor:'#ddd' },
  printCancelBtn: { flex:1, padding:16, borderRadius:8, alignItems:'center', backgroundColor:'#e0e0e0' },
  printCancelTxt: { fontWeight:'bold', fontSize:15, color:'#333' },
  printConfirmBtn: { flex:2, padding:16, borderRadius:8, alignItems:'center', backgroundColor:'#8B0000' },
  printConfirmTxt: { fontWeight:'bold', fontSize:15, color:'white' },
});