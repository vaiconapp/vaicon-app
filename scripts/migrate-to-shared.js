/**
 * Μετάβαση vaicon-app στην κοινή βάση.
 * Αντιγράφει τα ΖΩΝΤΑΝΑ δεδομένα του vaiconcloud (παραγγελίες/stock) στη βάση-στόχο.
 * Τα κοινά entities (customers/coatings/locks) ΔΕΝ τα αγγίζει ποτέ.
 *
 * Χρήση:
 *   node scripts/migrate-to-shared.js test           → μετάβαση στη ΔΟΚΙΜΑΣΤΙΚΗ (vaicon-test)
 *   node scripts/migrate-to-shared.js prod           → μετάβαση στην ΠΑΡΑΓΩΓΗ (vaicon-eidikes) — ζητά επιβεβαίωση
 *   node scripts/migrate-to-shared.js verify test    → έλεγχος πληρότητας στόχου vs πηγής (χωρίς εγγραφές)
 *   node scripts/migrate-to-shared.js verify prod
 */
const readline = require('readline');

const SOURCE_URL = 'https://vaiconcloud-default-rtdb.europe-west1.firebasedatabase.app';
const TARGETS = {
  test: {
    url: 'https://vaicon-test-default-rtdb.europe-west1.firebasedatabase.app',
    apiKey: 'AIzaSyC2p46fX-FD5sszWHnkJB2hEJBN1bTkHWI',
    label: 'ΔΟΚΙΜΑΣΤΙΚΗ (vaicon-test)',
  },
  prod: {
    url: 'https://vaicon-eidikes-default-rtdb.europe-west1.firebasedatabase.app',
    apiKey: 'AIzaSyDTAyLh1-Jrdpz_TRUFbpQhqZHNhfPg47U',
    label: 'ΠΑΡΑΓΩΓΗ (vaicon-eidikes)',
  },
};

// Μόνο τα paths που ανήκουν αποκλειστικά στο vaicon-app
const APP_PATHS = ['std_orders', 'sasi_orders', 'case_orders', 'sasi_stock', 'case_stock', 'dipli_sasi_stock'];

const ask = (q, hide = false) => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (!hide) { rl.question(q, a => { rl.close(); resolve(a); }); return; }
  process.stdout.write(q);
  const stdin = process.stdin;
  let pwd = '';
  const onData = ch => {
    ch = String(ch);
    if (ch === '\n' || ch === '\r' || ch === '\u0004') {
      stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
      process.stdout.write('\n'); rl.close(); resolve(pwd);
    } else if (ch === '\u0003') { process.exit(1); }
    else if (ch === '\u0008' || ch === '\u007f') { pwd = pwd.slice(0, -1); }
    else { pwd += ch; }
  };
  stdin.setRawMode(true); stdin.resume(); stdin.on('data', onData);
});

const login = async (target) => {
  const username = (process.env.VAICON_USER || await ask('Όνομα χρήστη (στόχου): ')).trim().toLowerCase().replace(/\s+/g, '');
  const password = process.env.VAICON_PASS || await ask('Κωδικός: ', true);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${target.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: username + '@vaicon.local', password, returnSecureToken: true }),
  });
  const auth = await res.json();
  if (!res.ok) { console.error('*** ΑΠΟΤΥΧΙΑ LOGIN:', auth?.error?.message || res.status); process.exit(1); }
  return auth.idToken;
};

const count = (v) => (v && typeof v === 'object') ? Object.keys(v).length : (v == null ? 0 : 1);

const fetchSource = async () => {
  const data = {};
  for (const p of APP_PATHS) {
    const res = await fetch(`${SOURCE_URL}/${p}.json`);
    if (!res.ok) { console.error(`*** Αποτυχία ανάγνωσης πηγής ${p} (${res.status})`); process.exit(1); }
    data[p] = await res.json();
  }
  return data;
};

const verify = async (target, token) => {
  console.log(`\nΣύγκριση πηγής (vaiconcloud) ↔ στόχου (${target.label}):\n`);
  let mismatches = 0;
  for (const p of APP_PATHS) {
    const [srcRes, dstRes] = await Promise.all([
      fetch(`${SOURCE_URL}/${p}.json?shallow=true`),
      fetch(`${target.url}/${p}.json?shallow=true&auth=${token}`),
    ]);
    const src = count(await srcRes.json());
    const dst = dstRes.ok ? count(await dstRes.json()) : `ΣΦΑΛΜΑ ${dstRes.status}`;
    const ok = src === dst;
    if (!ok) mismatches++;
    console.log(`  ${ok ? '✓' : '✗'} ${p}: πηγή ${src} → στόχος ${dst}`);
  }
  // Κοινά entities: μόνο ενημερωτικά (πρέπει να υπάρχουν στον στόχο, από eidikes)
  for (const p of ['customers', 'coatings', 'locks', 'special_orders']) {
    const res = await fetch(`${target.url}/${p}.json?shallow=true&auth=${token}`);
    console.log(`  ℹ ${p} (κοινό): ${res.ok ? count(await res.json()) + ' εγγραφές' : 'ΣΦΑΛΜΑ ' + res.status}`);
  }
  console.log(`\n=== ${mismatches === 0 ? 'ΟΛΑ ΣΥΜΦΩΝΟΥΝ' : mismatches + ' ΔΙΑΦΟΡΕΣ'} ===`);
  return mismatches === 0;
};

const migrate = async (target, token) => {
  console.log(`\nΑνάγνωση ζωντανών δεδομένων από vaiconcloud...`);
  const data = await fetchSource();
  for (const p of APP_PATHS) console.log(`  ${p}: ${count(data[p])} εγγραφές`);

  console.log(`\nΕγγραφή στον στόχο: ${target.label}\n`);
  let failed = 0;
  for (const p of APP_PATHS) {
    if (data[p] == null) { console.log(`  - ${p}: κενό στην πηγή, παράλειψη`); continue; }
    const res = await fetch(`${target.url}/${p}.json?auth=${token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data[p]),
    });
    if (res.ok) console.log(`  ✓ ${p}: ${count(data[p])} εγγραφές`);
    else { console.log(`  ✗ ${p}: ΑΠΟΤΥΧΙΑ (${res.status}) ${await res.text()}`); failed++; }
  }
  if (failed) { console.log(`\n*** ${failed} ΑΠΟΤΥΧΙΕΣ — έλεγξε τους κανόνες ασφαλείας του στόχου.`); process.exit(1); }
  await verify(target, token);
};

(async () => {
  const [mode, targetArg] = process.argv.slice(2);
  const isVerify = mode === 'verify';
  const targetKey = isVerify ? targetArg : mode;
  const target = TARGETS[targetKey];
  if (!target) {
    console.log('Χρήση: node scripts/migrate-to-shared.js <test|prod>  ή  verify <test|prod>');
    process.exit(1);
  }

  console.log(`=== VAICON MIGRATION ${isVerify ? '(ΕΛΕΓΧΟΣ ΜΟΝΟ)' : ''} ===`);
  console.log(`Πηγή:  vaiconcloud (ζωντανά δεδομένα)`);
  console.log(`Στόχος: ${target.label}\n`);

  if (!isVerify && targetKey === 'prod') {
    console.log('⚠️  ΠΡΟΣΟΧΗ: Θα ΑΝΤΙΚΑΤΑΣΤΑΘΟΥΝ τα paths του vaicon-app στην ΠΑΡΑΓΩΓΗ του eidikes.');
    console.log('   Βεβαιώσου ότι: 1) υπάρχει φρέσκο backup, 2) οι κανόνες ασφαλείας επιτρέπουν τα νέα paths,');
    console.log('   3) κανείς δεν δουλεύει στο vaicon-app αυτή τη στιγμή.\n');
    const answer = await ask('Γράψε ΝΑΙ (κεφαλαία) για να συνεχίσεις: ');
    if (answer.trim() !== 'ΝΑΙ') { console.log('Ακυρώθηκε.'); process.exit(0); }
  }

  const token = await login(target);
  if (isVerify) await verify(target, token);
  else await migrate(target, token);
})().catch(e => { console.error('Σφάλμα:', e.message); process.exit(1); });
