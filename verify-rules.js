// =====================================================================
// VAICON — One-time verification of business rules
// =====================================================================
// Run with: node verify-rules.js
// ---------------------------------------------------------------------
// ⚠ Οι παρακάτω συναρτήσεις είναι ΑΝΤΙΓΡΑΦΟ από:
//   - stdOrderMigration.js (buildTasksForMoniStdOrder)
//   - stockUtils.js (sasiKey, caseKey)
//   - utils.js (truthyBool)
// Αν αλλάξει το source, ενημέρωσε και εδώ ώστε ο έλεγχος να μένει χρήσιμος.
// =====================================================================

// ---------- ΑΝΤΙΓΡΑΦΟ ΛΟΓΙΚΗΣ (πρέπει να ταιριάζει με source) ----------

function buildTasksForMoniStdOrder(o) {
  const isDipli = o.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ';
  const isMoni = o.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !o.sasiType;
  const hasLock = !!o.lock;
  const isMoniWithLock = isMoni && hasLock;
  const hasStaveraForm = !!(o.stavera && o.stavera.some((s) => s.dim));
  const hasMontageForm = o.installation === 'ΝΑΙ';
  const hasHeightReductionForm = !!o.heightReduction;
  const hasKypri = o.kypri === 'ΝΑΙ';
  const coats = (o.coatings || []).filter((c) => c && String(c).trim());
  const hasCoatings = coats.length > 0;
  const isOversize = isMoni && (String(o.h) === '223' || String(o.w) === '83');
  const noOtherTask = !hasStaveraForm && !isMoniWithLock && !hasHeightReductionForm && !hasMontageForm && !hasKypri;
  const needsBuild =
    isDipli ||
    isMoniWithLock ||
    hasKypri ||
    (isMoni && (hasStaveraForm || hasMontageForm || hasHeightReductionForm || isOversize || hasCoatings));
  if (!needsBuild) return null;
  const sasiNeedsProduction = isMoni && (isMoniWithLock || hasHeightReductionForm);
  const tasks = {
    ...(hasStaveraForm ? { stavera: false } : {}),
    ...(hasLock ? { lock: false } : {}),
    ...(hasHeightReductionForm ? { heightReduction: false } : {}),
    ...(hasKypri ? { kypri: false, case: false } : {}),
    ...(hasMontageForm ? { montage: false } : {}),
    ...(sasiNeedsProduction || isDipli ? { sasi: false } : {}),
    ...(isOversize && noOtherTask ? { oversize: false } : {}),
    ...Object.fromEntries(coats.map((_, i) => [`epend${i}`, false])),
  };
  if (Object.keys(tasks).length === 0) return { sasi: false };
  return tasks;
}

function migrateCoatingsToStdBuild(o) {
  if (o.orderType !== 'ΤΥΠΟΠΟΙΗΜΕΝΗ') return null;
  const coats = (o.coatings || []).filter((c) => c && String(c).trim());
  if (coats.length === 0) return null;
  const isPending = !o.status || o.status === 'STD_PENDING' || o.status === 'PENDING';
  if (isPending && !o.stdInProd) {
    const tasks = buildTasksForMoniStdOrder(o);
    if (!tasks) return null;
    return { ...o, status: 'STD_BUILD', buildTasks: tasks };
  }
  if (o.status === 'STD_BUILD') {
    const tasks = { ...(o.buildTasks || {}) };
    let changed = false;
    coats.forEach((_, i) => { if (!(`epend${i}` in tasks)) { tasks[`epend${i}`] = false; changed = true; } });
    if (!changed) return null;
    return { ...o, buildTasks: tasks };
  }
  return null;
}

const sasiKey = (h, w, side) => `${h}_${w}_${side}`;

const caseKey = (h, w, side, caseType) =>
  `${h}_${w}_${side}_${(caseType || '').includes('ΑΝΟΙΧΤΟΥ') || caseType === 'ΚΑΣΑ ΑΝΟΙΧΤΗ' ? 'AN' : 'KL'}`;

function truthyBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null || v === '') return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'ναι') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'οχι' || s === 'όχι') return false;
  }
  return false;
}

// ΑΝΤΙΓΡΑΦΟ από formatHelpers.js (suggestNextOrderNo, findDuplicateCustomers, custSortKey)
function suggestNextOrderNo(presentNos = [], ledgerNos = [], startAt = 1) {
  const toInt = (x) => { const n = parseInt(String(x), 10); return Number.isFinite(n) ? n : null; };
  let max = startAt - 1;
  for (const x of [...presentNos, ...ledgerNos]) { const n = toInt(x); if (n != null && n > max) max = n; }
  return String(max + 1);
}
const groupOrderNo = (base, seq) => `${String(base).trim()}-${seq}`;
const phoneKey = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };
const normTxt = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,;·]/g, ' ').replace(/\s+/g, ' ').trim();
const custSortKey = (c) => String(c?.name || '').replace(/^[^\p{L}]+/u, '').toLocaleLowerCase('el');
const PHONE_FIELDS = ['phone', 'phone2', 'phone3', 'phoneViber'];
function findDuplicateCustomers(form, customers, excludeId) {
  const phones = PHONE_FIELDS.map(k => phoneKey(form[k])).filter(Boolean);
  const id = normTxt(form.identifier), nm = normTxt(form.name);
  return (customers || []).filter(c => {
    if (!c || (excludeId && c.id === excludeId)) return false;
    const cph = PHONE_FIELDS.map(k => phoneKey(c[k])).filter(Boolean);
    if (phones.length && phones.some(p => cph.includes(p))) return true;
    if (id && normTxt(c.identifier) === id) return true;
    if (nm && normTxt(c.name) === nm) return true;
    return false;
  });
}

// ΑΝΤΙΓΡΑΦΟ από τον φύλακα ετικετών Firebase (fbAuth.js / App.js / fbUtils.js)
const FB_BAD_KEY = /[.#$/\[\]]/;
function firstBadFbKey(val) {
  if (Array.isArray(val)) { for (const v of val) { const b = firstBadFbKey(v); if (b) return b; } return null; }
  if (val && typeof val === 'object') {
    for (const k of Object.keys(val)) { if (FB_BAD_KEY.test(k)) return k; const b = firstBadFbKey(val[k]); if (b) return b; }
  }
  return null;
}
// ΑΝΤΙΓΡΑΦΟ από CustomScreen.js — καθαρισμός στοιχείων επένδυσης (μόνο επιλεγμένες) + ονομάτων-κλειδιών
function sanitizeFbName(s) { return String(s == null ? '' : s).replace(/[.#$/\[\]]/g, ' ').replace(/\s+/g, ' ').trim(); }
function pruneCoatingDetails(coatings, cd) {
  const keep = new Set((coatings || []).map(sanitizeFbName).filter(Boolean));
  const out = {};
  Object.keys(cd || {}).forEach(k => { const ck = sanitizeFbName(k); if (keep.has(ck)) out[ck] = cd[k]; });
  return out;
}
const FBASE = 'https://x-default-rtdb.europe-west1.firebasedatabase.app';
function badKeyInWrite(url, body) {
  const path = String(url).split('?')[0].replace(FBASE, '').replace(/\.json$/, '').replace(/^\//, '');
  for (const seg of path.split('/')) { if (seg && FB_BAD_KEY.test(decodeURIComponent(seg))) return decodeURIComponent(seg); }
  if (typeof body === 'string' && body) { try { return firstBadFbKey(JSON.parse(body)); } catch {} }
  return null;
}

// ---------- ΥΠΟΔΟΜΗ TEST ----------

let pass = 0, fail = 0;
const failures = [];

function eq(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function test(name, actual, expected) {
  const ok = eq(actual, expected);
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push({ name, actual, expected });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
  }
}

function group(title, fn) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
  fn();
}

// ---------- ΣΕΝΑΡΙΑ ----------

const moni = (extras = {}) => ({ sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', ...extras });
const dipli = (extras = {}) => ({ sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', ...extras });

group('ΜΟΝΗ σκέτη — εκτός κανόνα 223/83', () => {
  test('213×88 → null',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88' })),
    null);
  test('218×93 → null',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '93' })),
    null);
  test('208×88 → null',
    buildTasksForMoniStdOrder(moni({ h: '208', w: '88' })),
    null);
  test('208×98 → null',
    buildTasksForMoniStdOrder(moni({ h: '208', w: '98' })),
    null);
  test('sasiType undefined (default ΜΟΝΗ) 213×88 → null',
    buildTasksForMoniStdOrder({ h: '213', w: '88' }),
    null);
});

group('ΜΟΝΗ σκέτη — εντός κανόνα 223/83 (νέος κανόνας)', () => {
  test('223×88 σκέτο → {oversize:false}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88' })),
    { oversize: false });
  test('223×93 σκέτο → {oversize:false}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '93' })),
    { oversize: false });
  test('218×83 σκέτο → {oversize:false}',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '83' })),
    { oversize: false });
  test('213×83 σκέτο → {oversize:false}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '83' })),
    { oversize: false });
  test('223×83 σκέτο → {oversize:false}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '83' })),
    { oversize: false });
  test('h ως number 223 → {oversize:false}',
    buildTasksForMoniStdOrder(moni({ h: 223, w: '88' })),
    { oversize: false });
  test('w ως number 83 → {oversize:false}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: 83 })),
    { oversize: false });
});

group('ΜΟΝΗ + κλειδαριά — oversize δεν εμφανίζεται', () => {
  test('213×88 + lock → {lock,sasi}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', lock: 'CISA' })),
    { lock: false, sasi: false });
  test('223×88 + lock → {lock,sasi} (όχι oversize)',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', lock: 'CISA' })),
    { lock: false, sasi: false });
  test('218×83 + lock → {lock,sasi} (όχι oversize)',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '83', lock: 'CISA' })),
    { lock: false, sasi: false });
});

group('ΜΟΝΗ + σταθερό — oversize δεν εμφανίζεται', () => {
  test('213×88 + stavera → {stavera}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', stavera: [{ dim: '50x100' }] })),
    { stavera: false });
  test('223×88 + stavera → {stavera} (όχι oversize, όχι sasi production)',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', stavera: [{ dim: '50x100' }] })),
    { stavera: false });
  test('218×83 + stavera → {stavera}',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '83', stavera: [{ dim: '50x100' }] })),
    { stavera: false });
  test('Άδειο stavera array → null για 213×88',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', stavera: [{ dim: '' }] })),
    null);
});

group('ΜΟΝΗ + μοντάρισμα — oversize δεν εμφανίζεται', () => {
  test('213×88 + montage → {montage}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', installation: 'ΝΑΙ' })),
    { montage: false });
  test('223×88 + montage → {montage} (όχι oversize)',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', installation: 'ΝΑΙ' })),
    { montage: false });
  test('218×83 + montage → {montage}',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '83', installation: 'ΝΑΙ' })),
    { montage: false });
});

group('ΜΟΝΗ + μείωση ύψους — oversize δεν εμφανίζεται', () => {
  test('213×88 + heightReduction → {heightReduction,sasi}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', heightReduction: '5cm' })),
    { heightReduction: false, sasi: false });
  test('223×88 + heightReduction → {heightReduction,sasi} (όχι oversize)',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', heightReduction: '5cm' })),
    { heightReduction: false, sasi: false });
});

group('ΜΟΝΗ συνδυασμοί — oversize δεν εμφανίζεται όταν υπάρχει άλλο task', () => {
  test('223×88 + lock + stavera → {stavera,lock,sasi}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', lock: 'CISA', stavera: [{ dim: '50x100' }] })),
    { stavera: false, lock: false, sasi: false });
  test('223×83 + montage + heightReduction → {heightReduction,montage,sasi}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '83', installation: 'ΝΑΙ', heightReduction: '5cm' })),
    { heightReduction: false, montage: false, sasi: false });
  test('223×88 + lock + montage + stavera → όλα + sasi',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', lock: 'CISA', installation: 'ΝΑΙ', stavera: [{ dim: '50x100' }] })),
    { stavera: false, lock: false, montage: false, sasi: false });
});

group('ΔΙΠΛΗ — πάντα STD_BUILD με sasi, oversize δεν αφορά', () => {
  test('213×88 ΔΙΠΛΗ → {sasi}',
    buildTasksForMoniStdOrder(dipli({ h: '213', w: '88' })),
    { sasi: false });
  test('223×88 ΔΙΠΛΗ → {sasi} (όχι oversize)',
    buildTasksForMoniStdOrder(dipli({ h: '223', w: '88' })),
    { sasi: false });
  test('218×83 ΔΙΠΛΗ → {sasi}',
    buildTasksForMoniStdOrder(dipli({ h: '218', w: '83' })),
    { sasi: false });
  test('213×88 ΔΙΠΛΗ + lock → {lock,sasi}',
    buildTasksForMoniStdOrder(dipli({ h: '213', w: '88', lock: 'CISA' })),
    { lock: false, sasi: false });
  test('223×88 ΔΙΠΛΗ + lock → {lock,sasi} (όχι oversize)',
    buildTasksForMoniStdOrder(dipli({ h: '223', w: '88', lock: 'CISA' })),
    { lock: false, sasi: false });
  test('213×88 ΔΙΠΛΗ + stavera → {stavera,sasi}',
    buildTasksForMoniStdOrder(dipli({ h: '213', w: '88', stavera: [{ dim: '50x100' }] })),
    { stavera: false, sasi: false });
  test('213×88 ΔΙΠΛΗ + montage → {montage,sasi}',
    buildTasksForMoniStdOrder(dipli({ h: '213', w: '88', installation: 'ΝΑΙ' })),
    { montage: false, sasi: false });
  test('213×88 ΔΙΠΛΗ + lock + stavera + montage → όλα + sasi',
    buildTasksForMoniStdOrder(dipli({ h: '213', w: '88', lock: 'CISA', installation: 'ΝΑΙ', stavera: [{ dim: '50x100' }] })),
    { stavera: false, lock: false, montage: false, sasi: false });
});

group('Κυπρί — case παράγεται από στοκ, sasi ακολουθεί κανόνα', () => {
  test('213×88 ΜΟΝΗ + kypri → {kypri,case}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', kypri: 'ΝΑΙ' })),
    { kypri: false, case: false });
  test('218×93 ΜΟΝΗ + kypri → {kypri,case}',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '93', kypri: 'ΝΑΙ' })),
    { kypri: false, case: false });
  test('223×88 ΜΟΝΗ + kypri → {kypri,case} (όχι oversize)',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', kypri: 'ΝΑΙ' })),
    { kypri: false, case: false });
  test('218×83 ΜΟΝΗ + kypri → {kypri,case} (όχι oversize)',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '83', kypri: 'ΝΑΙ' })),
    { kypri: false, case: false });
  test('223×83 ΜΟΝΗ + kypri → {kypri,case} (όχι oversize)',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '83', kypri: 'ΝΑΙ' })),
    { kypri: false, case: false });
  test('213×88 ΜΟΝΗ + kypri + lock → {lock,kypri,case,sasi}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', kypri: 'ΝΑΙ', lock: 'CISA' })),
    { lock: false, kypri: false, case: false, sasi: false });
  test('213×88 ΜΟΝΗ + kypri + heightReduction → {heightReduction,kypri,case,sasi}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', kypri: 'ΝΑΙ', heightReduction: '5cm' })),
    { heightReduction: false, kypri: false, case: false, sasi: false });
  test('213×88 ΜΟΝΗ + kypri + stavera → {stavera,kypri,case}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', kypri: 'ΝΑΙ', stavera: [{ dim: '50x100' }] })),
    { stavera: false, kypri: false, case: false });
  test('213×88 ΜΟΝΗ + kypri + montage → {kypri,case,montage}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', kypri: 'ΝΑΙ', installation: 'ΝΑΙ' })),
    { kypri: false, case: false, montage: false });
  test('213×88 ΔΙΠΛΗ + kypri → {kypri,case,sasi}',
    buildTasksForMoniStdOrder(dipli({ h: '213', w: '88', kypri: 'ΝΑΙ' })),
    { kypri: false, case: false, sasi: false });
  test('213×88 ΔΙΠΛΗ + kypri + lock → {lock,kypri,case,sasi}',
    buildTasksForMoniStdOrder(dipli({ h: '213', w: '88', kypri: 'ΝΑΙ', lock: 'CISA' })),
    { lock: false, kypri: false, case: false, sasi: false });
  test('kypri:"ΟΧΙ" → ίδια συμπεριφορά όπως undefined (213×88 → null)',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', kypri: 'ΟΧΙ' })),
    null);
  test('kypri:"" → ίδια συμπεριφορά όπως undefined (213×88 → null)',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', kypri: '' })),
    null);
});

group('Επενδύσεις — μονή με επενδύσεις πάει προς κατασκευή (task ανά επένδυση)', () => {
  test('ΜΟΝΗ σκέτη + 1 επένδυση → {epend0}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', coatings: ['ΕΞΩ ΔΡΥΣ'] })),
    { epend0: false });
  test('ΜΟΝΗ σκέτη + 2 επενδύσεις → {epend0,epend1}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', coatings: ['ΕΞΩ ΔΡΥΣ', 'ΜΕΣΑ ΛΕΥΚΟ'] })),
    { epend0: false, epend1: false });
  test('κενές/whitespace επενδύσεις αγνοούνται → null',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', coatings: ['', '  '] })),
    null);
  test('ΜΟΝΗ + κλειδαριά + 1 επένδυση → {lock,sasi,epend0}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', lock: 'CISA', coatings: ['ΕΞΩ ΔΡΥΣ'] })),
    { lock: false, sasi: false, epend0: false });
  test('ΜΟΝΗ oversize + 2 επενδύσεις → {oversize,epend0,epend1}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', coatings: ['ΕΞΩ ΔΡΥΣ', 'ΜΕΣΑ ΛΕΥΚΟ'] })),
    { oversize: false, epend0: false, epend1: false });
  test('ΔΙΠΛΗ + 2 επενδύσεις → {sasi,epend0,epend1}',
    buildTasksForMoniStdOrder(dipli({ h: '213', w: '88', coatings: ['ΕΞΩ ΔΡΥΣ', 'ΜΕΣΑ ΛΕΥΚΟ'] })),
    { sasi: false, epend0: false, epend1: false });
});

group('Migration — παλιές παραγγελίες με επενδύσεις → προς κατασκευή', () => {
  const std = (extras = {}) => ({ orderType: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', h: '213', w: '88', ...extras });
  test('STD_PENDING μονή + επενδύσεις → STD_BUILD με epend',
    migrateCoatingsToStdBuild(std({ status: 'STD_PENDING', coatings: ['ΕΞΩ', 'ΜΕΣΑ'] })),
    { orderType: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', h: '213', w: '88', status: 'STD_BUILD', coatings: ['ΕΞΩ', 'ΜΕΣΑ'], buildTasks: { epend0: false, epend1: false } });
  test('χωρίς status (παλιό) μονή + 1 επένδυση → STD_BUILD',
    migrateCoatingsToStdBuild(std({ coatings: ['ΕΞΩ'] })).status,
    'STD_BUILD');
  test('STD_PENDING χωρίς επενδύσεις → καμία αλλαγή (null)',
    migrateCoatingsToStdBuild(std({ status: 'STD_PENDING' })),
    null);
  test('STD_PENDING σε μοντάρισμα (stdInProd) → δεν πειράζεται (null)',
    migrateCoatingsToStdBuild(std({ status: 'STD_PENDING', stdInProd: true, coatings: ['ΕΞΩ'] })),
    null);
  test('STD_READY → δεν πειράζεται (null)',
    migrateCoatingsToStdBuild(std({ status: 'STD_READY', coatings: ['ΕΞΩ'] })),
    null);
  test('STD_BUILD με lock χωρίς epend + 2 επενδύσεις → προσθήκη epend κρατώντας τα υπόλοιπα',
    migrateCoatingsToStdBuild(std({ status: 'STD_BUILD', coatings: ['ΕΞΩ', 'ΜΕΣΑ'], buildTasks: { lock: true, sasi: false } })).buildTasks,
    { lock: true, sasi: false, epend0: false, epend1: false });
  test('STD_BUILD που έχει ήδη epend → idempotent (null)',
    migrateCoatingsToStdBuild(std({ status: 'STD_BUILD', coatings: ['ΕΞΩ'], buildTasks: { epend0: true } })),
    null);
  test('Ειδική (όχι ΤΥΠΟΠΟΙΗΜΕΝΗ) → null',
    migrateCoatingsToStdBuild({ orderType: 'ΕΙΔΙΚΗ', status: 'STD_PENDING', coatings: ['ΕΞΩ'] }),
    null);
});

group('sasiKey / caseKey', () => {
  test('sasiKey 223,88,ΔΕΞΙΑ',
    sasiKey('223', '88', 'ΔΕΞΙΑ'),
    '223_88_ΔΕΞΙΑ');
  test('sasiKey 218,83,ΑΡΙΣΤΕΡΗ',
    sasiKey('218', '83', 'ΑΡΙΣΤΕΡΗ'),
    '218_83_ΑΡΙΣΤΕΡΗ');
  test('caseKey ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ → AN',
    caseKey('223', '88', 'ΔΕΞΙΑ', 'ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'),
    '223_88_ΔΕΞΙΑ_AN');
  test('caseKey ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ → KL',
    caseKey('223', '88', 'ΔΕΞΙΑ', 'ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ'),
    '223_88_ΔΕΞΙΑ_KL');
  test('caseKey legacy "ΚΑΣΑ ΑΝΟΙΧΤΗ" → AN',
    caseKey('223', '88', 'ΔΕΞΙΑ', 'ΚΑΣΑ ΑΝΟΙΧΤΗ'),
    '223_88_ΔΕΞΙΑ_AN');
  test('caseKey άδειο caseType → KL (default)',
    caseKey('223', '88', 'ΔΕΞΙΑ', ''),
    '223_88_ΔΕΞΙΑ_KL');
});

group('truthyBool — Firebase boolean parsing', () => {
  test('truthyBool(true) → true', truthyBool(true), true);
  test('truthyBool(1) → true', truthyBool(1), true);
  test('truthyBool("true") → true', truthyBool('true'), true);
  test('truthyBool("1") → true', truthyBool('1'), true);
  test('truthyBool("ΝΑΙ") → true', truthyBool('ΝΑΙ'), true);
  test('truthyBool("ναι") → true', truthyBool('ναι'), true);
  test('truthyBool("yes") → true', truthyBool('yes'), true);
  test('truthyBool(false) → false', truthyBool(false), false);
  test('truthyBool(0) → false', truthyBool(0), false);
  test('truthyBool("false") → false', truthyBool('false'), false);
  test('truthyBool("0") → false', truthyBool('0'), false);
  test('truthyBool("ΟΧΙ") → false', truthyBool('ΟΧΙ'), false);
  test('truthyBool("όχι") → false', truthyBool('όχι'), false);
  test('truthyBool(null) → false', truthyBool(null), false);
  test('truthyBool(undefined) → false', truthyBool(undefined), false);
  test('truthyBool("") → false', truthyBool(''), false);
});

group('suggestNextOrderNo — αυτόματη αρίθμηση (μεγαλύτερο + 1)', () => {
  test('κενά → 1', suggestNextOrderNo([], []), '1');
  test('συνεχόμενα 1..3 → 4', suggestNextOrderNo(['1','2','3'], []), '4');
  test('ΔΕΝ γεμίζει κενό: present 1,2,5 → 6', suggestNextOrderNo(['1','2','5'], []), '6');
  test('πήδημα 100→105 (present 100,105) → 106', suggestNextOrderNo(['100','105'], ['100','105']), '106');
  test('διαγραμμένο μένει στο μητρώο → ψηλότερο+1', suggestNextOrderNo(['1','2'], ['1','2','3']), '4');
  test('κοινό: ειδικές(3)+τυποποιημένες(4) → 5', suggestNextOrderNo(['3'], ['4']), '5');
  test('μη-αριθμητικά αγνοούνται (ΑΒΓ): present 1,2 → 3', suggestNextOrderNo(['1','ΑΒΓ','2'], []), '3');
  test('startAt=100, κανένα → 100', suggestNextOrderNo([], [], 100), '100');
  test('μεγαλύτερο σε ledger υπερισχύει: present 5, ledger 40 → 41', suggestNextOrderNo(['5'], ['40']), '41');
});

group('groupOrderNo / ομάδα πορτών — μορφή & αρίθμηση με παύλα', () => {
  test('groupOrderNo("145",1) → "145-1"', groupOrderNo('145', 1), '145-1');
  test('groupOrderNo("145",3) → "145-3"', groupOrderNo('145', 3), '145-3');
  test('groupOrderNo με κενά → trim βάσης', groupOrderNo(' 145 ', 2), '145-2');
  test('suffixed ΔΕΝ ανεβάζει το επόμενο: [145-1,145-2] → 146', suggestNextOrderNo(['145-1', '145-2'], []), '146');
  test('μικτά suffixed+σκέτα: [145-1,145-2,146] → 147', suggestNextOrderNo(['145-1', '145-2', '146'], []), '147');
  test('suffixed στο μητρώο μετράει ως βάση: ledger 145-1 → 146', suggestNextOrderNo([], ['145-1']), '146');
});

group('φύλακας ετικετών Firebase — firstBadFbKey/badKeyInWrite', () => {
  test('τελεία σε key → εντοπίζεται', firstBadFbKey({ 'PVC. ΕΞΩ': { dim: '1' } }), 'PVC. ΕΞΩ');
  test('κάθετος σε key → εντοπίζεται', firstBadFbKey({ '7016/9010': 1 }), '7016/9010');
  test('# $ [ ] σε key → εντοπίζεται', firstBadFbKey({ 'a#b': 1 }), 'a#b');
  test('φωλιασμένο coatingDetails με τελεία → εντοπίζεται', firstBadFbKey({ coatingDetails: { 'PVC. ΜΕΣΑ': {} } }), 'PVC. ΜΕΣΑ');
  test('τιμή με τελεία (όχι key) → ΟΚ (null)', firstBadFbKey({ customer: 'Παπα. Α.Ε.', notes: 'x/y' }), null);
  test('καθαρό αντικείμενο → null', firstBadFbKey({ orderNo: '8149', coatings: ['PVC ΕΞΩ'] }), null);
  test('πίνακας με καθαρά → null', firstBadFbKey([{ a: 1 }, { b: 2 }]), null);
  test('διαδρομή order_seq/8149.2 → εντοπίζεται', badKeyInWrite(`${FBASE}/order_seq/8149.2.json`, null), '8149.2');
  test('διαδρομή καθαρή + body με bad key → εντοπίζεται', badKeyInWrite(`${FBASE}/special_orders/123.json?auth=t`, JSON.stringify({ coatingDetails: { 'PVC. ΕΞΩ': {} } })), 'PVC. ΕΞΩ');
  test('διαδρομή+body καθαρά → null', badKeyInWrite(`${FBASE}/special_orders/123.json`, JSON.stringify({ orderNo: '8149' })), null);
});

group('pruneCoatingDetails — κρατά μόνο επιλεγμένες επενδύσεις', () => {
  test('αφαιρεί παλιό «PVC.  ΕΞΩ» όταν μένει μόνο laminate',
    pruneCoatingDetails(['LAMINATE ΜΕΣΑ', 'LAMINATE ΕΞΩ'], { 'PVC.  ΕΞΩ': { dim: '1' }, 'LAMINATE ΜΕΣΑ': { dim: '2' }, 'LAMINATE ΕΞΩ': { dim: '3' } }),
    { 'LAMINATE ΜΕΣΑ': { dim: '2' }, 'LAMINATE ΕΞΩ': { dim: '3' } });
  test('χωρίς επενδύσεις → άδειο', pruneCoatingDetails([], { 'PVC. ΕΞΩ': {} }), {});
  test('καθαρό αποτέλεσμα δεν έχει bad key', firstBadFbKey(pruneCoatingDetails(['LAMINATE ΕΞΩ'], { 'PVC.  ΕΞΩ': {}, 'LAMINATE ΕΞΩ': {} })), null);
  test('κενά/whitespace ονόματα αγνοούνται', pruneCoatingDetails(['  ', 'LAMINATE'], { 'LAMINATE': { dim: '1' } }), { 'LAMINATE': { dim: '1' } });
});

group('sanitizeFbName — καθαρισμός χαρακτήρων που δεν δέχεται η Firebase', () => {
  test('τελεία → κενό', sanitizeFbName('PVC. ΕΞΩ'), 'PVC ΕΞΩ');
  test('κάθετος (χρώμα) → κενό', sanitizeFbName('RAL 7016/9010 ΕΞΩ'), 'RAL 7016 9010 ΕΞΩ');
  test('# $ [ ] → κενό & σύμπτυξη κενών', sanitizeFbName('a#b$c[d]'), 'a b c d');
  test('καθαρό όνομα μένει ίδιο', sanitizeFbName('LAMINATE ΕΞΩ'), 'LAMINATE ΕΞΩ');
  test('coatings με κάθετο → κλειδί χωρίς bad key',
    firstBadFbKey(pruneCoatingDetails(['PVC 7016/9010'], { 'PVC 7016/9010': { dim: '1' } })), null);
  test('coatings με κάθετο → κλειδί συγχρονισμένο',
    pruneCoatingDetails(['PVC 7016/9010'], { 'PVC 7016/9010': { dim: '1' } }), { 'PVC 7016 9010': { dim: '1' } });
});

group('findDuplicateCustomers — έλεγχος διπλότυπου πελάτη', () => {
  const list = [
    { id:'1', name:'Παπαδόπουλος Γιώργος', phone:'6971234567', identifier:'Μαραθώνας' },
    { id:'2', name:'Νικολάου Άννα', phone:'+30 2101234567', city:'Αθήνα' },
  ];
  test('ίδιο τηλέφωνο με +30 → match',
    findDuplicateCustomers({ phone:'2101234567' }, list).map(c=>c.id), ['2']);
  test('ίδιο όνομα με κόμμα/τόνους → match',
    findDuplicateCustomers({ name:'παπαδοπουλος, γιωργος' }, list).map(c=>c.id), ['1']);
  test('ίδιο αναγνωριστικό → match',
    findDuplicateCustomers({ identifier:'μαραθωνας' }, list).map(c=>c.id), ['1']);
  test('ίδια μόνο πόλη → ΟΧΙ match',
    findDuplicateCustomers({ city:'Αθήνα' }, list), []);
  test('μικρό όνομα ίδιο μόνο → ΟΧΙ match (διαφορετικό πλήρες)',
    findDuplicateCustomers({ name:'Γιώργος' }, list), []);
  test('excludeId αγνοεί τον εαυτό του',
    findDuplicateCustomers({ phone:'6971234567' }, list, '1'), []);
  test('κενή φόρμα → κανένα match',
    findDuplicateCustomers({ name:'', phone:'' }, list), []);
});

group('custSortKey — αλφαβητική ταξινόμηση', () => {
  test('αγνοεί σύμβολα μπροστά', custSortKey({ name:'   *Ζαχαρίας' }), 'ζαχαρίας');
  test('αγνοεί κεφαλαία/πεζά', custSortKey({ name:'αλεξης' }), custSortKey({ name:'ΑΛΕΞΗΣ' }));
  const arr = [{name:'Ζ'},{name:'-Α'},{name:'1 Β'}].sort((a,b)=>custSortKey(a).localeCompare(custSortKey(b),'el'));
  test('ταξινόμηση αγνοώντας σύμβολα/αριθμούς μπροστά', arr.map(x=>x.name), ['-Α','1 Β','Ζ']);
});

// ---------- ΑΠΟΤΕΛΕΣΜΑ ----------

console.log(`\n\x1b[1m─────────────────────────────────────────\x1b[0m`);
console.log(`\x1b[32m✓ ${pass} passed\x1b[0m   \x1b[${fail > 0 ? '31' : '90'}m✗ ${fail} failed\x1b[0m`);
console.log(`\x1b[1m─────────────────────────────────────────\x1b[0m`);

if (fail > 0) {
  console.log(`\n\x1b[31m⚠ Failures:\x1b[0m`);
  failures.forEach(f => console.log(`  - ${f.name}`));
  process.exit(1);
}
process.exit(0);
