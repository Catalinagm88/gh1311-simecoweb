import * as sim from '../sims/eoq.js';
import { mix, simBase } from './common.js';
import { makeChart, axes, theme, line } from '../lib/charts.js';

export default () => {
  let costChart = null, sawChart = null;
  let res = null;
  return mix(simBase({ sim, slug: 'eoq' }), {
    out: null,
    recompute() {
      res = sim.compute(this.params);
      this.out = res;
      this.updateCharts();
    },
    costData() {
      const t = theme();
      const c = res.costCurve;
      return [
        line('Costo total', c.map((r) => ({ x: r.Q, y: r.total })), t.c1, { borderWidth: 3.5 }),
        line('Costo de ordenar', c.map((r) => ({ x: r.Q, y: r.ordering })), t.c2),
        line('Costo de mantener', c.map((r) => ({ x: r.Q, y: r.holding })), t.c3, { borderDash: [7, 5] }),
        { label: 'Q* óptimo', type: 'scatter', data: [{ x: res.Qs, y: res.TC }], pointRadius: 7, pointBackgroundColor: t.ink, pointBorderColor: t.surface, pointBorderWidth: 2 },
        { label: 'Lote actual', type: 'scatter', data: [{ x: res.current.Q, y: res.current.total }], pointRadius: 6, pointBackgroundColor: t.surface, pointBorderColor: t.warn, pointBorderWidth: 2.5 },
      ];
    },
    sawData() {
      const t = theme();
      const dias = this.params.dias;
      return [
        line('Inventario', res.sawtooth, t.c1),
        line('Q*/2 (inventario promedio)', [{ x: 0, y: res.Qs / 2 }, { x: dias, y: res.Qs / 2 }], t.c3, { borderDash: [2, 4], borderWidth: 1.5 }),
        line('Punto de reorden', [{ x: 0, y: res.ROP }, { x: dias, y: res.ROP }], t.warn, { borderDash: [5, 4], borderWidth: 1.5 }),
      ];
    },
    buildCharts() {
      if (!res) return;
      if (this.$refs.cost) costChart = makeChart(this.$refs.cost, {
        type: 'line', data: { datasets: this.costData() },
        options: { scales: axes({ x: { title: 'Tamaño de lote Q (unidades)' }, y: { title: 'Costo anual ($)', beginAtZero: true } }) },
      });
      if (this.$refs.saw) sawChart = makeChart(this.$refs.saw, {
        type: 'line', data: { datasets: this.sawData() },
        options: { scales: axes({ x: { title: 'Días', min: 0, max: this.params.dias }, y: { title: 'Unidades', min: 0 } }) },
      });
    },
    updateCharts() {
      if (costChart) { costChart.data.datasets = this.costData(); costChart.update('none'); }
      if (sawChart) { sawChart.data.datasets = this.sawData(); sawChart.options.scales.x.max = this.params.dias; sawChart.update('none'); }
    },
    destroyCharts() { costChart?.destroy(); sawChart?.destroy(); costChart = sawChart = null; },
    useOptimal() { this.params.Q = Math.round(res.Qs / 10) * 10; this.onParams(); },
    get ariaCost() {
      const o = this.out; if (!o) return '';
      const f = this.f;
      return `Costos anuales según el tamaño de lote. El costo total es mínimo, ${f.money(o.TC)}, en Q igual a ${f.num(o.Qs, 1)} unidades. El lote actual de ${o.current.Q} cuesta ${f.money(o.current.total)}.`;
    },
    get ariaSaw() {
      const o = this.out; if (!o) return '';
      return `Diente de sierra: el inventario parte de ${this.f.num(o.Qs, 1)} unidades y se agota cada ${this.f.num(o.T, 1)} días; ${this.f.num(o.N, 2)} pedidos al año.`;
    },
  });
};
