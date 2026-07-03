// Μετατρέπει deliveryDate (DD/MM/YYYY string ή timestamp) σε Date object
export const parseDateStr = (d) => {
  if (!d) return null;
  if (typeof d === 'number') return new Date(d);
  const parts = String(d).split('/');
  if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  return new Date(d);
};

export const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

export const fmtDateTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

/** Τιμές από Firebase / εισαγωγές: μερικές φορές τα boolean έρχονται ως string "true"/"1" — το !! στη JS τα κάνει λάθος. */
export function truthyBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null || v === '') return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'ναι') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'οχι' || s === 'όχι') return false;
  }
  return false;
}

const priceNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const bandAdd = (bands, v) => {
  const x = priceNum(v);
  const b = (bands || []).find(bb => {
    const from = String(bb?.from ?? '').trim() === '' ? -Infinity : priceNum(bb.from);
    const to = String(bb?.to ?? '').trim() === '' ? Infinity : priceNum(bb.to);
    return x >= from && x <= to;
  });
  return b ? priceNum(b.add) : 0;
};

/** Μοντέλα διπλής θωράκισης (κωδικός + περιγραφή). Προεπιλογή: S21-1. */
export const DIPLI_MODELS = [
  { code: 'S21-1', label: '21 σημεία · τριπλοί πλαϊνοί εκτροπείς' },
  { code: 'S22-2', label: '22 σημεία · 2ο μπλοκ νυκτός' },
  { code: 'S22-1', label: '22 σημεία · διπλού άφαλου · τριπλοί εκτροπείς' },
  { code: 'H23-2', label: 'βαρέως · 23 σημεία · διπλού άφαλου · 2ο μπλοκ · 8 πύροι · 3 νεύρα' },
];
export const DIPLI_DEFAULT = 'S21-1';

/**
 * Αυτόματες χρεώσεις από τον τιμοκατάλογο. Κάθε εγγραφή με κανόνα (hasRule) εφαρμόζεται όταν:
 *  - ruleKind 'armor'   → ταιριάζει η θωράκιση (ΜΟΝΗ/ΔΙΠΛΗ)
 *  - ruleKind 'coating' → η παραγγελία έχει την επένδυση (ruleTarget) στα coatings
 *  - ruleKind 'lock'    → η κλειδαριά της παραγγελίας ισούται με ruleTarget
 *  - ruleKind 'glass'   → σταθερά: περίμετρος × τιμή/μέτρο (ελάχιστο/κομμάτι)
 *  - ruleKind 'design'  → σταθερά με design==ruleTarget (π.χ. ΧΙΑΣΤΗ): περίμετρος × τιμή, επιπλέον
 * Η κατηγορία ΓΕΝΙΚΗ ισχύει σε τυποποιημένες & ειδικές.
 * Τιμή = βασική (unitPrice) + επιβάρυνση ύψους + επιβάρυνση πλάτους.
 * Επιστρέφει πίνακα γραμμών { label, value, qty }.
 */
export function autoPriceLines(catalog, orderType, order = {}) {
  const cat = orderType === 'ΕΙΔΙΚΗ' ? 'ΕΙΔΙΚΗ' : 'ΤΥΠΟΠΟΙΗΜΕΝΗ';
  const catMatch = (c) => c === cat || c === 'ΓΕΝΙΚΗ';
  const isDipli = String(order.sasiType || '').includes('ΔΙΠΛΗ') || String(order.armor || '').includes('ΔΙΠΛΗ');
  const wantArmor = isDipli ? 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' : 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ';
  const model = isDipli ? String(order.dipliModel || '').trim() : '';
  const coats = (order.coatings || []).filter(Boolean).map(s => String(s).trim());
  const lock = String(order.lock || '').trim();
  const q = parseInt(order.qty, 10); const qty = String(q > 0 ? q : 1);
  const total = (e) => {
    const h = bandAdd(e.heightBands, order.h), w = bandAdd(e.widthBands, order.w);
    return priceNum(e.unitPrice) + (e.bandLogic === 'or' ? Math.max(h, w) : h + w);
  };
  const lines = [];

  // Θωράκιση: μία γραμμή (στη διπλή προτεραιότητα στο μοντέλο, αλλιώς γενικός κανόνας).
  const armor = (catalog || []).filter(e => e && e.hasRule && catMatch(e.category)
    && (e.ruleKind === 'armor' || (!e.ruleKind && e.ruleArmor)) && String(e.ruleArmor || '') === wantArmor);
  const pick = isDipli
    ? (model && armor.find(e => String(e.ruleModel || '').trim() === model)) || armor.find(e => !String(e.ruleModel || '').trim())
    : armor[0];
  if (pick && total(pick) > 0) lines.push({ label: pick.name || wantArmor, value: String(Math.round(total(pick) * 100) / 100), qty });

  for (const e of (catalog || [])) {
    if (!e || !e.hasRule || !catMatch(e.category)) continue;
    const kind = e.ruleKind || (e.ruleArmor ? 'armor' : '');
    if (kind === 'armor') continue;
    const target = String(e.ruleTarget || '').trim();
    const hit = kind === 'coating' ? (!!target && coats.includes(target))
      : kind === 'lock' ? (!!lock && lock === target) : false;
    if (!hit || total(e) <= 0) continue;
    lines.push({ label: e.name || target, value: String(Math.round(total(e) * 100) / 100), qty });
  }

  // Σταθερά: χρέωση ανά περίμετρο (μονάδα «μμ»). «Σταθερό/Τζάμι» (glass) + προαιρετικά «Χιαστή»
  // (design, επιπλέον). Ελάχιστο ανά κομμάτι, σύνολο × ποσότητα γραμμής, × πόρτες (qty).
  const stav = (order.stavera || []).filter(s => s && s.dim);
  if (stav.length) {
    const ruleOf = (kind) => (catalog || []).find(e => e && e.hasRule && catMatch(e.category) && e.ruleKind === kind);
    const perimM = (dim) => {
      const n = String(dim).split(/[×xXχΧ]/).map(p => priceNum(p)).filter(v => v > 0);
      return n.length >= 2 ? 2 * (n[0] + n[1]) / 100 : 0;
    };
    const glass = ruleOf('glass'), design = ruleOf('design');
    const doors = q > 0 ? q : 1;
    const used = {};
    const uniq = (base) => { used[base] = (used[base] || 0) + 1; return used[base] > 1 ? `${base} (${used[base]})` : base; };
    const push = (rule, s, base) => {
      const p = perimM(s.dim); if (p <= 0) return;
      const per = Math.max(priceNum(rule.minCharge), p * priceNum(rule.unitPrice));
      if (per <= 0) return;
      const rq = parseInt(s.qty, 10) > 0 ? parseInt(s.qty, 10) : 1;
      lines.push({ label: uniq(`${base} ${s.dim}`), value: String(Math.round(per * 100) / 100), qty: String(rq * doors) });
    };
    for (const s of stav) {
      if (glass && priceNum(glass.unitPrice) > 0) push(glass, s, glass.name || 'Σταθερό / Τζάμι');
      if (design && priceNum(design.unitPrice) > 0 && String(s.design || '').trim() === String(design.ruleTarget || '').trim())
        push(design, s, design.name || 'ΧΙΑΣΤΗ');
    }
  }
  return lines;
}

/**
 * Συγχρονίζει τις αυτόματες γραμμές με τη λίστα τιμών:
 *  - γραμμή με ίδιο label → ανανεώνει τιμή/ποσότητα (αλλά κρατά χειροκίνητη τιμή αν η νέα είναι κενή),
 *  - νέα γραμμή → μπαίνει στην αρχή,
 *  - υπόλοιπες γραμμές μένουν ως έχουν.
 */
export function applyAutoPriceLines(priceList, lines) {
  const list = Array.isArray(priceList) ? priceList : [];
  const have = new Set(list.map(it => String(it?.label || '').trim()));
  const add = (lines || []).filter(l => l && !have.has(String(l.label).trim()));
  return [...add, ...list];
}

/**
 * Παρακολούθηση σταθερών — **δύο** ροές (να ελέγχονται πάντα και τα δύο σενάρια):
 *
 * 1. **STD_BUILD** (ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ): `buildTasks.stavera` (boolean) — τσεκ «Σταθερό» στην κάρτα ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ.
 * 2. **Άλλα status** (π.χ. STD_PENDING, STD_READY): `staveraGiven` (δόθηκαν) + `staveraDone` (DONE) — π.χ. αναζήτηση «Σταθερά» στο sidebar.
 *
 * Επιστρέφει true αν υπάρχει «ολοκληρωμένη» καταχώρηση για φίλτρα pending/done:
 * STD_BUILD → μόνο `buildTasks.stavera`· αλλιώς → `staveraDone` **ή** `staveraGiven`.
 */
export function staveraCompleted(o) {
  if (!o || typeof o !== 'object') return false;
  const isSTDBuild = o.status === 'STD_BUILD';
  return isSTDBuild
    ? truthyBool(o.buildTasks?.stavera)
    : truthyBool(o.staveraDone) || truthyBool(o.staveraGiven);
}

/** Κείμενο γραμμής «Σταθερά: …» στο modal αναζήτησης σταθερών (sidebar). */
export function staveraSearchBadgeLine(o) {
  if (!o || typeof o !== 'object') return 'αναμονή (χωρίς τσεκ)';
  const isSTDBuild = o.status === 'STD_BUILD';
  const stDone = isSTDBuild
    ? truthyBool(o.buildTasks?.stavera)
    : truthyBool(o.staveraDone);
  const stGiven = isSTDBuild
    ? truthyBool(o.buildTasks?.stavera)
    : truthyBool(o.staveraGiven);
  if (stDone) return '✓ DONE';
  if (stGiven) return '✓ δόθηκαν για παραγωγή';
  return 'αναμονή (χωρίς τσεκ)';
}

/**
 * Ζωντανή τυποποιημένη παραγγελία για hit αναζήτησης (sidebar).
 * Το `hit.id` μπορεί να μην ταιριάζει με `o.id` αν το σώμα στο Firebase έχει άλλο `id` από το κλειδί διαδρομής·
 * εφεδρικά ψάχνουμε και με αριθμό παραγγελίας (#0009 ≡ 9).
 */
export function resolveLiveStdOrder(hit, customOrders = []) {
  if (!hit) return null;
  const arr = Array.isArray(customOrders) ? customOrders : [];
  const hid = hit.id != null ? String(hit.id).trim() : '';
  if (hid) {
    const byId = arr.find((o) => o && String(o.id).trim() === hid);
    if (byId) return byId;
  }
  const ono = hit.orderNo;
  if (ono == null || String(ono).trim() === '') return hit.order || null;
  const sOno = String(ono).trim();
  const byExact = arr.find(
    (o) =>
      o &&
      (o.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ' || !o.orderType) &&
      String(o.orderNo ?? '').trim() === sOno
  );
  if (byExact) return byExact;
  const nHit = parseInt(String(ono).replace(/\D/g, ''), 10);
  if (!Number.isNaN(nHit)) {
    const byNum = arr.find((o) => {
      if (!o || (o.orderType && o.orderType !== 'ΤΥΠΟΠΟΙΗΜΕΝΗ')) return false;
      const n = parseInt(String(o.orderNo ?? '').replace(/\D/g, ''), 10);
      return !Number.isNaN(n) && n === nHit;
    });
    if (byNum) return byNum;
  }
  return hit.order || null;
}
