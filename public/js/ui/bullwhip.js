import * as sim from '../sims/bullwhip.js';
import { mix, simBase, playerBase } from './common.js';
import { makeChart, axes, theme, line } from '../lib/charts.js';

const SEGS = [[150, 222], [362, 434], [574, 646], [786, 858]];

export default () => {
  let ordersChart = null, ratioChart = null;
  let res = null;
  return mix(simBase({ sim, slug: 'bullwhip', seeded: true }), playerBase(), {
    names: sim.ECHELONS,
    week: 0,
    phase: 0,
    done: false,
    current: [0, 0, 0, 0, 0],
    ratios: [],
    table: [],
    bound: 0,
    recompute() {
      res = sim.simulate(this.params, this.seed);
      this.ratios = res.ratio;
      this.table = res.table;
      this.bound = res.boundStage;
      this.setupPlayer(this.params.sem, 4);
      this.frame(0);
    },
    frame(t) {
      const w = Math.floor(t + 1e-9);
      this.week = w;
      this.phase = this.state === 'running' ? t - w : 0;
      this.done = w >= this.params.sem;
      const i = Math.max(0, Math.min(w, this.params.sem) - 1);
      this.current = [res.demand[i], ...res.orders.map((o) => o[i])];
      if (ordersChart) {
        const d = ordersChart.data.datasets;
        const series = [res.demand, ...res.orders];
        series.forEach((s, k) => { d[k].data = s.slice(0, w).map((y, x) => ({ x: x + 1, y })); });
        ordersChart.options.scales.x.max = this.params.sem;
        ordersChart.options.scales.y.suggestedMax = Math.max(...res.orders.flat(), ...res.demand) * 1.05;
        ordersChart.update('none');
      }
      if (ratioChart) {
        ratioChart.data.datasets[0].data = this.done ? res.ratio : [0, 0, 0, 0];
        ratioChart.update('none');
      }
    },
    dots(dir) {
      // dir = 'product' (hacia el cliente) u 'order' (hacia la fábrica)
      return SEGS.map(([a, b], k) => ({ k, x: dir === 'product' ? b - this.phase * (b - a) : a + this.phase * (b - a) }));
    },
    buildCharts() {
      if (!res) return;
      const t = theme();
      const colors = [t.c4, ...t.seq];
      if (this.$refs.orders) ordersChart = makeChart(this.$refs.orders, {
        type: 'line',
        data: { datasets: ['Cliente', ...sim.ECHELONS].map((n, k) => line(n, [], colors[k], k === 0 ? { borderDash: [4, 4], borderWidth: 2 } : {})) },
        options: { scales: axes({ x: { title: 'Semana', min: 1, max: this.params.sem }, y: { title: 'Unidades pedidas', beginAtZero: true } }) },
      });
      if (this.$refs.ratio) ratioChart = makeChart(this.$refs.ratio, {
        type: 'bar',
        data: { labels: sim.ECHELONS, datasets: [{ label: 'Var. pedidos / Var. demanda', data: [], backgroundColor: t.seq, borderRadius: 4 }] },
        options: {
          indexAxis: 'y',
          scales: {
            x: { type: 'logarithmic', min: 0.5, title: { display: true, text: 'Razón de varianzas (escala logarítmica)', color: t.muted }, grid: { color: t.grid }, ticks: { color: t.muted } },
            y: { grid: { display: false }, ticks: { color: t.ink, font: { weight: 600 } } },
          },
          plugins: { tooltip: { callbacks: { label: (c) => `×${c.parsed.x.toFixed(2)}` } } },
        },
      });
      this.frame(this.t);
    },
    destroyCharts() { ordersChart?.destroy(); ratioChart?.destroy(); ordersChart = ratioChart = null; },
    get dayLabel() { return `Semana ${this.week} de ${this.params.sem}`; },
    get ariaOrders() {
      if (!res) return '';
      return `Pedidos semanales de cada eslabón durante ${this.params.sem} semanas con semilla ${this.seed}. La variabilidad crece hacia la fábrica: razón de varianzas ${res.ratio.map((r, k) => `${sim.ECHELONS[k]} ${r.toFixed(1)}`).join(', ')}.`;
    },
    get ariaRatio() {
      if (!res) return '';
      return this.done ? `Razón de varianzas: ${res.ratio.map((r, k) => `${sim.ECHELONS[k]} ${r.toFixed(1)}`).join(', ')}. 1 significa sin amplificación.` : 'Las razones de varianza se muestran al terminar la corrida.';
    },
  });
};
