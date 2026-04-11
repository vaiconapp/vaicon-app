import { FIREBASE_URL } from './firebaseConfig';

// Καταγραφή κίνησης στο Firebase
export const logActivity = async (section, action, details = {}) => {
  try {
    const entry = {
      ts: Date.now(),
      section,   // ΕΙΔΙΚΗ / ΤΥΠΟΠΟΙΗΜΕΝΗ / ΣΑΣΙ ΣΤΟΚ / ΚΑΣΕΣ ΣΤΟΚ
      action,    // π.χ. "Νέα παραγγελία", "LASER ✓", "Διαγραφή"
      ...details // orderNo, customer, size, notes κλπ
    };
    await fetch(`${FIREBASE_URL}/activity_log.json`, {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  } catch(e) {
    // Αν αποτύχει το log δεν σταματάει τίποτα
    console.warn('Activity log error:', e);
  }
};

// Φόρτωση ιστορικού (τελευταίες 7 μέρες)
export const loadActivityLog = async () => {
  try {
    const res = await fetch(`${FIREBASE_URL}/activity_log.json`);
    const data = await res.json();
    if (!data) return [];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 μέρες πριν
    const entries = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    // Κρατάμε μόνο τελευταίες 7 μέρες
    return entries
      .filter(e => e.ts >= cutoff)
      .sort((a, b) => b.ts - a.ts); // νεότερο πρώτα
  } catch(e) {
    return [];
  }
};

// Διαγραφή παλαιών εγγραφών (>7 μέρες) — καλείται κατά τη φόρτωση
export const cleanOldLogs = async () => {
  try {
    const res = await fetch(`${FIREBASE_URL}/activity_log.json`);
    const data = await res.json();
    if (!data) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const toDelete = {};
    for (const key of Object.keys(data)) {
      if (data[key].ts < cutoff) toDelete[key] = null;
    }
    if (Object.keys(toDelete).length === 0) return;
    await fetch(`${FIREBASE_URL}/activity_log.json`, {
      method: 'PATCH',
      body: JSON.stringify(toDelete),
    });
  } catch(e) {}
};