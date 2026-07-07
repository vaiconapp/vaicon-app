// Εμπειρική δοκιμή: custom token → ID token → decode claims.
// Τρέξε: node scripts/test-custom-token.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const API_KEY = process.env.FIREBASE_API_KEY_TEST;

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function mintCustomToken(uid, claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 3600, uid, claims,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(sa.private_key))}`;
}

async function exchangeForIdToken(customToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
  );
  const d = await res.json();
  if (d.error) throw new Error(JSON.stringify(d.error));
  return d.idToken;
}

function decodeJwtPayload(jwt) {
  const [, payload] = jwt.split('.');
  return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

(async () => {
  const testEmail = 'seller1@vaicon.local';
  console.log('--- Δημιουργία custom token για:', testEmail);
  const ct = await mintCustomToken(testEmail, { twofa: true, role: 'user', vem: testEmail });
  console.log('Custom token (πρώτα 60 χαρ.):', ct.slice(0, 60) + '...');

  console.log('\n--- Ανταλλαγή για ID token...');
  const idToken = await exchangeForIdToken(ct);
  const decoded = decodeJwtPayload(idToken);

  console.log('\n--- Claims του ID token:');
  console.log('  sub (uid)    :', decoded.sub);
  console.log('  email        :', decoded.email ?? '(ΔΕΝ υπάρχει)');
  console.log('  firebase     :', JSON.stringify(decoded.firebase));
  console.log('  twofa        :', decoded.twofa ?? '(ΔΕΝ υπάρχει)');
  console.log('  role         :', decoded.role ?? '(ΔΕΝ υπάρχει)');
  console.log('  vem          :', decoded.vem ?? '(ΔΕΝ υπάρχει)');

  console.log('\n--- Συμπέρασμα:');
  if (decoded.email) console.log('✅ auth.token.email ΥΠΑΡΧΕΙ → οι υπάρχοντες κανόνες δουλεύουν χωρίς αλλαγή');
  else console.log('⚠️  auth.token.email ΔΕΝ υπάρχει → πρέπει να χρησιμοποιήσουμε auth.token.vem στους κανόνες');
  if (decoded.twofa) console.log('✅ auth.token.twofa ΥΠΑΡΧΕΙ → μπορούμε να απαιτήσουμε twofa:true στους κανόνες');
  else console.log('❌ auth.token.twofa ΔΕΝ υπάρχει — πρόβλημα στο mintCustomToken');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
