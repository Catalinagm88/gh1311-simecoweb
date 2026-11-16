import * as sim from '../sims/punto-reorden.js';
import { mix, simBase, playerBase } from './common.js';
import { makeChart, axes, theme, line } from '../lib/charts.js';

export default () => {
  let chart = null;
  let res = null;
  return mix(simBase({ sim, slug: 'punto-reorden', seeded: true }), playerBase(), {
    th: null,
    summary: null,
    cyclesShown: [],
    recompute() {
      res = sim.simulate(this.params, this.seed);
      this.th = { SS: res.SS, ROP: res.ROP, z: res.z };
      this.setupPlayer(this.params.dias, 12);
      this.frame(0);
    },
    frame(t) {
      const day = Math.floor(t + 1e-9);
      this.summary = day >= this.params.dias ? res.summary : null;
      this.cyclesShown = res.cycles.filter((c) => c.arrival <= day);
      if (!chart) return;
      const d = chart.data.datasets;
      d[0].data = res.series.inventory.slice(0, day + 1).map((y, x) => ({ x, y }));
      d[3].data = this.started ? res.orders.filter((o) => o.day <= day).map((o) => ({ x: o.day, y: res.ROP })) : [];
      d[4].data = this.started ? res.stockoutDays.filter((s) => s <= day).map((s) => ({ x: s, y: 0 })) : [];
      d[1].data = [{ x: 0, y: res.ROP }, { x: this.params.dias, y: res.ROP }];
      d[2].data = [{ x: 0, y: res.SS }, { x: this.params.dias, y: res.SS }];
      chart.options.scales.x.max = this.params.dias;
      chart.options.scales.y.suggestedMax = Math.max(...res.series.inventory) * 1.05;
      chart.update('none');
    },
    afterSeed() {},
    buildCharts() {
      if (!this.$refs.chart || !res) return;
      const t = theme();
      chart = makeChart(this.$refs.chart, {
        type: 'line',
        data: {
          datasets: [
            line('Inventario disponible', [], t.c1),
            line('Punto de reorden', [], t.warn, { borderDash: [6, 4], borderWidth: 1.5 }),
            line('Inventario de seguridad', [], t.c3, { borderDash: [2, 4], borderWidth: 1.5 }),
            { label: 'Pedido colocado', type: 'scatter', data: [], pointStyle: 'triangle', rotation: 180, pointRadius: 7, pointBackgroundColor: t.ink, pointBorderColor: t.ink },
            { label: 'Día con faltante', type: 'scatter', data: [], pointStyle: 'crossRot', pointRadius: 7, borderWidth: 2.5, pointBorderColor: t.accent2, pointBackgroundColor: t.accent2 },
          ],
        },
        options: { scales: axes({ x: { title: 'Día', min: 0, max: this.params.dias }, y: { title: 'Unidades en inventario', beginAtZero: true } }) },
      });
      this.frame(this.t);
    },
    destroyCharts() { chart?.destroy(); chart = null; },
    get ariaChart() {
      if (!res) return '';
      const s = res.summary, f = this.f;
      return `Inventario diario durante ${this.params.dias} días con demanda aleatoria (semilla ${this.seed}). Se colocan ${res.orders.length} pedidos al cruzar el punto de reorden de ${f.num(res.ROP, 1)}. ${s.stockoutCycles} ciclos con faltante; tasa de surtido ${f.pct(s.fillRate, 1)}.`;
    },
    get dayLabel() { return `Día ${Math.floor(this.t)} de ${this.params.dias}`; },
  });
};
