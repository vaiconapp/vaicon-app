// Παράγει τους Firebase rules με auth.token.vem + auth.token.twofa (αντί auth.token.email).
// Τρέξε: node scripts/generate-strongauth-rules.js
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../firebase-rules-eidikes-merged.json');
const out = path.join(__dirname, '../firebase-rules-strongauth.json');

let rules = fs.readFileSync(src, 'utf8');

// 1. Negation + beginsWith (σειρά πρώτα οι negations)
rules = rules.replace(/!auth\.token\.email\.beginsWith\('admin@'\)/g, "!(auth.token.vem.beginsWith('admin@'))");
rules = rules.replace(/!auth\.token\.email\.beginsWith\('guest@'\)/g, "!(auth.token.vem.beginsWith('guest@'))");
rules = rules.replace(/!auth\.token\.email\.beginsWith\('seller'\)/g, "!(auth.token.vem.beginsWith('seller'))");

// 2. Positive beginsWith
rules = rules.replace(/auth\.token\.email\.beginsWith\('admin@'\)/g, "auth.token.vem.beginsWith('admin@')");
rules = rules.replace(/auth\.token\.email\.beginsWith\('guest@'\)/g, "auth.token.vem.beginsWith('guest@')");
rules = rules.replace(/auth\.token\.email\.beginsWith\('seller'\)/g, "auth.token.vem.beginsWith('seller')");

// 3. auth.token.email.replace(...) → auth.token.vem.replace(...)
rules = rules.replace(/auth\.token\.email\.replace\('@vaicon\.local',''\)\.toUpperCase\(\)/g,
  "auth.token.vem.replace('@vaicon.local','').toUpperCase()");

// 4. $uk === auth.token.email.replace  (messages node)
// already handled above

// 5. auth.token.email != null && → auth.token.twofa === true &&
rules = rules.replace(/auth\.token\.email != null && /g, 'auth.token.twofa === true && ');

// 6. auth.token.email != null (standalone — χωρίς && μετά, π.χ. στο τέλος)
rules = rules.replace(/auth\.token\.email != null/g, 'auth.token.twofa === true');

// 7. Προσθήκη twofa σε READ κανόνες (δεν είχαν email != null, άρα δεν πήραν twofa παραπάνω)
const rulesObj = JSON.parse(rules);

function addTwofaToReads(node) {
  if (typeof node !== 'object' || node === null) return;
  if (node['.read'] && typeof node['.read'] === 'string' && !node['.read'].includes('twofa')) {
    const r = node['.read'];
    // Μπαίνει μετά το "auth != null"
    node['.read'] = r.replace('auth != null', 'auth != null && auth.token.twofa === true');
  }
  for (const k of Object.keys(node)) {
    if (k !== '.read' && k !== '.write' && k !== '.indexOn') addTwofaToReads(node[k]);
  }
}
addTwofaToReads(rulesObj.rules);

// 8. Προσθήκη twofa node
rulesObj.rules.twofa = { '.read': 'false', '.write': 'false' };

fs.writeFileSync(out, JSON.stringify(rulesObj, null, 2), 'utf8');
console.log('Γράφτηκε:', out);

// Σύγκριση αριθμού αλλαγών
const orig = fs.readFileSync(src, 'utf8');
const emailCount = (orig.match(/auth\.token\.email/g) || []).length;
const remaining = (JSON.stringify(rulesObj).match(/auth\.token\.email/g) || []).length;
console.log(`auth.token.email εμφανίσεις: ${emailCount} → ${remaining} (αν 0: όλα αντικαταστάθηκαν)`);
const vemCount = (JSON.stringify(rulesObj).match(/auth\.token\.vem/g) || []).length;
const twofaCount = (JSON.stringify(rulesObj).match(/twofa/g) || []).length;
console.log(`auth.token.vem εμφανίσεις: ${vemCount}, twofa εμφανίσεις: ${twofaCount}`);
