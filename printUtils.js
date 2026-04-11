import { Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

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
  const isLaser = copies.some(c => c.title && c.title.includes('LASER') || c.title.includes('ΚΑΣΣΕΣ') || c.title.includes('ΣΑΣΙ') || c.title.includes('ΠΡΟΦΙΛ') || c.title.includes('ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ'));
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
      const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
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
      const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
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
      const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
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
      const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
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
    const isKasses  = copyTitle && copyTitle.includes('ΚΑΣΣΕΣ');
    const isSasi    = copyTitle && copyTitle.includes('ΣΑΣΙ');
    const isProfil  = false; // ΠΡΟΦΙΛ ίδιο με ΠΡΟΓΡΑΜΜΑ

    // ΠΡΟΦΙΛ: μόνο διαστάσεις
    if (isProfil) {
      const rows = orders.map(o=>`<tr><td style="font-size:18px;font-weight:900;padding:7px 6px">${dimCell(o)}</td></tr>`).join('');
      return `<table><thead><tr><th>Διάσταση</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    // ΚΑΣΣΕΣ: χοντρή γραμμή όταν αλλάζει caseMaterial
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
      const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
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
