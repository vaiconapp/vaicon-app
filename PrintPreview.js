import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

const PHASES = [
  { key:'laser',    label:'🔴 LASER ΚΟΠΕΣ' },
  { key:'cases',    label:'🟡 ΚΑΣΣΕΣ' },
  { key:'montSasi', label:'🔵 ΚΑΤΑΡΤΙΣΗ ΣΑΣΙ' },
  { key:'vafio',    label:'🟢 ΒΑΦΕΙΟ' },
  { key:'montDoor', label:'⚫ ΜΟΝΤΑΡΙΣΜΑ/ΕΠΕΝΔΥΣΗ' },
];

export function PrintPreviewModal({ printPreview, setPrintPreview, getCopies, onConfirmPrint }) {
  if (!printPreview.visible) return null;
  const { phaseKey, orders, copies } = printPreview;
  const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label || phaseKey;
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

  const allCopies = phaseKey==='stavera'
    ? [{ title:`VAICON — ${dateStr} — ΣΤΑΘΕΡΑ`, orders }]
    : phaseKey==='cases'
    ? (() => {
        const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
        const kleistou = sorted.filter(o=>(o.caseType||'').includes('ΚΛΕΙΣΤΟΥ'));
        const anoixtou = sorted.filter(o=>(o.caseType||'').includes('ΑΝΟΙΧΤΟΥ'));
        const result = [];
        if (kleistou.length>0) result.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ`, orders:kleistou });
        if (anoixtou.length>0) result.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ`, orders:anoixtou });
        return result.length>0 ? result : [{ title:`VAICON — ${dateStr} — ΚΑΣΕΣ`, orders:sorted }];
      })()
    : getCopies(orders, phaseLabel, dateStr);
  const previewCopies = copies===4 ? allCopies : [allCopies[0]];

  const COLS_CASES = [
    {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
    {label:'Μεντ.',w:35},{label:'Κλειδαριά',w:80},{label:'Τ.Κάσας',w:90},
    {label:'Υλ.Κάσας',w:65},{label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
  ];

  const COLS_SASI = [
    {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
    {label:'Θωράκιση',w:70},{label:'Μεντ.',w:35},{label:'Τζάμι',w:55},
    {label:'Κλειδαριά',w:70},{label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
  ];

  const COLS_MONTDOOR = [
    {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
    {label:'Θωράκιση',w:70},{label:'Χρώμα',w:50},{label:'Μεντ.',w:35},
    {label:'Τζάμι',w:55},{label:'Κλειδαριά',w:70},{label:'Τ.Κάσας',w:65},
    {label:'Επένδυση',w:120},{label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
  ];

  const COLS_VAFIO = [
    {label:'Νο',w:50},{label:'Τεμ.',w:35},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
    {label:'Μεντ.',w:35},{label:'Τ.Κάσας',w:90},{label:'Υλ.Κάσας',w:65},
    {label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
  ];

  const COLS = [
    {label:'Νο',w:50},{label:'Τεμ.',w:35},{label:'Διάσταση',w:80},{label:'Φορά',w:40},
    {label:'Θωράκιση',w:70},{label:'Μεντ.',w:35},{label:'Τζάμι',w:55},{label:'Κλειδαριά',w:70},
    {label:'Χρώμα',w:50},{label:'Τ.Κάσας',w:65},{label:'Υλ.Κάσας',w:65},{label:'Μον.',w:40},{label:'Επένδυση',w:120},{label:'Παρατηρήσεις',w:220},
  ];

  const renderTable = (sortedOrders) => {
    if (phaseKey==='stavera') {
      const COLS_STAVERA = [
        {label:'Νο',w:50},{label:'Τ.Κάσας',w:90},{label:'Διάσταση Σταθερού',w:130},
        {label:'Παρατήρηση',w:220},{label:'Ημερομηνία',w:110},
      ];
      return (
        <ScrollView horizontal>
          <View>
            <View style={s.previewThead}>
              {COLS_STAVERA.map(h=>(
                <Text key={h.label} style={[s.previewTh,{width:h.w}]}>{h.label}</Text>
              ))}
            </View>
            {sortedOrders.flatMap((o,i)=>
              (o.stavera||[]).filter(s=>s.dim).map((st,si)=>{
                const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                return (
                  <View key={o.id+'-'+si} style={[s.previewTr,(i+si)%2===0?s.previewTrEven:s.previewTrOdd]}>
                    <Text style={[s.previewTd,{width:50,fontWeight:'bold'}]}>{si===0?o.orderNo||'—':''}</Text>
                    <Text style={[s.previewTd,{width:90,fontSize:12}]}>{si===0?o.caseType||'—':''}</Text>
                    <Text style={[s.previewTd,{width:130,fontWeight:'900',fontSize:15}]}>{st.dim||'—'}</Text>
                    <Text style={[s.previewTd,{width:220,fontSize:12}]}>{st.note||''}</Text>
                    <Text style={[s.previewTd,{width:110,fontSize:11,color:'#555'}]}>{si===0?deliveryFmt:''}</Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      );
    }
    if (phaseKey==='cases') {
      return (
        <ScrollView horizontal>
          <View>
            <View style={s.previewThead}>
              {COLS_CASES.map(h=>(
                <Text key={h.label} style={[s.previewTh,{width:h.w}]}>{h.label}</Text>
              ))}
            </View>
            {sortedOrders.map((o,i)=>{
              const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
              const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
              const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
              const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
              const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
              return (
                <View key={o.id+i} style={[s.previewTr,i%2===0?s.previewTrEven:s.previewTrOdd]}>
                  <Text style={[s.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                  <Text style={[s.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                  <Text style={[s.previewTd,{width:40},...[bold]]}>{fora}</Text>
                  <Text style={[s.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                  <Text style={[s.previewTd,{width:80}]}>{o.lock||'—'}</Text>
                  <Text style={[s.previewTd,{width:90}]}>{o.caseType||'—'}</Text>
                  <Text style={[s.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                  <Text style={[s.previewTd,{width:200}]}>{o.notes||''}</Text>
                  <Text style={[s.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt,deliveryFmt].filter(Boolean).join('  ')}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      );
    }
    if (phaseKey==='montSasi') {
      return (
        <ScrollView horizontal>
          <View>
            <View style={s.previewThead}>
              {COLS_SASI.map(h=>(
                <Text key={h.label} style={[s.previewTh,{width:h.w}]}>{h.label}</Text>
              ))}
            </View>
            {sortedOrders.map((o,i)=>{
              const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
              const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
              const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
              const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
              const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
              const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
              const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
              return (
                <View key={o.id+i} style={[s.previewTr,i%2===0?s.previewTrEven:s.previewTrOdd]}>
                  <Text style={[s.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                  <Text style={[s.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                  <Text style={[s.previewTd,{width:40},...[bold]]}>{fora}</Text>
                  <Text style={[s.previewTd,{width:70}]}>{thorakisi}</Text>
                  <Text style={[s.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                  <Text style={[s.previewTd,{width:55},...[bold]]}>{tzami}</Text>
                  <Text style={[s.previewTd,{width:70}]}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text>
                  <Text style={[s.previewTd,{width:200}]}>{o.notes||''}</Text>
                  <Text style={[s.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt,deliveryFmt].filter(Boolean).join('  ')}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      );
    }
    if (phaseKey==='montDoor') {
      return (
        <ScrollView horizontal>
          <View>
            <View style={s.previewThead}>
              {COLS_MONTDOOR.map(h=>(
                <Text key={h.label} style={[s.previewTh,{width:h.w}]}>{h.label}</Text>
              ))}
            </View>
            {sortedOrders.map((o,i)=>{
              const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
              const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
              const thorakisi = (o.armor||'ΜΟΝΗ')+' ΘΩΡ.';
              const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
              const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
              const createdFmt2 = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
              const deliveryFmt2 = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
              return (
                <View key={o.id+i} style={[s.previewTr,i%2===0?s.previewTrEven:s.previewTrOdd]}>
                  <Text style={[s.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                  <Text style={[s.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                  <Text style={[s.previewTd,{width:40},...[bold]]}>{fora}</Text>
                  <Text style={[s.previewTd,{width:70}]}>{thorakisi}</Text>
                  <Text style={[s.previewTd,{width:50}]}>{o.hardware||'—'}</Text>
                  <Text style={[s.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                  <Text style={[s.previewTd,{width:55},...[bold]]}>{tzami}</Text>
                  <Text style={[s.previewTd,{width:70}]}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text>
                  <Text style={[s.previewTd,{width:65}]}>{o.caseType||'—'}</Text>
                  <Text style={[s.previewTd,{width:120}]}>{(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</Text>
                  <Text style={[s.previewTd,{width:200}]}>{o.notes||''}</Text>
                  <Text style={[s.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt2,deliveryFmt2].filter(Boolean).join('  ')}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      );
    }
    if (phaseKey==='vafio') {
      return (
        <ScrollView horizontal>
          <View>
            <View style={s.previewThead}>
              {COLS_VAFIO.map(h=>(
                <Text key={h.label} style={[s.previewTh,{width:h.w}]}>{h.label}</Text>
              ))}
            </View>
            {sortedOrders.map((o,i)=>{
              const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
              const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
              const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
              const createdFmt3 = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
              const deliveryFmt3 = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
              return (
                <View key={o.id+i} style={[s.previewTr,i%2===0?s.previewTrEven:s.previewTrOdd]}>
                  <Text style={[s.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                  <Text style={[s.previewTd,{width:35},...[bold]]}>{o.qty||'1'}</Text>
                  <Text style={[s.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                  <Text style={[s.previewTd,{width:40},...[bold]]}>{fora}</Text>
                  <Text style={[s.previewTd,{width:35}]}>{mentesedesVal}</Text>
                  <Text style={[s.previewTd,{width:90}]}>{o.caseType||'—'}</Text>
                  <Text style={[s.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                  <Text style={[s.previewTd,{width:200}]}>{o.notes||''}</Text>
                  <Text style={[s.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt3,deliveryFmt3].filter(Boolean).join('  ')}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      );
    }
    return (
      <ScrollView horizontal>
        <View>
          <View style={s.previewThead}>
            {COLS.map(h=>(
              <Text key={h.label} style={[s.previewTh,{width:h.w}]}>{h.label}</Text>
            ))}
          </View>
          {sortedOrders.map((o,i)=>{
            const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
            const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
            const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
            const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
            return (
              <View key={o.id+i} style={[s.previewTr,i%2===0?s.previewTrEven:s.previewTrOdd]}>
                <Text style={[s.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                <Text style={[s.previewTd,{width:35},...[bold]]}>{o.qty||'1'}</Text>
                <Text style={[s.previewTd,{width:80},...[bold]]}>{o.h||'—'}x{o.w||'—'}</Text>
                <Text style={[s.previewTd,{width:40},...[bold]]}>{fora}</Text>
                <Text style={[s.previewTd,{width:70}]}>{(o.armor||'ΜΟΝΗ')+' ΘΩΡ.'}</Text>
                <Text style={[s.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                <Text style={[s.previewTd,{width:55},...[bold]]}>{tzami}</Text>
                <Text style={[s.previewTd,{width:70}]}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text>
                <Text style={[s.previewTd,{width:50}]}>{o.hardware||'—'}</Text>
                <Text style={[s.previewTd,{width:65}]}>{o.caseType||'—'}</Text>
                <Text style={[s.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                <Text style={[s.previewTd,{width:40}]}>{o.installation==='ΝΑΙ'?'✓':''}</Text>
                <Text style={[s.previewTd,{width:120}]}>{(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</Text>
                <Text style={[s.previewTd,{width:220}]}>{o.notes||''}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  const onClose = () => setPrintPreview({visible:false, phaseKey:null, orders:[], copies:1});

  return (
    <Modal visible={true} animationType="slide" onRequestClose={onClose}>
      <View style={s.previewContainer}>
        {/* HEADER */}
        <View style={s.previewHeader}>
          <Text style={s.previewTitle}>VAICON — {phaseLabel}</Text>
          <Text style={s.previewSub}>📅 {dateStr}  |  {orders.length} παραγγελίες  |  {copies===4?'4 ΑΝΤΙΓΡΑΦΑ':'1 ΑΝΤΙΓΡΑΦΟ'}</Text>
        </View>

        {/* ΑΝΤΙΓΡΑΦΑ */}
        <ScrollView style={s.previewScroll}>
          {previewCopies.map((copy, idx)=>(
            <View key={idx} style={{marginBottom:20}}>
              <View style={{backgroundColor:'#333',padding:8,marginBottom:4}}>
                <Text style={{color:'white',fontWeight:'bold',fontSize:12}}>
                  {copy.title}
                </Text>
              </View>
              {renderTable(copy.orders)}
            </View>
          ))}
        </ScrollView>

        {/* ΚΟΥΜΠΙΑ */}
        <View style={s.previewBtns}>
          <TouchableOpacity style={s.previewCancelBtn} onPress={onClose}>
            <Text style={s.previewCancelTxt}>ΑΚΥΡΟ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.previewPrintBtn} onPress={onConfirmPrint}>
            <Text style={s.previewPrintTxt}>🖨️ ΕΚΤΥΠΩΣΗ {copies===4?'(4 PDF)':''}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  previewContainer: { flex:1, backgroundColor:'#fff' },
  previewHeader: { backgroundColor:'#fff', padding:16, borderBottomWidth:2, borderBottomColor:'#000' },
  previewTitle: { fontSize:18, fontWeight:'bold', color:'#000' },
  previewSub: { fontSize:13, color:'#000', marginTop:4 },
  previewScroll: { flex:1, padding:10 },
  previewThead: { flexDirection:'row', backgroundColor:'#fff', paddingVertical:8, borderBottomWidth:2, borderBottomColor:'#000', borderTopWidth:2, borderTopColor:'#000' },
  previewTh: { width:110, color:'#000', fontWeight:'bold', fontSize:11, paddingHorizontal:6 },
  previewTr: { flexDirection:'row', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#000' },
  previewTrEven: { backgroundColor:'#fff' },
  previewTrOdd: { backgroundColor:'#fff' },
  previewTd: { width:110, fontSize:11, color:'#000', paddingHorizontal:6 },
  previewBtns: { flexDirection:'row', padding:16, gap:12, borderTopWidth:1, borderTopColor:'#ddd', backgroundColor:'#fff' },
  previewCancelBtn: { flex:1, padding:16, borderRadius:10, backgroundColor:'#e0e0e0', alignItems:'center' },
  previewCancelTxt: { fontWeight:'bold', fontSize:15, color:'#333' },
  previewPrintBtn: { flex:2, padding:16, borderRadius:10, backgroundColor:'#000', alignItems:'center' },
  previewPrintTxt: { fontWeight:'bold', fontSize:15, color:'white' },
});
