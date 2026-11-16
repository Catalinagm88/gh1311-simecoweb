// Reproductor de series precalculadas: idle → running ⇄ paused → done.
// El avance usa requestAnimationFrame; con prefers-reduced-motion la corrida se muestra completa.

export function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * @param {object} o
 * @param {number} o.length       último instante (en unidades de la serie)
 * @param {number} o.rate         unidades por segundo a velocidad 1×
 * @param {(t:number)=>void} o.onFrame
 * @param {(state:string)=>void} o.onState
 */
export function createPlayer({ length, rate, onFrame, onState }) {
  let t = 0, state = 'idle', speed = 1, raf = 0, last = null;
  const set = (s) => { state = s; onState(s); };

  function loop(ts) {
    if (state !== 'running') return;
    if (last === null) last = ts;
    const dt = Math.min(0.25, (ts - last) / 1000);
    last = ts;
    t = Math.min(length, t + dt * rate * speed);
    onFrame(t);
    if (t >= length) { set('done'); return; }
    raf = requestAnimationFrame(loop);
  }

  const api = {
    get t() { return t; },
    get state() { return state; },
    get length() { return length; },
    setSpeed(s) { speed = s; },
    play() {
      if (state === 'done') { t = 0; }
      if (prefersReducedMotion()) { t = length; onFrame(t); set('done'); return; }
      set('running'); last = null; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    },
    pause() { if (state === 'running') { cancelAnimationFrame(raf); set('paused'); } },
    toggle() { state === 'running' ? api.pause() : api.play(); },
    step(n = 1) {
      cancelAnimationFrame(raf);
      t = Math.min(length, Math.floor(t + 1e-9) + n);
      onFrame(t);
      set(t >= length ? 'done' : 'paused');
    },
    reset(newLength) {
      cancelAnimationFrame(raf);
      if (newLength !== undefined) length = newLength;
      t = 0; onFrame(0); set('idle');
    },
    destroy() { cancelAnimationFrame(raf); },
  };
  return api;
}

export const STATE_LABELS = { idle: 'Reiniciada', running: 'Corriendo', paused: 'En pausa', done: 'Terminada' };
