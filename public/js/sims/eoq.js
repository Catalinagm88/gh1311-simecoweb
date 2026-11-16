// Cantidad económica de pedido (modelo clásico de Harris-Wilson). Módulo puro.
import { defaultsOf } from '../lib/params.js';

export const meta = { slug: 'eoq', title: 'Cantidad económica de pedido (EOQ)' };

export const schema = {
  D: { min: 100, max: 20000, step: 100, default: 1200, unit: 'u/año', label: 'Demanda anual (D)' },
  S: { min: 1, max: 500, step: 1, default: 50, unit: '$/pedido', label: 'Costo por pedido (S)' },
  H: { min: 0.1, max: 50, step: 0.1, default: 2, unit: '$/u·año', label: 'Costo de mantener (H)' },
  L: { min: 0, max: 60, step: 1, default: 5, unit: 'días', label: 'Tiempo de entrega (L)' },
  Q: { min: 10, max: 2000, step: 10, default: 400, unit: 'u', label: 'Lote actual (Q)' },
  dias: { min: 250, max: 365, step: 1, default: 365, unit: 'días', label: 'Días por año' },
};
export const defaults = defaultsOf(schema);

export const eoq = (D, S, H) => Math.sqrt((2 * D * S) / H);
export const totalCost = (D, S, H, Q) => (D * S) / Q + (H * Q) / 2;

export function compute(params) {
  const p = { ...defaults, ...params };
  const Qs = eoq(p.D, p.S, p.H);
  const N = p.D / Qs;
  const T = p.dias / N;
  const TC = totalCost(p.D, p.S, p.H, Qs);
  const daily = p.D / p.dias;
  const ROP = daily * p.L;
  const current = {
    Q: p.Q,
    ordering: (p.D * p.S) / p.Q,
    holding: (p.H * p.Q) / 2,
    total: totalCost(p.D, p.S, p.H, p.Q),
  };
  const delta = current.total - TC;
  const deltaPct = delta / TC;
  const gap = (p.Q - Qs) / Qs;
  const verdict = Math.abs(gap) <= 0.05 ? 'ok' : gap > 0 ? 'over' : 'under';

  // Curva de costos
  const qMin = Math.max(1, 0.2 * Qs);
  const qMax = Math.max(2.5 * Qs, p.Q * 1.1);
  const costCurve = [];
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const q = qMin + ((qMax - qMin) * i) / n;
    costCurve.push({ Q: q, ordering: (p.D * p.S) / q, holding: (p.H * q) / 2, total: totalCost(p.D, p.S, p.H, q) });
  }

  // Diente de sierra de un año con Q*
  const sawtooth = [];
  for (let start = 0; start < p.dias; start += T) {
    sawtooth.push({ x: start, y: Qs });
    const end = Math.min(start + T, p.dias);
    sawtooth.push({ x: end, y: Qs - daily * (end - start) });
  }

  const table = [0.4, 0.8, 1, 1.2, 1.6].map((f) => {
    const q = Qs * f;
    return { Q: q, ordering: (p.D * p.S) / q, holding: (p.H * q) / 2, total: totalCost(p.D, p.S, p.H, q), optimal: f === 1 };
  });

  return { Qs, N, T, TC, ROP, daily, current, delta, deltaPct, verdict, costCurve, sawtooth, table };
}
