import * as sim from '../sims/interes.js';
import { mix, simBase } from './common.js';
import { makeChart, axes, theme, line } from '../lib/charts.js';

export default () => {
  let chart = null;
  let res = null;
  return mix(simBase({ sim, slug: 'interes' }), {
    out: null,
    mOptions: [1, 2, 4, 12, 365, 'inf'],
    mLabels: sim.M_LABELS,
    recompute() {
      res = sim.compute(this.params);
      this.out = res;
      this.updateCharts();
    },
    datasets() {
      const t = theme();
      const s = res.series;
      const xy = (arr) => arr.map((y, i) => ({ x: s.years[i], y }));
      return [
        line('A · compuesto', xy(s.compound), t.c1, { borderWidth: 3, pointRadius: 2 }),
        line('B · compuesto', xy(s.optionB), t.c2, { borderDash: [8, 5] }),
        line('A · interés simple', xy(s.simple), t.c4, { borderDash: [2, 5], borderCapStyle: 'round' }),
      ];
    },
    buildCharts() {
      if (!this.$refs.chart || !res) return;
      chart = makeChart(this.$refs.chart, {
        type: 'line',
        data: { datasets: this.datasets() },
        options: { scales: axes({ x: { title: 'Años', min: 0, max: this.params.t, ticks: { stepSize: 1 } }, y: { title: 'Saldo ($)', beginAtZero: true } }) },
      });
    },
    updateCharts() {
      if (!chart) return;
      chart.data.datasets = this.datasets();
      chart.options.scales.x.max = this.params.t;
      chart.update('none');
    },
    destroyCharts() { chart?.destroy(); chart = null; },
    get tableRows() {
      if (!this.out) return [];
      const s = this.out.series, n = s.years.length - 1;
      const idx = [...new Set([0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n])];
      return idx.map((i) => ({ y: s.years[i], simple: s.simple[i], a: s.compound[i], b: s.optionB[i] }));
    },
    get ariaChart() {
      const o = this.out; if (!o) return '';
      const f = this.f;
      return `Crecimiento del capital en ${this.params.t} años. Opción A llega a ${f.money(o.FV, 0)}, opción B a ${f.money(o.FVB, 0)} e interés simple a ${f.money(o.simple, 0)}.`;
    },
  });
};
