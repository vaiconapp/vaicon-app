import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';

export function HardwarePickerModal({ visible, onClose, customForm, setCustomForm, showCustomHardwareInput, setShowCustomHardwareInput, customHardwareText, setCustomHardwareText }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
        <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16}}>
          <View style={{backgroundColor:'#8B0000',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>Χρώμα Εξαρτημάτων</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
            </TouchableOpacity>
          </View>
          {['Nikel','Bronze','Nikel Best','Bronze Best','Best Παραγγελία',''].map((c,i)=>(
            <TouchableOpacity key={i}
              style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
              onPress={()=>{
                if(c===''){
                  setShowCustomHardwareInput(true);
                  setCustomHardwareText('');
                } else {
                  setCustomForm({...customForm,hardware:c});
                  setShowCustomHardwareInput(false);
                  onClose();
                }
              }}>
              <Text style={{fontSize:15,color:c?'#000':'#888'}}>{c||'Άλλο (γράψτε εδώ)...'}</Text>
              {customForm.hardware===c&&c!==''&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
            </TouchableOpacity>
          ))}
          {showCustomHardwareInput&&(
            <View style={{padding:12}}>
              <TextInput
                autoFocus
                style={{backgroundColor:'#f5f5f5',padding:12,borderRadius:8,borderWidth:1,borderColor:'#8B0000',fontSize:15}}
                placeholder="Γράψτε χρώμα εξαρτημάτων..."
                value={customHardwareText}
                onChangeText={v=>setCustomHardwareText(v)}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={{backgroundColor:'#8B0000',padding:12,borderRadius:8,alignItems:'center',marginTop:8}}
                onPress={()=>{
                  if(customHardwareText.trim()){
                    setCustomForm({...customForm,hardware:customHardwareText.trim()});
                  }
                  setShowCustomHardwareInput(false);
                  onClose();
                }}>
                <Text style={{color:'white',fontWeight:'bold'}}>ΟΚ</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={{height:20}}/>
        </View>
      </View>
    </Modal>
  );
}

export function LockPickerModal({ visible, onClose, customForm, setCustomForm, locks }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
        <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'60%'}}>
          <View style={{backgroundColor:'#8B0000',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🔒 Κλειδαριά</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            <TouchableOpacity
              style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
              onPress={()=>{setCustomForm({...customForm,lock:''});onClose();}}>
              <Text style={{fontSize:15,color:'#888'}}>— Χωρίς κλειδαριά</Text>
              {!customForm.lock&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
            </TouchableOpacity>
            {(locks||[]).map(l=>(
              <TouchableOpacity key={l.id}
                style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                onPress={()=>{setCustomForm({...customForm,lock:l.name+(l.type?' ('+l.type+')':'')});onClose();}}>
                <View>
                  <Text style={{fontSize:15,color:'#000',fontWeight:'600'}}>{l.name}</Text>
                  {l.type?<Text style={{fontSize:12,color:'#666'}}>{l.type}</Text>:null}
                </View>
                {customForm.lock===l.name+(l.type?' ('+l.type+')':'')&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
              </TouchableOpacity>
            ))}
            {(locks||[]).length===0&&<Text style={{textAlign:'center',color:'#aaa',padding:24}}>Δεν υπάρχουν καταχωρημένες κλειδαριές.</Text>}
          </ScrollView>
          <View style={{height:20}}/>
        </View>
      </View>
    </Modal>
  );
}

export function CoatingsPickerModal({ visible, onClose, customForm, setCustomForm, coatings }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
        <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'60%'}}>
          <View style={{backgroundColor:'#007AFF',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🎨 Επένδυση Πόρτας</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {coatings.length===0 && (
              <Text style={{padding:20,color:'#aaa',textAlign:'center'}}>Δεν υπάρχουν επενδύσεις. Προσθέστε από το μενού ☰.</Text>
            )}
            {coatings.map(c=>{
              const selected = (customForm.coatings||[]).includes(c.name);
              const n = c.name?.toLowerCase()||'';
              const bg = n.includes('μέσα')||n.includes('μεσα') ? '#E8F4FD' : n.includes('έξω')||n.includes('εξω') ? '#FFF3E0' : '#fff';
              return (
                <TouchableOpacity key={c.id}
                  style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between', backgroundColor: bg}}
                  onPress={()=>{
                    const current = customForm.coatings||[];
                    const updated = selected ? current.filter(x=>x!==c.name) : [...current,c.name];
                    setCustomForm({...customForm,coatings:updated});
                    if (!selected && updated.length >= 2) {
                      setTimeout(()=>onClose(), 150);
                    }
                  }}>
                  <Text style={{fontSize:15,color:'#000'}}>{c.name}</Text>
                  {selected && <Text style={{color:'#007AFF',fontSize:18,fontWeight:'bold'}}>✓</Text>}
                </TouchableOpacity>
              );
            })}
            {(customForm.coatings||[]).length>0&&(
              <TouchableOpacity
                style={{margin:12,padding:12,backgroundColor:'#ff4444',borderRadius:8,alignItems:'center'}}
                onPress={()=>setCustomForm({...customForm,coatings:[]})}>
                <Text style={{color:'white',fontWeight:'bold'}}>ΕΚΚΑΘΑΡΙΣΗ ΕΠΙΛΟΓΩΝ</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          <TouchableOpacity
            style={{margin:12,padding:14,backgroundColor:'#007AFF',borderRadius:8,alignItems:'center'}}
            onPress={onClose}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>ΟΛΟΚΛΗΡΩΣΗ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function DatePickerModal({ visible, onClose, customForm, setCustomForm, datePickerDay, setDatePickerDay, datePickerMonth, setDatePickerMonth, datePickerYear, setDatePickerYear }) {
  const months = ['ΙΑΝ','ΦΕΒ','ΜΑΡ','ΑΠΡ','ΜΑΙ','ΙΟΥΝ','ΙΟΥΛ','ΑΥΓ','ΣΕΠ','ΟΚΤ','ΝΟΕ','ΔΕΚ'];
  const now = new Date();
  const days = Array.from({length:31},(_,i)=>String(i+1));
  const years = [String(now.getFullYear()),String(now.getFullYear()+1)];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
        <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,padding:16}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <Text style={{fontWeight:'bold',fontSize:16}}>📅 Ημερομηνία Παράδοσης</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{fontSize:20,fontWeight:'bold',color:'#888'}}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={{fontWeight:'bold',color:'#555',marginBottom:6}}>Ημέρα:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
            <View style={{flexDirection:'row',gap:6}}>
              {days.map(d=>(
                <TouchableOpacity key={d} onPress={()=>setDatePickerDay(d)}
                  style={{width:36,height:36,borderRadius:18,backgroundColor:datePickerDay===d?'#8B0000':'#eee',alignItems:'center',justifyContent:'center'}}>
                  <Text style={{color:datePickerDay===d?'white':'#333',fontWeight:'bold',fontSize:12}}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Text style={{fontWeight:'bold',color:'#555',marginBottom:6}}>Μήνας:</Text>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:12}}>
            {months.map((m,i)=>(
              <TouchableOpacity key={m} onPress={()=>setDatePickerMonth(String(i+1))}
                style={{paddingHorizontal:10,paddingVertical:6,borderRadius:6,backgroundColor:datePickerMonth===String(i+1)?'#8B0000':'#eee'}}>
                <Text style={{color:datePickerMonth===String(i+1)?'white':'#333',fontWeight:'bold',fontSize:12}}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{fontWeight:'bold',color:'#555',marginBottom:6}}>Έτος:</Text>
          <View style={{flexDirection:'row',gap:6,marginBottom:16}}>
            {years.map(y=>(
              <TouchableOpacity key={y} onPress={()=>setDatePickerYear(y)}
                style={{paddingHorizontal:16,paddingVertical:8,borderRadius:6,backgroundColor:datePickerYear===y?'#8B0000':'#eee'}}>
                <Text style={{color:datePickerYear===y?'white':'#333',fontWeight:'bold'}}>{y}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={{backgroundColor:'#8B0000',padding:14,borderRadius:8,alignItems:'center'}}
            onPress={()=>{
              setCustomForm({...customForm,deliveryDate:`${datePickerDay}/${datePickerMonth}/${datePickerYear}`});
              onClose();
            }}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>ΕΠΙΛΟΓΗ</Text>
          </TouchableOpacity>
          <View style={{height:20}}/>
        </View>
      </View>
    </Modal>
  );
}
