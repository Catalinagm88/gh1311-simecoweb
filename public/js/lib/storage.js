// Persistencia en localStorage, tolerante a errores (modo privado, almacenamiento bloqueado).
const PREFIX = 'simulacionecoweb:';

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

export const getScenarios = () => read('scenarios', []);
export function saveScenario(s) {
  const list = getScenarios();
  list.unshift({ id: Date.now().toString(36), ...s });
  return write('scenarios', list.slice(0, 50)) ? list : null;
}
export function deleteScenario(id) {
  const list = getScenarios().filter((s) => s.id !== id);
  write('scenarios', list);
  return list;
}
export const getLast = (slug) => read(`last:${slug}`, null);
export const setLast = (slug, query) => write(`last:${slug}`, query);
export const getPref = (k, fallback) => read(`pref:${k}`, fallback);
export const setPref = (k, v) => write(`pref:${k}`, v);
