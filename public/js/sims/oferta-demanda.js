// Oferta y demanda lineales con impuesto por unidad y precio máximo. Módulo puro.
import { defaultsOf } from '../lib/params.js';

export const meta = { slug: 'oferta-demanda', title: 'Oferta y demanda' };

export const schema = {
  a: { min: 20, max: 200, step: 1, default: 100, unit: 'u', label: 'Demanda base (a)' },
  b: { min: 0.5, max: 5, step: 0.1, default: 2, unit: 'u/$', label: 'Sensibilidad al precio (b)' },
  c: { min: -50, max: 100, step: 1, default: 10, unit: 'u', label: 'Oferta base (c)' },
  d: { min: 0.5, max: 5, step: 0.1, default: 1.5, unit: 'u/$', label: 'Respuesta de la oferta (d)' },
  t: { min: 0, max: 20, step: 0.5, default: 0, unit: '$/u', label: 'Impuesto por unidad (t)' },
  usePmax: { type: 'bool', default: false, label: 'Aplicar precio máximo' },
  pmax: { min: 0, max: 100, step: 0.5, default: 20, unit: '$', label: 'Precio máximo' },
};
export const defaults = defaultsOf(schema);

/** Cantidad ofrecida cuando el comprador paga P (el vendedor recibe P − t). */
const qs = (p, P) => Math.max(0, p.c + p.d * (P - p.t));
const qd = (p, P) => Math.max(0, p.a - p.b * P);

/** Excedente del productor: ∫₀^{Pv} max(0, c + dP) dP. */
export function producerSurplus(c, d, Pv) {
  if (Pv <= 0) return 0;
  if (c >= 0) return c * Pv + (d * Pv * Pv) / 2;
  const pmin = -c / d;
  return Pv > pmin ? (d * (Pv - pmin) ** 2) / 2 : 0;
}

export function compute(params) {
  const p = { ...defaults, ...params };
  const choke = p.a / p.b; // precio al que la demanda es 0
  // Equilibrio sin impuesto (referencia para la pérdida de eficiencia)
  const P0 = Math.max(0, (p.a - p.c) / (p.b + p.d));
  const Q0 = Math.max(0, p.a - p.b * P0);
  // Equilibrio con impuesto (lo paga el vendedor)
  let Pc = (p.a - p.c + p.d * p.t) / (p.b + p.d);
  Pc = Math.min(Math.max(Pc, 0), choke);
  let Q = Math.max(0, p.a - p.b * Pc);
  let Pv = Pc - p.t;

  const ceiling = { active: false, price: p.pmax, demanded: null, supplied: null, shortage: 0 };
  if (p.usePmax && p.pmax < Pc) {
    ceiling.active = true;
    ceiling.demanded = qd(p, p.pmax);
    ceiling.supplied = qs(p, p.pmax);
    ceiling.shortage = Math.max(0, ceiling.demanded - ceiling.supplied);
  }

  // Excedentes (sin precio máximo activo)
  const CS = ((choke - Pc) * Q) / 2;
  const PS = producerSurplus(p.c, p.d, Pv);
  const revenue = p.t * Q;
  const DWL = (p.t * Math.max(0, Q0 - Q)) / 2;

  // Curvas: x = cantidad, y = precio
  const pTop = Math.max(choke, Pc * 1.2, 1);
  const n = 40;
  const demand = [], supply = [];
  for (let i = 0; i <= n; i++) {
    const P = (pTop * i) / n;
    if (P <= choke) demand.push({ x: qd(p, P), y: P });
    const s = p.c + p.d * (P - p.t);
    if (s >= 0) supply.push({ x: s, y: P });
  }

  const table = [0.4, 0.8, 1, 1.2, 1.6].map((f) => {
    const P = Pc * f;
    const dQ = qd(p, P), sQ = qs(p, P);
    const gap = dQ - sQ;
    return {
      price: P, demanded: dQ, supplied: sQ,
      status: Math.abs(gap) < 1e-9 ? 'Equilibrio' : gap > 0 ? `Escasez (${gap.toFixed(1)})` : `Excedente (${(-gap).toFixed(1)})`,
    };
  });

  return {
    P: Pc, Pc, Pv, Q, P0, Q0, CS, PS, revenue, DWL, choke,
    ceiling, curves: { demand, supply }, table,
  };
}
