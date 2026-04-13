import React, { useState, useRef, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, LayoutAnimation, Modal, Dimensions, Platform, Keyboard } from 'react-native';
import { FIREBASE_URL } from './firebaseConfig';
const SCREEN_WIDTH = Dimensions.get('window').width;
import { logActivity } from './activityLog';
import { fmtDate, fmtDateTime, parseDateStr } from './utils';
import { sasiKey, caseKey } from './stockUtils';
import { SellModal, ConfirmModal, DuplicateModal } from './CustomFormModals';
import { HardwarePickerModal, LockPickerModal, CoatingsPickerModal, DatePickerModal } from './CustomPickers';
import { PrintPreviewModal, PHASES } from './PrintPreview';
import { printHTML, buildPrintHTML } from './printUtils';

// ── Helpers για νέο stock σύστημα ──


const STD_HEIGHTS = ['208','213','218','223'];
const STD_WIDTHS  = ['83','88','93','98'];
const INIT_FORM   = { customer:'', orderNo:'', h:'', w:'', hinges:'2', qty:'1', glassDim:'', glassNotes:'', armor:'ΜΟΝΗ', side:'ΔΕΞΙΑ', lock:'', notes:'', status:'PENDING', hardware:'', installation:'ΟΧΙ', caseType:'ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ', caseMaterial:'DKP', deliveryDate:'', sasiType:'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', coatings:[], stavera:[], heightReduction:'' };




// ── Helper: βρίσκει πρόταση για διπλότυπο νούμερο ──
const computeSuggested = (base, allOrders, editingId) => {
  const letters = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
  for(let i=0; i<letters.length; i++){
    const candidate = base+'-'+letters[i];
    if(!allOrders.some(o=>o.orderNo===candidate && o.id!==editingId)) return candidate;
  }
  return base+'-?';
};

const DIPLI_PHASES = [
  { key:'laser',    label:'🔴 LASER ΚΟΠΕΣ' },
  { key:'cases',    label:'🟡 ΚΑΣΕΣ' },
  { key:'montSasi', label:'🔵 ΚΑΤΑΡΤΙΣΗ ΣΑΣΙ' },
  { key:'vafio',    label:'🟢 ΒΑΦΕΙΟ' },
  { key:'montDoor', label:'⚫ ΜΟΝΤΑΡΙΣΜΑ/ΕΠΕΝΔΥΣΗ' },
];

export default function CustomScreen({ customOrders, setCustomOrders, soldOrders, setSoldOrders, customers, onRequestAddCustomer, sasiStock={}, setSasiStock, caseStock={}, setCaseStock, sasiOrders=[], setSasiOrders, caseOrders=[], setCaseOrders, coatings=[], dipliSasiStock=[], setDipliSasiStock, locks=[], formOnly=false, forcedTab=null, setTabIndex }) {
  const [expanded, setExpanded] = useState({ pending:false, prod:false, ready:false, archive:false, stdList:true, stdMoni:true, stdDipli:true, stdReady:true, stdSold:false, stdReadyD:true, stdSoldD:false, stdMoniOpen:true, stdDipliOpen:true, dipliProd:true, dipliSasiStock:false, moniProd:true, moniSasiStock:false, stdBuildMoni:true, stdBuildDipli:true });
  const [showHardwarePicker, setShowHardwarePicker] = useState(false);
  const [showLockPicker, setShowLockPicker] = useState(false);
  const [showCoatingsPicker, setShowCoatingsPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customHardwareText, setCustomHardwareText] = useState('');
  const [showCustomHardwareInput, setShowCustomHardwareInput] = useState(false);
  const [stdTab, setStdTab] = useState('ΜΟΝΗ');
  useEffect(() => { if (forcedTab) setStdTab(forcedTab); }, [forcedTab]);
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
  const [menonSellModal, setMenonSellModal] = useState({ visible:false, entry:null, newCustomer:'' });
  const [printSelected, setPrintSelected] = useState({});
  const [printPreview, setPrintPreview] = useState({ visible:false, phaseKey:null, orders:[], copies:1 });
  const [activeProdPhase, setActiveProdPhase] = useState('laser');
  const [moniProdTab, setMoniProdTab] = useState('montSasi');
  const [editConfirmModal, setEditConfirmModal] = useState({ visible: false, order: null });
  const [isSaving, setIsSaving] = useState(false);
  const [borrowModal, setBorrowModal] = useState({ visible: false, order: null, stockType: null, candidates: [] });
  const [returnConfirmModal, setReturnConfirmModal] = useState({ visible: false, order: null });
  const [saveConfirmModal, setSaveConfirmModal] = useState({ visible: false });
  const [scrollPosition, setScrollPosition] = useState(0);
  const [borrowConfirmModal, setBorrowConfirmModal] = useState({ visible: false, candidate: null, order: null, stockType: null });
  const [borrowSuccessModal, setBorrowSuccessModal] = useState({ visible: false, message: '' });
  const [datePickerDay, setDatePickerDay] = useState(String(new Date().getDate()));
  const [datePickerMonth, setDatePickerMonth] = useState(String(new Date().getMonth()+1));
  const [datePickerYear, setDatePickerYear] = useState(String(new Date().getFullYear()));

  const customerRef=useRef(); const orderNoRef=useRef(); const hRef=useRef();
  const customerSelectedRef = useRef(false);
  const prodScrollRef = useRef(null);
  const mainScrollRef = useRef(null);
  const menonNotesTimers = useRef({});
  const staveraHRefs = useRef({});
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
    const pendingSync = [];
    const newOrders = customOrders.map(o=>{
      if(o.orderType!=='ΤΥΠΟΠΟΙΗΜΕΝΗ') return o;
      const isMoniNoLock = (o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType) && !o.lock;
      const hasMontage = o.installation==='ΝΑΙ';
      const hasStavera = o.stavera && o.stavera.length > 0;
      const sk = sasiKey(String(o.h), String(o.w), o.side);
      const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);

      // GUARD CLAUSE: Αν είναι ήδη STD_READY ή stdInProd===true, το κλειδώνουμε
      if (o.status === 'STD_READY' || o.stdInProd) return o;

      // FIFO check: η παραγγελία καλύπτεται μόνο αν το αθροιστικό ως αυτήν <= stock
      const checkStockFIFO = (stockMap, key, orderNo) => {
        const entry = stockMap?.[key];
        if (!entry) return false;
        const totalQty = parseInt(entry.qty) || 0;
        let cumulative = 0;
        for (const r of (entry.reservations || [])) {
          cumulative += (parseInt(r.qty) || 1);
          if (r.orderNo === orderNo) return cumulative <= totalQty;
        }
        return false;
      };

      // STD_BUILD: έλεγχος stock μόνο — η μετάβαση γίνεται μέσω confirmation modal στο handleBuildTaskToggle
      if (o.status === 'STD_BUILD') return o;

      if(o.status==='STD_PENDING' && isMoniNoLock && (hasMontage || hasStavera)){
        const hasSasiOk = checkStockFIFO(sasiStock, sk, o.orderNo);
        const hasCaseOk = checkStockFIFO(caseStock, ck, o.orderNo);
        if(!hasCaseOk || !hasSasiOk) return o;
        if(hasMontage){
          if(o.stdInProd) return o;
          updated = true;
          const upd = {...o, stdInProd:true};
          pendingSync.push(upd);
          return upd;
        } else {
          updated = true;
          const upd = {...o, status:'STD_READY', readyAt:Date.now(), staveraPendingAtReady:true};
          pendingSync.push(upd);
          return upd;
        }
      }

      if(o.status!=='DIPLI_PROD' && o.status!=='MONI_PROD') return o;
      const phases = o.status==='DIPLI_PROD' ? o.dipliPhases : o.moniPhases;
      const allDone = phases && Object.keys(phases).every(k=>!phases[k].active||phases[k].done);
      if(!allDone) return o;
      const staveraPending = hasStavera && !o.staveraDone;
      const hasCaseOk2 = checkStockFIFO(caseStock, ck, o.orderNo);
      if(!hasCaseOk2) return o;
      updated = true;
      const upd2 = {...o, status:'STD_READY', readyAt:Date.now(), ...(staveraPending?{staveraPendingAtReady:true}:{})};
      pendingSync.push(upd2);
      return upd2;
    });
    if(updated) {
      setCustomOrders(newOrders);
      (async () => { for (const upd of pendingSync) await syncToCloud(upd); })();
    }
  }, [customOrders, caseStock, sasiStock]);

  const saveOrder = async () => {
    if (!customForm.orderNo) return Alert.alert("Προσοχή","Το Νούμερο Παραγγελίας είναι υποχρεωτικό.");
    if (!customForm.h||!customForm.w) return Alert.alert("Προσοχή","Βάλτε Ύψος και Πλάτος.");
    const allOrdersForDupCheck = [...customOrders, ...soldOrders];
    const dupExists = allOrdersForDupCheck.some(o => o.orderNo === customForm.orderNo && o.id !== editingOrder?.id);
    if (dupExists) {
      const base = customForm.orderNo;
      const suggested = computeSuggested(base, allOrdersForDupCheck, editingOrder?.id);
      setDupModal({
        visible: true, base, suggested,
        onUse: () => { setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:suggested})); },
        onKeep: () => { setDupModal(m=>({...m,visible:false})); },
        onCancel: () => { setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:''})); }
      });
      return;
    }

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
    const isDipli = customForm.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ';
    const isMoniWithLock = (customForm.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!customForm.sasiType) && customForm.lock;
    const isMoni = (customForm.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!customForm.sasiType);
    const hasStaveraForm = !!(customForm.stavera && customForm.stavera.some(s=>s.dim));
    const hasMontageForm = customForm.installation === 'ΝΑΙ';
    const hasHeightReductionForm = !!customForm.heightReduction;

    // Χρειάζεται κατασκευή αν: ΔΙΠΛΗ, ή ΜΟΝΗ με κλειδαριά, ή ΜΟΝΗ με σταθερό/μοντάρισμα/μείωση
    const needsBuild = isDipli || isMoniWithLock || (isMoni && (hasStaveraForm || hasMontageForm || hasHeightReductionForm));

    // Checklist για STD_BUILD
    // Σασί: παραγωγή αν έχει κλειδαριά ή μείωση (ανεξάρτητα από ό,τι άλλο)
    //        stock αν έχει ΜΟΝΟ σταθερό ή/και μοντάρισμα
    const sasiNeedsProduction = isMoni && (isMoniWithLock || hasHeightReductionForm);
    const buildTasks = needsBuild ? {
      ...(hasStaveraForm ? {stavera: false} : {}),
      ...(isMoniWithLock ? {lock: false} : {}),
      ...(hasHeightReductionForm ? {heightReduction: false} : {}),
      ...(hasMontageForm ? {montage: false} : {}),
      ...(sasiNeedsProduction || isDipli ? {sasi: false} : {}),
    } : null;

    const moniPhases = isMoniWithLock ? {
      laser:   {active:true, done:false, printHistory:[]},
      montSasi:{active:true, done:false, printHistory:[]},
      montDoor:{active:true, done:false, printHistory:[]}
    } : null;
    const newOrder = {...customForm, orderType:'ΤΥΠΟΠΟΙΗΜΕΝΗ',
      id: editingOrder ? editingOrder.id : Date.now().toString(),
      createdAt: editingOrder ? editingOrder.createdAt : Date.now(),
      status: needsBuild ? 'STD_BUILD' : 'STD_PENDING',
      ...(needsBuild ? {buildTasks} : {}),
      ...(isMoniWithLock ? {moniPhases} : {})
    };
    setCustomOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
    await syncToCloud(newOrder);
    await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', editingOrder ? 'Επεξεργασία παραγγελίας' : 'Νέα παραγγελία', { orderNo: newOrder.orderNo, customer: newOrder.customer, size: `${newOrder.h}x${newOrder.w}`, qty: newOrder.qty });

    // ── Δέσμευση στοκ — ΜΟΝΟ για νέες παραγγελίες, όχι επεξεργασία ──
    if (!editingOrder && setSasiStock && setCaseStock) {
      const orderQtyR = parseInt(newOrder.qty)||1;
      const sk = sasiKey(String(newOrder.h), String(newOrder.w), newOrder.side);
      const ck = caseKey(String(newOrder.h), String(newOrder.w), newOrder.side, newOrder.caseType);
      const newRes = { orderNo: newOrder.orderNo, customer: newOrder.customer||'', qty: orderQtyR };

      // Σασί: δεσμεύεται ΜΟΝΟ αν είναι ΜΟΝΗ χωρίς κλειδαριά και χωρίς μείωση ύψους
      // Αν έχει κλειδαριά ή μείωση ύψους → το σασί κατασκευάζεται, δεν παίρνεται από stock
      const reserveSasi = isMoni && !isMoniWithLock && !hasHeightReductionForm &&
                          (newOrder.status === 'STD_PENDING' ||
                           (newOrder.status === 'STD_BUILD' && (hasStaveraForm || hasMontageForm)));

      if (reserveSasi) {
        const existingSasi = sasiStock[sk] || { qty: 0, reservations: [] };
        const updSasiEntry = { ...existingSasi, reservations: [...(existingSasi.reservations||[]), newRes] };
        setSasiStock(prev=>({...prev, [sk]: updSasiEntry}));
        await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`,{method:'PUT',body:JSON.stringify(updSasiEntry)});
      }

      // Κάσα: πάντα (STD_PENDING ή STD_BUILD, ΜΟΝΗ ή ΔΙΠΛΗ)
      const existingCase = caseStock[ck] || { qty: 0, reservations: [], caseType: (newOrder.caseType||'').includes('ΑΝΟΙΧΤΟΥ')?'ΚΑΣΑ ΑΝΟΙΧΤΗ':'ΚΑΣΑ ΚΛΕΙΣΤΗ' };
      const updCaseEntry = { ...existingCase, reservations: [...(existingCase.reservations||[]), newRes] };
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

    if (isMoni) {
      // Φέρνω το τρέχον από Firebase για να μην χαθούν αλλαγές άλλων
      try {
        const res = await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`);
        const data = await res.json();
        if (data) {
          const updEntry = { ...data, reservations: (data.reservations||[]).filter(r=>r.orderNo!==orderNo) };
          await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`, { method:'PUT', body:JSON.stringify(updEntry) });
          setSasiStock(prev => ({...prev, [sk]: updEntry}));
        }
      } catch(e) { console.error('sasi remove reservation:', e); }
    }

    try {
      const res = await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`);
      const data = await res.json();
      if (data) {
        const updEntry = { ...data, reservations: (data.reservations||[]).filter(r=>r.orderNo!==orderNo) };
        await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`, { method:'PUT', body:JSON.stringify(updEntry) });
        setCaseStock(prev => ({...prev, [ck]: updEntry}));
      }
    } catch(e) { console.error('case remove reservation:', e); }
  };

  const editOrder = (order) => {
    setCustomForm(order);
    setCustomerSearch(order.customer||'');
    setEditingOrder(order);
    // ΔΕΝ αφαιρούμε από τη λίστα ούτε από το Firebase εδώ —
    // η παραγγελία αφαιρείται μόνο κατά την αποθήκευση (saveOrder)
  };

  const requestEditOrder = (order) => {
    setEditConfirmModal({ visible: true, order });
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

  // Ταξινομήσεις
  const sortByDimension = (arr) => [...arr].sort((a,b) => {
    const hDiff = (parseInt(b.h)||0) - (parseInt(a.h)||0);
    if (hDiff!==0) return hDiff;
    return (parseInt(b.w)||0) - (parseInt(a.w)||0);
  });

  const getCopies = (orders, phaseLabel, dateStr) => {
    if (phaseLabel.includes('LASER')) {
      const copy1 = [...orders].sort((a,b) => (parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));

      // ΚΑΣΕΣ: 1) Υλικό (DKP→ΓΑΛΒΑΝΙΖΕ) 2) Τύπος (ΑΝΟΙΧΤΟΥ→ΚΛΕΙΣΤΟΥ) 3) Διάσταση
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
        { title:`VAICON — ${dateStr} — ΚΑΣΕΣ`, orders:copy2 },
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
            <td style="font-size:12px;color:#444">${o.deliveryDate?(parseDateStr(o.deliveryDate)||new Date()).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}):''}</td>
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

    const handleDeleteAndRelease = async (order) => {
    // Διαγραφή από το UI
    setCustomOrders(prev => prev.filter(o => o.id !== order.id));
    // Διαγραφή από το Firebase
    await deleteFromCloud(order.id);
    
    // Αν είναι τυποποιημένη, απελευθερώνουμε το στοκ
    if (order.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ') {
      const isMoni = (order.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !order.sasiType) && !order.lock;
      await removeStockReservation(order.orderNo, order.h, order.w, order.side, order.caseType, isMoni);
    }
  };

  const cancelOrder = async (id) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Ακύρωση — Οριστική διαγραφή;')) return;
      const order = customOrders.find(o=>o.id===id);
      if(order) await handleDeleteAndRelease(order);
    } else {
      Alert.alert('Ακύρωση', 'Οριστική διαγραφή;', [
        { text: 'Όχι', style: 'cancel' },
        { text: 'Ναι', style: 'destructive', onPress: async () => {
          const order = customOrders.find(o=>o.id===id);
          if(order) await handleDeleteAndRelease(order);
        }}
      ]);
    }
  };

  // ── Εκτυπώσεις ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ ──
  const handleBuildPrint = async (orders, title, type) => {
    if (!orders.length) return Alert.alert('Προσοχή','Δεν υπάρχουν παραγγελίες.');
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()} ${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;

    const checkStockFIFOLocal = (stockMap, key, orderNo) => {
      const entry = stockMap?.[key];
      if (!entry) return false;
      const totalQty = parseInt(entry.qty)||0;
      let cum = 0;
      for (const r of (entry.reservations||[])) {
        cum += (parseInt(r.qty)||1);
        if (r.orderNo===orderNo) return cum<=totalQty;
      }
      return false;
    };

    let rows = '';
    if (type === 'status') {
      // ΕΚΤΥΠΩΣΗ ΚΑΤΑΣΤΑΣΗ
      rows = orders.map(o => {
        const sk = sasiKey(String(o.h), String(o.w), o.side);
        const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
        const hasSasiNeeded = (('stavera' in (o.buildTasks||{})) || ('montage' in (o.buildTasks||{}))) && !('sasi' in (o.buildTasks||{}));
        const hasCaseOk = checkStockFIFOLocal(caseStock, ck, o.orderNo);
        const hasSasiOk = !hasSasiNeeded || checkStockFIFOLocal(sasiStock, sk, o.orderNo);
        const tasks = o.buildTasks||{};
        const taskLabels = {stavera:'Σταθερό', lock:'Κλειδαριά', heightReduction:'Μείωση', montage:'Μοντάρ.', sasi:'Σασί'};
        const checklistHtml = Object.entries(tasks).map(([k,done])=>
          `<span style="margin-right:8px;color:${done?'#155724':'#721c24'}">${done?'☑':'☐'} ${taskLabels[k]||k}</span>`
        ).join('');
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ';
        return `<tr>
          <td style="font-weight:bold;font-size:14px">${o.orderNo}</td>
          <td>${o.customer||'—'}</td>
          <td style="font-weight:bold">${o.h}x${o.w} ${fora}</td>
          <td style="text-align:center;font-weight:bold;color:${hasCaseOk?'#155724':'#721c24'}">${hasCaseOk?'✓':'✗'}</td>
          <td style="text-align:center;font-weight:bold;color:${hasSasiNeeded?(hasSasiOk?'#155724':'#721c24'):'#999'}">${hasSasiNeeded?(hasSasiOk?'✓':'✗'):'—'}</td>
          <td style="font-size:11px">${checklistHtml}</td>
          <td style="font-size:11px;color:#555">${o.notes||''}</td>
        </tr>`;
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;margin:0;color:#000;}
        table{width:100%;border-collapse:collapse;font-size:11px;}
        th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:2px solid #000;font-weight:bold;white-space:nowrap;background:#fff;}
        td{padding:5px 4px;border-bottom:1px solid #000;vertical-align:middle;}
        h1{font-size:14px;margin-bottom:2px;font-weight:bold;}
        h2.sub{font-size:11px;color:#555;margin-top:0;margin-bottom:8px;}
        @media print{@page{size:A4 landscape;margin:8mm;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style></head><body>
        <div style="padding:12px;">
          <h1>VAICON — ${title} — ΚΑΤΑΣΤΑΣΗ</h1>
          <h2 class="sub">📅 ${dateStr} &nbsp;|&nbsp; ${orders.length} παραγγελίες</h2>
          <table><thead><tr>
            <th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>ΚΑΣΑ</th><th>ΣΑΣΙ</th><th>Εκκρεμότητες</th><th>Παρατηρήσεις</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>
      </body></html>`;

      if (Platform.OS==='web') {
        const win = window.open('','_blank');
        if (!win) return Alert.alert('Σφάλμα','Επιτρέψτε τα pop-ups.');
        win.document.write(html);
        win.document.close();
        win.focus();
        win.onafterprint = () => win.close();
        win.print();
      }
    } else {
      // ΕΚΤΥΠΩΣΗ ΠΑΡΑΓΩΓΗ
      rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ';
        const extras = [
          o.lock?`Κλειδ: ${o.lock}`:'',
          o.heightReduction?`Μείωση: ${o.heightReduction}`:'',
          o.stavera&&o.stavera.filter(s=>s.dim).length>0?`Σταθ: ${o.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}`:'',
          o.installation==='ΝΑΙ'?'ΜΟΝΤΑΡΙΣΜΑ':'',
          o.caseType?(o.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ ΚΑΣΑ':'ΚΛΕΙΣΤΗ ΚΑΣΑ'):'',
          o.coatings&&o.coatings.length>0?o.coatings.join(', '):'',
        ].filter(Boolean).join(' | ');
        return `<tr>
          <td style="font-weight:bold;font-size:16px">${o.orderNo}</td>
          <td>${o.customer||'—'}</td>
          <td style="font-weight:900;font-size:15px">${o.h}x${o.w}</td>
          <td style="font-weight:bold;font-size:15px">${fora}</td>
          <td style="font-size:11px">${extras}</td>
          <td style="font-size:11px;color:#555">${o.notes||''}</td>
          <td style="min-width:120px"></td>
        </tr>`;
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;margin:0;color:#000;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:2px solid #000;font-weight:bold;white-space:nowrap;background:#fff;}
        td{padding:6px 4px;border-bottom:1px solid #000;vertical-align:middle;}
        h1{font-size:14px;margin-bottom:2px;font-weight:bold;}
        h2.sub{font-size:11px;color:#555;margin-top:0;margin-bottom:8px;}
        @media print{@page{size:A4 landscape;margin:8mm;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style></head><body>
        <div style="padding:12px;">
          <h1>VAICON — ${title} — ΠΑΡΑΓΩΓΗ</h1>
          <h2 class="sub">📅 ${dateStr} &nbsp;|&nbsp; ${orders.length} παραγγελίες</h2>
          <table><thead><tr>
            <th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>Φορά</th><th>Στοιχεία</th><th>Παρατηρήσεις</th><th>Σημειώσεις</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>
      </body></html>`;

      if (Platform.OS==='web') {
        const win = window.open('','_blank');
        if (!win) return Alert.alert('Σφάλμα','Επιτρέψτε τα pop-ups.');
        win.document.write(html);
        win.document.close();
        win.focus();
        win.onafterprint = () => win.close();
        win.print();
      }
    }
  };

  const handleBuildTaskToggle = async (order, taskKey) => {
    const newTasks = {...(order.buildTasks||{}), [taskKey]: !order.buildTasks?.[taskKey]};
    const upd = {...order, buildTasks: newTasks};
    setCustomOrders(prev => prev.map(o => o.id===order.id ? upd : o));
    await syncToCloud(upd);

    // Έλεγχος αν όλα τα tasks είναι done → confirmation modal
    const allDone = Object.keys(newTasks).length > 0 && Object.values(newTasks).every(v => v === true);
    if (!allDone) return;

    // Έλεγχος stock
    const sk = sasiKey(String(order.h), String(order.w), order.side);
    const ck = caseKey(String(order.h), String(order.w), order.side, order.caseType);
    const checkFIFO = (stockMap, key) => {
      const entry = stockMap?.[key];
      if (!entry) return false;
      const totalQty = parseInt(entry.qty)||0;
      let cum = 0;
      for (const r of (entry.reservations||[])) {
        cum += (parseInt(r.qty)||1);
        if (r.orderNo===order.orderNo) return cum<=totalQty;
      }
      return false;
    };
    const isMoniB = (order.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!order.sasiType);
    const hasSasiNeeded = isMoniB && (('stavera' in newTasks) || ('montage' in newTasks)) && !('sasi' in newTasks);
    const hasCaseOk = checkFIFO(caseStock, ck);
    const hasSasiOk = !hasSasiNeeded || checkFIFO(sasiStock, sk);

    if (!hasCaseOk || !hasSasiOk) return; // stock δεν είναι έτοιμο — δεν εμφανίζει modal

    // Εμφάνιση confirmation modal
    setConfirmModal({
      visible: true,
      title: '✅ Έτοιμη για Αποθήκη',
      message: `Η παραγγελία #${order.orderNo} ολοκληρώθηκε.\nΜεταφορά στην αποθήκη ΕΤΟΙΜΩΝ;`,
      confirmText: '✅ ΝΑΙ, ΑΠΟΘΗΚΗ',
      onConfirm: async () => {
        const ready = {...upd, status:'STD_READY', readyAt:Date.now()};
        setCustomOrders(prev => prev.map(o => o.id===order.id ? ready : o));
        await syncToCloud(ready);
        await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Φάση → ΕΤΟΙΜΟ (κατασκευή)', {orderNo:order.orderNo, customer:order.customer, size:`${order.h}x${order.w}`});
      }
    });
  };
  // ── Δανεισμός δέσμευσης stock ──
  const handleBorrowRequest = (order, stockType) => {
    const h = String(order.h), w = String(order.w), side = order.side;
    const sk = sasiKey(h, w, side);

    // Για κάσα: ψάχνω και στους δύο τύπους κάσας (ΚΛΕΙΣΤΗ + ΑΝΟΙΧΤΗ)
    // γιατί ΜΟΝΗ και ΔΙΠΛΗ μπορεί να έχουν διαφορετικό caseType
    const ckKleisto = caseKey(h, w, side, 'ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ');
    const ckAnoixto = caseKey(h, w, side, 'ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ');
    // Το ck της τρέχουσας παραγγελίας
    const ckCurrent = caseKey(h, w, side, order.caseType);

    // Βοηθητική: φιλτράρω υποψήφιες παραγγελίες από reservations
    const filterCandidates = (reservations) => reservations
      .map(r => customOrders.find(o => o.orderNo === r.orderNo && o.id !== order.id))
      .filter(o => {
        if (!o) return false;
        // Αποκλείω παραγγελίες που είναι ήδη ΕΤΟΙΜΕΣ ή ΠΩΛΗΜΕΝΕΣ
        if (o.status === 'STD_READY' || o.status === 'STD_SOLD') return false;
        // Αποκλείω παραγγελίες που έχουν ξεκινήσει παραγωγή (done φάσεις)
        if (o.dipliPhases) {
          const anyDone = Object.values(o.dipliPhases).some(p => p.done);
          if (anyDone) return false;
        }
        if (o.moniPhases) {
          const anyDone = Object.values(o.moniPhases).some(p => p.done);
          if (anyDone) return false;
        }
        // buildTasks: αποκλείω μόνο αν έχουν ξεκινήσει (κάποιο done=true)
        if (o.buildTasks) {
          const anyDone = Object.values(o.buildTasks).some(v => v === true);
          if (anyDone) return false;
        }
        return true;
      });

    let candidates = [];

    if (stockType === 'case') {
      // Ψάχνω σε ΟΛΑ τα caseStock entries για αυτή τη διάσταση+φορά
      // (ΚΛΕΙΣΤΗ + ΑΝΟΙΧΤΗ) — η κάσα είναι κοινή για ΜΟΝΗ και ΔΙΠΛΗ
      const allReservations = [
        ...((caseStock[ckKleisto]?.reservations) || []),
        ...((caseStock[ckAnoixto]?.reservations) || []),
      ];

      if (allReservations.length === 0) {
        return Alert.alert('Προσοχή', 'Δεν υπάρχουν δεσμεύσεις κάσας για αυτή τη διάσταση.\n\nΚαμία άλλη παραγγελία δεν έχει δεσμευμένη κάσα για ' + h + 'x' + w + ' ' + (side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ') + '.');
      }

      candidates = filterCandidates(allReservations);

      // Αποθηκεύω ποιο ck έχει η κάθε υποψήφια (για να ξέρουμε από πού να πάρουμε)
      candidates = candidates.map(c => {
        const cCk = caseKey(String(c.h), String(c.w), c.side, c.caseType);
        return { ...c, _donorCk: cCk };
      });

    } else {
      // stockType === 'sasi'
      const sasiEntry = sasiStock[sk];
      const reservations = sasiEntry?.reservations || [];

      if (reservations.length === 0) {
        return Alert.alert('Προσοχή', 'Δεν υπάρχουν δεσμεύσεις σασί για αυτή τη διάσταση.\n\nΚαμία άλλη παραγγελία δεν έχει δεσμευμένο σασί για ' + h + 'x' + w + ' ' + (side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ') + '.');
      }

      candidates = filterCandidates(reservations);
    }

    if (candidates.length === 0) {
      return Alert.alert('Δεν βρέθηκαν', 'Δεν υπάρχουν παραγγελίες με διαθέσιμη δέσμευση για αυτή τη διάσταση.\n\nΌλες οι παραγγελίες με δέσμευση έχουν ήδη ξεκινήσει παραγωγή ή είναι έτοιμες.');
    }

    setBorrowModal({ visible: true, order, stockType, candidates });
  };

  // (useEffect για pendingConfirm αφαιρέθηκε — χρησιμοποιούμε borrowConfirmModal αντί για window.confirm)

  const handleBorrowConfirmDirect = async (donorOrder, order, stockType) => {
    if (!donorOrder || !order || !stockType) {
      if (Platform.OS === 'web') window.alert('Σφάλμα: Λείπουν δεδομένα δανεισμού.');
      else Alert.alert('Σφάλμα', 'Λείπουν δεδομένα δανεισμού.');
      return;
    }
    const h = String(order.h), w = String(order.w), side = order.side;

    const showAlert = (title, msg) => {
      // window.alert μπλοκάρεται από browsers — χρησιμοποιούμε setBorrowSuccessModal
      if (Platform.OS === 'web') {
        setBorrowSuccessModal({ visible: true, message: title + '\n\n' + msg });
      } else {
        Alert.alert(title, msg);
      }
    };

    if (stockType === 'case') {
      const donorCk = donorOrder._donorCk || caseKey(h, w, side, donorOrder.caseType);
      try {
        const res = await fetch(`${FIREBASE_URL}/case_stock/${donorCk}.json`);
        const data = await res.json();
        if (!data) { showAlert('Σφάλμα', 'Δεν βρέθηκε το stock κάσας.'); return; }
        const donorRes = (data.reservations || []).find(r => r.orderNo === donorOrder.orderNo);
        if (!donorRes) { showAlert('Σφάλμα', 'Δεν βρέθηκε η δέσμευση στο stock του donor.'); return; }
        const orderQty = parseInt(order.qty) || 1;
        const newRes = { orderNo: order.orderNo, customer: order.customer || '', qty: orderQty, borrowedFrom: donorOrder.orderNo };
        const donorResUpdated = { ...donorRes, borrowedTo: order.orderNo, priorityReservation: true };
        const cleanedReservations = (data.reservations || []).filter(r =>
          r.orderNo !== order.orderNo &&
          r.borrowedFrom !== donorOrder.orderNo
        );
        const updReservations = cleanedReservations.map(r => r.orderNo === donorOrder.orderNo ? newRes : r);
        updReservations.push(donorResUpdated);
        const updEntry = { ...data, reservations: updReservations };
        await fetch(`${FIREBASE_URL}/case_stock/${donorCk}.json`, { method: 'PUT', body: JSON.stringify(updEntry) });
        setCaseStock(prev => ({ ...prev, [donorCk]: updEntry }));
        try {
          const allCaseRes = await fetch(`${FIREBASE_URL}/case_stock.json`);
          const allCaseData = await allCaseRes.json();
          if (allCaseData) setCaseStock(allCaseData);
        } catch(fetchErr) {}
        showAlert('✅ Επιτυχία', `Η κάσα δεσμεύτηκε για #${order.orderNo} από την παραγγελία #${donorOrder.orderNo}.\n\nΗ #${donorOrder.orderNo} θα αναπληρωθεί αυτόματα με προτεραιότητα όταν μπει νέο stock.`);
      } catch(e) {
        showAlert('Σφάλμα', 'Αποτυχία ενημέρωσης stock: ' + e.message);
      }
    } else {
      const sk = sasiKey(h, w, side);
      try {
        const res = await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`);
        const data = await res.json();
        if (!data) { showAlert('Σφάλμα', 'Δεν βρέθηκε το stock σασί.'); return; }
        const donorRes = (data.reservations || []).find(r => r.orderNo === donorOrder.orderNo);
        if (!donorRes) { showAlert('Σφάλμα', 'Δεν βρέθηκε η δέσμευση σασί.'); return; }
        const orderQty = parseInt(order.qty) || 1;
        const newRes = { orderNo: order.orderNo, customer: order.customer || '', qty: orderQty, borrowedFrom: donorOrder.orderNo };
        const donorResUpdated = { ...donorRes, borrowedTo: order.orderNo, priorityReservation: true };
        const cleanedSasiReservations = (data.reservations || []).filter(r => r.orderNo !== order.orderNo);
        const updReservations = cleanedSasiReservations.map(r => r.orderNo === donorOrder.orderNo ? newRes : r);
        updReservations.push(donorResUpdated);
        const updEntry = { ...data, reservations: updReservations };
        await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`, { method: 'PUT', body: JSON.stringify(updEntry) });
        setSasiStock(prev => ({ ...prev, [sk]: updEntry }));
        try {
          const allSasiRes = await fetch(`${FIREBASE_URL}/sasi_stock.json`);
          const allSasiData = await allSasiRes.json();
          if (allSasiData) setSasiStock(allSasiData);
        } catch(fetchErr) {}
        showAlert('✅ Επιτυχία', `Το σασί δεσμεύτηκε για #${order.orderNo} από την παραγγελία #${donorOrder.orderNo}.\n\nΗ #${donorOrder.orderNo} θα αναπληρωθεί αυτόματα με προτεραιότητα όταν μπει νέο stock.`);
      } catch(e) {
        showAlert('Σφάλμα', 'Αποτυχία ενημέρωσης stock: ' + e.message);
      }
    }
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
            {fmtDate(order.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold'}}>📅 {fmtDate(order.createdAt)}</Text>:null}
            <Text style={[styles.cardDetails,{fontWeight:'bold'}]}>#{order.orderNo}</Text>
            {order.customer?<Text style={[styles.cardCustomer]}>👤 {order.customer}</Text>:null}
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
          <Text style={styles.cardDetails}>{order.h}x{order.w} | {order.side}{!isStd?` | ${order.armor||'ΜΟΝΗ'} ΘΩΡ.`:''}</Text>
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
    const maxPhaseCount = prodOrders.length === 0 ? 0 : Math.max(...PHASES.map(ph =>
      prodOrders.filter(o => o.phases?.[ph.key]?.active && !o.phases?.[ph.key]?.done).length
    ));

    const phaseKeys = [...PHASES.map(p=>p.key), 'stavera'];

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
                            {fmtDate(o.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold',marginBottom:2}}>📅 {fmtDate(o.createdAt)}</Text>:null}
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
                                await handleDeleteAndRelease(o);
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


  // ── Memoized derived lists — υπολογίζονται μόνο όταν αλλάζουν τα customOrders/sasiOrders/caseOrders ──
  const prodOrders = useMemo(() => customOrders.filter(o=>o.status==='PROD').sort((a,b)=>(b.prodAt||0)-(a.prodAt||0)), [customOrders]);
  const sasiReady = useMemo(() => sasiOrders.filter(o=>o.status==='READY'), [sasiOrders]);
  const caseReady = useMemo(() => caseOrders.filter(o=>o.status==='READY'), [caseOrders]);
  const moniOrders = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&((o.status==='STD_PENDING'||!o.status)||(o.status==='STD_READY'&&o.staveraPendingAtReady))).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [customOrders]);
  const stdBuildMoniOrders = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_BUILD').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [customOrders]);
  const stdBuildDipliOrders = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_BUILD').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [customOrders]);
  const moniProdOrders = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='MONI_PROD').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [customOrders]);
  const staveraTabOrders = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.stavera&&o.stavera.filter(s=>s.dim).length>0&&(o.status==='STD_PENDING'||o.status==='MONI_PROD'||(o.status==='STD_READY'&&o.staveraPendingAtReady))&&!o.staveraDone).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [customOrders]);
  const montageTabOrders = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&!o.lock&&o.installation==='ΝΑΙ'&&o.stdInProd&&!o.stdMontDone).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [customOrders]);
  const dipliOrders = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&(o.status==='STD_PENDING'||!o.status||o.status==='PENDING')&&o.status!=='STD_BUILD').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [customOrders]);
  const readyOrders = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_READY').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [customOrders]);
  const moniSoldOrders = useMemo(() => [...customOrders, ...soldOrders].filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_SOLD').sort((a,b)=>(b.soldAt||0)-(a.soldAt||0)), [customOrders, soldOrders]);
  const dipliReadyOrders = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_READY').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [customOrders]);
  const dipliSoldOrders = useMemo(() => [...customOrders, ...soldOrders].filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_SOLD').sort((a,b)=>(b.soldAt||0)-(a.soldAt||0)), [customOrders, soldOrders]);
  const moniTotal = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&(o.status==='STD_PENDING'||o.status==='STD_BUILD'||!o.status)).length, [customOrders]);
  const dipliTotal = useMemo(() => customOrders.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&(o.status==='STD_PENDING'||o.status==='STD_BUILD'||!o.status)).length, [customOrders]);

  return (
    <View style={{flex:1, flexDirection:'row'}}>

      {/* ══ ΚΥΡΙΟ ΠΕΡΙΕΧΟΜΕΝΟ ══ */}
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

      {/* Modal επιβεβαίωσης ΕΠΙΣΤΡΟΦΗ */}
      <Modal visible={returnConfirmModal.visible} transparent animationType="fade">
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'white', borderRadius:16, padding:24, width:'85%', maxWidth:400}}>
            <Text style={{fontSize:18, fontWeight:'bold', color:'#ff9800', marginBottom:8, textAlign:'center'}}>↩ Επιστροφή Παραγγελίας</Text>
            <Text style={{fontSize:14, color:'#444', marginBottom:4, textAlign:'center'}}>
              Παραγγελία <Text style={{fontWeight:'bold'}}>#{returnConfirmModal.order?.orderNo}</Text>
            </Text>
            <Text style={{fontSize:13, color:'#666', marginBottom:20, textAlign:'center'}}>
              Θέλεις να επιστρέψεις την παραγγελία για διόρθωση;
            </Text>
            <TouchableOpacity
              style={{backgroundColor:'#ff9800', padding:14, borderRadius:10, alignItems:'center', marginBottom:8}}
              onPress={()=>{
                const order = returnConfirmModal.order;
                setReturnConfirmModal({visible:false, order:null});
                editOrder(order);
                // Αλλαγή tab στην καταχώρηση (index 0)
                if (setTabIndex) {
                  setTabIndex(0);
                }
                setTimeout(()=>{
                  if(Platform.OS==='web') window.scrollTo({top:0, behavior:'smooth'});
                  else mainScrollRef.current?.scrollTo({y:0, animated:true});
                }, 150);
              }}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>✅ ΕΠΙΒΕΒΑΙΩΣΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd'}}
              onPress={()=>setReturnConfirmModal({visible:false, order:null})}>
              <Text style={{color:'#555', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal επιβεβαίωσης ΑΠΟΘΗΚΕΥΣΗ (όταν είναι σε editing mode) */}
      <Modal visible={saveConfirmModal.visible} transparent animationType="fade">
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'white', borderRadius:16, padding:24, width:'85%', maxWidth:400}}>
            <Text style={{fontSize:18, fontWeight:'bold', color:'#8B0000', marginBottom:8, textAlign:'center'}}>💾 Αποθήκευση Αλλαγών</Text>
            <Text style={{fontSize:14, color:'#444', marginBottom:20, textAlign:'center'}}>
              Είσαι σίγουρος για τις αλλαγές;
            </Text>
            <TouchableOpacity
              style={{backgroundColor:'#8B0000', padding:14, borderRadius:10, alignItems:'center', marginBottom:8}}
              onPress={async()=>{
                setSaveConfirmModal({visible:false});
                await saveOrder();
                // Επιστροφή στο αποθηκευμένο scroll position
                setTimeout(()=>{
                  if(Platform.OS==='web') {
                    window.scrollTo({top:scrollPosition, behavior:'smooth'});
                  } else {
                    mainScrollRef.current?.scrollTo({y:scrollPosition, animated:true});
                  }
                }, 300);
              }}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>✅ ΕΠΙΒΕΒΑΙΩΣΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd'}}
              onPress={()=>setSaveConfirmModal({visible:false})}>
              <Text style={{color:'#555', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal επιβεβαίωσης ΕΠΕΞΕΡΓΑΣΙΑ */}
      <Modal visible={editConfirmModal.visible} transparent animationType="fade">
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'white', borderRadius:16, padding:24, width:'85%', maxWidth:400}}>
            <Text style={{fontSize:18, fontWeight:'bold', color:'#1565C0', marginBottom:8, textAlign:'center'}}>✏️ Επεξεργασία Παραγγελίας</Text>
            <Text style={{fontSize:14, color:'#444', marginBottom:4, textAlign:'center'}}>
              Παραγγελία <Text style={{fontWeight:'bold'}}>#{editConfirmModal.order?.orderNo}</Text>
            </Text>
            <Text style={{fontSize:13, color:'#666', marginBottom:20, textAlign:'center'}}>
              Θέλετε να ανοίξετε την παραγγελία για επεξεργασία;
            </Text>
            <TouchableOpacity
              style={{backgroundColor:'#1565C0', padding:14, borderRadius:10, alignItems:'center', marginBottom:8}}
              onPress={()=>{
                const order = editConfirmModal.order;
                setEditConfirmModal({visible:false, order:null});
                setIsSaving(true);
                editOrder(order);
                setTimeout(()=>{
                  setIsSaving(false);
                  if(Platform.OS==='web') window.scrollTo({top:0, behavior:'smooth'});
                  else mainScrollRef.current?.scrollTo({y:0, animated:true});
                }, 300);
              }}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>✏️ ΝΑΙ, ΕΠΕΞΕΡΓΑΣΙΑ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd'}}
              onPress={()=>setEditConfirmModal({visible:false, order:null})}>
              <Text style={{color:'#555', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal επιλογής δανεισμού δέσμευσης */}
      <Modal visible={borrowModal.visible} transparent animationType="fade" onRequestClose={()=>setBorrowModal({visible:false,order:null,stockType:null,candidates:[]})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'white', borderRadius:16, padding:20, width:'90%', maxWidth:420, maxHeight:'80%'}}>
            <Text style={{fontSize:16, fontWeight:'bold', color:'#1565C0', marginBottom:4, textAlign:'center'}}>
              🔄 Δανεισμός Δέσμευσης
            </Text>
            <Text style={{fontSize:13, color:'#444', marginBottom:4, textAlign:'center'}}>
              Παραγγελία <Text style={{fontWeight:'bold'}}>#{borrowModal.order?.orderNo}</Text>
            </Text>
            <Text style={{fontSize:12, color:'#666', marginBottom:4, textAlign:'center'}}>
              {borrowModal.order?.h}x{borrowModal.order?.w} | {borrowModal.order?.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ'} | {borrowModal.stockType==='case'?'ΚΑΣΑ':'ΣΑΣΙ'}
            </Text>
            <Text style={{fontSize:12, color:'#888', marginBottom:12, textAlign:'center', lineHeight:18}}>
              Επιλέξτε από ποια παραγγελία θα πάρετε τη δέσμευση:
            </Text>
            <ScrollView style={{maxHeight:300}}>
              {borrowModal.candidates.map((c, i) => (
                <TouchableOpacity
                  key={c.id}
                  style={{backgroundColor:'#f5f5f5', borderRadius:10, padding:12, marginBottom:8, borderLeftWidth:4, borderLeftColor:'#1565C0'}}
                  onPress={()=>{
                    // Ανοίγουμε το borrowConfirmModal (React Modal) αντί για window.confirm
                    setBorrowConfirmModal({
                      visible: true,
                      candidate: c,
                      order: borrowModal.order,
                      stockType: borrowModal.stockType,
                    });
                    setBorrowModal({visible:false, order:null, stockType:null, candidates:[]});
                  }}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                    <View style={{flex:1}}>
                      <Text style={{fontWeight:'bold', fontSize:14, color:'#1a1a1a'}}>#{c.orderNo}</Text>
                      {c.customer?<Text style={{fontSize:12, color:'#555', marginTop:2}}>👤 {c.customer}</Text>:null}
                      <Text style={{fontSize:12, color:'#555', marginTop:2}}>{c.h}x{c.w} | {c.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ'} | {c.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</Text>
                      {c.status?<Text style={{fontSize:11, color:'#888', marginTop:1}}>Κατάσταση: {c.status}</Text>:null}
                    </View>
                    <Text style={{fontSize:24, color:'#1565C0'}}>→</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={{backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', marginTop:8, borderWidth:1, borderColor:'#ddd'}}
              onPress={()=>setBorrowModal({visible:false,order:null,stockType:null,candidates:[]})}>
              <Text style={{color:'#555', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal επιβεβαίωσης δανεισμού δέσμευσης — αντικαθιστά το window.confirm */}
      <Modal visible={borrowConfirmModal.visible} transparent animationType="fade" onRequestClose={()=>setBorrowConfirmModal({visible:false,candidate:null,order:null,stockType:null})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.75)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'white', borderRadius:16, padding:24, width:'88%', maxWidth:400}}>
            <Text style={{fontSize:16, fontWeight:'bold', color:'#1565C0', marginBottom:12, textAlign:'center'}}>
              🔄 Επιβεβαίωση Δανεισμού
            </Text>
            <Text style={{fontSize:14, color:'#333', marginBottom:8, textAlign:'center', lineHeight:20}}>
              Θέλετε να πάρετε τη δέσμευση{' '}
              <Text style={{fontWeight:'bold'}}>{borrowConfirmModal.stockType==='case'?'κάσας':'σασί'}</Text>
              {' '}από την παραγγελία{' '}
              <Text style={{fontWeight:'bold'}}>#{borrowConfirmModal.candidate?.orderNo}</Text>;
            </Text>
            <Text style={{fontSize:12, color:'#888', marginBottom:20, textAlign:'center', lineHeight:18}}>
              Η #{borrowConfirmModal.candidate?.orderNo} θα χάσει τη δέσμευσή της και θα αναπληρωθεί αυτόματα με προτεραιότητα όταν μπει νέο stock.
            </Text>
            <TouchableOpacity
              style={{backgroundColor:'#1565C0', padding:14, borderRadius:10, alignItems:'center', marginBottom:8}}
              onPress={()=>{
                // Αποθηκεύουμε τα δεδομένα ΠΡΙΝ κλείσουμε το modal
                const candidate = borrowConfirmModal.candidate;
                const order = borrowConfirmModal.order;
                const stockType = borrowConfirmModal.stockType;
                // Κλείνουμε το modal
                setBorrowConfirmModal({visible:false, candidate:null, order:null, stockType:null});
                // Εκτελούμε τον δανεισμό με τα αποθηκευμένα δεδομένα
                if (candidate && order && stockType) {
                  setTimeout(() => {
                    handleBorrowConfirmDirect(candidate, order, stockType);
                  }, 50);
                }
              }}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>✅ ΝΑΙ, ΔΑΝΕΙΣΜΟΣ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd'}}
              onPress={()=>setBorrowConfirmModal({visible:false, candidate:null, order:null, stockType:null})}>
              <Text style={{color:'#555', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal επιτυχίας/σφάλματος δανεισμού — αντικαθιστά το window.alert */}
      <Modal visible={borrowSuccessModal.visible} transparent animationType="fade" onRequestClose={()=>setBorrowSuccessModal({visible:false,message:''})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'white', borderRadius:16, padding:24, width:'85%', maxWidth:380}}>
            <Text style={{fontSize:15, color:'#333', marginBottom:20, textAlign:'center', lineHeight:22}}>
              {borrowSuccessModal.message}
            </Text>
            <TouchableOpacity
              style={{backgroundColor:'#1565C0', padding:14, borderRadius:10, alignItems:'center'}}
              onPress={()=>setBorrowSuccessModal({visible:false, message:''})}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>ΟΚ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Loading overlay — μπλοκάρει την οθόνη κατά την ανάρτηση για επεξεργασία */}
      {isSaving && (
        <View style={{position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center', zIndex:9999}}>
          <View style={{backgroundColor:'white', borderRadius:16, padding:28, alignItems:'center', minWidth:200}}>
            <Text style={{fontSize:32, marginBottom:12}}>⏳</Text>
            <Text style={{fontSize:16, fontWeight:'bold', color:'#1565C0', textAlign:'center'}}>Φόρτωση παραγγελίας...</Text>
            <Text style={{fontSize:12, color:'#888', marginTop:6, textAlign:'center'}}>Παρακαλώ περιμένετε</Text>
          </View>
        </View>
      )}


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
          {/* ═══ ΦΟΡΜΑ ΚΑΤΑΧΩΡΗΣΗΣ — εμφανίζεται μόνο στο ΚΑΤΑΧΩΡΗΣΗ tab ═══ */}
          {formOnly && (<>
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
              const allForDup = [...customOrders, ...soldOrders];
              const exists = allForDup.some(o=>o.orderNo===customForm.orderNo && o.id!==editingOrder?.id);
              if (exists) {
                const base = customForm.orderNo;
                const suggested = computeSuggested(base, allForDup, editingOrder?.id);
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
              const allForDup = [...customOrders, ...soldOrders];
              const exists = allForDup.some(o=>o.orderNo===customForm.orderNo && o.id!==editingOrder?.id);
              if (exists) {
                const base = customForm.orderNo;
                const suggested = computeSuggested(base, allForDup, editingOrder?.id);
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
                    <View style={{flex:1}}>
                      <Text style={[vstyles.fieldLabelDark,{textAlign:'center'}]}>Μείωση Ύψους</Text>
                      <TextInput style={[styles.qtyInput,{borderColor:'#ff9800',color:'#ff9800',marginTop:2,marginBottom:0,width:'100%',fontSize:16,padding:5}]} placeholder="—" keyboardType="numeric" maxLength={2} value={customForm.heightReduction} onChangeText={v=>{ const n=v.replace(/[^0-9]/g,''); setCustomForm({...customForm,heightReduction:n?'-'+n:''}); }} selectTextOnFocus/>
                    </View>
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
                        <TouchableOpacity key={t} style={[vstyles.togBtnSm,customForm.sasiType===t&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,sasiType:t})}>
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

          

          {/* Κουμπιά αποθήκευσης — διαφορετικά για editing mode */}
          {editingOrder ? (
            <View style={{flexDirection:'row', gap:8, marginTop:4}}>
              <TouchableOpacity
                style={[styles.saveBtn, {flex:1, backgroundColor:'#888'}]}
                onPress={()=>{
                  Keyboard.dismiss();
                  resetForm();
                  // Επιστροφή στο αποθηκευμένο scroll position
                  setTimeout(()=>{
                    if(Platform.OS==='web') {
                      window.scrollTo({top:scrollPosition, behavior:'smooth'});
                    } else {
                      mainScrollRef.current?.scrollTo({y:scrollPosition, animated:true});
                    }
                  }, 150);
                }}>
                <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>✕ ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, {flex:1, backgroundColor:'#8B0000'}]}
                onPress={()=>{
                  Keyboard.dismiss();
                  setSaveConfirmModal({visible:true});
                }}>
                <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>💾 ΑΠΟΘΗΚΕΥΣΗ</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{flexDirection:'row', gap:8}}>
              {(customForm.orderNo||customForm.customer||customForm.h||customForm.w||editingOrder) ? (
                <TouchableOpacity
                  style={[styles.saveBtn, {flex:1, backgroundColor:'#555'}]}
                  onPress={()=>{ Keyboard.dismiss(); resetForm(); }}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>✕ ΑΚΥΡΩΣΗ</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.saveBtn, {flex:2, backgroundColor:'#8B0000'}]}
                onPress={()=>{
                  Keyboard.dismiss();
                  saveOrder();
                }}>
                <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>📐 ΑΠΟΘΗΚΕΥΣΗ ΠΑΡΑΓΓΕΛΙΑΣ</Text>
              </TouchableOpacity>
            </View>
          )}


          {/* ΠΑΡΑΓΓΕΛΙΕΣ ΤΥΠΟΠΟΙΗΜΕΝΩΝ — κρύβεται όταν formOnly */}
          </>)}
          {!formOnly && (<>
            <Text style={styles.mainTitle}>ΠΑΡΑΓΓΕΛΙΕΣ ΤΥΠΟΠΟΙΗΜΕΝΩΝ</Text>

            {/* Wrapper που μπλοκάρει τις παραγγελίες κατά την επεξεργασία */}
            <View pointerEvents={editingOrder ? 'none' : 'auto'} style={editingOrder ? {opacity:0.35, borderRadius:10, overflow:'hidden'} : {}}>

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
                  <View key={o.id}
                    style={{backgroundColor:'#fff', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor:cardBorder, elevation:2}}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                      <View style={{flex:1}}>
                        {/* ΓΡΑΜΜΗ 1: ημερομηνία — #νούμερο — πελάτης — τεμάχια */}
                        <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                          {fmtDate(o.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold'}}>📅 {fmtDate(o.createdAt)}</Text>:null}
                          <Text style={{fontWeight:'900', fontSize:16, color:'#1a1a1a'}}>#{o.orderNo}</Text>
                          {o.customer?<Text style={{fontSize:14, fontWeight:'bold', color:'#333'}}>{o.customer}</Text>:null}
                          {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:16,fontWeight:'900',color:'#cc0000'}}>{o.qty}τεμ</Text>:null}
                          <TouchableOpacity
                            onPress={()=>requestEditOrder(o)}
                            style={{backgroundColor:'#1565C0', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}>
                            <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✏️ ΕΠΕΞ</Text>
                          </TouchableOpacity>
                        </View>
                        {/* ΓΡΑΜΜΗ 2: διάσταση — φορά — τύπος σασί — χρώμα εξαρτημάτων */}
                        <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
                          <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.h}x{o.w}</Text>
                          <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
                          <Text style={{fontSize:12, fontWeight:'bold', color: o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'#8B0000':'#1565C0'}}>{o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</Text>
                          {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#555'}}>🎨 {o.hardware}</Text>:null}
                        </View>
                        {/* ΓΡΑΜΜΗ 3: κλειδαριά — τύπος κάσας — επένδυση */}
                        {(o.lock||o.caseType||(o.coatings&&o.coatings.length>0))&&(
                          <Text style={{fontSize:11, color:'#555', marginTop:2}}>
                            {[
                              o.lock?`🔒 ${o.lock}`:'',
                              o.caseType?(o.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ ΚΑΣΑ':'ΚΛΕΙΣΤΗ ΚΑΣΑ'):'',
                              o.coatings&&o.coatings.length>0?o.coatings.join(', '):''
                            ].filter(Boolean).join(' — ')}
                          </Text>
                        )}
                        {/* ΓΡΑΜΜΗ 4: μείωση ύψους — σταθερά */}
                        {o.heightReduction?<Text style={{fontSize:11, color:'#e65100', fontWeight:'bold', marginTop:2}}>📏 Μείωση: {o.heightReduction}</Text>:null}
                        {o.stavera&&o.stavera.filter(s=>s.dim).length>0?<Text style={{fontSize:11, color:'#555', marginTop:2}}>📐 {o.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}</Text>:null}
                        {/* ΓΡΑΜΜΗ 5: παρατηρήσεις */}
                        {o.notes?<Text style={{fontSize:11, color:'#888', marginTop:2}}>Σημ: {o.notes}</Text>:null}
                        {o.deliveryDate?<Text style={{fontSize:10, color:'#007AFF', marginTop:2}}>📅 {o.deliveryDate}</Text>:null}
                      </View>
                      <View style={{alignItems:'flex-end', gap:4, marginLeft:8}}>
                        <View style={{flexDirection:'row', gap:4}}>
                          {/* ΚΑΣΑ — πατήσιμο αν ❌ για δανεισμό */}
                          <TouchableOpacity
                            activeOpacity={hasCase ? 1 : 0.7}
                            onPress={()=>{ if(!hasCase) handleBorrowRequest(o, 'case'); }}
                            style={{alignItems:'center', backgroundColor: hasCase?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: hasCase?'#00C851':'#ff4444', minWidth:44}}>
                            <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΚΑΣΑ</Text>
                            <Text style={{fontSize:14}}>{hasCase?'✅':'❌'}</Text>
                            {!hasCase&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
                          </TouchableOpacity>
                          {/* ΣΑΣΙ — πατήσιμο αν ❌ για δανεισμό */}
                          <TouchableOpacity
                            activeOpacity={sasiOk ? 1 : 0.7}
                            onPress={()=>{ if(!sasiOk && sasiActive) handleBorrowRequest(o, 'sasi'); }}
                            style={{alignItems:'center', backgroundColor: sasiOk?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: sasiOk?'#00C851':'#ff4444', minWidth:44}}>
                            <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΣΑΣΙ</Text>
                            <Text style={{fontSize:14}}>{sasiOk?'✅':'❌'}</Text>
                            {!sasiOk&&sasiActive&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
                          </TouchableOpacity>
                        </View>

                        {/* ΕΠΙΣΤΡΟΦΗ */}
                        <TouchableOpacity
                          style={{backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignSelf:'stretch', alignItems:'center'}}
                          onPress={()=>{
                            // Αποθηκεύω scroll position
                            if(Platform.OS==='web') {
                              setScrollPosition(window.pageYOffset || document.documentElement.scrollTop);
                            } else {
                              mainScrollRef.current?.measure((x, y, width, height, pageX, pageY) => {
                                setScrollPosition(pageY);
                              });
                            }
                            // Ανοίγω confirmation modal
                            setReturnConfirmModal({ visible: true, order: o });
                          }}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΕΠΙΣΤΡ</Text>
                        </TouchableOpacity>

                        {/* ΔΙΑΓΡΑΦΗ */}
                        <TouchableOpacity
                          style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignSelf:'stretch', alignItems:'center'}}
                          onPress={async()=>{
                            if(!window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) return;
                            await handleDeleteAndRelease(o);
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
                                setReadyConfirmModal({visible:true, order:o, sasiItem, caseItem});
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
                  </View>
                );
              };

              // Κάρτα ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ
              const renderReadyCard = (o) => (
                <View key={o.id} style={{backgroundColor:'#e8f5e9', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor:'#00C851', elevation:2}}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <View style={{flex:1}}>
                      {/* ΓΡΑΜΜΗ 1: ημερομηνία — #νούμερο — πελάτης — τεμάχια */}
                      <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                        {fmtDate(o.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold'}}>📅 {fmtDate(o.createdAt)}</Text>:null}
                        <Text style={{fontWeight:'900', fontSize:16, color:'#1a1a1a'}}>#{o.orderNo}</Text>
                        {o.customer?<Text style={{fontSize:14, fontWeight:'bold', color:'#333'}}>{o.customer}</Text>:null}
                        {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:16,fontWeight:'900',color:'#cc0000'}}>{o.qty}τεμ</Text>:null}
                      </View>
                      {/* ΓΡΑΜΜΗ 2: διάσταση — φορά — τύπος σασί — χρώμα εξαρτημάτων */}
                      <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
                        <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.h}x{o.w}</Text>
                        <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
                        <Text style={{fontSize:12, fontWeight:'bold', color: o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'#8B0000':'#1565C0'}}>{o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</Text>
                        {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#555'}}>🎨 {o.hardware}</Text>:null}
                      </View>
                      {/* ΓΡΑΜΜΗ 3: κλειδαριά — τύπος κάσας — επένδυση */}
                      {(o.lock||o.caseType||(o.coatings&&o.coatings.length>0))&&(
                        <Text style={{fontSize:11, color:'#555', marginTop:2}}>
                          {[
                            o.lock?`🔒 ${o.lock}`:'',
                            o.caseType?(o.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ ΚΑΣΑ':'ΚΛΕΙΣΤΗ ΚΑΣΑ'):'',
                            o.coatings&&o.coatings.length>0?o.coatings.join(', '):''
                          ].filter(Boolean).join(' — ')}
                        </Text>
                      )}
                      {/* ΓΡΑΜΜΗ 4: μείωση ύψους — σταθερά */}
                      {o.heightReduction?<Text style={{fontSize:11, color:'#e65100', fontWeight:'bold', marginTop:2}}>📏 Μείωση: {o.heightReduction}</Text>:null}
                      {o.stavera&&o.stavera.filter(s=>s.dim).length>0?<Text style={{fontSize:11, color:'#555', marginTop:2}}>📐 {o.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}</Text>:null}
                      {/* ΓΡΑΜΜΗ 5: παρατηρήσεις — ημερομηνία παράδοσης */}
                      {o.notes?<Text style={{fontSize:11, color:'#888', marginTop:2}}>Σημ: {o.notes}</Text>:null}
                      {o.deliveryDate?<Text style={{fontSize:10, color:'#007AFF', marginTop:2}}>📅 Παράδοση: {o.deliveryDate}</Text>:null}
                      {/* BADGES: ΜΟΝΤΑΡΙΣΜΕΝΗ + ΣΤΑΘΕΡΑ */}
                      <View style={{flexDirection:'row', flexWrap:'wrap', gap:4, marginTop:4}}>
                        {o.stdMounted&&<View style={{backgroundColor:'#1565C0', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}><Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🔧 ΜΟΝΤΑΡΙΣΜΕΝΗ</Text></View>}
                        {(o.stavera&&o.stavera.filter(s=>s.dim).length>0&&!o.staveraDone)&&<View style={{backgroundColor:'#c62828', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}><Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🔴 ΑΝΑΜΟΝΗ ΓΙΑ ΣΤΑΘΕΡΟ</Text></View>}
                        {(o.stavera&&o.stavera.filter(s=>s.dim).length>0&&o.staveraDone)&&<View style={{backgroundColor:'#2e7d32', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}><Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🟢 ΣΤΑΘΕΡΑ</Text></View>}
                      </View>
                    </View>
                    <View style={{gap:4, marginLeft:8}}>
                      <TouchableOpacity
                        style={{backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                        onPress={()=>{
                          if(o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'){
                            setConfirmModal({
                              visible:true,
                              title:'Επιστροφή στα ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ',
                              message:'Η παραγγελία θα επιστρέψει στα ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ.',
                              confirmText:'ΝΑΙ',
                              onConfirm:async()=>{
                                const upd = {...o, status:'STD_BUILD', readyAt:null};
                                setCustomOrders(prev=>prev.map(x=>x.id===o.id?upd:x));
                                await syncToCloud(upd);
                              }
                            });
                          } else if(o.installation==='ΝΑΙ'){
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
                            const hadBuild = !!(o.buildTasks && Object.keys(o.buildTasks).length > 0);
                            setConfirmModal({
                              visible:true,
                              title:'Επιστροφή',
                              message: hadBuild ? 'Η παραγγελία θα επιστρέψει στα ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ.' : 'Η παραγγελία θα επιστρέψει στις καταχωρημένες.',
                              confirmText:'ΝΑΙ',
                              onConfirm:async()=>{
                                const upd = {...o, status: hadBuild ? 'STD_BUILD' : 'STD_PENDING', readyAt:null};
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
                            const soldOrder = {...o, status:'STD_SOLD', soldAt:now};
                            setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                            setSoldOrders(prev=>[soldOrder,...prev]);
                            await syncToCloud(soldOrder);
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
                          onPress={async()=>{
                          const ok = Platform.OS==='web' ? window.confirm("❌ ΑΚΥΡΩΣΗ\nΑκύρωση παραγγελίας;\n\n• Η κάσα ξεδεσμεύεται\n• Το σασί πηγαίνει στα ΜΕΝΟΝΤΑ") : await new Promise(r=>Alert.alert("❌ ΑΚΥΡΩΣΗ","Ακύρωση παραγγελίας;",[{text:"ΟΧΙ",onPress:()=>r(false)},{text:"ΝΑΙ",style:"destructive",onPress:()=>r(true)}]));
                          if(!ok) return;
                          {
                              const customer = o.customer || `#${o.orderNo}`;
                              const orderQty = parseInt(o.qty)||1;
                              setCustomOrders(customOrders.filter(x=>x.id!==o.id));
                              await deleteFromCloud(o.id);
                              if (setCaseStock && caseStock[caseKey(String(o.h),String(o.w),o.side,o.caseType)]) {
                                const ckAk = caseKey(String(o.h),String(o.w),o.side,o.caseType);
                                const entryAk = {...caseStock[ckAk], reservations:(caseStock[ckAk].reservations||[]).filter(r=>r.orderNo!==o.orderNo)};
                                setCaseStock(prev=>({...prev,[ckAk]:entryAk}));
                                await fetch(`${FIREBASE_URL}/case_stock/${ckAk}.json`,{method:'PUT',body:JSON.stringify(entryAk)});
                              }
                              if (setDipliSasiStock) {
                                const sasiEntry = {
                                  id: `dsasi_${Date.now()}`,
                                  h:o.h, w:o.w, side:o.side,
                                  sasiType:o.sasiType||'ΜΟΝΗ ΘΩΡΑΚΙΣΗ',
                                  hardware:o.hardware||'', lock:o.lock||'',
                                  caseType:o.caseType||'', coatings:o.coatings||[],
                                  stavera:o.stavera||[], heightReduction:o.heightReduction||'',
                                  orderNo:o.orderNo, customer:o.customer||'',
                                  notes:o.notes||'', menonNotes:'',
                                  createdAt:o.createdAt||Date.now(),
                                  movedToMenonAt:Date.now(),
                                };
                                setDipliSasiStock(prev=>[sasiEntry,...prev]);
                                await fetch(`${FIREBASE_URL}/dipli_sasi_stock/${sasiEntry.id}.json`,{method:'PUT',body:JSON.stringify(sasiEntry)});
                              }
                          }
                        }}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>❌ ΑΚΥΡΩΣΗ</Text>
                        </TouchableOpacity>
                      )}
                      {/* #8 ΜΕΝΟΝΤΑ από ΕΤΟΙΜΑ */}
                      <TouchableOpacity
                        style={{backgroundColor:'#4a148c', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                        onPress={()=>setConfirmModal({
                          visible:true,
                          title:'→ ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ',
                          message:`Μεταφορά #${o.orderNo} στα ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ;`,
                          confirmText:'ΝΑΙ',
                          onConfirm:async()=>{
                            const entry = {
                              id:`menon_${Date.now()}`,
                              h:o.h, w:o.w, side:o.side,
                              sasiType:o.sasiType||'ΜΟΝΗ ΘΩΡΑΚΙΣΗ',
                              hardware:o.hardware||'', lock:o.lock||'',
                              caseType:o.caseType||'', coatings:o.coatings||[],
                              stavera:o.stavera||[], heightReduction:o.heightReduction||'',
                              installation:o.installation||'ΟΧΙ',
                              orderNo:o.orderNo, customer:o.customer||'',
                              notes:o.notes||'', menonNotes:'',
                              createdAt:o.createdAt||Date.now(),
                              movedToMenonAt:Date.now(),
                            };
                            setDipliSasiStock(prev=>[entry,...prev]);
                            await fetch(`${FIREBASE_URL}/dipli_sasi_stock/${entry.id}.json`,{method:'PUT',body:JSON.stringify(entry)});
                            setCustomOrders(prev=>prev.filter(x=>x.id!==o.id));
                            await deleteFromCloud(o.id);
                            // Ξεδεσμεύω stock
                            if (setCaseStock && caseStock[caseKey(String(o.h),String(o.w),o.side,o.caseType)]) {
                              const ck2 = caseKey(String(o.h),String(o.w),o.side,o.caseType);
                              const e2 = {...caseStock[ck2], reservations:(caseStock[ck2].reservations||[]).filter(r=>r.orderNo!==o.orderNo)};
                              setCaseStock(prev=>({...prev,[ck2]:e2}));
                              await fetch(`${FIREBASE_URL}/case_stock/${ck2}.json`,{method:'PUT',body:JSON.stringify(e2)});
                            }
                          }
                        })}>
                        <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>📦 ΜΕΝΤΑ ΕΜΠ.</Text>
                      </TouchableOpacity>


                    </View>
                  </View>
                </View>
              );

              // Κάρτα ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ
              const renderSoldCard = (o) => (
                <View key={o.id} style={{backgroundColor:'#f5f5f5', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor: o.fromMenon?'#7b1fa2':'#888', elevation:1}}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <View style={{flex:1}}>
                      {/* Badge αν προέρχεται από ΜΕΝΟΝΤΑ */}
                      {o.fromMenon&&<View style={{backgroundColor:'#7b1fa2',borderRadius:4,paddingHorizontal:6,paddingVertical:2,alignSelf:'flex-start',marginBottom:4}}><Text style={{color:'white',fontWeight:'bold',fontSize:10}}>📦 ΑΠΟ ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ</Text></View>}
                      {/* Ημερομηνία καταχώρησης + ημερομηνία πώλησης */}
                      <View style={{flexDirection:'row', gap:8, flexWrap:'wrap'}}>
                        {fmtDate(o.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold'}}>📅 {fmtDate(o.createdAt)}</Text>:null}
                        {o.soldAt?<Text style={{fontSize:11,color:'#00796B',fontWeight:'bold'}}>💰 {fmtDate(o.soldAt)}</Text>:null}
                        {o.deliveryDate?<Text style={{fontSize:11,color:'#e65100',fontWeight:'bold'}}>🚚 {o.deliveryDate}</Text>:null}
                      </View>
                      {/* ΓΡΑΜΜΗ 1: #νούμερο — πελάτης — τεμάχια */}
                      <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap', marginTop:2}}>
                        <Text style={{fontWeight:'900', fontSize:15, color:'#333'}}>#{o.orderNo}</Text>
                        {o.customer?<Text style={{fontSize:13, fontWeight:'bold', color:'#444'}}>{o.customer}</Text>:null}
                        {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:14,fontWeight:'900',color:'#cc0000'}}>{o.qty}τεμ</Text>:null}
                        {o.partialNote?<Text style={{fontSize:11,color:'#e65100',fontWeight:'bold'}}>({o.partialNote})</Text>:null}
                      </View>
                      {/* ΓΡΑΜΜΗ 2: διάσταση — φορά — τύπος σασί */}
                      <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
                        <Text style={{fontSize:14, fontWeight:'900', color:'#555'}}>{o.h}x{o.w}</Text>
                        <Text style={{fontSize:14, fontWeight:'900', color:'#555'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
                        <Text style={{fontSize:12, fontWeight:'bold', color: o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'#8B0000':'#1565C0'}}>{o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</Text>
                        {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#666'}}>🎨 {o.hardware}</Text>:null}
                      </View>
                      {/* ΓΡΑΜΜΗ 3: κλειδαριά — τύπος κάσας — υλικό — επένδυση */}
                      {(o.lock||o.caseType||o.caseMaterial||(o.coatings&&o.coatings.length>0))&&(
                        <Text style={{fontSize:11, color:'#666', marginTop:2}}>
                          {[
                            o.lock?`🔒 ${o.lock}`:'',
                            o.caseType?(o.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ ΚΑΣΑ':'ΚΛΕΙΣΤΗ ΚΑΣΑ'):'',
                            o.caseMaterial&&o.caseMaterial!=='DKP'?o.caseMaterial:'',
                            o.coatings&&o.coatings.length>0?`🎨 ${o.coatings.join(', ')}`:''
                          ].filter(Boolean).join(' — ')}
                        </Text>
                      )}
                      {/* ΓΡΑΜΜΗ 4: μείωση ύψους — σταθερά */}
                      {o.heightReduction?<Text style={{fontSize:11,color:'#e65100',fontWeight:'bold',marginTop:2}}>📏 Μείωση: {o.heightReduction}</Text>:null}
                      {o.stavera&&o.stavera.filter(s=>s.dim).length>0?<Text style={{fontSize:11,color:'#666',marginTop:2}}>📐 {o.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}</Text>:null}
                      {/* ΓΡΑΜΜΗ 5: μοντάρισμα */}
                      {o.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:3}}><View style={{backgroundColor:'#E65100',borderRadius:4,paddingHorizontal:6,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:11}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
                      {/* ΓΡΑΜΜΗ 6: παρατηρήσεις */}
                      {o.notes?<Text style={{fontSize:11, color:'#888', marginTop:2}}>Σημ: {o.notes}</Text>:null}
                      {/* menonNotes — εμφανίζεται μόνο αν προέρχεται από ΜΕΝΟΝΤΑ */}
                      {o.fromMenon&&o.menonNotes?<Text style={{fontSize:11, color:'#7b1fa2', fontWeight:'bold', marginTop:2}}>📝 {o.menonNotes}</Text>:null}
                    </View>
                    <View style={{gap:4, marginLeft:8}}>
                      {o.fromMenon ? (
                        /* Παραγγελία από ΜΕΝΟΝΤΑ: μόνο επιστροφή στα ΜΕΝΟΝΤΑ */
                        <TouchableOpacity
                          style={{backgroundColor:'#7b1fa2', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                          onPress={()=>setConfirmModal({
                            visible:true,
                            title:'↩ Επιστροφή στα ΜΕΝΟΝΤΑ',
                            message:`Η παραγγελία #${o.orderNo} θα επιστρέψει στα ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ;`,
                            confirmText:'ΝΑΙ',
                            onConfirm:async()=>{
                              const entry = {
                                id:`menon_${Date.now()}`,
                                h:o.h, w:o.w, side:o.side,
                                sasiType:o.sasiType||'ΜΟΝΗ ΘΩΡΑΚΙΣΗ',
                                hardware:o.hardware||'', lock:o.lock||'',
                                caseType:o.caseType||'', coatings:o.coatings||[],
                                stavera:o.stavera||[], heightReduction:o.heightReduction||'',
                                installation:o.installation||'ΟΧΙ',
                                orderNo:o.orderNo, customer:o.customer||'',
                                notes:o.notes||'', menonNotes:o.menonNotes||'',
                                createdAt:o.createdAt||Date.now(),
                                movedToMenonAt:Date.now(),
                              };
                              setDipliSasiStock(prev=>[entry,...prev]);
                              await fetch(`${FIREBASE_URL}/dipli_sasi_stock/${entry.id}.json`,{method:'PUT',body:JSON.stringify(entry)});
                              setCustomOrders(prev=>prev.filter(x=>x.id!==o.id));
                              await deleteFromCloud(o.id);
                              await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ','Επιστροφή στα ΜΕΝΟΝΤΑ από Αρχείο Πωλήσεων',{orderNo:o.orderNo,customer:o.customer,size:`${o.h}x${o.w}`});
                            }
                          })}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΜΕΝΟΝΤΑ</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{gap:4}}>
                        {/* Κανονική παραγγελία: ΠΙΣΩ στα ΕΤΟΙΜΑ + ΜΕΝΟΝΤΑ ΕΜΠ. */}
                        <TouchableOpacity
                          style={{backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                          onPress={()=>setConfirmModal({
                            visible:true,
                            title:'Επιστροφή στα ΕΤΟΙΜΑ',
                            message:`Η παραγγελία #${o.orderNo} θα επιστρέψει στα ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ;\n\nΤο stock σασί και κάσα θα ενημερωθεί αυτόματα.`,
                            confirmText:'ΝΑΙ',
                            onConfirm:async()=>{
                              const upd = {...o, status:'STD_READY', soldAt:null};
                              setCustomOrders(prev=>prev.map(x=>x.id===o.id?upd:x));
                              await syncToCloud(upd);

                              // ── Επαναφορά stock: προσθήκη qty + reservation ──
                              const orderQty = parseInt(o.qty)||1;
                              const isMoni = (o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType) && !o.lock;
                              const sk = sasiKey(String(o.h), String(o.w), o.side);
                              const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                              const newRes = { orderNo: o.orderNo, customer: o.customer||'', qty: orderQty };

                              // Επαναφορά σασί (μόνο για ΜΟΝΗ χωρίς κλειδαριά)
                              if (isMoni && setSasiStock) {
                                try {
                                  const res = await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`);
                                  const data = await res.json();
                                  const base = data || { qty: 0, reservations: [] };
                                  const alreadyExists = (base.reservations||[]).some(r=>r.orderNo===o.orderNo);
                                  if (!alreadyExists) {
                                    const updEntry = {
                                      ...base,
                                      qty: (parseInt(base.qty)||0) + orderQty,
                                      reservations: [...(base.reservations||[]), newRes]
                                    };
                                    await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`,{method:'PUT',body:JSON.stringify(updEntry)});
                                    setSasiStock(prev=>({...prev,[sk]:updEntry}));
                                  }
                                } catch(e) { console.error('restore sasi stock:', e); }
                              }

                              // Επαναφορά κάσας (πάντα)
                              if (setCaseStock) {
                                try {
                                  const res = await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`);
                                  const data = await res.json();
                                  const base = data || { qty: 0, reservations: [] };
                                  const alreadyExists = (base.reservations||[]).some(r=>r.orderNo===o.orderNo);
                                  if (!alreadyExists) {
                                    const updEntry = {
                                      ...base,
                                      qty: (parseInt(base.qty)||0) + orderQty,
                                      reservations: [...(base.reservations||[]), newRes]
                                    };
                                    await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`,{method:'PUT',body:JSON.stringify(updEntry)});
                                    setCaseStock(prev=>({...prev,[ck]:updEntry}));
                                  }
                                } catch(e) { console.error('restore case stock:', e); }
                              }

                              await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ','Επιστροφή από Αρχείο Πωλήσεων',{orderNo:o.orderNo,customer:o.customer,size:`${o.h}x${o.w}`});
                            }
                          })}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΠΙΣΩ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{backgroundColor:'#4a148c', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                          onPress={()=>setConfirmModal({
                            visible:true,
                            title:'→ ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ',
                            message:`Μεταφορά παραγγελίας #${o.orderNo} στα ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ;`,
                            confirmText:'ΝΑΙ',
                            onConfirm:async()=>{
                              const entry = {
                                id:`menon_${Date.now()}`,
                                h:o.h, w:o.w, side:o.side,
                                sasiType:o.sasiType||'ΜΟΝΗ ΘΩΡΑΚΙΣΗ',
                                hardware:o.hardware||'', lock:o.lock||'',
                                caseType:o.caseType||'', coatings:o.coatings||[],
                                stavera:o.stavera||[], heightReduction:o.heightReduction||'',
                                installation:o.installation||'ΟΧΙ',
                                orderNo:o.orderNo, customer:o.customer||'',
                                notes:o.notes||'', menonNotes:'',
                                createdAt:o.createdAt||Date.now(),
                                movedToMenonAt:Date.now(),
                              };
                              setDipliSasiStock(prev=>[entry,...prev]);
                              await fetch(`${FIREBASE_URL}/dipli_sasi_stock/${entry.id}.json`,{method:'PUT',body:JSON.stringify(entry)});
                              setSoldOrders(prev=>prev.filter(x=>x.id!==o.id));
                              setCustomOrders(prev=>prev.filter(x=>x.id!==o.id));
                              await deleteFromCloud(o.id);
                            }
                          })}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>📦 ΜΕΝΤΑ ΕΜΠ.</Text>
                        </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );

              // Φιλτράρω ανά status — οι λίστες είναι memoized στο component level

              // ΜΟΝΗ — έλεγχος με βάση reservations[]
              const moniCards = moniOrders.map(o=>{
                const sk = sasiKey(String(o.h), String(o.w), o.side);
                const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                // ✅ FIFO: η παραγγελία καλύπτεται αν το αθροιστικό ως αυτήν <= stock
                const checkStock = (stockMap, key, orderNo) => {
                  const entry = stockMap?.[key];
                  if (!entry) return false;
                  const totalQty = parseInt(entry.qty) || 0;
                  let cumulative = 0;
                  for (const r of (entry.reservations || [])) {
                    cumulative += (parseInt(r.qty) || 1);
                    if (r.orderNo === orderNo) return cumulative <= totalQty;
                  }
                  return false;
                };
                const hasSasi = checkStock(sasiStock, sk, o.orderNo);
                const hasCase = checkStock(caseStock, ck, o.orderNo);
                return renderStdCard(o, hasSasi, hasCase, true);
              });

              // ΔΙΠΛΗ — έλεγχος με νέο stock
              const dipliCards = dipliOrders.map(o=>{
                const ckD = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                // ✅ FIFO: η παραγγελία καλύπτεται αν το αθροιστικό ως αυτήν <= stock
                const checkStock = (stockMap, key, orderNo) => {
                  const entry = stockMap?.[key];
                  if (!entry) return false;
                  const totalQty = parseInt(entry.qty) || 0;
                  let cumulative = 0;
                  for (const r of (entry.reservations || [])) {
                    cumulative += (parseInt(r.qty) || 1);
                    if (r.orderNo === orderNo) return cumulative <= totalQty;
                  }
                  return false;
                };
                const hasCase = checkStock(caseStock, ckD, o.orderNo);
                return renderStdCard(o, false, hasCase, false);
              });

              // Counters για tabs — memoized στο component level

              return (<>
                {/* TABS ΜΟΝΗ / ΔΙΠΛΗ — κρύβονται όταν έρχεται από sidebar */}
                {!forcedTab && <View style={{flexDirection:'row', marginTop:8, marginBottom:4}}>
                  <TouchableOpacity
                    style={{flex:1, padding:12, alignItems:'center', borderRadius:8, marginRight:4, backgroundColor: stdTab==='ΜΟΝΗ'?'#5c6bc0':'#e0e0e0'}}
                    onPress={()=>stdTab==='ΜΟΝΗ'?toggleSection('stdMoniOpen'):setStdTab('ΜΟΝΗ')}>
                    <Text style={{fontWeight:'bold', color: stdTab==='ΜΟΝΗ'?'white':'#555'}}>
                      ΜΟΝΗ ΘΩΡΑΚΙΣΗ ({moniTotal}) {stdTab==='ΜΟΝΗ'?(expanded.stdMoniOpen?'▲':'▼'):''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{flex:1, padding:12, alignItems:'center', borderRadius:8, marginLeft:4, backgroundColor: stdTab==='ΔΙΠΛΗ'?'#8B0000':'#e0e0e0'}}
                    onPress={()=>stdTab==='ΔΙΠΛΗ'?toggleSection('stdDipliOpen'):setStdTab('ΔΙΠΛΗ')}>
                    <Text style={{fontWeight:'bold', color: stdTab==='ΔΙΠΛΗ'?'white':'#555'}}>
                      ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ ({dipliTotal}) {stdTab==='ΔΙΠΛΗ'?(expanded.stdDipliOpen?'▲':'▼'):''}
                    </Text>
                  </TouchableOpacity>
                </View>}

                {/* ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΠΑΡΑΓΓΕΛΙΕΣ */}
                {(stdTab==='ΜΟΝΗ'&&expanded.stdMoniOpen || forcedTab==='ΜΟΝΗ')&&(<>
                  {/* ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ — ΜΟΝΗ */}
                  {stdBuildMoniOrders.length>0&&(
                    <>
                      <TouchableOpacity
                        style={[styles.listHeader,{backgroundColor:'#e65100', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}
                        onPress={()=>toggleSection('stdBuildMoni')}>
                        <Text style={styles.listHeaderText}>🔨 ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ ({stdBuildMoniOrders.length})</Text>
                        <View style={{flexDirection:'row', gap:6, alignItems:'center'}}>
                          <TouchableOpacity
                            style={{backgroundColor:'white', paddingHorizontal:8, paddingVertical:4, borderRadius:6}}
                            onPress={e=>{e.stopPropagation?.(); handleBuildPrint(stdBuildMoniOrders,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ','status');}}>
                            <Text style={{color:'#e65100', fontSize:10, fontWeight:'bold'}}>🖨️ ΚΑΤΑΣΤΑΣΗ</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{backgroundColor:'#1a1a1a', paddingHorizontal:8, paddingVertical:4, borderRadius:6}}
                            onPress={e=>{e.stopPropagation?.(); handleBuildPrint(stdBuildMoniOrders,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ','prod');}}>
                            <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>🖨️ ΠΑΡΑΓΩΓΗ</Text>
                          </TouchableOpacity>
                          <Text style={{color:'white'}}>{expanded.stdBuildMoni?'▲':'▼'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expanded.stdBuildMoni&&stdBuildMoniOrders.map(o=>{
                        const sk = sasiKey(String(o.h), String(o.w), o.side);
                        const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                        const checkStock = (stockMap, key) => {
                          const entry = stockMap?.[key];
                          if (!entry) return false;
                          const totalQty = parseInt(entry.qty)||0;
                          let cum = 0;
                          for (const r of (entry.reservations||[])) {
                            cum += (parseInt(r.qty)||1);
                            if (r.orderNo===o.orderNo) return cum<=totalQty;
                          }
                          return false;
                        };
                        const hasSasiReserved = (('stavera' in (o.buildTasks||{})) || ('montage' in (o.buildTasks||{}))) && !('sasi' in (o.buildTasks||{}));
                        const hasSasiOk = !hasSasiReserved || checkStock(sasiStock, sk);
                        const hasCaseOk = checkStock(caseStock, ck);
                        const tasks = o.buildTasks||{};
                        const taskLabels = {stavera:'📐 Σταθερό', lock:'🔒 Κλειδαριά', heightReduction:'📏 Μείωση', montage:'🪛 Μοντάρ.', sasi:'🔧 Σασί'};
                        const allDone = Object.keys(tasks).length>0 && Object.values(tasks).every(v=>v===true);
                        return (
                          <View key={o.id} style={{backgroundColor:'#fff', borderRadius:8, marginBottom:6, borderLeftWidth:5, borderLeftColor: allDone?'#00C851':'#e65100', elevation:2, padding:10}}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                              <View style={{flex:1}}>
                                {/* ΓΡΑΜΜΗ 1: ημερομηνία — #νούμερο — πελάτης — τεμάχια */}
                                <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                                  {fmtDate(o.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold'}}>📅 {fmtDate(o.createdAt)}</Text>:null}
                                  <Text style={{fontWeight:'900', fontSize:16, color:'#1a1a1a'}}>#{o.orderNo}</Text>
                                  {o.customer?<Text style={{fontSize:14, fontWeight:'bold', color:'#333'}}>{o.customer}</Text>:null}
                                  {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:16,fontWeight:'900',color:'#cc0000'}}>{o.qty}τεμ</Text>:null}
                                  <TouchableOpacity
                                    onPress={()=>requestEditOrder(o)}
                                    style={{backgroundColor:'#1565C0', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}>
                                    <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✏️ ΕΠΕΞ</Text>
                                  </TouchableOpacity>
                                </View>
                                {/* ΓΡΑΜΜΗ 2: διάσταση — φορά — τύπος σασί — χρώμα */}
                                <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
                                  <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.h}x{o.w}</Text>
                                  <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
                                  <Text style={{fontSize:12, fontWeight:'bold', color:'#1565C0'}}>ΜΟΝΗ</Text>
                                  {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#555'}}>🎨 {o.hardware}</Text>:null}
                                </View>
                                {/* ΓΡΑΜΜΗ 3: κλειδαριά — τύπος κάσας — επένδυση */}
                                {(o.lock||o.caseType||(o.coatings&&o.coatings.length>0))&&(
                                  <Text style={{fontSize:11, color:'#555', marginTop:2}}>
                                    {[o.lock?`🔒 ${o.lock}`:'', o.caseType?(o.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ ΚΑΣΑ':'ΚΛΕΙΣΤΗ ΚΑΣΑ'):'', o.coatings&&o.coatings.length>0?o.coatings.join(', '):''].filter(Boolean).join(' — ')}
                                  </Text>
                                )}
                                {/* ΓΡΑΜΜΗ 4: μείωση — σταθερά */}
                                {o.heightReduction?<Text style={{fontSize:11, color:'#e65100', fontWeight:'bold', marginTop:2}}>📏 Μείωση: {o.heightReduction}</Text>:null}
                                {o.stavera&&o.stavera.filter(s=>s.dim).length>0?<Text style={{fontSize:11, color:'#555', marginTop:2}}>📐 {o.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?" "+s.note:"")).join(" | ")}</Text>:null}
                                {/* ΓΡΑΜΜΗ 5: παρατηρήσεις */}
                                {o.notes?<Text style={{fontSize:11,color:'#888',marginTop:2}}>Σημ: {o.notes}</Text>:null}
                                {/* CHECKBOXES ΟΡΙΖΟΝΤΙΑ */}
                                <View style={{marginTop:6, flexDirection:'row', flexWrap:'wrap', gap:6, alignItems:'center'}}>
                                  {Object.entries(tasks).map(([key, done])=>(
                                    <TouchableOpacity key={key} style={{flexDirection:'row', alignItems:'center', gap:4, backgroundColor: done?'#e8f5e9':'#fff3e0', borderRadius:6, paddingHorizontal:8, paddingVertical:5, borderWidth:1, borderColor: done?'#00C851':'#e65100'}}
                                      onPress={()=>handleBuildTaskToggle(o, key)}>
                                      <View style={{width:18, height:18, borderRadius:4, borderWidth:2, borderColor: done?'#00C851':'#e65100', backgroundColor: done?'#00C851':'white', alignItems:'center', justifyContent:'center'}}>
                                        {done&&<Text style={{color:'white',fontWeight:'bold',fontSize:10}}>✓</Text>}
                                      </View>
                                      <Text style={{fontSize:11, color: done?'#00C851':'#e65100', fontWeight:'bold'}}>{taskLabels[key]||key}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>
                              {/* ΚΑΣΑ + ΣΑΣΙ + ΔΙΑΓΡΑΦΗ — δεξιά */}
                              <View style={{alignItems:'flex-end', gap:4, marginLeft:8}}>
                                <View style={{flexDirection:'row', gap:4}}>
                                  {/* ΚΑΣΑ — πατήσιμο αν ❌ για δανεισμό (ΜΟΝΗ ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ) */}
                                  <TouchableOpacity
                                    activeOpacity={hasCaseOk ? 1 : 0.7}
                                    onPress={()=>{ if(!hasCaseOk) handleBorrowRequest(o, 'case'); }}
                                    style={{alignItems:'center', backgroundColor: hasCaseOk?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: hasCaseOk?'#00C851':'#ff4444', minWidth:44}}>
                                    <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΚΑΣΑ</Text>
                                    <Text style={{fontSize:14}}>{hasCaseOk?'✅':'❌'}</Text>
                                    {!hasCaseOk&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
                                  </TouchableOpacity>
                                  {hasSasiReserved&&(
                                    <TouchableOpacity
                                      activeOpacity={hasSasiOk ? 1 : 0.7}
                                      onPress={()=>{ if(!hasSasiOk) handleBorrowRequest(o, 'sasi'); }}
                                      style={{alignItems:'center', backgroundColor: hasSasiOk?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: hasSasiOk?'#00C851':'#ff4444', minWidth:44}}>
                                      <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΣΑΣΙ</Text>
                                      <Text style={{fontSize:14}}>{hasSasiOk?'✅':'❌'}</Text>
                                      {!hasSasiOk&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
                                    </TouchableOpacity>
                                  )}
                                </View>
                                {/* ΕΠΙΣΤΡΟΦΗ */}
                                <TouchableOpacity
                                  style={{backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignItems:'center'}}
                                  onPress={()=>{
                                    // Αποθηκεύω scroll position
                                    if(Platform.OS==='web') {
                                      setScrollPosition(window.pageYOffset || document.documentElement.scrollTop);
                                    } else {
                                      mainScrollRef.current?.measure((x, y, width, height, pageX, pageY) => {
                                        setScrollPosition(pageY);
                                      });
                                    }
                                    // Ανοίγω confirmation modal
                                    setReturnConfirmModal({ visible: true, order: o });
                                  }}>
                                  <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΕΠΙΣΤΡ</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignItems:'center'}}
                                  onPress={async()=>{
                                    if(!window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) return;
                                    await handleDeleteAndRelease(o);
                                  }}>
                                  <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </>
                  )}

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
                              {fmtDate(o.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold',marginBottom:2}}>📅 {fmtDate(o.createdAt)}</Text>:null}
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
                            {fmtDate(o.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold',marginBottom:2}}>📅 {fmtDate(o.createdAt)}</Text>:null}
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
                                      editOrder(o);
                                      setTimeout(()=>{
                                        if(Platform.OS==='web') window.scrollTo({top:0, behavior:'smooth'});
                                        else mainScrollRef.current?.scrollTo({y:0, animated:true});
                                      }, 150);
                                    }},
                                    {text:"🗑️ ΔΙΑΓΡΑΦΗ", style:"destructive", onPress:async()=>{
                                      Alert.alert("🗑️ Επιβεβαίωση","Σίγουρα διαγραφή της #"+o.orderNo+";",[
                                        {text:"ΑΚΥΡΟ", style:"cancel"},
                                        {text:"ΔΙΑΓΡΑΦΗ", style:"destructive", onPress:async()=>{
                                          await handleDeleteAndRelease(o);
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
                              {fmtDate(o.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold',marginBottom:2}}>📅 {fmtDate(o.createdAt)}</Text>:null}
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
                    <Text style={styles.listHeaderText}>🗂 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ({moniSoldOrders.length})</Text>
                    <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                      {expanded.stdSold&&moniSoldOrders.length>0&&<TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                        onPress={()=>handleStdPrint(moniSoldOrders,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ',caseReady,sasiReady)}>
                        <Text style={{color:'#555', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>}
                      <Text style={{color:'white'}}>{expanded.stdSold?'▲':'▼'}</Text>
                    </View>
                  </TouchableOpacity>
                  {expanded.stdSold&&(moniSoldOrders.length>0?moniSoldOrders.map(o=>renderSoldCard(o)):
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν πωλήσεις</Text>
                  )}

                  {/* ΜΕΝΟΝΤΑ — ΜΟΝΗ */}
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#4a148c', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('moniSasiStock')}>
                    <Text style={styles.listHeaderText}>📦 ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ ({dipliSasiStock.filter(s=>!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ').length})</Text>
                    <Text style={{color:'white'}}>{expanded.moniSasiStock?'▲':'▼'}</Text>
                  </TouchableOpacity>
                  {expanded.moniSasiStock&&dipliSasiStock.filter(s=>!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ').length===0&&(
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν μένοντα</Text>
                  )}
                  {expanded.moniSasiStock&&dipliSasiStock.filter(s=>!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ').map(s=>(
                    <View key={s.id} style={{backgroundColor:'white', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:5, borderLeftColor:'#9c27b0', elevation:1}}>
                      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <View style={{flex:1}}>
                          {fmtDate(s.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold'}}>📅 {fmtDate(s.createdAt)}</Text>:null}
                          <Text style={{fontWeight:'bold', fontSize:13}}>#{s.orderNo} {s.customer?`— ${s.customer}`:''}</Text>
                          <Text style={{fontSize:12, color:'#555', marginTop:1}}>{s.h}x{s.w} | {s.side} | ΜΟΝΗ</Text>
                          {s.hardware?<Text style={{fontSize:11,color:'#555'}}>🎨 {s.hardware}</Text>:null}
                          {s.lock?<Text style={{fontSize:11,color:'#555'}}>🔒 {s.lock}</Text>:null}
                          {s.caseType?<Text style={{fontSize:11,color:'#555'}}>{s.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ ΚΑΣΑ':'ΚΛΕΙΣΤΗ ΚΑΣΑ'}</Text>:null}
                          {s.heightReduction?<Text style={{fontSize:11,color:'#e65100',fontWeight:'bold'}}>📏 Μείωση: {s.heightReduction}</Text>:null}
                          {s.stavera&&s.stavera.filter(x=>x.dim).length>0?<Text style={{fontSize:11,color:'#555'}}>📐 {s.stavera.filter(x=>x.dim).map(x=>x.dim).join(' | ')}</Text>:null}
                          {s.notes?<Text style={{fontSize:11,color:'#888'}}>Σημ: {s.notes}</Text>:null}
                          {/* Πλαίσιο κειμένου σημειώσεων */}
                          <TextInput
                            style={{borderWidth:1, borderColor:'#ce93d8', borderRadius:6, padding:6, fontSize:11, color:'#333', marginTop:6, minHeight:36}}
                            placeholder="Σημειώσεις μένοντα..."
                            placeholderTextColor="#bbb"
                            multiline
                            value={s.menonNotes||''}
                            onChangeText={(v)=>{
                              const upd = {...s, menonNotes:v};
                              setDipliSasiStock(prev=>prev.map(x=>x.id===s.id?upd:x));
                              clearTimeout(menonNotesTimers.current[s.id]);
                              menonNotesTimers.current[s.id] = setTimeout(() => {
                                fetch(`${FIREBASE_URL}/dipli_sasi_stock/${s.id}.json`,{method:'PUT',body:JSON.stringify(upd)});
                              }, 500);
                            }}
                          />
                        </View>
                        <View style={{gap:4, marginLeft:8}}>
                          <TouchableOpacity
                            style={{backgroundColor:'#00796B', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                            onPress={()=>setMenonSellModal({visible:true, entry:s, newCustomer:''})}>
                            <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>💰 ΠΩΛΗΣΗ</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{backgroundColor:'#c62828', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                            onPress={()=>Alert.alert("Διαγραφή","Διαγραφή από ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ;",[
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
                    </View>
                  ))}
                </>)}

                {/* ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ */}
                {(stdTab==='ΔΙΠΛΗ'&&expanded.stdDipliOpen || forcedTab==='ΔΙΠΛΗ')&&(<>

                  {/* ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ — ΔΙΠΛΗ */}
                  {stdBuildDipliOrders.length>0&&(
                    <>
                      <TouchableOpacity
                        style={[styles.listHeader,{backgroundColor:'#e65100', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}
                        onPress={()=>toggleSection('stdBuildDipli')}>
                        <Text style={styles.listHeaderText}>🔨 ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ ({stdBuildDipliOrders.length})</Text>
                        <View style={{flexDirection:'row', gap:6, alignItems:'center'}}>
                          <TouchableOpacity
                            style={{backgroundColor:'white', paddingHorizontal:8, paddingVertical:4, borderRadius:6}}
                            onPress={e=>{e.stopPropagation?.(); handleBuildPrint(stdBuildDipliOrders,'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ','status');}}>
                            <Text style={{color:'#e65100', fontSize:10, fontWeight:'bold'}}>🖨️ ΚΑΤΑΣΤΑΣΗ</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{backgroundColor:'#1a1a1a', paddingHorizontal:8, paddingVertical:4, borderRadius:6}}
                            onPress={e=>{e.stopPropagation?.(); handleBuildPrint(stdBuildDipliOrders,'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ','prod');}}>
                            <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>🖨️ ΠΑΡΑΓΩΓΗ</Text>
                          </TouchableOpacity>
                          <Text style={{color:'white'}}>{expanded.stdBuildDipli?'▲':'▼'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expanded.stdBuildDipli&&stdBuildDipliOrders.map(o=>{
                        const ckD = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                        const checkStock = (stockMap, key) => {
                          const entry = stockMap?.[key];
                          if (!entry) return false;
                          const totalQty = parseInt(entry.qty)||0;
                          let cum = 0;
                          for (const r of (entry.reservations||[])) {
                            cum += (parseInt(r.qty)||1);
                            if (r.orderNo===o.orderNo) return cum<=totalQty;
                          }
                          return false;
                        };
                        const hasCaseOk = checkStock(caseStock, ckD);
                        const tasks = o.buildTasks||{};
                        const taskLabels = {stavera:'📐 Σταθερό', lock:'🔒 Κλειδαριά', heightReduction:'📏 Μείωση', montage:'🪛 Μοντάρ.', sasi:'🔧 Σασί'};
                        const allDone = Object.keys(tasks).length>0 && Object.values(tasks).every(v=>v===true);
                        return (
                          <View key={o.id} style={{backgroundColor:'#fff', borderRadius:8, marginBottom:6, borderLeftWidth:5, borderLeftColor: allDone?'#00C851':'#e65100', elevation:2, padding:10}}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                              <View style={{flex:1}}>
                                {/* ΓΡΑΜΜΗ 1: #νούμερο — πελάτης — τεμάχια */}
                                <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                                  <Text style={{fontWeight:'900', fontSize:16, color:'#1a1a1a'}}>#{o.orderNo}</Text>
                                  {o.customer?<Text style={{fontSize:14, fontWeight:'bold', color:'#333'}}>{o.customer}</Text>:null}
                                  {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:16,fontWeight:'900',color:'#cc0000'}}>{o.qty}τεμ</Text>:null}
                                  <TouchableOpacity
                                    onPress={()=>requestEditOrder(o)}
                                    style={{backgroundColor:'#1565C0', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}>
                                    <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✏️ ΕΠΕΞ</Text>
                                  </TouchableOpacity>
                                </View>
                                {/* ΓΡΑΜΜΗ 2: διάσταση — φορά — ΔΙΠΛΗ — χρώμα */}
                                <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
                                  <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.h}x{o.w}</Text>
                                  <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
                                  <Text style={{fontSize:12, fontWeight:'bold', color:'#8B0000'}}>ΔΙΠΛΗ</Text>
                                  {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#555'}}>🎨 {o.hardware}</Text>:null}
                                </View>
                                {/* ΓΡΑΜΜΗ 3: κλειδαριά — τύπος κάσας — επένδυση */}
                                {(o.lock||o.caseType||(o.coatings&&o.coatings.length>0))&&(
                                  <Text style={{fontSize:11, color:'#555', marginTop:2}}>
                                    {o.lock?`🔒 ${o.lock}`:''}
                                    {o.lock&&o.caseType?' — ':''}
                                    {o.caseType?(o.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'):''}
                                    {o.coatings&&o.coatings.length>0?' — '+o.coatings.join(', '):''}
                                  </Text>
                                )}
                                {/* ΓΡΑΜΜΗ 4: μείωση — σταθερά */}
                                {(o.heightReduction||(o.stavera&&o.stavera.filter(s=>s.dim).length>0))&&(
                                  <Text style={{fontSize:11, color:'#555', marginTop:2}}>
                                    {o.heightReduction?<Text style={{color:'#e65100',fontWeight:'bold'}}>📏 {o.heightReduction}</Text>:null}
                                    {o.heightReduction&&o.stavera&&o.stavera.filter(s=>s.dim).length>0?' — ':''}
                                    {o.stavera&&o.stavera.filter(s=>s.dim).length>0?`📐 ${o.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}`:null}
                                  </Text>
                                )}
                                {/* ΓΡΑΜΜΗ 5: παρατηρήσεις */}
                                {o.notes?<Text style={{fontSize:11,color:'#888',marginTop:2}}>Σημ: {o.notes}</Text>:null}
                                {/* CHECKBOXES ΟΡΙΖΟΝΤΙΑ */}
                                <View style={{marginTop:6, flexDirection:'row', flexWrap:'wrap', gap:6, alignItems:'center'}}>
                                  {Object.entries(tasks).map(([key, done])=>(
                                    <TouchableOpacity key={key} style={{flexDirection:'row', alignItems:'center', gap:4, backgroundColor: done?'#e8f5e9':'#fff3e0', borderRadius:6, paddingHorizontal:8, paddingVertical:5, borderWidth:1, borderColor: done?'#00C851':'#e65100'}}
                                      onPress={()=>handleBuildTaskToggle(o, key)}>
                                      <View style={{width:18, height:18, borderRadius:4, borderWidth:2, borderColor: done?'#00C851':'#e65100', backgroundColor: done?'#00C851':'white', alignItems:'center', justifyContent:'center'}}>
                                        {done&&<Text style={{color:'white',fontWeight:'bold',fontSize:10}}>✓</Text>}
                                      </View>
                                      <Text style={{fontSize:11, color: done?'#00C851':'#e65100', fontWeight:'bold'}}>{taskLabels[key]||key}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>
                              <View style={{alignItems:'flex-end', gap:4, marginLeft:8}}>
                                {/* ΚΑΣΑ — πατήσιμο αν ❌ για δανεισμό (ΔΙΠΛΗ ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ) */}
                                <TouchableOpacity
                                  activeOpacity={hasCaseOk ? 1 : 0.7}
                                  onPress={()=>{ if(!hasCaseOk) handleBorrowRequest(o, 'case'); }}
                                  style={{alignItems:'center', backgroundColor: hasCaseOk?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: hasCaseOk?'#00C851':'#ff4444', minWidth:44}}>
                                  <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΚΑΣΑ</Text>
                                  <Text style={{fontSize:14}}>{hasCaseOk?'✅':'❌'}</Text>
                                  {!hasCaseOk&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
                                </TouchableOpacity>

                                {/* ΕΠΙΣΤΡΟΦΗ */}
                                <TouchableOpacity
                                  style={{backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignItems:'center'}}
                                  onPress={()=>{
                                    // Αποθηκεύω scroll position
                                    if(Platform.OS==='web') {
                                      setScrollPosition(window.pageYOffset || document.documentElement.scrollTop);
                                    } else {
                                      mainScrollRef.current?.measure((x, y, width, height, pageX, pageY) => {
                                        setScrollPosition(pageY);
                                      });
                                    }
                                    // Ανοίγω confirmation modal
                                    setReturnConfirmModal({ visible: true, order: o });
                                  }}>
                                  <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΕΠΙΣΤΡ</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignItems:'center'}}
                                  onPress={async()=>{
                                    if(!window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) return;
                                    await handleDeleteAndRelease(o);
                                  }}>
                                  <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </>
                  )}


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

                  {/* ΜΕΝΟΝΤΑ — ΔΙΠΛΗ */}
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#4a148c', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('dipliSasiStock')}>
                    <Text style={styles.listHeaderText}>📦 ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ ({dipliSasiStock.filter(s=>s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').length})</Text>
                    <Text style={{color:'white'}}>{expanded.dipliSasiStock?'▲':'▼'}</Text>
                  </TouchableOpacity>
                  {expanded.dipliSasiStock&&dipliSasiStock.filter(s=>s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').length===0&&(
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν μένοντα</Text>
                  )}
                  {expanded.dipliSasiStock&&dipliSasiStock.filter(s=>s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').map(s=>(
                    <View key={s.id} style={{backgroundColor:'white', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:5, borderLeftColor:'#9c27b0', elevation:1}}>
                      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <View style={{flex:1}}>
                          {fmtDate(s.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold'}}>📅 {fmtDate(s.createdAt)}</Text>:null}
                          <Text style={{fontWeight:'bold', fontSize:13}}>#{s.orderNo} {s.customer?`— ${s.customer}`:''}</Text>
                          <Text style={{fontSize:12, color:'#555', marginTop:1}}>{s.h}x{s.w} | {s.side} | ΔΙΠΛΗ</Text>
                          {s.hardware?<Text style={{fontSize:11,color:'#555'}}>🎨 {s.hardware}</Text>:null}
                          {s.lock?<Text style={{fontSize:11,color:'#555'}}>🔒 {s.lock}</Text>:null}
                          {s.caseType?<Text style={{fontSize:11,color:'#555'}}>{s.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ ΚΑΣΑ':'ΚΛΕΙΣΤΗ ΚΑΣΑ'}</Text>:null}
                          {s.heightReduction?<Text style={{fontSize:11,color:'#e65100',fontWeight:'bold'}}>📏 Μείωση: {s.heightReduction}</Text>:null}
                          {s.stavera&&s.stavera.filter(x=>x.dim).length>0?<Text style={{fontSize:11,color:'#555'}}>📐 {s.stavera.filter(x=>x.dim).map(x=>x.dim).join(' | ')}</Text>:null}
                          {s.notes?<Text style={{fontSize:11,color:'#888'}}>Σημ: {s.notes}</Text>:null}
                          <TextInput
                            style={{borderWidth:1, borderColor:'#ce93d8', borderRadius:6, padding:6, fontSize:11, color:'#333', marginTop:6, minHeight:36}}
                            placeholder="Σημειώσεις μένοντα..."
                            placeholderTextColor="#bbb"
                            multiline
                            value={s.menonNotes||''}
                            onChangeText={(v)=>{
                              const upd = {...s, menonNotes:v};
                              setDipliSasiStock(prev=>prev.map(x=>x.id===s.id?upd:x));
                              clearTimeout(menonNotesTimers.current[s.id]);
                              menonNotesTimers.current[s.id] = setTimeout(() => {
                                fetch(`${FIREBASE_URL}/dipli_sasi_stock/${s.id}.json`,{method:'PUT',body:JSON.stringify(upd)});
                              }, 500);
                            }}
                          />
                        </View>
                        <View style={{gap:4, marginLeft:8}}>
                          <TouchableOpacity
                            style={{backgroundColor:'#00796B', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                            onPress={()=>setMenonSellModal({visible:true, entry:s, newCustomer:''})}>
                            <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>💰 ΠΩΛΗΣΗ</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{backgroundColor:'#c62828', paddingHorizontal:8, paddingVertical:5, borderRadius:5, alignItems:'center'}}
                            onPress={()=>Alert.alert("Διαγραφή","Διαγραφή από ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ;",[
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
                    </View>
                  ))}
                </>)}
              </>);
            })()}
            </View>{/* end editing wrapper */}
          </>)}
        </View>
      </ScrollView>

      {/* MODAL ΠΩΛΗΣΗ ΑΠΟ ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ */}
      <Modal visible={menonSellModal.visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modalBox,{width:'85%'}]}>
            <Text style={styles.modalTitle}>💰 ΠΩΛΗΣΗ ΑΠΟ ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ</Text>
            {menonSellModal.entry&&(
              <Text style={{fontSize:12,color:'#555',marginBottom:12,textAlign:'center'}}>
                #{menonSellModal.entry.orderNo} | {menonSellModal.entry.h}x{menonSellModal.entry.w} | {menonSellModal.entry.side}
              </Text>
            )}
            <Text style={{fontSize:13,color:'#333',marginBottom:6,fontWeight:'bold'}}>Επιλογή πελάτη:</Text>
            {/* Search πελάτη */}
            <TextInput
              style={{borderWidth:1,borderColor:'#9c27b0',borderRadius:8,padding:10,fontSize:14,color:'#333',marginBottom:4,width:'100%'}}
              placeholder="Αναζήτηση πελάτη..."
              placeholderTextColor="#bbb"
              value={menonSellModal.newCustomer}
              onChangeText={v=>setMenonSellModal(m=>({...m,newCustomer:v}))}
              autoFocus
            />
            {/* Λίστα πελατών */}
            {menonSellModal.newCustomer.trim().length>0&&(
              <ScrollView style={{maxHeight:140, borderWidth:1, borderColor:'#e0e0e0', borderRadius:8, marginBottom:8, width:'100%'}}>
                {(customers||[])
                  .filter(c=>c.name?.toLowerCase().includes(menonSellModal.newCustomer.toLowerCase()))
                  .map(c=>(
                    <TouchableOpacity key={c.id}
                      style={{padding:10, borderBottomWidth:1, borderBottomColor:'#f0f0f0'}}
                      onPress={()=>setMenonSellModal(m=>({...m, newCustomer:c.name}))}>
                      <Text style={{fontSize:13, color:'#333'}}>{c.name}</Text>
                    </TouchableOpacity>
                  ))
                }
              </ScrollView>
            )}
            <View style={{flexDirection:'row',gap:10,width:'100%'}}>
              <TouchableOpacity
                style={{flex:1,padding:12,borderRadius:8,alignItems:'center',backgroundColor:'#eee'}}
                onPress={()=>setMenonSellModal({visible:false,entry:null,newCustomer:''})}>
                <Text style={{fontWeight:'bold',color:'#555'}}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flex:1,padding:12,borderRadius:8,alignItems:'center',backgroundColor: menonSellModal.newCustomer.trim()?'#00796B':'#ccc'}}
                disabled={!menonSellModal.newCustomer.trim()}
                onPress={async()=>{
                  const s = menonSellModal.entry;
                  if (!s) return;
                  const buyer = menonSellModal.newCustomer.trim();
                  if (!buyer) return;
                  const soldEntry = {
                    ...s,
                    id: `sold_${Date.now()}`,
                    orderType: 'ΤΥΠΟΠΟΙΗΜΕΝΗ',
                    status: 'STD_SOLD',
                    customer: buyer,
                    soldAt: Date.now(),
                    fromMenon: true,
                    menonNotes: s.menonNotes||'',
                  };
                  setSoldOrders(prev=>[soldEntry,...prev]);
                  await fetch(`${FIREBASE_URL}/std_orders/${soldEntry.id}.json`,{method:'PUT',body:JSON.stringify(soldEntry)});
                  setDipliSasiStock(prev=>prev.filter(x=>x.id!==s.id));
                  await fetch(`${FIREBASE_URL}/dipli_sasi_stock/${s.id}.json`,{method:'DELETE'});
                  await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ','Πώληση από ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ',{orderNo:s.orderNo,customer:buyer,size:`${s.h}x${s.w}`});
                  setMenonSellModal({visible:false,entry:null,newCustomer:''});
                }}>
                <Text style={{fontWeight:'bold',color:'white'}}>✅ ΠΩΛΗΣΗ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL ΧΡΩΜΑ ΕΞΑΡΤΗΜΑΤΩΝ */}
      <HardwarePickerModal
        visible={showHardwarePicker}
        onClose={()=>setShowHardwarePicker(false)}
        customForm={customForm}
        setCustomForm={setCustomForm}
        showCustomHardwareInput={showCustomHardwareInput}
        setShowCustomHardwareInput={setShowCustomHardwareInput}
        customHardwareText={customHardwareText}
        setCustomHardwareText={setCustomHardwareText}
      />

      {/* MODAL ΚΛΕΙΔΑΡΙΕΣ */}
      <LockPickerModal
        visible={showLockPicker}
        onClose={()=>setShowLockPicker(false)}
        customForm={customForm}
        setCustomForm={setCustomForm}
        locks={locks}
      />

      {/* MODAL ΕΠΕΝΔΥΣΕΙΣ */}
      <CoatingsPickerModal
        visible={showCoatingsPicker}
        onClose={()=>setShowCoatingsPicker(false)}
        customForm={customForm}
        setCustomForm={setCustomForm}
        coatings={coatings}
      />

      {/* MODAL ΗΜΕΡΟΜΗΝΙΑ ΠΑΡΑΔΟΣΗΣ */}
      <DatePickerModal
        visible={showDatePicker}
        onClose={()=>setShowDatePicker(false)}
        customForm={customForm}
        setCustomForm={setCustomForm}
        datePickerDay={datePickerDay}
        setDatePickerDay={setDatePickerDay}
        datePickerMonth={datePickerMonth}
        setDatePickerMonth={setDatePickerMonth}
        datePickerYear={datePickerYear}
        setDatePickerYear={setDatePickerYear}
      />

      {/* PRINT PREVIEW MODAL */}
      <PrintPreviewModal
        printPreview={printPreview}
        setPrintPreview={setPrintPreview}
        getCopies={getCopies}
        onConfirmPrint={handleConfirmPrint}
      />

      </View>
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
  overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' },
});
