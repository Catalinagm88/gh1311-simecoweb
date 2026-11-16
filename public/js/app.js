// SimulacionEcoWeb · arranque: Alpine, router por hash, escenarios, tema y fórmulas KaTeX.
import Alpine from '../vendor/alpinejs-3.17.5/module.esm.min.js';
import { parseHash } from './lib/params.js';
import { toSeed } from './lib/prng.js';
import { getScenarios, saveScenario, deleteScenario, getPref, setPref } from './lib/storage.js';
import { ROUTES, findRoute } from './routes.js';
import { registerViews } from './ui/index.js';

const APP_NAME = 'SimulacionEcoWeb';

// Tema guardado (claro/oscuro/sistema)
const savedTheme = getPref('theme', 'system');
if (savedTheme !== 'system') document.documentElement.dataset.theme = savedTheme;

Alpine.store('app', {
  seed: 42,
  route: location.hash || '#/',
  current: null,
  slugNow: '',
  toast: '',
  scenarios: [],
  theme: savedTheme,
  _toastTimer: 0,
  notify(msg) {
    this.toast = msg;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toast = ''; }, 2600);
  },
  saveScenario({ slug, title, query }) {
    const name = `${title} · ${new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}`;
    const list = saveScenario({ slug, title, name, hash: `#/${slug}?${query}`, date: new Date().toISOString() });
    this.scenarios = list || getScenarios();
    this.notify(list ? 'Escenario guardado en este navegador' : 'No se pudo guardar: el almacenamiento está bloqueado');
  },
});

Alpine.data('shell', () => ({
  routes: ROUTES,
  get store() { return this.$store.app; },
  isActive(r) { return (this.$store.app.slugNow ?? '') === r.slug; },
  openMenu() { this.$refs.menu.showModal(); },
  closeMenu() { this.$refs.menu.close(); },
  seedChanged() {
    const s = toSeed(this.$store.app.seed);
    this.$store.app.seed = s;
    window.dispatchEvent(new CustomEvent('seed-changed', { detail: s }));
  },
  requestSave() {
    if (!this.$store.app.current) { this.$store.app.notify('Abre una simulación para guardar su escenario'); return; }
    window.dispatchEvent(new CustomEvent('scenario-request'));
  },
  async copyLink() {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      this.$store.app.notify('Enlace copiado');
    } catch {
      window.prompt('Copia este enlace:', url);
    }
  },
  openScenarios() {
    this.$store.app.scenarios = getScenarios();
    this.$refs.scen.showModal();
  },
  removeScenario(id) { this.$store.app.scenarios = deleteScenario(id); },
  cycleTheme() {
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(this.$store.app.theme) + 1) % order.length];
    this.$store.app.theme = next;
    setPref('theme', next);
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    window.dispatchEvent(new CustomEvent('theme-changed'));
  },
  get themeLabel() { return { system: 'Tema: sistema', light: 'Tema: claro', dark: 'Tema: oscuro' }[this.$store.app.theme]; },
}));

registerViews(Alpine);
window.Alpine = Alpine;
Alpine.start();

// ── Router ────────────────────────────────────────────────
const viewEl = document.getElementById('view');
const cache = new Map();
let currentSlug;

async function loadView(name) {
  if (!cache.has(name)) {
    const res = await fetch(`views/${name}.html`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`No se pudo cargar la vista ${name}`);
    cache.set(name, await res.text());
  }
  return cache.get(name);
}

export function renderTex(root) {
  if (!window.katex) return;
  root.querySelectorAll('[data-tex]').forEach((el) => {
    window.katex.render(el.dataset.tex, el, { output: 'htmlAndMathml', throwOnError: false, displayMode: false });
  });
}

async function route() {
  const { slug, query } = parseHash(location.hash);
  const r = findRoute(slug);
  const store = Alpine.store('app');
  // Semilla de la URL (aplica a cualquier vista)
  const seed = new URLSearchParams(query).get('seed');
  if (seed !== null) store.seed = toSeed(seed);
  if (r.slug === currentSlug && r.slug !== null) return; // solo cambió la query desde esta misma vista
  currentSlug = r.slug;
  store.slugNow = r.slug;
  store.current = null;
  store.route = r.slug === null ? location.hash : (location.hash || '#/');
  try {
    const html = await loadView(r.view);
    if (currentSlug !== r.slug) return; // otra navegación ganó
    viewEl.innerHTML = html;
    renderTex(viewEl);
  } catch (e) {
    viewEl.innerHTML = `<div class="view"><h1 tabindex="-1">Error</h1><p class="lede">${e.message}. Revisa tu conexión y recarga la página.</p></div>`;
  }
  document.title = r.slug ? `${r.title} · ${APP_NAME}` : r.view === 'home' ? `${APP_NAME} · Simulaciones económicas` : `${r.title} · ${APP_NAME}`;
  window.scrollTo(0, 0);
  const h1 = viewEl.querySelector('h1');
  if (h1 && document.readyState === 'complete' && route.navigated) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  route.navigated = true;
}

window.addEventListener('hashchange', route);
route();
