// Interés simple, compuesto y continuo; anualidades; comparación de dos opciones. Módulo puro.
import { defaultsOf } from '../lib/params.js';

export const meta = { slug: 'interes', title: 'Interés compuesto y decisiones financieras' };

const M_OPTIONS = [1, 2, 4, 12, 365, 'inf'];
export const M_LABELS = { 1: 'Anual', 2: 'Semestral', 4: 'Trimestral', 12: 'Mensual', 365: 'Diaria', inf: 'Continua' };

export const schema = {
  P: { min: 0, max: 1000000, step: 100, default: 10000, unit: '$', label: 'Capital inicial (P)' },
  r: { min: 0, max: 30, step: 0.25, default: 8, unit: '% anual', label: 'Tasa nominal anual (r)' },
  m: { type: 'enum', options: M_OPTIONS, default: 12, label: 'Capitalización (m)' },
  t: { min: 1, max: 40, step: 1, default: 10, unit: 'años', label: 'Plazo (t)' },
  A: { min: 0, max: 5000, step: 50, default: 0, unit: '$/periodo', label: 'Aportación periódica (A)' },
  inf: { min: 0, max: 15, step: 0.25, default: 4, unit: '% anual', label: 'Inflación esperada' },
  rB: { min: 0, max: 30, step: 0.25, default: 7.5, unit: '% anual', label: 'Tasa nominal B' },
  mB: { type: 'enum', options: M_OPTIONS, default: 365, label: 'Capitalización B' },
};
export const defaults = defaultsOf(schema);

/** Valor futuro. r en fracción (0.08). m numérico o 'inf'. A = aportación al final de cada periodo. */
export function futureValue(P, r, m, t, A = 0) {
  if (m === 'inf') {
    const base = P * Math.exp(r * t);
    // Con capitalización continua la anualidad se aproxima con m = 365.
    return base + (A > 0 ? annuity(A, r / 365, 365 * t) : 0);
  }
  const i = r / m, n = m * t;
  return P * (1 + i) ** n + annuity(A, i, n);
}

function annuity(A, i, n) {
  if (!A) return 0;
  return i === 0 ? A * n : A * (((1 + i) ** n - 1) / i);
}

export const effectiveRate = (r, m) => (m === 'inf' ? Math.exp(r) - 1 : (1 + r / m) ** m - 1);

export function doublingTime(r, m) {
  if (r <= 0) return Infinity;
  return m === 'inf' ? Math.LN2 / r : Math.LN2 / (m * Math.log(1 + r / m));
}

export function compute(params) {
  const p = { ...defaults, ...params };
  const r = p.r / 100, rB = p.rB / 100, inf = p.inf / 100;
  const periodsPerYear = p.m === 'inf' ? 365 : p.m;
  const FV = futureValue(p.P, r, p.m, p.t, p.A);
  const FVB = futureValue(p.P, rB, p.mB, p.t, p.A);
  const simple = p.P * (1 + r * p.t) + p.A * periodsPerYear * p.t;
  const contributed = p.P + p.A * periodsPerYear * p.t;
  const series = { years: [], compound: [], simple: [], optionB: [] };
  for (let y = 0; y <= p.t; y++) {
    series.years.push(y);
    series.compound.push(futureValue(p.P, r, p.m, y, p.A));
    series.optionB.push(futureValue(p.P, rB, p.mB, y, p.A));
    series.simple.push(p.P * (1 + r * y) + p.A * periodsPerYear * y);
  }
  const best = FV >= FVB ? 'A' : 'B';
  return {
    FV, FVB, simple, contributed,
    interest: FV - contributed,
    TEA: effectiveRate(r, p.m),
    TEAB: effectiveRate(rB, p.mB),
    real: FV / (1 + inf) ** p.t,
    doubling: doublingTime(r, p.m),
    rule72: r > 0 ? 72 / p.r : Infinity,
    continuous: futureValue(p.P, r, 'inf', p.t, 0),
    best, diff: Math.abs(FV - FVB),
    series,
  };
}
