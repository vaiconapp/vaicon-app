/**
 * Backup της βάσης vaicon-eidikes (απαιτεί login).
 * Χρήση:  node scripts/backup-eidikes.js
 * Θα ζητήσει όνομα χρήστη και κωδικό (ίδια με το πρόγραμμα ΕΙΔΙΚΕΣ).
 * Αποθηκεύει στο Desktop\vaicon-backups\eidikes-<ημερομηνία>.json
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const FIREBASE_URL = 'https://vaicon-eidikes-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_API_KEY = 'AIzaSyDTAyLh1-Jrdpz_TRUFbpQhqZHNhfPg47U';
const USER_DOMAIN = '@vaicon.local';

const ask = (q) => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, a => { rl.close(); resolve(a); });
});

(async () => {
  console.log('=== VAICON EIDIKES - FIREBASE BACKUP ===\n');
  const username = (await ask('Όνομα χρήστη: ')).trim().toLowerCase().replace(/\s+/g, '');
  const password = await ask('Κωδικός (θα φαίνεται καθώς γράφεις): ');
  if (!username || !password) { console.error('Λείπει όνομα ή κωδικός.'); process.exit(1); }

  const email = username + USER_DOMAIN;
  console.log(`\nΣύνδεση ως ${email}...`);
  const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const auth = await authRes.json();
  if (!authRes.ok) {
    console.error('*** ΑΠΟΤΥΧΙΑ LOGIN:', auth?.error?.message || authRes.status);
    process.exit(1);
  }
  console.log('Σύνδεση OK. Κατέβασμα βάσης (ανά path)...\n');

  // Οι κανόνες δεν επιτρέπουν root read — κατεβάζουμε κάθε path ξεχωριστά.
  const PATHS = [
    'special_orders', 'customers', 'coatings', 'locks', 'activity_log',
    'installations', 'installers', 'install_lock', 'activity_log_install',
  ];
  const backup = {};
  let failed = 0;
  for (const p of PATHS) {
    const res = await fetch(`${FIREBASE_URL}/${p}.json?auth=${auth.idToken}`);
    if (!res.ok) {
      console.log(`  ${p}: *** ΑΠΟΤΥΧΙΑ (${res.status}) ***`);
      failed++;
      continue;
    }
    const v = await res.json();
    backup[p] = v;
    const n = v && typeof v === 'object' ? Object.keys(v).length : (v === null ? 0 : 1);
    console.log(`  ${p}: ${n} εγγραφές`);
  }

  const data = JSON.stringify(backup);
  const dir = path.join(os.homedir(), 'Desktop', 'vaicon-backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const file = path.join(dir, `eidikes-${ts}.json`);
  fs.writeFileSync(file, data);

  console.log(`\n=== BACKUP ${failed ? 'ΜΕ ' + failed + ' ΑΠΟΤΥΧΙΕΣ' : 'OK'} ===`);
  console.log(`Αρχείο: ${file}`);
  console.log(`Μέγεθος: ${(data.length / 1024).toFixed(1)} KB`);
})().catch(e => { console.error('Σφάλμα:', e.message); process.exit(1); });
