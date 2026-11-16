// Efecto látigo en una cadena de 4 eslabones con promedio móvil y nivel objetivo. Módulo puro.
import { defaultsOf } from '../lib/params.js';
import { mulberry32, normal } from '../lib/prng.js';
import { mean, std, variance } from '../lib/stats.js';

export const meta = { slug: 'bullwhip', title: 'Efecto látigo (bullwhip effect)' };
export const ECHELONS = ['Minorista', 'Mayorista', 'Distribuidor', 'Fábrica'];
const Z = 1.645;

export const schema = {
  mu: { min: 10, max: 500, step: 10, default: 100, unit: 'u/sem', label: 'Demanda media del cliente (μ)' },
  sd: { min: 0, max: 100, step: 1, default: 10, unit: 'u', label: 'Variabilidad del cliente (σ)' },
  L: { min: 1, max: 6, step: 1, default: 2, unit: 'sem', label: 'Tiempo de entrega por eslabón (L)' },
  p: { min: 1, max: 12, step: 1, default: 4, unit: 'sem', label: 'Ventana de pronóstico (p)' },
  sem: { min: 20, max: 104, step: 1, default: 52, unit: 'sem', label: 'Horizonte' },
  info: { type: 'bool', default: false, label: 'Compartir demanda del cliente' },
};
export const defaults = defaultsOf(schema);

/** Cota inferior de amplificación acumulada hasta el eslabón k (0 = minorista). */
export const bound = (L, p, k = 0) => (1 + (2 * L) / p + (2 * L * L) / (p * p)) ** (k + 1);

export function simulate(params, seed = 42) {
  const P = { ...defaults, ...params };
  const rng = mulberry32(seed);
  const n = P.sem;
  const demand = [];
  for (let t = 0; t < n; t++) demand.push(Math.max(0, Math.round(normal(rng, P.mu, P.sd))));

  const orders = [];
  let incoming = demand; // pedidos que recibe el eslabón k
  for (let k = 0; k < 4; k++) {
    const observed = P.info ? demand : incoming;
    const q = [];
    let Sprev = P.L * P.mu;
    for (let t = 0; t < n; t++) {
      if (t < P.p) { q.push(P.mu); continue; }
      const win = observed.slice(t - P.p + 1, t + 1);
      const Dhat = mean(win);
      const sig = P.p > 1 ? std(win) : 0;
      const S = P.L * Dhat + Z * sig * Math.sqrt(P.L);
      q.push(Math.max(0, S - Sprev + incoming[t]));
      Sprev = S;
    }
    orders.push(q);
    incoming = q;
  }

  const from = Math.min(P.p, n - 2);
  const varD = variance(demand.slice(from));
  const ratio = orders.map((q) => (varD > 0 ? variance(q.slice(from)) / varD : 1));
  const table = [
    { name: 'Cliente', mean: mean(demand.slice(from)), sd: std(demand.slice(from)), ratio: 1, bound: null },
    ...orders.map((q, k) => ({ name: ECHELONS[k], mean: mean(q.slice(from)), sd: std(q.slice(from)), ratio: ratio[k], bound: bound(P.L, P.p, k) })),
  ];
  return { demand, orders, ratio, table, warmup: from, boundStage: bound(P.L, P.p, 0) };
}
