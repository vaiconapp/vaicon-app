import React, { useState, useRef, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, LayoutAnimation, Modal, Dimensions, Platform, Keyboard, Image } from 'react-native';
import qrcode from 'qrcode-generator';
import { FIREBASE_URL } from './firebaseConfig';
const makeQrDataUrl = (text) => { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createDataURL(6, 8); };
const SCREEN_WIDTH = Dimensions.get('window').width;
import { logActivity } from './activityLog';
import { fmtDate, fmtDateTime, parseDateStr, truthyBool, autoPriceLines, applyAutoPriceLines, DIPLI_MODELS, DIPLI_DEFAULT } from './utils';
import { sasiKey, caseKey, stockCovers } from './stockUtils';
import { SellModal, SplitModal, ConfirmModal, DuplicateModal } from './CustomFormModals';
import { HardwarePickerModal, LockPickerModal, CoatingsPickerModal, DatePickerModal, DipliModelPickerModal, MiscPickerModal, StavColumnPickerModal } from './CustomPickers';
import { PrintPreviewModal, PHASES } from './PrintPreview';
import { printHTML, buildPrintHTML, notesHtmlWithWarning } from './printUtils';
import { buildTasksForMoniStdOrder } from './stdOrderMigration';
import { StdOrderPreview } from './OrderPreview';
import { findFormatItem, getFormatStyle, getCoatingGroup, suggestNextOrderNo, groupOrderNo, splitBaseNo, nextGroupSuffix } from './formatHelpers';
import PriceListModal, { priceListTotal, priceFinalTotal, priceCatalogTotal } from './PriceListModal';
import MiniCalendar from './MiniCalendar';

// ── Helpers για νέο stock σύστημα ──


const STD_HEIGHTS = ['208','213','218','223'];
const STD_WIDTHS  = ['83','88','93','98'];
const INIT_FORM   = { customer:'', orderNo:'', h:'', w:'', hinges:'2', qty:'1', glassDim:'', glassNotes:'', armor:'ΜΟΝΗ', side:'ΔΕΞΙΑ', lock:'', cylinder:'', notes:'', status:'PENDING', hardware:'', installation:'ΟΧΙ', placement:'ΟΧΙ', caseType:'ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ', caseMaterial:'DKP', deliveryDate:'', sasiType:'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', dipliModel:'', coatings:[], coatingDetails:{}, stavera:[], stavColumn:null, heightReduction:'', kypri:'ΟΧΙ', misc:[], priceList:[], priceDiscount:'', priceLog:[], priceNote:'' };

/** Ετικέτες σταδίων κατασκευής — με/χωρίς εικονίδιο, με δυναμική ετικέτα ανά επένδυση (epend{i}) */
const STD_TASK_LABELS_ICON  = { stavera:'📐 Σταθερό', lock:'🔒 Κλειδαριά', heightReduction:'📏 Μείωση', montage:'🪛 Μοντάρ.', sasi:'🔧 Σασί', kypri:'🪟 Κυπρί', case:'📦 Κάσα', oversize:'📦 223/83' };
const STD_TASK_LABELS_PLAIN = { stavera:'Σταθερό', lock:'Κλειδαριά', heightReduction:'Μείωση', montage:'Μοντάρ.', sasi:'Σασί', kypri:'Κυπρί', case:'Κάσα', oversize:'223/83' };
const stdCoatNames = (o) => (o.coatings||[]).filter(c=>c&&String(c).trim());
// Σχέδια σταθερού (επεκτείνεται). Η επιλογή μπαίνει δίπλα στη διάσταση (βάση χρέωσης).
const STAV_DESIGNS = ['ΧΙΑΣΤΗ'];
const stavCycle = (d, list=STAV_DESIGNS) => { const opts=['',...((list&&list.length)?list:STAV_DESIGNS)]; return opts[(opts.indexOf(d||'')+1)%opts.length]; };
const stavParts = (s) => String(s?.dim||'') + (s?.design ? ' ' + s.design : '');
const isOversizeOrder = (o) => (o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType) && (String(o.h)==='223' || String(o.w)==='83');
// Παραγγελία «μόνο επενδύσεις ± μοντάρισμα»: STD_BUILD χωρίς κατασκευή σασί/223-83 — εμφανίζεται στις ΠΑΡΑΓΓΕΛΙΕΣ, όχι στα ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ.
const isCoatingsOnlyBuild = (o) => o.status==='STD_BUILD' && !isOversizeOrder(o) && o.buildTasks && Object.keys(o.buildTasks).length>0 && Object.keys(o.buildTasks).every(k=>k.startsWith('epend') || k==='montage');
const stdTaskLabel = (key, o, icon=true) => {
  if (key.startsWith('epend')) { const n = stdCoatNames(o)[parseInt(key.slice(5))||0] || 'Επένδυση'; return icon ? `🎨 ${n}` : n; }
  return (icon ? STD_TASK_LABELS_ICON : STD_TASK_LABELS_PLAIN)[key] || key;
};

// Προεπιλεγμένη ταξινόμηση ανά λίστα (αρ. παραγγελίας ή ημ. καταχώρησης)
const SORT_DEFAULTS = {
  'moni-build': { field:'orderNo', dir:'asc' },
  'moni-orders': { field:'orderNo', dir:'asc' },
  'moni-ready': { field:'orderNo', dir:'asc' },
  'moni-sold': { field:'createdAt', dir:'desc' },
  'dipli-build': { field:'orderNo', dir:'asc' },
  'dipli-ready': { field:'orderNo', dir:'asc' },
  'dipli-sold': { field:'createdAt', dir:'desc' },
};

// Στάδια για το πινακάκι «ΕΠΙΛΟΓΗ ΕΚΤΥΠΩΣΗΣ»: [key, panelLabel, titleLabel]
const BF_STAGES = [
  ['sasi','🔧 Σασί','ΣΑΣΙ'],
  ['case','📦 Κάσα','ΚΑΣΑ'],
  ['lock','🔒 Κλειδαριά','ΚΛΕΙΔΑΡΙΑ'],
  ['heightReduction','📏 Μείωση','ΜΕΙΩΣΗ'],
  ['kypri','🪟 Κυπρί','ΚΥΠΡΙ'],
  ['montage','🪛 Μοντάρισμα','ΜΟΝΤΑΡΙΣΜΑ'],
  ['stavera','📐 Σταθερό','ΣΤΑΘΕΡΟ'],
  ['oversize','📦 223/83','223/83'],
  ['ependExo','🎨 Επένδυση ΕΞΩ','ΕΠΕΝΔΥΣΗ ΕΞΩ'],
  ['ependMesa','🎨 Επένδυση ΜΕΣΑ','ΕΠΕΝΔΥΣΗ ΜΕΣΑ'],
];
const bfEpendKeys = (o, type) => Object.keys(o.buildTasks||{}).filter(k => k.startsWith('epend') &&
  (type==='MESA' ? getCoatingType(stdCoatNames(o)[parseInt(k.slice(5))||0])==='MESA'
                  : getCoatingType(stdCoatNames(o)[parseInt(k.slice(5))||0])!=='MESA'));
// 'done' (ολοκληρωμένο) | 'undone' (εκκρεμεί) | 'na' (δεν χρειάζεται)
const bfStageState = (o, key) => {
  const t = o.buildTasks||{};
  if (key==='ependExo' || key==='ependMesa') {
    const keys = bfEpendKeys(o, key==='ependMesa'?'MESA':'EXO');
    if (!keys.length) return 'na';
    return keys.every(k=>t[k]===true) ? 'done' : 'undone';
  }
  if (!(key in t)) return 'na';
  return t[key]===true ? 'done' : 'undone';
};

/** Νούμερο παραγγελίας σαν string (ώστε 0000 ≡ αποθηκευμένο "0000" / 0) */
const normOrderNoStr = (v) => String(v ?? '').trim();

/** Τιμή παράδοσης από Firebase (συνήθως deliveryDate · εναλλακτικά snake_case / PascalCase) */
const deliveryDateDisplay = (order) => {
  if (!order || typeof order !== 'object') return '';
  const v = order.deliveryDate ?? order.delivery_date ?? order.DeliveryDate;
  if (v == null || v === '') return '';
  return String(v).trim();
};

// Αναβολή δέσμευσης στοκ: παραγγελία με ημ. παράδοσης πιάνει στοκ 2 ημερολογιακές μέρες πριν.
// Επιστρέφει timestamp «ξυπνήματος» αν η παράδοση απέχει >2 μέρες, αλλιώς null (κανονική δέσμευση τώρα).
const computeDeferUntil = (order) => {
  const d = parseDateStr(deliveryDateDisplay(order));
  if (!d || isNaN(d.getTime())) return null;
  const wake = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 2, 0, 0, 0, 0).getTime();
  return wake > Date.now() ? wake : null;
};

/** Λίστες τυποποιημένων: 📅 καταχώρηση — παράδοση */
const StdOrderDatesLine = ({ order, fontSize = 11, marginBottom }) => {
  const created = fmtDate(order.createdAt);
  const del = deliveryDateDisplay(order);
  if (!created && !del) return null;
  const wrap = marginBottom !== undefined ? { marginBottom } : {};
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap',
      alignItems: 'center', ...wrap }}>
      {created
        ? <Text style={{ fontSize, fontWeight: 'bold', color: '#007AFF' }}>
            📅 {created}
          </Text>
        : null}
      {created && del
        ? <Text style={{ fontSize, fontWeight: 'bold', color: '#e65100' }}>
            {' — '}{del}
          </Text>
        : null}
      {!created && del
        ? <Text style={{ fontSize, fontWeight: 'bold', color: '#e65100' }}>
            🚚 {del}
          </Text>
        : null}
    </View>
  );
};


// ── Helper: βρίσκει πρόταση για διπλότυπο νούμερο ──
const computeSuggested = (base, allOrders, editingId) => {
  const letters = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
  for(let i=0; i<letters.length; i++){
    const candidate = base+'-'+letters[i];
    if(!allOrders.some(o=>normOrderNoStr(o.orderNo)===candidate && o.id!==editingId)) return candidate;
  }
  return base+'-?';
};

// ════════════════════════════════════════════════════════════
//  Επενδύσεις — ίδιο σύστημα με vaicon-eidikes:
//  τύπος ΕΞΩ/ΜΕΣΑ από το όνομα, αυτόματος υπολογισμός διάστασης φύλλου,
//  στοιχεία ανά επένδυση (coatingDetails), προειδοποίηση ματιού.
// ════════════════════════════════════════════════════════════
const getCoatingType = (name) => {
  const n = String(name||'').toUpperCase();
  if (n.includes('ΕΞΩ')) return 'EXO';
  if (n.includes('ΜΕΣΑ') || n.includes('ΕΣΩΤ')) return 'MESA';
  return 'OTHER';
};

const fmtNum = (n) => {
  if (!isFinite(n)) return '';
  const r = Math.round(n*10)/10;
  return String(r).replace('.', ',');
};

// Διάσταση φύλλου επένδυσης από διάσταση πόρτας (ίδιοι τύποι με vaicon-eidikes)
const computeCoatingDim = (h, w, type, pihaki) => {
  const H = parseFloat(String(h||'').replace(',', '.'));
  const W = parseFloat(String(w||'').replace(',', '.'));
  if (!isFinite(H) || !isFinite(W)) return '';
  let dh, dw;
  if (type === 'EXO') { dh = H - 5.3; dw = W - 8.3; }
  else if (type === 'MESA') {
    if (pihaki) { dh = H - 5.3; dw = W - 8.5; }
    else        { dh = H - 3.5; dw = W - 4.3; }
  } else return '';
  return `${fmtNum(dh)} × ${fmtNum(dw)}`;
};

// Αφαιρεί χαρακτήρες που δεν δέχεται η Firebase σε ΟΝΟΜΑΤΑ πεδίων ( . / # $ [ ] ).
const sanitizeFbName = (s) => String(s ?? '').replace(/[.#$/\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
// Κρατά στοιχεία μόνο για τις επιλεγμένες επενδύσεις & καθαρίζει τα ονόματα-κλειδιά.
const pruneCoatingDetails = (coatings, cd) => {
  const keep = new Set((coatings || []).map(sanitizeFbName).filter(Boolean));
  const out = {};
  Object.keys(cd || {}).forEach(k => { const ck = sanitizeFbName(k); if (keep.has(ck)) out[ck] = cd[k]; });
  return out;
};
// Καθαρίζει coatings[] + coatingDetails μαζί ώστε ονόματα & κλειδιά να ταιριάζουν πριν τη γραφή.
const sanitizeCoatingFields = (o) => {
  o.coatings = (o.coatings || []).map(sanitizeFbName).filter(Boolean);
  o.coatingDetails = pruneCoatingDetails(o.coatings, o.coatingDetails);
  return o;
};

const recomputeCoatingDetails = (form) => {
  const coatings = (form.coatings||[]).filter(n=>n&&String(n).trim());
  if (coatings.length === 0) return form.coatingDetails || {};
  const cd = {...(form.coatingDetails||{})};
  coatings.forEach(name=>{
    const type = getCoatingType(name);
    if (type==='OTHER') return;
    const d = {...(cd[name]||{})};
    if (!d.dimUser) {
      const newDim = computeCoatingDim(form.h, form.w, type, !!d.pihaki);
      if (newDim) d.dim = newDim;
    }
    if (!d.frameW) {
      d.frameW = type==='EXO' ? '9,5 cm' : '6 cm';
    }
    cd[name] = d;
  });
  return cd;
};

// Εκτύπωση «ΠΡΟΣ ΠΑΡΑΓΩΓΗ» επενδύσεων — Α4 ανά δύο, αναλυτικά (ίδια μορφή με vaicon-eidikes).
const buildEpendStdHtml = (orders) => {
  const SLASH = '<b style="color:#d32f2f">&nbsp;&nbsp;/&nbsp;&nbsp;</b>';
  const escapeHtml = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const buildRow = (d, keys) => keys.map(k=>d[k]&&String(d[k]).trim()?escapeHtml(d[k]).trim():null).filter(Boolean).join(SLASH);
  const orderBlock = (o) => {
    const cd = o.coatingDetails || {};
    const sections = [];
    (o.coatings||[]).filter(n=>n&&String(n).trim()).forEach(name=>{
      const d = cd[name]||{};
      const fyllo = buildRow(d, ['dim','design','color']);
      const perv  = buildRow(d, ['frameW','frameColor']);
      const kasa  = buildRow(d, ['caseW','caseColor']);
      if (!fyllo && !perv && !kasa) return;
      const type = getCoatingType(name);
      const color = type==='EXO'?'#e65100':type==='MESA'?'#1565c0':'#444';
      const parts = [`<div style="font-weight:900;color:${color};font-size:44px;letter-spacing:0.5px;margin-bottom:6px;line-height:1.15">${escapeHtml(name)}</div>`];
      if (fyllo) parts.push(`<div style="margin-left:20px;font-size:36px;line-height:1.3;margin-bottom:3px"><b>Φύλλο:</b> ${fyllo}</div>`);
      if (perv)  parts.push(`<div style="margin-left:20px;font-size:36px;line-height:1.3;margin-bottom:3px"><b>Περβάζι:</b> ${perv}</div>`);
      if (type==='EXO' && kasa) parts.push(`<div style="margin-left:20px;font-size:36px;line-height:1.3;margin-bottom:3px"><b>Κάσα:</b> ${kasa}</div>`);
      if (type==='MESA' && d.pihaki) parts.push(`<div style="margin-left:20px;font-size:32px;line-height:1.3;color:#1565C0;font-weight:900;margin-top:4px">✓ Πηχάκι (ξυλογωνιά)</div>`);
      sections.push(parts.join(''));
    });
    const sectionsHtml = sections.join('<div style="border-top:2px dashed #999;margin:10px 0"></div>') || '<div style="font-size:30px;color:#777;font-style:italic">(χωρίς στοιχεία επένδυσης)</div>';
    const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡΙΣΤΕΡΗ':'ΔΕΞΙΑ';
    const installBadge = o.installation==='ΝΑΙ'
      ? `<span style="background:#1565C0;color:white;font-weight:900;font-size:34px;padding:6px 18px;border-radius:8px;margin-left:14px">ΜΟΝΤΑΡΙΣΜΑ</span>` : '';
    return `<div class="ord">
      <div class="ordno">${escapeHtml(o.orderNo||'—')}</div>
      <div class="ordbody">
        <div style="display:flex;align-items:center;gap:18px;border-bottom:3px solid #1a1a1a;padding-bottom:12px;margin-bottom:16px;flex-wrap:wrap">
          <div style="font-size:52px;font-weight:900;color:#1565C0">${escapeHtml(o.h||'—')} × ${escapeHtml(o.w||'—')}</div>
          <div style="font-size:40px;font-weight:900;color:#8B0000">${fora}</div>
          ${installBadge}
        </div>
        ${sectionsHtml}
      </div>
    </div>`;
  };
  let pages = '';
  for (let i=0; i<orders.length; i+=2) {
    const top = orderBlock(orders[i]);
    const bottom = orders[i+1] ? orderBlock(orders[i+1]) : '<div class="ord empty"></div>';
    pages += `<table class="page"><tbody>
      <tr><td class="slot">${top}</td></tr>
      <tr><td class="cut">✂ — — — — — — — — — — — — — — — — — — — — — — — — — — — —</td></tr>
      <tr><td class="slot">${bottom}</td></tr>
    </tbody></table>`;
  }
  return `<html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 8mm; }
    html, body { margin:0; padding:0; height:100%; }
    body { font-family: Arial, sans-serif; color:#000; }
    table.page { width:100%; height:100vh; border-collapse:collapse; page-break-after:always; }
    table.page td { padding:0; }
    table.page td.slot { height:50%; vertical-align:top; }
    table.page td.cut { height:8mm; vertical-align:middle; text-align:center; color:#999; font-size:18px; letter-spacing:1px; white-space:nowrap; }
    .ord { width:100%; height:100%; box-sizing:border-box; padding:3mm 5mm 3mm 2mm; border:2px solid #1a1a1a; border-radius:8px; display:flex; overflow:hidden; }
    .ord.empty { border-style:dashed; border-color:#bbb; }
    .ordno { width: 22mm; margin-right:4mm; display:flex; align-items:center; justify-content:center;
             font-size:80px; font-weight:900; color:#1a1a1a; letter-spacing:2px;
             writing-mode: vertical-rl; transform: rotate(180deg); white-space:nowrap; }
    .ordbody { flex:1; min-width:0; }
    * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  </style></head><body>${pages}</body></html>`;
};

// ── Προειδοποίηση ματιού: αλουμίνιο/κυπρί → όχι τρύπημα επένδυσης για μάτι ──
const PEEPHOLE_COATING_RE = /ΑΛΟΥΜΙΝ/;
const PEEPHOLE_NOTES_RE = /ΚΥΠΡ/;
const peepholeTriggers = (coatings=[], notes='', hasKypri=false) => {
  const out = [];
  (coatings||[]).forEach(c => {
    if (c && PEEPHOLE_COATING_RE.test(stripAccentsTxt(c).toUpperCase())) out.push(c);
  });
  // Το Κυπρί προειδοποιεί μόνο όταν υπάρχει επένδυση να τρυπηθεί.
  const hasAnyCoating = (coatings||[]).some(c => c && String(c).trim());
  if (hasAnyCoating) {
    if (hasKypri) out.push('Κυπρί');
    else if (notes && PEEPHOLE_NOTES_RE.test(stripAccentsTxt(notes).toUpperCase())) out.push('Κυπρί (στις παρατηρήσεις)');
  }
  return out;
};
const PEEPHOLE_WARN_NOTE = 'ΠΡΟΣΟΧΗ ΟΧΙ ΤΡΥΠΗΜΑ ΓΙΑ ΜΑΤΙ';
const withPeepholeNote = (notes) => {
  const cur = String(notes||'').trim();
  if (cur.includes(PEEPHOLE_WARN_NOTE)) return cur;
  return cur ? `${cur}\n${PEEPHOLE_WARN_NOTE}` : PEEPHOLE_WARN_NOTE;
};
// Παρατηρήσεις με ανάδειξη της σημείωσης ματιού (κόκκινο/έντονο/μεγαλύτερο) — όπως vaicon-eidikes.
const renderNotesWithWarning = (notes, baseStyle, prefix='Σημ: ') => {
  if (!notes) return null;
  const s = String(notes);
  const idx = s.indexOf(PEEPHOLE_WARN_NOTE);
  if (idx === -1) return <Text style={baseStyle}>{prefix}{s}</Text>;
  return (
    <Text style={baseStyle}>
      {prefix}{s.slice(0, idx)}
      <Text style={{color:'#c62828', fontWeight:'bold', fontSize:17}}>{PEEPHOLE_WARN_NOTE}</Text>
      {s.slice(idx + PEEPHOLE_WARN_NOTE.length)}
    </Text>
  );
};

// ════════════════════════════════════════════════════════════
//  Ειδοποιήσεις πελάτη (Viber / Email / SMS) — ίδιο σύστημα με vaicon-eidikes.
//  Viber/SMS στέλνονται μέσω Netlify functions (Yuboto)· Email μέσω mailto.
// ════════════════════════════════════════════════════════════
const stripAccentsTxt = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const normalizePhone = (p) => {
  const d = String(p||'').replace(/\D/g,'');
  if (!d) return '';
  return d.startsWith('30') ? d : '30' + d.replace(/^0+/,'');
};
// Φάση 1: μόνο ελληνικά κινητά (ξεκινούν με 69 μετά την αφαίρεση 30/0030/0)
const isGreekMobile = (p) => {
  const d = String(p||'').replace(/\D/g,'');
  if (!d) return false;
  const stripped = d.replace(/^(0030|30)/, '').replace(/^0+/, '');
  return /^69\d{8}$/.test(stripped);
};
const COMPANY_SIGNATURE = [
  'Με εκτίμηση,',
  '',
  'VAICON — Πόρτες Ασφαλείας · Πόρτες Εσωτερικές Laminate',
  'Διεύθυνση εργοστασίου: Λούβαρη 11, Περιστέρι, Αθήνα',
  'Τηλ.: 210 5774975 · 210 5774976 · 210 5752259',
  'Viber: 6944 002082',
  'Email: info@vairaktarakis.gr',
  'Web: www.vaicon.gr · www.vairaktarakis.gr',
  'Ωράριο: Δευτ-Παρ 08:00-16:00',
].join('\n');
const stdArmorTxt = (o) => o?.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' ? 'ΔΙΠΛΗ' : 'ΜΟΝΗ';
// Ένδειξη «νούμερο διαίρεσης» δίπλα στον αριθμό παραγγελίας (μόνο σε σπασμένα κομμάτια).
const noTag = (o) => (o && o.splitTag != null && String(o.splitTag).trim() !== '') ? ` (${o.splitTag})` : '';
const miscJoin = (o) => (o?.misc||[]).filter(Boolean).join(', ');
const stdOrderLines = (o) => {
  const coats = (o.coatings||[]).filter(c=>c&&String(c).trim()).join(', ');
  const stav = (o.stavera||[]).filter(s=>s&&s.dim).map(s=>(s.qty?`${s.qty}τεμ `:'')+stavParts(s)+(s.note?' '+s.note:'')).join(', ');
  const tzami = (o.glassDim||'')+(o.glassNotes?' '+o.glassNotes:'');
  return [
    `${o.h||''}x${o.w||''} | ${o.side||''} | ${stdArmorTxt(o)} ΘΩΡΑΚΙΣΗ`,
    o.qty&&parseInt(o.qty)>1 ? `Τεμάχια: ${o.qty}` : null,
    `Κλειδ: ${o.lock||'—'}`,
    o.hardware ? `Χρώμα εξαρτημάτων: ${o.hardware}` : null,
    coats ? `Επενδύσεις: ${coats}` : null,
    stav ? `Σταθερό: ${stav}` : null,
    tzami.trim() ? `Τζάμι: ${tzami}` : null,
    o.heightReduction ? `Μείωση ύψους: ${o.heightReduction} cm` : null,
    o.notes ? `Σημ: ${o.notes}` : null,
  ];
};
const buildOrderMessage = (o) => [
  `Γεια σας ${o.customer||''},`,
  '',
  `Καταχωρήσαμε την παραγγελία σας Νο ${o.orderNo||'-'}`,
  ...stdOrderLines(o),
  '',
  'Παρακαλούμε ελέγξτε τα παραπάνω στοιχεία. Μετά την έναρξη παραγωγής δεν είναι δυνατές αλλαγές και η εταιρεία δεν φέρει ευθύνη για τυχόν διαφορές.',
  '',
  'Ευχαριστούμε — VAICON',
].filter(v => v !== null).join('\n');
const buildReadyMessage = (o) => `VAICON: Η ΠΑΡΑΓΓΕΛΙΑ ΝΟ ${o.orderNo||'-'} ΕΙΝΑΙ ΕΤΟΙΜΗ. ΩΡΕΣ ΠΑΡΑΛΑΒΗΣ: ΕΡΓΑΣΙΜΕΣ 08:00-15:30.`;
const buildSmsOrderMessage = (o) => {
  const d = new Date(o?.createdAt || Date.now());
  const dt = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  return `VAICON: ΚΑΤΑΧΩΡΗΘΗΚΕ Η ΠΑΡΑΓΓΕΛΙΑ ΝΟ ${o.orderNo||'-'} (${dt}). ΤΑ ΣΤΟΙΧΕΙΑ ΣΤΑΛΘΗΚΑΝ ΑΝΑΛΥΤΙΚΑ ΣΕ VIBER/EMAIL. ΜΕΤΑ ΤΗΝ ΕΝΑΡΞΗ ΠΑΡΑΓΩΓΗΣ ΔΕΝ ΓΙΝΟΝΤΑΙ ΑΛΛΑΓΕΣ.`;
};
const buildOrderEmail = (o) => [
  'Αγαπητοί συνεργάτες,',
  '',
  'Σας ευχαριστούμε για την παραγγελία σας. Ακολουθούν αναλυτικά τα στοιχεία της, όπως καταχωρήθηκαν:',
  '',
  `Αρ. παραγγελίας: ${o.orderNo||'-'}`,
  ...stdOrderLines(o),
  '',
  'Παρακαλούμε ελέγξτε προσεκτικά τα παραπάνω στοιχεία. Μετά την έναρξη της παραγωγής δεν είναι δυνατές αλλαγές και η εταιρεία δεν φέρει ευθύνη για τυχόν διαφορές.',
  '',
  COMPANY_SIGNATURE,
].filter(v => v !== null).join('\n');
const buildReadyEmail = (o) => [
  'Αγαπητοί συνεργάτες,',
  '',
  `Σας ενημερώνουμε ότι η παραγγελία σας Νο ${o.orderNo||'-'} είναι έτοιμη προς παραλαβή.`,
  'Ώρες παραλαβής: εργάσιμες 08:00-16:00.',
  '',
  COMPANY_SIGNATURE,
].join('\n');
const isReadyStatus = (o) => o?.status === 'STD_READY';
const messageFor = (o) => isReadyStatus(o) ? buildReadyMessage(o) : buildOrderMessage(o);
const smsMessageFor = (o) => isReadyStatus(o) ? buildReadyMessage(o) : buildSmsOrderMessage(o);
const emailMessageFor = (o) => isReadyStatus(o) ? buildReadyEmail(o) : buildOrderEmail(o);
const openEmail = (email, msg, orderNo) => {
  if (!email) return;
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = `mailto:${email}?subject=${encodeURIComponent('Παραγγελία πόρτας ασφαλείας Νο '+(orderNo||''))}&body=${encodeURIComponent(msg)}`;
    a.click();
  }
};
const sendSmsViaYuboto = async (phone, message, orderId=null) => {
  try {
    const resp = await fetch('/.netlify/functions/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizePhone(phone), message, orderId }),
    });
    return await resp.json();
  } catch (e) {
    return { success: false, error: 'Σφάλμα σύνδεσης: ' + (e?.message || e) };
  }
};
const sendViberViaYuboto = async (phone, message, orderId=null, customerId=null) => {
  try {
    const resp = await fetch('/.netlify/functions/send-viber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizePhone(phone), message, orderId, customerId }),
    });
    return await resp.json();
  } catch (e) {
    return { success: false, error: 'Σφάλμα σύνδεσης: ' + (e?.message || e) };
  }
};

const DIPLI_PHASES = [
  { key:'laser',    label:'🔴 LASER ΚΟΠΕΣ' },
  { key:'cases',    label:'🟡 ΚΑΣΕΣ' },
  { key:'montSasi', label:'🔵 ΚΑΤΑΡΤΙΣΗ ΣΑΣΙ' },
  { key:'vafio',    label:'🟢 ΒΑΦΕΙΟ' },
  { key:'montDoor', label:'⚫ ΜΟΝΤΑΡΙΣΜΑ/ΕΠΕΝΔΥΣΗ' },
];

/** Ημερομηνία παράδοσης για επικεφαλίδα (π.χ. 15/4/2026) */
const formatParadosiHeaderDate = (d) => {
  if (!d || isNaN(d.getTime())) return '—';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

/** Μέρες από σήμερα (τοπική ημερομηνία, όχι ώρα) */
const daysFromTodayParadosi = (d) => {
  if (!d || isNaN(d.getTime())) return null;
  const t = new Date();
  const a = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86400000);
};

const buildParadosiGroupTitle = (date) => {
  const label = formatParadosiHeaderDate(date);
  const diff = daysFromTodayParadosi(date);
  if (diff === null) return `📅 ${label}`;
  if (diff === 0) return `🔴 ${label}  •  ΣΗΜΕΡΑ`;
  if (diff < 0) return `⚠️ ${label}  •  ${diff} μέρες`;
  if (diff === 1) return `📅 ${label}  •  1 μέρα`;
  return `📅 ${label}  •  ${diff} μέρες`;
};

/**
 * Ίδια κριτήρια με την οθόνη ΠΑΡΑΔΟΣΕΙΣ (ΜΟΝΗ + ΔΙΠΛΗ): τουλάχιστον μία τυποποιημένη
 * STD_BUILD / STD_PENDING με έγκυρη ημ. παράδοσης.
 */
export function hasParadoseisReminderOrders(customOrders = []) {
  const list = (customOrders || []).filter(
    (o) =>
      o &&
      o.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ' &&
      !o.onHold &&
      (o.status === 'STD_BUILD' || o.status === 'STD_PENDING') &&
      deliveryDateDisplay(o)
  );
  for (const o of list) {
    const dt = parseDateStr(deliveryDateDisplay(o));
    if (dt && !isNaN(dt.getTime())) return true;
  }
  return false;
}

/**
 * Οθόνη «ΠΑΡΑΔΟΣΕΙΣ»: τυποποιημένες με deliveryDate, STD_BUILD / STD_PENDING.
 */
export function ParadoseisScreen({ customOrders = [], highlightOrderId = null, onClearSearchHighlight }) {
  const groups = useMemo(() => {
    const list = (customOrders || []).filter((o) =>
      o.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ' &&
      !o.onHold &&
      (o.status === 'STD_BUILD' || o.status === 'STD_PENDING') &&
      deliveryDateDisplay(o)
    );
    const enriched = [];
    for (const o of list) {
      const ds = deliveryDateDisplay(o);
      const dt = parseDateStr(ds);
      if (!dt || isNaN(dt.getTime())) continue;
      enriched.push({ o, dt });
    }
    const byDay = new Map();
    for (const { o, dt } of enriched) {
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      if (!byDay.has(key)) byDay.set(key, { sortTs: dt.getTime(), date: new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()), orders: [] });
      byDay.get(key).orders.push(o);
    }
    const sortedKeys = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
    return sortedKeys.map((key) => {
      const g = byDay.get(key);
      g.orders.sort((a, b) => (parseInt(a.orderNo, 10) || 0) - (parseInt(b.orderNo, 10) || 0));
      return { key, title: buildParadosiGroupTitle(g.date), orders: g.orders };
    });
  }, [customOrders]);

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f0f0' }}>
      <View style={{ backgroundColor: '#1a1a2e', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' }}>
        <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>📅 ΠΑΡΑΔΟΣΕΙΣ</Text>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>Τυποποιημένες · προς κατασκευή / σε αναμονή · με ημ. παράδοσης</Text>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        onScrollBeginDrag={onClearSearchHighlight}
        onTouchStart={onClearSearchHighlight}
      >
        {groups.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#888', marginTop: 32, fontSize: 15 }}>Δεν υπάρχουν παραγγελίες με ημερομηνία παράδοσης σε αυτές τις καταστάσεις.</Text>
        ) : (
          groups.map(({ key, title, orders }) => (
            <View key={key} style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1565C0', marginBottom: 10, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: '#90caf9' }}>{title}</Text>
              {orders.map((o) => {
                const isDipli = o.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ';
                return (
                  <View
                    key={o.id}
                    style={[{
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                      borderLeftWidth: 5,
                      borderLeftColor: '#8B0000',
                      elevation: 2,
                    }, highlightOrderId != null && String(highlightOrderId) === String(o.id) ? {
                      borderWidth: 3,
                      borderColor: '#FFC107',
                      shadowColor: '#FFC107',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.5,
                      shadowRadius: 10,
                      elevation: 10,
                    } : null].filter(Boolean)}
                  >
                    <StdOrderDatesLine order={o} marginBottom={4} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ fontWeight: '900', fontSize: 16, color: '#1a1a1a' }}>#{o.orderNo}{noTag(o)}</Text>
                      {o.customer ? <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#333' }}>{o.customer}</Text> : null}
                      {o.qty && parseInt(o.qty, 10) > 1 ? (
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#cc0000' }}>{o.qty}τεμ</Text>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: '#1a1a1a' }}>{o.h}x{o.w}</Text>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: '#1a1a1a' }}>{o.side === 'ΑΡΙΣΤΕΡΗ' ? '◄ ΑΡ' : 'ΔΕΞ ►'}</Text>
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: isDipli ? '#8B0000' : '#1565C0' }}>{isDipli ? 'ΔΙΠΛΗ' : 'ΜΟΝΗ'}</Text>
                      {o.hardware ? <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#555' }}>🎨 {o.hardware}</Text> : null}
                    </View>
                    {(o.lock || o.caseType || (o.coatings && o.coatings.length > 0)) ? (
                      <Text style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                        {[
                          o.lock ? `🔒 ${o.lock}` : '',
                          o.caseType ? (o.caseType.includes('ΑΝΟΙΧΤΟΥ') ? 'ΑΝΟΙΧΤΗ ΚΑΣΑ' : 'ΚΛΕΙΣΤΗ ΚΑΣΑ') : '',
                          o.coatings && o.coatings.length > 0 ? o.coatings.join(', ') : '',
                        ].filter(Boolean).join(' — ')}
                      </Text>
                    ) : null}
                    {o.heightReduction ? (
                      <Text style={{ fontSize: 11, color: '#e65100', fontWeight: 'bold', marginTop: 2 }}>📏 Μείωση: {o.heightReduction}</Text>
                    ) : null}
                    {o.stavera && o.stavera.filter((s) => s.dim).length > 0 ? (
                      <Text style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                        📐 {o.stavera.filter((s) => s.dim).map((s) => stavParts(s) + (s.note ? ` ${s.note}` : '')).join(' | ')}
                      </Text>
                    ) : null}
                    {miscJoin(o) ? <Text style={{ fontSize: 11, color: '#6a1b9a', fontWeight: 'bold', marginTop: 2 }}>📦 {miscJoin(o)}</Text> : null}
                    {renderNotesWithWarning(o.notes, { fontSize: 11, color: '#888', marginTop: 2 })}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

export default function CustomScreen({ customOrders, setCustomOrders, soldOrders, setSoldOrders, customers, onRequestAddCustomer, sasiStock={}, setSasiStock, caseStock={}, setCaseStock, sasiOrders=[], setSasiOrders, caseOrders=[], setCaseOrders, coatings=[], dipliSasiStock=[], setDipliSasiStock, locks=[], cylinders=[], misc=[], isGuest=false, locked=false, formOnly=false, forcedTab=null, setTabIndex, highlightOrderId = null, onClearSearchHighlight, currentUserName='', isAdmin=false, resolveName=(u)=>u, showCustomerLookup=false, setShowCustomerLookup=()=>{}, isSeller=false, sellerKey=null, filterSellerKey=null, editSubmission=null, onEditSubmissionDone=()=>{}, quotes=[], setQuotes=()=>{}, quotesOnly=false, isForeman=false }) {
  const [expanded, setExpanded] = useState({ pending:false, prod:false, ready:false, archive:false, stdList:true, stdMoni:true, stdDipli:true, stdReady:true, stdSold:true, stdReadyD:true, stdSoldD:true, stdMoniOpen:true, stdDipliOpen:true, dipliProd:true, dipliSasiStock:true, moniSasiStock:true, stdBuildMoni:true, stdBuildDipli:true });
  const [showHardwarePicker, setShowHardwarePicker] = useState(false);
  const [showLockPicker, setShowLockPicker] = useState(false);
  const [showDipliPicker, setShowDipliPicker] = useState(false);
  const [dipliAnchor, setDipliAnchor] = useState(null);
  const dipliBtnRef = useRef(null);
  const [lockAnchor, setLockAnchor] = useState(null);
  const lockBtnRef = useRef(null);
  const [hardwareAnchor, setHardwareAnchor] = useState(null);
  const hardwareBtnRef = useRef(null);
  const [showMiscPicker, setShowMiscPicker] = useState(false);
  const [miscAnchor, setMiscAnchor] = useState(null);
  const miscBtnRef = useRef(null);
  const [showStavColPicker, setShowStavColPicker] = useState(false);
  const [stavColAnchor, setStavColAnchor] = useState(null);
  const stavColBtnRef = useRef(null);
  const [coatingsAnchor, setCoatingsAnchor] = useState(null);
  const coatingsBtnRef = useRef(null);
  const [showCoatingsPicker, setShowCoatingsPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customHardwareText, setCustomHardwareText] = useState('');
  const [showCustomHardwareInput, setShowCustomHardwareInput] = useState(false);
  const [stdTab, setStdTab] = useState('ΜΟΝΗ');
  useEffect(() => { if (forcedTab) setStdTab(forcedTab); }, [forcedTab]);
  const [designOpts, setDesignOpts] = useState(STAV_DESIGNS);
  useEffect(() => { (async () => { try { const cat = await (await fetch(`${FIREBASE_URL}/price_catalog.json`)).json(); const names = Object.values(cat||{}).filter(e=>e&&e.ruleKind==='design'&&String(e.name||'').trim()).map(e=>e.name.trim()); if (names.length) setDesignOpts([...new Set(names)]); } catch {} })(); }, []);
  const [customForm, setCustomForm] = useState(INIT_FORM);
  const [priceModal, setPriceModal] = useState({ visible:false, order:null });
  const [quoteSearch, setQuoteSearch] = useState('');
  const [editingOrder, setEditingOrder] = useState(null); // η πόρτα που επεξεργαζόμαστε
  const [approveCtx, setApproveCtx] = useState(null); // γραφείο: υποβολή πωλητή προς έγκριση μέσα από τη φόρμα
  const [orderNoAuto, setOrderNoAuto] = useState(true); // true = το Ν/Π είναι αυτόματη πρόταση (όχι χειροκίνητο)
  const [crossOrderNos, setCrossOrderNos] = useState([]); // αριθμοί ειδικών παραγγελιών (κοινή αρίθμηση)
  const [orderSeq, setOrderSeq] = useState({}); // μητρώο εκδοθέντων αριθμών (order_seq)
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [sellModal, setSellModal]  = useState({ visible:false, orderId:null, totalQty:1 });
  const [splitModal, setSplitModal] = useState({ visible:false, order:null });
  const [readyConfirmModal, setReadyConfirmModal] = useState({ visible:false, order:null, sasiItem:null, caseItem:null });
  const [confirmModal, setConfirmModal] = useState({ visible:false, title:'', message:'', confirmText:'', onConfirm:null });
  const [taskBasket, setTaskBasket] = useState(null);
  const [smsToast, setSmsToast] = useState({ visible:false, text:'', kind:'ok' });
  const [coatDetailsModal, setCoatDetailsModal] = useState({ visible:false, order:null });
  const [peepholeWarn, setPeepholeWarn] = useState({ visible:false, coatings:[], onContinue:null, onAddNote:null });
  const [dupModal, setDupModal] = useState({ visible:false, base:'', suggested:'', onUse:null, onKeep:null, onCancel:null });
  const [menonSellModal, setMenonSellModal] = useState({ visible:false, entry:null, newCustomer:'' });
  const [printSelected, setPrintSelected] = useState({});
  const [printPreview, setPrintPreview] = useState({ visible:false, phaseKey:null, orders:[], copies:1 });
  const [activeProdPhase, setActiveProdPhase] = useState('laser');
  const [borrowModal, setBorrowModal] = useState({ visible: false, order: null, stockType: null, candidates: [] });
  const [returnConfirmModal, setReturnConfirmModal] = useState({ visible: false, order: null });
  const [saveConfirmModal, setSaveConfirmModal] = useState({ visible: false });
  const [groupState, setGroupState] = useState(null); // ομάδα πορτών ίδιου πελάτη: { base, count, groupId } ή null
  const [quoteGroup, setQuoteGroup] = useState(null); // ομάδα πορτών προσφοράς: { count, groupId } ή null
  const [editingQuote, setEditingQuote] = useState(null); // προσφορά υπό επεξεργασία
  const [scrollPosition, setScrollPosition] = useState(0);
  const [borrowConfirmModal, setBorrowConfirmModal] = useState({ visible: false, candidate: null, order: null, stockType: null });
  const [borrowSuccessModal, setBorrowSuccessModal] = useState({ visible: false, message: '' });
  const [datePickerDay, setDatePickerDay] = useState(String(new Date().getDate()));
  const [datePickerMonth, setDatePickerMonth] = useState(String(new Date().getMonth()+1));
  const [datePickerYear, setDatePickerYear] = useState(String(new Date().getFullYear()));

  // Σταθερό id υποβολής πωλητή: τα έγγραφα ανεβαίνουν εδώ πριν την αποστολή και ακολουθούν στην έγκριση (id = _sid).
  const formSubIdRef = useRef(null);
  const lastSavedNoRef = useRef(null); // τελευταίος αριθμός που αποθηκεύτηκε (για καταγραφή έγκρισης)
  const lastSavedTotalRef = useRef(null); // τελευταίο σύνολο τιμής (για ενημέρωση πωλητή στην έγκριση)
  const [docQR, setDocQR] = useState({ visible:false, orderId:null, token:null, mode:'add', photoId:null, url:'', initial:null, status:'waiting' });
  const [docViewer, setDocViewer] = useState({ visible:false, orderId:null, orderNo:'', photos:[], idx:0, loading:false, zoom:1, rot:0 });
  const [docWinPos, setDocWinPos] = useState({ x:0, y:0 });
  const [docWinSize, setDocWinSize] = useState({ w:700, h:660 });
  const [docImgPos, setDocImgPos] = useState({ x:0, y:0 });
  const docDragRef = useRef(null);
  const docDragStart = useRef({ mx:0, my:0, a:0, b:0 });

  const [notifyModal, setNotifyModal] = useState({ visible:false, order:null });
  const [holdMode, setHoldMode] = useState(false); // φόρμα καταχώρησης: true = θα αποθηκευτεί σε αναμονή (μάτι κλειστό)
  const [holdBasket, setHoldBasket] = useState([]); // λίστα ids προς ενεργοποίηση από την αναμονή (μαζική)
  const [holdOutBasket, setHoldOutBasket] = useState([]); // λίστα ids ενεργών παραγγελιών προς αποστολή σε αναμονή (μαζική)
  const [customerLookupSearch, setCustomerLookupSearch] = useState('');
  const [lookupCustomerId, setLookupCustomerId] = useState(null);
  const [lookupCustInfo, setLookupCustInfo] = useState(false);
  const [lookupOrderModal, setLookupOrderModal] = useState({ visible:false, order:null });
  const [custPanPos, setCustPanPos] = useState({ x:0, y:0 });
  const [lookupSpecialOrders, setLookupSpecialOrders] = useState([]);
  const [lookupSpecialQuotes, setLookupSpecialQuotes] = useState([]);
  const custIsDragging = useRef(false);
  const custDragStart = useRef({ mx:0, my:0, px:0, py:0 });

  const customerRef=useRef(); const orderNoRef=useRef(); const hRef=useRef();
  const customerSelectedRef = useRef(false);
  const [blinkPhase, setBlinkPhase] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setBlinkPhase(p => p === 1 ? 0.25 : 1), 500);
    return () => clearInterval(id);
  }, []);
  const prodScrollRef = useRef(null);
  const mainScrollRef = useRef(null);
  const [activeSection, setActiveSection] = useState('build');
  const [dayModal, setDayModal] = useState({ visible:false, ts:null });
  const [prodLog, setProdLog] = useState({ visible:false, ts:null });
  useEffect(()=>{ setActiveSection(forcedTab==='ΜΟΝΗ' ? 'orders' : 'build'); }, [forcedTab]);
  const showSec = (key) => !forcedTab || activeSection===key;
  // «Σε αναμονή»: ενέργειες (μάτια/καλάθια) μόνο σε admin + κανονικούς χρήστες.
  const canHold = !isForeman && !isSeller && !isGuest;
  // Προβολή λίστας «ΣΕ ΑΝΑΜΟΝΗ»: και ο user14 (foreman) τη βλέπει — μόνο για ανάγνωση. Κρυφή σε πωλητές/guest.
  const canSeeHold = !isSeller && !isGuest;
  const [buildFilterOpen, setBuildFilterOpen] = useState(false);
  const [coatPrintOpen, setCoatPrintOpen] = useState(false);
  const [placePrintOpen, setPlacePrintOpen] = useState(false);
  const [placeSelected, setPlaceSelected] = useState({});
  const [buildFilterPos, setBuildFilterPos] = useState({ x:0, y:0 });
  const bfIsDragging = useRef(false);
  const bfDragStart = useRef({});
  const [buildFilterSel, setBuildFilterSel] = useState({
    sasi:{done:false,undone:false}, case:{done:false,undone:false}, lock:{done:false,undone:false}, heightReduction:{done:false,undone:false},
    kypri:{done:false,undone:false}, montage:{done:false,undone:false}, stavera:{done:false,undone:false}, oversize:{done:false,undone:false},
    ependExo:{done:false,undone:false}, ependMesa:{done:false,undone:false},
  });
  const handleBuildFilterDragStart = (e) => {
    e.preventDefault?.();
    bfIsDragging.current = true;
    bfDragStart.current = { mx: e.clientX||e.touches?.[0]?.clientX||0, my: e.clientY||e.touches?.[0]?.clientY||0, px: buildFilterPos.x, py: buildFilterPos.y, moved:false };
    let overlay = null;
    const onMove = (ev) => {
      if (!bfIsDragging.current) return;
      const cx = ev.clientX||ev.touches?.[0]?.clientX||0, cy = ev.clientY||ev.touches?.[0]?.clientY||0;
      // Τζάμι + αποκλεισμός επιλογής κειμένου ΜΟΝΟ όταν όντως ξεκινήσει το σύρσιμο
      if (!bfDragStart.current.moved && typeof document !== 'undefined') {
        document.body.style.userSelect = 'none';
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;cursor:grabbing;';
        document.body.appendChild(overlay);
      }
      bfDragStart.current.moved = true;
      setBuildFilterPos({ x: bfDragStart.current.px + (cx - bfDragStart.current.mx), y: bfDragStart.current.py + (cy - bfDragStart.current.my) });
    };
    const onUp = () => {
      bfIsDragging.current = false;
      if (typeof document !== 'undefined') document.body.style.userSelect = '';
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); window.removeEventListener('touchmove',onMove); window.removeEventListener('touchend',onUp);
      // Καταπίνει το «φάντασμα-κλικ» που στέλνει ο browser μετά το σύρσιμο
      if (bfDragStart.current.moved && typeof window !== 'undefined') {
        const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };
        window.addEventListener('click', swallow, true);
        setTimeout(() => window.removeEventListener('click', swallow, true), 350);
      }
    };
    window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp); window.addEventListener('touchmove',onMove); window.addEventListener('touchend',onUp);
  };
  const menonNotesTimers = useRef({});
  const staveraHRefs = useRef({});
  const staveraQtyRefs = useRef({});
  const staveraGridNoteRefs = useRef({});
  const [pageWidth, setPageWidth] = useState(SCREEN_WIDTH);

  /** Επισήμανση κάρτας μετά από επιλογή αποτελέσματος καθολικής αναζήτησης */
  const searchHL = (id) => {
    if (highlightOrderId == null || id == null) return undefined;
    if (String(highlightOrderId) !== String(id)) return undefined;
    return {
      borderWidth: 3,
      borderColor: '#FFC107',
      shadowColor: '#FFC107',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 10,
    };
  };
  // DOM id στη φωτισμένη κάρτα, ώστε να κάνουμε scroll πάνω της μετά από αναζήτηση.
  const hlId = (id) => (highlightOrderId != null && String(highlightOrderId) === String(id)) ? 'vaicon-hl' : undefined;
  // Μετά από αναζήτηση: πήγαινε στη σωστή υπο-ενότητα ώστε να φαίνεται η κάρτα.
  useEffect(() => {
    if (highlightOrderId == null || !forcedTab) return;
    const o = [...(customOrders||[]), ...(soldOrders||[])].find(x => String(x.id) === String(highlightOrderId));
    if (!o) return;
    let sec;
    if (o.onHold) sec = 'hold';
    else if (o.status === 'STD_READY') sec = 'ready';
    else if (o.status === 'STD_SOLD') sec = 'sold';
    else if (o.status === 'STD_BUILD') sec = 'build';
    else sec = (forcedTab === 'ΜΟΝΗ') ? 'orders' : 'build';
    setActiveSection(sec);
  }, [highlightOrderId]);
  useEffect(() => {
    if (highlightOrderId == null || Platform.OS !== 'web') return;
    let done = false;
    const timers = [150, 400, 800, 1300].map(ms => setTimeout(() => {
      if (done) return;
      try { const el = document.getElementById('vaicon-hl'); if (el) { el.scrollIntoView({ behavior:'smooth', block:'center' }); done = true; } } catch {}
    }, ms));
    return () => timers.forEach(clearTimeout);
  }, [highlightOrderId]);

  const syncToCloud = async (o) => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${FIREBASE_URL}/std_orders/${o.id}.json`,{method:'PUT',body:JSON.stringify(o)});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return;
      } catch (e) { lastErr = e; if (attempt < 2) await new Promise(r=>setTimeout(r,600)); }
    }
    if (Platform.OS === 'web') window.alert(`Σφάλμα\n\nΗ παραγγελία ΔΕΝ αποθηκεύτηκε στο Cloud. (${lastErr?.message||lastErr})`);
    else Alert.alert("Σφάλμα","Δεν αποθηκεύτηκε.");
  };
  const deleteFromCloud = async (id) => { try { await fetch(`${FIREBASE_URL}/std_orders/${id}.json`,{method:'DELETE'}); await fetch(`${FIREBASE_URL}/order_files/${id}.json`,{method:'DELETE'}); } catch(e){} };

  // ---------- Έγγραφα πελάτη (φωτό μέσω κινητού με QR) ----------
  const randToken = () => { const a = new Uint8Array(18); ((typeof globalThis!=='undefined'&&globalThis.crypto)||window.crypto).getRandomValues(a); return Array.from(a, b=>b.toString(16).padStart(2,'0')).join(''); };
  const setDocCountLocal = (orderId, count) => {
    setCustomOrders(prev=>prev.map(o=>o.id===orderId?{...o, docCount:count}:o));
    setSoldOrders(prev=>prev.map(o=>o.id===orderId?{...o, docCount:count}:o));
    setQuotes(prev=>prev.map(o=>o.id===orderId?{...o, docCount:count}:o));
  };
  const loadOrderFiles = async (orderId) => {
    const data = await (await fetch(`${FIREBASE_URL}/order_files/${orderId}.json`)).json();
    return data ? Object.keys(data).map(k=>({ id:k, ...data[k] })).sort((a,b)=>(a.ts||0)-(b.ts||0)) : [];
  };
  const startDocDrag = (kind) => (e) => {
    if (Platform.OS !== 'web') return;
    if (e.stopPropagation) e.stopPropagation();
    docDragRef.current = kind;
    const mx = e.clientX || e.touches?.[0]?.clientX || 0;
    const my = e.clientY || e.touches?.[0]?.clientY || 0;
    const base = kind === 'resize' ? docWinSize : kind === 'move' ? docWinPos : docImgPos;
    docDragStart.current = { mx, my, a: kind === 'resize' ? base.w : base.x, b: kind === 'resize' ? base.h : base.y };
    const onMove = (ev) => {
      if (docDragRef.current !== kind) return;
      const cx = ev.clientX || ev.touches?.[0]?.clientX || 0;
      const cy = ev.clientY || ev.touches?.[0]?.clientY || 0;
      const dx = cx - docDragStart.current.mx, dy = cy - docDragStart.current.my;
      if (kind === 'move') setDocWinPos({ x: docDragStart.current.a + dx, y: docDragStart.current.b + dy });
      else if (kind === 'resize') setDocWinSize({ w: Math.max(380, docDragStart.current.a + dx), h: Math.max(380, docDragStart.current.b + dy) });
      else setDocImgPos({ x: docDragStart.current.a + dx, y: docDragStart.current.b + dy });
    };
    const onUp = () => {
      docDragRef.current = null;
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove); window.addEventListener('touchend', onUp);
  };
  const ensureSellerSubId = () => {
    const existing = editingOrder?._submissionId || formSubIdRef.current;
    if (existing) { formSubIdRef.current = existing; return existing; }
    const id = Date.now().toString();
    formSubIdRef.current = id;
    return id;
  };
  const countDocs = async (id) => { try { const d = await (await fetch(`${FIREBASE_URL}/order_files/${id}.json`)).json(); return d ? Object.keys(d).length : 0; } catch { return 0; } };
  const openDocQR = async (order, mode='add', photoId=null) => {
    if (Platform.OS!=='web' || typeof window==='undefined') { Alert.alert('Έγγραφο πελάτη','Διαθέσιμο μόνο από υπολογιστή.'); return; }
    const token = randToken();
    const node = order._sellerSub ? 'seller_submissions' : order.isQuote ? 'std_quotes' : null;
    const payload = { orderId:order.id, mode, exp:Date.now()+5*60*1000, by:currentUserName||'', ...(node ? {node} : {}) };
    if (mode==='replace' && photoId) payload.photoId = photoId;
    try { const r = await fetch(`${FIREBASE_URL}/upload_tokens/${token}.json`,{method:'PUT',body:JSON.stringify(payload)}); if(!r.ok) throw new Error(); }
    catch { Alert.alert('Σφάλμα','Αποτυχία δημιουργίας συνδέσμου.'); return; }
    let initial=null; try { initial = await (await fetch(`${FIREBASE_URL}/order_files/${order.id}.json`)).text(); } catch {}
    setDocQR({ visible:true, orderId:order.id, token, mode, photoId, url:`${window.location.origin}/.netlify/functions/upload-doc?t=${token}`, initial, status:'waiting' });
  };
  const openDocViewer = async (order) => {
    setDocWinPos({ x:0, y:0 }); setDocImgPos({ x:0, y:0 });
    setDocViewer({ visible:true, orderId:order.id, orderNo:order.orderNo||'', photos:[], idx:0, loading:true, zoom:1, rot:0 });
    try { const photos = await loadOrderFiles(order.id); setDocViewer(v=>({...v, photos, idx:0, loading:false })); }
    catch { setDocViewer(v=>({...v, loading:false })); }
  };
  const refreshDocViewer = async (orderId) => {
    try { const photos = await loadOrderFiles(orderId); setDocViewer(v=>v.visible&&v.orderId===orderId?{...v, photos, idx:Math.max(0,Math.min(v.idx, photos.length-1)) }:v); } catch {}
  };
  const deleteDocPhoto = (orderId, photoId) => {
    const doDel = async () => {
      try {
        await fetch(`${FIREBASE_URL}/order_files/${orderId}/${photoId}.json`,{method:'DELETE'});
        const photos = await loadOrderFiles(orderId);
        const node = quotes.some(q=>q.id===orderId) ? 'std_quotes' : 'std_orders';
        await fetch(`${FIREBASE_URL}/${node}/${orderId}.json`,{method:'PATCH',body:JSON.stringify({docCount:photos.length})});
        setDocCountLocal(orderId, photos.length);
        setDocViewer(v=>({...v, photos, idx:Math.max(0,Math.min(v.idx, photos.length-1)) }));
      } catch {}
    };
    if (Platform.OS==='web') { if (window.confirm('Διαγραφή αυτού του εγγράφου;')) doDel(); }
    else Alert.alert('Διαγραφή','Διαγραφή εγγράφου;',[{text:'Όχι'},{text:'Ναι',style:'destructive',onPress:doDel}]);
  };
  const printDocPhotos = (photos, title, rot=0) => {
    if (!photos.length) return;
    const r = ((rot % 360) + 360) % 360;
    const imgStyle = (r===90||r===270) ? `transform:rotate(${r}deg);max-width:90vh;max-height:90vw;` : `transform:rotate(${r}deg);max-width:100%;max-height:96vh;`;
    const imgs = photos.map(p=>`<div style="height:100vh;display:flex;align-items:center;justify-content:center;page-break-after:always;"><img src="${p.img}" style="${imgStyle}display:block;"></div>`).join('');
    printHTML(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:0;">${imgs}</body></html>`, title);
  };
  useEffect(() => {
    if (!docQR.visible || !docQR.orderId || docQR.status==='done') return;
    let alive = true;
    const iv = setInterval(async () => {
      try {
        const txt = await (await fetch(`${FIREBASE_URL}/order_files/${docQR.orderId}.json`)).text();
        if (alive && txt !== docQR.initial) {
          const photos = await loadOrderFiles(docQR.orderId);
          setDocCountLocal(docQR.orderId, photos.length);
          if (docQR.orderId === formSubIdRef.current) setCustomForm(f=>({...f, docCount: photos.length}));
          setDocQR(d=>d.visible?{...d, status:'done'}:d);
          refreshDocViewer(docQR.orderId);
        }
      } catch {}
    }, 3000);
    return () => { alive=false; clearInterval(iv); };
  }, [docQR.visible, docQR.orderId, docQR.initial, docQR.status]);

  // ── Ειδοποιήσεις πελάτη (Viber / Email / SMS) — ίδια ροή με vaicon-eidikes ──
  const showSmsToast = (text, kind='ok') => {
    setSmsToast({ visible:true, text, kind });
    setTimeout(()=>setSmsToast(t => t.text===text ? { visible:false, text:'', kind:'ok' } : t), 4500);
  };
  const findCustomerOf = (o) => {
    if (!o) return null;
    if (o.customerId) {
      const byId = (customers||[]).find(c => c.id === o.customerId);
      if (byId) return byId;
    }
    if (!o.customer) return null;
    const target = stripAccentsTxt(String(o.customer).trim().toLowerCase());
    return (customers||[]).find(c => c.name && stripAccentsTxt(c.name.trim().toLowerCase()) === target);
  };
  const markNotified = async (orderId, channel) => {
    const order = customOrders.find(o => o.id === orderId);
    if (!order) return;
    const upd = { ...order, notified: { ...(order.notified||{}), [channel]: Date.now() } };
    setCustomOrders(prev => prev.map(o => o.id === orderId ? upd : o));
    await syncToCloud(upd);
  };
  const clearNotified = async (orderId, channel) => {
    if (isGuest) return;
    const order = customOrders.find(o => o.id === orderId);
    if (!order?.notified?.[channel]) return;
    const newNotified = { ...order.notified };
    delete newNotified[channel];
    const upd = { ...order, notified: newNotified };
    setCustomOrders(prev => prev.map(o => o.id === orderId ? upd : o));
    await syncToCloud(upd);
    const labels = { viber:'Viber', email:'Email', sms:'SMS' };
    showSmsToast(`Αφαιρέθηκε σημείωση ${labels[channel]||channel} από #${order.orderNo||'?'}`, 'info');
  };
  const pickViberPhone = (c) => c?.phoneViber || '';
  const pickSmsPhone = (c) => [c?.phone, c?.phone2, c?.phone3, c?.phoneViber].find(isGreekMobile) || '';

  // === Customer Lookup (🔍 ΠΕΛΑΤΕΣ) ===
  const handleCustDragStart = (e) => {
    custIsDragging.current = true;
    custDragStart.current = { mx: e.clientX||e.touches?.[0]?.clientX||0, my: e.clientY||e.touches?.[0]?.clientY||0, px: custPanPos.x, py: custPanPos.y };
    const onMove = (ev) => {
      if (!custIsDragging.current) return;
      const cx = ev.clientX||ev.touches?.[0]?.clientX||0, cy = ev.clientY||ev.touches?.[0]?.clientY||0;
      setCustPanPos({ x: custDragStart.current.px + (cx - custDragStart.current.mx), y: custDragStart.current.py + (cy - custDragStart.current.my) });
    };
    const onUp = () => { custIsDragging.current = false; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); window.removeEventListener('touchmove',onMove); window.removeEventListener('touchend',onUp); };
    window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp); window.addEventListener('touchmove',onMove); window.addEventListener('touchend',onUp);
  };
  useEffect(() => {
    if (!showCustomerLookup || lookupSpecialOrders.length) return;
    (async () => {
      try {
        const [od, qd] = await Promise.all([
          fetch(`${FIREBASE_URL}/special_orders.json`).then(r=>r.json()),
          fetch(`${FIREBASE_URL}/special_quotes.json`).then(r=>r.json()),
        ]);
        if (od) setLookupSpecialOrders(Object.entries(od).map(([id,v])=>({ id: v?.id||id, ...v })));
        if (qd) setLookupSpecialQuotes(Object.entries(qd).map(([id,v])=>({ id: v?.id||id, ...v })));
      } catch {}
    })();
  }, [showCustomerLookup]);
  const getOrderTabInfo = (o) => {
    if (!o) return { label:'—', color:'#999' };
    const s = o.status;
    if (s === 'STD_SOLD'  || s === 'SOLD')  return { label:'ΑΡΧΕΙΟ',        color:'#555'    };
    if (s === 'STD_READY' || s === 'READY') return { label:'ΕΤΟΙΜΑ',        color:'#00C851' };
    if (s === 'PROD')                       return { label:'ΠΑΡΑΓΩΓΗ',      color:'#2e7d32' };
    if (s === 'STD_BUILD')                  return { label:'ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ', color:'#2e7d32' };
    return { label:'ΚΑΤΑΧΩΡΗΜΕΝΕΣ', color:'#ff4444' };
  };
  const buildSingleOrderHTML = (o) => {
    if (!o) return '';
    const esc = (s)=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const fmt = (t)=> t ? new Date(t).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
    const tab = getOrderTabInfo(o);
    const coats = (Array.isArray(o.coatings)?o.coatings:[]).filter(Boolean);
    const stav  = (Array.isArray(o.stavera)?o.stavera:[]).filter(s=>s&&s.dim);
    const kv = (label,val)=>`<div class="kv"><b>${label}</b><span>${esc(val||'—')}</span></div>`;
    return `
      <html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;color:#1a1a1a;padding:14px;}
        h1{font-size:18px;text-align:center;margin-bottom:6px;}
        .meta{text-align:center;color:#555;font-size:11px;margin-bottom:14px;}
        .sec{border:1px solid #ccc;border-radius:6px;padding:10px 12px;margin-bottom:10px;}
        .secTitle{font-size:11px;color:#777;font-weight:bold;letter-spacing:1px;margin-bottom:6px;text-transform:uppercase;}
        .row{display:flex;flex-wrap:wrap;gap:10px 24px;}
        .kv{min-width:140px;font-size:13px;}
        .kv b{color:#555;font-weight:normal;font-size:11px;display:block;}
        .kv span{font-weight:bold;font-size:14px;}
        table{width:100%;border-collapse:collapse;margin-top:4px;}
        th,td{border:1px solid #ddd;padding:4px 6px;font-size:12px;text-align:left;}
        th{background:#f5f5f5;font-weight:bold;}
        .tag{display:inline-block;padding:2px 8px;border-radius:4px;color:#fff;font-size:11px;font-weight:bold;}
        .notes{background:#fffdf5;border:1px solid #ffe082;padding:8px;border-radius:4px;font-size:13px;white-space:pre-wrap;}
      </style></head><body>
        <h1>VAICON — ΚΑΡΤΕΛΑ ΠΑΡΑΓΓΕΛΙΑΣ #${esc(o.orderNo||'—')}</h1>
        <div class="meta"><span class="tag" style="background:${tab.color};">${tab.label}</span> &nbsp;·&nbsp; Καταχώρηση: <b>${fmt(o.createdAt)}</b> &nbsp;·&nbsp; Παράδοση: <b>${fmt(o.deliveryDate)}</b></div>
        <div class="sec"><div class="secTitle">Πελάτης</div><div class="row">${kv('Όνομα',o.customer)}</div></div>
        <div class="sec"><div class="secTitle">Διαστάσεις & Χαρακτηριστικά</div><div class="row">
          ${kv('Ύψος (Η)',o.h)}${kv('Πλάτος (W)',o.w)}${kv('Πλευρά',o.side)}${kv('Τεμάχια',o.qty||'1')}
          ${o.armor?kv('Θωράκιση',o.armor):''}${kv('Τύπος Σασί',o.sasiType)}${kv('Τύπος Κάσας',o.caseType)}${kv('Τοποθέτηση',o.installation)}
          ${o.heightReduction?kv('Μείωση Ύψους',o.heightReduction):''}
        </div></div>
        <div class="sec"><div class="secTitle">Κλειδαριά / Εξαρτήματα</div><div class="row">
          ${kv('Κλειδαριά',o.lock)}${kv('Χρώμα Εξαρτημάτων',o.hardware)}${(o.glassDim||o.glassNotes)?kv('Τζάμι',[o.glassDim,o.glassNotes].filter(Boolean).join(' · ')):''}
        </div></div>
        <div class="sec"><div class="secTitle">Επενδύσεις</div><div class="row"><div class="kv" style="min-width:260px;"><b>Επενδύσεις</b><span>${coats.length?esc(coats.join(', ')):'—'}</span></div></div></div>
        ${miscJoin(o)?`<div class="sec"><div class="secTitle">Διάφορα</div><div class="row"><div class="kv" style="min-width:260px;"><b>Διάφορα</b><span>${esc(miscJoin(o))}</span></div></div></div>`:''}
        ${stav.length?`<div class="sec"><div class="secTitle">Σταθερά</div><table><tr><th>#</th><th>Διάσταση</th><th>Σημ.</th></tr>${stav.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(stavParts(s)||'')}</td><td>${esc(s.note||'')}</td></tr>`).join('')}</table></div>`:''}
        ${o.notes?`<div class="sec"><div class="secTitle">Σημειώσεις</div><div class="notes">${esc(o.notes)}</div></div>`:''}
        ${o.saleNote?`<div class="sec"><div class="secTitle">Σημείωση Πώλησης</div><div class="notes">${esc(o.saleNote)}</div></div>`:''}
      </body></html>`;
  };
  const printSingleOrderFull = async (o) => { if (o) await printHTML(buildSingleOrderHTML(o), `VAICON — Παραγγελία #${o.orderNo||''}`); };
  const renderLookupOrderRow = (o, isSpecial, isQuote=false) => {
    const tab = isQuote ? { label:'💼 ΠΡΟΣΦΟΡΑ', color:'#8e24aa' } : getOrderTabInfo(o);
    const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
    return (
      <TouchableOpacity key={o.id} onPress={()=>setLookupOrderModal({ visible:true, order:{...o, _special:isSpecial} })}
        style={{padding:10, borderBottomWidth:1, borderBottomColor:'#eee', backgroundColor: isSpecial?'#fff8e1':'#fff'}}>
        <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
          <Text style={{fontSize:14, fontWeight:'900', color:'#1a1a1a', minWidth:54}}>#{o.orderNo||'—'}</Text>
          <Text style={{fontSize:12, color:'#1a1a1a', fontWeight:'bold'}}>{o.h||'—'}×{o.w||'—'}</Text>
          <Text style={{fontSize:11, color:'#555'}}>{o.side||'—'}</Text>
          {parseInt(o.qty,10)>1 ? <Text style={{fontSize:12, color:'#cc0000', fontWeight:'900'}}>{o.qty}τεμ</Text> : null}
          {isSpecial ? (o.armor ? <Text style={{fontSize:11, color:'#555'}}>{o.armor}</Text> : null)
                     : <Text style={{fontSize:11, color:'#555'}}>{o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</Text>}
          <View style={{backgroundColor:tab.color, borderRadius:4, paddingHorizontal:6, paddingVertical:1, marginLeft:'auto'}}>
            <Text style={{color:'#fff', fontWeight:'bold', fontSize:10}}>{tab.label}</Text>
          </View>
        </View>
        <View style={{flexDirection:'row', alignItems:'center', gap:10, marginTop:3}}>
          {isSpecial && o.programNo ? <Text style={{fontSize:11, color:'#cc3300', fontWeight:'bold'}}>Α.Π. {o.programNo}</Text> : null}
          {createdFmt ? <Text style={{fontSize:11, color:'#888'}}>📅 {createdFmt}</Text> : null}
          {o.lock ? <Text style={{fontSize:11, color:'#555'}} numberOfLines={1}>🔒 {o.lock}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };
  const confirmSend = (channel, order, action) => {
    if (isGuest) return;
    const labels = { viber: 'Viber', email: 'Email', sms: 'SMS' };
    setConfirmModal({
      visible: true,
      title: `Αποστολή ${labels[channel] || channel}`,
      message: `Αποστολή ${labels[channel] || channel} στον πελάτη #${order.orderNo || '?'} (${order.customer || '—'});`,
      confirmText: 'ΑΠΟΣΤΟΛΗ',
      onConfirm: () => action(),
    });
  };
  const notifyViber = async (o) => {
    if (isGuest) return;
    const c = findCustomerOf(o);
    const p = pickViberPhone(c);
    if (!p) return;
    if (c?.viberOptOut) return showSmsToast('Ο πελάτης έχει απεγγραφεί από Viber.', 'err');
    showSmsToast('Αποστολή Viber...', 'info');
    const res = await sendViberViaYuboto(p, messageFor(o), o.id, c?.id);
    if (!res?.success) {
      showSmsToast('✕ Αποτυχία Viber: ' + (res?.error || 'Άγνωστο σφάλμα'), 'err');
      return;
    }
    markNotified(o.id, 'viber');
    showSmsToast(res.test ? '✓ Test mode: Viber OK.' : '✓ Viber στάλθηκε.', 'ok');
  };
  const notifyEmail = (o) => {
    if (isGuest) return;
    const c = findCustomerOf(o);
    if (!c?.email) return;
    openEmail(c.email, emailMessageFor(o), o.orderNo);
    markNotified(o.id, 'email');
  };
  const notifySms = async (o) => {
    if (isGuest) return;
    const c = findCustomerOf(o);
    const p = pickSmsPhone(c);
    if (!p) return showSmsToast('Δεν υπάρχει ελληνικό κινητό στον πελάτη.', 'err');
    showSmsToast('Αποστολή SMS...', 'info');
    const res = await sendSmsViaYuboto(p, smsMessageFor(o), o.id);
    if (!res?.success) {
      showSmsToast('✕ Αποτυχία SMS: ' + (res?.error || 'Άγνωστο σφάλμα'), 'err');
      return;
    }
    markNotified(o.id, 'sms');
    showSmsToast(res.test ? '✓ Test mode: SMS OK.' : '✓ SMS στάλθηκε.', 'ok');
  };
  // Κάθετη στήλη κουμπιών ειδοποίησης (Viber/Email/SMS) — τέρμα δεξιά της κάρτας,
  // όπως στο vaicon-eidikes.
  const renderNotifyColumn = (order) => {
    if (isForeman || (isGuest && !isSeller)) return null;
    const cust = findCustomerOf(order);
    const viberBlocked = !!pickViberPhone(cust) && !!cust?.viberOptOut;
    const viberOk = !!pickViberPhone(cust) && !cust?.viberOptOut;
    const emailOk = !!cust?.email;
    const smsOk = !!pickSmsPhone(cust);
    // Εμφανίζονται πάντα (για ομοιομορφία)· τα μη διαθέσιμα κανάλια μένουν ανενεργά/γκρι.
    const notif = order.notified || {};
    const msgStatus = order.msgStatus || {};
    const shortDate = (ts) => ts ? `${String(new Date(ts).getDate()).padStart(2,'0')}/${String(new Date(ts).getMonth()+1).padStart(2,'0')}` : '';
    const statusMark = (ch) => {
      const s = msgStatus[ch]?.status;
      if (s==='read') return <Text style={{color:'#4fc3f7', fontSize:10, fontWeight:'bold'}}>✓✓</Text>;
      if (s==='delivered') return <Text style={{color:'#cfd8dc', fontSize:10, fontWeight:'bold'}}>✓✓</Text>;
      if (s==='failed') return <Text style={{color:'#ffcdd2', fontSize:10, fontWeight:'bold'}}>✕</Text>;
      return null;
    };
    const Tag = isSeller ? View : TouchableOpacity;
    const tapProps = (ch, act) => isSeller ? {} : { onPress:act, onLongPress:()=>clearNotified(order.id,ch), delayLongPress:2000 };
    return (
      <View style={{justifyContent:'center', paddingLeft:22, marginLeft:22, borderLeftWidth:1, borderLeftColor:'#e0e0e0', gap:8, minWidth:130}}>
        <Tag disabled={!viberOk} {...tapProps('viber',()=>confirmSend('viber',order,()=>notifyViber(order)))} style={{backgroundColor: viberBlocked?'#b71c1c':(viberOk?'#7360f2':'#ddd'), borderRadius:10, paddingVertical:11, paddingHorizontal:14, alignItems:'center'}}>
          <Text style={{color:'white', fontSize:15, fontWeight:'bold'}}>{viberBlocked?'🚫 ':notif.viber?'✓ ':'📞 '}Viber</Text>
          {!viberBlocked && notif.viber ? <View style={{flexDirection:'row', alignItems:'center', gap:3}}><Text style={{color:'#fff', fontSize:11}}>{shortDate(notif.viber)}</Text>{statusMark('viber')}</View> : null}
          {viberBlocked ? <Text style={{color:'#fff', fontSize:11}}>απεγγράφηκε</Text> : null}
        </Tag>
        <Tag disabled={!emailOk} {...tapProps('email',()=>confirmSend('email',order,()=>notifyEmail(order)))} style={{backgroundColor: emailOk?'#0288d1':'#ddd', borderRadius:10, paddingVertical:11, paddingHorizontal:14, alignItems:'center'}}>
          <Text style={{color:'white', fontSize:15, fontWeight:'bold'}}>{notif.email?'✓ ':'✉️ '}Email</Text>
          {notif.email ? <Text style={{color:'#fff', fontSize:11}}>{shortDate(notif.email)}</Text> : null}
        </Tag>
        <Tag disabled={!smsOk} {...tapProps('sms',()=>confirmSend('sms',order,()=>notifySms(order)))} style={{backgroundColor: smsOk?'#1565C0':'#ddd', borderRadius:10, paddingVertical:11, paddingHorizontal:14, alignItems:'center'}}>
          <Text style={{color:'white', fontSize:15, fontWeight:'bold'}}>{notif.sms?'✓ ':'📱 '}SMS</Text>
          {notif.sms ? <View style={{flexDirection:'row', alignItems:'center', gap:3}}><Text style={{color:'#fff', fontSize:11}}>{shortDate(notif.sms)}</Text>{statusMark('sms')}</View> : null}
        </Tag>
      </View>
    );
  };

  // Σημείωση πώλησης (κάρτες Έτοιμα/Αρχείο) — όπως vaicon-eidikes.
  const updateSaleNote = async (order, text) => {
    const isArchive = order.status === 'SOLD' || soldOrders.some(o => o.id === order.id);
    if (isArchive) setSoldOrders(prev => prev.map(o => o.id === order.id ? { ...o, saleNote: text } : o));
    else setCustomOrders(prev => prev.map(o => o.id === order.id ? { ...o, saleNote: text } : o));
    try { await fetch(`${FIREBASE_URL}/std_orders/${order.id}.json`, { method: 'PATCH', body: JSON.stringify({ saleNote: text }) }); } catch {}
  };

  const appendPriceLog = (prevLog, newTotal, hasItems) => {
    const logArr = Array.isArray(prevLog) ? [...prevLog] : [];
    if (!hasItems) return logArr;
    const last = logArr[logArr.length-1];
    if (!last || last.total !== newTotal) logArr.push({ user: currentUserName, ts: Date.now(), total: newTotal });
    return logArr;
  };
  const savePriceList = async (order, items, discount, note='') => {
    const priceTotal = priceFinalTotal(items, discount);
    const priceLog = appendPriceLog(order.priceLog, priceTotal, (items||[]).length>0);
    const upd = { ...order, priceList: items, priceDiscount: discount, priceTotal, priceLog, priceNote: note };
    const isArchive = order.status === 'SOLD' || soldOrders.some(o => o.id === order.id);
    if (isArchive) setSoldOrders(prev => prev.map(o => o.id === order.id ? upd : o));
    else setCustomOrders(prev => prev.map(o => o.id === order.id ? upd : o));
    try { await fetch(`${FIREBASE_URL}/std_orders/${order.id}.json`, { method: 'PATCH', body: JSON.stringify({ priceList: items, priceDiscount: discount, priceTotal, priceLog, priceNote: note }) }); } catch {}
  };
  // Κουμπιά/πεδία φόρμας που ενεργοποιούν δεμένη χρέωση από το μενού ΔΙΑΦΟΡΑ (link).
  // 'hinges3' = κάθε μεντεσές πάνω από τον 2ο (3→×1, 4→×2 ...).
  const extraHinges = (src) => Math.max(0, (parseInt(src.hinges, 10) || 0) - 2);
  const pihakiCount = (src) => (src.coatings || []).filter(c => c && String(c).trim() && getCoatingType(c) === 'MESA' && src.coatingDetails?.[c]?.pihaki).length;
  const linkActive = (src, l) => l === 'montage' ? src.installation === 'ΝΑΙ'
    : l === 'kypri' ? src.kypri === 'ΝΑΙ'
    : l === 'heightReduction' ? !!String(src.heightReduction || '').trim()
    : l === 'hinges3' ? extraHinges(src) > 0
    : l === 'pihaki' ? pihakiCount(src) > 0
    : l === 'galva' ? (!!src.caseMaterial && src.caseMaterial !== 'DKP') : false;
  // Αυτόματες χρεώσεις από τις τρέχουσες επιλογές + ζωντανές τιμές μενού/τιμοκαταλόγου.
  const loadCatalog = async () => { try { const c = await (await fetch(`${FIREBASE_URL}/price_catalog.json`)).json(); return c ? Object.values(c) : []; } catch { return []; } };
  const stavRuleNames = (cat) => (cat || []).filter(e => e && e.hasRule && (e.ruleKind === 'glass' || e.ruleKind === 'design')).map(e => String(e.name || '').trim()).filter(Boolean);
  // Καθαρίζει παλιές αυτόματες γραμμές σταθερών/χιαστής (κρατά όσες έχουν αλλαχθεί χειροκίνητα) — ξαναμπαίνουν φρέσκες από το buildAutoLines.
  const dropStaleStav = (list, names) => (!names || !names.length) ? (Array.isArray(list) ? list : []) : (Array.isArray(list) ? list : []).filter(l => {
    const lab = String(l?.label || '').trim();
    if (!names.some(n => lab === n || lab.startsWith(n + ' '))) return true;
    const def = String(l?.def ?? '').trim();
    return def !== '' && String(l?.value ?? '').trim() !== def;
  });
  const buildAutoLines = async (src, catArg) => {
    const lines = [];
    try {
      const cat = catArg || await loadCatalog();
      lines.push(...autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', src));
    } catch {}
    const pNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
    const qtyStr = String(parseInt(src.qty, 10) > 0 ? parseInt(src.qty, 10) : 1);
    const have = new Set(lines.map(l => l.label));
    const push = (label, value) => { if (label && !have.has(label)) { lines.push({ label, value, qty: qtyStr }); have.add(label); } };
    // Κλειδαριά/άφαλος: γραμμή πάντα όταν επιλεγεί — τιμή αν υπάρχει, αλλιώς κενή (κόκκινη υπενθύμιση).
    // Ανεκτική αντιστοίχιση (το πεδίο μπορεί να έχει όνομα λίστας + επιπλέον κείμενο).
    const bestLock = (arr, val) => { const v = String(val || '').trim(); if (!v) return null; return (arr || []).filter(x => x && x.name && (v === x.name || v.startsWith(x.name))).sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0))[0] || null; };
    for (const [arr, val] of [[locks, src.lock], [cylinders, src.cylinder]]) {
      if (!String(val || '').trim()) continue;
      const it = bestLock(arr, val);
      push(it ? it.name : String(val).trim(), (it && pNum(it.price) > 0) ? String(it.price) : '');
    }
    for (const name of (src.misc || [])) {
      const it = (misc || []).find(x => x && x.name === name); if (it && pNum(it.price) > 0) push(name, String(it.price));
    }
    // Δεμένα είδη: μπαίνουν όταν είναι ΝΑΙ το αντίστοιχο κουμπί (κενή τιμή → κόκκινο, υπενθύμιση).
    const doors = parseInt(src.qty, 10) > 0 ? parseInt(src.qty, 10) : 1;
    for (const m of (misc || [])) {
      if (!m || !m.link || !linkActive(src, m.link) || have.has(m.name)) continue;
      const q = m.link === 'hinges3' ? extraHinges(src) * doors : m.link === 'pihaki' ? pihakiCount(src) * doors : doors;
      lines.push({ label: m.name, value: String(m.price || ''), qty: String(q) }); have.add(m.name);
    }
    // Κολώνες σταθερών: επιλεγμένο χρώμα × τεμάχια × πόρτες (τιμή από τα ΔΙΑΦΟΡΑ).
    const colQ = parseInt(src.stavColumn?.qty, 10) || 0;
    const colName = src.stavColumn?.name;
    if (colName && colQ > 0 && !have.has(colName)) {
      const it = (misc || []).find(x => x && x.name === colName);
      if (it && pNum(it.price) > 0) { lines.push({ label: colName, value: String(it.price), qty: String(colQ * doors) }); have.add(colName); }
    }
    return lines.map(l => ({ ...l, def: (l.value !== '' && l.value != null) ? String(l.value) : '' }));
  };
  // Τοποθέτηση: γραμμή στο τέλος, χωρίς σταθερή τιμή (μπαίνει με το χέρι).
  const withTail = (list, src) => (src.placement === 'ΝΑΙ' && !list.some(l => String(l.label || '').trim() === 'Τοποθέτηση'))
    ? [...list, { label: 'Τοποθέτηση', value: '', qty: '1' }] : list;
  // Καθαρίζει παλιές γραμμές «Κολώνες σταθερών» (όταν αλλάζει χρώμα) — η τρέχουσα ξαναμπαίνει από το buildAutoLines.
  const dropStaleStavCol = (list) => (Array.isArray(list) ? list : []).filter(l => !(misc || []).some(m => m && m.link === 'stavCol' && m.name === String(l?.label || '').trim()));
  // Ανοίγει το πλαίσιο τιμών με ενημερωμένες αυτόματες χρεώσεις (προσθέτει μόνο όσες λείπουν).
  const openPriceModal = async (order) => {
    const src = order || customForm;
    const cat = await loadCatalog();
    const merged = withTail(applyAutoPriceLines(dropStaleStav(dropStaleStavCol(src.priceList || []), stavRuleNames(cat)), await buildAutoLines(src, cat)), src);
    if (order) {
      const before = order.priceList || [];
      const isArchive = order.status === 'SOLD' || soldOrders.some(o => o.id === order.id);
      const changed = merged.length !== before.length || priceFinalTotal(merged, order.priceDiscount) !== priceFinalTotal(before, order.priceDiscount);
      if (!isArchive && changed) await savePriceList(order, merged, order.priceDiscount || '', order.priceNote || '');
      setPriceModal({ visible: true, order: { ...order, priceList: merged } });
    } else { setCustomForm(f => ({ ...f, priceList: merged })); setPriceModal({ visible: true, order: null }); }
  };
  const renderSaleNote = (order) => (
    <TextInput
      style={{ width: 675, alignSelf: 'stretch', marginLeft: 8, backgroundColor: '#fffde7', borderRadius: 8, borderWidth: 1, borderColor: '#ffe082', paddingHorizontal: 8, paddingVertical: 6, fontSize: 16, color: '#5d4037', minHeight: 40, textAlignVertical: 'top' }}
      placeholder="📝 Σημείωση..."
      placeholderTextColor="#bbb"
      multiline
      value={order.saleNote || ''}
      onChangeText={text => updateSaleNote(order, text)}
    />
  );

  // Κουμπί εγγράφου πελάτη (φωτό με QR) + κουμπί τιμών — μέσα στην κάρτα, όπως vaicon-eidikes.
  const renderDocButton = (order) => {
    if (isGuest && !locked) return null;
    const ro = locked;
    const total = priceFinalTotal(order.priceList, order.priceDiscount).toFixed(2).replace('.', ',');
    const priceMissing = (order.priceList || []).some(it => String(it?.label || '').trim() && !String(it?.value || '').trim());
    const priceDiscounted = priceFinalTotal(order.priceList, order.priceDiscount) < priceCatalogTotal(order.priceList) - 0.005;
    const priceBadgeInner = (
      <>
        {priceMissing ? <Text style={{ color: '#d32f2f', fontSize: 15, fontWeight: '900' }}>●</Text> : null}
        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#2e7d32' }}>💶 ΤΙΜΕΣ — <Text style={{ color: priceDiscounted ? '#d32f2f' : '#2e7d32' }}>{total}€</Text></Text>
      </>
    );
    return (
      <View style={{flexDirection:'row', alignItems:'flex-start', flexWrap:'wrap', gap:8, marginTop:8}}>
        {order.docCount > 0 ? (
          ro ? (
            <View style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#e8f5e9',borderWidth:1,borderColor:'#43a047',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
              <Text style={{fontSize:13,fontWeight:'bold',color:'#2e7d32'}}>📎 ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ</Text>
              <View style={{backgroundColor:'#2e7d32',borderRadius:10,minWidth:20,paddingHorizontal:5,paddingVertical:1}}><Text style={{color:'#fff',fontSize:12,fontWeight:'900',textAlign:'center'}}>{order.docCount}</Text></View>
            </View>
          ) : (
            <TouchableOpacity onPress={()=>openDocViewer(order)} style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#e8f5e9',borderWidth:1,borderColor:'#43a047',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
              <Text style={{fontSize:13,fontWeight:'bold',color:'#2e7d32'}}>📎 ΠΡΟΒΟΛΗ ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ</Text>
              <View style={{backgroundColor:'#2e7d32',borderRadius:10,minWidth:20,paddingHorizontal:5,paddingVertical:1}}><Text style={{color:'#fff',fontSize:12,fontWeight:'900',textAlign:'center'}}>{order.docCount}</Text></View>
            </TouchableOpacity>
          )
        ) : (ro ? null : (
          <TouchableOpacity onPress={()=>openDocQR(order,'add')} style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#bbb',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
            <Text style={{fontSize:13,fontWeight:'bold',color:'#555'}}>📎 ΚΑΤΑΧΩΡΗΣΗ ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ</Text>
          </TouchableOpacity>
        ))}
        {(() => {
          if (isForeman) return null;
          const priceRO = ro || isSeller;
          if ((order.priceList||[]).length) {
            return priceRO ? (
              <View style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#e8f5e9',borderWidth:1,borderColor:'#2e7d32',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
                {priceBadgeInner}
              </View>
            ) : (
              <TouchableOpacity onPress={()=>openPriceModal(order)} style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#e8f5e9',borderWidth:1,borderColor:'#2e7d32',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
                {priceBadgeInner}
              </TouchableOpacity>
            );
          }
          return priceRO ? null : (
            <TouchableOpacity onPress={()=>openPriceModal(order)} style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#bbb',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
              <Text style={{fontSize:13,fontWeight:'bold',color:'#555'}}>💶 ΚΑΤΑΧΩΡΗΣΗ ΤΙΜΩΝ</Text>
            </TouchableOpacity>
          );
        })()}
      </View>
    );
  };
  // Πωλητής: καταχώρηση εγγράφου στη φόρμα πριν την αποστολή (ακολουθεί στην έγκριση, id = υποβολή).
  const sellerFormDocBtn = (extraStyle = {}) => {
    if (!isSeller && !approveCtx) return null;
    const n = customForm.docCount || 0;
    return (
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: n ? '#6a1b9a' : '#777', paddingHorizontal: 22, marginTop: 0 }, extraStyle]}
        onPress={() => { Keyboard.dismiss(); const id = ensureSellerSubId(); n ? openDocViewer({ id, orderNo: '' }) : openDocQR({ id, _sellerSub: true }, 'add'); }}>
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>📎 ΕΓΓΡΑΦΟ{n ? ` (${n})` : ''}</Text>
      </TouchableOpacity>
    );
  };

  // ── Επενδύσεις: μορφοποίηση ονομάτων + στοιχεία ανά επένδυση (όπως vaicon-eidikes) ──
  const coatingStyle = (name, baseSize) => getFormatStyle(findFormatItem(name, coatings), baseSize);
  const hasAnyCoatingDetails = (order) => {
    const cd = order?.coatingDetails; if (!cd) return false;
    return Object.values(cd).some(d => d && Object.values(d).some(v => v && String(v).trim()));
  };
  const renderCoatDetailsContent = (order) => {
    const cd = order?.coatingDetails || {};
    const buildRow = (d, keys) => keys.map(k=>d[k]&&String(d[k]).trim()?{key:k, value:String(d[k]).trim()}:null).filter(Boolean);
    const userStyle = {color:'#d32f2f',fontWeight:'900',fontStyle:'italic'};
    const joinSep = (items, userKeys=[]) => items.flatMap((it,i)=>{
      const isUser = userKeys.includes(it.key);
      const valEl = <Text key={i} style={isUser?userStyle:undefined}>{it.value}</Text>;
      return i===0 ? [valEl] : [<Text key={'s'+i} style={{fontWeight:'900',color:'#d32f2f'}}>{'  /  '}</Text>, valEl];
    });
    return (order.coatings||[]).filter(n=>n&&String(n).trim()).map(name=>{
      const d = cd[name]||{};
      const fyllo = buildRow(d, ['dim','design','color']);
      const perv  = buildRow(d, ['frameW','frameColor']);
      const kasa  = buildRow(d, ['caseW','caseColor']);
      if (fyllo.length===0 && perv.length===0 && kasa.length===0) return null;
      const type = getCoatingType(name);
      const c = type==='EXO'?'#e65100':type==='MESA'?'#1565C0':'#444';
      const rowStyle = {fontSize:18,color:'#1a1a1a',marginLeft:10,marginBottom:4,lineHeight:26};
      const userKeys = [d.dimUser&&'dim', d.frameColorUser&&'frameColor', d.caseColorUser&&'caseColor'].filter(Boolean);
      return (
        <View key={name} style={{marginBottom:16}}>
          <Text style={{fontSize:19,fontWeight:'900',color:c,letterSpacing:0.5,marginBottom:7}}>{name}</Text>
          {fyllo.length>0&&<Text style={rowStyle}><Text style={{fontWeight:'900'}}>Φύλλο: </Text>{joinSep(fyllo, userKeys)}</Text>}
          {perv.length>0&&<Text style={rowStyle}><Text style={{fontWeight:'900'}}>Περβάζι: </Text>{joinSep(perv, userKeys)}</Text>}
          {type==='EXO'&&kasa.length>0&&<Text style={rowStyle}><Text style={{fontWeight:'900'}}>Κάσα: </Text>{joinSep(kasa, userKeys)}</Text>}
          {type==='MESA'&&d.pihaki&&<Text style={[rowStyle,{color:'#1565C0',fontWeight:'900'}]}>✓ Πηχάκι (ξυλογωνιά)</Text>}
        </View>
      );
    });
  };
  // Γραμμή «κλειδαριά — κάσα — επενδύσεις» με μορφοποίηση + κουμπί «i» στοιχείων.
  const renderCardCoatLine = (o, fontSize=11) => {
    const hasCoats = o.coatings && o.coatings.length > 0;
    if (!o.lock && !o.caseType && !hasCoats) return null;
    const preTxt = [
      o.lock?`🔒 ${o.lock}`:'',
      o.caseType?(o.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ ΚΑΣΑ':'ΚΛΕΙΣΤΗ ΚΑΣΑ'):'',
    ].filter(Boolean).join(' — ');
    return (
      <View style={{flexDirection:'row', alignItems:'center', flexWrap:'wrap', marginTop:2}}>
        <Text style={{fontSize, color:'#555'}}>
          {preTxt}
          {preTxt && hasCoats ? ' — ' : ''}
          {hasCoats ? o.coatings.map((n,i)=>(<Text key={i} style={coatingStyle(n, fontSize)}>{i>0?', ':''}{n}</Text>)) : null}
        </Text>
        {hasAnyCoatingDetails(o)&&(
          <TouchableOpacity onPress={()=>setCoatDetailsModal({visible:true,order:o})} style={{marginLeft:6,backgroundColor:'#d32f2f',borderRadius:4,width:18,height:18,alignItems:'center',justifyContent:'center'}}>
            <Text style={{color:'white',fontWeight:'900',fontSize:12,lineHeight:14}}>i</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const resetForm = () => { setCustomForm(INIT_FORM); setCustomerSearch(''); setSelectedCustomer(null); setShowCustomerList(false); setEditingOrder(null); setApproveCtx(null); setOrderNoAuto(true); setGroupState(null); setQuoteGroup(null); setEditingQuote(null); setHoldMode(false); formSubIdRef.current = null; };

  // Φόρτωση υποβολής πωλητή στη φόρμα: «Διόρθωση» (πωλητής) ή «Άνοιγμα προς έγκριση» (γραφείο, _approve).
  useEffect(() => {
    if (!editSubmission) return;
    const { _sid, _approve, status, submittedAt, submittedBy, rejectNote, rejectedBy, rejectedAt, ...data } = editSubmission;
    const baseForm = { ...INIT_FORM, ...data, orderNo: '', ...(_approve ? { enteredBy: submittedBy } : {}) };
    setCustomForm(baseForm);
    const c = data.customerId ? (customers||[]).find(x => x.id === data.customerId) : (customers||[]).find(x => x.name === data.customer);
    setSelectedCustomer(c || (data.customer ? { name: data.customer, id: data.customerId } : null));
    setCustomerSearch(data.customer || '');
    formSubIdRef.current = _sid;
    if (_approve) {
      setEditingOrder(null);
      setApproveCtx({ sid: _sid, submittedAt: submittedAt || 0, groupId: data.groupId || null, groupSeq: data.groupSeq ?? null });
      setOrderNoAuto(true);
      (async () => { const f = { ...baseForm }; try { const _cat = await loadCatalog(); f.priceList = withTail(applyAutoPriceLines(dropStaleStav(dropStaleStavCol(f.priceList), stavRuleNames(_cat)), await buildAutoLines(f, _cat)), f); } catch {} setCustomForm(prev => ({ ...prev, priceList: f.priceList })); })();
    } else {
      setEditingOrder({ _submissionId: _sid });
    }
    onEditSubmissionDone();
  }, [editSubmission]);

  // ── Αυτόματη αρίθμηση: παρόντες αριθμοί (τυποποιημένες + πωλημένες + ειδικές) ──
  const allPresentNos = () => [...customOrders.map(o=>o.orderNo), ...soldOrders.map(o=>o.orderNo), ...crossOrderNos];
  const computeAutoNo = (present = allPresentNos(), ledger = Object.keys(orderSeq)) => suggestNextOrderNo(present, ledger);

  // Κλειδώνει atomically το νούμερο στο order_seq (γράφει μόνο αν δεν υπάρχει — κανόνας $num).
  // Σε ταυτόχρονη αποθήκευση ο δεύτερος βρίσκει το νούμερο πιασμένο και παίρνει αυτόματα το επόμενο.
  const claimSeqNumber = async (start) => {
    let n = Number(start);
    for (let i = 0; i < 100; i++, n++) {
      const res = await fetch(`${FIREBASE_URL}/order_seq/${n}.json`, { method: 'PUT', body: JSON.stringify(1) });
      if (res.ok) return String(n);
    }
    throw new Error('order number claim failed');
  };

  // Φόρτωση ειδικών αριθμών + μητρώου εκδοθέντων (μία φορά)
  useEffect(() => {
    (async () => {
      try {
        const [sp, seq] = await Promise.all([
          fetch(`${FIREBASE_URL}/special_orders.json`).then(r=>r.json()).catch(()=>null),
          fetch(`${FIREBASE_URL}/order_seq.json`).then(r=>r.json()).catch(()=>null),
        ]);
        setCrossOrderNos(sp ? Object.values(sp).map(o=>o?.orderNo).filter(Boolean) : []);
        setOrderSeq(seq || {});
      } catch {}
    })();
  }, []);

  // Προεπισκόπηση προτεινόμενου Ν/Π όσο είναι σε αυτόματη λειτουργία (νέα παραγγελία)
  useEffect(() => {
    if (editingOrder || !orderNoAuto) return;
    const next = computeAutoNo();
    setCustomForm(f => f.orderNo === next ? f : { ...f, orderNo: next });
  }, [crossOrderNos, orderSeq, customOrders, soldOrders, editingOrder, orderNoAuto, customForm.orderNo]);

  const blurAll = () => {
    Object.values(staveraHRefs.current).forEach(r=>r?.blur());
    Object.values(staveraQtyRefs.current).forEach(r=>r?.blur());
    Object.values(staveraGridNoteRefs.current).forEach(r=>r?.blur());
  };
  useEffect(()=>{ setTimeout(()=>customerRef.current?.focus(), 300); }, []);

  const readyNos = useMemo(() => new Set((customOrders||[]).filter(o=>o.status==='STD_READY').map(o=>String(o.orderNo))), [customOrders]);

  // Σπασμένα «παιδιά» μιας μάνας: πρόθεμα «root-0-» (αυτόνομη) ή «root-» (με παύλα).
  const splitChildPrefix = (o) => { const n = String(o?.orderNo ?? ''); if (!n) return null; return n.includes('-') ? `${n}-` : `${n}-0-`; };
  // Η μάνα έχει έστω ένα ΕΝΕΡΓΟ παιδί (όχι ακόμη στα ΕΤΟΙΜΑ/Αρχείο) → μπλοκάρεται να πάει στα ΕΤΟΙΜΑ.
  const hasActiveChildren = (o) => {
    const p = splitChildPrefix(o); if (!p) return false;
    return (customOrders||[]).some(c => c && c.splitChild && String(c.orderNo).startsWith(p) && c.status !== 'STD_READY' && c.status !== 'STD_SOLD');
  };
  // Υπάρχει έστω ένα σπασμένο κομμάτι (οποιασδήποτε κατάστασης) στη λίστα → η μάνα δεν διαγράφεται.
  const hasAnyChildren = (o) => {
    const p = splitChildPrefix(o); if (!p) return false;
    return (customOrders||[]).some(c => c && c.splitChild && String(c.orderNo).startsWith(p));
  };

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

      // Κάλυψη (greedy, κοινή λογική με την οθόνη στοκ)
      const checkStockFIFO = (stockMap, key, orderNo) => stockCovers(stockMap?.[key], orderNo, readyNos);

      // STD_BUILD: έλεγχος stock μόνο — η μετάβαση γίνεται μέσω confirmation modal στο commitTaskBasket
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
          if (hasActiveChildren(o)) return o; // η μάνα πάει στα ΕΤΟΙΜΑ τελευταία
          updated = true;
          const upd = {...o, status:'STD_READY', readyAt:Date.now(), staveraPendingAtReady:true};
          pendingSync.push(upd);
          return upd;
        }
      }

      if(o.status!=='DIPLI_PROD') return o;
      const phases = o.dipliPhases;
      const allDone = phases && Object.keys(phases).every(k=>!phases[k].active||phases[k].done);
      if(!allDone) return o;
      const staveraPending = hasStavera && !o.staveraDone;
      const hasCaseOk2 = checkStockFIFO(caseStock, ck, o.orderNo);
      if(!hasCaseOk2) return o;
      if(hasActiveChildren(o)) return o; // η μάνα πάει στα ΕΤΟΙΜΑ τελευταία
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

  // Στο web το Alert.alert δεν εμφανίζεται — χρησιμοποιούμε window.alert
  const notify = (title, msg) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
    else Alert.alert(title, msg);
  };

  // ── Γραφείο: έγκριση/απόρριψη υποβολής πωλητή μέσα από τη φόρμα ──
  const approveFromForm = async () => {
    if (!approveCtx) return;
    const fresh = await fetch(`${FIREBASE_URL}/seller_submissions/${approveCtx.sid}.json`).then(r=>r.json()).catch(()=>undefined);
    if (fresh === undefined) { notify('Σφάλμα','Δεν έγινε έλεγχος κατάστασης. Δοκίμασε ξανά.'); return; }
    if (!fresh || fresh.status !== 'PENDING') { notify('Ήδη διεκπεραιωμένη','Η παραγγελία έχει ήδη εγκριθεί ή απορριφθεί.'); resetForm(); return; }
    if ((fresh.submittedAt || 0) !== (approveCtx.submittedAt || 0)) { notify('Άλλαξε η παραγγελία','Ο πωλητής τη διόρθωσε στο μεταξύ — άνοιξέ την ξανά από τις εγκρίσεις.'); resetForm(); return; }
    // Αριθμός: μονή → νέος· ομάδα → κοινός βασικός (η 1η πόρτα τον πιάνει, οι επόμενες κολλάνε πάνω του).
    let groupInfo = null;
    if (approveCtx.groupId) {
      const sib = customOrders.find(o => o.groupId === approveCtx.groupId && o.orderNo);
      let base;
      if (sib) base = splitBaseNo(sib.orderNo);
      else { try { base = await claimSeqNumber(suggestNextOrderNo(allPresentNos(), Object.keys(orderSeq))); } catch { notify('Σφάλμα','Δεν κλειδώθηκε αριθμός. Δοκίμασε ξανά.'); return; } }
      const seq = approveCtx.groupSeq || nextGroupSuffix(base, customOrders.map(o=>o.orderNo));
      groupInfo = { groupId: approveCtx.groupId, groupSeq: seq, base, orderNo: groupOrderNo(base, seq), final: true };
    }
    const sid = approveCtx.sid, submittedBy = fresh.submittedBy || '';
    const ok = await saveOrderWith({ ...customForm, _forceId: sid, approvedBy: currentUserName, approvedAt: Date.now() }, groupInfo);
    if (!ok) return;
    const no = groupInfo ? groupInfo.orderNo : (lastSavedNoRef.current || '');
    await fetch(`${FIREBASE_URL}/seller_submissions/${sid}.json`, { method:'PATCH', body: JSON.stringify({ status:'APPROVED', approvedOrderNo: no, approvedBy: currentUserName || '', approvedAt: Date.now(), approvedPrice: lastSavedTotalRef.current ?? null }) }).catch(()=>{});
    await fetch(`${FIREBASE_URL}/approval_log.json`, { method:'POST', body: JSON.stringify({ ts: Date.now(), section:'ΤΥΠΟΠΟΙΗΜΕΝΗ', action:'APPROVED', orderNo: no, customer: customForm.customer || '', submittedBy, submittedAt: fresh.submittedAt || null, approvedBy: currentUserName || '' }) }).catch(()=>{});
    resetForm();
    notify('✅ Εγκρίθηκε', `Η παραγγελία${no?` #${no}`:''} εγκρίθηκε και μπήκε στις παραγγελίες.`);
  };

  const rejectFromForm = async () => {
    if (!approveCtx) return;
    const sid = approveCtx.sid;
    const fresh = await fetch(`${FIREBASE_URL}/seller_submissions/${sid}.json`).then(r=>r.json()).catch(()=>undefined);
    if (!fresh || fresh.status !== 'PENDING') { notify('Ήδη διεκπεραιωμένη','Η παραγγελία έχει ήδη εγκριθεί ή απορριφθεί.'); resetForm(); return; }
    const note = Platform.OS === 'web' ? (window.prompt('Σημείωση απόρριψης για τον πωλητή (προαιρετικό):','') ?? null) : '';
    if (note === null) return;
    await fetch(`${FIREBASE_URL}/seller_submissions/${sid}.json`, { method:'PATCH', body: JSON.stringify({ status:'REJECTED', rejectNote: note || '', rejectedBy: currentUserName || '', rejectedAt: Date.now() }) }).catch(()=>{});
    await fetch(`${FIREBASE_URL}/approval_log.json`, { method:'POST', body: JSON.stringify({ ts: Date.now(), section:'ΤΥΠΟΠΟΙΗΜΕΝΗ', action:'REJECTED', customer: customForm.customer || '', submittedBy: fresh.submittedBy || '', submittedAt: fresh.submittedAt || null, approvedBy: currentUserName || '', rejectNote: note || '' }) }).catch(()=>{});
    resetForm();
    notify('✕ Απορρίφθηκε','Η παραγγελία απορρίφθηκε και επιστράφηκε στον πωλητή.');
  };

  // Η saveOrderWith δέχεται τη φόρμα ως όρισμα ώστε η προειδοποίηση ματιού να
  // μπορεί να αποθηκεύσει με διορθωμένες σημειώσεις χωρίς να περιμένει setState.
  const saveOrder = async (overrides = null, groupInfo = null) =>
    saveOrderWith(overrides ? { ...customForm, ...overrides } : customForm, groupInfo);
  // Σε edit mode: αν η εγγραφή είναι προσφορά → αποθήκευση ως προσφορά, αλλιώς ως παραγγελία.
  const saveEdited = (overrides = null) => customForm.isQuote ? saveQuote(overrides) : saveOrder(overrides);
  const saveOrderWith = async (customForm, groupInfo = null) => {
    if (isGuest) return false;
    if (!customForm.h||!customForm.w) { notify("Προσοχή","Βάλτε Ύψος και Πλάτος."); return false; }
    const intermediate = groupInfo && !groupInfo.final;

    // ── ΠΩΛΗΤΗΣ: υποβολή προς έγκριση (χωρίς αριθμό, ξεχωριστό καλάθι) ──
    if (isSeller) {
      if (!selectedCustomer) {
        if (Platform.OS === 'web') window.alert('Διάλεξε έναν από τους πελάτες σου από τη λίστα.');
        else Alert.alert('Επιλογή πελάτη', 'Διάλεξε έναν από τους πελάτες σου από τη λίστα.');
        return false;
      }
      const submissionId = editingOrder?._submissionId || formSubIdRef.current || Date.now().toString();
      const gId = groupInfo?.groupId || customForm.groupId;
      const gSeq = groupInfo?.groupSeq ?? customForm.groupSeq;
      const dc = await countDocs(submissionId);
      const submission = {
        ...customForm, orderNo: '', orderType: 'ΤΥΠΟΠΟΙΗΜΕΝΗ',
        submittedBy: sellerKey, submittedAt: Date.now(), status: 'PENDING',
        createdAt: customForm.createdAt || Date.now(),
        ...(gId ? { groupId: gId, groupSeq: gSeq } : {}),
      };
      delete submission._submissionId; delete submission._sid; delete submission.isQuote; delete submission.quotedAt;
      delete submission.rejectNote; delete submission.rejectedBy; delete submission.rejectedAt;
      sanitizeCoatingFields(submission);
      if (dc) submission.docCount = dc; else delete submission.docCount;
      if (editingOrder?._submissionId) {
        const cur = await fetch(`${FIREBASE_URL}/seller_submissions/${submissionId}.json`).then(r=>r.json()).catch(()=>undefined);
        if (cur === undefined) { notify('Σφάλμα','Δεν έγινε έλεγχος κατάστασης. Δοκίμασε ξανά.'); return false; }
        if (cur && cur.status !== 'PENDING' && cur.status !== 'REJECTED') {
          notify('Δεν γίνεται διόρθωση','Η παραγγελία εγκρίθηκε ήδη από το γραφείο. Επικοινώνησε με το γραφείο για αλλαγές.');
          return false;
        }
      }
      try {
        const r = await fetch(`${FIREBASE_URL}/seller_submissions/${submissionId}.json`, { method:'PUT', body: JSON.stringify(submission) });
        if (!r.ok) throw new Error();
      } catch { notify('Σφάλμα','Η υποβολή δεν στάλθηκε. Δοκίμασε ξανά.'); return false; }
      if (intermediate) { formSubIdRef.current = null; return true; }
      resetForm();
      notify('✅ Υποβλήθηκε', groupInfo ? 'Όλες οι πόρτες της παραγγελίας υποβλήθηκαν για έγκριση από το γραφείο.' : 'Η παραγγελία υποβλήθηκε για έγκριση από το γραφείο.');
      return true;
    }

    // Φρέσκο διάβασμα για κοινή/μοναδική αρίθμηση (τυποποιημένες + ειδικές + μητρώο)
    const [freshStd, freshSp, freshSeq] = await Promise.all([
      fetch(`${FIREBASE_URL}/std_orders.json`).then(r=>r.json()).catch(()=>null),
      fetch(`${FIREBASE_URL}/special_orders.json`).then(r=>r.json()).catch(()=>null),
      fetch(`${FIREBASE_URL}/order_seq.json`).then(r=>r.json()).catch(()=>null),
    ]);
    const stdArr = freshStd ? Object.values(freshStd) : [...customOrders, ...soldOrders];
    const spArr = freshSp ? Object.values(freshSp) : crossOrderNos.map(n=>({orderNo:n}));
    const crossList = [...stdArr, ...spArr].filter(o=>o && o.id !== editingOrder?.id);
    const ledgerKeys = freshSeq ? Object.keys(freshSeq) : Object.keys(orderSeq);

    // Αν το Ν/Π είναι αυτόματη πρόταση (νέα παραγγελία): πρόταση τώρα, κλείδωμα πριν την αποθήκευση
    let orderNoNorm = normOrderNoStr(customForm.orderNo);
    let claimedAuto = false;
    const isAutoNew = orderNoAuto && !editingOrder && !groupInfo;
    if (groupInfo) {
      orderNoNorm = groupInfo.orderNo;
    } else if (orderNoAuto && !editingOrder) {
      orderNoNorm = suggestNextOrderNo(crossList.map(o=>o.orderNo), ledgerKeys);
    }
    if (!orderNoNorm) { notify("Προσοχή","Το Νούμερο Παραγγελίας είναι υποχρεωτικό."); return false; }

    // Σε ομάδα ο αριθμός με παύλα είναι μοναδικός εκ κατασκευής → δεν ελέγχουμε διπλότυπο.
    if (!groupInfo) {
      const dupExists = crossList.some(o => normOrderNoStr(o.orderNo) === orderNoNorm);
      if (dupExists) {
        const base = orderNoNorm;
        const suggested = computeSuggested(base, crossList, editingOrder?.id);
        setDupModal({
          visible: true, base, suggested,
          onUse: () => { setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:suggested})); },
          onKeep: () => { setDupModal(m=>({...m,visible:false})); },
          onCancel: () => { setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:''})); }
        });
        return false;
      }
    }

    // Πωλητής: δεν δημιουργεί πελάτες — πρέπει να επιλέξει δικό του καταχωρημένο πελάτη.
    if (isSeller && !selectedCustomer) {
      if (Platform.OS === 'web') window.alert('Διάλεξε έναν από τους πελάτες σου από τη λίστα. Νέοι πελάτες καταχωρούνται μόνο από το προσωπικό.');
      else Alert.alert('Επιλογή πελάτη', 'Διάλεξε έναν από τους πελάτες σου από τη λίστα. Νέοι πελάτες καταχωρούνται μόνο από το προσωπικό.');
      return false;
    }

    // Έλεγχος αν ο πελάτης είναι καταχωρημένος
    if (customForm.customer && !selectedCustomer) {
      const exists = (customers||[]).some(c=>c.name?.toLowerCase()===customForm.customer.trim().toLowerCase());
      if (!exists) {
        const doRegister = () => {
          if (onRequestAddCustomer) {
            onRequestAddCustomer(customForm.customer.trim(), (newCustomer)=>{
              setSelectedCustomer(newCustomer);
              setCustomerSearch(newCustomer.name);
              setCustomForm(f=>({...f, customer:newCustomer.name, customerId:newCustomer.id}));
            });
          }
        };
        const clearCustomer = () => { setCustomerSearch(''); setCustomForm(f=>({...f,customer:''})); };
        if (Platform.OS === 'web') {
          // Στο web το Alert.alert με κουμπιά δεν εμφανίζεται — χρησιμοποιούμε window.confirm
          if (window.confirm(`Ο πελάτης "${customForm.customer.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`)) doRegister();
          else clearCustomer();
        } else {
          Alert.alert(
            "Πελάτης δεν βρέθηκε",
            `Ο πελάτης "${customForm.customer.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`,
            [
              { text:"ΟΧΙ", style:"destructive", onPress:clearCustomer },
              { text:"ΝΑΙ", onPress:doRegister }
            ]
          );
        }
        return false;
      }
    }
    // Κλείδωμα του αυτόματου νούμερου στην τελευταία στιγμή (αφού πέρασαν όλοι οι έλεγχοι) → χωρίς κενά από ακυρώσεις.
    if (isAutoNew) {
      try { orderNoNorm = await claimSeqNumber(orderNoNorm); claimedAuto = true; }
      catch { notify("Σφάλμα","Δεν κλειδώθηκε αριθμός παραγγελίας. Δοκίμασε ξανά."); return false; }
    }

    const isDipli = customForm.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ';
    const isMoni = (customForm.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!customForm.sasiType);
    const hasLock = !!customForm.lock;
    const isMoniWithLock = isMoni && hasLock;
    const hasStaveraForm = !!(customForm.stavera && customForm.stavera.some(s=>s.dim));
    const hasMontageForm = customForm.installation === 'ΝΑΙ';
    const hasHeightReductionForm = !!customForm.heightReduction;
    const hasKypri = customForm.kypri === 'ΝΑΙ';
    const coatsForm = (customForm.coatings||[]).filter(c=>c&&String(c).trim());
    const hasCoatings = coatsForm.length > 0;
    const isOversize = isMoni && (String(customForm.h)==='223' || String(customForm.w)==='83');

    const needsBuild = isDipli || isMoniWithLock || hasKypri ||
      (isMoni && (hasStaveraForm || hasMontageForm || hasHeightReductionForm || isOversize || hasCoatings));

    const sasiNeedsProduction = isMoni && (isMoniWithLock || hasHeightReductionForm);
    const buildTasks = needsBuild ? {
      ...(hasStaveraForm ? {stavera: false} : {}),
      ...(hasLock ? {lock: false} : {}),
      ...(hasHeightReductionForm ? {heightReduction: false} : {}),
      ...(hasKypri ? {kypri: false, case: false} : {}),
      ...(hasMontageForm ? {montage: false} : {}),
      ...(isOversize ? {oversize: false} : (sasiNeedsProduction || isDipli ? {sasi: false} : {})),
      ...Object.fromEntries(coatsForm.map((_, i) => [`epend${i}`, false])),
    } : null;

    const newOrder = {...customForm, orderNo: orderNoNorm, orderType:'ΤΥΠΟΠΟΙΗΜΕΝΗ',
      id: customForm._forceId || (editingOrder ? editingOrder.id : Date.now().toString()),
      createdAt: editingOrder ? editingOrder.createdAt : (customForm.createdAt || Date.now()),
      enteredBy: customForm.enteredBy || currentUserName,
      status: needsBuild ? 'STD_BUILD' : 'STD_PENDING',
      ...(needsBuild ? {buildTasks} : {}),
      ...(groupInfo ? { groupId: groupInfo.groupId, groupSeq: groupInfo.groupSeq } : {}),
    };
    const _cat = await loadCatalog();
    newOrder.priceList = withTail(applyAutoPriceLines(dropStaleStav(dropStaleStavCol(newOrder.priceList), stavRuleNames(_cat)), await buildAutoLines(newOrder, _cat)), newOrder);
    newOrder.priceTotal = priceFinalTotal(newOrder.priceList, newOrder.priceDiscount);
    newOrder.priceLog = appendPriceLog(newOrder.priceLog, newOrder.priceTotal, (newOrder.priceList||[]).length>0);
    sanitizeCoatingFields(newOrder);
    delete newOrder.isQuote; delete newOrder.quotedAt; delete newOrder._forceId;
    newOrder.seller = findCustomerOf(newOrder)?.seller || '';
    lastSavedNoRef.current = newOrder.orderNo;
    lastSavedTotalRef.current = newOrder.priceTotal;
    setCustomOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
    await syncToCloud(newOrder);
    if (!editingOrder) {
      const seqKey = groupInfo ? groupInfo.base : orderNoNorm;
      setOrderSeq(prev => ({ ...prev, [seqKey]: 1 }));
      if (!claimedAuto) { try { await fetch(`${FIREBASE_URL}/order_seq.json`, { method:'PATCH', body: JSON.stringify({ [seqKey]: 1 }) }); } catch {} }
    }
    await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', editingOrder ? 'Επεξεργασία παραγγελίας' : 'Νέα παραγγελία', { orderNo: newOrder.orderNo, customer: newOrder.customer, size: `${newOrder.h}x${newOrder.w}`, qty: newOrder.qty });

    // ── Δέσμευση στοκ — sync για νέες & επεξεργασία (όχι όσο είναι σε αναμονή) ──
    if (setSasiStock && setCaseStock && !newOrder.onHold) {
      const orderQtyR = parseInt(newOrder.qty)||1;
      const sk = sasiKey(String(newOrder.h), String(newOrder.w), newOrder.side);
      const ck = caseKey(String(newOrder.h), String(newOrder.w), newOrder.side, newOrder.caseType);
      // Επεξεργασία χωρίς αλλαγή διαστάσεων: κρατάμε θέση + σημαδάκια (δεσμευμένη/δανεισμένη κάσα).
      const keepPrev = (map, oldKey, newKey) => {
        if (!editingOrder || oldKey !== newKey) return null;
        const arr = (map?.[oldKey]?.reservations) || [];
        const idx = arr.findIndex(r => sameOrderNo(r.orderNo, editingOrder.orderNo));
        if (idx < 0) return null;
        const { orderNo, customer, qty, deferUntil, ...flags } = arr[idx];
        return { idx, flags };
      };
      const oldSk = editingOrder ? sasiKey(String(editingOrder.h), String(editingOrder.w), editingOrder.side) : null;
      const oldCk = editingOrder ? caseKey(String(editingOrder.h), String(editingOrder.w), editingOrder.side, editingOrder.caseType) : null;
      const prevSasi = keepPrev(sasiStock, oldSk, sk);
      const prevCase = keepPrev(caseStock, oldCk, ck);

      if (editingOrder) {
        const oldIsMoni = (editingOrder.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!editingOrder.sasiType);
        await removeStockReservation(editingOrder.orderNo, editingOrder.h, editingOrder.w, editingOrder.side, editingOrder.caseType, oldIsMoni);
      }
      const _deferUntil = computeDeferUntil(newOrder);
      const newRes = { orderNo: newOrder.orderNo, customer: newOrder.customer||'', qty: orderQtyR, ...(_deferUntil ? { deferUntil: _deferUntil } : {}) };

      const reserveSasi = isMoni && !isMoniWithLock && !hasHeightReductionForm;
      const reserveCase = !hasKypri;

      const fetchBase = async (path, fallback) => {
        if (!editingOrder) return fallback;
        try { return (await (await fetch(`${FIREBASE_URL}${path}`)).json()) || fallback; }
        catch { return fallback; }
      };
      const withRes = (baseArr, prev) => {
        const filtered = (baseArr||[]).filter(r=>!sameOrderNo(r.orderNo, newOrder.orderNo));
        const res = prev ? { ...newRes, ...prev.flags } : newRes;
        if (prev && prev.idx>=0 && prev.idx<=filtered.length) { const out=[...filtered]; out.splice(prev.idx, 0, res); return out; }
        return [...filtered, res];
      };

      if (reserveSasi) {
        const base = await fetchBase(`/sasi_stock/${sk}.json`, sasiStock[sk] || { qty: 0, reservations: [] });
        const upd = { ...base, reservations: withRes(base.reservations, prevSasi) };
        setSasiStock(prev=>({...prev, [sk]: upd}));
        await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`,{method:'PUT',body:JSON.stringify(upd)});
      }

      if (reserveCase) {
        const caseFallback = { qty: 0, reservations: [], caseType: (newOrder.caseType||'').includes('ΑΝΟΙΧΤΟΥ')?'ΚΑΣΑ ΑΝΟΙΧΤΗ':'ΚΑΣΑ ΚΛΕΙΣΤΗ' };
        const baseCase = await fetchBase(`/case_stock/${ck}.json`, caseStock[ck] || caseFallback);
        const updCase = { ...baseCase, reservations: withRes(baseCase.reservations, prevCase) };
        setCaseStock(prev=>({...prev, [ck]: updCase}));
        await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`,{method:'PUT',body:JSON.stringify(updCase)});
      }
    }

    if (intermediate) return true; // ενδιάμεση πόρτα ομάδας — ο caller καθαρίζει κρατώντας τον πελάτη

    resetForm();

    if (!editingOrder) {
      setNotifyModal({ visible:true, order:newOrder });
    } else if (Platform.OS === 'web') {
      window.alert('✅ Η παραγγελία αποθηκεύτηκε!');
    } else {
      Alert.alert("VAICON", "Η παραγγελία αποθηκεύτηκε!");
    }
    return true;
  };

  // ── Ομάδα πορτών: «Προσθήκη νέας πόρτας» (αποθηκεύει & ετοιμάζει την επόμενη) ──
  const addAnotherDoor = async (overrides = null) => {
    if (isGuest) return;
    const form = overrides ? { ...customForm, ...overrides } : customForm;
    if (!form.h || !form.w) return notify('Προσοχή', 'Βάλτε Ύψος και Πλάτος.');
    let gs = groupState;
    if (!gs) {
      const base = isSeller ? '' : normOrderNoStr(form.orderNo);
      if (!isSeller && !base) return notify('Προσοχή', 'Το Νούμερο Παραγγελίας είναι υποχρεωτικό.');
      gs = { base, count: 0, groupId: `g${Date.now()}` };
      setOrderNoAuto(false);
    }
    const seq = gs.count + 1;
    const orderNo = isSeller ? '' : groupOrderNo(gs.base, seq);
    const ov = holdMode ? { ...(overrides||{}), onHold: true } : overrides;
    const ok = await saveOrder(ov, { orderNo, base: gs.base, groupId: gs.groupId, groupSeq: seq, final: false });
    if (!ok) return; // διακόπηκε από modal (π.χ. πελάτης) — ο χρήστης ξαναπατάει
    const next = { ...gs, count: seq };
    setGroupState(next);
    setCustomForm(f => ({ ...INIT_FORM, customer: f.customer, customerId: f.customerId, orderNo: isSeller ? '' : groupOrderNo(next.base, next.count + 1) }));
    notify('➕ Πόρτα αποθηκεύτηκε', isSeller
      ? 'Συμπλήρωσε την επόμενη πόρτα ή πάτησε «Αποθήκευση» για να ολοκληρώσεις.'
      : `Αποθηκεύτηκε ${orderNo}. Συμπλήρωσε την επόμενη πόρτα.`);
  };

  // Τελική αποθήκευση: αν είμαστε σε ομάδα, η τελευταία πόρτα παίρνει την επόμενη παύλα.
  const doFinalSave = (overrides = null) => {
    const ov = holdMode ? { ...(overrides||{}), onHold: true } : overrides;
    if (groupState) {
      const seq = groupState.count + 1;
      const orderNo = isSeller ? '' : groupOrderNo(groupState.base, seq);
      return saveOrder(ov, { orderNo, base: groupState.base, groupId: groupState.groupId, groupSeq: seq, final: true });
    }
    return saveOrder(ov);
  };

  // ════════════ ΠΡΟΣΦΟΡΕΣ ════════════
  // Προσφορά = ίδια δομή με παραγγελία, χωρίς αριθμό/στοκ/στάδια. Φυλάσσεται στο std_quotes.
  const quoteDays = (q) => { const ts = q.quotedAt || q.createdAt; return ts ? Math.max(0, Math.floor((Date.now() - ts) / 86400000)) : 0; };
  const quoteDaysLabel = (q) => { const d = quoteDays(q); return d === 0 ? 'σήμερα' : d === 1 ? '1 ημέρα' : `${d} ημέρες`; };

  const saveQuoteWith = async (form, groupInfo = null) => {
    if (isGuest && !isSeller) return false;
    if (!form.h || !form.w) { notify('Προσοχή', 'Βάλτε Ύψος και Πλάτος.'); return false; }
    const intermediate = groupInfo && !groupInfo.final;

    // ── ΠΩΛΗΤΗΣ: υποβολή προσφοράς προς έγκριση (διόρθωση μετά από απόρριψη όπως οι παραγγελίες) ──
    if (isSeller) {
      if (!selectedCustomer) { notify('Επιλογή πελάτη', 'Διάλεξε έναν από τους πελάτες σου από τη λίστα.'); return false; }
      const submissionId = editingOrder?._submissionId || formSubIdRef.current || Date.now().toString();
      const gId = groupInfo?.groupId || form.groupId;
      const gSeq = groupInfo?.groupSeq ?? form.groupSeq;
      const dc = await countDocs(submissionId);
      const submission = {
        ...form, orderNo: '', orderType: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', isQuote: true,
        submittedBy: sellerKey, submittedAt: Date.now(), status: 'PENDING',
        createdAt: form.createdAt || Date.now(),
        ...(gId ? { groupId: gId, groupSeq: gSeq } : {}),
      };
      delete submission._submissionId; delete submission._sid;
      delete submission.rejectNote; delete submission.rejectedBy; delete submission.rejectedAt;
      sanitizeCoatingFields(submission);
      if (dc) submission.docCount = dc; else delete submission.docCount;
      if (editingOrder?._submissionId) {
        const cur = await fetch(`${FIREBASE_URL}/seller_submissions/${submissionId}.json`).then(r=>r.json()).catch(()=>undefined);
        if (cur === undefined) { notify('Σφάλμα','Δεν έγινε έλεγχος κατάστασης. Δοκίμασε ξανά.'); return false; }
        if (cur && cur.status !== 'PENDING' && cur.status !== 'REJECTED') {
          notify('Δεν γίνεται διόρθωση','Η προσφορά εγκρίθηκε ήδη από το γραφείο. Επικοινώνησε με το γραφείο για αλλαγές.');
          return false;
        }
      }
      try {
        const r = await fetch(`${FIREBASE_URL}/seller_submissions/${submissionId}.json`, { method: 'PUT', body: JSON.stringify(submission) });
        if (!r.ok) throw new Error();
      } catch { notify('Σφάλμα', 'Η υποβολή δεν στάλθηκε. Δοκίμασε ξανά.'); return false; }
      if (intermediate) { formSubIdRef.current = null; return true; }
      resetForm();
      notify('✅ Υποβλήθηκε', 'Η προσφορά υποβλήθηκε για έγκριση από το γραφείο.');
      return true;
    }

    // Έλεγχος καταχωρημένου πελάτη (ίδιος με παραγγελία)
    if (form.customer && !selectedCustomer) {
      const exists = (customers || []).some(c => c.name?.toLowerCase() === form.customer.trim().toLowerCase());
      if (!exists) {
        const doRegister = () => { if (onRequestAddCustomer) onRequestAddCustomer(form.customer.trim(), (nc) => { setSelectedCustomer(nc); setCustomerSearch(nc.name); setCustomForm(f => ({ ...f, customer: nc.name, customerId: nc.id })); }); };
        const clearCustomer = () => { setCustomerSearch(''); setCustomForm(f => ({ ...f, customer: '' })); };
        if (Platform.OS === 'web') { if (window.confirm(`Ο πελάτης "${form.customer.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`)) doRegister(); else clearCustomer(); }
        else Alert.alert('Πελάτης δεν βρέθηκε', `Ο πελάτης "${form.customer.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`, [{ text: 'ΟΧΙ', style: 'destructive', onPress: clearCustomer }, { text: 'ΝΑΙ', onPress: doRegister }]);
        return false;
      }
    }

    const quote = {
      ...form, orderNo: '', orderType: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', isQuote: true, status: 'QUOTE',
      id: editingQuote ? editingQuote.id : Date.now().toString() + (groupInfo ? `_${groupInfo.groupSeq}` : ''),
      createdAt: editingQuote ? (editingQuote.createdAt || Date.now()) : Date.now(),
      quotedAt: editingQuote ? (editingQuote.quotedAt || editingQuote.createdAt || Date.now()) : Date.now(),
      enteredBy: editingQuote ? (editingQuote.enteredBy || form.enteredBy || currentUserName) : (form.enteredBy || currentUserName),
      ...(editingQuote?.docCount ? { docCount: editingQuote.docCount } : {}),
      ...(groupInfo ? { groupId: groupInfo.groupId, groupSeq: groupInfo.groupSeq }
          : (editingQuote?.groupId ? { groupId: editingQuote.groupId, groupSeq: editingQuote.groupSeq } : {})),
    };
    quote.priceTotal = priceFinalTotal(quote.priceList, quote.priceDiscount);
    quote.priceLog = appendPriceLog(quote.priceLog, quote.priceTotal, (quote.priceList || []).length > 0);
    sanitizeCoatingFields(quote);
    quote.seller = findCustomerOf(quote)?.seller || '';
    try {
      const r = await fetch(`${FIREBASE_URL}/std_quotes/${quote.id}.json`, { method: 'PUT', body: JSON.stringify(quote) });
      if (!r.ok) throw new Error();
    } catch { notify('Σφάλμα', 'Η προσφορά δεν αποθηκεύτηκε στο Cloud.'); return false; }
    setQuotes(prev => [quote, ...prev.filter(q => q.id !== quote.id)]);
    if (intermediate) return true;
    resetForm();
    notify('✅ Προσφορά', 'Η προσφορά καταχωρήθηκε.');
    return true;
  };
  const saveQuote = (overrides = null, groupInfo = null) => saveQuoteWith(overrides ? { ...customForm, ...overrides } : customForm, groupInfo);

  const addAnotherDoorQuote = async (overrides = null) => {
    const form = overrides ? { ...customForm, ...overrides } : customForm;
    if (!form.h || !form.w) return notify('Προσοχή', 'Βάλτε Ύψος και Πλάτος.');
    let gq = quoteGroup || { count: 0, groupId: `q${Date.now()}` };
    const seq = gq.count + 1;
    const ok = await saveQuote(overrides, { groupId: gq.groupId, groupSeq: seq, final: false });
    if (!ok) return;
    setQuoteGroup({ ...gq, count: seq });
    setCustomForm(f => ({ ...INIT_FORM, customer: f.customer, customerId: f.customerId }));
    notify('➕ Πόρτα προσφοράς', 'Συμπλήρωσε την επόμενη πόρτα ή πάτησε «Καταχώρηση προσφοράς».');
  };
  const doFinalSaveQuote = async (overrides = null) => {
    if (quoteGroup) {
      const seq = quoteGroup.count + 1;
      const ok = await saveQuote(overrides, { groupId: quoteGroup.groupId, groupSeq: seq, final: true });
      if (ok) setQuoteGroup(null);
      return ok;
    }
    return saveQuote(overrides);
  };

  // Μετατροπή προσφοράς → παραγγελία (μόνο προσωπικό). Παίρνει αριθμό, υπολογίζει στάδια, δεσμεύει στοκ.
  const nextNumberFresh = async () => {
    const [std, sp, seq] = await Promise.all([
      fetch(`${FIREBASE_URL}/std_orders.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/special_orders.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/order_seq.json`).then(r => r.json()).catch(() => null),
    ]);
    const cross = [...Object.values(std || {}), ...Object.values(sp || {})];
    return suggestNextOrderNo(cross.map(o => o.orderNo), Object.keys(seq || {}));
  };
  const persistConvertedDoor = async (q, number, groupMeta) => {
    const tasks = buildTasksForMoniStdOrder(q);
    const { isQuote, quotedAt, status: _st, _qid, ...rest } = q;
    const order = {
      ...rest, id: q.id, orderNo: number, orderType: 'ΤΥΠΟΠΟΙΗΜΕΝΗ',
      status: tasks ? 'STD_BUILD' : 'STD_PENDING', ...(tasks ? { buildTasks: tasks } : {}),
      createdAt: q.createdAt || Date.now(), enteredBy: q.enteredBy || currentUserName,
      ...(groupMeta ? { groupId: groupMeta.groupId, groupSeq: groupMeta.groupSeq } : { groupId: undefined, groupSeq: undefined }),
    };
    if (!groupMeta) { delete order.groupId; delete order.groupSeq; }
    order.priceTotal = priceFinalTotal(order.priceList, order.priceDiscount);
    order.seller = findCustomerOf(order)?.seller || order.seller || '';
    const r = await fetch(`${FIREBASE_URL}/std_orders/${order.id}.json`, { method: 'PUT', body: JSON.stringify(order) });
    if (!r.ok) throw new Error();
    setCustomOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
    const isMoni = order.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !order.sasiType;
    const qtyR = parseInt(order.qty) || 1;
    const _defU = computeDeferUntil(order);
    const newRes = { orderNo: number, customer: order.customer || '', qty: qtyR, ...(_defU ? { deferUntil: _defU } : {}) };
    if (isMoni && !order.lock && !order.heightReduction) {
      const sk = sasiKey(String(order.h), String(order.w), order.side);
      const base = (await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`).then(x => x.json()).catch(() => null)) || { qty: 0, reservations: [] };
      const upd = { ...base, reservations: [...(base.reservations || []).filter(x => x.orderNo !== number), newRes] };
      setSasiStock(prev => ({ ...prev, [sk]: upd }));
      await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`, { method: 'PUT', body: JSON.stringify(upd) }).catch(() => {});
    }
    if (order.kypri !== 'ΝΑΙ') {
      const ck = caseKey(String(order.h), String(order.w), order.side, order.caseType);
      const fb = { qty: 0, reservations: [], caseType: (order.caseType || '').includes('ΑΝΟΙΧΤΟΥ') ? 'ΚΑΣΑ ΑΝΟΙΧΤΗ' : 'ΚΑΣΑ ΚΛΕΙΣΤΗ' };
      const base = (await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`).then(x => x.json()).catch(() => null)) || fb;
      const upd = { ...base, reservations: [...(base.reservations || []).filter(x => x.orderNo !== number), newRes] };
      setCaseStock(prev => ({ ...prev, [ck]: upd }));
      await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`, { method: 'PUT', body: JSON.stringify(upd) }).catch(() => {});
    }
    await fetch(`${FIREBASE_URL}/std_quotes/${q.id}.json`, { method: 'DELETE' }).catch(() => {});
    setQuotes(prev => prev.filter(x => x.id !== q.id));
  };
  const convertQuoteToOrder = async (q) => {
    if (isSeller) return;
    const doors = q.groupId ? quotes.filter(x => x.groupId === q.groupId).sort((a, b) => (a.groupSeq || 0) - (b.groupSeq || 0)) : [q];
    const msg = doors.length > 1 ? `Μετατροπή προσφοράς σε παραγγελία; (${doors.length} πόρτες)` : 'Μετατροπή προσφοράς σε παραγγελία;';
    if (Platform.OS === 'web') { if (!window.confirm(msg)) return; }
    try {
      const base = await claimSeqNumber(await nextNumberFresh());
      if (doors.length > 1) {
        const gId = `g${Date.now()}`;
        let i = 1;
        for (const d of doors) { await persistConvertedDoor(d, groupOrderNo(base, i), { groupId: gId, groupSeq: i }); i++; }
      } else {
        await persistConvertedDoor(doors[0], base, null);
      }
      await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Μετατροπή προσφοράς σε παραγγελία', { orderNo: base, customer: q.customer || '' });
      notify('✅ Έγινε', `Η προσφορά μετατράπηκε σε παραγγελία #${base}.`);
    } catch { notify('Σφάλμα', 'Η μετατροπή απέτυχε. Δοκίμασε ξανά.'); }
  };
  const deleteQuote = (q) => {
    if (isSeller) return;
    const doors = q.groupId ? quotes.filter(x => x.groupId === q.groupId) : [q];
    const doDel = async () => {
      for (const d of doors) {
        const r = await fetch(`${FIREBASE_URL}/std_quotes/${d.id}.json`, { method: 'DELETE' });
        if (!r.ok) {
          Alert.alert('Σφάλμα', 'Η διαγραφή ΔΕΝ έγινε στη βάση.\nΗ εγγραφή θα ξαναεμφανιστεί όταν κλείσεις το πρόγραμμα.\n(Πιθανό πρόβλημα δικαιωμάτων — std_quotes στο Firebase.)');
          return;
        }
      }
      setQuotes(prev => prev.filter(x => q.groupId ? x.groupId !== q.groupId : x.id !== q.id));
    };
    if (Platform.OS === 'web') { if (window.confirm(doors.length > 1 ? `Διαγραφή προσφοράς (${doors.length} πόρτες);` : 'Διαγραφή προσφοράς;')) doDel(); }
    else Alert.alert('Διαγραφή', 'Διαγραφή προσφοράς;', [{ text: 'Όχι' }, { text: 'Ναι', style: 'destructive', onPress: doDel }]);
  };
  const editQuote = (q) => {
    if (isSeller || isForeman) return;
    const { id, isQuote, status, createdAt, quotedAt, groupId, groupSeq, approvedBy, approvedAt, docCount, ...formData } = q;
    setOrderNoAuto(false);
    setCustomForm({ ...INIT_FORM, ...formData, orderNo: '', kypri: q.kypri || 'ΟΧΙ', placement: q.placement || 'ΟΧΙ', coatingDetails: q.coatingDetails || {} });
    const c = q.customerId ? (customers || []).find(x => x.id === q.customerId) : (customers || []).find(x => x.name === q.customer);
    setSelectedCustomer(c || (q.customer ? { name: q.customer, id: q.customerId } : null));
    setCustomerSearch(q.customer || '');
    setEditingOrder(null);
    setEditingQuote(q);
    if (setTabIndex) setTabIndex(0); // ΚΑΤΑΧΩΡΗΣΗ tab
  };
  const savePriceListQuote = async (q, items, discount, note = '') => {
    const priceTotal = priceFinalTotal(items, discount);
    const priceLog = appendPriceLog(q.priceLog, priceTotal, (items || []).length > 0);
    const upd = { ...q, priceList: items, priceDiscount: discount, priceTotal, priceLog, priceNote: note };
    setQuotes(prev => prev.map(x => x.id === q.id ? upd : x));
    try { await fetch(`${FIREBASE_URL}/std_quotes/${q.id}.json`, { method: 'PATCH', body: JSON.stringify({ priceList: items, priceDiscount: discount, priceTotal, priceLog, priceNote: note }) }); } catch {}
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

  // ── «Σε αναμονή»: εναλλαγή κατάστασης ──
  // Δέσμευση στοκ για παραγγελία (χρησιμοποιείται στην ενεργοποίηση από την αναμονή).
  const reserveStockFor = async (o) => {
    if (!setSasiStock || !setCaseStock) return;
    const isMoni = (o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType);
    const reserveSasi = isMoni && !(isMoni && !!o.lock) && !o.heightReduction;
    const reserveCase = o.kypri !== 'ΝΑΙ';
    const sk = sasiKey(String(o.h), String(o.w), o.side);
    const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
    const _deferUntil = computeDeferUntil(o);
    const newRes = { orderNo: o.orderNo, customer: o.customer||'', qty: parseInt(o.qty)||1, ...(_deferUntil ? { deferUntil: _deferUntil } : {}) };
    const withRes = (arr) => [...(arr||[]).filter(r=>!sameOrderNo(r.orderNo, o.orderNo)), newRes];
    if (reserveSasi) {
      let base; try { base = (await (await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`)).json()) || (sasiStock[sk]||{qty:0,reservations:[]}); } catch { base = sasiStock[sk]||{qty:0,reservations:[]}; }
      const upd = { ...base, reservations: withRes(base.reservations) };
      setSasiStock(prev=>({...prev, [sk]: upd}));
      await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`,{method:'PUT',body:JSON.stringify(upd)});
    }
    if (reserveCase) {
      const caseFallback = { qty:0, reservations:[], caseType:(o.caseType||'').includes('ΑΝΟΙΧΤΟΥ')?'ΚΑΣΑ ΑΝΟΙΧΤΗ':'ΚΑΣΑ ΚΛΕΙΣΤΗ' };
      let base; try { base = (await (await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`)).json()) || (caseStock[ck]||caseFallback); } catch { base = caseStock[ck]||caseFallback; }
      const upd = { ...base, reservations: withRes(base.reservations) };
      setCaseStock(prev=>({...prev, [ck]: upd}));
      await fetch(`${FIREBASE_URL}/case_stock/${ck}.json`,{method:'PUT',body:JSON.stringify(upd)});
    }
  };

  // Ενεργή παραγγελία → σε αναμονή: ελευθερώνει στοκ και κρύβει από όλο το σύστημα.
  const sendToHold = async (order) => {
    if (!canHold) return;
    if (order.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ') {
      const isMoni = (order.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!order.sasiType) && !order.lock;
      await removeStockReservation(order.orderNo, order.h, order.w, order.side, order.caseType, isMoni);
    }
    const upd = { ...order, onHold: true };
    setCustomOrders(prev => prev.map(o=>o.id===order.id?upd:o));
    await syncToCloud(upd);
  };

  // Σε αναμονή → ενεργή: ξαναδεσμεύει στοκ και μπαίνει κανονικά στη ροή.
  const activateHold = async (order) => {
    if (!canHold) return;
    const upd = { ...order }; delete upd.onHold;
    setCustomOrders(prev => prev.map(o=>o.id===order.id?upd:o));
    await syncToCloud(upd);
    await reserveStockFor(upd);
  };

  const toggleHoldBasket = (id) => setHoldBasket(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  // «ΝΑ ΠΡΟΧΩΡΗΣΕΙ»: επιβεβαίωση → ενεργοποίηση όλων των επιλεγμένων μαζί.
  const applyHoldBasket = () => {
    if (!holdBasket.length) return;
    setConfirmModal({
      visible: true,
      title: 'Επιβεβαίωση',
      message: `Να μπουν κανονικά στη διαδικασία ${holdBasket.length} ${holdBasket.length===1?'παραγγελία':'παραγγελίες'}; Θα δεσμεύσουν κάσα/σασί και θα πάνε όπου ανήκουν.`,
      confirmText: 'ΝΑΙ, ΝΑ ΠΡΟΧΩΡΗΣΕΙ',
      onConfirm: async () => { const ids=[...holdBasket]; setHoldBasket([]); for (const id of ids) { const ord = customOrders.find(o=>o.id===id); if (ord) await activateHold(ord); } },
      onCancel: null,
    });
  };

  const toggleHoldOutBasket = (id) => setHoldOutBasket(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  // «ΝΑ ΜΠΟΥΝ ΣΕ ΑΝΑΜΟΝΗ»: επιβεβαίωση → αποστολή όλων των επιλεγμένων σε αναμονή.
  const applyHoldOutBasket = () => {
    if (!holdOutBasket.length) return;
    setConfirmModal({
      visible: true,
      title: 'Επιβεβαίωση',
      message: `Να μπουν ΣΕ ΑΝΑΜΟΝΗ ${holdOutBasket.length} ${holdOutBasket.length===1?'παραγγελία':'παραγγελίες'}; Θα χάσουν τη σειρά τους και θα ελευθερώσουν κάσα/σασί.`,
      confirmText: 'ΝΑΙ, ΣΕ ΑΝΑΜΟΝΗ',
      onConfirm: async () => { const ids=[...holdOutBasket]; setHoldOutBasket([]); for (const id of ids) { const ord = customOrders.find(o=>o.id===id); if (ord) await sendToHold(ord); } },
      onCancel: null,
    });
  };

  // Έχει ξεκινήσει παραγωγή (ολοκληρωμένες φάσεις/tasks) → δεν επιτρέπεται να μπει σε αναμονή.
  const orderInProduction = (o) =>
    (o.buildTasks && Object.values(o.buildTasks).some(v => v === true)) ||
    (o.moniPhases && Object.values(o.moniPhases).some(p => p?.done)) ||
    (o.dipliPhases && Object.values(o.dipliPhases).some(p => p?.done));

  const editOrder = (order) => {
    if (isGuest || isForeman) return;
    setOrderNoAuto(false);
    setCustomForm({...order, kypri: order.kypri || 'ΟΧΙ', placement: order.placement || 'ΟΧΙ', coatingDetails: order.coatingDetails || {}});
    setCustomerSearch(order.customer||'');
    setEditingOrder(order);
    // ΔΕΝ αφαιρούμε από τη λίστα ούτε από το Firebase εδώ —
    // η παραγγελία αφαιρείται μόνο κατά την αποθήκευση (saveOrder)
  };

  // Μεταφορά PENDING → PROD: αρχικοποιεί τις φάσεις παραγωγής
  const moveToProd = async (id) => {
    if (isGuest) return;
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
    if (isGuest) return;
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

  const applyStdSale = async (order, sellQty) => {
    if (isGuest || !order) return;
    const now=Date.now();
    const totalQty=parseInt(order.qty)||1;
    const qty=Math.max(1,Math.min(parseInt(sellQty)||0,totalQty));
    const partial=qty<totalQty;
    const isMoni=(order.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!order.sasiType)&&!order.lock;
    const adjustStock=async(stockMap,setStock,key,path)=>{
      const entry=stockMap?.[key]; if(!entry) return;
      const wasOld=(entry.reservations||[]).some(r=>r.orderNo===order.orderNo && r.oldCovered);
      const newQty=wasOld?(parseInt(entry.qty)||0):Math.max(0,(parseInt(entry.qty)||0)-qty);
      const reservations=partial
        ? (entry.reservations||[]).map(r=>r.orderNo===order.orderNo?{...r,qty:totalQty-qty}:r)
        : (entry.reservations||[]).filter(r=>r.orderNo!==order.orderNo);
      const upd={...entry,qty:newQty,reservations};
      setStock(prev=>({...prev,[key]:upd}));
      await fetch(`${FIREBASE_URL}/${path}/${key}.json`,{method:'PUT',body:JSON.stringify(upd)});
    };
    const soldEntry={...order,id:partial?Date.now().toString():order.id,qty:String(qty),status:'STD_SOLD',soldAt:now,...(partial?{partialNote:`${qty} από ${totalQty}`}:{})};
    if (partial) {
      const remaining={...order,qty:String(totalQty-qty),remainingNote:`Υπόλοιπο: ${totalQty-qty} από ${totalQty}`};
      setSoldOrders(prev=>[soldEntry,...prev]);
      setCustomOrders(prev=>prev.map(o=>o.id===order.id?remaining:o));
      await syncToCloud(remaining);
    } else {
      setCustomOrders(prev=>prev.filter(o=>o.id!==order.id));
      setSoldOrders(prev=>[soldEntry,...prev]);
    }
    await syncToCloud(soldEntry);
    if (isMoni) await adjustStock(sasiStock,setSasiStock,sasiKey(String(order.h),String(order.w),order.side),'sasi_stock');
    await adjustStock(caseStock,setCaseStock,caseKey(String(order.h),String(order.w),order.side,order.caseType),'case_stock');
    await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', partial?'Πώληση (μερική)':'Πώληση', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}`, qty: partial?`${qty}/${totalQty}`:String(qty) });
  };

  const handleSellConfirm = async (sellQty) => {
    const {orderId}=sellModal;
    setSellModal({visible:false,orderId:null,totalQty:1});
    await applyStdSale(customOrders.find(o=>o.id===orderId), sellQty);
  };

  // Μοίρασμα δέσμευσης στοκ κατά το σπάσιμο: μειώνει την αρχική, προσθέτει νέα γραμμή
  const splitStockReservation = async (path, key, oldNo, newNo, splitQty, remainNo=oldNo) => {
    const setStock = path==='sasi_stock' ? setSasiStock : setCaseStock;
    try {
      const data = await (await fetch(`${FIREBASE_URL}/${path}/${key}.json`)).json();
      if (!data || !Array.isArray(data.reservations)) return;
      const idx = data.reservations.findIndex(r=>r.orderNo===oldNo);
      if (idx<0) return;
      const orig = data.reservations[idx];
      const origQty = parseInt(orig.qty)||1;
      if (splitQty>=origQty) return;
      const reservations = [...data.reservations];
      reservations.splice(idx, 1, {...orig, orderNo:remainNo, qty:origQty-splitQty}, {...orig, orderNo:newNo, qty:splitQty});
      const upd = {...data, reservations};
      setStock(prev=>({...prev,[key]:upd}));
      await fetch(`${FIREBASE_URL}/${path}/${key}.json`,{method:'PUT',body:JSON.stringify(upd)});
    } catch(e){ console.error('split reservation', path, e); }
  };

  const splitOrder = async (order, peelQty) => {
    if (!order || isGuest || (!isAdmin && !isForeman)) return;
    const totalQty = parseInt(order.qty)||1;
    const qty = Math.max(1, Math.min(parseInt(peelQty)||0, totalQty-1));
    if (qty<1 || qty>=totalQty) return;
    const parentNo = String(order.orderNo);
    const base = splitBaseNo(order.orderNo);
    const gId = order.groupId || `g${base}`;
    const allNos = [...customOrders, ...soldOrders].map(o=>String(o.orderNo)).concat(Object.keys(orderSeq).map(String));
    // Επόμενο ελεύθερο «root-N» (μόνο ακέραια άμεσα παιδιά).
    const nextSiblingNo = (root) => {
      const pre = root + '-'; let mx = 0;
      for (const n of allNos) { if (n.startsWith(pre)) { const r = n.slice(pre.length); if (/^\d+$/.test(r)) { const v = parseInt(r,10); if (v>mx) mx=v; } } }
      return `${root}-${mx + 1}`;
    };
    // Η μάνα ΔΕΝ μετονομάζεται. Μονοκόμματη ρίζα (χωρίς παύλα) → παιδιά "root-0-N"
    // (το -0 δηλώνει αυτόνομη, χωρίς ομάδα). Πόρτα με παύλα → παιδιά "root-N".
    const motherNo = parentNo;
    const newNo = parentNo.includes('-') ? nextSiblingNo(parentNo) : nextSiblingNo(`${parentNo}-0`);
    // Αρχική ποσότητα: μπαίνει/διατηρείται ΜΟΝΟ στη μάνα (όχι στα σπασμένα).
    const motherOrig = order.origQty != null ? String(order.origQty) : String(totalQty);
    const clone = (v) => v ? JSON.parse(JSON.stringify(v)) : v;
    const remaining = {...order, orderNo: motherNo, qty:String(totalQty-qty), groupId:gId, origQty: motherOrig};
    const newOrder = {...order, id:`${Date.now()}_s`, orderNo:newNo, qty:String(qty), groupId:gId,
      buildTasks: order.buildTasks?{...order.buildTasks}:order.buildTasks,
      moniPhases: clone(order.moniPhases), dipliPhases: clone(order.dipliPhases),
      coatingDetails: clone(order.coatingDetails) };
    delete newOrder.splitTag;
    delete newOrder.origQty;
    newOrder.splitChild = true; // σπασμένο κομμάτι — δεν ξανασπάει (σπάει μόνο η αρχική/μάνα)
    const _cat = await loadCatalog();
    for (const o of [remaining, newOrder]) {
      o.priceList = withTail(applyAutoPriceLines(dropStaleStav(dropStaleStavCol(o.priceList), stavRuleNames(_cat)), await buildAutoLines(o, _cat)), o);
      o.priceTotal = priceFinalTotal(o.priceList, o.priceDiscount);
    }
    setCustomOrders(prev => [newOrder, ...prev.map(o=>o.id===order.id?remaining:o)]);
    await syncToCloud(remaining);
    await syncToCloud(newOrder);
    setOrderSeq(prev=>({...prev,[newNo]:1,[motherNo]:1}));
    try { await fetch(`${FIREBASE_URL}/order_seq.json`,{method:'PATCH',body:JSON.stringify({[newNo]:1,[motherNo]:1})}); } catch {}
    await splitStockReservation('sasi_stock', sasiKey(String(order.h),String(order.w),order.side), order.orderNo, newNo, qty, motherNo);
    await splitStockReservation('case_stock', caseKey(String(order.h),String(order.w),order.side,order.caseType), order.orderNo, newNo, qty, motherNo);
    await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ','Σπάσιμο παραγγελίας',{orderNo:order.orderNo,customer:order.customer,size:`${order.h}x${order.w}`,qty:`${totalQty-qty}+${qty}`});
  };

  const handleSplitConfirm = (peelQty) => {
    const o = splitModal.order;
    setSplitModal({visible:false,order:null});
    if (!o) return;
    const total = parseInt(o.qty)||1;
    const peel = Math.max(1, Math.min(parseInt(peelQty)||0, total-1));
    setConfirmModal({ visible:true, title:'✂️ Σπάσιμο παραγγελίας',
      message:`Η #${o.orderNo} θα χωριστεί σε ${total-peel} + ${peel} τεμάχια.\nΝα προχωρήσω;`,
      confirmText:'✂️ ΣΠΑΣΙΜΟ', onConfirm: ()=>splitOrder(o, peel) });
  };

  // Πλαίσιο τεμαχίων (>1): πατιέται για σπάσιμο (χεράκι στο web)
  const renderQtyBox = (o) => {
    const q = parseInt(o.qty)||1;
    const orig = o.origQty != null ? (parseInt(o.origQty)||0) : 0;
    const showOrig = orig > q; // μόνο στη μάνα (αρχική > τρέχουσα)
    if (q<=1 && !showOrig) return null;
    const canSplit = (isAdmin || (isForeman && !locked)) && q>1 && !o.splitChild;
    return (
      <TouchableOpacity disabled={!canSplit}
        onPress={canSplit?()=>setSplitModal({visible:true, order:o}):undefined}
        style={{flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#fff', borderWidth:1.5, borderColor:'#cc0000', borderRadius:6, paddingHorizontal:7, paddingVertical:1, ...(canSplit&&Platform.OS==='web'?{cursor:'pointer'}:{})}}>
        {showOrig && <Text style={{fontSize:10, fontWeight:'normal', color:'#000'}}>αρχ. {orig}</Text>}
        <Text style={{fontSize:15, fontWeight:'900', color:'#cc0000'}}>{q}τεμ</Text>
      </TouchableOpacity>
    );
  };

  const moveBack = async (id, cur) => {
    if (isGuest) return;
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
            <td style="font-size:20px;font-weight:900">${stavParts(s)||'—'}</td>
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
    if (isGuest) return;
    const order = customOrders.find(o=>o.id===orderId); if(!order||!order.phases) return;
    if (phaseKey==='montDoor' && !order.phases?.vafio?.done) {
      setConfirmModal({ visible:true, title:'⚠️ Προσοχή', message:'Το Βαφείο δεν έχει ολοκληρωθεί.\nΔεν μπορεί να γίνει DONE το Μοντάρισμα.', confirmText:'ΟΚ', onConfirm:null });
      return;
    }
    const newPhases = {...order.phases, [phaseKey]:{...order.phases[phaseKey], done:true, doneAt:Date.now()}};
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
    if (isGuest) return;
    const order = customOrders.find(o=>o.id===orderId); if(!order||!order.phases) return;
    const upd = {...order, phases:{...order.phases, [phaseKey]:{...order.phases[phaseKey], done:false, doneAt:null}}};
    setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
    await syncToCloud(upd);
  };

  // ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — Έναρξη παραγωγής
  const handleDipliStart = async (order) => {
    if (isGuest) return;
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
    if (isGuest) return;
    const order = customOrders.find(o=>o.id===orderId); if(!order||!order.dipliPhases) return;
    const newPhases = {...order.dipliPhases, [phaseKey]:{...order.dipliPhases[phaseKey], done:true, doneAt:Date.now()}};
    const allPhasesDone = Object.keys(newPhases).every(k => !newPhases[k].active || newPhases[k].done);
    const upd = {...order, dipliPhases:newPhases};
    setCustomOrders(customOrders.map(o=>o.id===orderId?upd:o));
    await syncToCloud(upd);
    // Αν όλες οι φάσεις done → ελέγχω αν υπάρχει κάσα (θα γίνει αυτόματα στο render)
    // Το πέρασμα στα ΕΤΟΙΜΑ γίνεται αυτόματα από το render όταν allPhasesDone && hasCase
  };

  // ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — Αναίρεση φάσης
  const handleDipliPhaseUndone = async (orderId, phaseKey) => {
    if (isGuest) return;
    const order = customOrders.find(o=>o.id===orderId); if(!order||!order.dipliPhases) return;
    const upd = {...order, dipliPhases:{...order.dipliPhases, [phaseKey]:{...order.dipliPhases[phaseKey], done:false, doneAt:null}}};
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
    if (isGuest) return;
    // Η αρχική (μάνα) δεν διαγράφεται όσο υπάρχουν σπασμένα κομμάτια της.
    if (hasAnyChildren(order)) {
      notify('Δεν γίνεται', 'Η αρχική παραγγελία δεν διαγράφεται όσο υπάρχουν σπασμένα κομμάτια της.\nΔιάγραψε/ολοκλήρωσε πρώτα τα σπασμένα.');
      return;
    }
    // Διαγραφή από το UI
    setCustomOrders(prev => prev.filter(o => o.id !== order.id));
    // Διαγραφή από το Firebase
    await deleteFromCloud(order.id);
    
    // Αν είναι τυποποιημένη, απελευθερώνουμε το στοκ
    if (order.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ') {
      const isMoni = (order.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !order.sasiType) && !order.lock;
      await removeStockReservation(order.orderNo, order.h, order.w, order.side, order.caseType, isMoni);
    }
    // Διαγραφή σπασμένου παιδιού → προσαρμογή «αρχικής» στη μάνα (και καθαρισμός αν δεν μένουν παιδιά).
    if (order.splitChild) {
      const mother = (customOrders||[]).find(m => m.id!==order.id && m.origQty!=null && String(order.orderNo).startsWith(splitChildPrefix(m)||'\u0000'));
      if (mother) {
        const stillHasChild = (customOrders||[]).some(c => c.id!==order.id && c.splitChild && String(c.orderNo).startsWith(splitChildPrefix(mother)));
        let upd;
        if (!stillHasChild) { upd = {...mother}; delete upd.origQty; }
        else { upd = {...mother, origQty: String(Math.max(parseInt(mother.qty)||0, (parseInt(mother.origQty)||0) - (parseInt(order.qty)||0))) }; }
        setCustomOrders(prev => prev.map(o=>o.id===mother.id?upd:o));
        await syncToCloud(upd);
      }
    }
  };

  const cancelOrder = async (id) => {
    if (isGuest) return;
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

    const checkStockFIFOLocal = (stockMap, key, orderNo) => stockCovers(stockMap?.[key], orderNo, readyNos);

    const qtyCell = (o) => `<td style="text-align:center;font-weight:900;font-size:16px;color:#cc0000">${parseInt(o.qty,10)>1?o.qty:''}</td>`;
    let rows = '';
    if (type === 'status') {
      // ΕΚΤΥΠΩΣΗ ΚΑΤΑΣΤΑΣΗ
      rows = orders.map(o => {
        const sk = sasiKey(String(o.h), String(o.w), o.side);
        const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
        const tasks = o.buildTasks||{};
        const caseReserved = !('case' in tasks);
        const sasiReserved = !('sasi' in tasks);
        const hasCaseOk = checkStockFIFOLocal(caseStock, ck, o.orderNo);
        const hasSasiOk = checkStockFIFOLocal(sasiStock, sk, o.orderNo);
        const checklistHtml = Object.entries(tasks).map(([k,done])=>
          `<span style="margin-right:8px;color:${done?'#155724':'#721c24'}">${done?'☑':'☐'} ${stdTaskLabel(k, o, false)}</span>`
        ).join('');
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ';
        return `<tr>
          <td style="font-weight:bold;font-size:14px">${o.orderNo}</td>
          <td>${o.customer||'—'}</td>
          ${qtyCell(o)}
          <td style="font-weight:bold">${o.h}x${o.w} ${fora}</td>
          <td style="text-align:center;font-weight:bold;color:${caseReserved?(hasCaseOk?'#155724':'#721c24'):'#999'}">${caseReserved?(hasCaseOk?'✓':'✗'):'—'}</td>
          <td style="text-align:center;font-weight:bold;color:${sasiReserved?(hasSasiOk?'#155724':'#721c24'):'#999'}">${sasiReserved?(hasSasiOk?'✓':'✗'):'—'}</td>
          <td style="font-size:11px">${checklistHtml}</td>
          <td style="font-size:11px;color:#555">${notesHtmlWithWarning(o.notes)}${miscJoin(o)?`<br>Διάφορα: ${miscJoin(o)}`:''}</td>
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
            <th>Νο</th><th>Πελάτης</th><th style="text-align:center">Τεμ.</th><th>Διάσταση</th><th>ΚΑΣΑ</th><th>ΣΑΣΙ</th><th>Εκκρεμότητες</th><th>Παρατηρήσεις</th>
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
          o.lock?`<span style="color:#cc0000;font-weight:bold">Κλειδ: ${o.lock}</span>`:'',
          o.heightReduction?`<span style="color:#cc0000;font-weight:bold">Μείωση −${o.heightReduction}</span>`:'',
          o.stavera&&o.stavera.filter(s=>s.dim).length>0?`Σταθ: ${o.stavera.filter(s=>s.dim).map(s=>stavParts(s)+(s.note?' '+s.note:'')).join(' | ')}`:'',
          o.installation==='ΝΑΙ'?'ΜΟΝΤΑΡΙΣΜΑ':'',
          o.caseType?(o.caseType.includes('ΑΝΟΙΧΤΟΥ')?'ΑΝΟΙΧΤΗ ΚΑΣΑ':'ΚΛΕΙΣΤΗ ΚΑΣΑ'):'',
          o.coatings&&o.coatings.length>0?o.coatings.join(', '):'',
          miscJoin(o)?`Διάφορα: ${miscJoin(o)}`:'',
        ].filter(Boolean).join(' | ');
        return `<tr>
          <td style="font-weight:bold;font-size:16px">${o.orderNo}</td>
          <td>${o.customer||'—'}</td>
          ${qtyCell(o)}
          <td style="font-weight:900;font-size:15px">${o.h}x${o.w}</td>
          <td style="font-weight:bold;font-size:15px">${fora}</td>
          <td style="font-size:11px">${extras}</td>
          <td style="font-size:11px;color:#555">${notesHtmlWithWarning(o.notes)}</td>
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
            <th>Νο</th><th>Πελάτης</th><th style="text-align:center">Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Στοιχεία</th><th>Παρατηρήσεις</th><th>Σημειώσεις</th>
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

  // Εκτύπωση «ΕΠΙΛΟΓΗ»: κάθετη λίστα — τίτλος το στάδιο, μόνο Νο/Πελάτης/Διάσταση/Παρατηρήσεις
  const handleSelectionPrint = (orders, title) => {
    if (!orders.length) return Alert.alert('Προσοχή','Δεν υπάρχουν παραγγελίες.');
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()} ${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;
    const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
    const rows = sorted.map(o=>{
      const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ';
      return `<tr>
        <td style="font-weight:bold;font-size:15px">${o.orderNo}</td>
        <td style="text-align:center;font-weight:900;font-size:15px;color:#cc0000">${parseInt(o.qty,10)>1?o.qty:''}</td>
        <td style="font-weight:bold">${o.h}x${o.w} ${fora}</td>
        <td style="text-align:center;font-weight:bold">${o.heightReduction||''}</td>
        <td style="text-align:center;font-weight:bold">${o.installation==='ΝΑΙ'?'ΝΑΙ':''}</td>
        <td style="text-align:center;font-weight:bold">${o.kypri==='ΝΑΙ'?'ΝΑΙ':''}</td>
        <td>${o.lock||''}</td>
        <td style="font-size:11px;color:#555">${notesHtmlWithWarning(o.notes)}</td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;margin:0;color:#000;}
      table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}
      th{padding:6px 5px;text-align:left;border-top:2px solid #000;border-bottom:2px solid #000;font-weight:bold;background:#fff;}
      td{padding:7px 5px;border-bottom:1px solid #000;vertical-align:middle;word-wrap:break-word;overflow-wrap:break-word;}
      h1{font-size:15px;margin-bottom:2px;font-weight:bold;}
      h2.sub{font-size:11px;color:#555;margin-top:0;margin-bottom:8px;}
      @media print{@page{size:A4 portrait;margin:10mm;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
    </style></head><body>
      <div style="padding:12px;">
        <h1>VAICON — ${title}</h1>
        <h2 class="sub">📅 ${dateStr} &nbsp;|&nbsp; ${sorted.length} παραγγελίες</h2>
        <table>
          <colgroup>
            <col style="width:9%"><col style="width:6%"><col style="width:13%"><col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:16%"><col style="width:30%">
          </colgroup>
          <thead><tr>
          <th>Νο</th><th style="text-align:center">Τεμ.</th><th>Διάσταση</th><th style="text-align:center">Μείωση</th><th style="text-align:center">Μοντάρ.</th><th style="text-align:center">Κυπρί</th><th>Κλειδαριά</th><th>Παρατηρήσεις</th>
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
  };

  const buildFilterMatch = (orders) => {
    const sel = [];
    for (const [key] of BF_STAGES) {
      if (buildFilterSel[key]?.done) sel.push([key,'done']);
      if (buildFilterSel[key]?.undone) sel.push([key,'undone']);
    }
    if (!sel.length) return [];
    return orders.filter(o => sel.some(([k,v]) => bfStageState(o,k)===v));
  };
  const buildFilterTitle = () => {
    const parts = [];
    for (const [key,,titleLabel] of BF_STAGES) {
      if (buildFilterSel[key]?.undone) parts.push(`${titleLabel} ΟΧΙ ΕΤΟΙΜΕΣ`);
      if (buildFilterSel[key]?.done)   parts.push(`${titleLabel} ΕΤΟΙΜΕΣ`);
    }
    return parts.join(' | ');
  };
  const renderBuildFilterPanel = () => {
    const bfTab = forcedTab || stdTab;
    const orders = bfTab==='ΔΙΠΛΗ' ? stdBuildDipliOrders : stdBuildMoniOrders;
    const title = bfTab==='ΔΙΠΛΗ' ? 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' : 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ';
    const matches = buildFilterMatch(orders);
    const toggle = (task, state) => setBuildFilterSel(prev => {
      const wasOn = prev[task]?.[state];
      const cleared = {};
      for (const [k] of BF_STAGES) cleared[k] = { done:false, undone:false };
      if (!wasOn) cleared[task][state] = true;
      return cleared;
    });
    const cbox = (task, state, label, color) => (
      <TouchableOpacity style={{flexDirection:'row',alignItems:'center',gap:5}} onPress={()=>toggle(task,state)}>
        <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:buildFilterSel[task][state]?'#00C851':'#bbb',backgroundColor:buildFilterSel[task][state]?'#00C851':'white',alignItems:'center',justifyContent:'center'}}>
          {buildFilterSel[task][state]&&<Text style={{color:'white',fontWeight:'bold',fontSize:11}}>✓</Text>}
        </View>
        <Text style={{fontSize:12,color,fontWeight:'bold'}}>{label}</Text>
      </TouchableOpacity>
    );
    const winW = (typeof window!=='undefined' && window.innerWidth) || 1200;
    const winH = (typeof window!=='undefined' && window.innerHeight) || 800;
    const bfTop = Math.max(8, Math.min(60 + buildFilterPos.y, winH - 80));
    const bfRight = Math.max(0, Math.min(14 - buildFilterPos.x, winW - 120));
    return (
      <View style={{position:'absolute', top: bfTop, right: bfRight, width:380, backgroundColor:'#fff8f2', borderWidth:1, borderColor:'#e65100', borderRadius:8, zIndex:2000, elevation:24, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.3, shadowRadius:12}}>
        <View
          style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:10, paddingVertical:8, backgroundColor:'#e65100', borderTopLeftRadius:8, borderTopRightRadius:8, ...(Platform.OS==='web'?{cursor:'grab', userSelect:'none'}:{})}}
          {...(Platform.OS==='web' ? { onMouseDown: handleBuildFilterDragStart, onTouchStart: handleBuildFilterDragStart } : {})}>
          <Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>☰ 🖨️ ΕΠΙΛΟΓΗ ΕΚΤΥΠΩΣΗΣ</Text>
          <TouchableOpacity onPress={()=>setBuildFilterOpen(false)}>
            <Text style={{color:'#fff', fontSize:18, fontWeight:'bold', paddingHorizontal:4}}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={{padding:10}}>
          <ScrollView style={{maxHeight:300}}>
          {BF_STAGES.map(([task,label])=>(
            <View key={task} style={{flexDirection:'row',alignItems:'center',marginBottom:6,flexWrap:'wrap',gap:12}}>
              <Text style={{width:130,fontWeight:'bold',color:'#333',fontSize:13}}>{label}</Text>
              {cbox(task,'done','έτοιμα','#155724')}
              {cbox(task,'undone','όχι έτοιμα','#721c24')}
            </View>
          ))}
          </ScrollView>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:4,borderTopWidth:1,borderTopColor:'#f0d9c6',paddingTop:8}}>
            <Text style={{fontWeight:'bold',color:'#e65100',fontSize:13}}>Ταιριάζουν: {matches.length}</Text>
            <TouchableOpacity disabled={!matches.length}
              style={{backgroundColor: matches.length?'#e65100':'#ccc',paddingHorizontal:12,paddingVertical:6,borderRadius:6}}
              onPress={()=>{ const c=buildFilterTitle(); handleSelectionPrint(matches, c?`${title} — ${c}`:title); }}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:12}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
            </TouchableOpacity>
          </View>
          {matches.length>0&&(
            <ScrollView style={{maxHeight:220,marginTop:6}}>
              {matches.map(o=>(
                <Text key={o.id} style={{fontSize:12,color:'#444',marginTop:2}}>#{o.orderNo} — {o.customer||'—'} — {o.h}x{o.w}</Text>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    );
  };

  // Πίνακας εκτύπωσης μόνο των παραγγελιών με επενδύσεις (ενότητα ΠΑΡΑΓΓΕΛΙΕΣ)
  const renderCoatPrintPanel = () => {
    const coatOrders = moniOrders.filter(o => stdCoatNames(o).length>0);
    const ependDone = (o) => { const ks=Object.keys(o.buildTasks||{}).filter(k=>k.startsWith('epend')); return ks.length>0 && ks.every(k=>o.buildTasks[k]===true); };
    const selected = coatOrders.filter(o => printSelected[o.id]);
    const allSelected = coatOrders.length>0 && coatOrders.every(o => printSelected[o.id]);
    const applySel = (matchFn) => setPrintSelected(prev => { const n={...prev}; coatOrders.forEach(o=>{ n[o.id]=matchFn(o); }); return n; });
    const toggleAll = () => applySel(()=>!allSelected);
    const filterChip = (label, color, matchFn) => (
      <TouchableOpacity style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:5, paddingHorizontal:8, backgroundColor:'#fff', borderRadius:6, borderWidth:1, borderColor:color}} onPress={()=>applySel(matchFn)}>
        <Text style={{fontSize:12, fontWeight:'bold', color}}>{label}</Text>
      </TouchableOpacity>
    );
    return (
      <View style={{position:'absolute', top:60, right:14, width:340, backgroundColor:'#f3f4ff', borderWidth:1, borderColor:'#5c6bc0', borderRadius:8, zIndex:2000, elevation:24, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.3, shadowRadius:12}}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:10, paddingVertical:8, backgroundColor:'#5c6bc0', borderTopLeftRadius:8, borderTopRightRadius:8}}>
          <Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🎨 🖨️ ΕΚΤΥΠΩΣΗ ΕΠΕΝΔΥΣΕΩΝ</Text>
          <TouchableOpacity onPress={()=>setCoatPrintOpen(false)}>
            <Text style={{color:'#fff', fontSize:18, fontWeight:'bold', paddingHorizontal:4}}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={{padding:10}}>
          {coatOrders.length===0 ? (
            <Text style={{textAlign:'center', color:'#999', paddingVertical:8}}>Δεν υπάρχουν παραγγελίες με επενδύσεις.</Text>
          ) : (<>
            <View style={{flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:8}}>
              <TouchableOpacity style={{flexDirection:'row', alignItems:'center', gap:6}} onPress={toggleAll}>
                <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:allSelected?'#00C851':'#bbb',backgroundColor:allSelected?'#00C851':'white',alignItems:'center',justifyContent:'center'}}>
                  {allSelected&&<Text style={{color:'white',fontWeight:'bold',fontSize:11}}>✓</Text>}
                </View>
                <Text style={{fontSize:12, fontWeight:'bold', color:'#333'}}>Επιλογή όλων</Text>
              </TouchableOpacity>
              {filterChip('✅ Έτοιμα', '#155724', o=>ependDone(o))}
              {filterChip('⏳ Όχι έτοιμα', '#721c24', o=>!ependDone(o))}
            </View>
            <ScrollView style={{maxHeight:280}}>
              {coatOrders.map(o=>{
                const sel = !!printSelected[o.id];
                return (
                  <TouchableOpacity key={o.id} style={{flexDirection:'row', alignItems:'center', gap:6, paddingVertical:4}} onPress={()=>setPrintSelected(p=>({...p,[o.id]:!p[o.id]}))}>
                    <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:sel?'#00C851':'#bbb',backgroundColor:sel?'#00C851':'white',alignItems:'center',justifyContent:'center'}}>
                      {sel&&<Text style={{color:'white',fontWeight:'bold',fontSize:11}}>✓</Text>}
                    </View>
                    <Text style={{fontSize:12, color:'#444', flex:1}}>#{o.orderNo} — {o.customer||'—'} — {o.h}x{o.w}  🎨 {stdCoatNames(o).join(', ')}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8, borderTopWidth:1, borderTopColor:'#d7d9ef', paddingTop:8}}>
              <Text style={{fontWeight:'bold', color:'#5c6bc0', fontSize:13}}>Επιλεγμένες: {selected.length}</Text>
              <TouchableOpacity disabled={!selected.length}
                style={{backgroundColor: selected.length?'#1a1a2e':'#ccc', paddingHorizontal:12, paddingVertical:6, borderRadius:6}}
                onPress={async()=>{ const list=[...selected].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)); await printHTML(buildEpendStdHtml(list), 'VAICON — ΕΚΤΥΠΩΣΗ ΠΡΟΣ ΠΑΡΑΓΩΓΗ'); }}>
                <Text style={{color:'#FFD600', fontWeight:'bold', fontSize:12}}>🖨️ ΠΡΟΣ ΠΑΡΑΓΩΓΗ</Text>
              </TouchableOpacity>
            </View>
          </>)}
        </View>
      </View>
    );
  };

  // Πίνακας εκτύπωσης μόνο των παραγγελιών για τοποθέτηση (ενότητα ΠΑΡΑΓΓΕΛΙΕΣ)
  const renderPlacePrintPanel = () => {
    const placeOrders = moniOrders.filter(o => o.installation==='ΝΑΙ');
    const selected = placeOrders.filter(o => placeSelected[o.id]);
    const allSelected = placeOrders.length>0 && placeOrders.every(o => placeSelected[o.id]);
    const applySel = (matchFn) => setPlaceSelected(prev => { const n={...prev}; placeOrders.forEach(o=>{ n[o.id]=matchFn(o); }); return n; });
    const toggleAll = () => applySel(()=>!allSelected);
    const filterChip = (label, color, matchFn) => (
      <TouchableOpacity style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:5, paddingHorizontal:8, backgroundColor:'#fff', borderRadius:6, borderWidth:1, borderColor:color}} onPress={()=>applySel(matchFn)}>
        <Text style={{fontSize:12, fontWeight:'bold', color}}>{label}</Text>
      </TouchableOpacity>
    );
    return (
      <View style={{position:'absolute', top:60, right:14, width:340, backgroundColor:'#f3f4ff', borderWidth:1, borderColor:'#5c6bc0', borderRadius:8, zIndex:2000, elevation:24, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.3, shadowRadius:12}}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:10, paddingVertical:8, backgroundColor:'#5c6bc0', borderTopLeftRadius:8, borderTopRightRadius:8}}>
          <Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🪛 🖨️ ΕΚΤΥΠΩΣΗ ΜΟΝΤΑΡΙΣΜΑΤΟΣ</Text>
          <TouchableOpacity onPress={()=>setPlacePrintOpen(false)}>
            <Text style={{color:'#fff', fontSize:18, fontWeight:'bold', paddingHorizontal:4}}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={{padding:10}}>
          {placeOrders.length===0 ? (
            <Text style={{textAlign:'center', color:'#999', paddingVertical:8}}>Δεν υπάρχουν παραγγελίες για μοντάρισμα.</Text>
          ) : (<>
            <View style={{flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:8}}>
              <TouchableOpacity style={{flexDirection:'row', alignItems:'center', gap:6}} onPress={toggleAll}>
                <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:allSelected?'#00C851':'#bbb',backgroundColor:allSelected?'#00C851':'white',alignItems:'center',justifyContent:'center'}}>
                  {allSelected&&<Text style={{color:'white',fontWeight:'bold',fontSize:11}}>✓</Text>}
                </View>
                <Text style={{fontSize:12, fontWeight:'bold', color:'#333'}}>Επιλογή όλων</Text>
              </TouchableOpacity>
              {filterChip('✅ Έτοιμα', '#155724', o=>o.status==='READY')}
              {filterChip('⏳ Όχι έτοιμα', '#721c24', o=>o.status!=='READY')}
            </View>
            <ScrollView style={{maxHeight:280}}>
              {placeOrders.map(o=>{
                const sel = !!placeSelected[o.id];
                return (
                  <TouchableOpacity key={o.id} style={{flexDirection:'row', alignItems:'center', gap:6, paddingVertical:4}} onPress={()=>setPlaceSelected(p=>({...p,[o.id]:!p[o.id]}))}>
                    <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:sel?'#00C851':'#bbb',backgroundColor:sel?'#00C851':'white',alignItems:'center',justifyContent:'center'}}>
                      {sel&&<Text style={{color:'white',fontWeight:'bold',fontSize:11}}>✓</Text>}
                    </View>
                    <Text style={{fontSize:12, color:'#444', flex:1}}>#{o.orderNo} — {o.customer||'—'} — {o.h}x{o.w}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8, borderTopWidth:1, borderTopColor:'#d7d9ef', paddingTop:8}}>
              <Text style={{fontWeight:'bold', color:'#5c6bc0', fontSize:13}}>Επιλεγμένες: {selected.length}</Text>
              <TouchableOpacity disabled={!selected.length}
                style={{backgroundColor: selected.length?'#1a1a2e':'#ccc', paddingHorizontal:12, paddingVertical:6, borderRadius:6}}
                onPress={async()=>{ const list=[...selected].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)); await handleStdPrint(list,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΜΟΝΤΑΡΙΣΜΑΤΑ',caseReady,sasiReady); }}>
                <Text style={{color:'#FFD600', fontWeight:'bold', fontSize:12}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
              </TouchableOpacity>
            </View>
          </>)}
        </View>
      </View>
    );
  };

  // Πατώντας ένα κουτάκι, η αλλαγή μπαίνει σε «καλάθι» (draft) ανά παραγγελία — δεν εφαρμόζεται αμέσως.
  const toggleTaskDraft = (order, taskKey) => {
    if (isGuest || locked) return;
    setTaskBasket(prev => {
      const baskets = prev || {};
      const entry = baskets[order.id] || { orderNo: order.orderNo, changes: {} };
      const actual = !!order.buildTasks?.[taskKey];
      const current = (taskKey in entry.changes) ? entry.changes[taskKey] : actual;
      const next = !current;
      const changes = { ...entry.changes };
      if (next === actual) delete changes[taskKey]; else changes[taskKey] = next;
      const out = { ...baskets };
      if (Object.keys(changes).length === 0) delete out[order.id];
      else out[order.id] = { ...entry, changes };
      return Object.keys(out).length ? out : null;
    });
  };
  const removeTaskDraft = (orderId, taskKey) => setTaskBasket(prev => {
    if (!prev || !prev[orderId]) return prev;
    const changes = { ...prev[orderId].changes }; delete changes[taskKey];
    const out = { ...prev };
    if (Object.keys(changes).length === 0) delete out[orderId];
    else out[orderId] = { ...prev[orderId], changes };
    return Object.keys(out).length ? out : null;
  });
  const stockOkFor = (order, newTasks) => {
    const sk = sasiKey(String(order.h), String(order.w), order.side);
    const ck = caseKey(String(order.h), String(order.w), order.side, order.caseType);
    const checkFIFO = (stockMap, key) => stockCovers(stockMap?.[key], order.orderNo, readyNos);
    const isMoniB = (order.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!order.sasiType);
    const caseReserved = !('case' in newTasks);
    const sasiReserved = isMoniB && !('sasi' in newTasks);
    const hasCaseOk = !caseReserved || checkFIFO(caseStock, ck);
    const hasSasiOk = !sasiReserved || checkFIFO(sasiStock, sk);
    return hasCaseOk && hasSasiOk;
  };
  // ΟΚ στο καλάθι → δεύτερη επιβεβαίωση → εφαρμογή όλων των παραγγελιών
  const applyTaskBasket = () => {
    if (!taskBasket) return;
    const ids = Object.keys(taskBasket);
    if (ids.length === 0) { setTaskBasket(null); return; }
    const totalChanges = ids.reduce((s,id)=>s+Object.keys(taskBasket[id].changes).length, 0);
    setConfirmModal({
      visible: true,
      title: 'Επιβεβαίωση',
      message: `Να εφαρμοστούν ${totalChanges} αλλαγές σε ${ids.length} ${ids.length===1?'παραγγελία':'παραγγελίες'};`,
      confirmText: 'ΝΑΙ, ΕΦΑΡΜΟΓΗ',
      onConfirm: async () => { const snap = taskBasket; setTaskBasket(null); await commitAllBaskets(snap); },
      onCancel: null,
    });
  };
  const commitAllBaskets = async (snapshot) => {
    const upds = [];
    const completed = [];
    Object.keys(snapshot).forEach(id => {
      const order = customOrders.find(o => o.id === id);
      if (!order) return;
      const prevTasks = order.buildTasks || {};
      const newTasks = {...prevTasks, ...snapshot[id].changes};
      const newDoneAt = {...(order.taskDoneAt || {})};
      Object.keys(snapshot[id].changes).forEach(k => {
        if (newTasks[k]===true && prevTasks[k]!==true) newDoneAt[k] = Date.now();
        else if (newTasks[k]!==true) delete newDoneAt[k];
      });
      const upd = {...order, buildTasks: newTasks, taskDoneAt: newDoneAt};
      upds.push(upd);
      const allDone = Object.keys(newTasks).length > 0 && Object.values(newTasks).every(v => v === true);
      if (allDone && stockOkFor(order, newTasks)) completed.push({ order, upd, prevTasks });
    });
    if (upds.length) {
      setCustomOrders(prev => prev.map(o => upds.find(u => u.id===o.id) || o));
      for (const u of upds) await syncToCloud(u);
    }
    processReadyQueue(completed);
  };
  // Σειριακή επιβεβαίωση «μεταφορά στην αποθήκη» για κάθε ολοκληρωμένη παραγγελία.
  const processReadyQueue = (queue) => {
    if (!queue.length) return;
    const [{ order, upd }, ...rest] = queue;
    setConfirmModal({
      visible: true,
      title: '✅ Έτοιμη για Αποθήκη',
      message: `Η παραγγελία #${order.orderNo} ολοκληρώθηκε.\nΜεταφορά στην αποθήκη ΕΤΟΙΜΩΝ;`,
      confirmText: '✅ ΝΑΙ, ΑΠΟΘΗΚΗ',
      onConfirm: async () => {
        await sendBuildOrderToReady(upd);
        processReadyQueue(rest);
      },
      // «Όχι»: ΔΕΝ αναιρεί τα τσεκαρίσματα — η παραγγελία μένει στη λίστα ολοκληρωμένη.
      // Πάει στην αποθήκη αργότερα με το κουμπί «📦 ΣΤΗΝ ΑΠΟΘΗΚΗ».
      onCancel: async () => { processReadyQueue(rest); }
    });
  };
  // Μεταφορά ολοκληρωμένης παραγγελίας (κατασκευή) στα ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ.
  const sendBuildOrderToReady = async (order) => {
    const ready = {...order, status:'STD_READY', readyAt:Date.now()};
    setCustomOrders(prev => prev.map(o => o.id===order.id ? ready : o));
    await syncToCloud(ready);
    await logActivity('ΤΥΠΟΠΟΙΗΜΕΝΗ', 'Φάση → ΕΤΟΙΜΟ (κατασκευή)', {orderNo:order.orderNo, customer:order.customer, size:`${order.h}x${order.w}`});
  };
  const confirmSendToReady = (order) => setConfirmModal({
    visible: true,
    title: '✅ Έτοιμη για Αποθήκη',
    message: `Μεταφορά της παραγγελίας #${order.orderNo} στην αποθήκη ΕΤΟΙΜΩΝ;`,
    confirmText: '✅ ΝΑΙ, ΑΠΟΘΗΚΗ',
    onConfirm: async () => { await sendBuildOrderToReady(order); },
    onCancel: null,
  });
  // ── Ταξινόμηση λιστών (κατά αρ. παραγγελίας ή ημ. καταχώρησης, με εναλλαγή φοράς) ──
  const [listSort, setListSort] = useState({});
  const cycleSort = (key, field) => setListSort(prev => {
    const cur = prev[key];
    if (!cur || cur.field !== field) return { ...prev, [key]: { field, dir:'desc' } };
    return { ...prev, [key]: { field, dir: cur.dir==='desc'?'asc':'desc' } };
  });
  const applyListSort = (list, key) => {
    const cfg = listSort[key] || SORT_DEFAULTS[key] || { field:'orderNo', dir:'asc' };
    const sign = cfg.dir==='desc' ? -1 : 1;
    const val = (o) => cfg.field==='createdAt' ? (o.createdAt||0) : (parseInt(o.orderNo)||0);
    return [...list].sort((a,b)=> sign*(val(a)-val(b)));
  };
  const renderSortBtns = (key) => {
    const cfg = listSort[key] || SORT_DEFAULTS[key] || { field:'orderNo', dir:'asc' };
    const mk = (field, label) => {
      const active = cfg.field===field;
      return (
        <TouchableOpacity key={field}
          style={{backgroundColor: active?'#1a1a1a':'rgba(255,255,255,0.9)', paddingHorizontal:10, paddingVertical:5, borderRadius:6}}
          onPress={e=>{ e?.stopPropagation?.(); cycleSort(key, field); }}>
          <Text style={{color: active?'white':'#333', fontSize:13, fontWeight:'bold'}}>{label}{active?(cfg.dir==='desc'?' ↓':' ↑'):''}</Text>
        </TouchableOpacity>
      );
    };
    return (<View style={{flexDirection:'row', gap:6, alignItems:'center'}}>{mk('orderNo','Αρ.')}{mk('createdAt','Νεότ.')}</View>);
  };
  // Σήμα «ποιος καταχώρησε» — ορατό μόνο στον διαχειριστή (ίδιο με Ειδικές).
  const renderEnteredBy = (o) => (isAdmin && o.enteredBy) ? (
    <View style={{borderWidth:2, borderColor:'#cc0000', borderRadius:6, paddingHorizontal:8, paddingVertical:2}}>
      <Text style={{color:'#cc0000', fontWeight:'bold', fontSize:13}}>✍️ {resolveName(o.enteredBy)}</Text>
    </View>
  ) : null;
  // Κουμπί «προς αποθήκη»: πράσινο βελάκι — εμφανίζεται όταν η παραγγελία ολοκληρώθηκε + υπάρχει stock.
  const renderToReadyBtn = (o, onPress) => (
    hasActiveChildren(o) ? (
      <View style={{backgroundColor:'#cccccc', paddingHorizontal:8, paddingVertical:6, borderRadius:5, alignItems:'center', minWidth:96, opacity:0.8}}>
        <Text style={{color:'#fff', fontSize:9, fontWeight:'bold', textAlign:'center'}}>⏳ περιμένει σπασμένα</Text>
      </View>
    ) : (
    <TouchableOpacity onPress={onPress || (()=>confirmSendToReady(o))}
      style={{backgroundColor:'#00C851', paddingHorizontal:8, paddingVertical:6, borderRadius:5, alignItems:'center', minWidth:96}}>
      <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>➜ προς αποθήκη</Text>
    </TouchableOpacity>
    )
  );
  // Read mode: ίδιο βελάκι, μη-πατήσιμο + αναβοσβήνει για να ξεχωρίζει η έτοιμη παραγγελία.
  const renderToReadyInfo = (o) => (
    <View style={{opacity: blinkPhase, backgroundColor:'#00C851', paddingHorizontal:8, paddingVertical:6, borderRadius:5, alignItems:'center', minWidth:96}}>
      <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>➜ προς αποθήκη</Text>
    </View>
  );
  // Στάδια επένδυσης σε κάθετη στήλη (ΕΞΩ πάνω) — λιγότερος χώρος + οπτικός διαχωρισμός
  const renderEpendStack = (o, tasks, horizontal=false) => {
    const keys = Object.keys(tasks)
      .filter(k => k.startsWith('epend'))
      .sort((a, b) => getCoatingGroup(stdCoatNames(o)[parseInt(a.slice(5))||0]) - getCoatingGroup(stdCoatNames(o)[parseInt(b.slice(5))||0]));
    if (keys.length === 0) return null;
    return (
      <View style={horizontal ? {flexDirection:'row', flexWrap:'wrap', gap:6} : {flexDirection:'column', gap:3}}>
        {keys.map(key => {
          const draft = (taskBasket && taskBasket[o.id]) ? taskBasket[o.id].changes : null;
          const pending = !!draft && (key in draft);
          const done = pending ? draft[key] : !!tasks[key];
          const bc = pending ? '#1976d2' : (done ? '#00C851' : '#e65100');
          return (
            <TouchableOpacity key={key}
              style={{flexDirection:'row', alignItems:'center', gap:4, backgroundColor: done?'#e8f5e9':'#fff3e0', borderRadius:6, paddingHorizontal:6, paddingVertical:3, borderWidth:1, borderColor: bc, ...(pending?{borderStyle:'dashed'}:{})}}
              onPress={()=>toggleTaskDraft(o, key)}>
              <View style={{width:16, height:16, borderRadius:4, borderWidth:2, borderColor: bc, backgroundColor: done?'#00C851':'white', alignItems:'center', justifyContent:'center'}}>
                {done&&<Text style={{color:'white',fontWeight:'bold',fontSize:9}}>✓</Text>}
              </View>
              <Text style={{fontSize:10, color: bc, fontWeight:'bold'}}>{stdTaskLabel(key, o)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // Μάτι «σε αναμονή»: ανοιχτό/πράσινο = ενεργή, κλειστό/γκρι = σε αναμονή.
  const renderHoldEye = (o, isHeld) => {
    if (!canHold || locked) return null;
    // Στη λίστα αναμονής: το λαμπάκι μαζεύει την παραγγελία στο καλάθι (δεν ενεργοποιεί αμέσως).
    if (isHeld) {
      const queued = holdBasket.includes(o.id);
      return (
        <TouchableOpacity onPress={()=>toggleHoldBasket(o.id)}
          style={{alignItems:'center', backgroundColor: queued?'#e8f5e9':'#eeeeee', borderRadius:8, paddingHorizontal:5, paddingVertical:6, borderWidth:2, borderColor: queued?'#00C851':'#9e9e9e'}}>
          <Text style={{fontSize:34, lineHeight:40}}>{queued?'👁️':'🙈'}</Text>
          <Text style={{fontSize:12, color: queued?'#2e7d32':'#757575', fontWeight:'bold'}}>{queued?'ΘΑ ΜΠΕΙ':'ΑΝΑΜΟΝΗ'}</Text>
        </TouchableOpacity>
      );
    }
    // Σε ενεργή κάρτα: το μάτι μαζεύει την παραγγελία στο καλάθι «σε αναμονή» (μπλοκάρεται αν έχει ξεκινήσει παραγωγή).
    const blocked = orderInProduction(o);
    const queued = holdOutBasket.includes(o.id);
    return (
      <TouchableOpacity
        onPress={()=>{ if (blocked) { notify('Δεν γίνεται', 'Η παραγγελία έχει ξεκινήσει παραγωγή — δεν μπορεί να μπει σε αναμονή.'); return; } toggleHoldOutBasket(o.id); }}
        style={{alignItems:'center', backgroundColor: blocked?'#f5f5f5':(queued?'#fff3e0':'#e8f5e9'), borderRadius:8, paddingHorizontal:5, paddingVertical:6, borderWidth:2, borderColor: blocked?'#ccc':(queued?'#e65100':'#00C851'), opacity: blocked?0.5:1}}>
        <Text style={{fontSize:34, lineHeight:40}}>{queued?'🙈':'👁️'}</Text>
        <Text style={{fontSize:12, color: blocked?'#999':(queued?'#e65100':'#2e7d32'), fontWeight:'bold'}}>{queued?'ΘΑ ΒΓΕΙ':'ΕΝΕΡΓΗ'}</Text>
      </TouchableOpacity>
    );
  };

  // Κάρτα λίστας «ΣΕ ΑΝΑΜΟΝΗ»: πλήρη στοιχεία, μάτι ενεργοποίησης + διαγραφή.
  const renderHoldCard = (o) => (
    <View key={o.id} nativeID={hlId(o.id)} style={[{backgroundColor:'#fff', borderRadius:8, marginBottom:6, borderLeftWidth:5, borderLeftColor:'#9e9e9e', elevation:2, padding:10}, searchHL(o.id)]}>
      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
        <View style={{flex:1}}>
          <StdOrderDatesLine order={o} marginBottom={4} />
          <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap'}}>
            <Text style={{fontWeight:'900', fontSize:16, color:'#1a1a1a'}}>#{o.orderNo}{noTag(o)}</Text>
            {o.customer?<Text style={{fontSize:14, fontWeight:'bold', color:'#333'}}>{o.customer}</Text>:null}
            {renderEnteredBy(o)}
          </View>
          <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
            {renderQtyBox(o)}
            <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.h}x{o.w}</Text>
            <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
            <Text style={{fontSize:12, fontWeight:'bold', color: o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'#8B0000':'#1565C0'}}>{o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</Text>
            {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#555'}}>🎨 {o.hardware}</Text>:null}
            {o.deliveryDate?<Text style={[styles.dateChip,{backgroundColor:'#fff3e0',color:'#e65100'}]}>🚚 {deliveryDateDisplay(o)}</Text>:null}
          </View>
          {o.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {o.placement==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>📍 ΤΟΠΟΘΕΤΗΣΗ</Text></View></View>}
          {renderCardCoatLine(o)}
          {o.heightReduction?<Text style={{fontSize:11, color:'#e65100', fontWeight:'bold', marginTop:2}}>📏 Μείωση: {o.heightReduction}</Text>:null}
          {o.stavera&&o.stavera.filter(s=>s.dim).length>0?<Text style={{fontSize:11, color:'#555', marginTop:2}}>📐 {o.stavera.filter(s=>s.dim).map(s=>stavParts(s)+(s.note?" "+s.note:"")).join(" | ")}</Text>:null}
          {miscJoin(o)?<Text style={{fontSize:11, color:'#6a1b9a', fontWeight:'bold', marginTop:2}}>📦 {miscJoin(o)}</Text>:null}
          {renderNotesWithWarning(o.notes, {fontSize:11, color:'#888', marginTop:2})}
          {canHold ? renderDocButton(o) : (o.docCount>0 ? (
            <TouchableOpacity onPress={()=>openDocViewer(o)} style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#e8f5e9',borderWidth:1,borderColor:'#43a047',borderRadius:8,paddingHorizontal:10,paddingVertical:6,marginTop:8,alignSelf:'flex-start'}}>
              <Text style={{fontSize:13,fontWeight:'bold',color:'#2e7d32'}}>📎 ΠΡΟΒΟΛΗ ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ</Text>
              <View style={{backgroundColor:'#2e7d32',borderRadius:10,minWidth:20,paddingHorizontal:5,paddingVertical:1}}><Text style={{color:'#fff',fontSize:12,fontWeight:'900',textAlign:'center'}}>{o.docCount}</Text></View>
            </TouchableOpacity>
          ) : null)}
        </View>
        {canHold && <View style={{alignItems:'flex-end', gap:6, marginLeft:8}}>
          {renderHoldEye(o, true)}
          {!locked&&<TouchableOpacity
            style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignItems:'center', alignSelf:'stretch'}}
            onPress={async()=>{ if(!window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) return; await handleDeleteAndRelease(o); }}>
            <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
          </TouchableOpacity>}
        </View>}
        {canHold && (() => {
          const notif = o.notified || {};
          const sd = (ts)=> ts?`${String(new Date(ts).getDate()).padStart(2,'0')}/${String(new Date(ts).getMonth()+1).padStart(2,'0')}`:'';
          const chip = (label, ts, color, icon) => (
            <View style={{backgroundColor: ts?color:'#e0e0e0', borderRadius:10, paddingVertical:9, paddingHorizontal:14, alignItems:'center'}}>
              <Text style={{color: ts?'#fff':'#888', fontSize:14, fontWeight:'bold'}}>{ts?'✓ ':icon+' '}{label}</Text>
              {ts?<Text style={{color:'#fff', fontSize:11}}>{sd(ts)}</Text>:null}
            </View>
          );
          return (
            <View style={{justifyContent:'center', paddingLeft:18, marginLeft:18, borderLeftWidth:1, borderLeftColor:'#e0e0e0', gap:8, minWidth:130}}>
              {chip('Viber', notif.viber, '#7360f2', '📞')}
              {chip('Email', notif.email, '#0288d1', '✉️')}
              {chip('SMS', notif.sms, '#1565C0', '📱')}
            </View>
          );
        })()}
      </View>
    </View>
  );

  // Κάρτα «προς κατασκευή» (μονή) — κοινή για την ενότητα ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ
  // και για τις παραγγελίες «μόνο επενδύσεις» που εμφανίζονται στις ΠΑΡΑΓΓΕΛΙΕΣ.
  const renderBuildCard = (o, { ependHorizontal=false }={}) => {
    const sk = sasiKey(String(o.h), String(o.w), o.side);
    const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
    const checkStock = (stockMap, key) => stockCovers(stockMap?.[key], o.orderNo, readyNos);
    const tasks = o.buildTasks||{};
    const hasSasiReserved = !('sasi' in tasks);
    const hasCaseReserved = !('case' in tasks);
    const hasSasiOk = !hasSasiReserved || checkStock(sasiStock, sk);
    const hasCaseOk = !hasCaseReserved || checkStock(caseStock, ck);
    const stockOk = hasCaseOk && hasSasiOk;
    const allDone = Object.keys(tasks).length>0 && Object.values(tasks).every(v=>v===true);
    return (
      <View key={o.id} nativeID={hlId(o.id)} style={[{backgroundColor:'#fff', borderRadius:8, marginBottom:6, borderLeftWidth:5, borderLeftColor: allDone?'#00C851':'#e65100', elevation:2, padding:10}, searchHL(o.id)]}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
          <View style={{flex:1, alignSelf:'stretch'}}>
          <View style={{flexDirection:'row'}}>
          {/* ΣΤΗΛΗ 1: στοιχεία ταυτότητας + badges — σταθερό πλάτος για στοίχιση */}
          <View style={{width:280}}>
            <StdOrderDatesLine order={o} marginBottom={4} />
            <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap'}}>
              <Text style={{fontWeight:'900', fontSize:16, color:'#1a1a1a'}}>#{o.orderNo}{noTag(o)}</Text>
              {o.customer?<Text style={{fontSize:14, fontWeight:'bold', color:'#333'}}>{o.customer}</Text>:null}
              {renderEnteredBy(o)}
            </View>
            <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
              {renderQtyBox(o)}
              <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.h}x{o.w}</Text>
              <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
              <Text style={{fontSize:12, fontWeight:'bold', color:'#1565C0'}}>ΜΟΝΗ</Text>
              {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#555'}}>🎨 {o.hardware}</Text>:null}
            </View>
            {o.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
            {o.placement==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>📍 ΤΟΠΟΘΕΤΗΣΗ</Text></View></View>}
          </View>

          <View style={{width:24}}/>

          {/* ΣΤΗΛΗ 2: λεπτομέρειες + phases */}
          <View style={{flex:1}}>
            {renderCardCoatLine(o)}
            {o.heightReduction?<Text style={{fontSize:11, color:'#e65100', fontWeight:'bold', marginTop:2}}>📏 Μείωση: {o.heightReduction}</Text>:null}
            {o.stavera&&o.stavera.filter(s=>s.dim).length>0?<Text style={{fontSize:11, color:'#555', marginTop:2}}>📐 {o.stavera.filter(s=>s.dim).map(s=>stavParts(s)+(s.note?" "+s.note:"")).join(" | ")}</Text>:null}
            {miscJoin(o)?<Text style={{fontSize:11, color:'#6a1b9a', fontWeight:'bold', marginTop:2}}>📦 {miscJoin(o)}</Text>:null}
            {renderNotesWithWarning(o.notes, {fontSize:11, color:'#888', marginTop:2})}
            {/* CHECKBOXES ΟΡΙΖΟΝΤΙΑ */}
            <View style={{marginTop:6, flexDirection:'row', flexWrap:'wrap', gap:6, alignItems:'center'}}>
              {(() => {
                const sasiReady = ('sasi' in tasks) ? !!tasks.sasi : hasSasiOk;
                return Object.entries(tasks).filter(([key])=>!key.startsWith('epend')).map(([key, rawDone])=>{
                const draft = (taskBasket && taskBasket[o.id]) ? taskBasket[o.id].changes : null;
                const pending = !!draft && (key in draft);
                const done = pending ? draft[key] : rawDone;
                const isOversizeTask = key === 'oversize';
                const isMontageTask = key === 'montage';
                const disabled = !done && (
                  isOversizeTask ? !stockOk :
                  isMontageTask ? !sasiReady :
                  false
                );
                const label = isOversizeTask
                  ? (stockOk ? '📦 Έτοιμο από stock' : '❌ Λείπει stock')
                  : stdTaskLabel(key, o);
                const flashing = isOversizeTask && !done && stockOk;
                const borderColor = pending ? '#1976d2' : (done ? '#00C851' : (disabled ? '#bbb' : '#e65100'));
                const textColor = pending ? '#1976d2' : (done ? '#00C851' : (disabled ? '#888' : '#e65100'));
                const bg = done ? '#e8f5e9' : (disabled ? '#f5f5f5' : '#fff3e0');
                const opacity = flashing ? blinkPhase : (disabled ? 0.6 : 1);
                return (
                  <TouchableOpacity key={key}
                    disabled={disabled}
                    style={{flexDirection:'row', alignItems:'center', gap:4, backgroundColor:bg, borderRadius:6, paddingHorizontal:8, paddingVertical:5, borderWidth:1, borderColor, opacity, ...(pending?{borderStyle:'dashed'}:{})}}
                    onPress={()=>toggleTaskDraft(o, key)}>
                    <View style={{width:18, height:18, borderRadius:4, borderWidth:2, borderColor, backgroundColor: done?'#00C851':'white', alignItems:'center', justifyContent:'center'}}>
                      {done&&<Text style={{color:'white',fontWeight:'bold',fontSize:10}}>✓</Text>}
                    </View>
                    <Text style={{fontSize:11, color:textColor, fontWeight:'bold'}}>{label}</Text>
                  </TouchableOpacity>
                );
              });
              })()}
              {renderEpendStack(o, tasks, ependHorizontal)}
            </View>
          </View>
          </View>
          <View style={{marginTop:'auto'}}>{renderDocButton(o)}</View>
          </View>
          {/* ΚΑΣΑ + ΣΑΣΙ + ΕΠΙΣΤΡΟΦΗ + ΔΙΑΓΡΑΦΗ — δεξιά */}
          <View style={{alignItems:'flex-end', gap:4, marginLeft:8}}>
            <View style={{flexDirection:'row', gap:4}}>
              {hasCaseReserved&&(
              <TouchableOpacity
                activeOpacity={hasCaseOk||locked ? 1 : 0.7}
                onPress={()=>{ if(!hasCaseOk && !locked) handleBorrowRequest(o, 'case'); }}
                style={{alignItems:'center', backgroundColor: hasCaseOk?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: hasCaseOk?'#00C851':'#ff4444', minWidth:44}}>
                <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΚΑΣΑ</Text>
                <Text style={{fontSize:14}}>{hasCaseOk?'✅':'❌'}</Text>
                {!hasCaseOk&&!locked&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
              </TouchableOpacity>
              )}
              {hasSasiReserved&&(
                <TouchableOpacity
                  activeOpacity={hasSasiOk||locked ? 1 : 0.7}
                  onPress={()=>{ if(!hasSasiOk && !locked) handleBorrowRequest(o, 'sasi'); }}
                  style={{alignItems:'center', backgroundColor: hasSasiOk?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: hasSasiOk?'#00C851':'#ff4444', minWidth:44}}>
                  <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΣΑΣΙ</Text>
                  <Text style={{fontSize:14}}>{hasSasiOk?'✅':'❌'}</Text>
                  {!hasSasiOk&&!locked&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
                </TouchableOpacity>
              )}
            </View>
            {!locked&&!isForeman&&<TouchableOpacity
              style={{backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignItems:'center'}}
              onPress={()=>{
                if(Platform.OS==='web') {
                  setScrollPosition(window.pageYOffset || document.documentElement.scrollTop);
                } else {
                  mainScrollRef.current?.measure((x, y, width, height, pageX, pageY) => {
                    setScrollPosition(pageY);
                  });
                }
                setReturnConfirmModal({ visible: true, order: o });
              }}>
              <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>↩ ΕΠΙΣΤΡ</Text>
            </TouchableOpacity>}

            {!locked&&<TouchableOpacity
              style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignItems:'center'}}
              onPress={async()=>{
                if(!window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) return;
                await handleDeleteAndRelease(o);
              }}>
              <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
            </TouchableOpacity>}
            {renderHoldEye(o, false)}
            {!locked && allDone && stockOk && renderToReadyBtn(o)}
            {locked && allDone && stockOk && renderToReadyInfo(o)}
          </View>
          {renderNotifyColumn(o)}
        </View>
      </View>
    );
  };

  // ── Δανεισμός δέσμευσης stock ──
  // orderNo από Firebase/reservations μπορεί να είναι number ενώ στις παραγγελίες string (ή το αντίστροφο)
  const sameOrderNo = (a, b) => String(a ?? '') === String(b ?? '');

  /** Κάλυψη (greedy, κοινή λογική με την οθόνη στοκ) */
  const fifoCoversOrder = (stockMap, key, orderNo) => stockCovers(stockMap?.[key], orderNo, readyNos);

  const handleBorrowRequest = (order, stockType) => {
    if (isGuest) return;
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
      .map(r => customOrders.find(o => sameOrderNo(o.orderNo, r.orderNo) && o.id !== order.id))
      .filter(o => {
        if (!o) return false;
        // Πωλημένες: εκτός (έχουν ήδη φύγει από το στοκ)
        if (o.status === 'STD_SOLD') return false;
        // Έτοιμες: εμφανίζονται αλλά κλειδωμένες (δεν δανείζονται)
        if (o.status === 'STD_READY') return true;
        // Αποκλείω παραγγελίες που έχουν ξεκινήσει παραγωγή (done φάσεις)
        if (o.dipliPhases && Object.values(o.dipliPhases).some(p => p.done)) return false;
        if (o.moniPhases && Object.values(o.moniPhases).some(p => p.done)) return false;
        if (o.buildTasks && Object.values(o.buildTasks).some(v => v === true)) return false;
        return true;
      })
      .map(o => ({ ...o, _readyLocked: o.status === 'STD_READY' }));

    let candidates = [];

    if (stockType === 'case') {
      // Ψάχνω σε ΟΛΑ τα caseStock entries για αυτή τη διάσταση+φορά
      // (ΚΛΕΙΣΤΗ + ΑΝΟΙΧΤΗ) — η κάσα είναι κοινή για ΜΟΝΗ και ΔΙΠΛΗ
      const allReservations = [
        ...((caseStock[ckKleisto]?.reservations) || []),
        ...((caseStock[ckAnoixto]?.reservations) || []),
      ];

      if (allReservations.length === 0) {
        return notify('Προσοχή', 'Δεν υπάρχουν δεσμεύσεις κάσας για αυτή τη διάσταση.\n\nΚαμία άλλη παραγγελία δεν έχει δεσμευμένη κάσα για ' + h + 'x' + w + ' ' + (side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ') + '.');
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
        return notify('Προσοχή', 'Δεν υπάρχουν δεσμεύσεις σασί για αυτή τη διάσταση.\n\nΚαμία άλλη παραγγελία δεν έχει δεσμευμένο σασί για ' + h + 'x' + w + ' ' + (side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕΞ') + '.');
      }

      candidates = filterCandidates(reservations);
    }

    if (candidates.length === 0) {
      return notify('Δεν βρέθηκαν', 'Δεν υπάρχουν παραγγελίες με διαθέσιμη δέσμευση για αυτή τη διάσταση.\n\nΌλες οι παραγγελίες με δέσμευση έχουν ήδη ξεκινήσει παραγωγή ή είναι έτοιμες.');
    }

    candidates.sort((a, b) => String(a.orderNo).localeCompare(String(b.orderNo), undefined, { numeric: true }));
    setBorrowModal({ visible: true, order, stockType, candidates });
  };

  // (useEffect για pendingConfirm αφαιρέθηκε — χρησιμοποιούμε borrowConfirmModal αντί για window.confirm)

  const handleBorrowConfirmDirect = async (donorOrder, order, stockType) => {
    if (isGuest) return;
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
        const donorRes = (data.reservations || []).find(r => sameOrderNo(r.orderNo, donorOrder.orderNo));
        if (!donorRes) { showAlert('Σφάλμα', 'Δεν βρέθηκε η δέσμευση στο stock του donor.'); return; }
        const orderQty = parseInt(order.qty) || 1;
        const newRes = { orderNo: order.orderNo, customer: order.customer || '', qty: orderQty, borrowedFrom: donorOrder.orderNo };
        const donorResUpdated = { ...donorRes, borrowedTo: order.orderNo, priorityReservation: true };
        const cleanedReservations = (data.reservations || []).filter(r =>
          !sameOrderNo(r.orderNo, order.orderNo) &&
          !sameOrderNo(r.borrowedFrom, donorOrder.orderNo)
        );
        const updReservations = cleanedReservations.map(r => sameOrderNo(r.orderNo, donorOrder.orderNo) ? newRes : r);
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
        const donorRes = (data.reservations || []).find(r => sameOrderNo(r.orderNo, donorOrder.orderNo));
        if (!donorRes) { showAlert('Σφάλμα', 'Δεν βρέθηκε η δέσμευση σασί.'); return; }
        const orderQty = parseInt(order.qty) || 1;
        const newRes = { orderNo: order.orderNo, customer: order.customer || '', qty: orderQty, borrowedFrom: donorOrder.orderNo };
        const donorResUpdated = { ...donorRes, borrowedTo: order.orderNo, priorityReservation: true };
        const cleanedSasiReservations = (data.reservations || []).filter(r => !sameOrderNo(r.orderNo, order.orderNo));
        const updReservations = cleanedSasiReservations.map(r => sameOrderNo(r.orderNo, donorOrder.orderNo) ? newRes : r);
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


  const deleteFromArchive = (id) => { if (isGuest) return; Alert.alert("Διαγραφή","Διαγραφή από αρχείο;",[{text:"Όχι"},{text:"Ναι",style:"destructive",onPress:async()=>{setSoldOrders(soldOrders.filter(o=>o.id!==id));await deleteFromCloud(id);}}]); };
  const LOCKED_OPEN_SECTIONS = ['stdBuildMoni','stdBuildDipli','stdReady','stdReadyD','stdSold','stdSoldD','moniSasiStock','dipliSasiStock'];
  const toggleSection = (s) => { if (LOCKED_OPEN_SECTIONS.includes(s)) return; LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setExpanded({...expanded,[s]:!expanded[s]}); };

  const renderOrderCard = (order, isArchive=false) => {
    const isProd = order.status==='PROD';
    const bc = isArchive?'#333':(isProd?'#2e7d32':order.status==='PENDING'?'#ff4444':'#00C851');
    const next = order.status==='PENDING'?'PROD':order.status==='PROD'?'READY':'SOLD';
    const btn  = isArchive?'ΔΙΑΓΡΑΦΗ':(order.status==='PENDING'?'ΕΝΑΡΞΗ':order.status==='PROD'?'ΕΤΟΙΜΗ':'ΠΩΛΗΣΗ');
    const btnC = isArchive?'#000':(order.status==='PENDING'?'#ffbb33':order.status==='PROD'?'#00C851':'#222');
    const isStd = order.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ';
    return (
      <TouchableOpacity key={order.id} onLongPress={()=>!isArchive&&order.status==='PENDING'&&editOrder(order)} delayLongPress={1000} activeOpacity={0.7} style={[styles.orderCard,{borderLeftColor:bc, backgroundColor: isProd?'#e8f5e9':'white'}, searchHL(order.id)]}>
        <View style={styles.cardContent}>
          {isProd&&<View style={{backgroundColor:'#2e7d32', borderRadius:6, paddingHorizontal:10, paddingVertical:3, alignSelf:'flex-start', marginBottom:5}}>
            <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>⚙️ ΣΤΗΝ ΠΑΡΑΓΩΓΗ</Text>
          </View>}
          {order.staveraPendingAtReady&&!order.staveraDone&&<View style={{backgroundColor:'#e65100', borderRadius:6, paddingHorizontal:10, paddingVertical:3, alignSelf:'flex-start', marginBottom:5}}>
            <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>⏳ ΕΚΚΡΕΜΕΙ ΣΤΑΘΕΡΟ</Text>
          </View>}
          <View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,marginBottom:3}}>
            {!isStd && fmtDate(order.createdAt)?<Text style={{fontSize:11,color:'#007AFF',fontWeight:'bold'}}>📅 {fmtDate(order.createdAt)}</Text>:null}
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
          {!isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {!isStd&&<Text style={styles.cardSubDetails}>Κάσα: {order.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | {order.caseMaterial||'DKP'}</Text>}
          {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&<Text style={styles.cardSubDetails}>📐 Σταθ: {order.stavera.filter(s=>s.dim).map(s=>stavParts(s)+(s.note?' '+s.note:'')).join(' | ')}</Text>}
          {isStd&&<Text style={styles.cardSubDetails}>{order.lock?`Κλειδ: ${order.lock} | `:''}  {order.hardware}</Text>}
          {isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {order.placement==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>📍 ΤΟΠΟΘΕΤΗΣΗ</Text></View></View>}
          {isStd&&order.heightReduction?<Text style={[styles.cardSubDetails,{color:'#b71c1c',fontWeight:'bold'}]}>📏 ΜΕΙΩΣΗ ΥΨΟΥΣ: {order.heightReduction} cm</Text>:null}
          {order.coatings&&order.coatings.length>0&&<Text style={[styles.cardSubDetails,{color:'#007AFF'}]}>🎨 {order.coatings.join(', ')}</Text>}
          {order.notes?<Text style={styles.cardSubDetails}>Σημ: {order.notes}</Text>:null}
          <View style={styles.datesRow}>
            {isStd && (fmtDate(order.createdAt) || deliveryDateDisplay(order)) ? (
              <View style={styles.dateChipWrap}>
                <StdOrderDatesLine order={order} fontSize={10} />
              </View>
            ) : (
              <>
                {fmtDate(order.createdAt)&&<Text style={styles.dateChip}>📅 {fmtDate(order.createdAt)}</Text>}
                {deliveryDateDisplay(order) ? <Text style={[styles.dateChip,{backgroundColor:'#fff3e0',color:'#e65100'}]}>🚚 {deliveryDateDisplay(order)}</Text> : null}
              </>
            )}
            {fmtDate(order.prodAt)&&<Text style={styles.dateChip}>🔨 {fmtDate(order.prodAt)}</Text>}
            {fmtDate(order.readyAt)&&<Text style={styles.dateChip}>✅ {fmtDate(order.readyAt)}</Text>}
          </View>
        </View>
        {!(isGuest||locked)&&<View style={styles.sideBtnContainer}>
          {!isArchive&&<TouchableOpacity style={[styles.upperBtn,{backgroundColor:order.status==='PENDING'?'#000':'#666'}]} onPress={()=>order.status==='PENDING'?cancelOrder(order.id):moveBack(order.id,order.status)}><Text style={[styles.upperBtnText,{color:order.status==='PENDING'?'#ff4444':'white'}]}>{order.status==='PENDING'?'ΑΚΥΡΩΣΗ':'⟲'}</Text></TouchableOpacity>}
          {order.status!=='PROD'&&<TouchableOpacity style={[styles.lowerBtn,{backgroundColor:btnC}]} onPress={()=>isArchive?deleteFromArchive(order.id):updateStatus(order.id,next)}><Text style={styles.sideBtnText}>{btn}</Text></TouchableOpacity>}
        </View>}
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
      <View key={order.id} style={[styles.phaseCard, phase.done&&styles.phaseCardDone, searchHL(order.id)]}>
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
          {!isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&<Text style={styles.cardSubDetails}>📐 Σταθ: {order.stavera.filter(s=>s.dim).map(s=>stavParts(s)+(s.note?' '+s.note:'')).join(' | ')}</Text>}
          {isStd&&<Text style={styles.cardSubDetails}>{order.hardware||''}</Text>}
          {isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {order.placement==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>📍 ΤΟΠΟΘΕΤΗΣΗ</Text></View></View>}
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
        {!(isGuest||locked)&&<View style={{justifyContent:'space-between', paddingVertical:4}}>
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
        </View>}
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
        <td style="min-width:140px">${notesHtmlWithWarning(o.notes)}</td>
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
                        const isGiven = truthyBool(o.staveraGiven);
                        const doneS = truthyBool(o.staveraDone);
                        return (
                        <View key={o.id} style={[{backgroundColor:doneS?'#e8f5e9':isGiven?'#ede7f6':'#f3e5f5', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:4, borderLeftColor:doneS?'#00C851':isGiven?'#4a148c':'#7b1fa2', elevation:1, flexDirection:'row', alignItems:'flex-start'}, searchHL(o.id)]}>
                          <TouchableOpacity style={{marginRight:10, marginTop:2}} onPress={()=>setPrintSelected(p=>({...p,[o.id]:!p[o.id]}))}>
                            <View style={{width:28,height:28,borderRadius:6,borderWidth:2,borderColor:isSelected?'#1565c0':'#7b1fa2',backgroundColor:isSelected?'#1565c0':'white',alignItems:'center',justifyContent:'center'}}>
                              {isSelected&&<Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✓</Text>}
                            </View>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{marginRight:10, marginTop:2}}
                            onPress={async ()=>{
                              if (Platform.OS === 'web') {
                                const ok = window.confirm(
                                  isGiven
                                    ? `Ξετσεκάρισμα σταθερών #${o.orderNo};`
                                    : `Τα σταθερά της #${o.orderNo} δόθηκαν για παραγωγή;`
                                );
                                if (ok) {
                                  const upd = { ...o, staveraGiven: !isGiven };
                                  setCustomOrders(customOrders.map((x) => (x.id === o.id ? upd : x)));
                                  await syncToCloud(upd);
                                }
                              } else {
                                Alert.alert(
                                  isGiven ? '☐ Ξετσεκάρισμα' : '✅ Επιβεβαίωση',
                                  isGiven
                                    ? `Ξετσεκάρισμα σταθερών #${o.orderNo};`
                                    : `Τα σταθερά της #${o.orderNo} δόθηκαν για παραγωγή;`,
                                  [
                                    { text: 'ΑΚΥΡΟ', style: 'cancel' },
                                    {
                                      text: 'ΝΑΙ',
                                      onPress: async () => {
                                        const upd = { ...o, staveraGiven: !isGiven };
                                        setCustomOrders(customOrders.map((x) => (x.id === o.id ? upd : x)));
                                        await syncToCloud(upd);
                                      },
                                    },
                                  ]
                                );
                              }
                            }}>
                            <View style={{width:28,height:28,borderRadius:6,borderWidth:2,borderColor:isGiven?'#4a148c':'#7b1fa2',backgroundColor:isGiven?'#4a148c':'white',alignItems:'center',justifyContent:'center'}}>
                              {isGiven&&<Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✓</Text>}
                            </View>
                          </TouchableOpacity>
                          <View style={{flex:1}}>
                            <StdOrderDatesLine order={o} marginBottom={2} />
                            <Text style={{fontWeight:'bold', fontSize:13, marginBottom:4}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                            <Text style={{fontSize:12, color:'#555', marginBottom:6}}>{o.h}x{o.w} | {o.side}</Text>
                              {(o.stavera||[]).map((s,idx)=>(
                              <View key={idx} style={{backgroundColor:'white', borderRadius:6, padding:8, marginBottom:4, borderLeftWidth:2, borderLeftColor:'#ce93d8'}}>
                                <Text style={{fontWeight:'bold', fontSize:13, color:'#4a148c'}}>📐 {stavParts(s)||'—'}</Text>
                                {s.note?<Text style={{fontSize:12, color:'#555', marginTop:2}}>{s.note}</Text>:null}
                              </View>
                            ))}
                            {doneS?<Text style={{fontSize:11,color:'#00796B',fontWeight:'bold',marginTop:2}}>✅ Ολοκληρώθηκαν</Text>:null}
                          </View>
                          <View style={{justifyContent:'space-between', gap:6, marginLeft:8, paddingVertical:2}}>
                            <TouchableOpacity
                              style={[styles.doneBtn, doneS&&styles.doneBtnActive]}
                              onPress={async()=>{
                                const newDone = !doneS;
                                const upd={...o, staveraDone:newDone, ...(newDone && {staveraPendingAtReady:false})};
                                setCustomOrders(customOrders.map(x=>x.id===o.id?upd:x));
                                await syncToCloud(upd);
                              }}>
                              <Text style={styles.doneBtnTxt}>{doneS?'↩️ UNDO':'✓ DONE'}</Text>
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
  // Πωλητής: βλέπει μόνο τις παραγγελίες των δικών του πελατών (πελάτης δεσμευμένος σε πωλητή).
  // Το προσωπικό μπορεί επίσης να φιλτράρει ανά πωλητή (filterSellerKey).
  const effSellerKey = isSeller ? sellerKey : (filterSellerKey || null);
  const sellerOwnsOrder = (o) => {
    if (!effSellerKey) return true;
    const c = o.customerId ? customers.find(x => x.id === o.customerId) : customers.find(x => String(x.name) === String(o.customer));
    return (c?.seller || '') === effSellerKey;
  };
  const baseCustomAll = useMemo(() => effSellerKey ? customOrders.filter(sellerOwnsOrder) : customOrders, [customOrders, effSellerKey, customers]);
  // Οι «σε αναμονή» κρύβονται από ΟΛΕΣ τις ενότητες/κάρτες/εκτυπώσεις — φαίνονται μόνο στη λίστα ΣΕ ΑΝΑΜΟΝΗ.
  const baseCustom = useMemo(() => baseCustomAll.filter(o => !o.onHold), [baseCustomAll]);
  const holdOrders = useMemo(() => baseCustomAll.filter(o => o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ' && o.onHold).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [baseCustomAll]);
  const holdMoniOrders = useMemo(() => holdOrders.filter(o => o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType), [holdOrders]);
  const holdDipliOrders = useMemo(() => holdOrders.filter(o => o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'), [holdOrders]);
  const baseSold = useMemo(() => isSeller ? [] : (effSellerKey ? soldOrders.filter(sellerOwnsOrder) : soldOrders), [soldOrders, isSeller, effSellerKey, customers]);
  // ── Ημερολόγιο (τεμάχια) ──
  const pieceQty = (o) => parseInt(o.qty) || 1;
  const calData = (orders, getTs) => orders.map(o => ({ ts: getTs(o), qty: pieceQty(o) })).filter(x => x.ts);
  const sameDay = (ts, dayTs) => { const a = new Date(ts), b = new Date(dayTs); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  const calTabOrders = useMemo(() => {
    const isMoni = forcedTab !== 'ΔΙΠΛΗ';
    return [...baseCustom, ...baseSold].filter(o => o.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ' && (isMoni ? (o.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !o.sasiType) : o.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'));
  }, [baseCustom, baseSold, forcedTab]);
  // Πωλητής: στην καταχώρηση διαλέγει μόνο τους δικούς του πελάτες.
  const pickCustomers = useMemo(() => isSeller ? (customers||[]).filter(c => (c.seller||'') === sellerKey) : (customers||[]), [customers, isSeller, sellerKey]);
  const prodOrders = useMemo(() => baseCustom.filter(o=>o.status==='PROD').sort((a,b)=>(b.prodAt||0)-(a.prodAt||0)), [baseCustom]);
  const sasiReady = useMemo(() => sasiOrders.filter(o=>o.status==='READY'), [sasiOrders]);
  const caseReady = useMemo(() => caseOrders.filter(o=>o.status==='READY'), [caseOrders]);
  const moniOrders = useMemo(() => baseCustom.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&((o.status==='STD_PENDING'||!o.status)||isCoatingsOnlyBuild(o)||(o.status==='STD_READY'&&o.staveraPendingAtReady))).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [baseCustom]);
  const stdBuildMoniOrders = useMemo(() => baseCustom.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_BUILD'&&!isCoatingsOnlyBuild(o)).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [baseCustom]);
  const stdBuildDipliOrders = useMemo(() => baseCustom.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_BUILD').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [baseCustom]);
  /** Μονή χωρίς κλειδαριά + μοντάρισμα: αναμονή ολοκλήρωσης μονταρίσματος (stdInProd) — δεν είναι STD_BUILD */
  const montageTabOrders = useMemo(() => baseCustom.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&!o.lock&&o.installation==='ΝΑΙ'&&o.stdInProd&&!o.stdMontDone).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [baseCustom]);
  const dipliOrders = useMemo(() => baseCustom.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&(o.status==='STD_PENDING'||!o.status||o.status==='PENDING')&&o.status!=='STD_BUILD').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [baseCustom]);
  const readyOrders = useMemo(() => baseCustom.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_READY').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [baseCustom]);
  const moniSoldOrders = useMemo(() => [...baseCustom, ...baseSold].filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&o.status==='STD_SOLD').sort((a,b)=>(b.soldAt||0)-(a.soldAt||0)), [baseCustom, baseSold]);
  const dipliReadyOrders = useMemo(() => baseCustom.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_READY').sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)), [baseCustom]);
  const dipliSoldOrders = useMemo(() => [...baseCustom, ...baseSold].filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&o.status==='STD_SOLD').sort((a,b)=>(b.soldAt||0)-(a.soldAt||0)), [baseCustom, baseSold]);
  const moniTotal = useMemo(() => baseCustom.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&(o.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'||!o.sasiType)&&(o.status==='STD_PENDING'||o.status==='STD_BUILD'||!o.status)).length, [baseCustom]);
  const dipliTotal = useMemo(() => baseCustom.filter(o=>o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'&&o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&(o.status==='STD_PENDING'||o.status==='STD_BUILD'||!o.status)).length, [baseCustom]);

  return (
    <View style={{flex:1, flexDirection:'row'}}>
      {smsToast.visible && (
        <View pointerEvents="none" style={{position:'absolute', top:14, alignSelf:'center', left:0, right:0, alignItems:'center', zIndex:9999}}>
          <View style={{backgroundColor: smsToast.kind==='ok'?'#2e7d32':smsToast.kind==='err'?'#c62828':'#1565C0', paddingHorizontal:18, paddingVertical:11, borderRadius:10, shadowColor:'#000', shadowOpacity:0.25, shadowRadius:6, shadowOffset:{width:0,height:3}, elevation:6, maxWidth:'80%'}}>
            <Text style={{color:'white', fontSize:14, fontWeight:'bold', textAlign:'center'}}>{smsToast.text}</Text>
          </View>
        </View>
      )}

      {showCustomerLookup && (() => {
        const q = (customerLookupSearch||'').trim().toLowerCase();
        const filteredCustomers = q.length===0 ? [] : (customers||[]).filter(c =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          [c.phone,c.phone2,c.phone3,c.phoneViber].some(p=>p&&String(p).toLowerCase().includes(q))
        ).slice(0,40);
        const selectedCust = lookupCustomerId ? (customers||[]).find(c=>c.id===lookupCustomerId) : null;
        const nameMatch = (o, c) => o.customer && c.name && o.customer.trim().toLowerCase()===c.name.trim().toLowerCase();
        const notSold = (o) => o.status !== 'STD_SOLD' && o.status !== 'SOLD';
        const customerOrders = selectedCust
          ? (customOrders||[]).filter(o=>notSold(o)&&nameMatch(o, selectedCust)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))
          : [];
        const specialCustomerOrders = selectedCust
          ? (lookupSpecialOrders||[]).filter(o=>notSold(o)&&nameMatch(o, selectedCust)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))
          : [];
        const totalCustomerOrders = customerOrders.length + specialCustomerOrders.length;
        const qSort = (a,b)=>(b.quotedAt||b.createdAt||0)-(a.quotedAt||a.createdAt||0);
        const customerQuotes = selectedCust ? (quotes||[]).filter(o=>nameMatch(o, selectedCust)).sort(qSort) : [];
        const specialCustomerQuotes = selectedCust ? (lookupSpecialQuotes||[]).filter(o=>nameMatch(o, selectedCust)).sort(qSort) : [];
        const totalCustomerQuotes = customerQuotes.length + specialCustomerQuotes.length;
        return (
          <View style={{position:'absolute', top: 80 + custPanPos.y, left: `calc(50% - 220px + ${custPanPos.x}px)`, width:440, backgroundColor:'#fff', borderRadius:14, elevation:24, zIndex:1000, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.35, shadowRadius:12, borderWidth:1, borderColor:'#ddd'}}>
            <View
              style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:12, backgroundColor:'#0d47a1', borderTopLeftRadius:14, borderTopRightRadius:14, ...(Platform.OS==='web'?{cursor:'grab'}:{})}}
              {...(Platform.OS==='web' ? { onMouseDown: handleCustDragStart, onTouchStart: handleCustDragStart } : {})}>
              <Text style={{color:'#fff', fontWeight:'bold', fontSize:14, letterSpacing:1}}>☰ 🔍 ΠΕΛΑΤΕΣ</Text>
              <TouchableOpacity onPress={()=>{ setShowCustomerLookup(false); setCustomerLookupSearch(''); setLookupCustomerId(null); }}>
                <Text style={{color:'#fff', fontSize:18, fontWeight:'bold', paddingHorizontal:6}}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{padding:12}}>
              <View style={{flexDirection:'row', alignItems:'center', backgroundColor:'#f5f5f5', borderRadius:10, borderWidth:1.5, borderColor:'#ddd', paddingHorizontal:10, paddingVertical:8, marginBottom:10}}>
                <Text style={{fontSize:16, marginRight:6, color:'#888'}}>🔍</Text>
                <TextInput
                  style={{flex:1, fontSize:14, color:'#1a1a1a', padding:0, ...(Platform.OS==='web'?{outlineStyle:'none'}:{})}}
                  placeholder="Αναζήτηση πελάτη (όνομα ή τηλέφωνο)..."
                  placeholderTextColor="#aaa"
                  value={customerLookupSearch}
                  onChangeText={v=>{ setCustomerLookupSearch(v); if (lookupCustomerId) setLookupCustomerId(null); }}
                />
                {customerLookupSearch.length>0 && (
                  <TouchableOpacity onPress={()=>{ setCustomerLookupSearch(''); setLookupCustomerId(null); }}>
                    <Text style={{color:'#aaa', fontSize:16, fontWeight:'bold', paddingLeft:6}}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {selectedCust && (
                <View style={{backgroundColor:'#e3f2fd', borderRadius:8, padding:10, marginBottom:8, flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                  <View style={{flex:1, flexDirection:'row', alignItems:'center', gap:8}}>
                    <View style={{flex:1}}>
                      <Text style={{fontSize:15, fontWeight:'bold', color:'#0d47a1'}}>👤 {selectedCust.name}</Text>
                      {selectedCust.phone ? <Text style={{fontSize:12, color:'#555'}}>📞 {selectedCust.phone}</Text> : null}
                      <Text style={{fontSize:11, color:'#777', marginTop:2}}>{totalCustomerOrders} παραγγελ{totalCustomerOrders===1?'ία':'ίες'} · 🛡️ {customerOrders.length} / ⭐ {specialCustomerOrders.length}{totalCustomerQuotes>0?` · 💼 ${totalCustomerQuotes} προσφ.`:''}</Text>
                    </View>
                    <TouchableOpacity onPress={()=>setLookupCustInfo(true)} style={{backgroundColor:'#0d47a1', borderRadius:8, paddingHorizontal:10, paddingVertical:6}}>
                      <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>ℹ ΣΤΟΙΧΕΙΑ</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={()=>{ setLookupCustInfo(false); setLookupCustomerId(null); }} style={{padding:6}}>
                    <Text style={{color:'#0d47a1', fontWeight:'bold', fontSize:12}}>← Πίσω</Text>
                  </TouchableOpacity>
                </View>
              )}

              {lookupCustInfo && selectedCust && (
                <Modal visible transparent animationType="fade" onRequestClose={()=>setLookupCustInfo(false)}>
                  <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', alignItems:'center', padding:20}}>
                    <View style={{backgroundColor:'#fff', borderRadius:14, width:'92%', maxWidth:460, padding:18}}>
                      <Text style={{fontSize:17, fontWeight:'bold', color:'#0d47a1', marginBottom:12}}>👤 ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ</Text>
                      <Text style={{fontSize:15, fontWeight:'bold', color:'#1a1a1a', marginBottom:6}}>{selectedCust.name}</Text>
                      {[selectedCust.phone, selectedCust.phone2, selectedCust.phone3].filter(Boolean).map((p,i)=>(
                        <Text key={i} style={{fontSize:13, color:'#333', marginBottom:3}}>📞 {p}</Text>
                      ))}
                      {selectedCust.phoneViber ? <Text style={{fontSize:13, color: selectedCust.viberOptOut?'#c62828':'#7360f2', fontWeight:'bold', marginBottom:3}}>{selectedCust.viberOptOut?'🚫 ':'📱 '}Viber: {selectedCust.phoneViber}{selectedCust.viberOptOut?' (απεγγράφηκε)':''}</Text> : null}
                      {selectedCust.email ? <Text style={{fontSize:13, color:'#333', marginBottom:3}}>✉️ {selectedCust.email}</Text> : null}
                      {selectedCust.city ? <Text style={{fontSize:13, color:'#333', marginBottom:3}}>📍 {selectedCust.city}</Text> : null}
                      <TouchableOpacity onPress={()=>setLookupCustInfo(false)} style={{marginTop:16, backgroundColor:'#0d47a1', borderRadius:10, padding:12, alignItems:'center'}}>
                        <Text style={{color:'#fff', fontWeight:'bold'}}>ΚΛΕΙΣΙΜΟ</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              )}

              <ScrollView style={{maxHeight:360}} keyboardShouldPersistTaps="handled">
                {!selectedCust && (
                  <>
                    {customerLookupSearch.trim().length===0 && (
                      <Text style={{color:'#999', fontSize:12, textAlign:'center', padding:20}}>Γράψε όνομα ή τηλέφωνο για αναζήτηση πελάτη.</Text>
                    )}
                    {customerLookupSearch.trim().length>0 && filteredCustomers.length===0 && (
                      <Text style={{color:'#aaa', fontSize:12, textAlign:'center', padding:20}}>Δεν βρέθηκαν πελάτες.</Text>
                    )}
                    {filteredCustomers.map(c => {
                      const orderCount = (customOrders||[]).filter(o=>notSold(o)&&nameMatch(o,c)).length + (lookupSpecialOrders||[]).filter(o=>notSold(o)&&nameMatch(o,c)).length + (quotes||[]).filter(o=>nameMatch(o,c)).length + (lookupSpecialQuotes||[]).filter(o=>nameMatch(o,c)).length;
                      return (
                        <TouchableOpacity key={c.id} onPress={()=>setLookupCustomerId(c.id)}
                          style={{padding:10, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                          <View style={{flex:1}}>
                            <Text style={{fontSize:14, fontWeight:'bold', color:'#1a1a1a'}}>{c.name}</Text>
                            {c.phone ? <Text style={{fontSize:12, color:'#666'}}>📞 {c.phone}</Text> : null}
                          </View>
                          <View style={{backgroundColor:'#8B0000', borderRadius:10, paddingHorizontal:8, paddingVertical:3, minWidth:30, alignItems:'center', marginLeft:8}}>
                            <Text style={{color:'#fff', fontWeight:'bold', fontSize:11}}>{orderCount}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {selectedCust && (
                  <>
                    {totalCustomerOrders===0 && totalCustomerQuotes===0 && (
                      <Text style={{color:'#aaa', fontSize:12, textAlign:'center', padding:20}}>Ο πελάτης δεν έχει παραγγελίες ή προσφορές.</Text>
                    )}
                    {customerOrders.length>0 && (
                      <>
                        <View style={{backgroundColor:'#0d47a1', borderRadius:6, paddingHorizontal:8, paddingVertical:4, marginTop:6, marginBottom:2}}>
                          <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>🛡️ ΤΥΠΟΠΟΙΗΜΕΝΕΣ ({customerOrders.length})</Text>
                        </View>
                        {customerOrders.map(o=>renderLookupOrderRow(o, false))}
                      </>
                    )}
                    {specialCustomerOrders.length>0 && (
                      <>
                        <View style={{backgroundColor:'#ef6c00', borderRadius:6, paddingHorizontal:8, paddingVertical:4, marginTop:10, marginBottom:2}}>
                          <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>⭐ ΕΙΔΙΚΕΣ ({specialCustomerOrders.length})</Text>
                        </View>
                        {specialCustomerOrders.map(o=>renderLookupOrderRow(o, true))}
                      </>
                    )}
                    {customerQuotes.length>0 && (
                      <>
                        <View style={{backgroundColor:'#8e24aa', borderRadius:6, paddingHorizontal:8, paddingVertical:4, marginTop:10, marginBottom:2}}>
                          <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>💼 ΠΡΟΣΦΟΡΕΣ ΤΥΠΟΠΟΙΗΜΕΝΩΝ ({customerQuotes.length})</Text>
                        </View>
                        {customerQuotes.map(o=>renderLookupOrderRow(o, false, true))}
                      </>
                    )}
                    {specialCustomerQuotes.length>0 && (
                      <>
                        <View style={{backgroundColor:'#6a1b9a', borderRadius:6, paddingHorizontal:8, paddingVertical:4, marginTop:10, marginBottom:2}}>
                          <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>💼 ΠΡΟΣΦΟΡΕΣ ΕΙΔΙΚΩΝ ({specialCustomerQuotes.length})</Text>
                        </View>
                        {specialCustomerQuotes.map(o=>renderLookupOrderRow(o, true, true))}
                      </>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        );
      })()}

      {/* Modal — καρτέλα παραγγελίας (μόνο προβολή) + εκτύπωση */}
      <Modal visible={lookupOrderModal.visible} transparent animationType="fade" onRequestClose={()=>setLookupOrderModal({visible:false, order:null})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', alignItems:'center', padding:20}}>
          <View style={{backgroundColor:'#fff', borderRadius:14, width:'92%', maxWidth:760, maxHeight:'92%', overflow:'hidden'}}>
            <View style={{backgroundColor:'#0d47a1', padding:14, flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
              <View style={{flex:1}}>
                <Text style={{color:'#fff', fontSize:16, fontWeight:'900', letterSpacing:1}}>📄 ΚΑΡΤΕΛΑ ΠΑΡΑΓΓΕΛΙΑΣ #{lookupOrderModal.order?.orderNo || '—'}</Text>
                <Text style={{color:'rgba(255,255,255,0.75)', fontSize:11, marginTop:2}}>{lookupOrderModal.order?._special?'⭐ ΕΙΔΙΚΗ':'🛡️ ΤΥΠΟΠΟΙΗΜΕΝΗ'} · Μόνο προβολή</Text>
              </View>
              <TouchableOpacity onPress={()=>printSingleOrderFull(lookupOrderModal.order)} style={{backgroundColor:'#fff', paddingHorizontal:14, paddingVertical:8, borderRadius:8, marginRight:10}}>
                <Text style={{color:'#0d47a1', fontWeight:'bold', fontSize:13}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setLookupOrderModal({visible:false, order:null})} style={{padding:6}}>
                <Text style={{color:'#fff', fontSize:22, fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{padding:16}} contentContainerStyle={{paddingBottom:24}}>
              {lookupOrderModal.order && (() => {
                const o = lookupOrderModal.order;
                const tab = getOrderTabInfo(o);
                const fmt = (t)=> t ? new Date(t).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
                const coats = (Array.isArray(o.coatings)?o.coatings:[]).filter(Boolean);
                const stav = (Array.isArray(o.stavera)?o.stavera:[]).filter(s=>s&&s.dim);
                const KV = ({label, val}) => (
                  <View style={{minWidth:150, marginBottom:8}}>
                    <Text style={{fontSize:11, color:'#777'}}>{label}</Text>
                    <Text style={{fontSize:14, fontWeight:'bold', color:'#1a1a1a'}}>{val||'—'}</Text>
                  </View>
                );
                const Section = ({title, children}) => (
                  <View style={{borderWidth:1, borderColor:'#e0e0e0', borderRadius:8, padding:12, marginBottom:10}}>
                    <Text style={{fontSize:11, color:'#777', fontWeight:'bold', letterSpacing:1, marginBottom:8}}>{title}</Text>
                    {children}
                  </View>
                );
                return (
                  <>
                    <View style={{flexDirection:'row', alignItems:'center', gap:10, marginBottom:12}}>
                      <View style={{backgroundColor:tab.color, borderRadius:4, paddingHorizontal:8, paddingVertical:3}}><Text style={{color:'#fff', fontWeight:'bold', fontSize:11}}>{tab.label}</Text></View>
                      <Text style={{fontSize:12, color:'#555'}}>📅 Καταχώρηση: {fmt(o.createdAt)}</Text>
                      <Text style={{fontSize:12, color:'#555'}}>🚚 Παράδοση: {fmt(o.deliveryDate)}</Text>
                    </View>
                    <Section title="Πελάτης"><Text style={{fontSize:15, fontWeight:'bold', color:'#1a1a1a'}}>{o.customer||'—'}</Text></Section>
                    <Section title="Διαστάσεις & Χαρακτηριστικά">
                      <View style={{flexDirection:'row', flexWrap:'wrap', gap:14}}>
                        <KV label="Ύψος (Η)" val={o.h} /><KV label="Πλάτος (W)" val={o.w} /><KV label="Πλευρά" val={o.side} /><KV label="Τεμάχια" val={o.qty||'1'} />
                        {o.armor ? <KV label="Θωράκιση" val={o.armor} /> : null}
                        <KV label="Τύπος Σασί" val={o.sasiType} /><KV label="Τύπος Κάσας" val={o.caseType} /><KV label="Τοποθέτηση" val={o.installation} />
                        {o.heightReduction ? <KV label="Μείωση Ύψους" val={o.heightReduction} /> : null}
                      </View>
                    </Section>
                    <Section title="Κλειδαριά / Εξαρτήματα">
                      <View style={{flexDirection:'row', flexWrap:'wrap', gap:14}}>
                        <KV label="Κλειδαριά" val={o.lock} /><KV label="Χρώμα Εξαρτημάτων" val={o.hardware} />
                        {(o.glassDim||o.glassNotes) ? <KV label="Τζάμι" val={[o.glassDim,o.glassNotes].filter(Boolean).join(' · ')} /> : null}
                      </View>
                    </Section>
                    <Section title="Επενδύσεις"><Text style={{fontSize:14, color:'#1a1a1a'}}>{coats.length?coats.join(', '):'—'}</Text></Section>
                    {stav.length ? (
                      <Section title="Σταθερά">
                        {stav.map((s,i)=>(<Text key={i} style={{fontSize:13, color:'#1a1a1a', marginBottom:3}}>{i+1}. {stavParts(s)}{s.note?` — ${s.note}`:''}</Text>))}
                      </Section>
                    ) : null}
                    {o.notes ? <Section title="Σημειώσεις"><Text style={{fontSize:14, color:'#5d4037'}}>{o.notes}</Text></Section> : null}
                    {o.saleNote ? <Section title="Σημείωση Πώλησης"><Text style={{fontSize:14, color:'#5d4037'}}>{o.saleNote}</Text></Section> : null}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Popup ειδοποίησης πελάτη μετά την αποθήκευση */}
      <Modal visible={notifyModal.visible} transparent animationType="fade" onRequestClose={()=>setNotifyModal({visible:false, order:null})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:420}}>
            <Text style={{fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:6, textAlign:'center'}}>✅ Η παραγγελία αποθηκεύτηκε</Text>
            <Text style={{fontSize:14, color:'#444', marginBottom:16, textAlign:'center'}}>Θέλεις να ειδοποιήσεις τον πελάτη;</Text>
            {(()=>{
              const o = notifyModal.order; if (!o) return null;
              const cust = findCustomerOf(o);
              const hasViber = !!pickViberPhone(cust) && !cust?.viberOptOut;
              const hasEmail = !!cust?.email;
              const hasSms = !!pickSmsPhone(cust);
              const contactLine = [cust?.phone, cust?.phone2, cust?.phone3, cust?.phoneViber && `V:${cust.phoneViber}`].filter(Boolean).join('  ');
              return (
                <>
                  <View style={{backgroundColor:'#f5f5f5', padding:10, borderRadius:8, marginBottom:14}}>
                    <Text style={{fontSize:13, color:'#333'}}>👤 {o.customer||'—'}</Text>
                    <Text style={{fontSize:12, color:'#666', marginTop:2}}>📞 {contactLine||'—'}{cust?.email?`   ✉️ ${cust.email}`:''}</Text>
                  </View>
                  <View style={{flexDirection:'row', gap:8, marginBottom:8}}>
                    <TouchableOpacity disabled={!hasViber} onPress={()=>{ setNotifyModal({visible:false,order:null}); confirmSend('viber',o,()=>notifyViber(o)); }}
                      style={{flex:1, backgroundColor: hasViber?'#7360f2':'#ccc', padding:12, borderRadius:10, alignItems:'center'}}>
                      <Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>📞 Viber</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={!hasEmail} onPress={()=>{ setNotifyModal({visible:false,order:null}); confirmSend('email',o,()=>notifyEmail(o)); }}
                      style={{flex:1, backgroundColor: hasEmail?'#0288d1':'#ccc', padding:12, borderRadius:10, alignItems:'center'}}>
                      <Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>✉️ Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={!hasSms} onPress={()=>{ setNotifyModal({visible:false,order:null}); confirmSend('sms',o,()=>notifySms(o)); }}
                      style={{flex:1, backgroundColor: hasSms?'#1565C0':'#ccc', padding:12, borderRadius:10, alignItems:'center'}}>
                      <Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>📱 SMS</Text>
                    </TouchableOpacity>
                  </View>
                  {(!hasViber||!hasEmail||!hasSms) && (
                    <Text style={{fontSize:11, color:'#888', textAlign:'center', marginBottom:8}}>
                      {cust?.viberOptOut?'🚫 Ο πελάτης απεγγράφηκε από Viber. ':(!hasViber?'⚠️ Λείπει τηλέφωνο Viber. ':'')}{!hasEmail?'⚠️ Λείπει email. ':''}{!hasSms?'⚠️ Λείπει κινητό (SMS).':''}
                    </Text>
                  )}
                  <TouchableOpacity onPress={()=>setNotifyModal({visible:false,order:null})}
                    style={{backgroundColor:'#f5f5f5', padding:12, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd'}}>
                    <Text style={{color:'#555', fontWeight:'bold', fontSize:13}}>Όχι τώρα</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ══ ΚΥΡΙΟ ΠΕΡΙΕΧΟΜΕΝΟ ══ */}
      <View style={{flex:1}}>
      <SellModal visible={sellModal.visible} totalQty={sellModal.totalQty} onConfirm={handleSellConfirm} onCancel={()=>setSellModal({visible:false,orderId:null,totalQty:1})} />
      <SplitModal visible={splitModal.visible} totalQty={parseInt(splitModal.order?.qty)||1} onConfirm={handleSplitConfirm} onCancel={()=>setSplitModal({visible:false,order:null})} />
      <PriceListModal
        visible={priceModal.visible && !isForeman}
        title={priceModal.order ? (priceModal.order.isQuote ? 'Τιμές προσφοράς' : `Τιμές #${priceModal.order.orderNo}`) : 'Καταχώρηση τιμών'}
        startLocked={!!(priceModal.order && (priceModal.order.priceList||[]).length)}
        readOnly={!!(priceModal.order && !priceModal.order.isQuote && (priceModal.order.status==='SOLD' || soldOrders.some(o=>o.id===priceModal.order.id)))}
        initialItems={priceModal.order ? (priceModal.order.priceList||[]) : (customForm.priceList||[])}
        initialDiscount={priceModal.order ? (priceModal.order.priceDiscount||'') : (customForm.priceDiscount||'')}
        initialNote={priceModal.order ? (priceModal.order.priceNote||'') : (customForm.priceNote||'')}
        log={priceModal.order ? (priceModal.order.priceLog||[]) : (customForm.priceLog||[])}
        onClose={()=>setPriceModal({visible:false, order:null})}
        onSave={(items, discount, note)=>{
          if (priceModal.order?.isQuote) savePriceListQuote(priceModal.order, items, discount, note);
          else if (priceModal.order) savePriceList(priceModal.order, items, discount, note);
          else setCustomForm(f=>({...f, priceList: items, priceDiscount: discount, priceNote: note}));
          setPriceModal({visible:false, order:null});
        }}
      />
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
        onCancel={()=>{ setConfirmModal(m=>({...m,visible:false})); if(confirmModal.onCancel) confirmModal.onCancel(); }}
      />

      {taskBasket && Object.keys(taskBasket).length>0 && (()=>{
        const ids = Object.keys(taskBasket);
        const total = ids.reduce((s,id)=>s+Object.keys(taskBasket[id].changes).length, 0);
        const rows = total + ids.length;
        const scrollH = Math.min(640, 50 + rows*29);
        return (
          <View style={[{backgroundColor:'#fff', borderRadius:12, borderWidth:2, borderColor:'#1976d2', padding:14, width:380, maxHeight:'90%', elevation:24, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.3, shadowRadius:12, zIndex:9999}, Platform.OS==='web'?{position:'fixed', right:20, bottom:20}:{position:'absolute', right:20, bottom:20}]}>
            <Text style={{fontSize:19, fontWeight:'bold', color:'#0d47a1', marginBottom:2}}>Αλλαγές προς εφαρμογή ({total})</Text>
            <Text style={{fontSize:14, color:'#666', marginBottom:8}}>Έλεγξε τις αλλαγές. Πάτα ✕ για ακύρωση μίας.</Text>
            <ScrollView style={{maxHeight:scrollH}}>
              {ids.map(id=>{
                const order = customOrders.find(o=>o.id===id) || {orderNo: taskBasket[id].orderNo};
                return (
                  <View key={id} style={{marginBottom:3}}>
                    <Text style={{fontSize:16, fontWeight:'bold', color:'#0d47a1', backgroundColor:'#e3f2fd', paddingHorizontal:8, paddingVertical:2, borderRadius:4}}>Παραγγελία #{taskBasket[id].orderNo}</Text>
                    {Object.entries(taskBasket[id].changes).map(([key, val])=>(
                      <View key={key} style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:1, borderBottomWidth:1, borderBottomColor:'#eee'}}>
                        <Text style={{fontSize:16, fontWeight:'600', color:'#333', flex:1}}>{stdTaskLabel(key, order)}</Text>
                        <Text style={{fontSize:15, fontWeight:'bold', color: val?'#00C851':'#e65100', marginRight:8}}>{val?'✓ θα μπει':'✗ θα βγει'}</Text>
                        <TouchableOpacity onPress={()=>removeTaskDraft(id, key)} style={{width:28, height:28, borderRadius:14, backgroundColor:'#ffeaea', alignItems:'center', justifyContent:'center'}}>
                          <Text style={{color:'#ff4444', fontWeight:'bold', fontSize:16}}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
            <View style={{flexDirection:'row', gap:8, marginTop:10}}>
              <TouchableOpacity onPress={()=>setTaskBasket(null)} style={{flex:1, paddingVertical:11, borderRadius:8, backgroundColor:'#f0f0f0', alignItems:'center'}}>
                <Text style={{fontWeight:'bold', color:'#666', fontSize:16}}>Άκυρο</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={applyTaskBasket} style={{flex:1, paddingVertical:11, borderRadius:8, backgroundColor:'#1976d2', alignItems:'center'}}>
                <Text style={{fontWeight:'bold', color:'#fff', fontSize:16}}>ΟΚ</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {/* ΚΑΛΑΘΙ ΕΝΕΡΓΟΠΟΙΗΣΗΣ ΑΠΟ ΑΝΑΜΟΝΗ */}
      {holdBasket.length>0 && (
        <View style={[{backgroundColor:'#fff', borderRadius:12, borderWidth:2, borderColor:'#2e7d32', padding:14, width:340, maxHeight:'90%', elevation:24, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.3, shadowRadius:12, zIndex:9999}, Platform.OS==='web'?{position:'fixed', right:20, bottom:20}:{position:'absolute', right:20, bottom:20}]}>
          <Text style={{fontSize:19, fontWeight:'bold', color:'#1b5e20', marginBottom:2}}>Ενεργοποίηση από αναμονή ({holdBasket.length})</Text>
          <Text style={{fontSize:14, color:'#666', marginBottom:8}}>Θα μπουν κανονικά στη διαδικασία. Πάτα ✕ για αφαίρεση.</Text>
          <ScrollView style={{maxHeight:400}}>
            {holdBasket.map(id=>{
              const ord = customOrders.find(o=>o.id===id); if(!ord) return null;
              return (
                <View key={id} style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:3, borderBottomWidth:1, borderBottomColor:'#eee'}}>
                  <Text style={{fontSize:15, fontWeight:'bold', color:'#1b5e20', flex:1}}>#{ord.orderNo} {ord.customer||''} · {ord.h}x{ord.w}</Text>
                  <TouchableOpacity onPress={()=>toggleHoldBasket(id)} style={{width:28, height:28, borderRadius:14, backgroundColor:'#ffeaea', alignItems:'center', justifyContent:'center'}}>
                    <Text style={{color:'#ff4444', fontWeight:'bold', fontSize:16}}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
          <View style={{flexDirection:'row', gap:8, marginTop:10}}>
            <TouchableOpacity onPress={()=>setHoldBasket([])} style={{flex:1, paddingVertical:11, borderRadius:8, backgroundColor:'#f0f0f0', alignItems:'center'}}>
              <Text style={{fontWeight:'bold', color:'#666', fontSize:16}}>Άκυρο</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={applyHoldBasket} style={{flex:2, paddingVertical:11, borderRadius:8, backgroundColor:'#2e7d32', alignItems:'center', justifyContent:'center'}}>
              <Text style={{fontWeight:'bold', color:'#fff', fontSize:16, textAlign:'center'}}>ΝΑ ΠΡΟΧΩΡΗΣΕΙ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ΚΑΛΑΘΙ ΑΠΟΣΤΟΛΗΣ ΣΕ ΑΝΑΜΟΝΗ */}
      {holdOutBasket.length>0 && (
        <View style={[{backgroundColor:'#fff', borderRadius:12, borderWidth:2, borderColor:'#e65100', padding:14, width:340, maxHeight:'90%', elevation:24, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.3, shadowRadius:12, zIndex:9999}, Platform.OS==='web'?{position:'fixed', right:20, bottom:20}:{position:'absolute', right:20, bottom:20}]}>
          <Text style={{fontSize:19, fontWeight:'bold', color:'#bf360c', marginBottom:2}}>Θα μπουν σε αναμονή ({holdOutBasket.length})</Text>
          <Text style={{fontSize:14, color:'#666', marginBottom:8}}>Θα χάσουν τη σειρά τους. Πάτα ✕ για αφαίρεση.</Text>
          <ScrollView style={{maxHeight:400}}>
            {holdOutBasket.map(id=>{
              const ord = customOrders.find(o=>o.id===id); if(!ord) return null;
              return (
                <View key={id} style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:3, borderBottomWidth:1, borderBottomColor:'#eee'}}>
                  <Text style={{fontSize:15, fontWeight:'bold', color:'#bf360c', flex:1}}>#{ord.orderNo} {ord.customer||''} · {ord.h}x{ord.w}</Text>
                  <TouchableOpacity onPress={()=>toggleHoldOutBasket(id)} style={{width:28, height:28, borderRadius:14, backgroundColor:'#ffeaea', alignItems:'center', justifyContent:'center'}}>
                    <Text style={{color:'#ff4444', fontWeight:'bold', fontSize:16}}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
          <View style={{flexDirection:'row', gap:8, marginTop:10}}>
            <TouchableOpacity onPress={()=>setHoldOutBasket([])} style={{flex:1, paddingVertical:11, borderRadius:8, backgroundColor:'#f0f0f0', alignItems:'center'}}>
              <Text style={{fontWeight:'bold', color:'#666', fontSize:16}}>Άκυρο</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={applyHoldOutBasket} style={{flex:2, paddingVertical:11, borderRadius:8, backgroundColor:'#e65100', alignItems:'center', justifyContent:'center'}}>
              <Text style={{fontWeight:'bold', color:'#fff', fontSize:16, textAlign:'center'}}>ΝΑ ΜΠΟΥΝ ΣΕ ΑΝΑΜΟΝΗ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ΠΡΟΒΟΛΗ ΕΓΓΡΑΦΩΝ ΠΕΛΑΤΗ */}
      <Modal visible={docViewer.visible} transparent animationType="slide" onRequestClose={()=>setDocViewer(v=>({...v,visible:false}))}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'center', alignItems:'center'}}>
          <View style={[
            { width: docWinSize.w, height: docWinSize.h, maxWidth:'98%', backgroundColor:'#fff', borderRadius:16, overflow:'hidden', elevation:24, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.35, shadowRadius:12 },
            Platform.OS==='web' ? { position:'absolute', top: 30 + docWinPos.y, left: `calc(50% - ${docWinSize.w/2}px + ${docWinPos.x}px)` } : {},
          ]}>
            <View
              style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingVertical:12, backgroundColor:'#0d47a1', ...(Platform.OS==='web'?{cursor:'grab'}:{})}}
              {...(Platform.OS==='web' ? { onMouseDown: startDocDrag('move'), onTouchStart: startDocDrag('move') } : {})}>
              <Text style={{fontSize:15, fontWeight:'bold', color:'#fff'}}>☰ 📎 ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ #{docViewer.orderNo}</Text>
              <TouchableOpacity onPress={()=>setDocViewer(v=>({...v,visible:false}))}><Text style={{fontSize:20, color:'#fff', fontWeight:'bold', paddingHorizontal:6}}>✕</Text></TouchableOpacity>
            </View>
            {docViewer.loading ? (
              <Text style={{textAlign:'center', padding:30, color:'#888'}}>Φόρτωση…</Text>
            ) : docViewer.photos.length===0 ? (
              <View style={{alignItems:'center', padding:20}}>
                <Text style={{color:'#888', marginBottom:16}}>Δεν υπάρχουν έγγραφα.</Text>
                <TouchableOpacity style={{backgroundColor:'#1565C0', borderRadius:8, paddingHorizontal:18, paddingVertical:10}} onPress={()=>{ const o=[...customOrders,...soldOrders,...quotes].find(x=>x.id===docViewer.orderId) || (docViewer.orderId===formSubIdRef.current ? {id:docViewer.orderId, _sellerSub:true} : null); if(o) openDocQR(o,'add'); }}><Text style={{color:'#fff', fontWeight:'bold'}}>➕ ΠΡΟΣΘΗΚΗ</Text></TouchableOpacity>
              </View>
            ) : (()=>{
              const baseDoc = Math.max(220, Math.min(docWinSize.w - 56, docWinSize.h - 250));
              const dragImg = Platform.OS==='web' && docViewer.zoom>1;
              return (
              <View style={{flex:1, padding:12}}>
                <View
                  style={{flex:1, borderRadius:8, backgroundColor:'#000', overflow:'hidden', justifyContent:'center', alignItems:'center', ...(dragImg?{cursor:'grab'}:{})}}
                  {...(dragImg ? { onMouseDown: startDocDrag('pan'), onTouchStart: startDocDrag('pan') } : {})}>
                  <Image source={{uri:docViewer.photos[docViewer.idx]?.img}} style={{width:baseDoc*docViewer.zoom, height:baseDoc*docViewer.zoom, transform:[{translateX:docImgPos.x},{translateY:docImgPos.y},{rotate:`${docViewer.rot}deg`}]}} resizeMode="contain" />
                </View>
                <View style={{flexDirection:'row', justifyContent:'center', alignItems:'center', gap:10, marginTop:8}}>
                  <TouchableOpacity onPress={()=>{setDocImgPos({x:0,y:0});setDocViewer(v=>({...v, zoom:Math.max(1, +(v.zoom-0.5).toFixed(1))}));}} style={{backgroundColor:'#eee', borderRadius:8, width:42, height:38, alignItems:'center', justifyContent:'center'}}><Text style={{fontSize:20, fontWeight:'bold', color:'#333'}}>🔍−</Text></TouchableOpacity>
                  <TouchableOpacity onPress={()=>setDocViewer(v=>({...v, zoom:Math.min(5, +(v.zoom+0.5).toFixed(1))}))} style={{backgroundColor:'#eee', borderRadius:8, width:42, height:38, alignItems:'center', justifyContent:'center'}}><Text style={{fontSize:20, fontWeight:'bold', color:'#333'}}>🔍+</Text></TouchableOpacity>
                  <TouchableOpacity onPress={()=>setDocViewer(v=>({...v, rot:(v.rot+90)%360}))} style={{backgroundColor:'#eee', borderRadius:8, width:42, height:38, alignItems:'center', justifyContent:'center'}}><Text style={{fontSize:20, fontWeight:'bold', color:'#333'}}>↻</Text></TouchableOpacity>
                  <TouchableOpacity onPress={()=>{setDocImgPos({x:0,y:0});setDocViewer(v=>({...v, zoom:1, rot:0}));}} style={{backgroundColor:'#eee', borderRadius:8, paddingHorizontal:12, height:38, alignItems:'center', justifyContent:'center'}}><Text style={{fontSize:13, fontWeight:'bold', color:'#333'}}>ΕΠΑΝΑΦΟΡΑ</Text></TouchableOpacity>
                </View>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:8}}>
                  <TouchableOpacity disabled={docViewer.idx<=0} onPress={()=>{setDocImgPos({x:0,y:0});setDocViewer(v=>({...v,idx:v.idx-1, zoom:1, rot:0}));}} style={{padding:8, opacity:docViewer.idx<=0?0.3:1}}><Text style={{fontSize:20}}>◀</Text></TouchableOpacity>
                  <Text style={{fontWeight:'bold', color:'#555'}}>{docViewer.idx+1} / {docViewer.photos.length}</Text>
                  <TouchableOpacity disabled={docViewer.idx>=docViewer.photos.length-1} onPress={()=>{setDocImgPos({x:0,y:0});setDocViewer(v=>({...v,idx:v.idx+1, zoom:1, rot:0}));}} style={{padding:8, opacity:docViewer.idx>=docViewer.photos.length-1?0.3:1}}><Text style={{fontSize:20}}>▶</Text></TouchableOpacity>
                </View>
                <View style={{flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:10}}>
                  <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#1565C0', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>{ const o=[...customOrders,...soldOrders,...quotes].find(x=>x.id===docViewer.orderId) || (docViewer.orderId===formSubIdRef.current ? {id:docViewer.orderId, _sellerSub:true} : null); if(o) openDocQR(o,'add'); }}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>➕ ΠΡΟΣΘΗΚΗ</Text></TouchableOpacity>
                  <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#f9a825', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>{ const o=[...customOrders,...soldOrders,...quotes].find(x=>x.id===docViewer.orderId) || (docViewer.orderId===formSubIdRef.current ? {id:docViewer.orderId, _sellerSub:true} : null); const ph=docViewer.photos[docViewer.idx]; if(o&&ph) openDocQR(o,'replace',ph.id); }}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🔄 ΑΝΤΙΚΑΤΑΣΤΑΣΗ</Text></TouchableOpacity>
                  {!isSeller && <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#2e7d32', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>printDocPhotos([docViewer.photos[docViewer.idx]], `Έγγραφο #${docViewer.orderNo}`, docViewer.rot)}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🖨️ ΕΚΤΥΠΩΣΗ</Text></TouchableOpacity>}
                  {!isSeller && docViewer.photos.length>1 && <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#1b5e20', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>printDocPhotos(docViewer.photos, `Έγγραφα #${docViewer.orderNo}`)}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🖨️ ΟΛΑ</Text></TouchableOpacity>}
                  <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#b71c1c', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>deleteDocPhoto(docViewer.orderId, docViewer.photos[docViewer.idx]?.id)}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🗑 ΔΙΑΓΡΑΦΗ</Text></TouchableOpacity>
                </View>
              </View>
              );
            })()}
            {Platform.OS==='web' && (
              <View
                style={{position:'absolute', right:0, bottom:0, width:24, height:24, backgroundColor:'rgba(0,0,0,0.18)', borderTopLeftRadius:8, cursor:'nwse-resize'}}
                onMouseDown={startDocDrag('resize')} onTouchStart={startDocDrag('resize')} />
            )}
          </View>
        </View>
      </Modal>

      {/* QR ΑΝΕΒΑΣΜΑΤΟΣ ΕΓΓΡΑΦΟΥ */}
      <Modal visible={docQR.visible} transparent animationType="fade" onRequestClose={()=>setDocQR(d=>({...d,visible:false}))}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'#fff', borderRadius:16, padding:22, width:'85%', maxWidth:440, alignItems:'center'}}>
            <Text style={{fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:6, textAlign:'center'}}>{docQR.mode==='replace'?'🔄 ΑΝΤΙΚΑΤΑΣΤΑΣΗ ΕΓΓΡΑΦΟΥ':'📎 ΚΑΤΑΧΩΡΗΣΗ ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ'}</Text>
            {docQR.status==='done' ? (
              <View style={{alignItems:'center', width:'100%'}}>
                <Text style={{fontSize:40, marginVertical:12}}>✅</Text>
                <Text style={{fontSize:15, fontWeight:'bold', color:'#2e7d32', textAlign:'center', marginBottom:18}}>Η φωτό ανέβηκε!</Text>
                <View style={{flexDirection:'row', gap:8, width:'100%'}}>
                  <TouchableOpacity style={{flex:1, padding:12, borderRadius:10, alignItems:'center', backgroundColor:'#e0e0e0'}} onPress={()=>setDocQR(d=>({...d,visible:false}))}><Text style={{fontWeight:'bold', color:'#555'}}>ΚΛΕΙΣΙΜΟ</Text></TouchableOpacity>
                  <TouchableOpacity style={{flex:1, padding:12, borderRadius:10, alignItems:'center', backgroundColor:'#2e7d32'}} onPress={()=>{ const id=docQR.orderId; setDocQR(d=>({...d,visible:false})); const o=[...customOrders,...soldOrders,...quotes].find(x=>x.id===id) || (id===formSubIdRef.current ? {id, orderNo:''} : null); if(o) openDocViewer(o); }}><Text style={{fontWeight:'bold', color:'#fff'}}>ΠΡΟΒΟΛΗ</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{alignItems:'center', width:'100%'}}>
                <Text style={{fontSize:13, color:'#666', textAlign:'center', marginBottom:14}}>Σκάναρε τον κωδικό με το κινητό για να τραβήξεις φωτό.</Text>
                {docQR.url ? <Image source={{uri:makeQrDataUrl(docQR.url)}} style={{width:230, height:230}} resizeMode="contain" /> : null}
                <Text style={{fontSize:12, color:'#888', marginTop:10, textAlign:'center'}}>Ισχύει 5 λεπτά ή για μία φωτό.</Text>
                <Text style={{fontSize:13, color:'#1565C0', marginTop:8, fontWeight:'bold'}}>Αναμονή για φωτό…</Text>
                <TouchableOpacity style={{marginTop:16, padding:12, borderRadius:10, alignItems:'center', backgroundColor:'#e0e0e0', width:'100%'}} onPress={()=>setDocQR(d=>({...d,visible:false}))}><Text style={{fontWeight:'bold', color:'#555'}}>ΑΚΥΡΟ</Text></TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Προειδοποίηση ματιού — αλουμίνιο/κυπρί στην παραγγελία */}
      <Modal visible={peepholeWarn.visible} transparent animationType="fade" onRequestClose={()=>{}}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', alignItems:'center', padding:20}}>
          <View style={{backgroundColor:'#fff', borderRadius:22, borderWidth:5, borderColor:'#c62828', padding:34, maxWidth:680, width:'100%', shadowColor:'#000', shadowOpacity:0.3, shadowRadius:14, elevation:10}}>
            <Text style={{fontSize:84, textAlign:'center'}}>⚠️</Text>
            <Text style={{fontSize:32, fontWeight:'bold', color:'#c62828', textAlign:'center', marginTop:8, marginBottom:18, lineHeight:40}}>
              ΠΡΟΣΟΧΗ... ΕΡΩΤΗΣΗ ΠΕΛΑΤΗ.{'\n'}ΤΡΥΠΗΜΑ ΕΠΕΝΔΥΣΗΣ ΓΙΑ ΜΑΤΙ
            </Text>
            <View style={{backgroundColor:'#fff3e0', borderRadius:12, padding:16, marginBottom:24}}>
              <Text style={{fontSize:18, color:'#444', textAlign:'center', marginBottom:8}}>Επένδυση στην παραγγελία:</Text>
              <Text style={{fontSize:21, fontWeight:'bold', color:'#bf360c', textAlign:'center'}}>
                {peepholeWarn.coatings.join(' • ')}
              </Text>
            </View>
            <View style={{flexDirection:'row', gap:12}}>
              <TouchableOpacity
                style={{flex:1, backgroundColor:'#2e7d32', paddingVertical:21, borderRadius:14, alignItems:'center'}}
                onPress={()=>{
                  const cb = peepholeWarn.onContinue;
                  setPeepholeWarn({ visible:false, coatings:[], onContinue:null, onAddNote:null });
                  cb && cb();
                }}>
                <Text style={{color:'white', fontSize:18, fontWeight:'bold', textAlign:'center'}}>ΧΩΡΙΣ ΑΛΛΑΓΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flex:1, backgroundColor:'#c62828', paddingVertical:21, borderRadius:14, alignItems:'center'}}
                onPress={()=>{
                  const cb = peepholeWarn.onAddNote;
                  setPeepholeWarn({ visible:false, coatings:[], onContinue:null, onAddNote:null });
                  cb && cb();
                }}>
                <Text style={{color:'white', fontSize:18, fontWeight:'bold', textAlign:'center'}}>ΔΙΟΡΘΩΣΕ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal στοιχείων επενδύσεων (κουμπί «i» στην κάρτα) */}
      <Modal visible={coatDetailsModal.visible} transparent animationType="fade" onRequestClose={()=>setCoatDetailsModal({visible:false,order:null})}>
        <TouchableOpacity activeOpacity={1} onPress={()=>setCoatDetailsModal({visible:false,order:null})} style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',alignItems:'center',padding:20}}>
          <TouchableOpacity activeOpacity={1} onPress={()=>{}} style={{backgroundColor:'#fff8e1',borderWidth:2,borderColor:'#ffb300',borderRadius:14,padding:22,width:'100%',maxWidth:640,elevation:12,shadowColor:'#000',shadowOffset:{width:0,height:6},shadowOpacity:0.35,shadowRadius:14}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:14,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#ffd54f'}}>
              <Text style={{fontSize:20,fontWeight:'900',color:'#e65100',letterSpacing:0.5,flex:1}} numberOfLines={1}>🎨 ΣΤΟΙΧΕΙΑ ΕΠΕΝΔΥΣΕΩΝ #{coatDetailsModal.order?.orderNo}</Text>
              <TouchableOpacity onPress={()=>setCoatDetailsModal({visible:false,order:null})} style={{padding:6}}>
                <Text style={{fontSize:26,color:'#999',fontWeight:'900',lineHeight:26}}>×</Text>
              </TouchableOpacity>
            </View>
            {coatDetailsModal.order&&renderCoatDetailsContent(coatDetailsModal.order)}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
                const restoreScroll = () => setTimeout(()=>{
                  if(Platform.OS==='web') {
                    window.scrollTo({top:scrollPosition, behavior:'smooth'});
                  } else {
                    mainScrollRef.current?.scrollTo({y:scrollPosition, animated:true});
                  }
                }, 300);
                const trigs = peepholeTriggers(customForm.coatings, customForm.notes, customForm.kypri==='ΝΑΙ');
                if (trigs.length > 0) {
                  setPeepholeWarn({
                    visible: true,
                    coatings: trigs,
                    onContinue: async () => { await saveEdited(); restoreScroll(); },
                    onAddNote: async () => {
                      const newNotes = withPeepholeNote(customForm.notes);
                      setCustomForm(f => ({ ...f, notes: newNotes }));
                      await saveEdited({ notes: newNotes });
                      restoreScroll();
                    },
                  });
                } else {
                  await saveEdited();
                  restoreScroll();
                }
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
              {borrowModal.candidates.map((c) => {
                const st = borrowModal.stockType;
                const rlock = c._readyLocked;
                const fifoOk = !rlock && (st === 'case'
                  ? fifoCoversOrder(caseStock, c._donorCk, c.orderNo)
                  : fifoCoversOrder(sasiStock, sasiKey(String(c.h), String(c.w), c.side), c.orderNo));
                const borderLeft = rlock ? '#9e9e9e' : (fifoOk ? '#00C851' : '#aaa');
                const fora = c.side === 'ΑΡΙΣΤΕΡΗ' ? 'ΑΡ' : 'ΔΕΞ';
                return (
                <TouchableOpacity
                  key={c.id}
                  disabled={rlock}
                  style={{backgroundColor: rlock?'#eeeeee':'#f5f5f5', opacity: rlock?0.75:1, borderRadius:10, padding:12, marginBottom:8, borderLeftWidth:4, borderLeftColor:borderLeft}}
                  onPress={()=>{
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
                      <Text style={{fontWeight:'bold', fontSize:14, color:'#1a1a1a'}}>
                        #{c.orderNo} | {c.h}x{c.w} | {fora}
                      </Text>
                      <View style={{flexDirection:'row', alignItems:'center', marginTop:8, alignSelf:'flex-start', backgroundColor: rlock ? '#d7ecd9' : (fifoOk ? '#e8f5e9' : '#eeeeee'), paddingHorizontal:8, paddingVertical:4, borderRadius:6}}>
                        <Text style={{fontSize:11, fontWeight:'bold', color: rlock ? '#2e7d32' : (fifoOk ? '#1b5e20' : '#757575')}}>
                          {rlock ? '🔒 ΕΤΟΙΜΗ — δεν δανείζεται' : (fifoOk ? '✅ ΔΙΑΘΕΣΙΜΟ' : '❌ ΣΕ ΑΝΑΜΟΝΗ')}
                        </Text>
                      </View>
                    </View>
                    <Text style={{fontSize:24, color: rlock?'#bbb':'#1565C0'}}>{rlock?'🔒':'→'}</Text>
                  </View>
                </TouchableOpacity>
                );
              })}
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
              <Text style={{fontWeight:'bold'}}>#{borrowConfirmModal.candidate?.orderNo}</Text>
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

      <View style={{flex:1, flexDirection:'row'}}>
      <View style={{flex:1}}>
      <ScrollView
        ref={mainScrollRef}
        style={{padding:10}}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={onClearSearchHighlight}
        onTouchStart={onClearSearchHighlight}
      >
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
                {showCustomerList&&customerSearch.length>0&&pickCustomers.filter(c=>
                  c.name?.toLowerCase().includes(customerSearch.toLowerCase())||
                  c.phone?.includes(customerSearch)||
                  c.identifier?.toLowerCase().includes(customerSearch.toLowerCase())
                ).slice(0,5).length>0&&(
                  <View style={styles.customerDropdown}>
                    {pickCustomers.filter(c=>
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
          {!isSeller && <TextInput ref={orderNoRef} style={[styles.input, {fontSize:18, fontWeight:'bold', width:90, letterSpacing:1, marginBottom:0}]} placeholder="Ν/Π" keyboardType="numeric" value={customForm.orderNo} selectTextOnFocus
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
            onChangeText={v=>{ setOrderNoAuto(false); setCustomForm({...customForm,orderNo:v}); }}
            onSubmitEditing={()=>{
              const on = normOrderNoStr(customForm.orderNo);
              if (!on) { hRef.current?.focus(); return; }
              const allForDup = [...customOrders, ...soldOrders];
              const exists = allForDup.some(o=>normOrderNoStr(o.orderNo)===on && o.id!==editingOrder?.id);
              if (exists) {
                const base = on;
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
              const on = normOrderNoStr(customForm.orderNo);
              if (!on) return;
              const allForDup = [...customOrders, ...soldOrders];
              const exists = allForDup.some(o=>normOrderNoStr(o.orderNo)===on && o.id!==editingOrder?.id);
              if (exists) {
                const base = on;
                const suggested = computeSuggested(base, allForDup, editingOrder?.id);
                setDupModal({
                  visible:true, base, suggested,
                  onUse:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:suggested})); },
                  onKeep:()=>{ setDupModal(m=>({...m,visible:false})); },
                  onCancel:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:''})); }
                });
              }
            }}
            blurOnSubmit={false} />}
            <View style={{width:110}}>
              <Text style={[vstyles.fieldLabel,{marginBottom:3}]}>Παράδοση</Text>
              <TouchableOpacity style={[vstyles.selectBtn,{paddingVertical:8,paddingHorizontal:5}]} onPress={()=>setShowDatePicker(true)}>
                <Text style={{fontSize:11,color:customForm.deliveryDate?'#1a1a1a':'#aaa'}} numberOfLines={1}>📅 {customForm.deliveryDate||'—'}</Text>
              </TouchableOpacity>
            </View>
            {canHold && (
              <View style={{width:170}}>
                <Text style={[vstyles.fieldLabel,{marginBottom:3}]}>Κατάσταση</Text>
                <TouchableOpacity onPress={()=>setHoldMode(v=>!v)}
                  style={{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor: holdMode?'#eeeeee':'#e8f5e9', borderRadius:8, paddingVertical:8, paddingHorizontal:10, borderWidth:2, borderColor: holdMode?'#9e9e9e':'#00C851'}}>
                  <Text style={{fontSize:26, lineHeight:30}}>{holdMode?'🙈':'👁️'}</Text>
                  <Text style={{fontSize:13, color: holdMode?'#757575':'#2e7d32', fontWeight:'bold'}}>{holdMode?'ΑΝΑΜΟΝΗ':'ΕΝΕΡΓΗ'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* ── ΠΡΟΣΦΟΡΑ: κουμπιά στο ύψος του αριθμού (η προσφορά δεν παίρνει αριθμό) ── */}
            {!editingOrder && !groupState && (
              <View style={{flex:1, alignItems:'flex-end', justifyContent:'flex-end'}}>
                <View style={{flexDirection:'row', gap:6, flexWrap:'wrap', justifyContent:'flex-end'}}>
                  <TouchableOpacity
                    style={[styles.saveBtn, {backgroundColor:'#8e24aa', paddingHorizontal:22, paddingVertical:13, marginTop:0}]}
                    onPress={()=>{
                      Keyboard.dismiss();
                      const trigs = peepholeTriggers(customForm.coatings, customForm.notes, customForm.kypri==='ΝΑΙ');
                      if (trigs.length > 0) setPeepholeWarn({ visible:true, coatings:trigs, onContinue:()=>addAnotherDoorQuote(), onAddNote:()=>{ const n=withPeepholeNote(customForm.notes); setCustomForm(f=>({...f,notes:n})); addAnotherDoorQuote({notes:n}); } });
                      else addAnotherDoorQuote();
                    }}>
                    <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>➕ ΠΟΡΤΑ ΠΡΟΣΦΟΡΑΣ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, {backgroundColor:'#6a1b9a', paddingHorizontal:22, paddingVertical:13, marginTop:0}]}
                    onPress={()=>{
                      Keyboard.dismiss();
                      const trigs = peepholeTriggers(customForm.coatings, customForm.notes, customForm.kypri==='ΝΑΙ');
                      if (trigs.length > 0) setPeepholeWarn({ visible:true, coatings:trigs, onContinue:()=>doFinalSaveQuote(), onAddNote:()=>{ const n=withPeepholeNote(customForm.notes); setCustomForm(f=>({...f,notes:n})); doFinalSaveQuote({notes:n}); } });
                      else doFinalSaveQuote();
                    }}>
                    <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>💼 ΚΑΤΑΧΩΡΗΣΗ ΠΡΟΣΦΟΡΑΣ</Text>
                  </TouchableOpacity>
                </View>
                {quoteGroup && <Text style={{color:'#6a1b9a', fontWeight:'bold', fontSize:12, marginTop:4}}>💼 {quoteGroup.count} {quoteGroup.count===1?'πόρτα':'πόρτες'} στην προσφορά</Text>}
              </View>
            )}
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
                      <TouchableOpacity key={h} style={[vstyles.dimChip,customForm.h===h&&vstyles.dimChipOn]} onPress={()=>setCustomForm(f=>{const n={...f,h:h};return {...n,coatingDetails:recomputeCoatingDetails(n)};})}>
                        <Text style={[vstyles.dimChipTxt,customForm.h===h&&vstyles.dimChipTxtOn]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Πλάτος */}
                  <Text style={[vstyles.fieldLabel,{marginTop:5}]}>Πλάτος</Text>
                  <View style={[vstyles.chipRow,{marginTop:2}]}>
                    {STD_WIDTHS.map(w=>(
                      <TouchableOpacity key={w} style={[vstyles.dimChip,customForm.w===w&&vstyles.dimChipOn]} onPress={()=>setCustomForm(f=>{const n={...f,w:w};return {...n,coatingDetails:recomputeCoatingDetails(n)};})}>
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
                  {/* Τεμ. + Μείωση + Κυπρί + Μοντάρισμα σε μία γραμμή */}
                  <View style={{flexDirection:'row',gap:4,marginTop:6,alignItems:'flex-end'}}>
                    <View style={{flex:0.45}}>
                      <Text style={vstyles.fieldLabelDark}>Τεμ.</Text>
                      <TextInput style={[styles.qtyInput,{marginTop:2,marginBottom:0,width:'100%',fontSize:16,padding:5}]} keyboardType="numeric" value={customForm.qty} onChangeText={v=>setCustomForm({...customForm,qty:v})} selectTextOnFocus/>
                    </View>
                    <View style={{flex:0.45}}>
                      <Text style={[vstyles.fieldLabelDark,{textAlign:'center'}]}>Μείωση Ύψους</Text>
                      <TextInput style={[styles.qtyInput,{borderColor:'#ff9800',color:'#ff9800',marginTop:2,marginBottom:0,width:'100%',fontSize:16,padding:5}]} placeholder="—" keyboardType="numeric" maxLength={2} value={customForm.heightReduction} onChangeText={v=>{ const n=v.replace(/[^0-9]/g,''); setCustomForm({...customForm,heightReduction:n?'-'+n:''}); }} selectTextOnFocus/>
                    </View>
                    <View style={{flex:1, marginLeft:18}}>
                      <Text style={[vstyles.fieldLabelDark,{textAlign:'center'}]}>Κυπρί</Text>
                      <View style={{flexDirection:'row',gap:3,marginTop:2}}>
                        {['ΝΑΙ','ΟΧΙ'].map(v=>(
                          <TouchableOpacity key={v} style={[vstyles.togBtn,customForm.kypri===v&&(v==='ΝΑΙ'?vstyles.togBtnGreen:vstyles.togBtnOn)]} onPress={()=>setCustomForm({...customForm,kypri:v})}>
                            <Text style={[vstyles.togBtnTxt,customForm.kypri===v&&vstyles.togBtnTxtOn]}>{v}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{flex:1, marginLeft:18}}>
                      <Text style={[vstyles.fieldLabelDark,{textAlign:'center'}]}>Μοντάρισμα</Text>
                      <View style={{flexDirection:'row',gap:3,marginTop:2}}>
                        {['ΝΑΙ','ΟΧΙ'].map(v=>(
                          <TouchableOpacity key={v} style={[vstyles.togBtn,customForm.installation===v&&(v==='ΝΑΙ'?vstyles.togBtnGreen:vstyles.togBtnOn)]} onPress={()=>setCustomForm({...customForm,installation:v})}>
                            <Text style={[vstyles.togBtnTxt,customForm.installation===v&&vstyles.togBtnTxtOn]}>{v}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{flex:1, marginLeft:18}}>
                      <Text style={[vstyles.fieldLabelDark,{textAlign:'center'}]}>Τοποθέτηση</Text>
                      <View style={{flexDirection:'row',gap:3,marginTop:2}}>
                        {['ΝΑΙ','ΟΧΙ'].map(v=>(
                          <TouchableOpacity key={v} style={[vstyles.togBtn,(customForm.placement||'ΟΧΙ')===v&&(v==='ΝΑΙ'?vstyles.togBtnGreen:vstyles.togBtnOn)]} onPress={()=>setCustomForm({...customForm,placement:v})}>
                            <Text style={[vstyles.togBtnTxt,(customForm.placement||'ΟΧΙ')===v&&vstyles.togBtnTxtOn]}>{v}</Text>
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
                    <Text style={[vstyles.fieldLabel,{width:90,textAlign:'center'}]}>Διάσταση</Text>
                    <Text style={[vstyles.fieldLabel,{width:45,textAlign:'center'}]}>Τεμ.</Text>
                    <Text style={[vstyles.fieldLabel,{width:74,textAlign:'center'}]}>Σχέδιο</Text>
                    <Text style={[vstyles.fieldLabel,{flex:1}]}>Παρατήρηση</Text>
                  </View>
                  {/* 4 έτοιμες γραμμές — ένα πλαίσιο διάστασης */}
                  {[0,1,2,3].map(i=>{
                    const s = (customForm.stavera||[])[i] || {dimH:'',dimW:'',dim:'',qty:'',design:'',note:''};
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
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dimH:'',dimW:'',dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dimH:'',dimW:'',dim:'',qty:'',note:''});
                            upd[i]={...upd[i],dim:v};
                            setCustomForm({...customForm,stavera:upd});
                          }}
                          onSubmitEditing={()=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dimH:'',dimW:'',dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dimH:'',dimW:'',dim:'',qty:'',note:''});
                            const cur=upd[i];
                            const dim=cur.dim||'';
                            if(dim && !dim.includes(' × ')){
                              // Πρώτο Enter: προσθέτουμε " × " στο τέλος
                              upd[i]={...cur,dim:dim+' × '};
                              setCustomForm({...customForm,stavera:upd});
                              setTimeout(()=>staveraHRefs.current[i]?.focus(),30);
                            } else {
                              // Δεύτερο Enter (έχει ήδη × ): πάμε τεμάχια
                              staveraQtyRefs.current[i]?.focus();
                            }
                          }}
                        />
                        {/* Τεμάχια */}
                        <TextInput
                          ref={el=>{staveraQtyRefs.current[i]=el;}}
                          style={[vstyles.staveraCell,{width:45,textAlign:'center',fontSize:17,fontWeight:'900',color:'#d32f2f'}]}
                          placeholder=""
                          keyboardType="numeric"
                          maxLength={2}
                          returnKeyType="next"
                          selectTextOnFocus
                          value={s.qty||''}
                          onChangeText={v=>{
                            const clean=v.replace(/[^0-9]/g,'');
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dimH:'',dimW:'',dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dimH:'',dimW:'',dim:'',qty:'',note:''});
                            upd[i]={...upd[i],qty:clean};
                            setCustomForm({...customForm,stavera:upd});
                          }}
                          onSubmitEditing={()=>{ staveraGridNoteRefs.current[i]?.focus(); }}
                        />
                        {/* Σχέδιο (tap-cycle: κενό → ΧΙΑΣΤΗ → …) */}
                        <TouchableOpacity
                          style={[vstyles.staveraCell,{width:74,minHeight:32,justifyContent:'center',alignItems:'center',backgroundColor:s.design?'#ede7f6':'#fff'}]}
                          onPress={()=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dimH:'',dimW:'',dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dimH:'',dimW:'',dim:'',qty:'',note:''});
                            upd[i]={...upd[i],design:stavCycle(upd[i].design,designOpts)};
                            setCustomForm({...customForm,stavera:upd});
                          }}>
                          <Text style={{fontSize:12,fontWeight:'700',color:s.design?'#4a148c':'#bbb'}}>{s.design||'—'}</Text>
                        </TouchableOpacity>
                        {/* Παρατήρηση */}
                        <TextInput
                          ref={el=>{staveraGridNoteRefs.current[i]=el;}}
                          style={[vstyles.staveraCell,{flex:1,minHeight:32}]}
                          placeholder="..."
                          returnKeyType="next"
                          blurOnSubmit={false}
                          value={s.note||''}
                          onChangeText={v=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dimH:'',dimW:'',dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dimH:'',dimW:'',dim:'',qty:'',note:''});
                            upd[i]={...upd[i],note:v};
                            setCustomForm({...customForm,stavera:upd});
                          }}
                          onSubmitEditing={()=>{ staveraHRefs.current[i+1]?.focus(); }}
                        />
                      </View>
                    );
                  })}
                  {/* Κολώνες σταθερών: ένα χρώμα + τεμάχια (χρέωση × πόρτες) */}
                  <View style={{flexDirection:'row',gap:3,marginTop:6,alignItems:'center'}}>
                    <Text style={[vstyles.fieldLabel,{width:90,textAlign:'center'}]}>Κολώνες{'\n'}σταθερών</Text>
                    <TextInput
                      style={[vstyles.staveraCell,{width:45,textAlign:'center',fontSize:17,fontWeight:'900',color:'#d32f2f'}]}
                      placeholder="" keyboardType="numeric" maxLength={2} selectTextOnFocus
                      value={customForm.stavColumn?.qty||''}
                      onChangeText={v=>{const clean=v.replace(/[^0-9]/g,'');setCustomForm(f=>({...f,stavColumn:{...(f.stavColumn||{}),qty:clean}}));}}
                    />
                    <TouchableOpacity ref={stavColBtnRef}
                      style={[vstyles.staveraCell,{flex:1,minHeight:32,justifyContent:'center',backgroundColor:customForm.stavColumn?.name?'#ede7f6':'#fff'}]}
                      onPress={()=>{blurAll();stavColBtnRef.current&&stavColBtnRef.current.measureInWindow&&stavColBtnRef.current.measureInWindow((x,y,w,h)=>setStavColAnchor({x,y,w,h}));setShowStavColPicker(true);}}>
                      <Text style={{fontSize:12,fontWeight:'700',color:customForm.stavColumn?.name?'#4a148c':'#bbb'}} numberOfLines={1}>{customForm.stavColumn?.name?String(customForm.stavColumn.name).replace('ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ ',''):'Επιλέξτε χρώμα...'}</Text>
                    </TouchableOpacity>
                  </View>
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
                      <TouchableOpacity style={[vstyles.togBtnSm,customForm.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,sasiType:'ΜΟΝΗ ΘΩΡΑΚΙΣΗ',dipliModel:''})}>
                        <Text style={[vstyles.togBtnSmTxt,customForm.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'&&vstyles.togBtnTxtOn]}>ΜΟΝΗ</Text>
                      </TouchableOpacity>
                      <TouchableOpacity ref={dipliBtnRef} style={[vstyles.togBtnSm,customForm.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&vstyles.togBtnOn]} onPress={()=>{blurAll();if(customForm.sasiType!=='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&!customForm.dipliModel)setCustomForm({...customForm,sasiType:'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ',dipliModel:DIPLI_DEFAULT});dipliBtnRef.current&&dipliBtnRef.current.measureInWindow&&dipliBtnRef.current.measureInWindow((x,y,w,h)=>setDipliAnchor({x,y,w,h}));setShowDipliPicker(true);}}>
                        <Text style={[vstyles.togBtnSmTxt,customForm.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'&&vstyles.togBtnTxtOn]}>{customForm.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?`ΔΙΠΛΗ · ${customForm.dipliModel||DIPLI_DEFAULT}`:'ΔΙΠΛΗ'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {/* ΔΕΞΙΑ: Κλειδαριά + Χρώμα Εξαρτημάτων */}
                  <View style={{flex:2}}>
                    <Text style={vstyles.fieldLabelDark}>Κλειδαριά / Άφαλος</Text>
                    <TouchableOpacity ref={lockBtnRef} style={[vstyles.selectBtn,{marginTop:2,marginBottom:6}]} onPress={()=>{blurAll();lockBtnRef.current&&lockBtnRef.current.measureInWindow&&lockBtnRef.current.measureInWindow((x,y,w,h)=>setLockAnchor({x,y,w,h}));setShowLockPicker(true);}}>
                      <Text style={{fontSize:13,color:(customForm.lock||customForm.cylinder)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{[customForm.lock,customForm.cylinder].filter(Boolean).join(' · ')||'Επιλέξτε...'}</Text>
                      <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                    </TouchableOpacity>
                    <View style={{flexDirection:'row',gap:8}}>
                      <View style={{flex:1}}>
                        <Text style={vstyles.fieldLabelDark}>Χρώμα Εξαρτημάτων</Text>
                        <TouchableOpacity ref={hardwareBtnRef} style={[vstyles.selectBtn,{marginTop:2}]} onPress={()=>{blurAll();hardwareBtnRef.current&&hardwareBtnRef.current.measureInWindow&&hardwareBtnRef.current.measureInWindow((x,y,w,h)=>setHardwareAnchor({x,y,w,h}));setShowHardwarePicker(true);}}>
                          <Text style={{fontSize:13,color:customForm.hardware?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{customForm.hardware||'Επιλέξτε...'}</Text>
                          <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{flex:1}}>
                        <Text style={vstyles.fieldLabelDark}>Διάφορα</Text>
                        <TouchableOpacity ref={miscBtnRef} style={[vstyles.selectBtn,{marginTop:2}]} onPress={()=>{blurAll();miscBtnRef.current&&miscBtnRef.current.measureInWindow&&miscBtnRef.current.measureInWindow((x,y,w,h)=>setMiscAnchor({x,y,w,h}));setShowMiscPicker(true);}}>
                          <Text style={{fontSize:13,color:(customForm.misc&&customForm.misc.length>0)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{(customForm.misc&&customForm.misc.length>0)?(customForm.misc[0]+(customForm.misc.length>1?`  +${customForm.misc.length-1}`:'')):'Επιλέξτε...'}</Text>
                          <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>

                {/* ΓΡΑΜΜΗ 2: Επένδυση — ολόκληρη γραμμή */}
                <Text style={vstyles.fieldLabelDark}>Επένδυση</Text>
                <TouchableOpacity ref={coatingsBtnRef} style={[vstyles.selectBtn,{marginTop:2,marginBottom:8}]} onPress={()=>{blurAll();coatingsBtnRef.current&&coatingsBtnRef.current.measureInWindow&&coatingsBtnRef.current.measureInWindow((x,y,w,h)=>setCoatingsAnchor({x,y,w,h}));setShowCoatingsPicker(true);}}>
                  <Text style={{fontSize:13,color:(customForm.coatings&&customForm.coatings.length>0)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>
                    {(customForm.coatings&&customForm.coatings.length>0)?customForm.coatings.join(', '):'Επιλέξτε...'}
                  </Text>
                  <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                </TouchableOpacity>

                {/* Στοιχεία Επενδύσεων (ανά επιλεγμένη επένδυση) — όπως vaicon-eidikes */}
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:6}}>
                {(customForm.coatings||[]).filter(c=>c&&String(c).trim()).map(name=>{
                  const type = getCoatingType(name);
                  const d = customForm.coatingDetails?.[name] || {};
                  const upd = (k,v)=>setCustomForm(f=>{
                    const prev = f.coatingDetails?.[name] || {};
                    const next = {...prev, [k]:v};
                    if (k==='dim') next.dimUser = true;
                    if (k==='frameColor') next.frameColorUser = true;
                    if (k==='caseColor') next.caseColorUser = true;
                    if (k==='color') {
                      if (!prev.frameColorUser) next.frameColor = v;
                      if (type==='EXO' && !prev.caseColorUser) next.caseColor = v;
                    }
                    if (k==='pihaki' && type==='MESA' && !prev.dimUser) {
                      const newDim = computeCoatingDim(f.h, f.w, 'MESA', !!v);
                      if (newDim) next.dim = newDim;
                    }
                    return {...f, coatingDetails:{...(f.coatingDetails||{}), [name]: next}};
                  });
                  const bg = type==='EXO'?'#FFF3E0':type==='MESA'?'#E8F4FD':'#F5F5F5';
                  const bd = type==='EXO'?'#FF9800':type==='MESA'?'#2196F3':'#BBB';
                  const dimStyle = d.dimUser ? {color:'#d32f2f',fontWeight:'900',fontStyle:'italic'} : {};
                  return (
                    <View key={name} style={{flex:1,minWidth:200,backgroundColor:bg,borderWidth:1.5,borderColor:bd,borderRadius:8,padding:8}}>
                      <Text style={{fontWeight:'800',fontSize:11,color:'#1a1a1a',marginBottom:6,letterSpacing:0.5}}>{name}</Text>
                      <View style={{flexDirection:'row',gap:6,marginBottom:5}}>
                        <View style={{flex:1}}><Text style={vstyles.fieldLabel}>Διάσταση</Text>
                          <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12},dimStyle]} value={d.dim||''} onChangeText={v=>upd('dim',v)}/></View>
                        <View style={{flex:2}}><Text style={vstyles.fieldLabel}>Χρώμα</Text>
                          <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.color||''} onChangeText={v=>upd('color',v)}/></View>
                      </View>
                      <View style={{marginBottom:5}}>
                        <Text style={vstyles.fieldLabel}>Σχέδιο</Text>
                        <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.design||''} onChangeText={v=>upd('design',v)}/>
                      </View>
                      <View style={{flexDirection:'row',gap:6}}>
                        <View style={{flex:1}}><Text style={vstyles.fieldLabel}>Πλ./Είδος Περβ.</Text>
                          <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.frameW||''} onChangeText={v=>upd('frameW',v)}/></View>
                        <View style={{flex:2}}><Text style={vstyles.fieldLabel}>Χρώμα Περβ.</Text>
                          <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.frameColor||''} onChangeText={v=>upd('frameColor',v)}/></View>
                      </View>
                      {type==='EXO'&&(
                        <View style={{flexDirection:'row',gap:6,marginTop:5}}>
                          <View style={{flex:1}}><Text style={vstyles.fieldLabel}>Πλάτος Κάσας</Text>
                            <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.caseW||''} onChangeText={v=>upd('caseW',v)}/></View>
                          <View style={{flex:2}}><Text style={vstyles.fieldLabel}>Χρώμα Κάσας</Text>
                            <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.caseColor||''} onChangeText={v=>upd('caseColor',v)}/></View>
                        </View>
                      )}
                      {type==='MESA'&&(
                        <TouchableOpacity onPress={()=>upd('pihaki', !d.pihaki)} style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:6,paddingVertical:3}}>
                          <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:'#1565C0',backgroundColor:d.pihaki?'#1565C0':'#fff',alignItems:'center',justifyContent:'center'}}>
                            {d.pihaki&&<Text style={{color:'#fff',fontWeight:'900',fontSize:13,lineHeight:13}}>✓</Text>}
                          </View>
                          <Text style={{fontSize:12,fontWeight:'700',color:'#1565C0'}}>Πηχάκι (ξυλογωνιά)</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                </View>

                {/* ΓΡΑΜΜΗ 3: Παρατηρήσεις — ολόκληρη γραμμή */}
                <Text style={vstyles.fieldLabelDark}>Παρατηρήσεις</Text>
                <TextInput style={[vstyles.textInput,{height:55,textAlignVertical:'top',marginTop:2}]} placeholder="Προαιρετικά..." value={customForm.notes} multiline onChangeText={v=>setCustomForm({...customForm,notes:v})}/>

              </View>
            </View>

          

          {/* Κουμπιά αποθήκευσης — διαφορετικά για editing/approval mode */}
          {approveCtx ? (
            <View style={{flexDirection:'row', gap:8, marginTop:4}}>
              <TouchableOpacity
                style={[styles.saveBtn, {flex:1, backgroundColor:'#2e7d32'}]}
                onPress={()=>{ Keyboard.dismiss(); openPriceModal(null); }}>
                <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>💶 ΤΙΜΕΣ{(customForm.priceList||[]).length ? ` (${priceFinalTotal(customForm.priceList, customForm.priceDiscount).toFixed(2).replace('.', ',')}€)` : ''}</Text>
              </TouchableOpacity>
              {sellerFormDocBtn({flex:1})}
              <TouchableOpacity
                style={[styles.saveBtn, {flex:1, backgroundColor:'#8B0000'}]}
                onPress={()=>{ Keyboard.dismiss(); rejectFromForm(); }}>
                <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>✕ ΑΠΟΡΡΙΨΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, {flex:1, backgroundColor:'#00C851'}]}
                onPress={()=>{ Keyboard.dismiss(); approveFromForm(); }}>
                <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>✅ ΕΓΚΡΙΣΗ</Text>
              </TouchableOpacity>
            </View>
          ) : editingOrder ? (
            <View style={{flexDirection:'row', gap:8, marginTop:4}}>
              {!isSeller ? (
              <TouchableOpacity
                style={[styles.saveBtn, {flex:1, backgroundColor:'#2e7d32'}]}
                onPress={()=>{ Keyboard.dismiss(); openPriceModal(null); }}>
                <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>💶 ΤΙΜΕΣ{(customForm.priceList||[]).length ? ` (${priceFinalTotal(customForm.priceList, customForm.priceDiscount).toFixed(2).replace('.', ',')}€)` : ''}</Text>
              </TouchableOpacity>
              ) : null}
              {sellerFormDocBtn({flex:1})}
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
            <View style={{marginTop:4}}>
              {groupState && (
                <Text style={{textAlign:'center', color:'#1565C0', fontWeight:'bold', fontSize:13, marginBottom:6}}>
                  🔗 Συνδεδεμένη παραγγελία{groupState.base ? ` #${groupState.base}` : ''} — {groupState.count} {groupState.count===1?'πόρτα':'πόρτες'} αποθηκευμένες
                </Text>
              )}
              <View style={{flexDirection:'row', gap:8, justifyContent:'center', flexWrap:'wrap'}}>
                {!isSeller ? (
                <TouchableOpacity
                  style={[styles.saveBtn, {backgroundColor:'#2e7d32', paddingHorizontal:22, marginTop:0}]}
                  onPress={()=>{ Keyboard.dismiss(); openPriceModal(null); }}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>💶 ΤΙΜΕΣ{(customForm.priceList||[]).length ? ` (${priceFinalTotal(customForm.priceList, customForm.priceDiscount).toFixed(2).replace('.', ',')}€)` : ''}</Text>
                </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.saveBtn, {backgroundColor:'#555', paddingHorizontal:22, marginTop:0}]}
                  onPress={()=>{ Keyboard.dismiss(); resetForm(); }}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>✕ ΑΚΥΡΟ</Text>
                </TouchableOpacity>
                {sellerFormDocBtn()}
                {!quoteGroup && (<>
                <TouchableOpacity
                  style={[styles.saveBtn, {backgroundColor:'#1565C0', paddingHorizontal:22, marginTop:0}]}
                  onPress={()=>{
                    Keyboard.dismiss();
                    const trigs = peepholeTriggers(customForm.coatings, customForm.notes, customForm.kypri==='ΝΑΙ');
                    if (trigs.length > 0) {
                      setPeepholeWarn({
                        visible: true,
                        coatings: trigs,
                        onContinue: () => addAnotherDoor(),
                        onAddNote: () => {
                          const newNotes = withPeepholeNote(customForm.notes);
                          setCustomForm(f => ({ ...f, notes: newNotes }));
                          addAnotherDoor({ notes: newNotes });
                        },
                      });
                    } else {
                      addAnotherDoor();
                    }
                  }}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>➕ ΠΡΟΣΘΗΚΗ ΝΕΑΣ ΠΟΡΤΑΣ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, {backgroundColor:'#8B0000', paddingHorizontal:22, marginTop:0}]}
                  onPress={()=>{
                    Keyboard.dismiss();
                    const trigs = peepholeTriggers(customForm.coatings, customForm.notes, customForm.kypri==='ΝΑΙ');
                    if (trigs.length > 0) {
                      setPeepholeWarn({
                        visible: true,
                        coatings: trigs,
                        onContinue: () => doFinalSave(),
                        onAddNote: () => {
                          const newNotes = withPeepholeNote(customForm.notes);
                          setCustomForm(f => ({ ...f, notes: newNotes }));
                          doFinalSave({ notes: newNotes });
                        },
                      });
                    } else {
                      doFinalSave();
                    }
                  }}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:15}}>📐 ΑΠΟΘΗΚΕΥΣΗ ΠΑΡΑΓΓΕΛΙΑΣ</Text>
                </TouchableOpacity>
                </>)}
              </View>
            </View>
          )}


          {/* ΠΑΡΑΓΓΕΛΙΕΣ ΤΥΠΟΠΟΙΗΜΕΝΩΝ — κρύβεται όταν formOnly */}
          </>)}
          {/* ═══ ΠΡΟΣΦΟΡΕΣ ═══ */}
          {quotesOnly && (<>
            <Text style={styles.sectionTitle}>💼 ΠΡΟΣΦΟΡΕΣ{isSeller ? ' (οι δικές μου)' : ''}</Text>
            <TextInput style={styles.quoteSearch} placeholder="🔍 Αναζήτηση πελάτη..." placeholderTextColor="#999" value={quoteSearch} onChangeText={setQuoteSearch} />
            {(() => {
              const base = effSellerKey ? quotes.filter(sellerOwnsOrder) : quotes;
              const q = stripAccentsTxt(quoteSearch.trim().toLowerCase());
              const mine = q ? base.filter(x => stripAccentsTxt(String(x.customer||'').toLowerCase()).includes(q)) : base;
              if (mine.length === 0) return <Text style={{textAlign:'center', color:'#999', marginTop:30}}>Δεν υπάρχουν προσφορές.</Text>;
              const groupsMap = {}; const singles = [];
              mine.forEach(q => { if (q.groupId) (groupsMap[q.groupId] = groupsMap[q.groupId] || []).push(q); else singles.push(q); });
              const entries = [
                ...singles.map(q => ({ type:'single', q, ts:q.quotedAt||q.createdAt||0 })),
                ...Object.entries(groupsMap).map(([gid, ds]) => ({ type:'group', gid, doors: ds.slice().sort((a,b)=>(a.groupSeq||0)-(b.groupSeq||0)), q: ds[0], ts: Math.max(...ds.map(d=>d.quotedAt||d.createdAt||0)) })),
              ].sort((a,b)=> b.ts - a.ts);
              const dayBadge = (q) => { const d = quoteDays(q); return (<View style={{backgroundColor: d>=30?'#c62828':d>=7?'#ef6c00':'#2e7d32', borderRadius:6, paddingHorizontal:8, paddingVertical:3, alignSelf:'flex-start'}}><Text style={{color:'#fff', fontSize:12, fontWeight:'bold'}}>⏱ {quoteDaysLabel(q)}</Text></View>); };
              const qBtn = (bg) => ({ backgroundColor:bg, borderRadius:8, paddingHorizontal:12, paddingVertical:8 });
              const qBtnTxt = { color:'#fff', fontWeight:'bold', fontSize:13 };
              const itemBtns = (q) => isForeman ? (
                q.docCount>0 ? (
                  <View style={{flexDirection:'row', gap:8, marginTop:6, flexWrap:'wrap'}}>
                    <TouchableOpacity onPress={()=>openDocViewer(q)} style={qBtn('#6a1b9a')}><Text style={qBtnTxt}>📎 ΕΓΓΡΑΦΟ ({q.docCount})</Text></TouchableOpacity>
                  </View>
                ) : null
              ) : isSeller ? (
                ((q.priceList||[]).length || q.docCount>0) ? (
                  <View style={{flexDirection:'row', gap:10, marginTop:6, flexWrap:'wrap', alignItems:'center'}}>
                    {(q.priceList||[]).length ? <Text style={{fontSize:15, fontWeight:'bold', color:'#2e7d32'}}>💶 {priceFinalTotal(q.priceList, q.priceDiscount).toFixed(2).replace('.', ',')}€</Text> : null}
                    {q.docCount>0 ? <TouchableOpacity onPress={()=>openDocViewer(q)} style={qBtn('#6a1b9a')}><Text style={qBtnTxt}>📎 ΕΓΓΡΑΦΟ ({q.docCount})</Text></TouchableOpacity> : null}
                  </View>
                ) : null
              ) : (
                <View style={{flexDirection:'row', gap:8, marginTop:6, flexWrap:'wrap'}}>
                  <TouchableOpacity onPress={()=>editQuote(q)} style={qBtn('#1565C0')}><Text style={qBtnTxt}>✏️ ΔΙΟΡΘΩΣΗ</Text></TouchableOpacity>
                  <TouchableOpacity onPress={()=>openPriceModal(q)} style={qBtn('#2e7d32')}><Text style={qBtnTxt}>💶 {(q.priceList||[]).length ? priceFinalTotal(q.priceList, q.priceDiscount).toFixed(2).replace('.', ',')+'€' : 'ΤΙΜΗ'}</Text></TouchableOpacity>
                  {q.docCount>0
                    ? <TouchableOpacity onPress={()=>openDocViewer(q)} style={qBtn('#6a1b9a')}><Text style={qBtnTxt}>📎 ΕΓΓΡΑΦΟ ({q.docCount})</Text></TouchableOpacity>
                    : <TouchableOpacity onPress={()=>openDocQR(q,'add')} style={qBtn('#777')}><Text style={qBtnTxt}>📎 ΕΓΓΡΑΦΟ</Text></TouchableOpacity>}
                </View>
              );
              const actions = (entry) => isSeller ? null : (
                <View style={{flexDirection:'row', gap:8, marginTop:8, flexWrap:'wrap'}}>
                  <TouchableOpacity onPress={()=>convertQuoteToOrder(entry.q)} style={{backgroundColor:'#00C851', borderRadius:8, paddingHorizontal:14, paddingVertical:9}}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>✅ ΜΕΤΑΤΡΟΠΗ ΣΕ ΠΑΡΑΓΓΕΛΙΑ</Text></TouchableOpacity>
                  <TouchableOpacity onPress={()=>deleteQuote(entry.q)} style={{backgroundColor:'#c62828', borderRadius:8, paddingHorizontal:14, paddingVertical:9}}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🗑 ΔΙΑΓΡΑΦΗ</Text></TouchableOpacity>
                </View>
              );
              return entries.map(entry => entry.type==='single' ? (
                <View key={entry.q.id} style={[{backgroundColor:'#fff', borderRadius:10, padding:12, marginBottom:8, borderLeftWidth:5, borderLeftColor:'#8e24aa', elevation:2}, searchHL(entry.q.id)]}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', gap:8}}>
                    <Text style={{fontSize:16, fontWeight:'bold', color:'#1a1a1a', flex:1}}>{entry.q.customer || '—'}</Text>
                    {dayBadge(entry.q)}
                  </View>
                  <StdOrderPreview order={entry.q} coatings={coatings} showCustomer={false} />
                  {itemBtns(entry.q)}
                  {actions(entry)}
                </View>
              ) : (
                <View key={entry.gid} style={[{backgroundColor:'#fff', borderRadius:10, padding:12, marginBottom:8, borderLeftWidth:5, borderLeftColor:'#6a1b9a', elevation:2}, searchHL(entry.doors[0]?.id)]}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', gap:8}}>
                    <Text style={{fontSize:16, fontWeight:'bold', color:'#1a1a1a', flex:1}}>{entry.q.customer || '—'}</Text>
                    {dayBadge(entry.q)}
                  </View>
                  <Text style={{fontSize:13, color:'#6a1b9a', fontWeight:'bold', marginTop:2}}>🔗 Προσφορά — {entry.doors.length} πόρτες</Text>
                  {entry.doors.map((d,i)=>(
                    <View key={d.id} style={{borderTopWidth:1, borderTopColor:'#eee', paddingTop:6, marginTop:6}}>
                      <Text style={{fontSize:13, fontWeight:'bold', color:'#6a1b9a'}}>{i+1}.</Text>
                      <StdOrderPreview order={d} coatings={coatings} showCustomer={false} />
                      {itemBtns(d)}
                    </View>
                  ))}
                  {(() => { if (isForeman) return null; const tot = entry.doors.reduce((s,d)=>s+priceFinalTotal(d.priceList, d.priceDiscount),0); return tot ? <Text style={{fontSize:14, fontWeight:'bold', color:'#2e7d32', marginTop:4}}>💶 Σύνολο: {tot.toFixed(2).replace('.', ',')}€</Text> : null; })()}
                  {actions(entry)}
                </View>
              ));
            })()}
          </>)}
          {!formOnly && !quotesOnly && (<>
            {isGuest && !locked && (
              <View style={{ backgroundColor:'#fff3e0', borderWidth:1, borderColor:'#e65100', borderRadius:8, paddingVertical:8, paddingHorizontal:12, marginBottom:8, alignItems:'center' }}>
                <Text style={{ color:'#e65100', fontWeight:'bold', fontSize:13 }}>👁 Λειτουργία ανάγνωσης (Guest) — τα κουμπιά ενεργειών είναι ανενεργά</Text>
              </View>
            )}

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
                  <View key={o.id} nativeID={hlId(o.id)}
                    style={[{backgroundColor:'#fff', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor:cardBorder, elevation:2}, searchHL(o.id)]}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                      <View style={{flex:1, alignSelf:'stretch'}}>
                        {/* ΓΡΑΜΜΗ 1: καταχώρηση — παράδοση */}
                        <StdOrderDatesLine order={o} marginBottom={4} />
                        {/* ΓΡΑΜΜΗ 2: #νούμερο — πελάτης — τεμάχια */}
                        <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                          <Text style={{fontWeight:'900', fontSize:16, color:'#1a1a1a'}}>#{o.orderNo}{noTag(o)}</Text>
                          {(o.groupId || String(o.orderNo||'').includes('-')) ? <Text style={{fontSize:13, color:'#7b1fa2', fontWeight:'bold'}}>🔗</Text> : null}
                          {o.customer?<Text style={{fontSize:14, fontWeight:'bold', color:'#333'}}>{o.customer}</Text>:null}
                          {renderEnteredBy(o)}
                        </View>
                        {/* ΓΡΑΜΜΗ 3: διάσταση — φορά — τύπος σασί — χρώμα εξαρτημάτων */}
                        <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
                          {renderQtyBox(o)}
                          <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.h}x{o.w}</Text>
                          <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
                          <Text style={{fontSize:12, fontWeight:'bold', color: o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'#8B0000':'#1565C0'}}>{o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</Text>
                          {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#555'}}>🎨 {o.hardware}</Text>:null}
                        </View>
                        {/* ΓΡΑΜΜΗ 3: κλειδαριά — τύπος κάσας — επένδυση (με μορφοποίηση + κουμπί i) */}
                        {renderCardCoatLine(o)}
                        {/* ΓΡΑΜΜΗ 4: μείωση ύψους — σταθερά */}
                        {o.heightReduction?<Text style={{fontSize:11, color:'#e65100', fontWeight:'bold', marginTop:2}}>📏 Μείωση: {o.heightReduction}</Text>:null}
                        {o.stavera&&o.stavera.filter(s=>s.dim).length>0?<Text style={{fontSize:11, color:'#555', marginTop:2}}>📐 {o.stavera.filter(s=>s.dim).map(s=>stavParts(s)+(s.note?' '+s.note:'')).join(' | ')}</Text>:null}
                        {/* ΓΡΑΜΜΗ 5: παρατηρήσεις */}
                        {renderNotesWithWarning(o.notes, {fontSize:11, color:'#888', marginTop:2})}
                        <View style={{marginTop:'auto'}}>{renderDocButton(o)}</View>
                      </View>
                      <View style={{alignItems:'flex-end', gap:4, marginLeft:8}}>
                        <View style={{flexDirection:'row', gap:4}}>
                          {/* ΚΑΣΑ — πατήσιμο αν ❌ για δανεισμό */}
                          <TouchableOpacity
                            activeOpacity={hasCase||locked ? 1 : 0.7}
                            onPress={()=>{ if(!hasCase && !locked) handleBorrowRequest(o, 'case'); }}
                            style={{alignItems:'center', backgroundColor: hasCase?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: hasCase?'#00C851':'#ff4444', minWidth:44}}>
                            <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΚΑΣΑ</Text>
                            <Text style={{fontSize:14}}>{hasCase?'✅':'❌'}</Text>
                            {!hasCase&&!locked&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
                          </TouchableOpacity>
                          {/* ΣΑΣΙ — πατήσιμο αν ❌ για δανεισμό */}
                          <TouchableOpacity
                            activeOpacity={sasiOk||locked ? 1 : 0.7}
                            onPress={()=>{ if(!sasiOk && sasiActive && !locked) handleBorrowRequest(o, 'sasi'); }}
                            style={{alignItems:'center', backgroundColor: sasiOk?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: sasiOk?'#00C851':'#ff4444', minWidth:44}}>
                            <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΣΑΣΙ</Text>
                            <Text style={{fontSize:14}}>{sasiOk?'✅':'❌'}</Text>
                            {!sasiOk&&sasiActive&&!locked&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
                          </TouchableOpacity>
                        </View>

                        {/* ΕΠΙΣΤΡΟΦΗ */}
                        {!locked&&!isForeman&&<TouchableOpacity
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
                        </TouchableOpacity>}

                        {/* ΔΙΑΓΡΑΦΗ */}
                        {!locked&&<TouchableOpacity
                          style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignSelf:'stretch', alignItems:'center'}}
                          onPress={async()=>{
                            if(!window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) return;
                            await handleDeleteAndRelease(o);
                          }}>
                          <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
                        </TouchableOpacity>}

                        {renderHoldEye(o, false)}

                        {!locked && sasiActive ? (<>
                          {/* ΜΟΝΗ: κουμπί ΕΤΟΙΜΗ — μόνο αν δεν έχει μοντάρισμα και υπάρχουν κάσα+σασί */}
                          {o.installation!=='ΝΑΙ' && (
                            canMount
                              ? renderToReadyBtn(o, ()=>{
                                  const sasiItem = sasiOrders.find(s=>s.status==='READY'&&String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side);
                                  const caseModelBtn=(o.caseType||'').includes('ΑΝΟΙΧΤΟΥ')?'ΚΑΣΑ ΑΝΟΙΧΤΗ':'ΚΑΣΑ ΚΛΕΙΣΤΗ';
                                  const caseItem = caseOrders.find(s=>s.model===caseModelBtn&&s.status==='READY'&&String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side);
                                  setReadyConfirmModal({visible:true, order:o, sasiItem, caseItem});
                                })
                              : (<View style={{backgroundColor:'#ccc', paddingHorizontal:8, paddingVertical:6, borderRadius:5, alignItems:'center', minWidth:96, opacity:0.6}}>
                                  <Text style={{color:'#fff', fontSize:11, fontWeight:'bold'}}>⏳ ΑΝΑΜΟΝΗ</Text>
                                </View>)
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
                        {locked && sasiActive && o.installation!=='ΝΑΙ' && canMount && renderToReadyInfo(o)}
                        {!locked && !sasiActive && (<>
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
                      {renderNotifyColumn(o)}
                    </View>
                  </View>
                );
              };

              // Κάρτα ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ
              const renderReadyCard = (o) => (
                <View key={o.id} nativeID={hlId(o.id)} style={[{backgroundColor:'#e8f5e9', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor:'#00C851', elevation:2}, searchHL(o.id)]}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <View style={{flex:1, alignSelf:'stretch'}}>
                      <View style={{flexDirection:'row', flexWrap:'wrap', alignItems:'center', gap:8, marginBottom:4}}>
                        {fmtDate(o.createdAt)?<Text style={{fontSize:11, fontWeight:'bold', color:'#007AFF'}}>📅 {fmtDate(o.createdAt)}</Text>:null}
                        {fmtDate(o.readyAt)?<Text style={{fontSize:11, fontWeight:'bold', color:'#2e7d32'}}>✅ {fmtDate(o.readyAt)}</Text>:null}
                      </View>
                      {/* ΓΡΑΜΜΗ 2: #νούμερο — πελάτης — τεμάχια */}
                      <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                        <Text style={{fontWeight:'900', fontSize:16, color:'#1a1a1a'}}>#{o.orderNo}{noTag(o)}</Text>
                        {o.customer?<Text style={{fontSize:14, fontWeight:'bold', color:'#333'}}>{o.customer}</Text>:null}
                        {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:16,fontWeight:'900',color:'#cc0000'}}>{o.qty}τεμ</Text>:null}
                        {o.remainingNote?<Text style={{fontSize:12,fontWeight:'bold',color:'#e65100'}}>({o.remainingNote})</Text>:null}
                      </View>
                      {/* ΓΡΑΜΜΗ 2: διάσταση — φορά — τύπος σασί — χρώμα εξαρτημάτων */}
                      <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
                        <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.h}x{o.w}</Text>
                        <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
                        <Text style={{fontSize:12, fontWeight:'bold', color: o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'#8B0000':'#1565C0'}}>{o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</Text>
                        {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#555'}}>🎨 {o.hardware}</Text>:null}
                      </View>
                      {/* ΓΡΑΜΜΗ 3: κλειδαριά — τύπος κάσας — επένδυση (με μορφοποίηση + κουμπί i) */}
                      {renderCardCoatLine(o)}
                      {/* ΓΡΑΜΜΗ 4: μείωση ύψους — σταθερά */}
                      {o.heightReduction?<Text style={{fontSize:11, color:'#e65100', fontWeight:'bold', marginTop:2}}>📏 Μείωση: {o.heightReduction}</Text>:null}
                      {o.stavera&&o.stavera.filter(s=>s.dim).length>0?<Text style={{fontSize:11, color:'#555', marginTop:2}}>📐 {o.stavera.filter(s=>s.dim).map(s=>stavParts(s)+(s.note?' '+s.note:'')).join(' | ')}</Text>:null}
                      {/* ΓΡΑΜΜΗ 5: παρατηρήσεις — ημερομηνία παράδοσης */}
                      {renderNotesWithWarning(o.notes, {fontSize:11, color:'#888', marginTop:2})}
                      {/* BADGES: ΜΟΝΤΑΡΙΣΜΕΝΗ + ΣΤΑΘΕΡΑ */}
                      <View style={{flexDirection:'row', flexWrap:'wrap', gap:4, marginTop:4}}>
                        {o.stdMounted&&<View style={{backgroundColor:'#1565C0', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}><Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🔧 ΜΟΝΤΑΡΙΣΜΕΝΗ</Text></View>}
                        {(o.stavera&&o.stavera.filter(s=>s.dim).length>0&&!truthyBool(o.staveraDone))&&<View style={{backgroundColor:'#c62828', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}><Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🔴 ΑΝΑΜΟΝΗ ΓΙΑ ΣΤΑΘΕΡΟ</Text></View>}
                        {(o.stavera&&o.stavera.filter(s=>s.dim).length>0&&truthyBool(o.staveraDone))&&<View style={{backgroundColor:'#2e7d32', borderRadius:4, paddingHorizontal:6, paddingVertical:2}}><Text style={{color:'white', fontWeight:'bold', fontSize:11}}>🟢 ΣΤΑΘΕΡΑ</Text></View>}
                      </View>
                      <View style={{marginTop:'auto'}}>{renderDocButton(o)}</View>
                    </View>
                    {renderSaleNote(o)}
                    {!locked&&<View style={{gap:4, marginLeft:8}}>
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
                              message:'Η παραγγελία θα επιστρέψει στο μοντάρισμα (ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ).',
                              confirmText:'ΝΑΙ',
                              onConfirm:async()=>{
                                const { moniPhases: _mp, moniGivenToProd: _mg, ...base } = o;
                                const bt = buildTasksForMoniStdOrder(o) || { montage: false };
                                const upd = { ...base, stdMounted: false, status: 'STD_BUILD', buildTasks: bt, readyAt: null };
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

                      <TouchableOpacity
                        style={{backgroundColor:'#2e7d32', paddingHorizontal:10, paddingVertical:16, borderRadius:6, alignItems:'center', marginTop:14}}
                        onPress={async()=>{
                          const totalQty = parseInt(o.qty)||1;
                          if (totalQty>1) { setSellModal({visible:true, orderId:o.id, totalQty}); return; }
                          if(Platform.OS==='web'){
                            if(window.confirm(`ΠΩΛΗΣΗ\nΠαραγγελία #${o.orderNo}${o.customer?' - '+o.customer:''}\nΕπιβεβαίωση;`)) await applyStdSale(o, totalQty);
                          } else {
                            Alert.alert('📦 Πώληση',`Παραγγελία #${o.orderNo} πωλήθηκε;`,[{text:'ΑΚΥΡΟ',style:'cancel'},{text:'ΝΑΙ',onPress:()=>applyStdSale(o, totalQty)}]);
                          }
                        }}>
                        <Text style={{color:'white', fontSize:14, fontWeight:'bold'}}>💰 ΠΩΛΗΣΗ</Text>
                      </TouchableOpacity>

                    </View>}
                    {renderNotifyColumn(o)}
                  </View>
                </View>
              );

              // Κάρτα ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ
              const renderSoldCard = (o) => (
                <View key={o.id} nativeID={hlId(o.id)} style={[{backgroundColor:'#f5f5f5', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:5, borderLeftColor: o.fromMenon?'#7b1fa2':'#888', elevation:1}, searchHL(o.id)]}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <View style={{flex:1, alignSelf:'stretch'}}>
                      {/* Badge αν προέρχεται από ΜΕΝΟΝΤΑ */}
                      {o.fromMenon&&<View style={{backgroundColor:'#7b1fa2',borderRadius:4,paddingHorizontal:6,paddingVertical:2,alignSelf:'flex-start',marginBottom:4}}><Text style={{color:'white',fontWeight:'bold',fontSize:10}}>📦 ΑΠΟ ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ</Text></View>}
                      {/* Καταχώρηση · έτοιμη · πώληση */}
                      <View style={{flexDirection:'row', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                        {fmtDate(o.createdAt)?<Text style={{fontSize:11, fontWeight:'bold', color:'#007AFF'}}>📅 {fmtDate(o.createdAt)}</Text>:null}
                        {fmtDate(o.readyAt)?<Text style={{fontSize:11, fontWeight:'bold', color:'#2e7d32'}}>✅ {fmtDate(o.readyAt)}</Text>:null}
                        {o.soldAt?<Text style={{fontSize:11,color:'#00796B',fontWeight:'bold'}}>💰 {fmtDate(o.soldAt)}</Text>:null}
                      </View>
                      {/* ΓΡΑΜΜΗ 1: #νούμερο — πελάτης — τεμάχια */}
                      <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap', marginTop:2}}>
                        <Text style={{fontWeight:'900', fontSize:15, color:'#333'}}>#{o.orderNo}{noTag(o)}</Text>
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
                          ].filter(Boolean).join(' — ')}
                          {(o.lock||o.caseType||(o.caseMaterial&&o.caseMaterial!=='DKP'))&&o.coatings&&o.coatings.length>0?' — ':''}
                          {o.coatings&&o.coatings.length>0?<Text>🎨 {o.coatings.map((n,i)=>(<Text key={i} style={coatingStyle(n,11)}>{i>0?', ':''}{n}</Text>))}</Text>:null}
                        </Text>
                      )}
                      {/* ΓΡΑΜΜΗ 4: μείωση ύψους — σταθερά */}
                      {o.heightReduction?<Text style={{fontSize:11,color:'#e65100',fontWeight:'bold',marginTop:2}}>📏 Μείωση: {o.heightReduction}</Text>:null}
                      {o.stavera&&o.stavera.filter(s=>s.dim).length>0?<Text style={{fontSize:11,color:'#666',marginTop:2}}>📐 {o.stavera.filter(s=>s.dim).map(s=>stavParts(s)+(s.note?' '+s.note:'')).join(' | ')}</Text>:null}
                      {/* ΓΡΑΜΜΗ 5: μοντάρισμα */}
                      {o.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:3}}><View style={{backgroundColor:'#1565C0',borderRadius:4,paddingHorizontal:6,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:11}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
                      {/* ΓΡΑΜΜΗ 6: παρατηρήσεις */}
                      {renderNotesWithWarning(o.notes, {fontSize:11, color:'#888', marginTop:2})}
                      {/* menonNotes — εμφανίζεται μόνο αν προέρχεται από ΜΕΝΟΝΤΑ */}
                      {o.fromMenon&&o.menonNotes?<Text style={{fontSize:11, color:'#7b1fa2', fontWeight:'bold', marginTop:2}}>📝 {o.menonNotes}</Text>:null}
                      <View style={{marginTop:'auto'}}>{renderDocButton(o)}</View>
                    </View>
                    {renderSaleNote(o)}
                    {!locked&&<View style={{gap:4, marginLeft:8}}>
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
                    </View>}
                  </View>
                </View>
              );

              // Φιλτράρω ανά status — οι λίστες είναι memoized στο component level

              // ΜΟΝΗ — έλεγχος με βάση reservations[]
              const moniCards = applyListSort(moniOrders,'moni-orders').map(o=>{
                // Παραγγελίες «μόνο επενδύσεις»: ίδια κάρτα/συμπεριφορά με ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ, κουτάκια οριζόντια
                if (isCoatingsOnlyBuild(o)) return renderBuildCard(o, { ependHorizontal:true });
                const sk = sasiKey(String(o.h), String(o.w), o.side);
                const ck = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                // Κάλυψη (greedy, κοινή λογική με την οθόνη στοκ)
                const checkStock = (stockMap, key, orderNo) => stockCovers(stockMap?.[key], orderNo, readyNos);
                const hasSasi = checkStock(sasiStock, sk, o.orderNo);
                const hasCase = checkStock(caseStock, ck, o.orderNo);
                return renderStdCard(o, hasSasi, hasCase, true);
              });

              // ΔΙΠΛΗ — έλεγχος με νέο stock
              const dipliCards = dipliOrders.map(o=>{
                const ckD = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                // Κάλυψη (greedy, κοινή λογική με την οθόνη στοκ)
                const checkStock = (stockMap, key, orderNo) => stockCovers(stockMap?.[key], orderNo, readyNos);
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
                  {/* ΣΕ ΑΝΑΜΟΝΗ — ΜΟΝΗ */}
                  {canSeeHold&&showSec('hold')&&(<>
                    <View style={[styles.listHeader,{backgroundColor:'#616161'}]}>
                      <Text style={styles.listHeaderText}>⏳ ΣΕ ΑΝΑΜΟΝΗ ({holdMoniOrders.length})</Text>
                    </View>
                    {holdMoniOrders.length>0?holdMoniOrders.map(o=>renderHoldCard(o)):
                      <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν παραγγελίες σε αναμονή</Text>}
                  </>)}
                  {/* ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ — ΜΟΝΗ */}
                  {showSec('build')&&(forcedTab||stdBuildMoniOrders.length>0)&&(
                    <>
                      <TouchableOpacity
                        style={[styles.listHeader,{backgroundColor:'#e65100', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}
                        onPress={()=>toggleSection('stdBuildMoni')}>
                        <View style={{flexDirection:'row', alignItems:'center', gap:14}}>
                          <Text style={styles.listHeaderText}>🔨 ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ ({stdBuildMoniOrders.length})</Text>
                          {renderSortBtns('moni-build')}
                        </View>
                        {!isSeller && <View style={{flexDirection:'row', gap:6, alignItems:'center'}}>
                          <TouchableOpacity
                            style={{backgroundColor:'white', paddingHorizontal:8, paddingVertical:4, borderRadius:6}}
                            onPress={e=>{e.stopPropagation?.(); setBuildFilterOpen(v=>!v);}}>
                            <Text style={{color:'#e65100', fontSize:10, fontWeight:'bold'}}>🖨️ ΕΠΙΛΟΓΗ</Text>
                          </TouchableOpacity>
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
                        </View>}
                      </TouchableOpacity>
                      {expanded.stdBuildMoni&&applyListSort(stdBuildMoniOrders,'moni-build').map(o=>renderBuildCard(o))}
                    </>
                  )}

                  {/* Header παραγγελιών με εκτύπωση */}
                  {showSec('orders')&&(<>
                  <View style={[styles.listHeader,{backgroundColor:'#5c6bc0', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}>
                    <View style={{flexDirection:'row', alignItems:'center', gap:14}}>
                      <Text style={styles.listHeaderText}>● ΠΑΡΑΓΓΕΛΙΕΣ ({moniOrders.length})</Text>
                      {renderSortBtns('moni-orders')}
                    </View>
                    {!isSeller && <View style={{flexDirection:'row', gap:6, alignItems:'center'}}>
                      <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
                        onPress={()=>{setCoatPrintOpen(false); setPlacePrintOpen(v=>!v);}}>
                        <Text style={{color:'#5c6bc0', fontSize:11, fontWeight:'bold'}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
                        onPress={()=>{setPlacePrintOpen(false); setCoatPrintOpen(v=>!v);}}>
                        <Text style={{color:'#5c6bc0', fontSize:11, fontWeight:'bold'}}>🎨 ΕΠΕΝΔΥΣΕΙΣ</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
                        onPress={()=>handleStdPrint(moniOrders,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΠΑΡΑΓΓΕΛΙΕΣ',caseReady,sasiReady)}>
                        <Text style={{color:'#5c6bc0', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>
                    </View>}
                  </View>
                  {moniCards.length>0?moniCards:
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν παραγγελίες μονής θωράκισης</Text>
                  }

                  {!isGuest && !isSeller && montageTabOrders.length>0&&(
                    <>
                      <View style={[styles.listHeader,{backgroundColor:'#6d4c41', marginTop:8}]}>
                        <Text style={styles.listHeaderText}>🪛 ΜΟΝΤΑΡΙΣΜΑ ΑΠΟ STOCK ({montageTabOrders.length})</Text>
                      </View>
                      {montageTabOrders.map(o=>{
                      const hasStaveraO = o.stavera&&o.stavera.filter(s=>s.dim).length>0;
                      return (
                        <View key={o.id} style={[{backgroundColor:'#f3e5f5', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:4, borderLeftColor:'#7b1fa2', elevation:1}, searchHL(o.id)]}>
                          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                            <View style={{flex:1}}>
                              <StdOrderDatesLine order={o} marginBottom={2} />
                              <Text style={{fontWeight:'bold', fontSize:13}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                              <Text style={{fontSize:12, color:'#555', marginTop:1}}>{o.h}x{o.w} | {o.side}</Text>
                              {o.qty&&parseInt(o.qty)>1?<Text style={{fontSize:12,fontWeight:'bold',color:'#cc0000'}}>Τεμ: {o.qty}</Text>:null}
                              {o.hardware?<Text style={{fontSize:11,color:'#555'}}>🎨 {o.hardware}</Text>:null}
                              {hasStaveraO&&<View style={{backgroundColor:'#E65100',borderRadius:4,paddingHorizontal:6,paddingVertical:2,alignSelf:'flex-start',marginTop:3}}><Text style={{color:'white',fontWeight:'bold',fontSize:10}}>⏳ ΕΚΚΡΕΜΕΙ ΣΤΑΘΕΡΟ</Text></View>}
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
                    </>
                    )}
                  </>)}

                  {showSec('ready')&&(<>
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#00796B', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('stdReady')}>
                    <View style={{flexDirection:'row', alignItems:'center', gap:14}}>
                      <Text style={styles.listHeaderText}>📦 ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ ({readyOrders.length})</Text>
                      {expanded.stdReady&&renderSortBtns('moni-ready')}
                    </View>
                    <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                      {expanded.stdReady&&!isSeller&&<TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                        onPress={()=>handleStdPrint(readyOrders,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ',caseReady,sasiReady)}>
                        <Text style={{color:'#00796B', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>}
                    </View>
                  </TouchableOpacity>
                  {expanded.stdReady&&(readyOrders.length>0?applyListSort(readyOrders,'moni-ready').map(o=>renderReadyCard(o)):
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν έτοιμα</Text>
                  )}
                  </>)}

                  {!isGuest && !isSeller && (<>
                  {/* ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ */}
                  {showSec('sold')&&(<>
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#555', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('stdSold')}>
                    <View style={{flexDirection:'row', alignItems:'center', gap:14}}>
                      <Text style={styles.listHeaderText}>🗂 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ({moniSoldOrders.length})</Text>
                      {expanded.stdSold&&renderSortBtns('moni-sold')}
                    </View>
                    <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                      {expanded.stdSold&&moniSoldOrders.length>0&&<TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                        onPress={()=>handleStdPrint(moniSoldOrders,'ΜΟΝΗ ΘΩΡΑΚΙΣΗ — ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ',caseReady,sasiReady)}>
                        <Text style={{color:'#555', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>}
                    </View>
                  </TouchableOpacity>
                  {expanded.stdSold&&(moniSoldOrders.length>0?applyListSort(moniSoldOrders,'moni-sold').map(o=>renderSoldCard(o)):
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν πωλήσεις</Text>
                  )}
                  </>)}

                  {/* ΜΕΝΟΝΤΑ — ΜΟΝΗ */}
                  {showSec('menon')&&(<>
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#4a148c', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('moniSasiStock')}>
                    <Text style={styles.listHeaderText}>📦 ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ ({dipliSasiStock.filter(s=>!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ').length})</Text>
                  </TouchableOpacity>
                  {expanded.moniSasiStock&&dipliSasiStock.filter(s=>!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ').length===0&&(
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν μένοντα</Text>
                  )}
                  {expanded.moniSasiStock&&dipliSasiStock.filter(s=>!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ').map(s=>(
                    <View key={s.id} style={{backgroundColor:'white', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:5, borderLeftColor:'#9c27b0', elevation:1}}>
                      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <View style={{flex:1}}>
                          <StdOrderDatesLine order={s} marginBottom={2} />
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
                        {!locked&&<View style={{gap:4, marginLeft:8}}>
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
                        </View>}
                      </View>
                    </View>
                  ))}
                  </>)}
                  </>)}
                </>)}

                {/* ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ */}
                {(stdTab==='ΔΙΠΛΗ'&&expanded.stdDipliOpen || forcedTab==='ΔΙΠΛΗ')&&(<>
                  {/* ΣΕ ΑΝΑΜΟΝΗ — ΔΙΠΛΗ */}
                  {canSeeHold&&showSec('hold')&&(<>
                    <View style={[styles.listHeader,{backgroundColor:'#616161'}]}>
                      <Text style={styles.listHeaderText}>⏳ ΣΕ ΑΝΑΜΟΝΗ ({holdDipliOrders.length})</Text>
                    </View>
                    {holdDipliOrders.length>0?holdDipliOrders.map(o=>renderHoldCard(o)):
                      <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν παραγγελίες σε αναμονή</Text>}
                  </>)}
                  {/* ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ — ΔΙΠΛΗ */}
                  {showSec('build')&&(forcedTab||stdBuildDipliOrders.length>0)&&(
                    <>
                      <TouchableOpacity
                        style={[styles.listHeader,{backgroundColor:'#e65100', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}
                        onPress={()=>toggleSection('stdBuildDipli')}>
                        <View style={{flexDirection:'row', alignItems:'center', gap:14}}>
                          <Text style={styles.listHeaderText}>🔨 ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ ({stdBuildDipliOrders.length})</Text>
                          {renderSortBtns('dipli-build')}
                        </View>
                        {!isSeller && <View style={{flexDirection:'row', gap:6, alignItems:'center'}}>
                          <TouchableOpacity
                            style={{backgroundColor:'white', paddingHorizontal:8, paddingVertical:4, borderRadius:6}}
                            onPress={e=>{e.stopPropagation?.(); setBuildFilterOpen(v=>!v);}}>
                            <Text style={{color:'#e65100', fontSize:10, fontWeight:'bold'}}>🖨️ ΕΠΙΛΟΓΗ</Text>
                          </TouchableOpacity>
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
                        </View>}
                      </TouchableOpacity>
                      {expanded.stdBuildDipli&&applyListSort(stdBuildDipliOrders,'dipli-build').map(o=>{
                        const ckD = caseKey(String(o.h), String(o.w), o.side, o.caseType);
                        const checkStock = (stockMap, key) => stockCovers(stockMap?.[key], o.orderNo, readyNos);
                        const tasks = o.buildTasks||{};
                        const hasCaseReserved = !('case' in tasks);
                        const hasCaseOk = !hasCaseReserved || checkStock(caseStock, ckD);
                        const stockOk = hasCaseOk;
                        const allDone = Object.keys(tasks).length>0 && Object.values(tasks).every(v=>v===true);
                        return (
                          <View key={o.id} nativeID={hlId(o.id)} style={[{backgroundColor:'#fff', borderRadius:8, marginBottom:6, borderLeftWidth:5, borderLeftColor: allDone?'#00C851':'#e65100', elevation:2, padding:10}, searchHL(o.id)]}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                              <View style={{flex:1, alignSelf:'stretch'}}>
                                <StdOrderDatesLine order={o} marginBottom={4} />
                                {/* ΓΡΑΜΜΗ 2: #νούμερο — πελάτης — τεμάχια */}
                                <View style={{flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                                  <Text style={{fontWeight:'900', fontSize:16, color:'#1a1a1a'}}>#{o.orderNo}{noTag(o)}</Text>
                                  {o.customer?<Text style={{fontSize:14, fontWeight:'bold', color:'#333'}}>{o.customer}</Text>:null}
                                  {renderEnteredBy(o)}
                                </View>
                                {/* ΓΡΑΜΜΗ 3: διάσταση — φορά — ΔΙΠΛΗ — χρώμα */}
                                <View style={{flexDirection:'row', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap'}}>
                                  {renderQtyBox(o)}
                                  <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.h}x{o.w}</Text>
                                  <Text style={{fontSize:15, fontWeight:'900', color:'#1a1a1a'}}>{o.side==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ':'ΔΕΞ ►'}</Text>
                                  <Text style={{fontSize:12, fontWeight:'bold', color:'#8B0000'}}>ΔΙΠΛΗ</Text>
                                  {o.hardware?<Text style={{fontSize:12, fontWeight:'bold', color:'#555'}}>🎨 {o.hardware}</Text>:null}
                                </View>
                                {/* ΓΡΑΜΜΗ 3: κλειδαριά — τύπος κάσας — επένδυση (με μορφοποίηση + κουμπί i) */}
                                {renderCardCoatLine(o)}
                                {/* ΓΡΑΜΜΗ 4: μείωση — σταθερά */}
                                {(o.heightReduction||(o.stavera&&o.stavera.filter(s=>s.dim).length>0))&&(
                                  <Text style={{fontSize:11, color:'#555', marginTop:2}}>
                                    {o.heightReduction?<Text style={{color:'#e65100',fontWeight:'bold'}}>📏 {o.heightReduction}</Text>:null}
                                    {o.heightReduction&&o.stavera&&o.stavera.filter(s=>s.dim).length>0?' — ':''}
                                    {o.stavera&&o.stavera.filter(s=>s.dim).length>0?`📐 ${o.stavera.filter(s=>s.dim).map(s=>stavParts(s)+(s.note?' '+s.note:'')).join(' | ')}`:null}
                                  </Text>
                                )}
                                {/* ΓΡΑΜΜΗ 5: παρατηρήσεις */}
                                {renderNotesWithWarning(o.notes, {fontSize:11, color:'#888', marginTop:2})}
                                {o.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
                                {o.placement==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>📍 ΤΟΠΟΘΕΤΗΣΗ</Text></View></View>}
                                {/* CHECKBOXES ΟΡΙΖΟΝΤΙΑ */}
                                <View style={{marginTop:6, flexDirection:'row', flexWrap:'wrap', gap:6, alignItems:'center'}}>
                                  {(() => {
                                    const sasiReady = ('sasi' in tasks) ? !!tasks.sasi : true;
                                    return Object.entries(tasks).filter(([key])=>!key.startsWith('epend')).map(([key, rawDone])=>{
                                    const draft = (taskBasket && taskBasket[o.id]) ? taskBasket[o.id].changes : null;
                                    const pending = !!draft && (key in draft);
                                    const done = pending ? draft[key] : rawDone;
                                    const isMontageTask = key === 'montage';
                                    const disabled = !done && isMontageTask && !sasiReady;
                                    const borderColor = pending ? '#1976d2' : (done ? '#00C851' : (disabled ? '#bbb' : '#e65100'));
                                    const textColor = pending ? '#1976d2' : (done ? '#00C851' : (disabled ? '#888' : '#e65100'));
                                    const bg = done ? '#e8f5e9' : (disabled ? '#f5f5f5' : '#fff3e0');
                                    return (
                                      <TouchableOpacity key={key}
                                        disabled={disabled}
                                        style={{flexDirection:'row', alignItems:'center', gap:4, backgroundColor:bg, borderRadius:6, paddingHorizontal:8, paddingVertical:5, borderWidth:1, borderColor, opacity: disabled?0.6:1, ...(pending?{borderStyle:'dashed'}:{})}}
                                        onPress={()=>toggleTaskDraft(o, key)}>
                                        <View style={{width:18, height:18, borderRadius:4, borderWidth:2, borderColor, backgroundColor: done?'#00C851':'white', alignItems:'center', justifyContent:'center'}}>
                                          {done&&<Text style={{color:'white',fontWeight:'bold',fontSize:10}}>✓</Text>}
                                        </View>
                                        <Text style={{fontSize:11, color:textColor, fontWeight:'bold'}}>{stdTaskLabel(key, o)}</Text>
                                      </TouchableOpacity>
                                    );
                                  });
                                  })()}
                                  {renderEpendStack(o, tasks)}
                                </View>
                                <View style={{marginTop:'auto'}}>{renderDocButton(o)}</View>
                              </View>
                              <View style={{alignItems:'flex-end', gap:4, marginLeft:8}}>
                                {hasCaseReserved&&(
                                <TouchableOpacity
                                  activeOpacity={hasCaseOk||locked ? 1 : 0.7}
                                  onPress={()=>{ if(!hasCaseOk && !locked) handleBorrowRequest(o, 'case'); }}
                                  style={{alignItems:'center', backgroundColor: hasCaseOk?'#e8f5e9':'#ffeaea', borderRadius:5, padding:4, borderWidth:1, borderColor: hasCaseOk?'#00C851':'#ff4444', minWidth:44}}>
                                  <Text style={{fontSize:9, fontWeight:'bold', color:'#555'}}>ΚΑΣΑ</Text>
                                  <Text style={{fontSize:14}}>{hasCaseOk?'✅':'❌'}</Text>
                                  {!hasCaseOk&&!locked&&<Text style={{fontSize:7, color:'#ff4444', fontWeight:'bold'}}>πάτα</Text>}
                                </TouchableOpacity>
                                )}

                                {/* ΕΠΙΣΤΡΟΦΗ */}
                                {!locked&&!isForeman&&<TouchableOpacity
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
                                </TouchableOpacity>}

                                {!locked&&<TouchableOpacity
                                  style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignItems:'center'}}
                                  onPress={async()=>{
                                    if(!window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) return;
                                    await handleDeleteAndRelease(o);
                                  }}>
                                  <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
                                </TouchableOpacity>}
                                {renderHoldEye(o, false)}
                                {!locked && allDone && stockOk && renderToReadyBtn(o)}
                                {locked && allDone && stockOk && renderToReadyInfo(o)}
                              </View>
                              {renderNotifyColumn(o)}
                            </View>
                          </View>
                        );
                      })}
                    </>
                  )}


                  {/* ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ ΔΙΠΛΗ */}
                  {showSec('ready')&&(<>
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#00796B', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('stdReadyD')}>
                    <View style={{flexDirection:'row', alignItems:'center', gap:14}}>
                      <Text style={styles.listHeaderText}>📦 ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ ({dipliReadyOrders.length})</Text>
                      {expanded.stdReadyD&&renderSortBtns('dipli-ready')}
                    </View>
                    <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                      {expanded.stdReadyD&&dipliReadyOrders.length>0&&!isSeller&&<TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                        onPress={()=>handleStdPrint(dipliReadyOrders,'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ',caseReady,sasiReady)}>
                        <Text style={{color:'#00796B', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>}
                    </View>
                  </TouchableOpacity>
                  {expanded.stdReadyD&&(dipliReadyOrders.length>0?applyListSort(dipliReadyOrders,'dipli-ready').map(o=>renderReadyCard(o)):
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν έτοιμα</Text>
                  )}
                  </>)}

                  {!isGuest && !isSeller && (<>
                  {/* ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ΔΙΠΛΗ */}
                  {showSec('sold')&&(<>
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#555', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('stdSoldD')}>
                    <View style={{flexDirection:'row', alignItems:'center', gap:14}}>
                      <Text style={styles.listHeaderText}>🗂 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ({dipliSoldOrders.length})</Text>
                      {expanded.stdSoldD&&renderSortBtns('dipli-sold')}
                    </View>
                    <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                      {expanded.stdSoldD&&dipliSoldOrders.length>0&&<TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:4, borderRadius:20}}
                        onPress={()=>handleStdPrint(dipliSoldOrders,'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ',caseReady,sasiReady)}>
                        <Text style={{color:'#555', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                      </TouchableOpacity>}
                    </View>
                  </TouchableOpacity>
                  {expanded.stdSoldD&&(dipliSoldOrders.length>0?applyListSort(dipliSoldOrders,'dipli-sold').map(o=>renderSoldCard(o)):
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν πωλήσεις</Text>
                  )}
                  </>)}

                  {/* ΜΕΝΟΝΤΑ — ΔΙΠΛΗ */}
                  {showSec('menon')&&(<>
                  <TouchableOpacity style={[styles.listHeader,{backgroundColor:'#4a148c', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:8}]} onPress={()=>toggleSection('dipliSasiStock')}>
                    <Text style={styles.listHeaderText}>📦 ΜΕΝΟΝΤΑ ΕΜΠΟΡΕΥΜΑΤΑ ({dipliSasiStock.filter(s=>s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').length})</Text>
                  </TouchableOpacity>
                  {expanded.dipliSasiStock&&dipliSasiStock.filter(s=>s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').length===0&&(
                    <Text style={{textAlign:'center',color:'#999',padding:12}}>Δεν υπάρχουν μένοντα</Text>
                  )}
                  {expanded.dipliSasiStock&&dipliSasiStock.filter(s=>s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').map(s=>(
                    <View key={s.id} style={{backgroundColor:'white', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:5, borderLeftColor:'#9c27b0', elevation:1}}>
                      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <View style={{flex:1}}>
                          <StdOrderDatesLine order={s} marginBottom={2} />
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
                        {!locked&&<View style={{gap:4, marginLeft:8}}>
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
                        </View>}
                      </View>
                    </View>
                  ))}
                  </>)}
                  </>)}
                </>)}
              </>);
            })()}
            </View>{/* end editing wrapper */}
          </>)}
        </View>
      </ScrollView>
      {!formOnly && buildFilterOpen && (forcedTab==='ΜΟΝΗ' || forcedTab==='ΔΙΠΛΗ') && showSec('build') && renderBuildFilterPanel()}
      {!formOnly && coatPrintOpen && !isSeller && showSec('orders') && renderCoatPrintPanel()}
      {!formOnly && placePrintOpen && !isSeller && showSec('orders') && renderPlacePrintPanel()}
      </View>
      {!formOnly && (forcedTab==='ΜΟΝΗ' || forcedTab==='ΔΙΠΛΗ') && (
        <View style={{width:240, backgroundColor:'#f7f7f7', borderLeftWidth:1, borderLeftColor:'#e0e0e0'}}>
          <ScrollView contentContainerStyle={{paddingHorizontal:10, paddingTop:20, paddingBottom:30, gap:10}}>
          {[
            ...(canSeeHold ? [{key:'hold', label:'⏳ ΣΕ ΑΝΑΜΟΝΗ', count:(forcedTab==='ΜΟΝΗ'?holdMoniOrders:holdDipliOrders).length}] : []),
            {key:'build', label:'🔨 ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ', count:(forcedTab==='ΜΟΝΗ'?stdBuildMoniOrders:stdBuildDipliOrders).length},
            ...(forcedTab==='ΜΟΝΗ' ? [{key:'orders', label:'● ΠΑΡΑΓΓΕΛΙΕΣ', count:moniOrders.length}] : []),
            {key:'ready', label:'📦 ΕΤΟΙΜΑ', count:(forcedTab==='ΜΟΝΗ'?readyOrders:dipliReadyOrders).length},
            ...((!isGuest && !isSeller) ? [
              {key:'sold', label:'🗂 ΑΡΧΕΙΟ', count:(forcedTab==='ΜΟΝΗ'?moniSoldOrders:dipliSoldOrders).length},
              {key:'menon', label:'📦 ΜΕΝΟΝΤΑ', count:dipliSasiStock.filter(s=>forcedTab==='ΜΟΝΗ'?(!s.sasiType||s.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ'):s.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ').length},
            ] : []),
          ].map(b=>{
            const empty = b.count===0;
            return (
            <TouchableOpacity key={b.key} disabled={empty}
              style={[styles.navJumpBtnSide, empty ? styles.navJumpBtnDisabled : (activeSection===b.key ? styles.navJumpBtnActive : styles.navJumpBtnIdle)]}
              onPress={()=>setActiveSection(b.key)}>
              <Text style={[styles.navJumpTxt, empty&&{color:'#efefef'}]}>{b.label} ({b.count})</Text>
            </TouchableOpacity>
          );})}
          {/* Ημερολόγιο (τεμάχια) — ο πωλητής βλέπει μόνο τα δικά του */}
          <View style={{marginTop:14, borderTopWidth:1, borderTopColor:'#e0e0e0', paddingTop:14}}>
            <MiniCalendar
              title="ΗΜΕΡΟΛΟΓΙΟ (ΤΕΜΑΧΙΑ)"
              series={[
                { color:'#1565c0', label:'Καταχωρήσεις', data: calData(calTabOrders, o=>o.createdAt) },
                { color:'#2e7d32', label:'Έτοιμα',        data: calData(calTabOrders, o=>o.readyAt) },
              ]}
              selectedTs={dayModal.visible?dayModal.ts:null}
              onPickDay={(ts)=>setDayModal({visible:true, ts})}
            />
          </View>
          </ScrollView>
        </View>
      )}
      </View>

      {/* MODAL ΛΙΣΤΑΣ ΗΜΕΡΑΣ (ΗΜΕΡΟΛΟΓΙΟ) */}
      <Modal visible={dayModal.visible} transparent animationType="fade" onRequestClose={()=>setDayModal({visible:false,ts:null})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center'}}>
          <View style={{width:'90%', maxWidth:560, maxHeight:'80%', backgroundColor:'#fff', borderRadius:12, overflow:'hidden'}}>
            {dayModal.visible && (()=>{
              const ts = dayModal.ts;
              const d = new Date(ts);
              const dStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
              const byNo = (a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0);
              const row = (o,i) => (
                <View key={o.id+'_'+i} style={{flexDirection:'row', alignItems:'center', paddingVertical:8, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#eee'}}>
                  <Text style={{width:70, fontWeight:'900', color:'#1a1a1a'}}>#{o.orderNo||'-'}</Text>
                  <Text style={{flex:1, color:'#333'}} numberOfLines={1}>{o.customer||'-'}</Text>
                  <Text style={{width:90, color:'#666', textAlign:'right'}}>{o.h||'?'}x{o.w||'?'}</Text>
                  <Text style={{width:54, fontWeight:'900', color:'#c62828', textAlign:'right'}}>{pieceQty(o)}τεμ</Text>
                </View>
              );
              const section = (label, color, list) => (
                <View>
                  <View style={{flexDirection:'row', justifyContent:'space-between', backgroundColor:color, paddingVertical:6, paddingHorizontal:12}}>
                    <Text style={{color:'#fff', fontWeight:'900'}}>{label}</Text>
                    <Text style={{color:'#fff', fontWeight:'900'}}>{list.reduce((s,o)=>s+pieceQty(o),0)} τεμ ({list.length})</Text>
                  </View>
                  {list.length ? list.map(row) : <Text style={{padding:12, color:'#999'}}>—</Text>}
                </View>
              );
              const reg   = calTabOrders.filter(o=>o.createdAt && sameDay(o.createdAt, ts)).sort(byNo);
              const ready = calTabOrders.filter(o=>o.readyAt && sameDay(o.readyAt, ts)).sort(byNo);
              const body = <>{section('ΚΑΤΑΧΩΡΗΣΕΙΣ','#1565c0',reg)}{section('ΕΤΟΙΜΑ','#2e7d32',ready)}</>;
              return (<>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#1a1a1a', paddingVertical:10, paddingHorizontal:12}}>
                  <Text style={{color:'#fff', fontWeight:'900', fontSize:15}}>📅 {dStr}</Text>
                  <View style={{flexDirection:'row', alignItems:'center', gap:10}}>
                    {isAdmin && <TouchableOpacity style={{backgroundColor:'#5c6bc0', paddingHorizontal:10, paddingVertical:5, borderRadius:6}} onPress={()=>setProdLog({visible:true, ts})}>
                      <Text style={{color:'#fff', fontSize:11, fontWeight:'bold'}}>🏭 ΗΜΕΡΟΛΟΓΙΟ ΠΑΡΑΓΩΓΗΣ</Text>
                    </TouchableOpacity>}
                    <TouchableOpacity onPress={()=>setDayModal({visible:false,ts:null})}><Text style={{color:'#fff', fontSize:18, fontWeight:'bold', paddingHorizontal:6}}>✕</Text></TouchableOpacity>
                  </View>
                </View>
                <ScrollView>{body}</ScrollView>
              </>);
            })()}
          </View>
        </View>
      </Modal>

      {/* MODAL ΗΜΕΡΟΛΟΓΙΟ ΠΑΡΑΓΩΓΗΣ (μόνο admin) */}
      <Modal visible={prodLog.visible} transparent animationType="fade" onRequestClose={()=>setProdLog({visible:false,ts:null})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center'}}>
          <View style={{width:'92%', maxWidth:760, maxHeight:'85%', backgroundColor:'#fff', borderRadius:12, overflow:'hidden'}}>
            {prodLog.visible && (()=>{
              const ts = prodLog.ts;
              const d = new Date(ts);
              const dStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
              const byNo = (a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0);
              const isDipli = forcedTab==='ΔΙΠΛΗ';
              const columns = isDipli
                ? DIPLI_PHASES.map(p=>({key:p.key, label:p.label.replace(/[🔴🟡🔵🟢⚫]/g,'').trim()}))
                : (activeSection==='orders'
                    ? [{key:'__epend',label:'Επενδύσεις'},{key:'montage',label:'Μοντάρισμα'}]
                    : [...['sasi','case','lock','kypri','montage','stavera','heightReduction','oversize'].map(k=>({key:k,label:STD_TASK_LABELS_PLAIN[k]})), {key:'__epend',label:'Επενδύσεις'}]);
              const cellDone = (o, key) => {
                if (isDipli) { const ph=(o.dipliPhases||o.phases||{})[key]; return !!(ph&&ph.done&&ph.doneAt&&sameDay(ph.doneAt,ts)); }
                const dt=o.taskDoneAt||{};
                if (key==='__epend') return Object.keys(dt).some(k=>k.startsWith('epend')&&sameDay(dt[k],ts));
                return !!(dt[key]&&sameDay(dt[key],ts));
              };
              const rows = calTabOrders.filter(o=>columns.some(c=>cellDone(o,c.key))).sort(byNo);
              return (<>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#5c6bc0', paddingVertical:10, paddingHorizontal:12}}>
                  <Text style={{color:'#fff', fontWeight:'900', fontSize:15}}>🏭 ΗΜΕΡΟΛΟΓΙΟ ΠΑΡΑΓΩΓΗΣ — {dStr}</Text>
                  <TouchableOpacity onPress={()=>setProdLog({visible:false,ts:null})}><Text style={{color:'#fff', fontSize:18, fontWeight:'bold', paddingHorizontal:6}}>✕</Text></TouchableOpacity>
                </View>
                {rows.length===0 ? (
                  <Text style={{padding:18, color:'#999', textAlign:'center'}}>Δεν καταγράφηκε εργασία αυτή την ημέρα.</Text>
                ) : (
                <ScrollView horizontal><ScrollView style={{maxHeight:480}}>
                  <View>
                    <View style={{flexDirection:'row', backgroundColor:'#eceefb', borderBottomWidth:2, borderBottomColor:'#5c6bc0'}}>
                      <Text style={{width:70, fontWeight:'900', color:'#1a1a1a', padding:8}}>#</Text>
                      <Text style={{width:150, fontWeight:'900', color:'#1a1a1a', padding:8}}>Πελάτης</Text>
                      {columns.map(c=><Text key={c.key} style={{width:100, fontWeight:'900', color:'#5c6bc0', padding:8, textAlign:'center'}}>{c.label}</Text>)}
                    </View>
                    {rows.map((o,i)=>(
                      <View key={o.id+'_'+i} style={{flexDirection:'row', borderBottomWidth:1, borderBottomColor:'#eee'}}>
                        <Text style={{width:70, fontWeight:'900', color:'#1a1a1a', padding:8}}>#{o.orderNo||'-'}</Text>
                        <Text style={{width:150, color:'#333', padding:8}} numberOfLines={1}>{o.customer||'-'}</Text>
                        {columns.map(c=><Text key={c.key} style={{width:100, padding:8, textAlign:'center', fontWeight:'900', color:'#2e7d32', fontSize:16}}>{cellDone(o,c.key)?'✓':''}</Text>)}
                      </View>
                    ))}
                  </View>
                </ScrollView></ScrollView>
                )}
              </>);
            })()}
          </View>
        </View>
      </Modal>

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
        anchor={hardwareAnchor}
        customForm={customForm}
        setCustomForm={setCustomForm}
        showCustomHardwareInput={showCustomHardwareInput}
        setShowCustomHardwareInput={setShowCustomHardwareInput}
        customHardwareText={customHardwareText}
        setCustomHardwareText={setCustomHardwareText}
      />

      {/* MODAL ΔΙΑΦΟΡΑ — πολλαπλή επιλογή (μόνο όσα έχουν «Τυπ» τσεκαρισμένο) */}
      <MiscPickerModal
        visible={showMiscPicker}
        onClose={()=>setShowMiscPicker(false)}
        anchor={miscAnchor}
        customForm={customForm}
        setCustomForm={setCustomForm}
        items={(misc||[]).filter(m=>m&&m.showStd)}
      />

      {/* MODAL ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ — ένα χρώμα */}
      <StavColumnPickerModal
        visible={showStavColPicker}
        onClose={()=>setShowStavColPicker(false)}
        anchor={stavColAnchor}
        customForm={customForm}
        setCustomForm={setCustomForm}
        items={(misc||[]).filter(m=>m&&m.link==='stavCol')}
      />

      {/* MODAL ΚΛΕΙΔΑΡΙΕΣ */}
      <LockPickerModal
        visible={showLockPicker}
        onClose={()=>setShowLockPicker(false)}
        anchor={lockAnchor}
        customForm={customForm}
        setCustomForm={setCustomForm}
        locks={locks}
        cylinders={cylinders}
      />

      {/* MODAL ΜΟΝΤΕΛΟ ΔΙΠΛΗΣ */}
      <DipliModelPickerModal
        visible={showDipliPicker}
        onClose={()=>setShowDipliPicker(false)}
        anchor={dipliAnchor}
        customForm={customForm}
        setCustomForm={setCustomForm}
      />

      {/* MODAL ΕΠΕΝΔΥΣΕΙΣ — μετά από κάθε αλλαγή επιλογών ξαναϋπολογίζονται τα στοιχεία επένδυσης */}
      <CoatingsPickerModal
        visible={showCoatingsPicker}
        onClose={()=>setShowCoatingsPicker(false)}
        anchor={coatingsAnchor}
        customForm={customForm}
        setCustomForm={(next)=>{
          const n = typeof next === 'function' ? next(customForm) : next;
          setCustomForm({...n, coatingDetails: recomputeCoatingDetails(n)});
        }}
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
  quoteSearch: { alignSelf:'flex-start', width:'33%', minWidth:200, backgroundColor:'#fff', borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:12, paddingVertical:7, fontSize:14, marginBottom:10 },
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
  navJumpBtn: { borderRadius:6, paddingVertical:5, paddingHorizontal:10, alignItems:'center', justifyContent:'center' },
  navJumpBtnSide: { borderRadius:8, paddingVertical:16, paddingHorizontal:12, alignItems:'center', justifyContent:'center', width:'100%' },
  navJumpBtnIdle: { backgroundColor:'#c9b6b6' },
  navJumpBtnActive: { backgroundColor:'#8B0000' },
  navJumpBtnDisabled: { backgroundColor:'#b0b0b0' },
  navJumpTxt: { color:'white', fontWeight:'bold', fontSize:13 },
  orderCard: { backgroundColor:'#fff', borderRadius:8, marginBottom:5, borderLeftWidth:10, flexDirection:'row', elevation:2, minHeight:90 },
  cardContent: { flex:1, padding:10, justifyContent:'center' },
  cardCustomer: { fontSize:13, fontWeight:'bold', color:'#1a1a1a' },
  cardDetails: { fontSize:12, color:'#444' },
  cardSubDetails: { fontSize:11, color:'#666' },
  datesRow: { flexDirection:'row', flexWrap:'wrap', marginTop:4, gap:4 },
  dateChip: { fontSize:10, color:'#555', backgroundColor:'#f0f0f0', paddingHorizontal:6, paddingVertical:2, borderRadius:4, overflow:'hidden' },
  /** View ώστε να μην είναι Text μέσα σε Text (web RN: η παράδοση μπορεί να μη φαίνεται) */
  dateChipWrap: { flexDirection:'row', alignItems:'center', alignSelf:'flex-start', flexShrink:0, flexWrap:'wrap', backgroundColor:'#f0f0f0', paddingHorizontal:6, paddingVertical:2, borderRadius:4 },
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
