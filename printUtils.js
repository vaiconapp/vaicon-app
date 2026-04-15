import { Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { parseDateStr, fmtDateTime } from './utils';

function escapeHtml(s) {
  if (s == null || s === '') return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Κατάσταση με ελληνικό τίτλο (ίδια λογική με την εφαρμογή). */
function statusLabelGreek(st) {
  const map = {
    STD_PENDING: 'Σε αναμονή',
    STD_BUILD: 'Κατασκευή',
    STD_READY: 'Έτοιμη',
    STD_SOLD: 'Πωλήθηκε',
    SOLD: 'Πωλήθηκε',
    MONI_PROD: 'Παραγωγή',
    PENDING: 'Εκκρεμεί',
    PROD: 'Παραγωγή',
    READY: 'Έτοιμη',
  };
  return map[st] || st || '—';
}

function formatSideShort(o) {
  const s = o.side;
  if (!s) return '—';
  return s === 'ΑΡΙΣΤΕΡΗ' ? '◄ ΑΡ' : 'ΔΕΞ ►';
}

function orderDims(o) {
  const h = o.h ?? o.selectedHeight ?? '';
  const w = o.w ?? o.selectedWidth ?? '';
  return { h: String(h).trim() || '—', w: String(w).trim() || '—' };
}

function fmtDeliveryLine(v) {
  if (v == null || v === '') return '—';
  const d = parseDateStr(v);
  if (d && !isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  return String(v).trim();
}

function coatingsText(o) {
  if (!o.coatings || !Array.isArray(o.coatings) || o.coatings.length === 0) return '';
  return o.coatings.filter(Boolean).join(', ');
}

/** Μπλοκ «Σταθερά»: τίτλος αριστερά (rowspan), κάθε γραμμή = διάσταση | παρατηρήσεις. */
function buildStaveraSearchPrintLine(order) {
  const arr = order.stavera;
  if (!Array.isArray(arr) || arr.length === 0) return '';
  const list = arr.filter((s) => s && String(s.dim || '').trim());
  if (!list.length) return '';
  const rs = list.length;
  const titleCell = `<td rowspan="${rs}" style="padding:2px 8px 2px 0;vertical-align:top;white-space:nowrap;font-weight:bold;color:#333;">Σταθερά</td>`;
  const rows = list.map((s, i) => {
    const d = escapeHtml(String(s.dim).trim());
    const nRaw = s.note != null ? String(s.note).trim() : '';
    const n = nRaw ? escapeHtml(nRaw) : '';
    const dimTd = `<td style="padding:2px 10px 2px 0;vertical-align:top;white-space:nowrap;font-weight:bold;color:#1a1a1a;">${d}</td>`;
    const noteTd = `<td style="padding:2px 0;vertical-align:top;color:#1a1a1a;">${n}</td>`;
    if (i === 0) return `<tr>${titleCell}${dimTd}${noteTd}</tr>`;
    return `<tr>${dimTd}${noteTd}</tr>`;
  });
  return `<div class="stavera-sub" style="margin:2px 0 4px 0;font-size:12px;line-height:1.28;color:#1a1a1a;">
<table style="border-collapse:collapse;width:100%;max-width:100%;table-layout:fixed;">
<colgroup><col style="width:5.2em;"/><col style="width:7.5em;"/><col/></colgroup>
${rows.join('')}
</table></div>`;
}

function globalSearchPrintStyles() {
  return `<style>
  body{font-family:Arial,Helvetica,sans-serif;margin:6mm 8mm;color:#111;font-size:12px;}
  h1{font-size:15px;margin:0 0 2px 0;font-weight:bold;line-height:1.15;}
  .where{color:#444;font-size:10px;margin-bottom:4px;line-height:1.2;}
  .l1{margin:4px 0 2px 0;line-height:1.2;}
  .l2{margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#1a1a1a;line-height:1.2;}
  .status{margin:3px 0 1px 0;font-size:12px;}
  .status b{color:#333;}
  .details table{font-size:11px;}
  .gsearch-slip{page-break-inside:avoid;margin:0 0 4px 0;padding:0 0 5px 0;border-bottom:1px dashed #bbb;}
  .gsearch-slip:last-child{border-bottom:none;padding-bottom:0;margin-bottom:0;}
  @media print{@page{size:A4;margin:8mm;}}
</style>`;
}

function globalSearchPrintDocumentShell(pageTitle, bodyInner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(pageTitle)}</title>
${globalSearchPrintStyles()}
</head><body>
${bodyInner}
</body></html>`;
}

/**
 * @param {object} order
 * @param {{ where?: string }} meta
 * @returns {{ title: string, html: string } | null}
 */
function buildGlobalSearchOrderFragment(order, meta = {}) {
  if (!order || typeof order !== 'object') return null;
  const whereLine = meta.where ? escapeHtml(meta.where) : '—';
  const no = order.orderNo != null ? String(order.orderNo) : '—';
  const cust = order.customer ? String(order.customer).trim() : '';
  const title = `VAICON — Παραγγελία #${escapeHtml(no)}`;

  const { h, w } = orderDims(order);
  const dimLine = `${escapeHtml(h)}×${escapeHtml(w)} · ${escapeHtml(formatSideShort(order))}`;
  const q = order.qty != null && String(order.qty).trim() !== ''
    ? `${escapeHtml(String(order.qty).trim())}τεμ`
    : '—';
  const hrRaw = order.heightReduction != null ? String(order.heightReduction).trim() : '';
  const instRaw = order.installation != null ? String(order.installation).trim() : '';
  const lbl = 'color:#1a1a1a;font-weight:bold;';
  const valR = 'color:#c62828;font-weight:bold;';
  const valB = 'color:#1a1a1a;font-weight:bold;';

  const hrDisplay = hrRaw
    ? `<span style="${valR}">${escapeHtml(hrRaw)}</span>`
    : `<span style="${valB}">0</span>`;

  const instU = instRaw.toUpperCase();
  const instWantsMontage =
    instU === 'ΝΑΙ' || instU === 'NAI' || instRaw === 'Ναι' || instU === 'YES';
  const instDisplay = instWantsMontage
    ? `<span style="${valR}">${escapeHtml(instRaw)}</span>`
    : `<span style="${valB}">ΟΧΙ</span>`;

  let line2 = `${dimLine} · ${q}`;
  line2 += ` · <span style="${lbl}">Μείωση ύψους</span> ${hrDisplay}`;
  line2 += `<span style="display:inline-block;margin-left:14px;vertical-align:baseline;"><span style="${lbl}">Μοντάρισμα</span> ${instDisplay}</span>`;

  const staveraLine = buildStaveraSearchPrintLine(order);

  const line1 = cust
    ? `<span style="font-weight:bold;font-size:15px;">#${escapeHtml(no)}</span> <span style="color:#333;">· ${escapeHtml(cust)}</span>`
    : `<span style="font-weight:bold;font-size:15px;">#${escapeHtml(no)}</span>`;

  const statusGr = escapeHtml(statusLabelGreek(order.status));

  const extraRows = [];
  const addExtra = (label, val) => {
    if (val == null || val === '') return;
    const t = typeof val === 'string' ? val : String(val);
    if (!t.trim()) return;
    extraRows.push(
      `<tr><td style="padding:2px 8px 2px 0;color:#555;width:38%;font-size:10px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:2px 0;font-size:11px;vertical-align:top;white-space:pre-wrap;">${escapeHtml(t)}</td></tr>`
    );
  };

  if (order.sasiType) addExtra('Τύπος σασί', order.sasiType);
  if (order.lock) addExtra('Κλειδαριά', order.lock);
  if (order.hardware) addExtra('Χρώμα εξαρτημάτων', order.hardware);
  if (order.caseType) addExtra('Τύπος κάσας', order.caseType);
  if (order.caseMaterial) addExtra('Υλικό κάσας', order.caseMaterial);
  const coat = coatingsText(order);
  if (coat) addExtra('Επενδύσεις', coat);

  const notesTrim = order.notes != null ? String(order.notes).trim() : '';

  const extraBlock =
    extraRows.length > 0
      ? `<div class="details"><table style="width:100%;margin-top:5px;border-collapse:collapse;">${extraRows.join('')}</table></div>`
      : '';

  const notesSep = extraRows.length > 0 ? 'border-top:1px solid #ccc;padding-top:5px;margin-top:6px;' : 'margin-top:6px;';
  const notesBlock = notesTrim
    ? `<p style="${notesSep}font-size:11px;line-height:1.3;white-space:pre-wrap;color:#222;"><strong>Παρατηρήσεις:</strong> ${escapeHtml(notesTrim)}</p>`
    : '';

  const d1 = order.createdAt != null ? fmtDateTime(order.createdAt) : '—';
  const d2 = fmtDeliveryLine(order.deliveryDate ?? order.delivery_date ?? order.DeliveryDate);

  let d3Label = 'Πώληση / Έτοιμο';
  let d3Val = '—';
  if (order.soldAt != null) {
    d3Label = 'Πώληση';
    d3Val = fmtDateTime(order.soldAt);
  } else if (order.readyAt != null) {
    d3Label = 'Έτοιμο';
    d3Val = fmtDateTime(order.readyAt);
  } else if (order.prodAt != null) {
    d3Label = 'Έναρξη παραγωγής';
    d3Val = fmtDateTime(order.prodAt);
  }

  const datesBlock = `
<table style="width:100%;margin-top:7px;border-collapse:collapse;border-top:2px solid #333;padding-top:4px;">
  <tr><td style="padding:2px 8px 2px 0;font-size:10px;color:#555;width:42%;">Καταχώρηση</td><td style="padding:2px 0;font-size:11px;font-weight:bold;">${escapeHtml(d1)}</td></tr>
  <tr><td style="padding:2px 8px 2px 0;font-size:10px;color:#555;">Προγραμματισμένη παράδοση</td><td style="padding:2px 0;font-size:11px;font-weight:bold;">${escapeHtml(d2)}</td></tr>
  <tr><td style="padding:2px 8px 2px 0;font-size:10px;color:#555;">${escapeHtml(d3Label)}</td><td style="padding:2px 0;font-size:11px;font-weight:bold;">${escapeHtml(d3Val)}</td></tr>
</table>`;

  const html = `<h1>${title}</h1>
<p class="where"><strong>Τοποθεσία στη λίστα:</strong> ${whereLine}</p>
<div class="l1">${line1}</div>
<div class="l2">${line2}</div>
${staveraLine}
<p class="status"><b>Κατάσταση:</b> ${statusGr}</p>
${extraBlock}
${notesBlock}
${datesBlock}`;

  return { title, html };
}

/**
 * HTML μίας παραγγελίας για εκτύπωση από αποτελέσματα καθολικής αναζήτησης (πυκνή διάταξη).
 * @param {object} order — αντικείμενο παραγγελίας από Firebase
 * @param {{ where?: string }} meta
 */
export function buildGlobalSearchOrderPrintHTML(order, meta = {}) {
  const r = buildGlobalSearchOrderFragment(order, meta);
  if (!r) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><p>Δεν υπάρχουν δεδομένα.</p></body></html>';
  }
  return globalSearchPrintDocumentShell(r.title, r.html);
}

/**
 * Ένα έγγραφο με πολλές παραγγελίες — ροή ώστε να χωράνε 2+ ανά σελίδα όταν το επιτρέπει το περιεχόμενο.
 * @param {Array<{ order: object, where?: string }>} hits
 */
export function buildGlobalSearchOrdersPrintHTML(hits) {
  if (!hits || !hits.length) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><p>Δεν υπάρχουν δεδομένα.</p></body></html>';
  }
  const parts = [];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (!hit?.order) continue;
    const r = buildGlobalSearchOrderFragment(hit.order, { where: hit.where });
    if (!r) continue;
    parts.push(`<article class="gsearch-slip">${r.html}</article>`);
  }
  if (!parts.length) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><p>Δεν υπάρχουν δεδομένα.</p></body></html>';
  }
  const n = parts.length;
  const pageTitle = n === 1 ? 'VAICON — 1 παραγγελία' : `VAICON — ${n} παραγγελίες`;
  return globalSearchPrintDocumentShell(pageTitle, parts.join(''));
}

// Helper εκτύπωσης — web: κατευθείαν print dialog, mobile: expo-print + sharing
export const printHTML = async (html, title) => {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (!win) { Alert.alert("Σφάλμα", "Ο browser μπλόκαρε το παράθυρο εκτύπωσης. Επιτρέψτε τα pop-ups."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.onafterprint = () => win.close();
    win.print();
  } else {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title || 'VAICON', UTI: 'com.adobe.pdf' });
  }
};


// Βοηθητική: δημιουργεί HTML πίνακα από λίστα παραγγελιών με τίτλο
export const buildPrintHTML = (copies, phaseKey=null) => {
  const isMounting = phaseKey==='montDoor';
  const isProductionPhase = phaseKey !== null;
  const showCoatings = !isProductionPhase || isMounting;
  const isCases = phaseKey==='cases';
  const isSasi     = phaseKey==='montSasi';
  const isMontDoor = phaseKey==='montDoor';
  const isVafio    = phaseKey==='vafio';
  const isLaser = copies.some(c => c.title && (c.title.includes('LASER') || c.title.includes('ΚΑΣΕΣ') || c.title.includes('ΣΑΣΙ') || c.title.includes('ΠΡΟΦΙΛ') || c.title.includes('ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ')));
  const tableCSS = `
    body{font-family:Arial,sans-serif;margin:5mm;color:#000;background:#fff;}
    h1{font-size:22px;margin-bottom:2px;font-weight:bold;}
    h2{font-size:13px;margin-top:0;margin-bottom:8px;}
    table{width:100%;border-collapse:collapse;font-size:10px;}
    th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;white-space:nowrap;}
    td{padding:5px 4px;border-bottom:1px solid #000;vertical-align:top;}
    tr:last-child td{border-bottom:2px solid #000;}
    .page-break{page-break-after:always;}
    @media print{@page{size:A4 landscape;margin:5mm;}*{color:#000!important;background:#fff!important;}}
  `;

  const buildCasesTable = (orders) => {
    const rows = orders.map(o => {
      const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
      const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
      const kleidaria = o.lock||'—';
      const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const deliveryFmt = o.deliveryDate ? (parseDateStr(o.deliveryDate)||new Date()).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
      return `<tr>
        <td style="font-weight:bold;font-size:20px">${o.orderNo||'—'}</td>
        <td style="font-size:20px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
        <td style="font-weight:bold;font-size:17px">${fora}</td>
        <td style="font-size:16px">${mentesedesVal}</td>
        <td style="font-size:15px">${kleidaria}</td>
        <td style="font-size:15px">${o.caseType||'—'}</td>
        <td style="font-size:15px">${o.caseMaterial||'DKP'}</td>
        <td style="min-width:140px;font-size:13px">${o.notes||''}</td>
        <td style="font-size:12px;color:#444">${datesLine}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Μεντ.</th><th>Κλειδαριά</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  };

  const buildSasiTable = (orders) => {
    const rows = orders.map(o => {
      const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
      const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
      const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
      const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
      const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
      const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const deliveryFmt = o.deliveryDate ? (parseDateStr(o.deliveryDate)||new Date()).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
      return `<tr>
        <td style="font-weight:bold;font-size:20px">${o.orderNo||'—'}</td>
        <td style="font-size:20px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
        <td style="font-weight:bold;font-size:17px">${fora}</td>
        <td style="font-size:16px">${thorakisi}</td>
        <td style="font-size:16px">${mentesedesVal}</td>
        <td style="font-size:15px">${tzami}</td>
        <td style="font-size:15px">${kleidaria}</td>
        <td style="min-width:140px;font-size:13px">${o.notes||''}</td>
        <td style="font-size:12px;color:#444">${datesLine}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  };

  const buildMontDoorTable = (orders) => {
    const rows = orders.map(o => {
      const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
      const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
      const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
      const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
      const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
      const coatings = (o.coatings&&o.coatings.length>0)?o.coatings.join(', '):'';
      const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const deliveryFmt = o.deliveryDate ? (parseDateStr(o.deliveryDate)||new Date()).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
      return `<tr>
        <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
        <td style="font-size:17px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
        <td style="font-weight:bold;font-size:17px">${fora}</td>
        <td style="font-size:13px">${thorakisi}</td>
        <td style="font-size:13px">${o.hardware||'—'}</td>
        <td style="font-size:13px">${mentesedesVal}</td>
        <td style="font-size:13px">${tzami}</td>
        <td style="font-size:13px">${kleidaria}</td>
        <td style="font-size:13px">${o.caseType||'—'}</td>
        <td style="font-size:13px">${coatings}</td>
        <td style="min-width:140px;font-size:13px">${o.notes||''}</td>
        <td style="font-size:12px;color:#444">${datesLine}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Χρώμα</th><th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Τ.Κάσας</th><th>Επένδυση</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  };

  const buildVafioTable = (orders) => {
    const rows = orders.map(o => {
      const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
      const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
      const qtyVal = o.qty&&parseInt(o.qty)>1?`<span style="font-size:15px;font-weight:900;color:#cc0000">${o.qty}</span>`:'';
      const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const deliveryFmt = o.deliveryDate ? (parseDateStr(o.deliveryDate)||new Date()).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
      return `<tr>
        <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
        <td style="font-size:15px;text-align:center">${qtyVal}</td>
        <td style="font-size:17px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
        <td style="font-weight:bold;font-size:17px">${fora}</td>
        <td style="font-size:13px">${mentesedesVal}</td>
        <td style="font-size:13px">${o.caseType||'—'}</td>
        <td style="font-size:13px">${o.caseMaterial||'DKP'}</td>
        <td style="min-width:140px;font-size:13px">${o.notes||''}</td>
        <td style="font-size:12px;color:#444">${datesLine}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Μεντ.</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  };

  const dimCell = (o) => `<span style="font-size:15px;font-weight:900;letter-spacing:0.5px">${o.h||'—'} × ${o.w||'—'}</span>`;
  const qtyDisplay = (o) => { const q=parseInt(o.qty)||1; return q>1?`<span style="font-size:15px;font-weight:900;color:#cc0000">${q}</span>`:""; };
  const totalQty = (orders) => orders.reduce((sum,o)=>sum+(parseInt(o.qty)||1),0);

  const buildLaserTable = (orders, copyTitle) => {
    const isKasses  = copyTitle && copyTitle.includes('ΚΑΣΕΣ');
    const isSasi    = copyTitle && copyTitle.includes('ΣΑΣΙ');
    // ΚΑΣΕΣ: χοντρή γραμμή όταν αλλάζει caseMaterial
    if (isKasses) {
      let prevMat = null;
      const rows = orders.map(o=>{
        const mat = o.caseMaterial||'DKP';
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const borderTop = (prevMat!==null && mat!==prevMat) ? 'border-top:3px solid #000;' : '';
        prevMat = mat;
        return `<tr style="${borderTop}">
          <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
          <td style="text-align:center">${qtyDisplay(o)}</td>
          <td>${dimCell(o)}</td>
          <td style="font-weight:bold">${fora}</td>
          <td>${(o.armor||'ΜΟΝΗ')+' ΘΩΡ.'}</td>
          <td>${o.caseType||'—'}</td>
          <td style="font-weight:bold">${mat}</td>
          <td style="min-width:180px">${o.notes||''}</td>
        </tr>`;
      }).join('');
      const total = totalQty(orders);
      const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="6"></td></tr>`;
      return `<table><thead><tr>
        <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th>
      </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
    }

    // ΣΑΣΙ: χοντρή γραμμή όταν αλλάζει θωράκιση
    if (isSasi) {
      let prevArmor = null;
      const rows = orders.map(o=>{
        const armor = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ')?'ΔΙΠΛΗ':'ΜΟΝΗ';
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const borderTop = (prevArmor!==null && armor!==prevArmor) ? 'border-top:3px solid #000;' : '';
        prevArmor = armor;
        return `<tr style="${borderTop}">
          <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
          <td style="text-align:center">${qtyDisplay(o)}</td>
          <td>${dimCell(o)}</td>
          <td style="font-weight:bold">${fora}</td>
          <td style="font-weight:bold">${armor} ΘΩΡ.</td>
          <td style="min-width:180px">${o.notes||''}</td>
        </tr>`;
      }).join('');
      const total = totalQty(orders);
      const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="4"></td></tr>`;
      return `<table><thead><tr>
        <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Παρατηρήσεις</th>
      </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
    }

    // ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ + ΠΡΟΦΙΛ: πλήρης πίνακας
    const rows = orders.map(o => {
      const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
      const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
      const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
      const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
      const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
      return `<tr>
        <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
        <td style="text-align:center">${qtyDisplay(o)}</td>
        <td>${dimCell(o)}</td>
        <td style="font-weight:bold;font-size:13px">${fora}</td>
        <td>${thorakisi}</td>
        <td style="font-weight:bold;font-size:13px">${mentesedesVal}</td>
        <td style="font-weight:bold;font-size:13px">${tzami}</td>
        <td>${kleidaria}</td>
        <td>${o.caseType||'—'}</td>
        <td>${o.caseMaterial||'DKP'}</td>
        <td style="min-width:180px">${o.notes||''}</td>
      </tr>`;
    }).join('');
    const total = totalQty(orders);
    const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="9"></td></tr>`;
    return `<table><thead><tr>
      <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th>
      <th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th>
    </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
  };

  const buildTable = (orders) => {
    const rows = orders.map(o => {
      const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
      const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
      const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
      const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
      const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
      const qtyVal = o.qty&&parseInt(o.qty)>1?`&nbsp;<span style="font-size:15px;font-weight:900;color:#cc0000">${o.qty}</span>`:'';
      const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const deliveryFmt = o.deliveryDate ? (parseDateStr(o.deliveryDate)||new Date()).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      const datesLine = createdFmt ? (createdFmt + (deliveryFmt ? `&nbsp;&nbsp;&nbsp;&nbsp;${deliveryFmt}` : '')) : '';
      return `<tr>
        <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
        <td style="font-weight:bold;font-size:13px">${o.h||'—'}x${o.w||'—'}${qtyVal}</td>
        <td style="font-weight:bold;font-size:13px">${fora}</td>
        <td>${thorakisi}</td>
        <td style="font-weight:bold">${o.hardware||'—'}</td>
        <td style="font-weight:bold;font-size:13px">${mentesedesVal}</td>
        <td style="font-weight:bold;font-size:13px">${tzami}</td>
        <td>${kleidaria}</td>
        <td>${o.caseType||'—'}</td>
        <td>${o.caseMaterial||'DKP'}</td>
        <td>${o.installation==='ΝΑΙ'?'✓':''}</td>
        ${showCoatings?`<td>${(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</td>`:''}
        <td style="min-width:120px">${o.notes||''}</td>
        <td style="font-size:10px;color:#444">${datesLine}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th><th>Χρώμα</th>
      <th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Τ.Κάσας</th><th>Υλ.Κάσας</th><th>Μον.</th>${showCoatings?'<th>Επένδυση</th>':''}<th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  };

  const pages = copies.map((copy, idx) => `
    <div class="${idx < copies.length-1 ? 'page-break' : ''}">
      <h1>${copy.title}</h1>
      <h2>Σύνολο: ${copy.orders.length} παραγγελίες</h2>
      ${isLaser ? buildLaserTable(copy.orders, copy.title) : isCases ? buildCasesTable(copy.orders) : isSasi ? buildSasiTable(copy.orders) : isMontDoor ? buildMontDoorTable(copy.orders) : isVafio ? buildVafioTable(copy.orders) : buildTable(copy.orders)}
    </div>
  `).join('');

  return `<html><head><meta charset="utf-8"><style>${tableCSS}</style></head><body>${pages}</body></html>`;
};
