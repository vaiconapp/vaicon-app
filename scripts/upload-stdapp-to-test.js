/**
 * Ανεβάζει ΜΟΝΟ τα μοναδικά δεδομένα του vaicon-app (παραγγελίες/stock)
 * στη δοκιμαστική βάση. Τα κοινά (customers/coatings/locks) ΔΕΝ τα αγγίζει —
 * αυτά παραμένουν από το snapshot του eidikes.
 *
 * Χρήση: node scripts/upload-stdapp-to-test.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_URL = 'https://vaicon-test-default-rtdb.europe-west1.firebasedatabase.app';

// Μόνο τα paths που ανήκουν αποκλειστικά στο vaicon-app
const APP_ONLY_PATHS = ['std_orders', 'sasi_orders', 'case_orders', 'sasi_stock', 'case_stock', 'dipli_sasi_stock'];

const backupDir = path.join(os.homedir(), 'Desktop', 'vaicon-backups');
const file = fs.readdirSync(backupDir)
  .filter(f => f.startsWith('vaiconcloud') && f.endsWith('.json'))
  .sort().reverse()[0];

if (!file) { console.error('Δεν βρέθηκε vaiconcloud backup.'); process.exit(1); }
console.log(`Χρήση backup: ${file}\n`);

const backup = JSON.parse(fs.readFileSync(path.join(backupDir, file), 'utf8'));

(async () => {
  let ok = 0, failed = 0, skipped = 0;
  for (const p of APP_ONLY_PATHS) {
    const val = backup[p];
    if (val === null || val === undefined) { console.log(`  - ${p}: δεν υπάρχει στο backup, παράλειψη`); skipped++; continue; }
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
      console.log(`  ✗ ${p}: ΑΠΟΤΥΧΙΑ (${res.status}) ${await res.text()}`);
      failed++;
    }
  }
  console.log(`\n=== ${failed === 0 ? 'OK' : `ΜΕ ${failed} ΑΠΟΤΥΧΙΕΣ`} === ✓${ok} ✗${failed} -${skipped}`);
})().catch(e => { console.error('Σφάλμα:', e.message); process.exit(1); });
