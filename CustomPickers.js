import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, TextInput, Dimensions } from 'react-native';
import { sortCoatingsGrouped } from './formatHelpers';
import { DIPLI_MODELS, DIPLI_DEFAULT } from './utils';

export function DipliModelPickerModal({ visible, onClose, anchor, customForm, setCustomForm }) {
  const sel = customForm.dipliModel || DIPLI_DEFAULT;
  const W = 260, sw = Dimensions.get('window').width;
  const left = anchor ? Math.max(6, Math.min(anchor.x, sw - W - 6)) : 6;
  const top = anchor ? anchor.y + anchor.h + 2 : 80;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{flex:1}}>
        <View style={{position:'absolute',left,top,width:W,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#5D4037',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
          {DIPLI_MODELS.map(m=>(
            <TouchableOpacity key={m.code}
              style={{paddingVertical:8,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:sel===m.code?'#F1E9E3':'#fff'}}
              onPress={()=>{setCustomForm({...customForm,sasiType:'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ',dipliModel:m.code});onClose();}}>
              <View style={{flex:1,paddingRight:8}}>
                <Text style={{fontSize:13,color:'#000',fontWeight:'700'}}>{m.code}</Text>
                <Text style={{fontSize:11,color:'#666'}}>{m.label}</Text>
              </View>
              {sel===m.code&&<Text style={{color:'#00C851',fontSize:15}}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function StavColumnPickerModal({ visible, onClose, anchor, customForm, setCustomForm, items }) {
  const sel = customForm.stavColumn?.name || '';
  const ordered = [...(items||[])].sort((a,b)=>(a.order??a.createdAt)-(b.order??b.createdAt));
  const W = 280, sw = Dimensions.get('window').width;
  const left = anchor ? Math.max(6, Math.min(anchor.x, sw - W - 6)) : 6;
  const top = anchor ? anchor.y + anchor.h + 2 : 80;
  const choose = (name) => { setCustomForm({...customForm, stavColumn: name ? { name, qty: customForm.stavColumn?.qty || '1' } : null}); onClose(); };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{flex:1}}>
        <View style={{position:'absolute',left,top,width:W,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#5D4037',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
          <Text style={{fontSize:11,fontWeight:'700',color:'#5D4037',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#F1E9E3'}}>ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ — χρώμα</Text>
          <TouchableOpacity style={{paddingVertical:8,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#eee'}} onPress={()=>choose('')}>
            <Text style={{fontSize:12,color:'#888'}}>— Καμία</Text>
          </TouchableOpacity>
          {ordered.map(it=>{
            const PREF = 'ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ ';
            const hasPref = String(it.name||'').startsWith(PREF);
            const base = hasPref ? PREF : '';
            const color = hasPref ? String(it.name).slice(PREF.length) : it.name;
            return (
            <TouchableOpacity key={it.id||it.name}
              style={{paddingVertical:8,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:sel===it.name?'#F1E9E3':'#fff'}}
              onPress={()=>choose(it.name)}>
              <Text style={{fontSize:12,color:'#1a1a1a',flex:1}} numberOfLines={1}>
                <Text style={{fontWeight:'400'}}>{base}</Text>
                <Text style={{fontWeight:'900',color:'#4a148c'}}>{color}</Text>
              </Text>
              {!!String(it.price||'').trim()&&<Text style={{fontSize:11,fontWeight:'700',color:'#5D4037',marginHorizontal:4}}>€{it.price}</Text>}
              {sel===it.name&&<Text style={{color:'#00C851',fontSize:14}}>✓</Text>}
            </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function HardwarePickerModal({ visible, onClose, anchor, customForm, setCustomForm, showCustomHardwareInput, setShowCustomHardwareInput, customHardwareText, setCustomHardwareText }) {
  const W = 240, sw = Dimensions.get('window').width;
  const left = anchor ? Math.max(6, Math.min(anchor.x, sw - W - 6)) : 6;
  const top = anchor ? anchor.y + anchor.h + 2 : 80;
  const confirmCustom = () => { if (customHardwareText.trim()) setCustomForm({...customForm,hardware:customHardwareText.trim()}); setShowCustomHardwareInput(false); onClose(); };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{flex:1}}>
        <View style={{position:'absolute',left,top,width:W,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#8B0000',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
          {['Nickel','Bronze','Nickel Best','Bronze Best','Best Παραγγελία'].map(c=>(
            <TouchableOpacity key={c}
              style={{paddingVertical:8,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:customForm.hardware===c?'#FBEEEE':'#fff'}}
              onPress={()=>{setCustomForm({...customForm,hardware:c});setShowCustomHardwareInput(false);onClose();}}>
              <Text style={{fontSize:13,color:'#1a1a1a'}}>{c}</Text>
              {customForm.hardware===c&&<Text style={{color:'#00C851',fontSize:14}}>✓</Text>}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={{paddingVertical:8,paddingHorizontal:10}} onPress={()=>{setShowCustomHardwareInput(true);setCustomHardwareText('');}}>
            <Text style={{fontSize:13,color:'#888'}}>Άλλο (γράψτε)...</Text>
          </TouchableOpacity>
          {showCustomHardwareInput&&(
            <View style={{padding:8,borderTopWidth:1,borderTopColor:'#eee'}}>
              <TextInput autoFocus style={{backgroundColor:'#f5f5f5',padding:8,borderRadius:6,borderWidth:1,borderColor:'#8B0000',fontSize:13}}
                placeholder="Χρώμα εξαρτημάτων..." value={customHardwareText} onChangeText={setCustomHardwareText} returnKeyType="done" onSubmitEditing={confirmCustom} />
              <TouchableOpacity style={{backgroundColor:'#8B0000',padding:8,borderRadius:6,alignItems:'center',marginTop:6}} onPress={confirmCustom}>
                <Text style={{color:'white',fontWeight:'bold',fontSize:12}}>ΟΚ</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function MiscPickerModal({ visible, onClose, anchor, customForm, setCustomForm, items }) {
  const sel = customForm.misc || [];
  const selSet = new Set(sel);
  const ordered = [...(items||[])].sort((a,b)=>(a.order??a.createdAt)-(b.order??b.createdAt));
  const selFirst = [...ordered.filter(i=>selSet.has(i.name)), ...ordered.filter(i=>!selSet.has(i.name))];
  const W = 320, sw = Dimensions.get('window').width;
  const left = anchor ? Math.max(6, Math.min(anchor.x, sw - W - 6)) : 6;
  const top = anchor ? anchor.y + anchor.h + 2 : 80;
  const toggle = (name) => { const cur = customForm.misc || []; setCustomForm({...customForm, misc: cur.includes(name) ? cur.filter(x=>x!==name) : [...cur, name]}); };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{flex:1}}>
        <View style={{position:'absolute',left,top,width:W,maxHeight:360,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#8B0000',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
          <Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#FBEEEE'}}>ΔΙΑΦΟΡΑ — πολλαπλή επιλογή</Text>
          <ScrollView style={{maxHeight:300}}>
            {selFirst.length===0 && <Text style={{padding:14,color:'#aaa',textAlign:'center',fontSize:12}}>Δεν υπάρχουν είδη. Τσέκαρε «Τυπ» στο μενού ΔΙΑΦΟΡΑ.</Text>}
            {selFirst.map(i=>{
              const on = selSet.has(i.name);
              return (
                <TouchableOpacity key={i.id||i.name}
                  style={{paddingVertical:7,paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:on?'#FFF6D6':'#fff'}}
                  onPress={()=>toggle(i.name)}>
                  <Text style={{fontSize:12,color:on?'#8B0000':'#1a1a1a',fontWeight:on?'700':'500',flex:1}} numberOfLines={2}>{i.name}</Text>
                  {!!String(i.price||'').trim()&&<Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',marginHorizontal:4}}>€{i.price}</Text>}
                  {on&&<Text style={{color:'#00C851',fontSize:14}}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={{margin:8,padding:10,backgroundColor:'#8B0000',borderRadius:8,alignItems:'center'}} onPress={onClose}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:13}}>ΚΑΤΑΧΩΡΗΣΗ</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function LockPickerModal({ visible, onClose, anchor, customForm, setCustomForm, locks, cylinders }) {
  const ordered = (arr) => [...(arr||[])].sort((a,b)=>(a.order??a.createdAt)-(b.order??b.createdAt));
  const W = 360, sw = Dimensions.get('window').width;
  const left = anchor ? Math.max(6, Math.min(anchor.x, sw - W - 6)) : 6;
  const top = anchor ? anchor.y + anchor.h + 2 : 80;
  const row = (sel, label, onPress, key, price) => (
    <TouchableOpacity key={key}
      style={{paddingVertical:7,paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:sel?'#FBEEEE':'#fff'}}
      onPress={onPress}>
      <Text style={{fontSize:12,color:sel?'#8B0000':'#1a1a1a',fontWeight:sel?'700':'500',flex:1}} numberOfLines={2}>{label}</Text>
      {!!String(price||'').trim()&&<Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',marginHorizontal:4}}>€{price}</Text>}
      {sel&&<Text style={{color:'#00C851',fontSize:14}}>✓</Text>}
    </TouchableOpacity>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{flex:1}}>
        <View style={{position:'absolute',left,top,width:W,maxHeight:320,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#8B0000',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden',flexDirection:'row'}}>
          <View style={{flex:2,borderRightWidth:1,borderRightColor:'#eee'}}>
            <Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#FBEEEE'}}>ΚΛΕΙΔΑΡΙΕΣ</Text>
            <ScrollView style={{maxHeight:288}}>
              {row(!customForm.lock,'— Χωρίς',()=>setCustomForm({...customForm,lock:''}),'no-lock')}
              {ordered(locks).map(l=>row(customForm.lock===l.name,l.name,()=>setCustomForm({...customForm,lock:l.name}),l.id,l.price))}
            </ScrollView>
          </View>
          <View style={{flex:1}}>
            <Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#FBEEEE'}}>ΑΦΑΛΟΙ</Text>
            <ScrollView style={{maxHeight:288}}>
              {row(!customForm.cylinder,'— Χωρίς',()=>setCustomForm({...customForm,cylinder:''}),'no-cyl')}
              {ordered(cylinders).map(c=>row(customForm.cylinder===c.name,c.name,()=>setCustomForm({...customForm,cylinder:c.name}),c.id,c.price))}
            </ScrollView>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function CoatingsPickerModal({ visible, onClose, anchor, customForm, setCustomForm, coatings }) {
  const W = 340, sw = Dimensions.get('window').width;
  const left = anchor ? Math.max(6, Math.min(anchor.x, sw - W - 6)) : 6;
  const top = anchor ? anchor.y + anchor.h + 2 : 80;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{flex:1}}>
        <View style={{position:'absolute',left,top,width:W,maxHeight:380,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#007AFF',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
          <Text style={{fontSize:11,fontWeight:'700',color:'#007AFF',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#E8F4FD'}}>ΕΠΕΝΔΥΣΗ ΠΟΡΤΑΣ</Text>
          <ScrollView style={{maxHeight:300}}>
            {coatings.length===0 && (
              <Text style={{padding:14,color:'#aaa',textAlign:'center',fontSize:12}}>Δεν υπάρχουν επενδύσεις. Προσθέστε από το μενού ☰.</Text>
            )}
            {sortCoatingsGrouped(coatings).map(c=>{
              const selected = (customForm.coatings||[]).includes(c.name);
              const n = c.name?.toLowerCase()||'';
              const bg = n.includes('μέσα')||n.includes('μεσα') ? '#E8F4FD' : n.includes('έξω')||n.includes('εξω') ? '#FFF3E0' : '#fff';
              return (
                <TouchableOpacity key={c.id}
                  style={{paddingVertical:8,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between', backgroundColor: bg}}
                  onPress={()=>{
                    const current = customForm.coatings||[];
                    const updated = selected ? current.filter(x=>x!==c.name) : [...current,c.name];
                    setCustomForm({...customForm,coatings:updated});
                    if (!selected && updated.length >= 2) {
                      setTimeout(()=>onClose(), 150);
                    }
                  }}>
                  <Text style={{fontSize:13,color:'#000',flex:1}}>{c.name}</Text>
                  {selected && <Text style={{color:'#007AFF',fontSize:16,fontWeight:'bold'}}>✓</Text>}
                </TouchableOpacity>
              );
            })}
            {(customForm.coatings||[]).length>0&&(
              <TouchableOpacity
                style={{margin:8,padding:9,backgroundColor:'#ff4444',borderRadius:8,alignItems:'center'}}
                onPress={()=>setCustomForm({...customForm,coatings:[]})}>
                <Text style={{color:'white',fontWeight:'bold',fontSize:12}}>ΕΚΚΑΘΑΡΙΣΗ ΕΠΙΛΟΓΩΝ</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          <TouchableOpacity
            style={{margin:8,padding:10,backgroundColor:'#007AFF',borderRadius:8,alignItems:'center'}}
            onPress={onClose}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:13}}>ΟΛΟΚΛΗΡΩΣΗ</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
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
