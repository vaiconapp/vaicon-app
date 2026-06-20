import React from 'react';
import { View, Text } from 'react-native';
import { findFormatItem, getFormatStyle } from './formatHelpers';

const PEEPHOLE_WARN_NOTE = 'ΠΡΟΣΟΧΗ ΟΧΙ ΤΡΥΠΗΜΑ ΓΙΑ ΜΑΤΙ';
const fmtDate = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };
const getCoatingType = (name) => {
  const n = String(name||'').toUpperCase();
  if (n.includes('ΕΞΩ')) return 'EXO';
  if (n.includes('ΜΕΣΑ') || n.includes('ΕΣΩΤ')) return 'MESA';
  return 'OTHER';
};

const NotesText = ({ notes, style }) => {
  if (!notes) return null;
  const s = String(notes);
  const idx = s.indexOf(PEEPHOLE_WARN_NOTE);
  if (idx === -1) return <Text style={style}>Σημ: {s}</Text>;
  return (
    <Text style={style}>Σημ: {s.slice(0, idx)}
      <Text style={{ color: '#c62828', fontWeight: 'bold', fontSize: 16 }}>{PEEPHOLE_WARN_NOTE}</Text>
      {s.slice(idx + PEEPHOLE_WARN_NOTE.length)}
    </Text>
  );
};

const TYPE_RANK = { EXO: 0, MESA: 1, OTHER: 2 };

const CoatDetails = ({ order }) => {
  const cd = order?.coatingDetails || {};
  const buildRow = (d, keys) => keys.map(k => d[k] && String(d[k]).trim() ? { key: k, value: String(d[k]).trim() } : null).filter(Boolean);
  const userStyle = { color: '#d32f2f', fontWeight: '900', fontStyle: 'italic' };
  const joinSep = (items, userKeys = []) => items.flatMap((it, i) => {
    const valEl = <Text key={i} style={userKeys.includes(it.key) ? userStyle : undefined}>{it.value}</Text>;
    return i === 0 ? [valEl] : [<Text key={'s' + i} style={{ fontWeight: '900', color: '#d32f2f' }}>{'  /  '}</Text>, valEl];
  });
  const cells = (order.coatings || []).filter(n => n && String(n).trim()).map(name => {
    const d = cd[name] || {};
    const fyllo = buildRow(d, ['dim', 'design', 'color']);
    const perv = buildRow(d, ['frameW', 'frameColor']);
    const kasa = buildRow(d, ['caseW', 'caseColor']);
    if (!fyllo.length && !perv.length && !kasa.length) return null;
    return { name, type: getCoatingType(name), d, fyllo, perv, kasa };
  }).filter(Boolean).sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type]);
  if (!cells.length) return null;
  const rowStyle = { fontSize: 13, color: '#1a1a1a', marginBottom: 2, lineHeight: 18 };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 6, backgroundColor: '#fcfcfc' }}>
      {cells.map(({ name, type, d, fyllo, perv, kasa }) => {
        const c = type === 'EXO' ? '#e65100' : type === 'MESA' ? '#1565C0' : '#444';
        const userKeys = [d.dimUser && 'dim', d.frameColorUser && 'frameColor', d.caseColorUser && 'caseColor'].filter(Boolean);
        return (
          <View key={name} style={{ flexGrow: 1, flexBasis: '47%', minWidth: 150, borderWidth: 1, borderColor: c, borderRadius: 6, padding: 6, backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: c, marginBottom: 3 }}>{name}</Text>
            {fyllo.length > 0 && <Text style={rowStyle}><Text style={{ fontWeight: '900' }}>Φύλλο: </Text>{joinSep(fyllo, userKeys)}</Text>}
            {perv.length > 0 && <Text style={rowStyle}><Text style={{ fontWeight: '900' }}>Περβάζι: </Text>{joinSep(perv, userKeys)}</Text>}
            {type === 'EXO' && kasa.length > 0 && <Text style={rowStyle}><Text style={{ fontWeight: '900' }}>Κάσα: </Text>{joinSep(kasa, userKeys)}</Text>}
            {type === 'MESA' && d.pihaki && <Text style={[rowStyle, { color: '#1565C0', fontWeight: '900' }]}>✓ Πηχάκι (ξυλογωνιά)</Text>}
          </View>
        );
      })}
    </View>
  );
};

// Προβολή τυποποιημένης παραγγελίας — ίδια εμφάνιση με την κάρτα στις καταχωρημένες (μονή/διπλή).
export function StdOrderPreview({ order: o, coatings = [], showCustomer = true }) {
  const coatingStyle = (name, size) => getFormatStyle(findFormatItem(name, coatings), size);
  const created = fmtDate(o.createdAt);
  const del = String(o.deliveryDate || '').trim();
  const isDipli = o.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ';
  const hasCoats = o.coatings && o.coatings.length > 0;
  const bigQty = o.qty && parseInt(o.qty) > 1;
  const preTxt = [o.lock ? `🔒 ${o.lock}` : '', o.caseType ? (o.caseType.includes('ΑΝΟΙΧΤΟΥ') ? 'ΑΝΟΙΧΤΗ ΚΑΣΑ' : 'ΚΛΕΙΣΤΗ ΚΑΣΑ') : ''].filter(Boolean).join(' — ');
  return (
    <View>
      {(created || del) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 3 }}>
          {created ? <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#007AFF' }}>📅 {created}</Text> : null}
          {created && del ? <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#e65100' }}> — {del}</Text> : null}
          {!created && del ? <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#e65100' }}>🚚 {del}</Text> : null}
        </View>
      ) : null}
      {showCustomer && (o.customer || bigQty) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {o.customer ? <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' }}>{o.customer}</Text> : null}
          {bigQty ? <Text style={{ fontSize: 15, fontWeight: '900', color: '#cc0000' }}>{o.qty}τεμ</Text> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 15, fontWeight: '900', color: '#1a1a1a' }}>{o.h}x{o.w}</Text>
        <Text style={{ fontSize: 15, fontWeight: '900', color: '#1a1a1a' }}>{o.side === 'ΑΡΙΣΤΕΡΗ' ? '◄ ΑΡ' : 'ΔΕΞ ►'}</Text>
        <Text style={{ fontSize: 12, fontWeight: 'bold', color: isDipli ? '#8B0000' : '#1565C0' }}>{isDipli ? 'ΔΙΠΛΗ' : 'ΜΟΝΗ'}</Text>
        {o.hardware ? <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#555' }}>🎨 {o.hardware}</Text> : null}
        {!showCustomer && bigQty ? <Text style={{ fontSize: 15, fontWeight: '900', color: '#cc0000' }}>{o.qty}τεμ</Text> : null}
      </View>
      {(o.lock || o.caseType || hasCoats) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
          <Text style={{ fontSize: 13, color: '#555' }}>
            {preTxt}{preTxt && hasCoats ? ' — ' : ''}
            {hasCoats ? o.coatings.map((n, i) => (<Text key={i} style={coatingStyle(n, 13)}>{i > 0 ? ', ' : ''}{n}</Text>)) : null}
          </Text>
        </View>
      ) : null}
      <CoatDetails order={o} />
      {o.heightReduction ? <Text style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', marginTop: 2 }}>📏 Μείωση: {o.heightReduction}</Text> : null}
      {o.stavera && o.stavera.filter(s => s.dim).length > 0 ? <Text style={{ fontSize: 12, color: '#555', marginTop: 2 }}>📐 {o.stavera.filter(s => s.dim).map(s => (s.qty ? `${s.qty}τεμ ` : '') + s.dim + (s.note ? ' ' + s.note : '')).join(' | ')}</Text> : null}
      {(o.kypri === 'ΝΑΙ' || o.installation === 'ΝΑΙ' || o.placement === 'ΝΑΙ') ? (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
          {o.kypri === 'ΝΑΙ' ? <View style={{ backgroundColor: '#6a1b9a', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>🪟 ΚΥΠΡΙ</Text></View> : null}
          {o.installation === 'ΝΑΙ' ? <View style={{ backgroundColor: '#1565C0', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View> : null}
          {o.placement === 'ΝΑΙ' ? <View style={{ backgroundColor: '#E65100', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>📍 ΤΟΠΟΘΕΤΗΣΗ</Text></View> : null}
        </View>
      ) : null}
      <NotesText notes={o.notes} style={{ fontSize: 12, color: '#888', marginTop: 3 }} />
    </View>
  );
}
