export const sasiKey = (h, w, side) => `${h}_${w}_${side}`;

export const caseKey = (h, w, side, caseType) =>
  `${h}_${w}_${side}_${(caseType||'').includes('ΑΝΟΙΧΤΟΥ') || caseType==='ΚΑΣΑ ΑΝΟΙΧΤΗ' ? 'AN' : 'KL'}`;

// Δέσμευση «σε αναβολή»: παραγγελία με μακρινή ημ. παράδοσης — δεν πιάνει στοκ μέχρι
// 2 ημερολογιακές μέρες πριν την παράδοση (deferUntil). Υπολογίζεται ζωντανά με τη σημερινή ημερομηνία.
export const resDeferred = (r, now = Date.now()) => !!r && r.deferUntil != null && now < Number(r.deferUntil);

// Ενεργή δέσμευση = πιάνει στοκ τώρα (δεν είναι δανεισμένη-παλιά ούτε σε αναβολή).
export const resHoldsStock = (r, now = Date.now()) => !!r && !r.oldCovered && !resDeferred(r, now);

export const stockAvailable = (stockMap, key, now = Date.now()) => {
  const entry = stockMap?.[key];
  if (!entry) return 0;
  const reserved = (entry.reservations||[]).reduce((s,r) => resDeferred(r, now) ? s : s + (parseInt(r.qty)||1), 0);
  return (parseInt(entry.qty)||0) - reserved;
};

// Κάλυψη παραγγελίας (greedy): με τη σειρά των reservations, όσες χωράνε στο διαθέσιμο
// στοκ πρασινίζουν — μια μεγάλη που δεν χωράει προσπερνιέται χωρίς να μπλοκάρει τις επόμενες.
// oldCovered = καλυμμένη από παλιό στοκ, deferred = δεν πιάνει στοκ ακόμα, ready = πιάνει πάντα.
export const stockCovers = (entry, orderNo, readyNos = null, now = Date.now()) => {
  if (!entry) return false;
  let rem = parseInt(entry.qty) || 0;
  for (const r of (entry.reservations || [])) {
    const match = String(r.orderNo) === String(orderNo);
    if (r.oldCovered) { if (match) return true; continue; }
    if (resDeferred(r, now)) { if (match) return false; continue; }
    const q = parseInt(r.qty) || 1;
    if ((readyNos && readyNos.has(String(r.orderNo))) || q <= rem) { if (match) return true; rem -= q; }
    else if (match) return false;
  }
  return false;
};
