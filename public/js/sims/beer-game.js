// Beer Game simplificado: 4 eslabones, retraso de información de 1 semana y de envío de L semanas.
// Módulo puro: createGame() para jugar paso a paso y simulate() para la corrida automática.
import { defaultsOf } from '../lib/params.js';
import { mulberry32, poisson } from '../lib/prng.js';
import { variance } from '../lib/stats.js';

export const meta = { slug: 'beer-game', title: 'Beer Game (versión simplificada)' };
export const ROLES = ['minorista', 'mayorista', 'distribuidor', 'fabrica'];
export const ROLE_NAMES = ['Minorista', 'Mayorista', 'Distribuidor', 'Fábrica'];
const THETA = 0.3, ALPHA = 0.4, BUFFER = 8, INIT_INV = 12, INIT_FLOW = 4;

export const schema = {
  modo: { type: 'enum', options: ['jugar', 'auto'], default: 'jugar', label: 'Modo' },
  rol: { type: 'enum', options: ROLES, default: 'minorista', label: 'Tu rol' },
  sem: { min: 20, max: 52, step: 1, default: 30, unit: 'semanas', label: 'Duración' },
  L: { min: 1, max: 4, step: 1, default: 2, unit: 'sem', label: 'Retraso de envío (L)' },
  d0: { min: 0, max: 20, step: 1, default: 4, unit: 'u/sem', label: 'Demanda inicial' },
  d1: { min: 0, max: 20, step: 1, default: 8, unit: 'u/sem', label: 'Demanda después del salto' },
  salto: { min: 1, max: 20, step: 1, default: 5, unit: 'semana', label: 'Semana del salto' },
  ruido: { type: 'bool', default: true, label: 'Ruido Poisson en la demanda' },
  h: { min: 0, max: 5, step: 0.1, default: 0.5, unit: '$/u·sem', label: 'Costo de inventario (h)' },
  b: { min: 0, max: 10, step: 0.1, default: 1, unit: '$/u·sem', label: 'Costo de pendientes (b)' },
};
export const defaults = defaultsOf(schema);

function customerDemand(p, rng) {
  const out = [];
  for (let w = 1; w <= p.sem; w++) {
    const level = w < p.salto ? p.d0 : p.d1;
    out.push(p.ruido ? poisson(rng, level) : level);
  }
  return out;
}

/** Política automática: pronóstico exponencial y ajuste parcial hacia el nivel objetivo. */
function policyOrder(node, observed, L) {
  const Dhat = THETA * observed + (1 - THETA) * node.Dhat;
  const IP = node.inv - node.backlog + node.pipeline.reduce((a, b) => a + b, 0);
  const target = Dhat * (L + 1) + BUFFER;
  return { Dhat, q: Math.max(0, Math.round(Dhat + ALPHA * (target - IP))) };
}

export function createGame(params, seed = 42) {
  const p = { ...defaults, ...params };
  const rng = mulberry32(seed);
  const demand = customerDemand(p, rng);
  const playerIdx = p.modo === 'jugar' ? ROLES.indexOf(p.rol) : -1;
  const nodes = ROLES.map(() => ({
    inv: INIT_INV, backlog: 0,
    pipeline: Array(p.L).fill(INIT_FLOW), // pipeline[0] llega la próxima semana
    lastOrder: INIT_FLOW, Dhat: INIT_FLOW,
    received: INIT_FLOW, cost: 0,
  }));
  const history = {
    week: [], demand: [],
    inv: ROLES.map(() => []), backlog: ROLES.map(() => []), net: ROLES.map(() => []),
    orders: ROLES.map(() => []), cost: ROLES.map(() => []),
  };
  let week = 0; // semanas completadas
  let phaseADone = false;

  /** Fase A de la semana: llegadas, pedidos recibidos (de la semana anterior), envíos. */
  function phaseA() {
    if (phaseADone || week >= p.sem) return;
    // Proveedor externo de la fábrica: produce lo que la fábrica pidió la semana anterior.
    const prevOrders = nodes.map((n) => n.lastOrder);
    nodes.forEach((n) => { n.inv += n.pipeline.shift(); });
    for (let k = 0; k < 4; k++) {
      const n = nodes[k];
      const incoming = k === 0 ? demand[week] : prevOrders[k - 1];
      n.received = incoming;
      const due = incoming + n.backlog;
      const ship = Math.min(n.inv, due);
      n.inv -= ship;
      n.backlog = due - ship;
      if (k > 0) nodes[k - 1].pipeline.push(ship);
    }
    nodes[3].pipeline.push(prevOrders[3]);
    phaseADone = true;
  }

  /** Sugerencia de la política para un eslabón en la semana actual. */
  function suggest(k = playerIdx) {
    phaseA();
    const idx = k < 0 ? 0 : k;
    return policyOrder(nodes[idx], nodes[idx].received, p.L).q;
  }

  /** Completa la semana. orderForPlayer se usa si hay jugador humano. */
  function step(orderForPlayer) {
    if (week >= p.sem) return false;
    phaseA();
    for (let k = 0; k < 4; k++) {
      const n = nodes[k];
      const auto = policyOrder(n, n.received, p.L);
      n.Dhat = auto.Dhat;
      let q = auto.q;
      if (k === playerIdx) q = Math.max(0, Math.round(Number(orderForPlayer) || 0));
      n.lastOrder = q;
      const c = p.h * Math.max(n.inv, 0) + p.b * n.backlog;
      n.cost += c;
      history.inv[k].push(n.inv);
      history.backlog[k].push(n.backlog);
      history.net[k].push(n.inv - n.backlog);
      history.orders[k].push(q);
      history.cost[k].push(n.cost);
    }
    history.week.push(week + 1);
    history.demand.push(demand[week]);
    week++;
    phaseADone = false;
    return true;
  }

  return {
    params: p, demand, nodes, history, playerIdx,
    get week() { return week; },
    get isOver() { return week >= p.sem; },
    get currentDemand() { return demand[Math.min(week, p.sem - 1)]; },
    phaseA, step, suggest,
    snapshot() {
      return nodes.map((n, k) => ({
        name: ROLE_NAMES[k], inv: n.inv, backlog: n.backlog, received: n.received,
        pipeline: n.pipeline.slice(), cost: n.cost, isPlayer: k === playerIdx,
      }));
    },
    results() { return summarize(history, nodes); },
  };
}

function summarize(history, nodes) {
  const vd = variance(history.demand);
  const ratio = history.orders.map((o) => (vd > 0 ? variance(o) / vd : 0));
  const cost = nodes.map((n) => n.cost);
  return { cost, totalCost: cost.reduce((a, b) => a + b, 0), ratio, amplification: ratio[3] };
}

/** Corrida completa automática (todos los eslabones con la política). */
export function simulate(params, seed = 42) {
  const g = createGame({ ...params, modo: 'auto' }, seed);
  while (!g.isOver) g.step();
  return { demand: g.demand, history: g.history, ...g.results() };
}
