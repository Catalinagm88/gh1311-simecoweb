// Rutas por hash → vista parcial y título.
export const ROUTES = [
  { slug: '', view: 'home', num: '00', title: 'Inicio' },
  { slug: 'oferta-demanda', view: 'oferta-demanda', num: '01', title: 'Oferta y demanda' },
  { slug: 'interes', view: 'interes', num: '02', title: 'Interés compuesto' },
  { slug: 'eoq', view: 'eoq', num: '03', title: 'Cantidad económica (EOQ)' },
  { slug: 'punto-reorden', view: 'punto-reorden', num: '04', title: 'Punto de reorden' },
  { slug: 'revision', view: 'revision', num: '05', title: 'Revisión continua vs. periódica' },
  { slug: 'bullwhip', view: 'bullwhip', num: '06', title: 'Efecto látigo' },
  { slug: 'beer-game', view: 'beer-game', num: '07', title: 'Beer Game' },
  { slug: 'colas', view: 'colas', num: '08', title: 'Colas y cuellos de botella' },
];
export const NOT_FOUND = { slug: null, view: 'no-encontrada', num: '', title: 'Página no encontrada' };
export const findRoute = (slug) => ROUTES.find((r) => r.slug === slug) || NOT_FOUND;
