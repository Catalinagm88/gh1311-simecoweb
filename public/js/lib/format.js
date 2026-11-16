// Formato de números en español (México).
const cache = new Map();
function nf(min, max) {
  const key = `${min}-${max}`;
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat('es-MX', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return cache.get(key);
}
export const num = (x, d = 2) => (Number.isFinite(x) ? nf(d, d).format(x) : '—');
export const int = (x) => (Number.isFinite(x) ? nf(0, 0).format(Math.round(x)) : '—');
export const money = (x, d = 2) => (Number.isFinite(x) ? (x < 0 ? '−$' : '$') + nf(d, d).format(Math.abs(x)) : '—');
export const pct = (x, d = 2) => (Number.isFinite(x) ? `${nf(d, d).format(x * 100)} %` : '—');
export const signedPct = (x, d = 1) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${nf(d, d).format(Math.abs(x) * 100)} %` : '—');
/** Horas → «hh:mm h». */
export const clock = (h) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} h`;
};
