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
  const isOversize = isMoni && (String(o.h) === '223' || String(o.w) === '83');
  const noOtherTask = !hasStaveraForm && !isMoniWithLock && !hasHeightReductionForm && !hasMontageForm && !hasKypri;
  const needsBuild =
    isDipli ||
    isMoniWithLock ||
    hasKypri ||
    (isMoni && (hasStaveraForm || hasMontageForm || hasHeightReductionForm || isOversize));
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
 * @param {{ id: string }[]} loadedStd — raw από Firebase
 * @returns {{ mapped: object[], migrated: object[] }}
 */
export function normalizeLoadedStdOrders(loadedStd) {
  const migrated = [];
  const mapped = loadedStd.map((o) => {
    if (o.status !== 'MONI_PROD') return o;
    if (o.orderType !== 'ΤΥΠΟΠΟΙΗΜΕΝΗ') return o;
    const isMoni = !o.sasiType || o.sasiType === 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ';
    if (!isMoni) return o;
    const m = migrateMoniProdOrderToStdBuild(o);
    migrated.push(m);
    return m;
  });
  return { mapped, migrated };
}
