export const sasiKey = (h, w, side) => `${h}_${w}_${side}`;

export const caseKey = (h, w, side, caseType) =>
  `${h}_${w}_${side}_${(caseType||'').includes('ΑΝΟΙΧΤΟΥ') || caseType==='ΚΑΣΑ ΑΝΟΙΧΤΗ' ? 'AN' : 'KL'}`;

export const stockAvailable = (stockMap, key) => {
  const entry = stockMap?.[key];
  if (!entry) return 0;
  const reserved = (entry.reservations||[]).reduce((s,r) => s + (parseInt(r.qty)||1), 0);
  return (parseInt(entry.qty)||0) - reserved;
};
