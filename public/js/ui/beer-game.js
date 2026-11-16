import * as sim from '../sims/beer-game.js';
import { mix, simBase, playerBase } from './common.js';
import { makeChart, axes, theme, line } from '../lib/charts.js';
import { prefersReducedMotion } from '../lib/player.js';

export default () => {
  let chart = null;
  let game = null;   // partida interactiva
  let auto = null;   // corrida automática con la misma semilla
  let animRaf = 0;
  return mix(simBase({ sim, slug: 'beer-game', seeded: true }), playerBase(), {
    roles: sim.ROLES,
    roleNames: sim.ROLE_NAMES,
    nodes: [],
    week: 0,
    qty: 4,
    lastDemand: null,
    anim: 0,
    results: null,
    get isPlay() { return this.params.modo === 'jugar'; },
    get roleIdx() { return sim.ROLES.indexOf(this.params.rol); },
    recompute() {
      cancelAnimationFrame(animRaf);
      auto = sim.simulate(this.params, this.seed);
      this.results = null;
      if (chart) { chart.destroy(); chart = null; this.$nextTick(() => this.buildCharts()); }
      if (this.isPlay) {
        this.setupPlayer(this.params.sem, 2); // no se usa en modo jugar, pero mantiene el estado coherente
        game = sim.createGame(this.params, this.seed);
        game.phaseA();
        this.qty = game.suggest();
        this.week = 0;
        this.state = 'idle';
        this.nodes = game.snapshot();
        this.drawHistory(game.history, 0);
      } else {
        game = null;
        this.setupPlayer(this.params.sem, 2);
        this.frame(0);
      }
    },
    // ── Modo jugar ──
    submitOrder() {
      if (!game || game.isOver) return;
      game.step(this.qty);
      this.week = game.week;
      this.animate();
      if (game.isOver) {
        this.state = 'done';
        this.nodes = game.snapshot();
        this.results = game.results();
      } else {
        this.state = 'running';
        game.phaseA();
        this.nodes = game.snapshot();
        this.qty = game.suggest();
      }
      this.drawHistory(game.history, this.week);
    },
    setQty(v) { this.qty = Math.max(0, Math.min(99, Math.round(Number(v) || 0))); },
    get receivedNow() { return this.nodes[this.roleIdx]?.received ?? 0; },
    get suggestion() { return game && !game.isOver ? game.suggest() : 0; },
    restartGame() { this.recompute(); },
    animate() {
      cancelAnimationFrame(animRaf);
      if (prefersReducedMotion()) { this.anim = 0; return; }
      const start = performance.now();
      const tick = (ts) => {
        const p = Math.min(1, (ts - start) / 600);
        this.anim = p < 1 ? p : 0;
        if (p < 1) animRaf = requestAnimationFrame(tick);
      };
      animRaf = requestAnimationFrame(tick);
    },
    // ── Modo automático ──
    frame(t) {
      if (this.isPlay || !auto) return;
      const w = Math.floor(t + 1e-9);
      this.week = w;
      this.anim = this.state === 'running' ? t - w : 0;
      const h = auto.history;
      const i = w - 1;
      this.nodes = sim.ROLE_NAMES.map((name, k) => ({
        name,
        inv: i >= 0 ? h.inv[k][i] : 12,
        backlog: i >= 0 ? h.backlog[k][i] : 0,
        received: i < 0 ? 4 : k === 0 ? h.demand[i] : i > 0 ? h.orders[k - 1][i - 1] : 4,
        pipeline: null,
        cost: i >= 0 ? h.cost[k][i] : 0,
        isPlayer: false,
        order: i >= 0 ? h.orders[k][i] : 4,
      }));
      if (w >= this.params.sem) this.results = { cost: auto.cost, totalCost: auto.totalCost, amplification: auto.amplification, ratio: auto.ratio };
      else this.results = null;
      this.drawHistory(h, w);
    },
    drawHistory(h, w) {
      if (!chart) return;
      const d = chart.data.datasets;
      for (let k = 0; k < 4; k++) d[k].data = h.net[k].slice(0, w).map((y, x) => ({ x: x + 1, y }));
      const all = auto.history.net.flat();
      chart.options.scales.y.suggestedMin = Math.min(-10, ...all, ...h.net.flat());
      chart.options.scales.y.suggestedMax = Math.max(20, ...all, ...h.net.flat());
      chart.options.scales.x.max = this.params.sem;
      chart.update('none');
    },
    buildCharts() {
      if (!this.$refs.chart || !auto) return;
      const t = theme();
      const colors = [t.c2, t.seq[1], t.seq[2], t.seq[3]];
      chart = makeChart(this.$refs.chart, {
        type: 'line',
        data: { datasets: sim.ROLE_NAMES.map((n, k) => line(n, [], colors[k], k === this.roleIdx && this.isPlay ? { borderWidth: 4 } : {})) },
        options: {
          scales: axes({ x: { title: 'Semana', min: 1, max: this.params.sem }, y: { title: 'Inventario neto (u)' } }),
        },
        plugins: [{
          id: 'zero',
          beforeDatasetsDraw: (c) => {
            const { ctx, chartArea: a, scales: { x, y } } = c;
            const y0 = y.getPixelForValue(0);
            ctx.save(); ctx.fillStyle = t.fill2; ctx.globalAlpha = 0.35;
            ctx.fillRect(a.left, y0, a.right - a.left, a.bottom - y0);
            ctx.globalAlpha = 1; ctx.strokeStyle = t.muted; ctx.beginPath(); ctx.moveTo(a.left, y0); ctx.lineTo(a.right, y0); ctx.stroke();
            const xs = x.getPixelForValue(this.params.salto);
            ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(xs, a.top); ctx.lineTo(xs, a.bottom); ctx.stroke();
            ctx.restore();
          },
        }],
      });
      if (this.isPlay && game) this.drawHistory(game.history, game.week); else this.frame(this.t);
    },
    destroyCharts() { cancelAnimationFrame(animRaf); chart?.destroy(); chart = null; },
    // ── Indicadores ──
    get myCost() {
      if (this.isPlay) return this.nodes[this.roleIdx]?.cost ?? 0;
      return this.nodes[this.roleIdx]?.cost ?? 0;
    },
    get policyCost() { return auto ? auto.cost[this.roleIdx] : 0; },
    get chainCost() { return this.nodes.reduce((s, n) => s + (n.cost || 0), 0); },
    get badgeText() {
      if (this.isPlay) return { idle: 'Esperando tu primer pedido', running: 'Esperando tu pedido', done: 'Partida terminada', paused: 'En pausa' }[this.state];
      return this.stateLabel;
    },
    get dayLabel() { return `Semana ${this.week} de ${this.params.sem}`; },
    get demandText() { return game && !game.isOver ? game.currentDemand : '—'; },
    get ariaChart() {
      if (!auto) return '';
      const r = auto.ratio.map((x) => x.toFixed(1));
      return `Inventario neto por eslabón (negativo = pedidos pendientes). Tras el salto de demanda en la semana ${this.params.salto}, los eslabones caen a faltantes y luego acumulan exceso. Con la política automática y semilla ${this.seed}, la varianza de pedidos de la fábrica es ${r[3]} veces la de la demanda.`;
    },
  });
};
