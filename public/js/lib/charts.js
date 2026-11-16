// Fábrica de gráficas Chart.js (build UMD cargado como window.Chart) con los tokens de diseño.

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function theme() {
  const v = (n) => cssVar(n);
  return {
    ink: v('--ink'), muted: v('--muted'), grid: v('--grid'), line: v('--line'), surface: v('--surface'),
    c1: v('--c1'), c2: v('--c2'), c3: v('--c3'), c4: v('--c4'),
    seq: [v('--seq-1'), v('--seq-2'), v('--seq-3'), v('--seq-4')],
    fill1: v('--fill-1'), fill2: v('--fill-2'),
    warn: v('--warn-ink'), accent2: v('--accent-2'),
  };
}

const fmtTick = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

/** Ejes lineales con título; opts: {x:{title,min,max,...}, y:{...}} */
export function axes(opts = {}) {
  const t = theme();
  const make = (o = {}) => ({
    type: 'linear',
    grid: { color: t.grid },
    border: { color: t.muted },
    ticks: { color: t.muted, callback: (v) => fmtTick.format(v), maxTicksLimit: 8 },
    title: o.title ? { display: true, text: o.title, color: t.muted, font: { size: 12 } } : undefined,
    ...o, ...(o.title ? { title: { display: true, text: o.title, color: t.muted, font: { size: 12 } } } : {}),
  });
  return { x: make(opts.x), y: make(opts.y) };
}

/** Crea una gráfica; devuelve null si Chart.js no cargó. */
export function makeChart(canvas, config) {
  const C = window.Chart;
  if (!C || !canvas) return null;
  C.getChart(canvas)?.destroy(); // idempotente: nunca dos gráficas en el mismo canvas
  const t = theme();
  C.defaults.font.family = cssVar('--font-body') || 'Inter, sans-serif';
  C.defaults.color = t.muted;
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: true,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${fmtTick.format(ctx.parsed.y)}`,
        },
      },
    },
  };
  config.options = deepMerge(base, config.options || {});
  return new C(canvas, config);
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v;
  }
  return out;
}

/** Serie de línea con estilo estándar. */
export function line(label, data, color, extra = {}) {
  return { label, data, borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 2.5, tension: 0, ...extra };
}
