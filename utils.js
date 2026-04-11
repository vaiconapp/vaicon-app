// Μετατρέπει deliveryDate (DD/MM/YYYY string ή timestamp) σε Date object
export const parseDateStr = (d) => {
  if (!d) return null;
  if (typeof d === 'number') return new Date(d);
  const parts = String(d).split('/');
  if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  return new Date(d);
};

export const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

export const fmtDateTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
