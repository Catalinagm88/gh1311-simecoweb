# SimulacionEcoWeb

Aplicación web educativa, gratuita y responsiva con 8 simulaciones económicas interactivas:

| Ruta | Simulación |
|---|---|
| `#/oferta-demanda` | Oferta y demanda |
| `#/interes` | Interés compuesto y decisiones financieras |
| `#/eoq` | Cantidad económica de pedido |
| `#/punto-reorden` | Punto de reorden con demanda variable |
| `#/revision` | Sistemas de revisión (continua vs. periódica) |
| `#/bullwhip` | Efecto látigo |
| `#/beer-game` | Beer Game (versión simplificada) |
| `#/colas` | Teoría de colas y cuellos de botella |

Cada simulación explica qué simula, el significado de sus parámetros, los efectos al moverlos y su
utilidad en los negocios. Las simulaciones aleatorias usan una **semilla** (por defecto 42): el
mismo escenario siempre produce el mismo resultado. Los parámetros viajan en la URL y los
escenarios se pueden guardar en el navegador.

## Stack (sin compilación)

HTML5 + CSS nativo + JavaScript ES2022 con módulos · Alpine.js 3.17.5 · Chart.js 4.5.1 (UMD) ·
KaTeX 0.19.1 · SVG + `requestAnimationFrame` · rutas por hash · `localStorage`.
Todas las librerías y fuentes están en `public/vendor/`; no se usa ningún CDN.

## Estructura

```
public/            ← se sirve tal cual
  index.html       ← layout y navegación
  css/             ← tokens.css, base.css, components.css
  js/app.js        ← Alpine, router por hash, escenarios, tema
  js/lib/          ← prng, stats, params, format, charts, player, storage
  js/sims/         ← módulos PUROS de cada simulación (entradas → salidas)
  js/ui/           ← componentes Alpine de cada vista
  views/           ← HTML parcial de cada vista
tests/             ← node --test (casos T1–T34 de README-handoff.md)
design/mockups/    ← mockups de referencia (no se despliegan)
```

## Desarrollo local

```bash
npm test
```

```bash
npx wrangler dev
```

(Cualquier servidor estático sirve, por ejemplo `python3 -m http.server -d public 8787`.)

## Despliegue en Cloudflare Workers (solo assets)

1. Cloudflare → Workers & Pages → Create → Import a repository → este repositorio.
2. Build command: *(vacío)* · Deploy command: `npx wrangler deploy` · Root: `/`.
3. URL pública: `https://simulacionecoweb.<tu-subdominio>.workers.dev`.

Configuración en `wrangler.jsonc`; Node 24 vía `.node-version`. Detalles completos en
[`README-handoff.md`](README-handoff.md).
