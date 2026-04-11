import React, { useState } from 'react';
import { StyleSheet, Modal, View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';

export function SellModal({ visible, totalQty, onConfirm, onCancel }) {
  const [qty, setQty] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>ΜΕΡΙΚΗ ΠΩΛΗΣΗ</Text>
          <Text style={styles.modalSub}>Πόσα τεμάχια θα πουληθούν;</Text>
          <Text style={styles.modalTotal}>Σύνολο: {totalQty} τεμ.</Text>
          <TextInput style={styles.modalInput} keyboardType="numeric" value={qty} onChangeText={setQty} placeholder="π.χ. 2" autoFocus />
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#ccc'}]} onPress={()=>{setQty('');onCancel();}}>
              <Text style={{fontWeight:'bold'}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#8B0000'}]} onPress={()=>{
              const n=parseInt(qty);
              if(!n||n<1||n>totalQty) return Alert.alert("Σφάλμα",`Βάλτε αριθμό 1 έως ${totalQty}`);
              setQty(''); onConfirm(n);
            }}>
              <Text style={{fontWeight:'bold',color:'white'}}>ΠΩΛΗΣΗ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ConfirmModal({ visible, title, message, confirmText, onConfirm, onCancel }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
        <View style={{ backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380 }}>
          <Text style={{ fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:12, textAlign:'center' }}>{title}</Text>
          <Text style={{ fontSize:14, color:'#444', marginBottom:24, textAlign:'center', lineHeight:20 }}>{message}</Text>
          <TouchableOpacity
            style={{ backgroundColor:'#00C851', padding:14, borderRadius:10, alignItems:'center', marginBottom:8 }}
            onPress={onConfirm}>
            <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>{confirmText}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd' }}
            onPress={onCancel}>
            <Text style={{ color:'#555', fontWeight:'bold', fontSize:14 }}>ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function DuplicateModal({ visible, base, suggested, onUse, onKeep, onCancel }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
        <View style={{ backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380 }}>
          <Text style={{ fontSize:17, fontWeight:'bold', color:'#8B0000', marginBottom:8, textAlign:'center' }}>⚠️ Διπλότυπο Νούμερο</Text>
          <Text style={{ fontSize:14, color:'#444', marginBottom:4, textAlign:'center' }}>
            Το νούμερο <Text style={{ fontWeight:'bold' }}>{base}</Text> υπάρχει ήδη.
          </Text>
          <Text style={{ fontSize:13, color:'#888', marginBottom:20, textAlign:'center' }}>
            Πρόταση: <Text style={{ fontWeight:'bold', color:'#007AFF' }}>{suggested}</Text>
          </Text>
          <TouchableOpacity
            style={{ backgroundColor:'#007AFF', padding:14, borderRadius:10, alignItems:'center', marginBottom:8 }}
            onPress={onUse}>
            <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>✅ ΧΡΗΣΙΜΟΠΟΙΩ {suggested}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', marginBottom:8, borderWidth:1, borderColor:'#ddd' }}
            onPress={onKeep}>
            <Text style={{ color:'#1a1a1a', fontWeight:'bold', fontSize:14 }}>🔒 ΚΡΑΤΩ {base}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor:'#ff4444', padding:14, borderRadius:10, alignItems:'center' }}
            onPress={onCancel}>
            <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>✕ ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' },
  modalBox: { backgroundColor:'#fff', borderRadius:16, padding:24, width:'80%', alignItems:'center' },
  modalTitle: { fontSize:18, fontWeight:'bold', color:'#8B0000', marginBottom:6 },
  modalSub: { fontSize:14, color:'#444', marginBottom:4, textAlign:'center' },
  modalTotal: { fontSize:13, color:'#888', marginBottom:16 },
  modalInput: { borderWidth:2, borderColor:'#8B0000', borderRadius:8, padding:12, fontSize:28, fontWeight:'bold', textAlign:'center', color:'#8B0000', width:'60%', marginBottom:20 },
  modalBtn: { flex:1, padding:14, borderRadius:8, alignItems:'center' },
});
