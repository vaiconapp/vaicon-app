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

/**
 * Παρακολούθηση σταθερών — **δύο** ροές (να ελέγχονται πάντα και τα δύο σενάρια):
 *
 * 1. **STD_BUILD** (ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ): `buildTasks.stavera` (boolean) — τσεκ «Σταθερό» στην κάρτα ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ.
 * 2. **Άλλα status** (π.χ. MONI_PROD, STD_READY): `staveraGiven` (δόθηκαν) + `staveraDone` (DONE) — tab ΣΤΑΘΕΡΑ υπό ΠΑΡΑΓΓΕΛΙΕΣ ΠΡΟΣ ΠΑΡΑΓΩΓΗ.
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
