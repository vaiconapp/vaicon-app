import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { firebaseAppConfig, FIREBASE_URL } from './firebaseConfig';
import { normalizeLoadedStdOrders } from './stdOrderMigration';

async function persistMigratedMoniProdStdOrders(migrated) {
  for (const o of migrated) {
    try {
      await fetch(`${FIREBASE_URL}/std_orders/${o.id}.json`, { method: 'PUT', body: JSON.stringify(o) });
    } catch (e) {
      console.error('persistMigratedMoniProdStdOrders', o?.id, e);
    }
  }
}

/**
 * Κοινή λογική: raw Firebase JSON → state (ίδια με το REST fetchData).
 */
export function applyFetchedBundle(setters, bundle) {
  const {
    dataStd, data2, data3, data4, data5, data6, data7, dataSasiStock, dataCaseStock,
  } = bundle;
  const {
    setCustomOrders, setSoldOrders, setSasiOrders, setSoldSasiOrders,
    setCaseOrders, setSoldCaseOrders, setCustomers, setCoatings,
    setDipliSasiStock, setLocks, setSasiStock, setCaseStock,
  } = setters;

  if (dataStd) {
    const loadedStd = Object.keys(dataStd).map(key => ({ id: key, ...dataStd[key] }));
    const { mapped, migrated } = normalizeLoadedStdOrders(loadedStd);
    setCustomOrders(mapped.filter(o => o.status !== 'SOLD' && o.status !== 'STD_SOLD'));
    setSoldOrders(mapped.filter(o => o.status === 'SOLD' || o.status === 'STD_SOLD'));
    if (migrated.length) void persistMigratedMoniProdStdOrders(migrated);
  } else {
    setCustomOrders([]);
    setSoldOrders([]);
  }
  if (data2) {
    const loaded2 = Object.keys(data2).map(key => ({ id: key, ...data2[key] }));
    setSasiOrders(loaded2.filter(o => o.status !== 'SOLD'));
    setSoldSasiOrders(loaded2.filter(o => o.status === 'SOLD'));
  } else {
    setSasiOrders([]);
    setSoldSasiOrders([]);
  }
  if (data3) {
    const loaded3 = Object.keys(data3).map(key => ({ id: key, ...data3[key] }));
    setCaseOrders(loaded3.filter(o => o.status !== 'SOLD'));
    setSoldCaseOrders(loaded3.filter(o => o.status === 'SOLD'));
  } else {
    setCaseOrders([]);
    setSoldCaseOrders([]);
  }
  if (data4) {
    setCustomers(Object.keys(data4).map(key => ({ id: key, ...data4[key] })));
  } else {
    setCustomers([]);
  }
  if (data5) {
    setCoatings(Object.keys(data5).map(key => ({ id: key, ...data5[key] })));
  } else {
    setCoatings([]);
  }
  if (data6) {
    setDipliSasiStock(Object.keys(data6).map(key => ({ id: key, ...data6[key] })));
  } else {
    setDipliSasiStock([]);
  }
  if (data7) {
    setLocks(Object.keys(data7).map(key => ({ id: key, ...data7[key] })));
  } else {
    setLocks([]);
  }
  if (dataSasiStock) setSasiStock(dataSasiStock);
  else setSasiStock({});
  if (dataCaseStock) setCaseStock(dataCaseStock);
  else setCaseStock({});
}

/**
 * Live sync: αλλαγές στη Firebase εμφανίζονται αμέσως σε όλα τα PC (WebSocket μέσω SDK).
 */
export function subscribeFirebaseRealtime(setters) {
  const app = getApps().length === 0 ? initializeApp(firebaseAppConfig) : getApp();
  const db = getDatabase(app);
  const { setLoading, setActivityRefreshKey, ...S } = setters;
  const unsubs = [];

  let readyCount = 0;
  const onFirstSnapshot = () => {
    readyCount++;
    if (readyCount >= 9) setLoading(false);
  };

  const mk = (path, apply) => {
    let first = true;
    unsubs.push(onValue(ref(db, path), snap => {
      apply(snap.val());
      if (first) {
        first = false;
        onFirstSnapshot();
      }
    }));
  };

  mk('std_orders', data => {
    if (!data) { S.setCustomOrders([]); S.setSoldOrders([]); return; }
    const loadedStd = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    const { mapped, migrated } = normalizeLoadedStdOrders(loadedStd);
    S.setCustomOrders(mapped.filter(o => o.status !== 'SOLD' && o.status !== 'STD_SOLD'));
    S.setSoldOrders(mapped.filter(o => o.status === 'SOLD' || o.status === 'STD_SOLD'));
    if (migrated.length) void persistMigratedMoniProdStdOrders(migrated);
  });
  mk('sasi_orders', data => {
    if (!data) { S.setSasiOrders([]); S.setSoldSasiOrders([]); return; }
    const loaded = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    S.setSasiOrders(loaded.filter(o => o.status !== 'SOLD'));
    S.setSoldSasiOrders(loaded.filter(o => o.status === 'SOLD'));
  });
  mk('case_orders', data => {
    if (!data) { S.setCaseOrders([]); S.setSoldCaseOrders([]); return; }
    const loaded = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    S.setCaseOrders(loaded.filter(o => o.status !== 'SOLD'));
    S.setSoldCaseOrders(loaded.filter(o => o.status === 'SOLD'));
  });
  mk('customers', data => {
    S.setCustomers(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
  });
  mk('coatings', data => {
    S.setCoatings(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
  });
  mk('dipli_sasi_stock', data => {
    S.setDipliSasiStock(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
  });
  mk('locks', data => {
    S.setLocks(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
  });
  mk('sasi_stock', v => S.setSasiStock(v || {}));
  mk('case_stock', v => S.setCaseStock(v || {}));

  unsubs.push(onValue(ref(db, 'activity_log'), () => {
    setActivityRefreshKey(k => k + 1);
  }));

  return () => unsubs.forEach(u => u());
}
