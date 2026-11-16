// Piezas comunes de los componentes Alpine de cada simulación.
import { parseHash, parseQuery, toQuery, validate } from '../lib/params.js';
import { toSeed } from '../lib/prng.js';
import { getLast, setLast } from '../lib/storage.js';
import { createPlayer, STATE_LABELS } from '../lib/player.js';
import * as f from '../lib/format.js';

/** Combina objetos conservando getters (Alpine los usa como propiedades calculadas). */
export function mix(...objs) {
  const out = {};
  for (const o of objs) Object.defineProperties(out, Object.getOwnPropertyDescriptors(o));
  return out;
}

/**
 * Base para cualquier simulación: parámetros sincronizados con la URL y escenarios.
 * Cada vista implementa recompute() y, si tiene gráficas, buildCharts()/destroyCharts().
 */
export function simBase({ sim, slug, seeded = false }) {
  let listeners = [];
  return {
    slug,
    schema: sim.schema,
    params: { ...sim.defaults },
    adjusted: [],
    f,

    init() {
      const { query } = parseHash(location.hash);
      const q = query || getLast(slug) || '';
      const { params, adjusted, seed } = parseQuery(sim.schema, q);
      this.params = params;
      this.adjusted = query ? adjusted : [];
      if (seeded && seed !== null) this.$store.app.seed = toSeed(seed);
      this.$store.app.current = { slug, title: sim.meta.title, seeded };
      this.setup?.();
      this.recompute();
      this.syncUrl();
      const on = (ev, fn) => { window.addEventListener(ev, fn); listeners.push([ev, fn]); };
      on('seed-changed', () => { if (seeded) { this.recompute(); this.syncUrl(); this.afterSeed?.(); } });
      on('theme-changed', () => { this.destroyCharts?.(); this.$nextTick(() => this.buildCharts?.()); });
      on('scenario-request', () => this.$store.app.saveScenario({ slug, title: sim.meta.title, query: this.query }));
      this.$nextTick(() => this.buildCharts?.());
    },
    destroy() {
      listeners.forEach(([ev, fn]) => window.removeEventListener(ev, fn));
      listeners = [];
      this.destroyCharts?.();
      this.teardown?.();
    },
    get seed() { return this.$store.app.seed; },
    get query() { return toQuery(sim.schema, this.params, seeded ? this.seed : undefined); },
    syncUrl() {
      const q = this.query;
      const url = `#/${slug}?${q}`;
      if (location.hash !== url) history.replaceState(null, '', url);
      setLast(slug, q);
      this.$store.app.route = url;
    },
    /**
     * Llamado por @input/@change del formulario. Los sliders se procesan en `input`;
     * checkbox, radio y select en `change` (después de que x-model actualiza el valor).
     */
    onParams(ev) {
      const el = ev?.target;
      if (el && ev.type === 'input' && (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT')) return;
      if (el && ev.type === 'change' && el.type === 'range') return;
      this.params = validate(sim.schema, this.params);
      this.adjusted = [];
      this.recompute();
      this.syncUrl();
    },
    resetParams() {
      this.params = { ...sim.defaults };
      this.onParams();
    },
  };
}

/** Base para simulaciones con reproductor. */
export function playerBase() {
  let player = null;
  return {
    state: 'idle',
    t: 0,
    speed: 1,
    setupPlayer(length, rate) {
      player?.destroy();
      player = createPlayer({
        length, rate,
        onFrame: (t) => { this.t = t; this.frame(t); },
        onState: (s) => { this.state = s; },
      });
      player.setSpeed(this.speed);
      this.t = 0; this.state = 'idle';
    },
    get player() { return player; },
    toggle() { player?.toggle(); },
    stepOnce() { player?.step(1); },
    restart() { player?.reset(); },
    setSpeed() { player?.setSpeed(Number(this.speed)); },
    teardown() { player?.destroy(); },
    get stateLabel() { return STATE_LABELS[this.state]; },
    get playLabel() { return { idle: 'Iniciar', running: 'Pausar', paused: 'Reanudar', done: 'Repetir' }[this.state]; },
    get progress() { return player ? `${Math.round((this.t / player.length) * 100)}%` : '0%'; },
    get started() { return this.state !== 'idle'; },
    get finished() { return this.state === 'done'; },
  };
}
