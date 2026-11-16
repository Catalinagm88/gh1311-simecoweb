import * as sim from '../sims/oferta-demanda.js';
import { mix, simBase } from './common.js';
import { makeChart, axes, theme, line } from '../lib/charts.js';

export default () => {
  let chart = null;
  let res = null;
  return mix(simBase({ sim, slug: 'oferta-demanda' }), {
    out: null,
    recompute() {
      res = sim.compute(this.params);
      this.out = res;
      this.updateCharts();
    },
    shockDemand() { this.params.a = Math.min(200, Math.round(this.params.a * 1.2)); this.onParams(); },
    shockCost() { this.params.c = Math.max(-50, Math.round(this.params.c - 0.15 * this.params.d * res.Pc)); this.onParams(); },
    datasets() {
      const t = theme();
      const p = this.params;
      const sellerSupply = [];
      const xStart = Math.max(0, p.c);
      sellerSupply.push({ x: 0, y: 0 }, { x: xStart, y: 0 }, { x: res.Q, y: Math.max(0, res.Pv) });
      const ds = [
        line('Excedente del consumidor', res.curves.demand.filter((pt) => pt.x <= res.Q + 1e-9).concat([{ x: res.Q, y: res.Pc }]).sort((a, b) => a.x - b.x),
          'transparent', { fill: { value: res.Pc }, backgroundColor: t.fill1, borderWidth: 0 }),
        line('Excedente del productor', sellerSupply, 'transparent', { fill: { value: Math.max(0, res.Pv) }, backgroundColor: t.fill2, borderWidth: 0 }),
        line('Demanda', res.curves.demand.slice().sort((a, b) => a.x - b.x), t.c1, { borderWidth: 3 }),
        line('Oferta', res.curves.supply.slice().sort((a, b) => a.x - b.x), t.c2, { borderWidth: 3 }),
        line('Equilibrio', [{ x: 0, y: res.Pc }, { x: res.Q, y: res.Pc }, { x: res.Q, y: 0 }], t.ink, { borderDash: [4, 4], borderWidth: 1.5 }),
        { label: 'Punto de equilibrio', data: [{ x: res.Q, y: res.Pc }], type: 'scatter', pointRadius: 7, pointBackgroundColor: t.ink, pointBorderColor: t.surface, pointBorderWidth: 2 },
      ];
      if (p.t > 0) {
        const orig = [];
        for (let i = 0; i <= 20; i++) { const P = (res.choke * 1.2 * i) / 20; const s = p.c + p.d * P; if (s >= 0) orig.push({ x: s, y: P }); }
        ds.push(line('Oferta sin impuesto', orig, t.c4, { borderDash: [6, 5], borderWidth: 2 }));
      }
      if (res.ceiling.active) ds.push(line('Precio máximo', [{ x: 0, y: p.pmax }, { x: p.a, y: p.pmax }], t.warn, { borderDash: [8, 4], borderWidth: 2 }));
      return ds;
    },
    buildCharts() {
      if (!this.$refs.chart || !res) return;
      chart = makeChart(this.$refs.chart, {
        type: 'line',
        data: { datasets: this.datasets() },
        options: {
          scales: axes({ x: { title: 'Cantidad (unidades)', min: 0, max: Math.max(this.params.a, 10) }, y: { title: 'Precio ($)', min: 0, max: Math.max(res.choke, 1) * 1.05 } }),
          plugins: { tooltip: { filter: (i) => !i.dataset.label.startsWith('Excedente') } },
        },
      });
    },
    updateCharts() {
      if (!chart) return;
      chart.data.datasets = this.datasets();
      chart.options.scales.x.max = Math.max(this.params.a, 10);
      chart.options.scales.y.max = Math.max(res.choke, 1) * 1.05;
      chart.update('none');
    },
    destroyCharts() { chart?.destroy(); chart = null; },
    get ariaChart() {
      const o = this.out; if (!o) return '';
      const f = this.f;
      return `Curvas de oferta y demanda. Se cruzan en precio ${f.money(o.Pc)} y cantidad ${f.num(o.Q, 1)} unidades. Excedente del consumidor ${f.money(o.CS)}, del productor ${f.money(o.PS)}.`;
    },
  });
};
