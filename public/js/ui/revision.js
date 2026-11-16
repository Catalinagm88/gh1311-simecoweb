import * as sim from '../sims/revision.js';
import { mix, simBase, playerBase } from './common.js';
import { makeChart, axes, theme, line } from '../lib/charts.js';

export default () => {
  let cChart = null, pChart = null;
  let res = null;
  return mix(simBase({ sim, slug: 'revision', seeded: true }), playerBase(), {
    th: null,
    done: false,
    recompute() {
      res = sim.simulate(this.params, this.seed);
      this.th = { s: res.s, S: res.S, z: res.z, ssC: res.ssC, ssP: res.ssP };
      this.setupPlayer(this.params.dias, 12);
      this.frame(0);
    },
    frame(t) {
      const day = Math.floor(t + 1e-9);
      this.done = day >= this.params.dias;
      const yMax = Math.max(...res.continuous.inventory, ...res.periodic.inventory) * 1.08;
      const upd = (chart, run, level) => {
        if (!chart) return;
        const d = chart.data.datasets;
        d[0].data = run.inventory.slice(0, day + 1).map((y, x) => ({ x, y }));
        d[1].data = [{ x: 0, y: level }, { x: this.params.dias, y: level }];
        chart.options.scales.x.max = this.params.dias;
        chart.options.scales.y.max = yMax;
        chart.update('none');
      };
      upd(cChart, res.continuous, res.s);
      upd(pChart, res.periodic, res.S);
    },
    makeOne(canvas, color, levelLabel, withReviews) {
      const t = theme();
      const plugins = withReviews ? [{
        id: 'reviews',
        beforeDatasetsDraw: (chart) => {
          const { ctx, chartArea: a, scales: { x } } = chart;
          ctx.save(); ctx.strokeStyle = t.line; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
          for (const day of res.periodic.reviewDays) { const px = x.getPixelForValue(day); ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke(); }
          ctx.restore();
        },
      }] : [];
      return makeChart(canvas, {
        type: 'line',
        data: { datasets: [line('Inventario', [], color), line(levelLabel, [], t.warn, { borderDash: [6, 4], borderWidth: 1.5 })] },
        options: { scales: axes({ x: { title: 'Día', min: 0, max: this.params.dias }, y: { title: 'Unidades', min: 0 } }) },
        plugins,
      });
    },
    buildCharts() {
      if (!res) return;
      const t = theme();
      if (this.$refs.cont) cChart = this.makeOne(this.$refs.cont, t.c1, 'Punto de reorden s', false);
      if (this.$refs.per) pChart = this.makeOne(this.$refs.per, t.c2, 'Nivel objetivo S', true);
      this.frame(this.t);
    },
    destroyCharts() { cChart?.destroy(); pChart?.destroy(); cChart = pChart = null; },
    get rows() {
      if (!res) return [];
      const c = res.continuous.summary, p = res.periodic.summary, f = this.f;
      const better = (a, b, lower = true) => (a === b ? [false, false] : lower ? [a < b, b < a] : [a > b, b > a]);
      const row = (label, a, b, fmt, lower = true, compare = true) => {
        const [wa, wb] = compare ? better(a, b, lower) : [false, false];
        return { label, a: fmt(a), b: fmt(b), wa, wb };
      };
      return [
        row('Inventario de seguridad', c.SS, p.SS, (x) => f.num(x, 1)),
        row('Inventario promedio', c.avgInventory, p.avgInventory, (x) => f.num(x, 1)),
        row('Pedidos colocados', c.orders, p.orders, (x) => String(x), true, false),
        { label: 'Tamaño del pedido', a: `${f.int(c.minOrder)} fijo`, b: `${f.int(p.minOrder)}–${f.int(p.maxOrder)} variable`, wa: false, wb: false },
        row('Unidades faltantes', c.lost, p.lost, (x) => f.int(x)),
        row('Tasa de surtido', c.fillRate, p.fillRate, (x) => f.pct(x, 1), false),
        row('Revisiones necesarias', c.reviews, p.reviews, (x) => f.int(x)),
      ];
    },
    get dayLabel() { return `Día ${Math.floor(this.t)} de ${this.params.dias}`; },
    get ariaCont() { return res ? `Revisión continua: pedidos fijos de ${this.params.Q} unidades cuando la posición cae a ${this.f.num(res.s, 1)}. ${res.continuous.summary.orders} pedidos, ${res.continuous.summary.lost} unidades faltantes.` : ''; },
    get ariaPer() { return res ? `Revisión periódica cada ${this.params.R} días hasta ${this.f.num(res.S, 1)}. ${res.periodic.summary.orders} pedidos, ${res.periodic.summary.lost} unidades faltantes.` : ''; },
  });
};
