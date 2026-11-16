// Revisión continua (s, Q) vs. periódica (R, S) con la misma demanda aleatoria. Módulo puro.
import { defaultsOf } from '../lib/params.js';
import { zFromServiceLevel } from '../lib/stats.js';
import { demandSeries, runInventory } from './punto-reorden.js';

export const meta = { slug: 'revision', title: 'Sistemas de revisión: continua vs. periódica' };

export const schema = {
  d: { min: 1, max: 200, step: 1, default: 20, unit: 'u/día', label: 'Demanda diaria promedio' },
  sd: { min: 0, max: 50, step: 0.5, default: 5, unit: 'u', label: 'Variabilidad diaria (σ)' },
  L: { min: 1, max: 30, step: 1, default: 7, unit: 'días', label: 'Tiempo de entrega (L)' },
  ns: { min: 50, max: 99.9, step: 0.1, default: 95, unit: '%', label: 'Nivel de servicio' },
  Q: { min: 10, max: 2000, step: 10, default: 400, unit: 'u', label: 'Cantidad fija por pedido (Q)' },
  R: { min: 1, max: 60, step: 1, default: 20, unit: 'días', label: 'Periodo de revisión (R)' },
  dias: { min: 30, max: 365, step: 5, default: 120, unit: 'días', label: 'Horizonte' },
};
export const defaults = defaultsOf(schema);

export function theory(p) {
  const z = zFromServiceLevel(p.ns / 100);
  const ssC = z * p.sd * Math.sqrt(p.L);
  const ssP = z * p.sd * Math.sqrt(p.R + p.L);
  return { z, ssC, ssP, s: p.d * p.L + ssC, S: p.d * (p.R + p.L) + ssP };
}

function summarize(res, ss, reviews) {
  const sizes = res.orders.map((o) => o.qty);
  return {
    SS: ss,
    avgInventory: res.avgInventory,
    orders: res.orders.length,
    minOrder: sizes.length ? Math.min(...sizes) : 0,
    maxOrder: sizes.length ? Math.max(...sizes) : 0,
    lost: res.lost,
    fillRate: res.fillRate,
    reviews,
  };
}

export function simulate(params, seed = 42) {
  const p = { ...defaults, ...params };
  const th = theory(p);
  const demand = demandSeries(p.d, p.sd, p.dias, seed);
  const cont = runInventory({ demand, L: p.L, initial: Math.round(th.s + p.Q), policy: { type: 'sQ', s: th.s, Q: p.Q } });
  const per = runInventory({ demand, L: p.L, initial: Math.round(th.S), policy: { type: 'RS', R: p.R, S: th.S } });
  const reviewDays = [];
  for (let t = p.R; t <= p.dias; t += p.R) reviewDays.push(t);
  return {
    ...th,
    demand,
    continuous: { ...cont, demand, summary: summarize(cont, th.ssC, p.dias) },
    periodic: { ...per, demand, reviewDays, summary: summarize(per, th.ssP, reviewDays.length) },
  };
}
