// Punto de reorden con demanda diaria aleatoria (revisión continua, venta perdida). Módulo puro.
import { defaultsOf } from '../lib/params.js';
import { mulberry32, normal } from '../lib/prng.js';
import { zFromServiceLevel, mean } from '../lib/stats.js';

export const meta = { slug: 'punto-reorden', title: 'Punto de reorden con demanda variable' };

export const schema = {
  d: { min: 1, max: 200, step: 1, default: 20, unit: 'u/día', label: 'Demanda diaria promedio' },
  sd: { min: 0, max: 50, step: 0.5, default: 5, unit: 'u', label: 'Variabilidad diaria (σ)' },
  L: { min: 1, max: 30, step: 1, default: 7, unit: 'días', label: 'Tiempo de entrega (L)' },
  ns: { min: 50, max: 99.9, step: 0.1, default: 95, unit: '%', label: 'Nivel de servicio' },
  Q: { min: 10, max: 2000, step: 10, default: 400, unit: 'u', label: 'Tamaño de pedido (Q)' },
  dias: { min: 30, max: 365, step: 5, default: 120, unit: 'días', label: 'Horizonte' },
};
export const defaults = defaultsOf(schema);

/** Genera la serie de demanda diaria (enteros ≥ 0) con la semilla. */
export function demandSeries(d, sd, days, seed) {
  const rng = mulberry32(seed);
  const out = [];
  for (let t = 0; t < days; t++) out.push(Math.max(0, Math.round(normal(rng, d, sd))));
  return out;
}

export function theory(p) {
  const z = zFromServiceLevel(p.ns / 100);
  const SS = z * p.sd * Math.sqrt(p.L);
  return { z, SS, ROP: p.d * p.L + SS };
}

/**
 * Motor de inventario día a día, compartido con la simulación de revisión.
 * policy: { type: 'sQ', s, Q } o { type: 'RS', R, S }.
 * Orden de cada día t (1..n): 1) llegan pedidos con llegada = t; 2) demanda; 3) venta (lo no
 * surtido se pierde); 4) decisión de pedido según la posición de inventario (a mano + tránsito).
 */
export function runInventory({ demand, L, initial, policy }) {
  let I = initial;
  const pipeline = []; // { qty, arrival, ordered }
  const inventory = [I];
  const orders = [];
  let sold = 0, lost = 0;
  const stockoutDays = [];
  for (let t = 1; t <= demand.length; t++) {
    for (let k = pipeline.length - 1; k >= 0; k--) {
      if (pipeline[k].arrival === t) { I += pipeline[k].qty; pipeline.splice(k, 1); }
    }
    const D = demand[t - 1];
    const s = Math.min(I, D);
    I -= s; sold += s;
    if (D > s) { lost += D - s; stockoutDays.push(t); }
    const IP = I + pipeline.reduce((a, o) => a + o.qty, 0);
    let qty = 0;
    if (policy.type === 'sQ' && IP <= policy.s) qty = policy.Q;
    if (policy.type === 'RS' && t % policy.R === 0) qty = Math.max(0, Math.round(policy.S - IP));
    if (qty > 0) {
      const o = { day: t, arrival: t + L, qty };
      pipeline.push(o);
      orders.push(o);
    }
    inventory.push(I);
  }
  const demanded = sold + lost;
  return {
    inventory, orders, stockoutDays, sold, lost,
    fillRate: demanded ? sold / demanded : 1,
    avgInventory: mean(inventory),
  };
}

export function simulate(params, seed = 42) {
  const p = { ...defaults, ...params };
  const th = theory(p);
  const demand = demandSeries(p.d, p.sd, p.dias, seed);
  const res = runInventory({ demand, L: p.L, initial: Math.round(th.ROP + p.Q), policy: { type: 'sQ', s: th.ROP, Q: p.Q } });
  // Detalle por ciclo: demanda durante la entrega, mínimo y faltante hasta la llegada.
  const cycles = res.orders.filter((o) => o.arrival <= p.dias).map((o, i) => {
    const window = demand.slice(o.day, o.arrival); // días o.day+1 .. o.arrival
    const invWindow = res.inventory.slice(o.day, o.arrival); // inventario al cierre de esos días previos a la llegada
    const shortage = res.stockoutDays.filter((d) => d > o.day && d <= o.arrival).length;
    return {
      n: i + 1, day: o.day, arrival: o.arrival,
      leadDemand: window.reduce((a, b) => a + b, 0),
      min: Math.min(...invWindow),
      shortDays: shortage,
    };
  });
  return {
    ...th,
    demand,
    series: { inventory: res.inventory, demand },
    orders: res.orders,
    stockoutDays: res.stockoutDays,
    cycles,
    summary: {
      SS: th.SS, ROP: th.ROP,
      cycles: cycles.length,
      stockoutCycles: cycles.filter((c) => c.shortDays > 0).length,
      lost: res.lost,
      fillRate: res.fillRate,
      avgInventory: res.avgInventory,
    },
  };
}
