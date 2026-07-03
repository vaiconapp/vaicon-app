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
