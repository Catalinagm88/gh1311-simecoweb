// Casos de prueba T1–T34 del README-handoff.md. Ejecutar: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32, normal, exponential } from '../public/js/lib/prng.js';
import { mean, std, variance, zFromServiceLevel } from '../public/js/lib/stats.js';
import { parseQuery, parseHash, toQuery } from '../public/js/lib/params.js';
import * as eoq from '../public/js/sims/eoq.js';
import * as od from '../public/js/sims/oferta-demanda.js';
import * as interes from '../public/js/sims/interes.js';
import * as rop from '../public/js/sims/punto-reorden.js';
import * as revision from '../public/js/sims/revision.js';
import * as bullwhip from '../public/js/sims/bullwhip.js';
import * as beer from '../public/js/sims/beer-game.js';
import * as colas from '../public/js/sims/colas.js';

const near = (actual, expected, tol = 1e-2, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg} esperado ${expected} ± ${tol}, obtenido ${actual}`);

test('T1 mulberry32(42) primeros valores', () => {
  const r = mulberry32(42);
  near(r(), 0.6011037519, 1e-9); near(r(), 0.4482905590, 1e-9); near(r(), 0.8524657935, 1e-9);
});

test('T2 misma semilla, misma secuencia', () => {
  const a = mulberry32(42), b = mulberry32(42);
  assert.deepEqual(Array.from({ length: 1000 }, a), Array.from({ length: 1000 }, b));
});

test('T3 normal Box-Muller: media 0, desviación 1', () => {
  const r = mulberry32(42);
  const xs = Array.from({ length: 100000 }, () => normal(r));
  near(mean(xs), 0, 0.02); near(std(xs), 1, 0.02);
});

test('T4 exponencial con tasa 4: media 0.25', () => {
  const r = mulberry32(42);
  near(mean(Array.from({ length: 100000 }, () => exponential(r, 4))), 0.25, 0.005);
});

test('T5 EOQ D=1200 S=50 H=2', () => {
  const o = eoq.compute({ D: 1200, S: 50, H: 2 });
  near(o.Qs, 244.949, 1e-3); near(o.TC, 489.90); near(o.N, 4.899, 1e-3); near(o.T, 74.5, 0.01);
});

test('T6 EOQ costo del lote actual Q=400', () => {
  const o = eoq.compute({ D: 1200, S: 50, H: 2, Q: 400 });
  near(o.current.total, 550); near(o.delta, 60.10); assert.equal(o.verdict, 'over');
});

test('T7 EOQ punto de reorden', () => near(eoq.compute({ D: 1200, L: 5, dias: 365 }).ROP, 16.44));

test('T8 cuadruplicar D duplica Q*', () => {
  near(eoq.compute({ D: 4800, S: 50, H: 2 }).Qs, 2 * eoq.compute({ D: 1200, S: 50, H: 2 }).Qs, 1e-9);
});

test('T9 oferta y demanda en equilibrio', () => {
  const o = od.compute({ a: 100, b: 2, c: 10, d: 1.5, t: 0 });
  near(o.P, 25.714, 1e-3); near(o.Q, 48.571, 1e-3); near(o.CS, 589.80); near(o.PS, 753.06);
});

test('T10 oferta y demanda con impuesto t=5', () => {
  const o = od.compute({ a: 100, b: 2, c: 10, d: 1.5, t: 5 });
  near(o.Pc, 27.857, 1e-3); near(o.Q, 44.286, 1e-3); near(o.Pv, 22.857, 1e-3);
  assert.ok(o.DWL > 0);
});

test('T11 interés compuesto mensual', () => {
  const o = interes.compute({ P: 10000, r: 8, m: 12, t: 10, A: 0 });
  near(o.FV, 22196.40); near(o.TEA, 0.0830, 1e-4); near(o.simple, 18000);
});

test('T12 capitalización continua', () => near(interes.compute({ P: 10000, r: 8, m: 'inf', t: 10, A: 0 }).FV, 22255.41));

test('T13 opción B diaria al 7.5 %', () => {
  const o = interes.compute({ P: 10000, r: 8, m: 12, t: 10, A: 0, rB: 7.5, mB: 365 });
  near(o.FVB, 21168.37); near(o.diff, 1028.03); assert.equal(o.best, 'A');
});

test('T14 anualidad', () => near(interes.compute({ P: 0, A: 100, r: 12, m: 12, t: 1 }).FV, 1268.25));

test('T15 valor real y duplicación', () => {
  const o = interes.compute({ P: 10000, r: 8, m: 12, t: 10, A: 0, inf: 4 });
  near(o.real, 14995.1, 0.1); near(o.doubling, 8.69, 0.01);
});

test('T16 z por nivel de servicio', () => {
  near(zFromServiceLevel(0.95), 1.6449, 1e-3); near(zFromServiceLevel(0.99), 2.3263, 1e-3);
});

test('T17 inventario de seguridad y ROP', () => {
  const o = rop.theory({ d: 20, sd: 5, L: 7, ns: 95 });
  near(o.SS, 21.76); near(o.ROP, 161.76);
});

test('T18 sin variabilidad no hay faltantes', () => {
  const o = rop.simulate({ sd: 0 }, 42);
  near(o.SS, 0, 1e-9); near(o.ROP, 140, 1e-9); assert.equal(o.summary.lost, 0);
});

test('T19 punto de reorden reproducible con la semilla', () => {
  assert.deepEqual(rop.simulate({}, 42).series.inventory, rop.simulate({}, 42).series.inventory);
  assert.notDeepEqual(rop.simulate({}, 42).series.inventory, rop.simulate({}, 7).series.inventory);
});

test('T20 nivel objetivo de la revisión periódica', () => {
  const o = revision.simulate({ d: 20, sd: 5, L: 7, R: 20, ns: 95 }, 42);
  near(o.S, 582.73); near(o.ssP, 42.73); assert.ok(o.ssP > o.ssC);
});

test('T21 ambas políticas usan la misma demanda', () => {
  for (const seed of [1, 42, 999]) {
    const o = revision.simulate({}, seed);
    assert.deepEqual(o.continuous.demand, o.periodic.demand);
  }
});

test('T22 cota de bullwhip por eslabón', () => near(bullwhip.bound(2, 4), 2.5, 1e-12));

test('T23 amplificación creciente con semilla 42', () => {
  const { ratio } = bullwhip.simulate({}, 42);
  assert.ok(ratio[0] > 1); assert.ok(ratio[3] > ratio[0]);
});

test('T24 compartir información reduce el látigo', () => {
  assert.ok(bullwhip.simulate({ info: true }, 42).ratio[3] < bullwhip.simulate({ info: false }, 42).ratio[3]);
});

test('T25 Beer Game semilla 42: amplificación medible', () => {
  const o = beer.simulate({}, 42);
  assert.ok(o.amplification > 2, `amplificación ${o.amplification}`);
  assert.ok(variance(o.history.orders[3]) > variance(o.history.orders[0]));
});

test('T26 Beer Game reproducible', () => {
  const a = beer.simulate({}, 42), b = beer.simulate({}, 42);
  assert.equal(a.totalCost, b.totalCost); assert.deepEqual(a.history, b.history);
});

test('T27 Beer Game en equilibrio sin salto ni ruido', () => {
  const o = beer.simulate({ ruido: false, d0: 4, d1: 4, sem: 30 }, 42);
  assert.ok(o.history.orders.flat().every((q) => q === 4));
  near(o.totalCost, 12 * 0.5 * 4 * 30, 1e-9);
});

test('T28 M/M/1 λ=4 μ=5', () => {
  const m = colas.mmc(4, 5, 1);
  near(m.rho, 0.8, 1e-12); near(m.L, 4, 1e-9); near(m.Lq, 3.2, 1e-9); near(m.W, 1, 1e-9); near(m.Wq, 0.8, 1e-9); near(m.P0, 0.2, 1e-9);
});

test('T29 M/M/2', () => {
  const m = colas.mmc(4, 5, 2);
  near(m.P0, 0.4286, 1e-4); near(m.Lq, 0.1524, 1e-4); near(m.L, 0.9524, 1e-4); near(m.Wq * 60, 2.29, 0.01);
});

test('T30 costos y recomendación de servidores', () => {
  const o = colas.compute({ lambda: 4, mu: 5, Cw: 20, Cs: 15 });
  near(o.costs[0].cost, 95); near(o.costs[1].cost, 49.05); near(o.costs[2].cost, 61.38);
  assert.equal(o.best.c, 2);
});

test('T31 sistema inestable', () => assert.equal(colas.mmc(5, 5, 1).stable, false));

test('T32 simulación converge a la teoría y cumple Little', () => {
  const { summary: s } = colas.simulate({ modelo: 'mm1', lambda: 4, mu: 5, horas: 10000 }, 42);
  assert.ok(Math.abs(s.L - 4) / 4 < 0.1, `L observado ${s.L}`);
  assert.ok(Math.abs(s.L - s.lambdaObs * s.W) / s.L < 0.02, 'Little');
});

test('T33 cuello de botella en serie', () => {
  const s = colas.serie(4, [6, 5, 7]);
  assert.equal(s.bottleneck, 1); assert.equal(s.capacity, 5);
  near(s.rhos[0], 0.667, 1e-3); near(s.rhos[1], 0.8, 1e-9); near(s.rhos[2], 0.571, 1e-3);
});

test('T34 parámetros fuera de rango se recortan', () => {
  const { params, adjusted } = parseQuery(eoq.schema, 'D=99999&S=abc');
  assert.equal(params.D, 20000); assert.equal(params.S, 50); assert.equal(adjusted[0].key, 'D');
  assert.deepEqual(parseHash('#/eoq?D=1200'), { slug: 'eoq', query: 'D=1200' });
  assert.equal(parseQuery(eoq.schema, toQuery(eoq.schema, eoq.defaults, 42)).seed, '42');
});
