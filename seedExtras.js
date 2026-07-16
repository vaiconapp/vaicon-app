// ΠΡΟΣΩΡΙΝΟ: εφάπαξ γέμισμα ΑΦΑΛΩΝ (cylinders) & ΔΙΑΦΟΡΩΝ (misc) από τον ΤΙΜΟΚΑΤΑΛΟΓΟ 2026.
// Τρέχει μόνο αφού ο admin συνδεθεί. Αφαιρείται μετά (αρχείο + κλήση στο App.js).
import { FIREBASE_URL } from './firebaseConfig';

const N = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

const CYLINDERS = [
  { name: 'ΑΦΑΛΟΣ ISEO R-50 ΜΕ 5 ΚΛΕΙΔΙΑ', price: '35' },
  { name: 'ΑΦΑΛΟΣ ISEO R-90 ΜΗ ΑΝΤΙΓΡΑΨΙΜΟΣ ΜΕ 5 ΚΛΕΙΔΙΑ', price: '50' },
];

const MISC = [
  { name: 'ΕΠΙΒΑΡΥΝΣΗ ΚΟΠΗΣ ΠΟΡΤΑΣ ΣΤΟ ΚΑΤΩ ΜΕΡΟΣ', price: '20', link: 'heightReduction' },
  { name: 'ΕΠΙΛΟΓΗ ΔΙΑΦΟΡΕΤΙΚΩΝ ΕΞΑΡΤΗΜΑΤΩΝ ΝΙΚΕΛ Η ΟΡΟ ΜΑΤ', price: '30' },
  { name: 'ΜΠΛΟΚΑΡΙΣΜΑ ΕΚΤΡΟΠΕΩΝ', price: '15' },
  { name: 'DEFENDER ΜΕ ΑΤΣΑΛΙΝΟ ΕΠΙΣΤΟΜΙΟ (MONOLITO)', price: '40' },
  { name: 'ΜΟΝΤΑΡΙΣΜΑ ΠΟΡΤΑΣ', price: '10', link: 'montage' },
  { name: 'ΕΠΙΒΑΡΥΝΣΗ ΣΧΕΔΙΟΥ ΚΑΙ ΒΑΦΗΣ ΣΕ LAMINATE', price: '20' },
  { name: 'ΕΠΙΒΑΡΥΝΣΗ ΓΑΛΒΑΝΙΖΕ ΚΑΣΑΣ', price: '20', link: 'galva' },
  { name: 'ΕΠΙΒΑΡΥΝΣΗ 3ου ΜΕΝΤΕΣΕ', price: '20', link: 'hinges3' },
  { name: 'ΜΟΝΩΣΗ ΜΕ ΦΕΛΙΖΟΛ', price: '10' },
  { name: 'ΜΟΝΩΣΗ ΜΕ ΠΕΤΡΟΒΑΜΒΑΚΑ', price: '15' },
  { name: 'ΕΠΙΒΑΡΥΝΣΗ 3ου ΝΕΥΡΟΥ ΕΣΩΤΕΡΙΚΑ', price: '15' },
  { name: 'ΒΑΦΗ ΜΕΤΑΛΛΩΝ RAL Η SABLE', price: '20', link: 'casePaint' },
  { name: 'ΗΛΕΚΤΡΙΚΟ ΚΥΠΡΙ', price: '50', link: 'kypri' },
  { name: 'ΠΗΧΑΚΙ (ΞΥΛΟΓΩΝΙΑ)', price: '15', link: 'pihaki' },
  { name: 'ΣΟΥΣΤΑ ΕΠΑΝΑΦΟΡΑΣ ISEO ΑΠΛΗ', price: '35' },
  { name: 'ΣΟΥΣΤΑ ΕΠΑΝΑΦΟΡΑΣ GU BKS ΒΑΡΕΩΣ ΤΥΠΟΥ', price: '65' },
  { name: 'ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ ΛΕΥΚΟ', price: '45', link: 'stavCol' },
  { name: 'ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ RAL', price: '60', link: 'stavCol' },
  { name: 'ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ ΜΑΤ/ΣΑΜΠΛΕ', price: '65', link: 'stavCol' },
  { name: 'ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ ΞΥΛΟΥ', price: '70', link: 'stavCol' },
  { name: 'ΣΥΣΚΕΥΑΣΙΑ', price: '', link: 'packaging' },
  { name: 'ΕΞΟΔΑ ΠΡΑΚΤΟΡΕΙΟΥ', price: '', link: 'agency' },
];

async function seedNode(node, items, setItems) {
  const j = await fetch(`${FIREBASE_URL}/${node}.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  let list = j ? Object.keys(j).map(k => ({ id: k, ...j[k] })) : [];
  for (const it of items) {
    const found = list.find(e => e && N(e.name) === N(it.name));
    if (found) {
      const patch = {};
      if (it.price !== '' && String(found.price || '').trim() !== it.price) patch.price = it.price;
      if (it.link && found.link == null) patch.link = it.link;
      if (Object.keys(patch).length) {
        list = list.map(e => e.id === found.id ? { ...e, ...patch } : e);
        await fetch(`${FIREBASE_URL}/${node}/${found.id}.json`, { method: 'PATCH', body: JSON.stringify(patch) });
      }
    } else {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const rec = { id, name: it.name, price: it.price, createdAt: Date.now(), order: list.length, ...(it.link ? { link: it.link } : {}) };
      list = [...list, rec];
      await fetch(`${FIREBASE_URL}/${node}/${id}.json`, { method: 'PUT', body: JSON.stringify(rec) });
    }
  }
  setItems(list);
}

export async function seedExtras(setCylinders, setMisc) {
  try { await seedNode('cylinders', CYLINDERS, setCylinders); } catch {}
  try { await seedNode('misc', MISC, setMisc); } catch {}
}
