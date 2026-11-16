import * as sim from '../sims/colas.js';
import { mix, simBase, playerBase } from './common.js';
import { makeChart, axes, theme, line } from '../lib/charts.js';

const MAX_SHOWN = 12;

export default () => {
  let qChart = null, rhoChart = null;
  let res = null, run = null;
  return mix(simBase({ sim, slug: 'colas', seeded: true }), playerBase(), {
    out: null,
    speed: 10,
    nq: 0, ns: 0, served: 0,
    observed: null,
    stations: ['A · Recepción', 'B · Revisión', 'C · Entrega', 'D · Estación 4', 'E · Estación 5'],
    get isSerie() { return this.params.modelo === 'serie'; },
    get cEff() { return this.params.modelo === 'mm1' ? 1 : this.params.c; },
    recompute() {
      res = sim.compute(this.params);
      this.out = res;
      run = sim.simulate(this.params, this.seed);
      this.setupPlayer(this.params.horas * 60, 1);
      this.frame(0);
      this.updateRho();
      // Al cambiar entre M/M/c y línea en serie, x-if recrea los canvas: reconstruir gráficas.
      this.$nextTick(() => {
        const stale = (c) => c && !c.canvas?.isConnected;
        if (!this.isSerie && (!qChart || stale(qChart) || stale(rhoChart))) { this.destroyCharts(); this.buildCharts(); }
      });
    },
    frame(tMin) {
      if (!run) return;
      const th = tMin / 60;
      const st = sim.stateAt(run.steps, th);
      this.nq = st.nq; this.ns = st.ns;
      this.served = sim.servedBy(run.departures, th);
      this.observed = tMin >= this.params.horas * 60 - 1e-9 ? run.summary : null;
      if (qChart) {
        const pts = [];
        for (const s of run.steps) { if (s.t > th) break; pts.push({ x: s.t, y: s.nq }); }
        if (this.started) pts.push({ x: th, y: st.nq });
        qChart.data.datasets[0].data = this.started ? pts : [];
        qChart.data.datasets[1].data = res.stable ? [{ x: 0, y: res.Lq }, { x: this.params.horas, y: res.Lq }] : [];
        qChart.options.scales.x.max = this.params.horas;
        qChart.options.scales.y.suggestedMax = Math.max(4, ...run.steps.map((s) => s.nq)) + 1;
        qChart.update('none');
      }
    },
    updateRho() {
      if (!rhoChart) return;
      const t = theme();
      const pt = res.stable && res.rho <= 0.95 ? [{ x: res.rho, y: res.L }] : [];
      rhoChart.data.datasets[1].data = pt;
      rhoChart.data.datasets[1].pointBackgroundColor = t.accent2;
      rhoChart.update('none');
    },
    buildCharts() {
      if (!res) return;
      const t = theme();
      if (this.$refs.q) qChart = makeChart(this.$refs.q, {
        type: 'line',
        data: { datasets: [line('Clientes en la fila', [], t.c1, { stepped: 'before' }), line('Lq teórico', [], t.accent2, { borderDash: [6, 4], borderWidth: 1.5 })] },
        options: { scales: axes({ x: { title: 'Hora', min: 0, max: this.params.horas }, y: { title: 'Clientes en la fila', beginAtZero: true, ticks: { precision: 0 } } }) },
      });
      if (this.$refs.rho) rhoChart = makeChart(this.$refs.rho, {
        type: 'line',
        data: {
          datasets: [
            line('L teórico M/M/1', res.curve, t.c1, { borderWidth: 3 }),
            { label: 'Sistema actual', type: 'scatter', data: [], pointRadius: 8, pointBackgroundColor: t.accent2, pointBorderColor: t.surface, pointBorderWidth: 2 },
          ],
        },
        options: { scales: axes({ x: { title: 'Utilización ρ = λ / (cμ)', min: 0, max: 1 }, y: { title: 'Clientes en el sistema L', min: 0, max: 20 } }) },
      });
      this.frame(this.t);
      this.updateRho();
    },
    destroyCharts() { qChart?.destroy(); rhoChart?.destroy(); qChart = rhoChart = null; },
    // Animación (elementos SVG fijos que se muestran/ocultan)
    showQ(i) { return this.nq > i; },
    busy(i) { return this.ns > i; },
    get extraQ() { return Math.max(0, this.nq - MAX_SHOWN); },
    get clock() { return this.f.clock(this.t / 60); },
    get dayLabel() { return `Reloj ${this.f.clock(this.t / 60)} de ${this.f.clock(this.params.horas)}`; },
    get verdict() {
      const o = this.out; if (!o || !o.best) return null;
      const cur = o.costs[this.cEff - 1];
      if (o.best.c === this.cEff) return { ok: true, text: `Con ${this.cEff} servidor${this.cEff > 1 ? 'es' : ''} el costo total ya es el mínimo: ${this.f.money(cur.cost)}/h.` };
      const next = o.costs[o.best.c];
      return {
        ok: true,
        text: `Con ${o.best.c} servidores el costo baja a ${this.f.money(o.best.cost)}/h (L = ${this.f.num(o.best.L, 2)}, Wq = ${this.f.num(o.best.Wq * 60, 1)} min).` + (next && next.stable ? ` Uno más ya no compensa: ${this.f.money(next.cost)}/h.` : ''),
      };
    },
    get ariaAnim() { return `Animación de la cola: ${this.nq} clientes esperan y ${this.ns} de ${this.cEff} servidores están ocupados. Atendidos: ${this.served}. Reloj ${this.clock}.`; },
    get ariaQ() { return run ? `Longitud de la fila simulada durante ${this.params.horas} horas con semilla ${this.seed}; máximo ${Math.max(...run.steps.map((s) => s.nq))} clientes; promedio observado ${this.f.num(run.summary.Lq, 2)}${res.stable ? ` frente a ${this.f.num(res.Lq, 2)} teórico` : ''}.` : ''; },
    get ariaRho() { return res ? (res.stable ? `Curva de clientes en el sistema contra utilización. Con ρ = ${this.f.num(res.rho, 2)}, L = ${this.f.num(res.L, 2)}.` : 'Sistema inestable: ρ mayor o igual a 1.') : ''; },
  });
};
