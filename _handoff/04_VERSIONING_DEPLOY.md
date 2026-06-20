# 04 — VERSIONING & DEPLOYMENT (ΥΠΟΧΡΕΩΤΙΚΟΣ ΚΑΝΟΝΑΣ)

## ΚΑΝΟΝΑΣ: σε ΚΑΘΕ ανέβασμα (push/deploy) → πρώτα version bump
Μορφή έκδοσης: `v.DDMMYY.N.TOTAL`
- DDMMYY = ημερομηνία
- N = μετρητής της ημέρας (1ο push της μέρας = 1)
- TOTAL = συνολικά Netlify deploys (live από το Netlify API)

Script: `scripts/bump-version.js` (γράφει στο `version.js`). ΜΗΝ επεξεργάζεσαι το `version.js` χειροκίνητα.

Ροή: `node scripts/bump-version.js` → `git add -A` → commit → `git push`.

## Κατάσταση versioning ανά εφαρμογή
- **vaicon-app:** ✅ έχει. Τελευταία έκδοση: **v.130626.1.139**.
- **vaicon-eidikes:** ✅ έχει. Τελευταία έκδοση: **v.120626.3.126**.
- **vaicon-installations:** ❌ ΔΕΝ έχει — πρέπει να στηθεί (αντιγραφή `scripts/bump-version.js`, δημιουργία `version.js`, εμφάνιση version στο UI, σωστό Netlify SITE_ID).

## ⚠️ PowerShell (Windows) — προσοχή στα git commits
- ΔΕΝ δέχεται `&&` ούτε heredoc (`<<'EOF'`).
- Για commit message με ελληνικά/πολλές γραμμές: γράψε το μήνυμα σε προσωρινό αρχείο και κάνε
  `git commit -F <file>` και μετά σβήσε το αρχείο.
- Εναλλακτικά απλά commits: `git add -A; git commit -m "..."` (με `;` όχι `&&`).

## Netlify
- vaicon-app SITE_ID: `d83c61b9-0beb-4dcc-b440-ba10cefec918`.
- Auto-deploy μετά από push. env vars Yuboto στο Netlify: `YUBOTO_API_KEY`, `YUBOTO_SENDER`, `YUBOTO_VIBER_SENDER`, `YUBOTO_TEST_MODE`, `FIREBASE_DB_URL`, `FIREBASE_SERVICE_ACCOUNT`.
