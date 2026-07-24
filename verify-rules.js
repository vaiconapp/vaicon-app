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

// από CustomScreen.js: getCoatingType, normalizeCoatName, materialTotals
const stripAccentsTxt = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const getCoatingType = (name) => {
  const n = String(name||'').toUpperCase();
  if (n.includes('ΕΞΩ')) return 'EXO';
  if (n.includes('ΜΕΣΑ') || n.includes('ΕΣΩΤ')) return 'MESA';
  return 'OTHER';
};
const normalizeCoatName = (name) => stripAccentsTxt(String(name||'').toUpperCase())
  .replace(/ΕΞΩΤΕΡΙΚ[ΑΟΗ]?/g,' ').replace(/ΕΣΩΤΕΡΙΚ[ΑΟΗ]?/g,' ')
  .replace(/ΕΞΩ/g,' ').replace(/ΕΣΩΤ/g,' ').replace(/ΜΕΣΑ/g,' ')
  .replace(/\s+/g,' ').trim();
const materialTotals = (orders) => {
  const coatings = {}, cases = {}, frameExo = {}, frameMesa = {};
  let pihaki = 0;
  const add = (bucket, key, n) => { (bucket[key] = bucket[key] || { label:key, qty:0 }).qty += n; };
  for (const o of (orders||[])) {
    const doors = parseInt(o.qty,10) || 1;
    let caseKey=null, exoFrameKey=null, mesaFrameKey=null, hasPihaki=false;
    for (const name of (o.coatings||[])) {
      if (!name || !String(name).trim()) continue;
      const base = normalizeCoatName(name); if (!base) continue;
      const d = o.coatingDetails?.[name] || {};
      const color = normalizeCoatName(d.color || '');
      const coatKey = (color && !base.includes(color)) ? `${base} ${color}` : base;
      add(coatings, coatKey, doors);
      const t = getCoatingType(name);
      if (t==='EXO') {
        const cw=normalizeCoatName(d.caseW||''), cc=normalizeCoatName(d.caseColor||'');
        if (caseKey==null && (cw||cc)) caseKey = [cw, cc].filter(Boolean).join(' ');
        const fc=normalizeCoatName(d.frameColor||''), fw=normalizeCoatName(d.frameW||'');
        if (exoFrameKey==null && (fc||fw)) exoFrameKey = fc || fw;
      } else if (t==='MESA') {
        if (d.pihaki) hasPihaki = true;
        const fc=normalizeCoatName(d.frameColor||''), fw=normalizeCoatName(d.frameW||'');
        if (mesaFrameKey==null && (fc||fw)) mesaFrameKey = fc || fw;
      }
    }
    if (caseKey) add(cases, caseKey, doors);
    if (exoFrameKey) add(frameExo, exoFrameKey, doors);
    if (mesaFrameKey) add(frameMesa, mesaFrameKey, doors);
    if (hasPihaki) pihaki += doors;
  }
  const sort = (b) => Object.values(b).sort((a,z)=>a.label.localeCompare(z.label,'el'));
  return { coatings: sort(coatings), cases: sort(cases), frameExo: sort(frameExo), frameMesa: sort(frameMesa), pihaki };
};

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
    ...(isOversize ? { oversize: false } : (sasiNeedsProduction || isDipli ? { sasi: false } : {})),
    ...Object.fromEntries(coats.map((_, i) => [`epend${i}`, false])),
  };
  if (Object.keys(tasks).length === 0) return { sasi: false };
  return tasks;
}

function remapOversizeStdBuild(o) {
  if (o.orderType !== 'ΤΥΠΟΠΟΙΗΜΕΝΗ' || o.status !== 'STD_BUILD' || !o.buildTasks) return null;
  const isMoni = o.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !o.sasiType;
  const isOversize = isMoni && (String(o.h) === '223' || String(o.w) === '83');
  if (!isOversize || 'oversize' in o.buildTasks) return null;
  const tasks = { ...o.buildTasks };
  tasks.oversize = 'sasi' in tasks ? tasks.sasi : false;
  delete tasks.sasi;
  return { ...o, buildTasks: tasks };
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

const resDeferred = (r, now = Date.now()) => !!r && r.deferUntil != null && now < Number(r.deferUntil);

const stockAvailable = (stockMap, key, now = Date.now()) => {
  const entry = stockMap?.[key];
  if (!entry) return 0;
  const reserved = (entry.reservations || []).reduce((s, r) => resDeferred(r, now) ? s : s + (parseInt(r.qty) || 1), 0);
  return (parseInt(entry.qty) || 0) - reserved;
};

const stockCovers = (entry, orderNo, readyNos = null, now = Date.now()) => {
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

const sameOrderNo = (a, b) => String(a ?? '') === String(b ?? '');

// Αντίγραφο ξαναδέσμευσης στην επεξεργασία (CustomScreen.js saveOrderWith):
// ίδιο «ράφι» (key) → κρατά θέση + σημαδάκια (oldCovered/borrow)· αλλιώς → τέλος, καθαρή.
function reserveOnEdit(baseArr, editingOrderNo, newRes, oldKey, newKey) {
  const arr = baseArr || [];
  let prev = null;
  if (editingOrderNo != null && oldKey === newKey) {
    const idx = arr.findIndex(r => sameOrderNo(r.orderNo, editingOrderNo));
    if (idx >= 0) { const { orderNo, customer, qty, deferUntil, ...flags } = arr[idx]; prev = { idx, flags }; }
  }
  const filtered = arr.filter(r => !sameOrderNo(r.orderNo, newRes.orderNo));
  const res = prev ? { ...newRes, ...prev.flags } : newRes;
  if (prev && prev.idx >= 0 && prev.idx <= filtered.length) { const out = [...filtered]; out.splice(prev.idx, 0, res); return out; }
  return [...filtered, res];
}

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

// ΑΝΤΙΓΡΑΦΟ από utils.js — αυτόματη χρέωση πόρτας από τιμοκατάλογο
const priceNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const bandAdd = (bands, v) => {
  const x = priceNum(v);
  const b = (bands || []).find(bb => {
    const from = String(bb?.from ?? '').trim() === '' ? -Infinity : priceNum(bb.from);
    const to = String(bb?.to ?? '').trim() === '' ? Infinity : priceNum(bb.to);
    return x >= from && x <= to;
  });
  return b ? priceNum(b.add) : 0;
};
function autoPriceLines(catalog, orderType, order = {}) {
  const cat = orderType === 'ΕΙΔΙΚΗ' ? 'ΕΙΔΙΚΗ' : 'ΤΥΠΟΠΟΙΗΜΕΝΗ';
  const catMatch = (c) => c === cat || c === 'ΓΕΝΙΚΗ';
  const isDipli = String(order.sasiType || '').includes('ΔΙΠΛΗ') || String(order.armor || '').includes('ΔΙΠΛΗ');
  const wantArmor = isDipli ? 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' : 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ';
  const model = isDipli ? String(order.dipliModel || '').trim() : '';
  const coats = (order.coatings || []).filter(Boolean).map(s => String(s).trim());
  const lock = String(order.lock || '').trim();
  const q = parseInt(order.qty, 10); const qty = String(q > 0 ? q : 1);
  const total = (e) => {
    const h = bandAdd(e.heightBands, order.h), w = bandAdd(e.widthBands, order.w);
    return priceNum(e.unitPrice) + (e.bandLogic === 'or' ? Math.max(h, w) : h + w);
  };
  const lines = [];

  const armor = (catalog || []).filter(e => e && e.hasRule && catMatch(e.category)
    && (e.ruleKind === 'armor' || (!e.ruleKind && e.ruleArmor)) && String(e.ruleArmor || '') === wantArmor);
  const pick = isDipli
    ? (model && armor.find(e => String(e.ruleModel || '').trim() === model)) || armor.find(e => !String(e.ruleModel || '').trim())
    : armor[0];
  if (pick && total(pick) > 0) lines.push({ label: pick.name || wantArmor, value: String(Math.round(total(pick) * 100) / 100), qty });

  for (const e of (catalog || [])) {
    if (!e || !e.hasRule || !catMatch(e.category)) continue;
    const kind = e.ruleKind || (e.ruleArmor ? 'armor' : '');
    if (kind === 'armor') continue;
    const target = String(e.ruleTarget || '').trim();
    const hit = kind === 'coating' ? (!!target && coats.includes(target))
      : kind === 'lock' ? (!!lock && lock === target) : false;
    if (!hit || total(e) <= 0) continue;
    lines.push({ label: e.name || target, value: String(Math.round(total(e) * 100) / 100), qty });
  }

  const stav = (order.stavera || []).filter(s => s && s.dim);
  if (stav.length) {
    const ruleOf = (kind) => (catalog || []).find(e => e && e.hasRule && catMatch(e.category) && e.ruleKind === kind);
    const perimM = (dim) => {
      const n = String(dim).split(/[×xXχΧ]/).map(p => priceNum(p)).filter(v => v > 0);
      return n.length >= 2 ? 2 * (n[0] + n[1]) / 100 : 0;
    };
    const glass = ruleOf('glass'), design = ruleOf('design');
    const doors = q > 0 ? q : 1;
    const used = {};
    const uniq = (base) => { used[base] = (used[base] || 0) + 1; return used[base] > 1 ? `${base} (${used[base]})` : base; };
    const push = (rule, s, base) => {
      const p = perimM(s.dim); if (p <= 0) return;
      const per = Math.max(priceNum(rule.minCharge), p * priceNum(rule.unitPrice));
      if (per <= 0) return;
      const rq = parseInt(s.qty, 10) > 0 ? parseInt(s.qty, 10) : 1;
      lines.push({ label: uniq(`${base} ${s.dim}`), value: String(Math.round(per * 100) / 100), qty: String(rq * doors) });
    };
    for (const s of stav) {
      if (glass && priceNum(glass.unitPrice) > 0) push(glass, s, glass.name || 'Σταθερό / Τζάμι');
      if (design && priceNum(design.unitPrice) > 0 && String(s.design || '').trim() === String(design.ruleTarget || '').trim())
        push(design, s, design.name || 'ΧΙΑΣΤΗ');
    }
  }
  return lines;
}
function applyAutoPriceLines(priceList, lines) {
  const list = Array.isArray(priceList) ? priceList : [];
  const have = new Set(list.map(it => String(it?.label || '').trim()));
  const add = (lines || []).filter(l => l && !have.has(String(l.label).trim()));
  return [...add, ...list];
}

// ΑΝΤΙΓΡΑΦΟ από formatHelpers.js (suggestNextOrderNo, findDuplicateCustomers, custSortKey)
function suggestNextOrderNo(presentNos = [], ledgerNos = [], startAt = 1) {
  const toInt = (x) => { const n = parseInt(String(x), 10); return Number.isFinite(n) ? n : null; };
  let max = startAt - 1;
  for (const x of [...presentNos, ...ledgerNos]) { const n = toInt(x); if (n != null && n > max) max = n; }
  return String(max + 1);
}
const groupOrderNo = (base, seq) => `${String(base).trim()}-${seq}`;
const splitBaseNo = (orderNo) => String(orderNo).split('-')[0].trim();
const nextGroupSuffix = (base, nos = []) => {
  const b = String(base).trim();
  let max = 0;
  for (const no of nos) {
    const s = String(no);
    if (s.startsWith(b + '-')) {
      const n = parseInt(s.slice(b.length + 1), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
};
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

group('ΜΟΝΗ + κλειδαριά — 223/83 → oversize αντί sasi', () => {
  test('213×88 + lock → {lock,sasi}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', lock: 'CISA' })),
    { lock: false, sasi: false });
  test('223×88 + lock → {lock,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', lock: 'CISA' })),
    { lock: false, oversize: false });
  test('218×83 + lock → {lock,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '83', lock: 'CISA' })),
    { lock: false, oversize: false });
});

group('ΜΟΝΗ + σταθερό — 223/83 προσθέτει oversize', () => {
  test('213×88 + stavera → {stavera}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', stavera: [{ dim: '50x100' }] })),
    { stavera: false });
  test('223×88 + stavera → {stavera,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', stavera: [{ dim: '50x100' }] })),
    { stavera: false, oversize: false });
  test('218×83 + stavera → {stavera,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '83', stavera: [{ dim: '50x100' }] })),
    { stavera: false, oversize: false });
  test('Άδειο stavera array → null για 213×88',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', stavera: [{ dim: '' }] })),
    null);
});

group('ΜΟΝΗ + μοντάρισμα — 223/83 προσθέτει oversize', () => {
  test('213×88 + montage → {montage}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', installation: 'ΝΑΙ' })),
    { montage: false });
  test('223×88 + montage → {montage,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', installation: 'ΝΑΙ' })),
    { montage: false, oversize: false });
  test('218×83 + montage → {montage,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '83', installation: 'ΝΑΙ' })),
    { montage: false, oversize: false });
});

group('ΜΟΝΗ + μείωση ύψους — 223/83 → oversize αντί sasi', () => {
  test('213×88 + heightReduction → {heightReduction,sasi}',
    buildTasksForMoniStdOrder(moni({ h: '213', w: '88', heightReduction: '5cm' })),
    { heightReduction: false, sasi: false });
  test('223×88 + heightReduction → {heightReduction,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', heightReduction: '5cm' })),
    { heightReduction: false, oversize: false });
});

group('ΜΟΝΗ συνδυασμοί — 223/83 πάντα oversize (αντί sasi)', () => {
  test('223×88 + lock + stavera → {stavera,lock,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', lock: 'CISA', stavera: [{ dim: '50x100' }] })),
    { stavera: false, lock: false, oversize: false });
  test('223×83 + montage + heightReduction → {heightReduction,montage,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '83', installation: 'ΝΑΙ', heightReduction: '5cm' })),
    { heightReduction: false, montage: false, oversize: false });
  test('223×88 + lock + montage + stavera → όλα + oversize',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', lock: 'CISA', installation: 'ΝΑΙ', stavera: [{ dim: '50x100' }] })),
    { stavera: false, lock: false, montage: false, oversize: false });
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
  test('223×88 ΜΟΝΗ + kypri → {kypri,case,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '88', kypri: 'ΝΑΙ' })),
    { kypri: false, case: false, oversize: false });
  test('218×83 ΜΟΝΗ + kypri → {kypri,case,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '218', w: '83', kypri: 'ΝΑΙ' })),
    { kypri: false, case: false, oversize: false });
  test('223×83 ΜΟΝΗ + kypri → {kypri,case,oversize}',
    buildTasksForMoniStdOrder(moni({ h: '223', w: '83', kypri: 'ΝΑΙ' })),
    { kypri: false, case: false, oversize: false });
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

group('remapOversizeStdBuild — παλιές 223/83 από sasi → oversize', () => {
  const b = (extras = {}) => ({ orderType: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', status: 'STD_BUILD', h: '213', w: '88', ...extras });
  test('223×88 με {lock,sasi} → {lock,oversize}',
    remapOversizeStdBuild(b({ h: '223', buildTasks: { lock: false, sasi: false } })).buildTasks,
    { lock: false, oversize: false });
  test('218×83 με sasi:true (ξεκίνησε) → oversize:true (κρατά πρόοδο)',
    remapOversizeStdBuild(b({ w: '83', buildTasks: { sasi: true } })).buildTasks,
    { oversize: true });
  test('223/83 χωρίς sasi/oversize (π.χ. montage) → προσθήκη oversize:false',
    remapOversizeStdBuild(b({ h: '223', buildTasks: { montage: false } })).buildTasks,
    { montage: false, oversize: false });
  test('223/83 που έχει ήδη oversize → null',
    remapOversizeStdBuild(b({ h: '223', buildTasks: { oversize: false } })),
    null);
  test('εκτός κανόνα (213×88) → null',
    remapOversizeStdBuild(b({ buildTasks: { sasi: false } })),
    null);
  test('ΔΙΠΛΗ 223×88 → null (δεν αφορά)',
    remapOversizeStdBuild(b({ h: '223', sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', buildTasks: { sasi: false } })),
    null);
  test('όχι STD_BUILD → null',
    remapOversizeStdBuild(b({ h: '223', status: 'STD_READY', buildTasks: { sasi: false } })),
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

group('stockAvailable — αναβολή δέσμευσης (deferUntil)', () => {
  const DAY = 86400000;
  const now = 1_000_000_000_000;
  const mk = (qty, reservations) => ({ K: { qty, reservations } });
  test('χωρίς deferUntil → μετράει κανονικά',
    stockAvailable(mk(5, [{ orderNo: 'A', qty: 2 }]), 'K', now), 3);
  test('deferUntil στο μέλλον → ΔΕΝ πιάνει στοκ',
    stockAvailable(mk(5, [{ orderNo: 'A', qty: 2, deferUntil: now + 3 * DAY }]), 'K', now), 5);
  test('deferUntil πέρασε (ξύπνησε) → πιάνει στοκ',
    stockAvailable(mk(5, [{ orderNo: 'A', qty: 2, deferUntil: now - DAY }]), 'K', now), 3);
  test('μείγμα: μία κανονική + μία σε αναβολή → μόνο η κανονική μετράει',
    stockAvailable(mk(5, [{ orderNo: 'A', qty: 2 }, { orderNo: 'B', qty: 4, deferUntil: now + DAY }]), 'K', now), 3);
  test('resDeferred: μέλλον → true', resDeferred({ deferUntil: now + DAY }, now), true);
  test('resDeferred: παρελθόν → false', resDeferred({ deferUntil: now - DAY }, now), false);
  test('resDeferred: χωρίς deferUntil → false', resDeferred({ qty: 1 }, now), false);
});

group('stockCovers — greedy κάλυψη (προσπερνά όσες δεν χωράνε)', () => {
  const DAY = 86400000;
  const now = 1_000_000_000_000;
  const e = (qty, reservations) => ({ qty, reservations });
  // Στοκ 2, πρώτη 6αρα δεν χωράει → κόκκινη· οι μονές μετά πρασινίζουν
  const s2 = e(2, [{ orderNo: 'A', qty: 6 }, { orderNo: 'B', qty: 1 }, { orderNo: 'C', qty: 2 }, { orderNo: 'D', qty: 1 }]);
  test('6αρα δεν χωράει σε στοκ 2 → false', stockCovers(s2, 'A'), false);
  test('μονή Β χωράει (rem 2→1) → true', stockCovers(s2, 'B'), true);
  test('C (2τεμ) δεν χωράει στο rem=1 → false', stockCovers(s2, 'C'), false);
  test('μονή D χωράει (rem 1→0) → true', stockCovers(s2, 'D'), true);
  // Στοκ 6, πρώτη 6αρα παίρνει προτεραιότητα, μικρές μετά κόκκινες
  const s6 = e(6, [{ orderNo: 'A', qty: 6 }, { orderNo: 'B', qty: 1 }]);
  test('6αρα χωράει σε στοκ 6 → true', stockCovers(s6, 'A'), true);
  test('μονή μετά την 6αρα (rem 0) → false', stockCovers(s6, 'B'), false);
  // oldCovered πάντα καλυμμένη, δεν καταναλώνει
  const sOld = e(1, [{ orderNo: 'A', qty: 5, oldCovered: true }, { orderNo: 'B', qty: 1 }]);
  test('oldCovered → true', stockCovers(sOld, 'A'), true);
  test('μετά από oldCovered η μονή χωράει → true', stockCovers(sOld, 'B'), true);
  // deferred δεν πιάνει στοκ ούτε καλύπτεται
  const sDef = e(1, [{ orderNo: 'A', qty: 1, deferUntil: now + DAY }, { orderNo: 'B', qty: 1 }]);
  test('deferred → false', stockCovers(sDef, 'A', null, now), false);
  test('μετά από deferred η μονή χωράει → true', stockCovers(sDef, 'B', null, now), true);
  // ready πιάνει στοκ πάντα (καλυμμένη)
  const sReady = e(2, [{ orderNo: 'A', qty: 6 }, { orderNo: 'B', qty: 1 }]);
  test('ready καλύπτεται πάντα → true', stockCovers(sReady, 'A', new Set(['A'])), true);
  test('χωρίς entry → false', stockCovers(null, 'A'), false);
});

group('Ξαναδέσμευση στην επεξεργασία — θέση + σημαδάκι κάσας', () => {
  const sig = arr => arr.map(r => `${r.orderNo}${r.oldCovered ? '*' : ''}${r.borrowedFrom ? '<' : ''}`).join(',');
  const base = [{ orderNo: 'A', qty: 1 }, { orderNo: '6509', qty: 1, oldCovered: true }, { orderNo: 'C', qty: 1 }];
  const newRes = { orderNo: '6509', customer: 'x', qty: 1 };
  test('ίδιο ράφι: κρατά θέση (2η) + δεσμευμένη κάσα',
    sig(reserveOnEdit(base, '6509', newRes, 'K1', 'K1')), 'A,6509*,C');
  test('άλλο ράφι (αλλαγή διάστασης): πάει τέλος, χωρίς σημαδάκι',
    sig(reserveOnEdit(base.filter(r => r.orderNo !== '6509'), '6509', newRes, 'K1', 'K2')), 'A,C,6509');
  test('ίδιο ράφι: κρατά δανεισμό',
    sig(reserveOnEdit([{ orderNo: 'A', qty: 1 }, { orderNo: '6509', qty: 1, borrowedFrom: 'Z' }], '6509', newRes, 'K1', 'K1')), 'A,6509<');
  test('νέα παραγγελία: απλή προσθήκη στο τέλος',
    sig(reserveOnEdit([{ orderNo: 'A', qty: 1 }], null, { orderNo: 'B', qty: 1 }, null, 'K1')), 'A,B');
  test('ίδιο ράφι χωρίς προηγούμενη δέσμευση → τέλος',
    sig(reserveOnEdit([{ orderNo: 'A', qty: 1 }], '6509', newRes, 'K1', 'K1')), 'A,6509');
  test('ίδιο ράφι: το qty ανανεώνεται (δεν κρατά το παλιό)',
    reserveOnEdit(base, '6509', { orderNo: '6509', customer: 'x', qty: 5 }, 'K1', 'K1')[1].qty, 5);
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

group('σπάσιμο παραγγελίας — splitBaseNo / nextGroupSuffix', () => {
  test('splitBaseNo σκέτο → ίδιο', splitBaseNo('4521'), '4521');
  test('splitBaseNo με παύλα → βάση', splitBaseNo('4521-2'), '4521');
  test('splitBaseNo με κενά → trim', splitBaseNo(' 4521 '), '4521');
  test('πρώτο σπάσιμο σκέτου → 1', nextGroupSuffix('4521', ['4521','100']), 1);
  test('υπάρχει 4521-1 → 2', nextGroupSuffix('4521', ['4521','4521-1']), 2);
  test('υπάρχουν 4521-1,4521-2 → 3', nextGroupSuffix('4521', ['4521-1','4521-2']), 3);
  test('αγνοεί άλλη βάση (452) → 1', nextGroupSuffix('4521', ['452-9','4521']), 1);
  test('κενά nos → 1', nextGroupSuffix('4521', []), 1);
  test('groupOrderNo με το suffix → "4521-2"', groupOrderNo('4521', nextGroupSuffix('4521', ['4521-1'])), '4521-2');
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

group('autoPriceLines — θωράκιση (πόρτα)', () => {
  const cat = [
    { name: 'Πόρτα ΜΟΝΗ', category: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '300' },
    { name: 'Πόρτα ΔΙΠΛΗ', category: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', unitPrice: '450' },
    { name: 'Ειδική ΜΟΝΗ', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '500' },
    { name: 'Λάστιχο', category: 'ΓΕΝΙΚΗ', hasRule: false, unitPrice: '10' },
  ];
  test('τυποπ. ΜΟΝΗ → 300', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), [{ label: 'Πόρτα ΜΟΝΗ', value: '300', qty: '1' }]);
  test('τυποπ. ΔΙΠΛΗ → 450', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), [{ label: 'Πόρτα ΔΙΠΛΗ', value: '450', qty: '1' }]);
  test('sasiType κενό → ΜΟΝΗ', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { qty: '1' }), [{ label: 'Πόρτα ΜΟΝΗ', value: '300', qty: '1' }]);
  test('armor ΔΙΠΛΗ → διπλή', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { armor: 'ΔΙΠΛΗ', qty: '1' }), [{ label: 'Πόρτα ΔΙΠΛΗ', value: '450', qty: '1' }]);
  test('ειδική ΜΟΝΗ → 500', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), [{ label: 'Ειδική ΜΟΝΗ', value: '500', qty: '1' }]);
  test('ειδική ΔΙΠΛΗ χωρίς κανόνα → []', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), []);
  test('qty 3 → ποσότητα 3', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '3' }), [{ label: 'Πόρτα ΜΟΝΗ', value: '300', qty: '3' }]);
  test('κενός κατάλογος → []', autoPriceLines([], 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), []);
});

group('autoPriceLines — επενδύσεις / κλειδαριές / ΓΕΝΙΚΗ', () => {
  const cat = [
    { name: 'PVC ΕΞΩ', category: 'ΓΕΝΙΚΗ', hasRule: true, ruleKind: 'coating', ruleTarget: 'PVC ΕΞΩ', unitPrice: '40' },
    { name: 'Κλειδαριά CISA', category: 'ΓΕΝΙΚΗ', hasRule: true, ruleKind: 'lock', ruleTarget: 'CISA', unitPrice: '80' },
    { name: 'Ειδική επένδυση', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'coating', ruleTarget: 'INOX', unitPrice: '120' },
  ];
  test('επένδυση ΓΕΝΙΚΗ μπαίνει σε τυποποιημένη', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { coatings: ['PVC ΕΞΩ'], qty: '1' }), [{ label: 'PVC ΕΞΩ', value: '40', qty: '1' }]);
  test('κλειδαριά match', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { lock: 'CISA', qty: '1' }), [{ label: 'Κλειδαριά CISA', value: '80', qty: '1' }]);
  test('επένδυση που δεν υπάρχει στην παραγγελία → []', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { coatings: ['LAMINATE'], qty: '1' }), []);
  test('ειδική επένδυση δεν μπαίνει σε τυποποιημένη', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { coatings: ['INOX'], qty: '1' }), []);
  test('ειδική επένδυση μπαίνει σε ειδική', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { coatings: ['INOX'], qty: '1' }), [{ label: 'Ειδική επένδυση', value: '120', qty: '1' }]);
  test('πολλά μαζί: επένδυση + κλειδαριά', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { coatings: ['PVC ΕΞΩ'], lock: 'CISA', qty: '1' }), [{ label: 'PVC ΕΞΩ', value: '40', qty: '1' }, { label: 'Κλειδαριά CISA', value: '80', qty: '1' }]);
});

group('autoPriceLines — κλίμακες επιβάρυνσης ύψους/πλάτους', () => {
  const cat = [{
    name: 'Ειδική ΜΟΝΗ', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '150',
    heightBands: [{ from: '219', to: '230', add: '50' }],
    widthBands: [{ from: '99', to: '120', add: '30' }, { from: '121', to: '', add: '60' }],
  }];
  const o = (h, w) => ({ sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1', h, w });
  test('225×110 → 230', autoPriceLines(cat, 'ΕΙΔΙΚΗ', o('225', '110')), [{ label: 'Ειδική ΜΟΝΗ', value: '230', qty: '1' }]);
  test('218×98 → 150', autoPriceLines(cat, 'ΕΙΔΙΚΗ', o('218', '98')), [{ label: 'Ειδική ΜΟΝΗ', value: '150', qty: '1' }]);
  test('225×130 → ανοιχτό 121+ = 260', autoPriceLines(cat, 'ΕΙΔΙΚΗ', o('225', '130')), [{ label: 'Ειδική ΜΟΝΗ', value: '260', qty: '1' }]);
  test('230×99 → οριακά = 230', autoPriceLines(cat, 'ΕΙΔΙΚΗ', o('230', '99')), [{ label: 'Ειδική ΜΟΝΗ', value: '230', qty: '1' }]);
  test('χωρίς διαστάσεις → 150', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), [{ label: 'Ειδική ΜΟΝΗ', value: '150', qty: '1' }]);
  test('δεκαδική επιβάρυνση 12,5 → 162.5', autoPriceLines([{ name: 'Χ', category: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '150', widthBands: [{ from: '98', to: '', add: '12,5' }] }], 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1', h: '210', w: '98' }), [{ label: 'Χ', value: '162.5', qty: '1' }]);
});

group('autoPriceLines — λογική OR (μόνο η μεγαλύτερη) vs AND (αθροιστικά)', () => {
  const cat = (logic) => [{
    name: 'Ειδική ΜΟΝΗ', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '250', bandLogic: logic,
    heightBands: [{ from: '219', to: '235', add: '45' }, { from: '236', to: '', add: '145' }],
    widthBands: [{ from: '99', to: '', add: '45' }],
  }];
  const o = (h, w) => ({ sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1', h, w });
  test('OR 225×95 → 295', autoPriceLines(cat('or'), 'ΕΙΔΙΚΗ', o('225', '95')), [{ label: 'Ειδική ΜΟΝΗ', value: '295', qty: '1' }]);
  test('OR 225×100 → 295 (όχι 340)', autoPriceLines(cat('or'), 'ΕΙΔΙΚΗ', o('225', '100')), [{ label: 'Ειδική ΜΟΝΗ', value: '295', qty: '1' }]);
  test('OR 240×100 → 395 (το μεγαλύτερο 145)', autoPriceLines(cat('or'), 'ΕΙΔΙΚΗ', o('240', '100')), [{ label: 'Ειδική ΜΟΝΗ', value: '395', qty: '1' }]);
  test('OR 210×100 → 295', autoPriceLines(cat('or'), 'ΕΙΔΙΚΗ', o('210', '100')), [{ label: 'Ειδική ΜΟΝΗ', value: '295', qty: '1' }]);
  test('OR 218×95 → 250 (καμία)', autoPriceLines(cat('or'), 'ΕΙΔΙΚΗ', o('218', '95')), [{ label: 'Ειδική ΜΟΝΗ', value: '250', qty: '1' }]);
  test('AND 225×100 → 340 (αθροιστικά, default)', autoPriceLines(cat('and'), 'ΕΙΔΙΚΗ', o('225', '100')), [{ label: 'Ειδική ΜΟΝΗ', value: '340', qty: '1' }]);
});

group('autoPriceLines — μοντέλα διπλής θωράκισης', () => {
  const cat = [
    { name: 'Διπλή S21-1', category: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', ruleModel: 'S21-1', unitPrice: '270' },
    { name: 'Διπλή S22-1', category: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', ruleModel: 'S22-1', unitPrice: '345' },
    { name: 'Διπλή H23-2', category: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', ruleModel: 'H23-2', unitPrice: '375' },
  ];
  test('μοντέλο S21-1 → 270', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', dipliModel: 'S21-1', qty: '1' }), [{ label: 'Διπλή S21-1', value: '270', qty: '1' }]);
  test('μοντέλο H23-2 → 375', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', dipliModel: 'H23-2', qty: '1' }), [{ label: 'Διπλή H23-2', value: '375', qty: '1' }]);
  test('μία μόνο γραμμή θωράκισης (όχι διπλο)', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', dipliModel: 'S22-1', qty: '1' }).length, 1);
  test('χωρίς μοντέλο + γενικός κανόνας → fallback', autoPriceLines([{ name: 'Διπλή γενική', category: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', unitPrice: '450' }], 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', dipliModel: 'S21-1', qty: '1' }), [{ label: 'Διπλή γενική', value: '450', qty: '1' }]);
  test('μοντέλο χωρίς αντιστοιχία + χωρίς γενικό → []', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', dipliModel: 'S22-2', qty: '1' }), []);
});

group('autoPriceLines — σταθερά (περίμετρος glass/design)', () => {
  const cat = [
    { name: 'Σταθερό / Τζάμι', category: 'ΓΕΝΙΚΗ', hasRule: true, ruleKind: 'glass', ruleTarget: 'Σταθερό / Τζάμι', unit: 'μμ', unitPrice: '22', minCharge: '50' },
    { name: 'ΧΙΑΣΤΗ', category: 'ΓΕΝΙΚΗ', hasRule: true, ruleKind: 'design', ruleTarget: 'ΧΙΑΣΤΗ', unit: 'μμ', unitPrice: '24', minCharge: '50' },
  ];
  test('ένα σταθερό 210×50 → 5.2μ × 22 = 114.4',
    autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '210 × 50' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210 × 50', value: '114.4', qty: '1' }]);
  test('σταθερό + χιαστή → σταθερό ΚΑΙ χιαστή επιπλέον',
    autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '210 × 50', design: 'ΧΙΑΣΤΗ' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210 × 50', value: '114.4', qty: '1' }, { label: 'ΧΙΑΣΤΗ 210 × 50', value: '124.8', qty: '1' }]);
  test('ελάχιστο 50€ ανά κομμάτι (μικρό 30×20)',
    autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '30x20' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 30x20', value: '50', qty: '1' }]);
  test('πολλαπλασιασμός με πόρτες (qty 3) → τιμή/κομμάτι, ποσότητα ×3',
    autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '210×50' }], qty: '3' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '3' }]);
  test('δύο σταθερά → δύο ξεχωριστές γραμμές',
    autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '210×50' }, { dim: '100×100' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '1' }, { label: 'Σταθερό / Τζάμι 100×100', value: '88', qty: '1' }]);
  test('ποσότητα γραμμής σταθερού (qty 2) → τιμή/κομμάτι, ποσότητα 2',
    autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '210×50', qty: '2' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '2' }]);
  test('ίδια διάσταση σε δύο σειρές → μοναδικό label με (2)',
    autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '210×50' }, { dim: '210×50' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '1' }, { label: 'Σταθερό / Τζάμι 210×50 (2)', value: '114.4', qty: '1' }]);
  test('χιαστή μόνο στη γραμμή που την έχει',
    autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '210×50', design: 'ΧΙΑΣΤΗ' }, { dim: '100×100' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '1' }, { label: 'ΧΙΑΣΤΗ 210×50', value: '124.8', qty: '1' }, { label: 'Σταθερό / Τζάμι 100×100', value: '88', qty: '1' }]);
  test('ισχύει και σε ΕΙΔΙΚΗ (ΓΕΝΙΚΗ κανόνας)',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210×50' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '1' }]);
  test('χωρίς κανόνα στον κατάλογο → καμία χρέωση σταθερού',
    autoPriceLines([], 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '210×50' }], qty: '1' }), []);
  test('μη έγκυρη διάσταση (ένας αριθμός) → αγνοείται',
    autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { stavera: [{ dim: '210' }], qty: '1' }), []);
});

group('applyAutoPriceLines — μόνο προσθήκη (κρατά χειροκίνητες τιμές)', () => {
  const lines = [{ label: 'Πόρτα ΜΟΝΗ', value: '300', qty: '1' }];
  test('κενή λίστα → προσθήκη', applyAutoPriceLines([], lines), lines);
  test('κενές γραμμές → ίδια λίστα', applyAutoPriceLines([{ label: 'Α', value: '5', qty: '1' }], []), [{ label: 'Α', value: '5', qty: '1' }]);
  test('μπαίνει στην αρχή', applyAutoPriceLines([{ label: 'Α', value: '5', qty: '1' }], lines), [{ label: 'Πόρτα ΜΟΝΗ', value: '300', qty: '1' }, { label: 'Α', value: '5', qty: '1' }]);
  test('υπάρχον label ΔΕΝ αλλάζει (κρατά χειροκίνητη τιμή)', applyAutoPriceLines([{ label: 'Πόρτα ΜΟΝΗ', value: '290', qty: '1' }], lines), [{ label: 'Πόρτα ΜΟΝΗ', value: '290', qty: '1' }]);
  test('υπάρχον label ΔΕΝ αλλάζει ποσότητα', applyAutoPriceLines([{ label: 'Μεντ.', value: '20', qty: '1' }], [{ label: 'Μεντ.', value: '20', qty: '3' }]), [{ label: 'Μεντ.', value: '20', qty: '1' }]);
  test('πολλές γραμμές με σειρά', applyAutoPriceLines([], [{ label: 'A', value: '1', qty: '1' }, { label: 'B', value: '2', qty: '1' }]), [{ label: 'A', value: '1', qty: '1' }, { label: 'B', value: '2', qty: '1' }]);
});

group('materialTotals — Σύνολο Υλικών', () => {
  // Κάσα ανά πλάτος+χρώμα, 1 σετ/πόρτα (από caseW/caseColor της εξωτ. επένδυσης)
  const t1 = materialTotals([{ qty:'2', coatings:['ΛΑΜΙΝΕΪΤ ΚΑΡΥΔΙΑ ΕΞΩ'],
    coatingDetails:{ 'ΛΑΜΙΝΕΪΤ ΚΑΡΥΔΙΑ ΕΞΩ':{ caseW:'15', caseColor:'Λευκή', frameColor:'Λευκό' } } }]);
  test('2 πόρτες laminate εξωτ → 2 φύλλα', t1.coatings, [{ label:'ΛΑΜΙΝΕΙΤ ΚΑΡΥΔΙΑ', qty:2 }]);
  test('κάσα 15 λευκή → 2 σετ', t1.cases, [{ label:'15 ΛΕΥΚΗ', qty:2 }]);
  test('περβάζι εξωτ λευκό → 2 σετ', t1.frameExo, [{ label:'ΛΕΥΚΟ', qty:2 }]);
  test('χωρίς μέσα → περβάζι εσωτ κενό', t1.frameMesa, []);
  test('χωρίς πηχάκι → 0', t1.pihaki, 0);

  // Έξω + μέσα: κάσα/περβάζι από την κάθε πλευρά, 1 σετ/πόρτα
  const t2 = materialTotals([{ qty:'1', coatings:['Λαμινέιτ Καρυδιά ΕΞΩ','ΛΑΜΙΝΕΪΤ ΚΑΡΥΔΙΑ ΜΕΣΑ'],
    coatingDetails:{ 'Λαμινέιτ Καρυδιά ΕΞΩ':{ caseW:'24', caseColor:'Καρυδιά', frameColor:'Καρυδιά' }, 'ΛΑΜΙΝΕΪΤ ΚΑΡΥΔΙΑ ΜΕΣΑ':{ frameColor:'Λευκό' } } }]);
  test('έξω+μέσα ίδιο χρώμα → 2 φύλλα ίδιο κλειδί', t2.coatings, [{ label:'ΛΑΜΙΝΕΙΤ ΚΑΡΥΔΙΑ', qty:2 }]);
  test('κάσα 24 καρυδιά → 1 σετ', t2.cases, [{ label:'24 ΚΑΡΥΔΙΑ', qty:1 }]);
  test('περβάζι εξωτ καρυδιά → 1 σετ', t2.frameExo, [{ label:'ΚΑΡΥΔΙΑ', qty:1 }]);
  test('περβάζι εσωτ λευκό → 1 σετ', t2.frameMesa, [{ label:'ΛΕΥΚΟ', qty:1 }]);

  // Πηχάκι: 1 σετ/πόρτα όταν τσεκαρισμένο σε εσωτ. επένδυση
  const t3 = materialTotals([{ qty:'2', coatings:['RAL ΜΕΣΑ'], coatingDetails:{ 'RAL ΜΕΣΑ':{ pihaki:true, frameColor:'Λευκό' } } }]);
  test('πηχάκι τσεκαρισμένο → 2 σετ', t3.pihaki, 2);
  test('περβάζι εσωτ 2 σετ', t3.frameMesa, [{ label:'ΛΕΥΚΟ', qty:2 }]);

  test('χωρίς επένδυση → καμία επένδυση', materialTotals([{ qty:'1' }]).coatings, []);
  test('χωρίς επένδυση → καμία κάσα', materialTotals([{ qty:'1' }]).cases, []);
  test('χωρίς qty → 1 πόρτα (κάσα)', materialTotals([{ coatings:['RAL ΕΞΩ'], coatingDetails:{ 'RAL ΕΞΩ':{ caseW:'15', caseColor:'ΛΕΥΚΗ' } } }]).cases, [{ label:'15 ΛΕΥΚΗ', qty:1 }]);
  test('εξωτ χωρίς στοιχεία κάσας → δεν μετριέται', materialTotals([{ qty:'1', coatings:['RAL ΕΞΩ'] }]).cases, []);
  test('εξωτ χωρίς στοιχεία περβαζιού → δεν μετριέται', materialTotals([{ qty:'1', coatings:['RAL ΕΞΩ'] }]).frameExo, []);

  // Διαχωρισμός επενδύσεων ανά χρώμα (color στο coatingDetails)
  const t4 = materialTotals([{ qty:'1', coatings:['ΛΑΜΙΝΕΪΤ ΕΞΩ','ΛΑΜΙΝΕΪΤ ΜΕΣΑ'],
    coatingDetails:{ 'ΛΑΜΙΝΕΪΤ ΕΞΩ':{ color:'Κερασιά' }, 'ΛΑΜΙΝΕΪΤ ΜΕΣΑ':{ color:'Καρυδιά' } } }]);
  test('ίδιο υλικό, διαφορετικό χρώμα → 2 κλειδιά', t4.coatings,
    [{ label:'ΛΑΜΙΝΕΙΤ ΚΑΡΥΔΙΑ', qty:1 }, { label:'ΛΑΜΙΝΕΙΤ ΚΕΡΑΣΙΑ', qty:1 }]);

  const t5 = materialTotals([
    { qty:'2', coatings:['ΑΛΟΥΜΙΝΙΟ ΕΞΩ'], coatingDetails:{ 'ΑΛΟΥΜΙΝΙΟ ΕΞΩ':{ color:'ΛΕΥΚΟ' } } },
    { qty:'3', coatings:['ΑΛΟΥΜΙΝΙΟ ΕΞΩ'], coatingDetails:{ 'ΑΛΟΥΜΙΝΙΟ ΕΞΩ':{ color:'μεταλλικο' } } },
  ]);
  test('αλουμίνιο λευκό vs μεταλλικό → ξεχωριστά', t5.coatings,
    [{ label:'ΑΛΟΥΜΙΝΙΟ ΛΕΥΚΟ', qty:2 }, { label:'ΑΛΟΥΜΙΝΙΟ ΜΕΤΑΛΛΙΚΟ', qty:3 }]);

  const t6 = materialTotals([{ qty:'1', coatings:['ΛΑΜΙΝΕΪΤ ΚΑΡΥΔΙΑ ΕΞΩ'], coatingDetails:{ 'ΛΑΜΙΝΕΪΤ ΚΑΡΥΔΙΑ ΕΞΩ':{ color:'Καρυδιά' } } }]);
  test('χρώμα ήδη στο όνομα → όχι διπλό', t6.coatings, [{ label:'ΛΑΜΙΝΕΙΤ ΚΑΡΥΔΙΑ', qty:1 }]);
});

group('materialTotals — 1 σετ/πόρτα (ακέραια)', () => {
  const t = materialTotals([
    { qty:'4', coatings:['RAL ΕΞΩ'], coatingDetails:{ 'RAL ΕΞΩ':{ caseW:'15', caseColor:'ΛΕΥΚΗ', frameColor:'ΛΕΥΚΟ' } } },
    { qty:'2', coatings:['RAL ΕΞΩ'], coatingDetails:{ 'RAL ΕΞΩ':{ caseW:'15', caseColor:'ΛΕΥΚΗ', frameColor:'ΛΕΥΚΟ' } } },
  ]);
  test('6 πόρτες ίδια κάσα → 6 σετ', t.cases, [{ label:'15 ΛΕΥΚΗ', qty:6 }]);
  test('6 πόρτες περβάζι εξωτ → 6 σετ', t.frameExo, [{ label:'ΛΕΥΚΟ', qty:6 }]);
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
