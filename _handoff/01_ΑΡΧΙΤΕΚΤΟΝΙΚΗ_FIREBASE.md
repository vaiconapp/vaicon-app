# 01 — ΑΡΧΙΤΕΚΤΟΝΙΚΗ & FIREBASE (πολύ σημαντικό)

## Βάσεις δεδομένων ανά εφαρμογή

| Εφαρμογή | DEV (localhost / expo start) | PROD (Netlify build) |
|---|---|---|
| **vaicon-app** (τυποποιημένες) | `vaicon-test` + Firebase Auth (useAuth=true) | `vaiconcloud` + ΧΩΡΙΣ auth (useAuth=false) |
| **vaicon-eidikes** (ειδικές) | `vaicon-test` | `vaicon-eidikes` (+ auth interceptor) |
| **vaicon-installations** (τοποθετήσεις) | `vaicon-test` | `vaicon-eidikes` |

Επιλογή dev/prod γίνεται με `__DEV__` (true σε expo start, false σε Netlify build).
- vaicon-app: `firebaseConfig.js` (PROD/DEV blocks, `USE_FIREBASE_AUTH`).
- vaicon-eidikes: `App.js` γραμμές ~17-21 (`IS_DEV`, `FIREBASE_URL`).
- vaicon-installations: `fbUtils.js` γραμμές ~3-5 (`_IS_DEV`, `_FIREBASE_URL`).

## ⚠️ ΚΡΙΣΙΜΟ ΕΥΡΗΜΑ — γιατί χρειάζεται "κοινή βάση"
- Στο **TEST** όλα τα προγράμματα δείχνουν στην **ίδια** βάση `vaicon-test`.
  Γι' αυτό στο test το installations βλέπει σωστά τα `std_orders` (τυποποιημένες) + `special_orders` (ειδικές). Η ενοποίηση ήδη "δουλεύει" στο test.
- Στην **ΠΑΡΑΓΩΓΗ** όμως:
  - vaicon-app γράφει τα `std_orders` στη βάση **`vaiconcloud`**.
  - vaicon-installations διαβάζει `std_orders` από τη βάση **`vaicon-eidikes`**.
  - Άρα στην παραγωγή **το installations ΔΕΝ θα δει** τις πραγματικές τυποποιημένες παραγγελίες, γιατί είναι σε άλλη βάση.
- **Συμπέρασμα:** η "κοινή βάση" + η σύνδεση installations↔app είναι ουσιαστικά εργασία **go-live**. Στο test λειτουργεί ήδη επειδή όλα είναι μαζί.

## Τι διαβάζει το installations
Paths: `special_orders`, `std_orders`, `installations`, `activity_log_install`.
(Αρχεία: `fbUtils.js`, `OrdersScreen.js`, `AppointmentsScreen.js`, `CalendarScreen.js`.)
