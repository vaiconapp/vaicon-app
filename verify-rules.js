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
  const isOversize = isMoni && (String(o.h) === '223' || String(o.w) === '83');
  const noOtherTask = !hasStaveraForm && !isMoniWithLock && !hasHeightReductionForm && !hasMontageForm && !hasKypri;
  const needsBuild =
    isDipli ||
    isMoniWithLock ||
    hasKypri ||
    (isMoni && (hasStaveraForm || hasMontageForm || hasHeightReductionForm || isOversize));
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
  };
  if (Object.keys(tasks).length === 0) return { sasi: false };
  return tasks;
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
