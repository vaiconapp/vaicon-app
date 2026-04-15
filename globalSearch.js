import { sasiKey, caseKey } from './stockUtils';

/** Για επισήμανση γραμμής στο Stock Σασί / Stock Κάσας μετά από αναζήτηση */
function buildStockMeta(o, type) {
  if (type === 'sasi') {
    const h = o.selectedHeight ?? o.h;
    const w = o.selectedWidth ?? o.w;
    const side = o.side;
    if (h == null || h === '' || w == null || w === '' || !side) return null;
    return {
      kind: 'sasi',
      stockKey: sasiKey(String(h), String(w), side),
      orderNo: o.orderNo,
      orderId: String(o.id),
    };
  }
  if (type === 'case') {
    const h = o.selectedHeight ?? o.h;
    const w = o.selectedWidth ?? o.w;
    const side = o.side;
    const caseModel = o.model;
    if (h == null || h === '' || w == null || w === '' || !side || !caseModel) return null;
    return {
      kind: 'case',
      stockKey: caseKey(String(h), String(w), side, caseModel),
      caseTypeTab: caseModel,
      orderNo: o.orderNo,
      orderId: String(o.id),
    };
  }
  return null;
}

/**
 * Μόνο πεδία καταχώρησης / εμφάνισης για την τυποποιημένη ροή.
 * Δεν συμπεριλαμβάνονται φάσεις παραγωγής (laser, βαφείο, κ.λπ.)· αυτές αφορούν ειδικές παραγγελίες /
 * άλλο κύκλωμα έξω από την ίδια λογική με τις τυποποιημένες εδώ.
 * (Όχι id, timestamps, εσωτερικά κλειδιά.)
 */
const USER_ENTERED_ORDER_KEYS = [
  'orderType',
  'status',
  'sasiType',
  'h',
  'w',
  'hinges',
  'qty',
  'glassDim',
  'glassNotes',
  'armor',
  'side',
  'lock',
  'notes',
  'hardware',
  'installation',
  'caseType',
  'caseMaterial',
  'deliveryDate',
  'coatings',
  'stavera',
  'heightReduction',
  'partialNote',
  'model',
  'size',
  'glass',
];

/** Αφαιρεί μεγάλους αριθμούς από JSON (υπόλοιπα nested αντικείμενα). */
function safeJsonForSearch(obj) {
  try {
    return JSON.stringify(obj).replace(/\d{10,}/g, ' ');
  } catch {
    return '';
  }
}

function valueToUserSearchChunk(key, val) {
  if (val == null || val === '') return '';
  if (key === 'coatings' && Array.isArray(val)) return val.join(' ');
  if (key === 'stavera' && Array.isArray(val)) {
    return val.map((s) => [s?.dim, s?.note].filter(Boolean).join(' ')).join(' ');
  }
  if (typeof val === 'object') return safeJsonForSearch(val);
  return String(val);
}

/** Κείμενο αναζήτησης μόνο από καταχωρημένα πεδία (εσωτερική χρήση). */
function buildUserEnteredSearchBlob(o) {
  if (!o || typeof o !== 'object') return '';
  const parts = [];
  for (const key of USER_ENTERED_ORDER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(o, key)) continue;
    const chunk = valueToUserSearchChunk(key, o[key]);
    if (chunk) parts.push(chunk);
  }
  return parts.join(' ').toLowerCase();
}

function statusLabel(st) {
  const map = {
    STD_PENDING: 'Σε αναμονή',
    STD_BUILD: 'Κατασκευή',
    STD_READY: 'Έτοιμη',
    STD_SOLD: 'Πωλήθηκε',
    SOLD: 'Πωλήθηκε',
    MONI_PROD: 'Παραγωγή',
    PENDING: 'Εκκρεμεί',
    PROD: 'Παραγωγή',
    READY: 'Έτοιμη',
  };
  return map[st] || st || '—';
}

function monoDipli(o) {
  return o.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' ? 'Διπλή θωράκιση' : 'Μόνη θωράκιση';
}

function tabForStd(o) {
  if (o.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ') return 'customDipli';
  return 'customMoni';
}

/** Τυποποιημένη (std_orders) — μία εγγραφή ανά παραγγελία· όχι κατάλογος Παραδόσεις (αποφυγή διπλών). */
function whereStd(o, isSold) {
  const md = monoDipli(o);
  if (isSold) {
    return {
      where: `Τυποποιημένες › Αρχείο πωλήσεων › ${md}`,
      tab: tabForStd(o),
    };
  }
  const st = o.status || '';
  return {
    where: `Τυποποιημένες › ${statusLabel(st)} › ${md}`,
    tab: tabForStd(o),
  };
}

function whereSasi(o, isSold) {
  if (isSold) {
    return { where: 'Στοκ Σασί › Αρχείο πωλήσεων (ειδικές πόρτες)', tab: 'sasi' };
  }
  return { where: `Στοκ Σασί › ${statusLabel(o.status)}`, tab: 'sasi' };
}

function whereCase(o, isSold) {
  if (isSold) {
    return { where: 'Στοκ Κάσας › Αρχείο πωλήσεων', tab: 'cases' };
  }
  return { where: `Στοκ Κάσας › ${statusLabel(o.status)}`, tab: 'cases' };
}

export function matchesOrderNameQuery(o, q) {
  const n = (q || '').trim().toLowerCase();
  if (!n) return true;
  const num = String(o.orderNo ?? '').toLowerCase();
  const name = String(o.customer ?? '').toLowerCase();
  return num.includes(n) || name.includes(n);
}

export function matchesOtherFieldsQuery(o, q) {
  const n = (q || '').trim().toLowerCase();
  if (!n) return true;
  const blob = buildUserEnteredSearchBlob(o);
  return blob.includes(n);
}

/**
 * @param {string} q1 — αριθμός παραγγελίας / όνομα
 * @param {string[]} otherQueries — ένα ή περισσότερα κριτήρια «λοιπών πεδίων» (κενά αγνοούνται)
 */
function orderMatches(o, q1, otherQueries) {
  if (!matchesOrderNameQuery(o, q1)) return false;
  const qs = Array.isArray(otherQueries) ? otherQueries : [otherQueries];
  for (const q of qs) {
    if (!matchesOtherFieldsQuery(o, q)) return false;
  }
  return true;
}

function summaryLine(o) {
  const no = o.orderNo != null ? `#${o.orderNo}` : '—';
  const cust = o.customer ? ` · ${o.customer}` : '';
  const dim = o.h && o.w ? ` · ${o.h}×${o.w}` : o.size ? ` · ${o.size}` : '';
  return `${no}${cust}${dim}`.trim();
}

/**
 * @param {string} q1 — αριθμός / όνομα
 * @param {string|string[]} otherQueries — ένα ή πολλά κριτήρια λοιπών πεδίων (ίδια λογική με το δεύτερο πεδίο)
 * @param {{ customOrders:any[], soldOrders:any[], sasiOrders:any[], soldSasiOrders:any[], caseOrders:any[], soldCaseOrders:any[] }} pools
 * @returns {{ id:string, orderNo:any, customer:string|undefined, summary:string, where:string, tab:string, hitType:string, order:object, stockMeta?: object }[]}
 */
export function collectGlobalSearchHits(q1, otherQueries, pools) {
  const {
    customOrders = [],
    soldOrders = [],
    sasiOrders = [],
    soldSasiOrders = [],
    caseOrders = [],
    soldCaseOrders = [],
  } = pools;

  const hits = [];

  const otherList = Array.isArray(otherQueries) ? otherQueries : [otherQueries];

  const pushHits = (arr, isSold, type) => {
    for (const o of arr) {
      if (!o || !orderMatches(o, q1, otherList)) continue;
      const stockMeta = buildStockMeta(o, type);

      let meta;
      if (type === 'std') meta = whereStd(o, isSold);
      else if (type === 'sasi') meta = whereSasi(o, isSold);
      else meta = whereCase(o, isSold);

      hits.push({
        id: String(o.id),
        orderNo: o.orderNo,
        customer: o.customer,
        summary: summaryLine(o),
        where: meta.where,
        tab: meta.tab,
        hitType: type,
        order: o,
        ...(stockMeta ? { stockMeta } : {}),
      });
    }
  };

  pushHits(customOrders, false, 'std');
  pushHits(soldOrders, true, 'std');
  pushHits(sasiOrders, false, 'sasi');
  pushHits(soldSasiOrders, true, 'sasi');
  pushHits(caseOrders, false, 'case');
  pushHits(soldCaseOrders, true, 'case');

  return hits;
}
