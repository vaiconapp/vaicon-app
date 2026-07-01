/**
 * Κοινή λογική με CustomScreen.saveOrder για buildTasks σε τυποποιημένη μονή.
 * Χρησιμοποιείται για μετάβαση παλιών MONI_PROD → STD_BUILD και για επιστροφή από Έτοιμα.
 */
export function buildTasksForMoniStdOrder(o) {
  const isDipli = o.sasiType === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ';
  const isMoni = o.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !o.sasiType;
  const hasLock = !!o.lock;
  const isMoniWithLock = isMoni && hasLock;
  const hasStaveraForm = !!(o.stavera && o.stavera.some((s) => s.dim));
  const hasMontageForm = o.installation === 'ΝΑΙ';
  const hasHeightReductionForm = !!o.heightReduction;
  const hasKypri = o.kypri === 'ΝΑΙ';
  const coats = (o.coatings || []).filter((c) => c && String(c).trim());
  const hasCoatings = coats.length > 0;
  const isOversize = isMoni && (String(o.h) === '223' || String(o.w) === '83');
  const needsBuild =
    isDipli ||
    isMoniWithLock ||
    hasKypri ||
    (isMoni && (hasStaveraForm || hasMontageForm || hasHeightReductionForm || isOversize || hasCoatings));
  if (!needsBuild) return null;
  const sasiNeedsProduction = isMoni && (isMoniWithLock || hasHeightReductionForm);
  const tasks = {
    ...(hasStaveraForm ? { stavera: false } : {}),
    ...(hasLock ? { lock: false } : {}),
    ...(hasHeightReductionForm ? { heightReduction: false } : {}),
    ...(hasKypri ? { kypri: false, case: false } : {}),
    ...(hasMontageForm ? { montage: false } : {}),
    ...(isOversize ? { oversize: false } : (sasiNeedsProduction || isDipli ? { sasi: false } : {})),
    ...Object.fromEntries(coats.map((_, i) => [`epend${i}`, false])),
  };
  if (Object.keys(tasks).length === 0) return { sasi: false };
  return tasks;
}

/**
 * Μετατροπή legacy MONI_PROD (μονή τυποποιημένη) → STD_BUILD + buildTasks.
 */
export function migrateMoniProdOrderToStdBuild(o) {
  const { moniPhases: _m, moniGivenToProd: _g, ...rest } = o;
  const buildTasks =
    o.buildTasks && Object.keys(o.buildTasks).length > 0
      ? o.buildTasks
      : buildTasksForMoniStdOrder(o) || { sasi: false };
  return {
    ...rest,
    status: 'STD_BUILD',
    buildTasks,
    moniGivenToProd: false,
  };
}

/**
 * Παλιές τυποποιημένες με επενδύσεις που έμειναν στις «παραγγελίες» → «προς κατασκευή».
 * (α) STD_PENDING με επενδύσεις (όχι σε μοντάρισμα) → STD_BUILD με πλήρη buildTasks.
 * (β) STD_BUILD που του λείπουν τα στάδια επένδυσης → προσθήκη epend{i}, κρατώντας τα υπόλοιπα.
 * Επιστρέφει νέο order αν χρειάστηκε αλλαγή, αλλιώς null.
 */
export function migrateCoatingsToStdBuild(o) {
  if (o.orderType !== 'ΤΥΠΟΠΟΙΗΜΕΝΗ') return null;
  const coats = (o.coatings || []).filter((c) => c && String(c).trim());
  if (coats.length === 0) return null;
  const isPending = !o.status || o.status === 'STD_PENDING' || o.status === 'PENDING';
  if (isPending && !o.stdInProd) {
    const tasks = buildTasksForMoniStdOrder(o);
    if (!tasks) return null;
    return { ...o, status: 'STD_BUILD', buildTasks: tasks };
  }
  if (o.status === 'STD_BUILD') {
    const tasks = { ...(o.buildTasks || {}) };
    let changed = false;
    coats.forEach((_, i) => { if (!(`epend${i}` in tasks)) { tasks[`epend${i}`] = false; changed = true; } });
    if (!changed) return null;
    return { ...o, buildTasks: tasks };
  }
  return null;
}

/**
 * Παλιές 223/83 (μονή) που κρατούν ακόμη «sasi» (ή τίποτα) → μετατροπή σε «oversize»,
 * ώστε να μπαίνουν στο «223/83» και να φεύγουν από το «Σασί». Κρατά την πρόοδο (done state).
 * Επιστρέφει νέο order αν χρειάστηκε αλλαγή, αλλιώς null.
 */
export function remapOversizeStdBuild(o) {
  if (o.orderType !== 'ΤΥΠΟΠΟΙΗΜΕΝΗ' || o.status !== 'STD_BUILD' || !o.buildTasks) return null;
  const isMoni = o.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !o.sasiType;
  const isOversize = isMoni && (String(o.h) === '223' || String(o.w) === '83');
  if (!isOversize || 'oversize' in o.buildTasks) return null;
  const tasks = { ...o.buildTasks };
  tasks.oversize = 'sasi' in tasks ? tasks.sasi : false;
  delete tasks.sasi;
  return { ...o, buildTasks: tasks };
}

/**
 * @param {{ id: string }[]} loadedStd — raw από Firebase
 * @returns {{ mapped: object[], migrated: object[] }}
 */
export function normalizeLoadedStdOrders(loadedStd) {
  const migrated = [];
  const mapped = loadedStd.map((o) => {
    let cur = o;
    if (cur.status === 'MONI_PROD' && cur.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ' && (!cur.sasiType || cur.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ')) {
      cur = migrateMoniProdOrderToStdBuild(cur);
    }
    cur = migrateCoatingsToStdBuild(cur) || cur;
    cur = remapOversizeStdBuild(cur) || cur;
    if (cur !== o) migrated.push(cur);
    return cur;
  });
  return { mapped, migrated };
}
