import re

with open("CustomScreen.js", "r") as f:
    text = f.read()

# Current logic in removeStockReservation relies on capturing sasiStock and caseStock from outer scope:
# if (isMoni && sasiStock[sk]) {
#   const updEntry = {...sasiStock[sk], reservations: (sasiStock[sk].reservations||[]).filter(r=>r.orderNo!==orderNo)};
#   setSasiStock(prev=>({...prev, [sk]: updEntry}));
#   await fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`,{method:'PUT',body:JSON.stringify(updEntry)});
# }
# Since `removeStockReservation` is created on every render, it usually has the latest `sasiStock`.
# However, to be fully safe from race conditions, especially when called inside an async callback that might have captured a stale closure,
# we should fetch the latest stock from `prev` in the setState function or just fetch it from Firebase if it's truly critical.
# Given React's state updates, doing:
# setSasiStock(prev => {
#    const current = prev[sk] || sasiStock[sk];
#    const updEntry = {...current, reservations: ...};
#    fetch(... updEntry);
#    return {...prev, [sk]: updEntry};
# });
# is much safer. Let's rewrite `removeStockReservation`.

new_func = """const removeStockReservation = async (orderNo, h, w, side, caseType, isMoni) => {
    if (!setSasiStock || !setCaseStock) return;
    const sk = sasiKey(String(h), String(w), side);
    const ck = caseKey(String(h), String(w), side, caseType);

    if (isMoni) {
      setSasiStock(prev => {
        if (!prev[sk]) return prev;
        const updEntry = { ...prev[sk], reservations: (prev[sk].reservations || []).filter(r => r.orderNo !== orderNo) };
        fetch(`${FIREBASE_URL}/sasi_stock/${sk}.json`, { method: 'PUT', body: JSON.stringify(updEntry) }).catch(console.error);
        return { ...prev, [sk]: updEntry };
      });
    }

    setCaseStock(prev => {
      if (!prev[ck]) return prev;
      const updEntry = { ...prev[ck], reservations: (prev[ck].reservations || []).filter(r => r.orderNo !== orderNo) };
      fetch(`${FIREBASE_URL}/case_stock/${ck}.json`, { method: 'PUT', body: JSON.stringify(updEntry) }).catch(console.error);
      return { ...prev, [ck]: updEntry };
    });
  };"""

# Replace the old function
text = re.sub(r'const removeStockReservation = async \(orderNo, h, w, side, caseType, isMoni\) => \{.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?  \};', new_func, text, flags=re.DOTALL)

with open("CustomScreen.js", "w") as f:
    f.write(text)

print("Fixed UI state update for removeStockReservation")
