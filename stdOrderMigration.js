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
  const noOtherTask = !hasStaveraForm && !isMoniWithLock && !hasHeightReductionForm && !hasMontageForm && !hasKypri;
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
    ...(sasiNeedsProduction || isDipli ? { sasi: false } : {}),
    ...(isOversize && noOtherTask ? { oversize: false } : {}),
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
 * @param {{ id: string }[]} loadedStd — raw από Firebase
 * @returns {{ mapped: object[], migrated: object[] }}
 */
export function normalizeLoadedStdOrders(loadedStd) {
  const migrated = [];
  const mapped = loadedStd.map((o) => {
    if (o.status === 'MONI_PROD' && o.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ' && (!o.sasiType || o.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ')) {
      const m = migrateMoniProdOrderToStdBuild(o);
      migrated.push(m);
      return m;
    }
    const m2 = migrateCoatingsToStdBuild(o);
    if (m2) { migrated.push(m2); return m2; }
    return o;
  });
  return { mapped, migrated };
}
