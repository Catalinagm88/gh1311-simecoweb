// Registro de los componentes Alpine de cada vista.
import ofertaDemanda from './oferta-demanda.js';
import interes from './interes.js';
import eoq from './eoq.js';
import puntoReorden from './punto-reorden.js';
import revision from './revision.js';
import bullwhip from './bullwhip.js';
import beerGame from './beer-game.js';
import colas from './colas.js';

export function registerViews(Alpine) {
  Alpine.data('ofertaDemanda', ofertaDemanda);
  Alpine.data('interes', interes);
  Alpine.data('eoq', eoq);
  Alpine.data('puntoReorden', puntoReorden);
  Alpine.data('revision', revision);
  Alpine.data('bullwhip', bullwhip);
  Alpine.data('beerGame', beerGame);
  Alpine.data('colas', colas);
}
