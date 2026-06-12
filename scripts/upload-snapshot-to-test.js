/**
 * Ανεβάζει το backup της κοινής βάσης (eidikes) στη δοκιμαστική βάση (vaicon-test).
 * Χρήση: node scripts/upload-snapshot-to-test.js
 * Απαιτεί: το αρχείο backup να υπάρχει στο Desktop\vaicon-backups\
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_URL = 'https://vaicon-test-default-rtdb.europe-west1.firebasedatabase.app';

// Βρίσκουμε το πιο πρόσφατο eidikes-*.json στον φάκελο backup
const backupDir = path.join(os.homedir(), 'Desktop', 'vaicon-backups');
// Βρίσκουμε το πιο πρόσφατο ΕΓΚΥΡΟ αρχείο (περιέχει special_orders)
const files = fs.readdirSync(backupDir)
  .filter(f => f.startsWith('eidikes-') && f.endsWith('.json'))
  .filter(f => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(backupDir, f), 'utf8'));
      return d && d.special_orders; // μόνο αρχεία με πραγματικά δεδομένα
    } catch { return false; }
  })
  .sort()
  .reverse();

if (files.length === 0) {
  console.error('Δεν βρέθηκε αρχείο backup eidikes-*.json στο', backupDir);
  process.exit(1);
}

const backupFile = path.join(backupDir, files[0]);
console.log(`Χρήση backup: ${files[0]}`);

const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
const paths = Object.keys(backup);
console.log(`Paths: ${paths.join(', ')}\n`);

(async () => {
  let ok = 0, failed = 0;
  for (const p of paths) {
    const val = backup[p];
    if (val === null || val === undefined) {
      console.log(`  ${p}: κενό, παραλείπεται`);
      continue;
    }
    const res = await fetch(`${TEST_DB_URL}/${p}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(val),
    });
    if (res.ok) {
      const n = typeof val === 'object' ? Object.keys(val).length : 1;
      console.log(`  ✓ ${p}: ${n} εγγραφές`);
      ok++;
    } else {
      const err = await res.text();
      console.log(`  ✗ ${p}: ΑΠΟΤΥΧΙΑ (${res.status}) ${err}`);
      failed++;
    }
  }
  console.log(`\n=== ${failed === 0 ? 'SNAPSHOT OK' : `ΤΕΛΕΙΩΣΕ ΜΕ ${failed} ΑΠΟΤΥΧΙΕΣ`} ===`);
  console.log(`✓ ${ok}  ✗ ${failed}`);
})().catch(e => { console.error('Σφάλμα:', e.message); process.exit(1); });
