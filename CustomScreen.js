import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, LayoutAnimation, Modal, Share, PanResponder, Dimensions, Platform } from 'react-native';
const SCREEN_WIDTH = Dimensions.get('window').width;
import { FIREBASE_URL } from './App';
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

const fmtDate = (ts) => { if (!ts) return null; const d = new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };
const fmtDateTime = (ts) => { if (!ts) return null; const d = new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

const STD_HEIGHTS = ['203','208','213','218','223'];
const STD_WIDTHS  = ['83','88','93','98','103'];
const INIT_FORM   = { customer:'', orderNo:'', h:'', w:'', hinges:'2', qty:'1', glassDim:'', armor:'ΜΟΝΗ', side:'ΔΕΞΙΑ', lock:'', notes:'', status:'PENDING', hardware:'', installation:'ΟΧΙ', caseType:'ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ', caseMaterial:'DKP', deliveryDate:'', sasiType:'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', coatings:[] };

const PHASES = [
  { key:'laser',    label:'🔴 LASER ΚΟΠΕΣ' },
  { key:'cases',    label:'🟡 ΚΑΣΕΣ' },
  { key:'montSasi', label:'🔵 ΚΑΤΑΣΚΕΥΗ ΣΑΣΙ' },
  { key:'montDoor', label:'🟢 ΜΟΝΤΑΡΙΣΜΑ / ΕΠΕΝΔΥΣΗ ΠΟΡΤΑΣ' },
  { key:'vafio',    label:'⚫ ΒΑΦΕΙΟ' },
];

const DIPLI_PHASES = [
  { key:'laser',    label:'🔴 LASER ΚΟΠΕΣ' },
  { key:'montSasi', label:'🔵 ΚΑΤΑΣΚΕΥΗ ΣΑΣΙ' },
  { key:'montDoor', label:'🟢 ΜΟΝΤΑΡΙΣΜΑ / ΕΠΕΝΔΥΣΗ ΠΟΡΤΑΣ' },
];

const initPhases = () => {
  const p = {};
  PHASES.forEach(ph => { p[ph.key] = { active:true, printed:false, done:false }; });
  return p;
};

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

export default function CustomScreen({ customOrders, setCustomOrders, soldOrders, setSoldOrders, customers, onRequestAddCustomer, sasiOrders=[], setSasiOrders, caseOrders=[], setCaseOrders, coatings=[] }) {
  const [expanded, setExpanded] = useState({ pending:false, prod:false, ready:false, archive:false, stdList:true, stdMoni:true, stdDipli:true, stdReady:true, stdSold:false, stdReadyD:true, stdSoldD:false, stdMoniOpen:false, stdDipliOpen:false, dipliProd:true });
  const [dipliProdTab, setDipliProdTab] = useState('laser');
  const [showHardwarePicker, setShowHardwarePicker] = useState(false);
  const [showCoatingsPicker, setShowCoatingsPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customHardwareText, setCustomHardwareText] = useState('');
  const [showCustomHardwareInput, setShowCustomHardwareInput] = useState(false);
  const [stdTab, setStdTab] = useState('ΜΟΝΗ');
  const [activeProdPhase, setActiveProdPhase] = useState('laser'); // ποια υποκαρτέλα παραγωγής είναι ανοιχτή
  const [customForm, setCustomForm] = useState(INIT_FORM);
  const [orderType, setOrderType]  = useState('ΕΙΔΙΚΗ');
  const [editingOrder, setEditingOrder] = useState(null); // η πόρτα που επεξεργαζόμαστε
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [sellModal, setSellModal]  = useState({ visible:false, orderId:null, totalQty:1 });
  const [printSelected, setPrintSelected] = useState({});
  const [printPreview, setPrintPreview] = useState({ visible:false, phaseKey:null, orders:[], copies:1 });

  const orderNoRef=useRef(); const hRef=useRef(); const wRef=useRef();
  const hingeRef=useRef(); const glassRef=useRef(); const lockRef=useRef(); const notesRef=useRef();
  const customerSelectedRef = useRef(false);
  const prodScrollRef = useRef(null);
  const [pageWidth, setPageWidth] = useState(SCREEN_WIDTH);

  const syncToCloud = async (o) => { try { await fetch(`${FIREBASE_URL}/orders/${o.id}.json`,{method:'PUT',body:JSON.stringify(o)}); } catch { Alert.alert("Σφάλμα","Δεν αποθηκεύτηκε."); } };
  const deleteFromCloud = async (id) => { try { await fetch(`${FIREBASE_URL}/orders/${id}.json`,{method:'DELETE'}); } catch(e){} };

  // Αυτόματο πέρασμα ΔΙΠΛΗΣ στα ΕΤΟΙΜΑ όταν τελειώσουν οι φάσεις ΚΑΙ υπάρχει κάσα
  useEffect(() => {
    const dipliProdOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='DIPLI_PROD');
    if(dipliProdOrders.length===0) return;
    const caseReady = caseOrders.filter(o=>o.status==='READY');
    const caseUsed = {};
    let updated = false;
    const newOrders = customOrders.map(o=>{
      if(o.orderType!=='ΤΥΠΟΠΟΙΗΜΕΝΗ'||o.sasiType!=='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'||o.status!=='DIPLI_PROD') return o;
      // Έλεγχος αν όλες οι φάσεις είναι done
      const allDone = o.dipliPhases && Object.keys(o.dipliPhases).every(k=>!o.dipliPhases[k].active||o.dipliPhases[k].done);
      if(!allDone) return o;
      // Έλεγχος αποθήκης κάσας (FIFO)
      const key=`${o.h}_${o.w}_${o.side}`;
      const caseStock=caseReady.filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
      const hasCase=(caseUsed[key]||0)<caseStock;
      caseUsed[key]=(caseUsed[key]||0)+1;
      if(!hasCase) return o;
      // Και τα δύο ΟΚ → μεταφορά στα ΕΤΟΙΜΑ
      updated = true;
      const upd = {...o, status:'STD_READY', readyAt:Date.now()};
      syncToCloud(upd);
      return upd;
    });
    if(updated) setCustomOrders(newOrders);
  }, [customOrders, caseOrders]);
  const resetForm = () => { setCustomForm(INIT_FORM); setCustomerSearch(''); setSelectedCustomer(null); setShowCustomerList(false); setEditingOrder(null); };

  // Αλλαγή tab — αν υπάρχει πόρτα σε επεξεργασία → επαναφέρει πρώτα
  const handleTabSwitch = (newType) => {
    if (newType === orderType) return;
    if (editingOrder) {
      // Επαναφέρει την πόρτα στη λίστα
      setCustomOrders(prev => [editingOrder, ...prev]);
      syncToCloud(editingOrder);
      setEditingOrder(null);
    }
    resetForm();
    setOrderType(newType);
  };

  const handleGlassEnter = () => {
    if (customForm.glassDim.length>0 && !customForm.glassDim.includes('X')) {
      setCustomForm({...customForm, glassDim:customForm.glassDim+'X'});
      setTimeout(()=>glassRef.current?.focus(),10);
    } else { lockRef.current?.focus(); }
  };

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
                  setCustomForm(f=>({...f, customer:newCustomer.name}));
                });
              }
            }}
          ]
        );
        return;
      }
    }
    const newOrder = {...customForm, orderType, id:Date.now().toString(), createdAt:Date.now(), status: orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ' ? 'STD_PENDING' : 'PENDING'};
    setCustomOrders([newOrder,...customOrders]);
    await syncToCloud(newOrder);
    resetForm();

    // Αυτόματη πρόταση παραγωγής για ΤΥΠΟΠΟΙΗΜΕΝΗ
    if (orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ' && setSasiOrders && setCaseOrders) {
      const h = newOrder.h, w = newOrder.w, side = newOrder.side;
      const customer = newOrder.customer || `#${newOrder.orderNo}`;
      const customerQty = parseInt(newOrder.qty)||1;
      const allStdOrders = [...customOrders, newOrder].filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ' && (o.status==='STD_PENDING'||o.status==='DIPLI_PROD'||!o.status));
      const sameSize = o => String(o.h)===String(h) && String(o.w)===String(w) && o.side===side;

      // Ξεχωριστό neededQty για ΜΟΝΗ και ΔΙΠΛΗ
      const neededMoni = allStdOrders.filter(o=>sameSize(o)&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)).reduce((s,o)=>s+(parseInt(o.qty)||1),0);
      const neededDipli = allStdOrders.filter(o=>sameSize(o)&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').reduce((s,o)=>s+(parseInt(o.qty)||1),0);
      const neededTotal = neededMoni + neededDipli;

      // --- ΣΑΣΙ (μόνο ΜΟΝΗ) ---
      if (newOrder.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !newOrder.sasiType) {
        const sasiReady = sasiOrders.filter(o=>o.status==='READY'&&sameSize({h:o.selectedHeight,w:o.selectedWidth,side:o.side})).reduce((s,o)=>s+(parseInt(o.qty)||1),0);
        const sasiProd = sasiOrders.filter(o=>o.status!=='SOLD'&&o.status!=='READY'&&String(o.selectedHeight)===String(h)&&String(o.selectedWidth)===String(w)&&o.side===side);

        if (sasiReady < neededMoni) {
          const shortfall = neededMoni - sasiReady;
          if (sasiProd.length > 0) {
            const existing = sasiProd[0];
            const customerMap = {};
            if (existing.autoNote) {
              existing.autoNote.split(',').forEach(entry => {
                const match = entry.trim().match(/^(.+)\s+\((\d+)τεμ\)$/);
                if (match) customerMap[match[1].trim()] = (customerMap[match[1].trim()]||0) + parseInt(match[2]);
              });
            }
            customerMap[customer] = (customerMap[customer]||0) + customerQty;
            const newNote = Object.entries(customerMap).map(([n,q])=>`${n} (${q}τεμ)`).join(', ');
            const newQty = (parseInt(existing.qty)||0) + customerQty;
            const upd = {...existing, autoNote: newNote, qty: String(newQty), notes: `⚡ Αυτόματη πρόταση`};
            setSasiOrders(prev => prev.map(o=>o.id===existing.id?upd:o));
            await fetch(`${FIREBASE_URL}/sasi_orders/${upd.id}.json`,{method:'PUT',body:JSON.stringify(upd)});
          } else {
            const autoSasi = {
              id: `auto_sasi_${Date.now()}`,
              model: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ',
              selectedHeight: h, selectedWidth: w,
              size: `${h}x${w}`, side, qty: String(shortfall),
              status: 'PENDING', createdAt: Date.now(),
              autoNote: `${customer} (${customerQty}τεμ)`,
              isAuto: true, notes: `⚡ Αυτόματη πρόταση`
            };
            setSasiOrders(prev => [autoSasi, ...prev]);
            await fetch(`${FIREBASE_URL}/sasi_orders/${autoSasi.id}.json`,{method:'PUT',body:JSON.stringify(autoSasi)});
          }
        }
      }

      // --- ΚΑΣΕΣ (ΜΟΝΗ + ΔΙΠΛΗ — ξεχωριστά ανά τύπο κάσας) ---
      const caseModel = (newOrder.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? 'ΚΑΣΑ ΑΝΟΙΧΤΗ' : 'ΚΑΣΑ ΚΛΕΙΣΤΗ';
      const caseReady = caseOrders.filter(o=>o.status==='READY'&&o.model===caseModel&&String(o.selectedHeight)===String(h)&&String(o.selectedWidth)===String(w)&&o.side===side).reduce((s,o)=>s+(parseInt(o.qty)||1),0);
      const caseProd = caseOrders.filter(o=>o.status!=='SOLD'&&o.status!=='READY'&&o.model===caseModel&&String(o.selectedHeight)===String(h)&&String(o.selectedWidth)===String(w)&&o.side===side);

      if (caseReady < neededTotal) {
        const shortfall = neededTotal - caseReady;
        const customerQty = parseInt(newOrder.qty)||1;
        if (caseProd.length > 0) {
          const existing = caseProd[0];
          const customerMap = {};
          if (existing.autoNote) {
            existing.autoNote.split(',').forEach(entry => {
              const match = entry.trim().match(/^(.+)\s+\((\d+)τεμ\)$/);
              if (match) customerMap[match[1].trim()] = (customerMap[match[1].trim()]||0) + parseInt(match[2]);
            });
          }
          customerMap[customer] = (customerMap[customer]||0) + customerQty;
          const newNote = Object.entries(customerMap).map(([n,q])=>`${n} (${q}τεμ)`).join(', ');
          const newQty = (parseInt(existing.qty)||0) + customerQty;
          const allCustomers = Object.keys(customerMap).join(', ');
          const upd = {...existing, autoNote: newNote, qty: String(newQty), notes: `⚡ Αυτόματη πρόταση`};
          setCaseOrders(prev => prev.map(o=>o.id===existing.id?upd:o));
          await fetch(`${FIREBASE_URL}/case_orders/${upd.id}.json`,{method:'PUT',body:JSON.stringify(upd)});
        } else {
          const autoCase = {
            id: `auto_case_${Date.now()}`,
            model: caseModel,
            selectedHeight: h, selectedWidth: w,
            size: `${h}x${w}`, side, qty: String(shortfall),
            status: 'PENDING', createdAt: Date.now(),
            autoNote: `${customer} (${customerQty}τεμ)`,
            isAuto: true, notes: `⚡ Αυτόματη πρόταση`
          };
          setCaseOrders(prev => [autoCase, ...prev]);
          await fetch(`${FIREBASE_URL}/case_orders/${autoCase.id}.json`,{method:'PUT',body:JSON.stringify(autoCase)});
        }
      }
    }

    Alert.alert("VAICON", orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ' ? "Η τυποποιημένη παραγγελία αποθηκεύτηκε!" : "Η παραγγελία αποθηκεύτηκε!");
  };

  const editOrder = (order) => {
    setCustomForm(order); setOrderType(order.orderType||'ΕΙΔΙΚΗ');
    setCustomerSearch(order.customer||'');
    setEditingOrder(order); // αποθηκεύω αναφορά για επαναφορά αν αλλάξει tab
    setCustomOrders(customOrders.filter(o=>o.id!==order.id));
    deleteFromCloud(order.id);
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
  };

  const updateStatus = async (id, newStatus) => {
    const now=Date.now(); const order=customOrders.find(o=>o.id===id); if(!order) return;
    if (newStatus==='PROD') { moveToProd(id); return; }
    if (newStatus==='SOLD') {
      const totalQty=parseInt(order.qty)||1;
      if (totalQty<=1) {
        const upd={...order,status:'SOLD',soldAt:now};
        setSoldOrders([upd,...soldOrders]); setCustomOrders(customOrders.filter(o=>o.id!==id)); await syncToCloud(upd);
      } else { setSellModal({visible:true,orderId:id,totalQty}); }
    } else {
      let upd;
      setCustomOrders(customOrders.map(o=>{ if(o.id===id){upd={...o,status:newStatus,[`${newStatus.toLowerCase()}At`]:now};return upd;} return o; }));
      if(upd) await syncToCloud(upd);
    }
  };

  const handleSellConfirm = async (sellQty) => {
    const now=Date.now(); const {orderId,totalQty}=sellModal;
    setSellModal({visible:false,orderId:null,totalQty:1});
    const order=customOrders.find(o=>o.id===orderId); if(!order) return;
    if (sellQty===totalQty) {
      const upd={...order,status:'SOLD',soldAt:now};
      setSoldOrders([upd,...soldOrders]); setCustomOrders(customOrders.filter(o=>o.id!==orderId)); await syncToCloud(upd);
    } else {
      const soldEntry={...order,id:Date.now().toString(),qty:String(sellQty),status:'SOLD',soldAt:now,partialNote:`${sellQty} από ${totalQty}`};
      const remaining={...order,qty:String(totalQty-sellQty),remainingNote:`Υπόλοιπο: ${totalQty-sellQty} από ${totalQty}`};
      setSoldOrders([soldEntry,...soldOrders]);
      setCustomOrders(customOrders.map(o=>o.id===orderId?remaining:o));
      await syncToCloud(soldEntry); await syncToCloud(remaining);
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
    const tableCSS = `
      body{font-family:Arial,sans-serif;margin:5mm;color:#000;background:#fff;}
      h1{font-size:15px;margin-bottom:2px;font-weight:bold;}
      h2{font-size:11px;margin-top:0;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;font-size:10px;}
      th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;white-space:nowrap;}
      td{padding:5px 4px;border-bottom:1px solid #000;vertical-align:top;}
      tr:last-child td{border-bottom:2px solid #000;}
      .page-break{page-break-after:always;}
      @media print{@page{size:A4 landscape;margin:5mm;}*{color:#000!important;background:#fff!important;}}
    `;
    const buildTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
        const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
        const tzami = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.glassDim||'—');
        return `<tr>
          <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
          <td style="font-weight:bold;font-size:13px">${o.qty&&parseInt(o.qty)>1?o.qty:'1'}</td>
          <td style="font-weight:bold;font-size:13px">${o.h||'—'}x${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:13px">${fora}</td>
          <td>${thorakisi}</td>
          <td style="font-weight:bold;font-size:13px">${mentesedesVal}</td>
          <td style="font-weight:bold;font-size:13px">${tzami}</td>
          <td>${kleidaria}</td>
          <td>${o.caseType||'—'}</td>
          <td>${o.caseMaterial||'DKP'}</td>
          <td>${o.hardware||'—'}</td>
          <td>${o.installation==='ΝΑΙ'?'✓':''}</td>
          ${showCoatings?`<td>${(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</td>`:''}
          <td style="min-width:180px">${o.notes||''}</td>
        </tr>`;
      }).join('');
      return `<table><thead><tr>
        <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th>
        <th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Χρώμα</th><th>Μον.</th>${showCoatings?'<th>Επένδυση</th>':''}<th>Παρατηρήσεις</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const pages = copies.map((copy, idx) => `
      <div class="${idx < copies.length-1 ? 'page-break' : ''}">
        <h1>${copy.title}</h1>
        <h2>Σύνολο: ${copy.orders.length} παραγγελίες</h2>
        ${buildTable(copy.orders)}
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
      const allCopies = getCopies(orders, phaseLabel, dateStr);
      const selectedCopies = copies===4 ? allCopies : [allCopies[0]];
      const html = buildPrintHTML(selectedCopies, phaseKey);
      await printHTML(html, `VAICON — ${phaseLabel}`);
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

    const allCopies = getCopies(orders, phaseLabel, dateStr);
    const previewCopies = copies===4 ? allCopies : [allCopies[0]];

    const COLS = [
      {label:'Νο',w:50},{label:'Τεμ.',w:35},{label:'Διάσταση',w:80},{label:'Φορά',w:40},
      {label:'Θωράκιση',w:70},{label:'Μεντ.',w:35},{label:'Τζάμι',w:55},{label:'Κλειδαριά',w:70},
      {label:'Χρώμα',w:50},{label:'Τ.Κάσας',w:65},{label:'Υλ.Κάσας',w:65},{label:'Μον.',w:40},{label:'Επένδυση',w:120},{label:'Παρατηρήσεις',w:220},
    ];

    const renderTable = (sortedOrders) => (
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
            const tzami = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.glassDim||'—');
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

    return (
      <Modal visible={true} animationType="slide" onRequestClose={()=>setPrintPreview({visible:false,phaseKey:null,orders:[],copies:1})}>
        <View style={styles.previewContainer}>
          {/* HEADER */}
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>VAICON — {phaseLabel}</Text>
            <Text style={styles.previewSub}>📅 {dateStr} &nbsp;|&nbsp; {orders.length} παραγγελίες &nbsp;|&nbsp; {copies===4?'4 ΑΝΤΙΓΡΑΦΑ':'1 ΑΝΤΙΓΡΑΦΟ'}</Text>
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
    const newPhases = {...order.phases, [phaseKey]:{...order.phases[phaseKey], done:true}};
    // Ελέγχω αν όλες οι active φάσεις είναι done
    const allDone = Object.keys(newPhases).every(k => !newPhases[k].active || newPhases[k].done);
    if (allDone) {
      Alert.alert(
        "⚠️ ΠΡΟΣΟΧΗ",
        "Ολοκληρώνεται η διαδικασία παραγωγής.\nΗ πόρτα μεταφέρεται στην ΑΠΟΘΗΚΗ.",
        [
          { text:"ΑΚΥΡΟ", style:"cancel", onPress: ()=>{} },
          { text:"ΕΠΙΒΕΒΑΙΩΣΗ", style:"default", onPress: async () => {
            const upd = {...order, phases:newPhases, status:'READY', readyAt:Date.now()};
            setCustomOrders(customOrders.filter(o=>o.id!==orderId));
            setCustomOrders(prev=>[...prev, upd].sort((a,b)=>b.createdAt-a.createdAt)); // δεν χρειάζεται sort αλλά ok
            // Απλούστερα:
            setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
            await syncToCloud(upd);
          }}
        ]
      );
    } else {
      const upd = {...order, phases:newPhases};
      setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
      await syncToCloud(upd);
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

  const cancelOrder = (id) => Alert.alert("Ακύρωση","Οριστική διαγραφή;",[{text:"Όχι"},{text:"Ναι",style:"destructive",onPress:async()=>{setCustomOrders(customOrders.filter(o=>o.id!==id));await deleteFromCloud(id);}}]);
  const deleteFromArchive = (id) => Alert.alert("Διαγραφή","Διαγραφή από αρχείο;",[{text:"Όχι"},{text:"Ναι",style:"destructive",onPress:async()=>{setSoldOrders(soldOrders.filter(o=>o.id!==id));await deleteFromCloud(id);}}]);
  const toggleSection = (s) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setExpanded({...expanded,[s]:!expanded[s]}); };

  const renderOrderCard = (order, isArchive=false) => {
    const bc = isArchive?'#333':(order.status==='PENDING'?'#ff4444':order.status==='PROD'?'#ffbb33':'#00C851');
    const next = order.status==='PENDING'?'PROD':order.status==='PROD'?'READY':'SOLD';
    const btn  = isArchive?'ΔΙΑΓΡΑΦΗ':(order.status==='PENDING'?'ΕΝΑΡΞΗ':order.status==='PROD'?'ΕΤΟΙΜΗ':'ΠΩΛΗΣΗ');
    const btnC = isArchive?'#000':(order.status==='PENDING'?'#ffbb33':order.status==='PROD'?'#00C851':'#222');
    const isStd = order.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ';
    return (
      <TouchableOpacity key={order.id} onLongPress={()=>!isArchive&&order.status==='PENDING'&&editOrder(order)} delayLongPress={1000} activeOpacity={0.7} style={[styles.orderCard,{borderLeftColor:bc}]}>
        <View style={styles.cardContent}>
          <View style={{flexDirection:'row', alignItems:'center', marginBottom:3}}>
            <View style={[styles.typeBadge, isStd?styles.typeBadgeStd:styles.typeBadgeCustom]}>
              <Text style={styles.typeBadgeTxt}>{isStd?'📐 ΤΥΠ.':'✏️ ΕΙΔΙΚΗ'}</Text>
            </View>
            {order.customer?<Text style={[styles.cardCustomer,{marginLeft:6}]}>👤 {order.customer}</Text>:null}
          </View>
          <Text style={styles.cardDetails}>#{order.orderNo} | {order.h}x{order.w} | {order.side}{!isStd?` | ${order.armor} ΘΩΡ.`:''}</Text>
          {!isStd&&<Text style={styles.cardSubDetails}>Μεντ: {order.hinges}{order.glassDim?` | Τζ: ${order.glassDim}`:''}</Text>}
          {!isStd&&<Text style={styles.cardSubDetails}>Κλειδ: {order.lock||'—'} | {order.hardware}{order.installation==='ΝΑΙ'?' | 🔧':''}</Text>}
          {isStd&&<Text style={styles.cardSubDetails}>{order.hardware}{order.installation==='ΝΑΙ'?' | 🔧 ΜΟΝΤΑΡΙΣΜΑ':''}</Text>}
          {order.coatings&&order.coatings.length>0&&<Text style={[styles.cardSubDetails,{color:'#007AFF'}]}>🎨 {order.coatings.join(', ')}</Text>}
          {order.qty&&parseInt(order.qty)>1?<Text style={[styles.cardSubDetails,{color:'#007AFF',fontWeight:'bold'}]}>Τεμ: {order.qty}</Text>:null}
          {order.notes?<Text style={styles.cardSubDetails}>Σημ: {order.notes}</Text>:null}
          <View style={styles.datesRow}>
            {fmtDate(order.createdAt)&&<Text style={styles.dateChip}>📅 {fmtDate(order.createdAt)}</Text>}
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
            <View style={[styles.typeBadge, isStd?styles.typeBadgeStd:styles.typeBadgeCustom]}>
              <Text style={styles.typeBadgeTxt}>{isStd?'📐 ΤΥΠ.':'✏️ ΕΙΔΙΚΗ'}</Text>
            </View>
            <Text style={[styles.cardDetails,{fontWeight:'bold',marginLeft:6}]}>#{order.orderNo}</Text>
          </View>
          {order.customer?<Text style={[styles.cardSubDetails,{marginTop:2}]}>👤 {order.customer}</Text>:null}
          <Text style={styles.cardDetails}>{order.h}x{order.w} | {order.side}{!isStd?` | ${order.armor} ΘΩΡ.`:''}</Text>
          {!isStd&&<Text style={styles.cardSubDetails}>Μεντ: {order.hinges}{order.glassDim?` | Τζ: ${order.glassDim}`:''} | Κλειδ: {order.lock||'—'}</Text>}
          <Text style={styles.cardSubDetails}>{order.hardware}{order.installation==='ΝΑΙ'?' | 🔧 ΜΟΝΤΑΡΙΣΜΑ':''}</Text>
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
    const prodOrders = customOrders.filter(o=>o.status==='PROD');
    const maxPhaseCount = prodOrders.length === 0 ? 0 : Math.max(...PHASES.map(ph =>
      prodOrders.filter(o => o.phases?.[ph.key]?.active && !o.phases?.[ph.key]?.done).length
    ));

    const phaseKeys = PHASES.map(p=>p.key);

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
            </ScrollView>

            {/* ΚΟΥΜΠΙΑ ΕΠΙΛΟΓΗΣ + ΕΚΤΥΠΩΣΗΣ */}
            <View style={{flexDirection:'row', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap'}}>
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
            </View>

            {/* PAGED SCROLL — ένα page ανά φάση */}
            <ScrollView
              ref={prodScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onLayout={e=>{ setPageWidth(e.nativeEvent.layout.width); }}
              onMomentumScrollEnd={e=>{
                const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
                if (page >= 0 && page < PHASES.length) setActiveProdPhase(PHASES[page].key);
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
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{flex:1}}>
      {renderPrintPreview()}
      <SellModal visible={sellModal.visible} totalQty={sellModal.totalQty} onConfirm={handleSellConfirm} onCancel={()=>setSellModal({visible:false,orderId:null,totalQty:1})} />
      <ScrollView style={{padding:10}}>
        <View style={{paddingBottom:120}}>
          <Text style={styles.sectionTitle}>ΚΑΤΑΧΩΡΗΣΗ ΝΕΑΣ ΠΑΡΑΓΓΕΛΙΑΣ</Text>

          {/* ΕΠΙΛΟΓΗ ΤΥΠΟΥ */}
          <View style={styles.typeRow}>
            <TouchableOpacity style={[styles.typeBtn, orderType==='ΕΙΔΙΚΗ'&&styles.typeBtnActive]} onPress={()=>handleTabSwitch('ΕΙΔΙΚΗ')}>
              <Text style={[styles.typeBtnTxt, orderType==='ΕΙΔΙΚΗ'&&{color:'white'}]}>✏️ ΕΙΔΙΚΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeBtn, orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&styles.typeBtnActiveStd]} onPress={()=>handleTabSwitch('ΤΥΠΟΠΟΙΗΜΕΝΗ')}>
              <Text style={[styles.typeBtnTxt, orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&{color:'white'}]}>📐 ΤΥΠΟΠΟΙΗΜΕΝΗ</Text>
            </TouchableOpacity>
          </View>

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
                <TextInput style={styles.input} placeholder="Αναζήτηση Πελάτη" value={customerSearch}
                  onChangeText={v=>{setCustomerSearch(v);setShowCustomerList(true);setCustomForm({...customForm,customer:v});}}
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
                      <TouchableOpacity key={c.id} style={styles.customerOption} onPress={()=>{
                        customerSelectedRef.current = true;
                        setCustomForm({...customForm,customer:c.name});
                        setCustomerSearch(c.name); setSelectedCustomer(c); setShowCustomerList(false);
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

          {/* ΝΟΥΜΕΡΟ ΠΑΡΑΓΓΕΛΙΑΣ */}
          <TextInput ref={orderNoRef} style={styles.input} placeholder="Νούμερο Παραγγελίας (Υποχρεωτικό)" keyboardType="numeric" value={customForm.orderNo} selectTextOnFocus
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
                            setCustomForm(f=>({...f,customer:newCustomer.name}));
                          });
                        }
                      }}
                    ]
                  );
                }
              }
            }}
            onChangeText={v=>setCustomForm({...customForm,orderNo:v})}
            onBlur={()=>{
              if (!customForm.orderNo) return;
              const exists = customOrders.some(o=>o.orderNo===customForm.orderNo && o.id!==editingOrder?.id);
              if (exists) {
                // Βρες το base (χωρίς τελικό γράμμα αν υπάρχει)
                const base = customForm.orderNo;
                const letters = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
                let suggested = base;
                for(let i=0; i<letters.length; i++){
                  const candidate = base+'-'+letters[i];
                  if(!customOrders.some(o=>o.orderNo===candidate && o.id!==editingOrder?.id)){
                    suggested = candidate;
                    break;
                  }
                }
                Alert.alert(
                  "⚠️ Διπλότυπο Νούμερο",
                  `Το νούμερο ${customForm.orderNo} υπάρχει ήδη.\nΠρόταση: ${suggested}`,
                  [
                    { text:"ΚΡΑΤΩ "+customForm.orderNo, style:"cancel" },
                    { text:"ΧΡΗΣΙΜΟΠΟΙΩ "+suggested, onPress:()=>setCustomForm(f=>({...f,orderNo:suggested})) }
                  ]
                );
              }
            }}
            blurOnSubmit={false} />

          {/* ΦΟΡΜΑ ΕΙΔΙΚΗΣ */}
          {orderType==='ΕΙΔΙΚΗ'&&(<>
            <View style={styles.row}>
              <TextInput ref={hRef} style={styles.inputHalf} placeholder="Ύψος" keyboardType="numeric" value={customForm.h} selectTextOnFocus onChangeText={v=>setCustomForm({...customForm,h:v})} onSubmitEditing={()=>wRef.current?.focus()} blurOnSubmit={false}/>
              <TextInput ref={wRef} style={styles.inputHalf} placeholder="Πλάτος" keyboardType="numeric" value={customForm.w} selectTextOnFocus onChangeText={v=>setCustomForm({...customForm,w:v})} onSubmitEditing={()=>hingeRef.current?.focus()} blurOnSubmit={false}/>
            </View>
            <View style={styles.row}>
              <View style={styles.inputHalfContainer}>
                <Text style={styles.smallLabel}>Μεντεσέδες (2-5):</Text>
                <TextInput ref={hingeRef} style={styles.hingeInput} maxLength={1} keyboardType="numeric" value={customForm.hinges} selectTextOnFocus onChangeText={v=>{if(['2','3','4','5',''].includes(v))setCustomForm({...customForm,hinges:v});}} onSubmitEditing={()=>glassRef.current?.focus()} blurOnSubmit={false}/>
              </View>
              <View style={styles.inputHalfContainer}>
                <Text style={styles.smallLabel}>Τζάμι:</Text>
                <TextInput ref={glassRef} style={styles.inputFull} placeholder="Διάσταση" keyboardType="numeric" value={customForm.glassDim} selectTextOnFocus onChangeText={v=>setCustomForm({...customForm,glassDim:v})} onSubmitEditing={handleGlassEnter} blurOnSubmit={false}/>
              </View>
            </View>
            <View style={styles.row}>
              {['ΔΕΞΙΑ','ΑΡΙΣΤΕΡΗ'].map(s=>(
                <TouchableOpacity key={s} style={[styles.tab,customForm.side===s&&styles.activeTab]} onPress={()=>setCustomForm({...customForm,side:s})}>
                  <Text style={{color:customForm.side===s?'white':'black',fontWeight:'bold'}}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              {['ΜΟΝΗ','ΔΙΠΛΗ'].map(a=>(
                <TouchableOpacity key={a} style={[styles.tab,customForm.armor===a&&styles.activeTab]} onPress={()=>setCustomForm({...customForm,armor:a})}>
                  <Text style={{color:customForm.armor===a?'white':'black',fontWeight:'bold'}}>{a} ΘΩΡ.</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput ref={lockRef} style={styles.input} placeholder="Κλειδαριά" value={customForm.lock} selectTextOnFocus onChangeText={v=>setCustomForm({...customForm,lock:v})} onSubmitEditing={()=>notesRef.current?.focus()} blurOnSubmit={false}/>
          </>)}

          {/* ΦΟΡΜΑ ΤΥΠΟΠΟΙΗΜΕΝΗΣ */}
          {orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(<>
            <Text style={styles.smallLabel}>Ύψος (cm):</Text>
            <View style={[styles.row,{flexWrap:'wrap',marginBottom:4}]}>
              {STD_HEIGHTS.map(h=>(
                <TouchableOpacity key={h} style={[styles.dimBtn,customForm.h===h&&styles.dimActive]} onPress={()=>setCustomForm({...customForm,h:h})}>
                  <Text style={[styles.dimTxt,customForm.h===h&&styles.dimActiveTxt]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.smallLabel}>Πλάτος (cm):</Text>
            <View style={[styles.row,{flexWrap:'wrap',marginBottom:8}]}>
              {STD_WIDTHS.map(w=>(
                <TouchableOpacity key={w} style={[styles.dimBtn,customForm.w===w&&styles.dimActive]} onPress={()=>setCustomForm({...customForm,w:w})}>
                  <Text style={[styles.dimTxt,customForm.w===w&&styles.dimActiveTxt]}>{w}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              {['ΔΕΞΙΑ','ΑΡΙΣΤΕΡΗ'].map(s=>(
                <TouchableOpacity key={s} style={[styles.tab,customForm.side===s&&styles.activeTab]} onPress={()=>setCustomForm({...customForm,side:s})}>
                  <Text style={{color:customForm.side===s?'white':'black',fontWeight:'bold'}}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>)}

          {/* ΧΡΩΜΑ & ΜΟΝΤΑΡΙΣΜΑ */}
          <View style={styles.hwRow}>
            <View style={styles.hwBox}>
              <Text style={styles.smallLabel}>Χρώμα Εξαρτημάτων:</Text>
              <TouchableOpacity
                style={[styles.input,{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:4}]}
                onPress={()=>setShowHardwarePicker(true)}>
                <Text style={{fontSize:14,color:customForm.hardware?'#000':'#aaa'}}>
                  {customForm.hardware||'Επιλέξτε...'}
                </Text>
                <Text style={{color:'#888'}}>▼</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.hwBox}>
              <Text style={styles.smallLabel}>Μονταρισμα:</Text>
              <View style={styles.hwBtns}>
                {['ΝΑΙ','ΟΧΙ'].map(v=>(
                  <TouchableOpacity key={v} style={[styles.hwBtn,customForm.installation===v&&(v==='ΝΑΙ'?styles.hwBtnYes:styles.hwBtnNo)]} onPress={()=>setCustomForm({...customForm,installation:v})}>
                    <Text style={[styles.hwBtnTxt,customForm.installation===v&&{color:'white'}]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* ΕΠΕΝΔΥΣΗ */}
          <View style={{marginBottom:8}}>
            <Text style={styles.smallLabel}>Επένδυση:</Text>
            <TouchableOpacity
              style={[styles.input,{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:4}]}
              onPress={()=>setShowCoatingsPicker(true)}>
              <Text style={{fontSize:13,color:(customForm.coatings&&customForm.coatings.length>0)?'#000':'#aaa',flex:1}} numberOfLines={1}>
                {(customForm.coatings&&customForm.coatings.length>0) ? customForm.coatings.join(', ') : 'Επιλέξτε επενδύσεις...'}
              </Text>
              <Text style={{color:'#888'}}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* ΤΥΠΟΣ ΚΑΣΑΣ & ΥΛΙΚΟ ΚΑΣΑΣ — υλικό μόνο για ΕΙΔΙΚΗ */}
          <View style={styles.hwRow}>
            <View style={styles.hwBox}>
              <Text style={styles.smallLabel}>Τύπος Κάσας:</Text>
              <View style={styles.hwBtns}>
                {['ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ','ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ'].map(t=>(
                  <TouchableOpacity key={t} style={[styles.hwBtn, customForm.caseType===t&&styles.hwBtnActive]} onPress={()=>setCustomForm({...customForm,caseType:t})}>
                    <Text style={[styles.hwBtnTxt, customForm.caseType===t&&{color:'white'}]}>{t==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {orderType==='ΕΙΔΙΚΗ'?(
              <View style={styles.hwBox}>
                <Text style={styles.smallLabel}>Υλικό Κάσας:</Text>
                <View style={styles.hwBtns}>
                  {['DKP','ΓΑΛΒΑΝΙΖΕ'].map(m=>(
                    <TouchableOpacity key={m} style={[styles.hwBtn, customForm.caseMaterial===m&&styles.hwBtnActive]} onPress={()=>setCustomForm({...customForm,caseMaterial:m})}>
                      <Text style={[styles.hwBtnTxt, customForm.caseMaterial===m&&{color:'white'}]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ):(
              <View style={styles.hwBox}>
                <Text style={styles.smallLabel}>Τύπος Σασί:</Text>
                <View style={styles.hwBtns}>
                  {['ΜΟΝΗ ΘΩΡΑΚΙΣΗ','ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'].map(t=>(
                    <TouchableOpacity key={t} style={[styles.hwBtn, customForm.sasiType===t&&styles.hwBtnActive]} onPress={()=>setCustomForm({...customForm,sasiType:t})}>
                      <Text style={[styles.hwBtnTxt, customForm.sasiType===t&&{color:'white'}]}>{t==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'?'ΜΟΝΗ':'ΔΙΠΛΗ'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          <Text style={styles.smallLabel}>Τεμάχια:</Text>
          <TextInput style={styles.qtyInput} keyboardType="numeric" value={customForm.qty} onChangeText={v=>setCustomForm({...customForm,qty:v})} selectTextOnFocus/>

          <TextInput style={[styles.input,{height:80,textAlignVertical:'top',marginTop:8}]} placeholder="Παρατηρήσεις" value={customForm.notes} multiline onChangeText={v=>setCustomForm({...customForm,notes:v})}/>

          {/* ΠΡΟΤΕΙΝΟΜΕΝΗ ΗΜΕΡΟΜΗΝΙΑ ΠΑΡΑΔΟΣΗΣ */}
          <Text style={[styles.smallLabel,{marginTop:8}]}>Προτεινόμενη Ημερομηνία Παράδοσης:</Text>
          <TouchableOpacity
            style={[styles.input,{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}]}
            onPress={()=>setShowDatePicker(true)}>
            <Text style={{fontSize:14,color:customForm.deliveryDate?'#000':'#aaa'}}>
              {customForm.deliveryDate||'Επιλέξτε ημερομηνία...'}
            </Text>
            <Text style={{color:'#888'}}>📅</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.saveBtn,{backgroundColor:orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'#8B0000':'#007AFF'}]} onPress={saveOrder}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>
              {orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'📐 ΑΠΟΘΗΚΕΥΣΗ ΠΑΡΑΓΓΕΛΙΑΣ':'ΑΠΟΘΗΚΕΥΣΗ ΠΡΟΣ ΠΑΡΑΓΩΓΗ'}
            </Text>
          </TouchableOpacity>

          {/* ΡΟΗ ΠΑΡΑΓΩΓΗΣ — μόνο για ΕΙΔΙΚΗ */}
          {orderType==='ΕΙΔΙΚΗ' && (<>
            <Text style={styles.mainTitle}>ΡΟΗ ΠΑΡΑΓΩΓΗΣ</Text>

            {/* ΚΑΤΑΧΩΡΗΜΕΝΕΣ ΠΑΡΑΓΓΕΛΙΕΣ */}
            <View>
              <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#ff4444', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]} onPress={()=>toggleSection('pending')}>
                <Text style={styles.listHeaderText}>● ΚΑΤΑΧΩΡΗΜΕΝΕΣ ΠΑΡΑΓΓΕΛΙΕΣ ({customOrders.filter(o=>o.status==='PENDING').length})</Text>
                {expanded.pending&&(
                  <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20, marginRight:4}}
                    onPress={()=>handleSimplePrint(customOrders.filter(o=>o.status==='PENDING'), 'ΚΑΤΑΧΩΡΗΜΕΝΕΣ ΠΑΡΑΓΓΕΛΙΕΣ')}>
                    <Text style={{color:'#ff4444', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              {expanded.pending&&customOrders.filter(o=>o.status==='PENDING').map(o=>renderOrderCard(o))}
            </View>

            {renderProdSection()}

            {/* ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ */}
            <View>
              <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#00C851', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]} onPress={()=>toggleSection('ready')}>
                <Text style={styles.listHeaderText}>● ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ ({customOrders.filter(o=>o.status==='READY').length})</Text>
                {expanded.ready&&(
                  <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20, marginRight:4}}
                    onPress={()=>handleSimplePrint(customOrders.filter(o=>o.status==='READY'), 'ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ')}>
                    <Text style={{color:'#00C851', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              {expanded.ready&&customOrders.filter(o=>o.status==='READY').map(o=>renderOrderCard(o))}
            </View>

            {/* ΑΡΧΕΙΟ */}
            <View>
              <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#333', marginTop:20, flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]} onPress={()=>toggleSection('archive')}>
                <Text style={styles.listHeaderText}>📂 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ({soldOrders.length})</Text>
                {expanded.archive&&(
                  <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20, marginRight:4}}
                    onPress={()=>handleSimplePrint(soldOrders, 'ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ')}>
                    <Text style={{color:'#333', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              {expanded.archive&&soldOrders.map(o=>renderOrderCard(o,true))}
            </View>
          </>)}

          {/* ΠΑΡΑΓΓΕΛΙΕΣ ΤΥΠΟΠΟΙΗΜΕΝΩΝ — μόνο για ΤΥΠΟΠΟΙΗΜΕΝΗ tab */}
          {orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ' && (<>
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
                    onLongPress={()=>{
                      setCustomForm(o);
                      setOrderType('ΤΥΠΟΠΟΙΗΜΕΝΗ');
                      setCustomerSearch(o.customer||'');
                      setEditingOrder(o);
                      setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                      deleteFromCloud(o.id);
                    }}
                    delayLongPress={1000}
                    activeOpacity={0.8}
                    style={{backgroundColor:'#fff', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor:cardBorder, elevation:2}}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                      <View style={{flex:1}}>
                        <Text style={{fontWeight:'bold', fontSize:13}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                        <Text style={{fontSize:12, color:'#555', marginTop:1}}>{o.h}x{o.w} | {o.side}</Text>
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
                          onPress={()=>Alert.alert("⚠️ Διαγραφή",`Διαγραφή παραγγελίας #${o.orderNo};`,[
                            {text:"ΑΚΥΡΟ",style:"cancel"},
                            {text:"ΔΙΑΓΡΑΦΗ",style:"destructive",onPress:async()=>{
                              setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                              await deleteFromCloud(o.id);
                            }}
                          ])}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
                        </TouchableOpacity>

                        {sasiActive ? (
                          // ΜΟΝΗ: κουμπί ΜΟΝΤΑΡΙΣΜΑ
                          <TouchableOpacity
                            disabled={!canMount}
                            style={{alignItems:'center', backgroundColor: !canMount?'#eee':'#f9f9f9', borderRadius:5, padding:4, borderWidth:1, borderColor: !canMount?'#ccc':'#aaa', minWidth:96, opacity:!canMount?0.5:1}}
                            onPress={()=>{
                              if(!canMount) return;
                              Alert.alert("✅ Μοντάρισμα",`Επιβεβαίωση μοντάρίσματος #${o.orderNo};`,[
                                {text:"ΑΚΥΡΟ", style:"cancel"},
                                {text:"ΝΑΙ", onPress:async()=>{
                                  const updated = customOrders.map(x=>x.id===o.id?{...x,stdMounted:true,status:'STD_READY'}:x);
                                  setCustomOrders(updated);
                                  await syncToCloud({...o,stdMounted:true,status:'STD_READY'});
                                }}
                              ]);
                            }}>
                            <Text style={{fontSize:9, fontWeight:'bold', color:!canMount?'#aaa':'#555'}}>ΜΟΝΤΑΡΙΣΜΑ</Text>
                            <Text style={{fontSize:14}}>☐</Text>
                          </TouchableOpacity>
                        ) : (<>
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
                    </View>
                    <View style={{gap:4, marginLeft:8}}>
                      {/* ΠΙΣΩ: ΜΟΝΗ μόνο αν έχει μοντάρισμα, ΔΙΠΛΗ πάντα */}
                      {(o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' || o.installation==='ΝΑΙ') && (
                      <TouchableOpacity
                        style={{backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                        onPress={()=>{
                          if(o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'){
                            const phaseOptions = [];
                            if(o.dipliPhases?.laser?.active) phaseOptions.push({key:'laser', label:'🔴 LASER ΚΟΠΕΣ'});
                            if(o.dipliPhases?.montSasi?.active) phaseOptions.push({key:'montSasi', label:'🔵 ΚΑΤΑΣΚΕΥΗ ΣΑΣΙ'});
                            if(o.dipliPhases?.montDoor?.active) phaseOptions.push({key:'montDoor', label:'🟢 ΜΟΝΤΑΡΙΣΜΑ'});
                            Alert.alert(
                              "↩ Επιστροφή στην Παραγωγή",
                              "Ποια φάση θέλεις να διορθώσεις;",
                              [
                                ...phaseOptions.map(p=>({
                                  text: p.label,
                                  onPress: async()=>{
                                    const newPhases = {...o.dipliPhases, [p.key]:{...o.dipliPhases[p.key], done:false}};
                                    const upd = {...o, status:'DIPLI_PROD', dipliPhases:newPhases};
                                    setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                    await syncToCloud(upd);
                                  }
                                })),
                                {text:"ΑΚΥΡΟ", style:"cancel"}
                              ]
                            );
                          } else {
                            // ΜΟΝΗ με μοντάρισμα — ξετσεκάρει μόνο μοντάρισμα
                            Alert.alert("↩ Επιστροφή","Ξετσεκάρισμα μοντάρισματος και επιστροφή στις παραγγελίες;",[
                              {text:"ΑΚΥΡΟ", style:"cancel"},
                              {text:"ΝΑΙ", onPress:async()=>{
                                const upd = {...o, stdMounted:false, status:'STD_PENDING'};
                                setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                await syncToCloud(upd);
                              }}
                            ]);
                          }
                        }}>
                        <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΠΙΣΩ</Text>
                      </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={{backgroundColor:'#555', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                        onPress={()=>Alert.alert("📦 Αρχείο Πωλήσεων",`Η παραγγελία #${o.orderNo} πάει στο αρχείο πωλήσεων;`,[
                          {text:"ΑΚΥΡΟ", style:"cancel"},
                          {text:"ΝΑΙ", onPress:async()=>{
                            const now = Date.now();
                            const updated = customOrders.map(x=>x.id===o.id?{...x,status:'STD_SOLD',soldAt:now}:x);
                            setCustomOrders(updated);
                            await syncToCloud({...o,status:'STD_SOLD',soldAt:now});

                            // Αφαίρεση από ΣΑΣΙ ΣΤΟΚ (μόνο ΜΟΝΗ)
                            const isMoni = o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !o.sasiType;
                            const orderQty = parseInt(o.qty)||1;
                            const customer = o.customer || `#${o.orderNo}`;

                            const removeFromStock = async (stockOrders, setStockOrders, firebasePath) => {
                              // Βρίσκω εγγραφή που έχει δεσμευμένο αυτόν τον πελάτη
                              let target = stockOrders.find(s=>
                                s.status==='READY' &&
                                String(s.selectedHeight)===String(o.h) &&
                                String(s.selectedWidth)===String(o.w) &&
                                s.side===o.side &&
                                s.autoNote && s.autoNote.includes(customer)
                              );
                              // Αν δεν βρω με όνομα, πάρε οποιοδήποτε READY με αυτή τη διάσταση
                              if (!target) target = stockOrders.find(s=>
                                s.status==='READY' &&
                                String(s.selectedHeight)===String(o.h) &&
                                String(s.selectedWidth)===String(o.w) &&
                                s.side===o.side
                              );
                              if (!target) return;

                              const currentQty = parseInt(target.qty)||1;
                              // Αφαιρώ και από autoNote τον πελάτη
                              let newAutoNote = target.autoNote || '';
                              if (newAutoNote) {
                                const customerMap = {};
                                newAutoNote.split(',').forEach(entry => {
                                  const match = entry.trim().match(/^(.+)\s+\((\d+)τεμ\)$/);
                                  if (match) customerMap[match[1].trim()] = (customerMap[match[1].trim()]||0) + parseInt(match[2]);
                                });
                                if (customerMap[customer]) {
                                  customerMap[customer] -= orderQty;
                                  if (customerMap[customer] <= 0) delete customerMap[customer];
                                }
                                newAutoNote = Object.entries(customerMap).map(([n,q])=>`${n} (${q}τεμ)`).join(', ');
                              }

                              if (currentQty <= orderQty) {
                                // Αφαιρώ όλη την εγγραφή
                                setStockOrders(prev => prev.filter(s=>s.id!==target.id));
                                await fetch(`${FIREBASE_URL}/${firebasePath}/${target.id}.json`,{method:'DELETE'});
                              } else {
                                const upd = {...target, qty: String(currentQty - orderQty), autoNote: newAutoNote};
                                setStockOrders(prev => prev.map(s=>s.id===target.id?upd:s));
                                await fetch(`${FIREBASE_URL}/${firebasePath}/${upd.id}.json`,{method:'PUT',body:JSON.stringify(upd)});
                              }
                            };

                            if (isMoni && setSasiOrders) await removeFromStock(sasiOrders, setSasiOrders, 'sasi_orders');
                            if (setCaseOrders) await removeFromStock(caseOrders, setCaseOrders, 'case_orders');
                          }}
                        ])}>
                        <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>📦 ΑΡΧΕΙΟ</Text>
                      </TouchableOpacity>
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
                      }}>
                      <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΠΙΣΩ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );

              const sasiReady = sasiOrders.filter(o=>o.status==='READY');
              const caseReady = caseOrders.filter(o=>o.status==='READY');

              // Φιλτράρω ανά status
              const moniOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&(o.status==='STD_PENDING'||!o.status)).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const dipliOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&(o.status==='STD_PENDING'||!o.status||o.status==='PENDING')).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const readyOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_READY').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const soldOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_SOLD').sort((a,b)=>(b.soldAt||0)-(a.soldAt||0));
              const dipliReadyOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_READY').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
              const dipliSoldOrders = customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_SOLD').sort((a,b)=>(b.soldAt||0)-(a.soldAt||0));

              // FIFO για ΜΟΝΗ
              const sasiUsedM={}, caseUsedM={};
              const moniCards = moniOrders.map(o=>{
                const key=`${o.h}_${o.w}_${o.side}`;
                const sasiStock=sasiReady.filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
                const caseStock=caseReady.filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
                const hasSasi=(sasiUsedM[key]||0)<sasiStock;
                const hasCase=(caseUsedM[key]||0)<caseStock;
                sasiUsedM[key]=(sasiUsedM[key]||0)+1;
                caseUsedM[key]=(caseUsedM[key]||0)+1;
                return renderStdCard(o, hasSasi, hasCase, true);
              });

              // FIFO για ΔΙΠΛΗ
              const caseUsedD={};
              const dipliCards = dipliOrders.map(o=>{
                const key=`${o.h}_${o.w}_${o.side}`;
                const caseStock=caseReady.filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
                const hasCase=(caseUsedD[key]||0)<caseStock;
                caseUsedD[key]=(caseUsedD[key]||0)+1;
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

                  {/* ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ */}
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
                              const tabOrders = prodOrders.filter(o=>o.dipliPhases?.[t.key]?.active);
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
                          {/* Κάρτες ενεργού tab */}
                          {(()=>{
                            // FIFO για ΚΑΣΑ στην παραγωγή
                            const caseUsedProd={};
                            return prodOrders.filter(o=>o.dipliPhases?.[dipliProdTab]?.active).map(o=>{
                            const phase = o.dipliPhases?.[dipliProdTab];
                            if(!phase) return null;
                            const key=`${o.h}_${o.w}_${o.side}`;
                            const caseStock=caseReady.filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
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
                                      <Text style={styles.doneBtnTxt}>{phase.done?'↩️\nUNDO':'✓\nDONE'}</Text>
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
                          {prodOrders.filter(o=>o.dipliPhases?.[dipliProdTab]?.active).length===0&&(
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
                return (
                  <TouchableOpacity key={c.id}
                    style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                    onPress={()=>{
                      const current = customForm.coatings||[];
                      const updated = selected ? current.filter(x=>x!==c.name) : [...current,c.name];
                      setCustomForm({...customForm,coatings:updated});
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
  hwBtn: { flex:1, paddingVertical:8, paddingHorizontal:2, backgroundColor:'#e8e8e8', borderRadius:6, alignItems:'center', justifyContent:'center' },
  hwBtnActive: { backgroundColor:'#1a1a1a' },
  hwBtnYes: { backgroundColor:'#00C851' },
  hwBtnNo: { backgroundColor:'#1a1a1a' },
  hwBtnTxt: { fontSize:12, fontWeight:'bold', color:'#555', textAlign:'center' },
  qtyInput: { backgroundColor:'#fff', padding:10, borderRadius:8, borderWidth:2, borderColor:'#007AFF', fontSize:26, fontWeight:'bold', textAlign:'left', color:'#007AFF', marginBottom:8, width:90 },
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