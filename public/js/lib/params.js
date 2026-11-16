// Lectura, validación y serialización de parámetros (puro: no usa window).
// Esquema: { nombre: { min, max, step, default, unit, label, type?: 'number'|'enum'|'bool', options? } }

export function defaultsOf(schema) {
  return Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, v.default]));
}

/** Ajusta un valor al esquema: recorta al rango y redondea al paso. */
export function coerce(def, raw) {
  const type = def.type || 'number';
  if (raw === undefined || raw === null || raw === '') return def.default;
  if (type === 'bool') {
    if (typeof raw === 'boolean') return raw;
    return raw === '1' || raw === 'true' || raw === 1;
  }
  if (type === 'enum') {
    const match = def.options.find((o) => String(o) === String(raw));
    return match === undefined ? def.default : match;
  }
  if (type === 'list') {
    const arr = Array.isArray(raw) ? raw : String(raw).split(',');
    const nums = arr.map(Number).filter(Number.isFinite);
    if (nums.length < (def.minLength || 1)) return def.default.slice();
    return nums.slice(0, def.maxLength || nums.length).map((n) => clampStep(n, def));
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return def.default;
  return clampStep(n, def);
}

function clampStep(n, def) {
  let v = Math.min(def.max, Math.max(def.min, n));
  if (def.step) {
    const base = def.min;
    v = base + Math.round((v - base) / def.step) * def.step;
    const decimals = (String(def.step).split('.')[1] || '').length;
    v = Number(v.toFixed(decimals));
    v = Math.min(def.max, Math.max(def.min, v));
  }
  return v;
}

/** Valida un objeto de parámetros completo contra el esquema. */
export function validate(schema, params = {}) {
  const out = {};
  for (const [k, def] of Object.entries(schema)) out[k] = coerce(def, params[k]);
  return out;
}

/** Interpreta un query string (sin '?') y devuelve { params, adjusted[] }. */
export function parseQuery(schema, query = '') {
  const sp = new URLSearchParams(query);
  const params = {};
  const adjusted = [];
  for (const [k, def] of Object.entries(schema)) {
    if (!sp.has(k)) { params[k] = def.default; continue; }
    const raw = sp.get(k);
    const v = coerce(def, raw);
    params[k] = v;
    if ((def.type || 'number') === 'number' && Number(raw) !== v) adjusted.push({ key: k, label: def.label || k, from: raw, to: v });
  }
  return { params, adjusted, seed: sp.has('seed') ? sp.get('seed') : null };
}

/** Serializa parámetros (y semilla opcional) a query string. */
export function toQuery(schema, params, seed) {
  const sp = new URLSearchParams();
  for (const k of Object.keys(schema)) {
    const v = params[k];
    if (v === undefined) continue;
    if (typeof v === 'boolean') sp.set(k, v ? '1' : '0');
    else if (Array.isArray(v)) sp.set(k, v.join(','));
    else sp.set(k, String(v));
  }
  if (seed !== undefined && seed !== null) sp.set('seed', String(seed));
  return sp.toString();
}

/** Divide un hash '#/eoq?D=1' en { slug, query }. */
export function parseHash(hash = '') {
  const h = hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const slug = path.replace(/\/+$/, '');
  return { slug, query };
}
