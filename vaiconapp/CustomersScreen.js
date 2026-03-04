import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { FIREBASE_URL } from './App';

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

const INIT = { name: '', phone: '', identifier: '' };

export default function CustomersScreen({ customers, setCustomers, onClose, prefillName, onCustomerAdded, customOrders=[] }) {
  const [form, setForm] = useState(prefillName ? { name: prefillName, phone: '', identifier: '' } : INIT);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedCustomerOrders, setSelectedCustomerOrders] = useState(null); // πελάτης για εμφάνιση παραγγελιών

  const getStatusLabel = (order) => {
    if (order.status==='PENDING') return { label:'📋 Καταχωρημένη', color:'#ff4444' };
    if (order.status==='STD_PENDING') return { label:'📐 Τυποποιημένη', color:'#8B0000' };
    if (order.status==='READY') return { label:'✅ Έτοιμη Αποθήκης', color:'#00C851' };
    if (order.status==='PROD') {
      const activePhasesLabels = ['laser','cases','sasi','mounting','painting']
        .map(k => order.phases?.[k])
        .filter(p => p?.active && !p?.done)
        .map(p => p?.label||'');
      const doneCount = ['laser','cases','sasi','mounting','painting'].filter(k=>order.phases?.[k]?.done).length;
      return { label:`🔨 Παραγωγή (${doneCount} φάσεις done)`, color:'#ffbb33' };
    }
    return { label:'—', color:'#999' };
  };

  const syncToCloud = async (customer) => {
    try {
      await fetch(`${FIREBASE_URL}/customers/${customer.id}.json`, { method: 'PUT', body: JSON.stringify(customer) });
    } catch { Alert.alert("Σφάλμα", "Δεν αποθηκεύτηκε στο Cloud."); }
  };

  const deleteFromCloud = async (id) => {
    try { await fetch(`${FIREBASE_URL}/customers/${id}.json`, { method: 'DELETE' }); } catch(e) {}
  };

  const saveCustomer = async () => {
    if (!form.name.trim()) return Alert.alert("Προσοχή", "Βάλτε Όνομα Πελάτη.");
    if (editingId) {
      const updated = { ...customers.find(c => c.id === editingId), ...form };
      setCustomers(customers.map(c => c.id === editingId ? updated : c));
      await syncToCloud(updated);
      Alert.alert("VAICON", `Ο πελάτης ενημερώθηκε!\n${form.name}`);
    } else {
      const newCustomer = { ...form, id: Date.now().toString(), createdAt: Date.now() };
      setCustomers([newCustomer, ...customers]);
      await syncToCloud(newCustomer);
      Alert.alert("VAICON", `Πελάτης αποθηκεύτηκε!\n${form.name}`, [
        { text:'ΟΚ', onPress:()=>{ if(onCustomerAdded) onCustomerAdded(newCustomer); } }
      ]);
      setForm(INIT); setEditingId(null); return;
    }
    setForm(INIT);
    setEditingId(null);
  };

  const editCustomer = (c) => {
    setForm({ name: c.name || '', phone: c.phone || '', identifier: c.identifier || '' });
    setEditingId(c.id);
  };

  const deleteCustomer = (id) => {
    Alert.alert("⚠️ Διαγραφή Πελάτη", "Είσαι σίγουρος; Η ενέργεια δεν αναιρείται!", [
      { text: "ΑΚΥΡΟ", style: "cancel" },
      { text: "ΔΙΑΓΡΑΦΗ", style: "destructive", onPress: async () => {
        setCustomers(customers.filter(c => c.id !== id));
        await deleteFromCloud(id);
      }}
    ]);
  };

  const filtered = customers.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.identifier?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>👥 ΠΕΛΑΤΕΣ</Text>
      </View>

      <ScrollView style={{ padding: 12 }}>
        <View style={{ paddingBottom: 40 }}>

          <Text style={styles.sectionTitle}>
            {editingId ? '✏️ ΕΠΕΞΕΡΓΑΣΙΑ ΠΕΛΑΤΗ' : 'ΚΑΤΑΧΩΡΗΣΗ ΝΕΟΥ ΠΕΛΑΤΗ'}
          </Text>
          {editingId && (
            <View style={styles.editBanner}>
              <Text style={styles.editBannerTxt}>Επεξεργάζεσαι υπάρχοντα πελάτη</Text>
            </View>
          )}
          <TextInput style={styles.input} placeholder="Όνομα Πελάτη *" value={form.name} onChangeText={v => setForm({...form, name:v})} />
          <TextInput style={styles.input} placeholder="Τηλέφωνο Επικοινωνίας" keyboardType="phone-pad" value={form.phone} onChangeText={v => setForm({...form, phone:v})} />
          <TextInput style={styles.input} placeholder="Αναγνωριστικό (π.χ. Γιώργης Μαραθώνας)" value={form.identifier} onChangeText={v => setForm({...form, identifier:v})} />

          <View style={{ flexDirection:'row', gap:8 }}>
            {editingId && (
              <TouchableOpacity style={[styles.saveBtn, { flex:1, backgroundColor:'#888' }]} onPress={() => { setForm(INIT); setEditingId(null); }}>
                <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.saveBtn, { flex:2 }]} onPress={saveCustomer}>
              <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>
                {editingId ? '💾 ΑΠΟΘΗΚΕΥΣΗ ΑΛΛΑΓΩΝ' : 'ΑΠΟΘΗΚΕΥΣΗ ΠΕΛΑΤΗ'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop:24 }]}>ΛΙΣΤΑ ΠΕΛΑΤΩΝ ({customers.length})</Text>
          <Text style={styles.hint}>💡 Κράτα 3 δευτ. για επεξεργασία • Κράτα το ✕ 2 δευτ. για διαγραφή</Text>
          <TextInput style={[styles.input, { backgroundColor:'#fff' }]} placeholder="🔍 Αναζήτηση" value={search} onChangeText={setSearch} />

          {filtered.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[styles.customerCard, editingId === c.id && styles.customerCardEditing]}
              onLongPress={() => editCustomer(c)}
              delayLongPress={3000}
              activeOpacity={0.7}
            >
              <View style={{ flex:1 }}>
                <Text style={styles.customerName}>{c.name}</Text>
                {c.phone ? <Text style={styles.customerDetail}>📞 {c.phone}</Text> : null}
                {c.identifier ? <Text style={styles.customerDetail}>🏷 {c.identifier}</Text> : null}
                <Text style={styles.customerDate}>📅 {fmtDate(c.createdAt)}</Text>
              </View>
              <View style={{gap:6}}>
                {(()=>{
                  const hasOrders = customOrders.some(o=>o.customer===c.name && o.status!=='SOLD');
                  return (
                    <TouchableOpacity
                      style={{backgroundColor: hasOrders ? '#007AFF' : '#ccc', paddingHorizontal:10, paddingVertical:6, borderRadius:6, alignItems:'center'}}
                      onPress={()=>{ if(hasOrders) setSelectedCustomerOrders(c); }}>
                      <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>📦 ΠΑΡΑΓΓΕΛΙΕΣ</Text>
                    </TouchableOpacity>
                  );
                })()}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onLongPress={() => deleteCustomer(c.id)}
                  delayLongPress={2000}
                  activeOpacity={0.6}
                >
                  <Text style={styles.deleteTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}

          {filtered.length === 0 && (
            <Text style={{ textAlign:'center', color:'#999', marginTop:20 }}>Δεν βρέθηκαν πελάτες</Text>
          )}
        </View>
      </ScrollView>

      {/* MODAL ΠΑΡΑΓΓΕΛΙΩΝ ΠΕΛΑΤΗ — έξω από ScrollView */}
      <Modal visible={!!selectedCustomerOrders} transparent animationType="slide" onRequestClose={()=>setSelectedCustomerOrders(null)}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff', borderTopLeftRadius:16, borderTopRightRadius:16, maxHeight:'75%'}}>
            <View style={{backgroundColor:'#8B0000', padding:16, borderTopLeftRadius:16, borderTopRightRadius:16, flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>📦 {selectedCustomerOrders?.name}</Text>
              <TouchableOpacity onPress={()=>setSelectedCustomerOrders(null)}>
                <Text style={{color:'white', fontSize:20, fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{padding:12}}>
              {customOrders.filter(o=>o.customer===selectedCustomerOrders?.name && o.status!=='SOLD').length === 0 ? (
                <Text style={{textAlign:'center', color:'#999', padding:20}}>Δεν υπάρχουν ενεργές παραγγελίες</Text>
              ) : (
                customOrders.filter(o=>o.customer===selectedCustomerOrders?.name && o.status!=='SOLD')
                  .sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0))
                  .map(o=>{
                    const st = getStatusLabel(o);
                    return (
                      <View key={o.id} style={{backgroundColor:'#f9f9f9', borderRadius:8, padding:12, marginBottom:8, borderLeftWidth:4, borderLeftColor:st.color}}>
                        <Text style={{fontWeight:'bold', fontSize:14}}>#{o.orderNo} — {o.h}x{o.w}</Text>
                        <Text style={{fontSize:12, color:'#555', marginTop:2}}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'📐 Τυποποιημένη':'✏️ Ειδική'} | {o.side}</Text>
                        {o.notes?<Text style={{fontSize:11, color:'#888', marginTop:2}}>Σημ: {o.notes}</Text>:null}
                        <View style={{marginTop:6, backgroundColor:st.color+'22', paddingHorizontal:8, paddingVertical:4, borderRadius:6, alignSelf:'flex-start'}}>
                          <Text style={{fontSize:12, fontWeight:'bold', color:st.color}}>{st.label}</Text>
                        </View>
                      </View>
                    );
                  })
              )}
              <View style={{height:20}}/>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor:'#8B0000', paddingVertical:16, paddingHorizontal:16, flexDirection:'row', alignItems:'center', paddingTop:48 },
  backBtn: { marginRight:16, padding:4 },
  backTxt: { color:'white', fontSize:20, fontWeight:'bold' },
  headerTitle: { color:'white', fontSize:18, fontWeight:'bold', letterSpacing:2 },
  sectionTitle: { fontWeight:'bold', fontSize:14, color:'#333', marginBottom:10 },
  hint: { fontSize:11, color:'#888', marginBottom:10, fontStyle:'italic' },
  editBanner: { backgroundColor:'#fff3cd', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:4, borderLeftColor:'#ffbb33' },
  editBannerTxt: { color:'#856404', fontWeight:'bold', fontSize:13 },
  input: { backgroundColor:'#fff', padding:12, borderRadius:8, marginBottom:8, borderWidth:1, borderColor:'#ddd', fontSize:14 },
  saveBtn: { backgroundColor:'#8B0000', padding:16, borderRadius:8, alignItems:'center', marginTop:4, marginBottom:8 },
  customerCard: { backgroundColor:'#fff', borderRadius:8, padding:14, marginBottom:8, flexDirection:'row', alignItems:'center', borderLeftWidth:5, borderLeftColor:'#8B0000', elevation:2 },
  customerCardEditing: { borderLeftColor:'#ffbb33', backgroundColor:'#fffdf0' },
  customerName: { fontSize:16, fontWeight:'bold', color:'#1a1a1a', marginBottom:4 },
  customerDetail: { fontSize:13, color:'#555', marginBottom:2 },
  customerDate: { fontSize:11, color:'#999', marginTop:4 },
  deleteBtn: { padding:10, backgroundColor:'#ff4444', borderRadius:6, borderWidth:2, borderColor:'#cc0000' },
  deleteTxt: { color:'white', fontWeight:'bold', fontSize:16 },
});