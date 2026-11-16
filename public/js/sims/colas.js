// Teoría de colas: M/M/1, M/M/c (Erlang C) y línea en serie; simulación por eventos discretos.
// Módulo puro.
import { defaultsOf } from '../lib/params.js';
import { mulberry32, exponential } from '../lib/prng.js';

export const meta = { slug: 'colas', title: 'Teoría de colas y cuellos de botella' };

export const schema = {
  modelo: { type: 'enum', options: ['mm1', 'mmc', 'serie'], default: 'mm1', label: 'Modelo' },
  lambda: { min: 0.1, max: 30, step: 0.1, default: 4, unit: 'clientes/h', label: 'Tasa de llegada (λ)' },
  mu: { min: 0.1, max: 30, step: 0.1, default: 5, unit: 'clientes/h', label: 'Tasa de servicio (μ)' },
  c: { min: 1, max: 10, step: 1, default: 1, unit: 'servidores', label: 'Servidores (c)' },
  mus: { type: 'list', min: 0.1, max: 30, step: 0.1, minLength: 2, maxLength: 5, default: [6, 5, 7], label: 'Capacidad de estaciones' },
  Cw: { min: 0, max: 200, step: 1, default: 20, unit: '$/cliente·h', label: 'Costo de espera (Cw)' },
  Cs: { min: 0, max: 200, step: 1, default: 15, unit: '$/h', label: 'Costo por servidor (Cs)' },
  horas: { min: 1, max: 24, step: 1, default: 8, unit: 'h', label: 'Horizonte' },
};
export const defaults = defaultsOf(schema);

const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };

/** Métricas de estado estable de M/M/c (c = 1 da M/M/1). */
export function mmc(lambda, mu, c = 1) {
  const rho = lambda / (c * mu);
  if (rho >= 1) return { stable: false, rho };
  const a = lambda / mu;
  let s = 0;
  for (let n = 0; n < c; n++) s += a ** n / fact(n);
  const P0 = 1 / (s + a ** c / (fact(c) * (1 - rho)));
  const Lq = (P0 * a ** c * rho) / (fact(c) * (1 - rho) ** 2);
  const L = Lq + a;
  const Wq = Lq / lambda;
  const W = Wq + 1 / mu;
  const Pwait = (P0 * a ** c) / (fact(c) * (1 - rho)); // Erlang C
  return { stable: true, rho, P0, Lq, L, Wq, W, Pwait };
}

export const totalCost = (m, c, Cs, Cw) => (m.stable ? c * Cs + m.L * Cw : Infinity);

export function serie(lambda, mus) {
  const rhos = mus.map((m) => lambda / m);
  const capacity = Math.min(...mus);
  const bottleneck = mus.indexOf(capacity);
  return { rhos, capacity, bottleneck, throughput: Math.min(lambda, capacity), stable: lambda < capacity };
}

export function compute(params) {
  const p = { ...defaults, ...params };
  const c = p.modelo === 'mm1' ? 1 : p.c;
  const m = mmc(p.lambda, p.mu, c);
  const costs = [];
  for (let k = 1; k <= 10; k++) {
    const mk = mmc(p.lambda, p.mu, k);
    costs.push({ c: k, stable: mk.stable, L: mk.L, Wq: mk.Wq, cost: totalCost(mk, k, p.Cs, p.Cw) });
  }
  const best = costs.filter((x) => x.stable).reduce((acc, x) => (acc && acc.cost <= x.cost ? acc : x), null);
  // Curva L(ρ) teórica de M/M/1
  const curve = [];
  for (let i = 0; i <= 38; i++) { const r = i * 0.025; curve.push({ x: r, y: r / (1 - r) }); }
  return {
    c, ...m,
    cost: totalCost(m, c, p.Cs, p.Cw),
    costs, best, curve,
    serie: serie(p.lambda, p.mus),
  };
}

/**
 * Simulación por eventos discretos FIFO con c servidores durante `horas`.
 * Devuelve la serie escalonada del estado {t, nq, ns} (horas, en fila, en servicio),
 * las salidas ordenadas y promedios observados.
 */
export function simulate(params, seed = 42) {
  const p = { ...defaults, ...params };
  const c = p.modelo === 'mm1' ? 1 : p.c;
  const rng = mulberry32(seed);
  const T = p.horas;
  const steps = [{ t: 0, nq: 0, ns: 0 }];
  const free = []; // tiempos de fin de servicio de los servidores ocupados
  const queue = []; // tiempos de llegada en espera
  const departures = [];
  let nextArrival = exponential(rng, p.lambda);
  let areaN = 0, areaQ = 0, lastT = 0, nq = 0, ns = 0;
  let served = 0, sumW = 0, sumWq = 0, arrivals = 0;
  const maxSteps = 200000;
  const advance = (t) => { areaN += (nq + ns) * (t - lastT); areaQ += nq * (t - lastT); lastT = t; };
  const record = (t) => { if (steps.length < maxSteps) steps.push({ t, nq, ns }); };
  const startService = (t, arrivedAt) => {
    const end = t + exponential(rng, p.mu);
    free.push({ end, arrivedAt, start: t });
    ns++;
  };
  while (true) {
    free.sort((x, y) => x.end - y.end);
    const nextDep = free.length ? free[0].end : Infinity;
    const t = Math.min(nextArrival, nextDep);
    if (t > T) break;
    advance(t);
    if (nextArrival <= nextDep) {
      arrivals++;
      if (ns < c) startService(t, t); else { queue.push(t); nq++; }
      nextArrival = t + exponential(rng, p.lambda);
    } else {
      const job = free.shift();
      ns--;
      served++;
      sumW += t - job.arrivedAt;
      sumWq += job.start - job.arrivedAt;
      departures.push(t);
      if (queue.length) { const a = queue.shift(); nq--; startService(t, a); }
    }
    record(t);
  }
  advance(T);
  steps.push({ t: T, nq, ns });
  return {
    steps, departures,
    summary: {
      L: areaN / T, Lq: areaQ / T,
      W: served ? sumW / served : 0, Wq: served ? sumWq / served : 0,
      served, arrivals, lambdaObs: arrivals / T,
    },
  };
}

/** Estado en el instante t (búsqueda binaria sobre la serie escalonada). */
export function stateAt(steps, t) {
  let lo = 0, hi = steps.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (steps[mid].t <= t) lo = mid; else hi = mid - 1; }
  return steps[lo];
}

/** Número de salidas ocurridas hasta t. */
export function servedBy(departures, t) {
  let lo = 0, hi = departures.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (departures[mid] <= t) lo = mid + 1; else hi = mid; }
  return lo;
}
