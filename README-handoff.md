# SimEco Web — README de handoff (diseño → implementación)

Documento para que **Claude Code Web** implemente la aplicación a partir de los mockups.
Mockups (lienzo Claude Design): https://claude.ai/artifact/SFWtHxkUwfb4d8KyZK2pMY

SimEco es una aplicación web educativa, gratuita y responsiva, con 8 simulaciones económicas
dinámicas. Cada simulación explica **qué simula**, el **significado de sus parámetros**, los
**efectos** de moverlos y su **utilidad en los negocios** (ver bloque «explain» de cada mockup).

> Los números de las gráficas de los mockups de simulaciones aleatorias (punto de reorden,
> revisión, bullwhip, Beer Game, colas) son **ilustrativos**. Los valores determinísticos
> (EOQ, M/M/1, interés, oferta-demanda, SS/ROP) sí son exactos y están en la sección 4.

---

## 1. Restricciones del stack

| Capa | Tecnología | Versión (fija) | Motivo |
|---|---|---|---|
| Estructura / UI | HTML5 semántico | Estándar vivo | Lo que genera Claude Design; no requiere compilación. |
| Estilos | CSS nativo (variables CSS, nesting, container queries, `clamp()`) | CSS actual (navegadores modernos) | Responsivo sin Tailwind. Los tokens de diseño pasan directo a variables CSS. |
| Lógica de simulación | JavaScript ES2022, módulos ES (`<script type="module">`) | ES2022 | Cada simulación es un módulo puro (entradas → salidas), fácil de probar. Sin bundler. |
| Reactividad de controles | Alpine.js | **3.17.x — fijar el último parche exacto** (p. ej. `3.17.N`, verificar con `npm view alpinejs@3.17 version`) | `x-data` / `x-model` ligan sliders al estado desde el HTML. |
| Gráficas | Chart.js, build UMD `chart.umd.min.js` | **4.5.1** | El UMD no tiene dependencias (el ESM importa `@kurkle/color`). |
| Fórmulas | KaTeX | **0.19.1** | EOQ, ROP, interés, Little, M/M/1 sin servidor. |
| Animaciones / diagramas | SVG nativo + `requestAnimationFrame` | Estándar | Cadena del Beer Game/bullwhip y entidades en la cola. |
| Aleatoriedad | PRNG con semilla (mulberry32), Box-Muller, exponencial, Poisson | — | Mismo escenario + misma semilla = mismo resultado. |
| Navegación | Rutas con hash (`#/eoq`, `#/beer-game`) | — | Sin reglas de SPA ni redirecciones en Cloudflare. |
| Persistencia | `localStorage` + parámetros en la URL | — | Guardar escenarios y compartir enlaces. Sin backend. |
| Pruebas (opcional) | `node --test` sobre los módulos puros | Node 24 LTS | Valida fórmulas contra casos conocidos sin dependencias. |
| Repositorio | GitHub | — | Fuente única; Cloudflare se conecta al repo. |
| Hosting | Cloudflare Workers con Static Assets (solo assets, sin script) | Wrangler 4.x (≥ 4.34) | Gratis, URL pública `*.workers.dev`. Alternativa: Cloudflare Pages. |
| Runtime de despliegue | Node.js (solo en el build de Cloudflare) | 24 LTS (`.node-version`) | Solo lo usa `npx wrangler deploy`. No compila nada. |

**Reglas duras**

- **Sin compilación**: nada de bundlers, transpiladores, TypeScript, Sass, PostCSS ni Tailwind.
  Lo que está en `public/` es exactamente lo que se sirve.
- **Sin frameworks SPA** (React, Vue, Svelte, Angular…). Solo Alpine.js para enlazar controles.
- **Rutas por hash** únicamente: `#/`, `#/oferta-demanda`, `#/interes`, `#/eoq`,
  `#/punto-reorden`, `#/revision`, `#/bullwhip`, `#/beer-game`, `#/colas`.
  Parámetros como query dentro del hash: `#/eoq?D=1200&S=50&H=2`.
- Librerías **vendorizadas** en `public/vendor/` con su versión en el nombre de carpeta
  (`public/vendor/chartjs-4.5.1/chart.umd.min.js`, `public/vendor/katex-0.19.1/…`,
  `public/vendor/alpinejs-3.17.N/cdn.min.js`). Nada se carga de CDN en producción.
- Los módulos de `js/sims/` son **puros**: no tocan DOM, `window`, `Math.random` ni `Date`.
  Toda aleatoriedad entra por un PRNG creado con la semilla.

### Estructura de archivos

```
.
├── .node-version                 # 24
├── package.json                  # solo scripts: test, deploy; devDependency wrangler ^4.34
├── wrangler.jsonc
├── README-handoff.md
├── tests/                        # node --test
│   └── *.test.js
└── public/
    ├── index.html                # layout: header, nav, <main id="view">, plantillas <template>
    ├── css/
    │   ├── tokens.css            # variables (sección 5), tema claro/oscuro
    │   ├── base.css              # reset, tipografía, foco
    │   └── components.css        # .card .kpi .field .runbar .badge .explain .math …
    ├── js/
    │   ├── app.js                # arranque Alpine, router hash, carga de vista
    │   ├── lib/
    │   │   ├── prng.js           # mulberry32, normal (Box-Muller), exponencial, poisson
    │   │   ├── stats.js          # media, varianza, zFromServiceLevel (inversa normal)
    │   │   ├── params.js         # leer/escribir query del hash, validar contra el esquema
    │   │   ├── storage.js        # escenarios en localStorage (try/catch)
    │   │   ├── charts.js         # fábrica de gráficas Chart.js con tokens
    │   │   ├── player.js         # reproductor de series: running / paused / idle
    │   │   └── format.js         # Intl.NumberFormat('es-MX')
    │   ├── sims/                 # MÓDULOS PUROS (sección 3)
    │   │   ├── oferta-demanda.js
    │   │   ├── interes.js
    │   │   ├── eoq.js
    │   │   ├── punto-reorden.js
    │   │   ├── revision.js
    │   │   ├── bullwhip.js
    │   │   ├── beer-game.js
    │   │   └── colas.js
    │   └── ui/                   # componentes Alpine (Alpine.data) que llaman a sims/
    │       └── <slug>.js
    ├── views/<slug>.html         # parcial de cada sección (se inyecta en #view)
    └── vendor/…
```

Router: `app.js` escucha `hashchange`, separa `slug` y query, hace `fetch('views/<slug>.html')`,
lo inyecta en `<main id="view">`, ejecuta `Alpine.initTree()`, actualiza `aria-current="page"`
en la navegación, `document.title` y mueve el foco al `<h1>`. Ruta desconocida → vista «No
encontrada» con enlace a `#/`.

---

## 2. Mapa de pantallas → módulos

Todas las pantallas comparten: encabezado (marca, ruta actual, semilla, Guardar escenario,
Copiar enlace), navegación lateral, `form.controls` con sliders, fila de KPIs, tarjeta(s) de
gráfica con «Ver datos como tabla», tarjeta de fórmulas (KaTeX) y la sección `explain` de 4
tarjetas: **¿Qué simula? · Parámetros · Efectos al moverlos · Utilidad en los negocios**.

| Ruta | Artboard del mockup | Módulo puro | Componente Alpine | Componentes visuales |
|---|---|---|---|---|
| `#/` | Main | — | `ui/home.js` | Hero, 8 tarjetas de simulación, «Cómo funciona» |
| `#/oferta-demanda` | OfertaDemanda | `sims/oferta-demanda.js` | `ui/oferta-demanda.js` | Sliders, checkbox precio máximo, botones de shock, KPIs, Chart.js line (2 curvas + punto + áreas de excedente), KaTeX |
| `#/interes` | Interes | `sims/interes.js` | `ui/interes.js` | Sliders, selector segmentado de capitalización, veredicto A vs B, Chart.js line (3 series), tabla, KaTeX |
| `#/eoq` | EOQ | `sims/eoq.js` | `ui/eoq.js` | Sliders, alerta de política actual, Chart.js line costos (3 series + punto Q* + punto actual), Chart.js line escalonada (diente de sierra), KaTeX |
| `#/punto-reorden` | PuntoReorden | `sims/punto-reorden.js` | `ui/punto-reorden.js` | **Runbar** (reproductor), sliders, KPIs, Chart.js line animada + anotaciones ROP/SS + marcadores de pedido, tabla por ciclo |
| `#/revision` | Revision | `sims/revision.js` | `ui/revision.js` | Runbar, 2 gráficas lado a lado (continua/periódica), tabla comparativa con ganador resaltado |
| `#/bullwhip` | Bullwhip | `sims/bullwhip.js` | `ui/bullwhip.js` | Runbar, **diagrama SVG de la cadena animado**, Chart.js line (5 series), Chart.js bar horizontal (razón de varianzas) |
| `#/beer-game` | BeerGame | `sims/beer-game.js` | `ui/beer-game.js` | Runbar, tablero de 4 nodos (SVG animado + tarjetas), stepper de pedido, Chart.js line inventario neto, KPIs de costo |
| `#/colas` | Colas | `sims/colas.js` | `ui/colas.js` | Runbar, **animación SVG de la cola**, selector de modelo, veredicto de costo, Chart.js L vs ρ, Chart.js longitud de fila (stepped), diagrama SVG de línea en serie |
| (todas, < 640px) | Movil | — | — | Menú en hoja lateral, parámetros en acordeón, runbar fija abajo, explicación en pestañas |
| — | Tokens | `css/tokens.css` | — | Variables, breakpoints, estados, accesibilidad |

### Contrato de los componentes UI

- `ui/<slug>.js` registra `Alpine.data('<slug>', () => ({ params, out, … }))`.
- `params` se inicializa: query del hash → escenario guardado → `defaults` del módulo.
- Al cambiar un parámetro (`x-model.number`, `@input` con `requestAnimationFrame` como
  limitador): validar con el esquema, recalcular `out = sim.compute(params)` o
  `sim.simulate(params, seed)`, actualizar gráficas con `chart.update('none')` y reescribir la
  query con `history.replaceState` (sin añadir entradas al historial).
- Sliders: `<input type="range">` + `<output>` con valor formateado y unidad.

### Reproductor (`lib/player.js`) para simulaciones dinámicas

Las simulaciones aleatorias se **precalculan completas** con `simulate(params, seed)`; el
reproductor solo revela la serie paso a paso. Así pausa/reinicio son triviales y reproducibles.

| Estado | `data-state` | Botón principal | Comportamiento |
|---|---|---|---|
| Reiniciada | `idle` | «Iniciar» | t = 0, series vacías en la gráfica, KPIs teóricos visibles, simulados en «—». «Paso» y «Reiniciar» deshabilitados. |
| Corriendo | `running` | «Pausar» | `requestAnimationFrame` avanza `velocidad × pasos/seg`; animación SVG activa. |
| En pausa | `paused` | «Reanudar» | Congela t y animación. Cambiar un parámetro → recalcula y pasa a `idle`. |
| Terminada | `paused` con t = fin | «Reanudar» deshabilitado | Muestra resumen completo. |

Velocidades: 0.5×, 1×, 2×, 4× (colas: 1×, 10×, 60× sobre el reloj simulado).
Con `prefers-reduced-motion: reduce` no se anima: «Iniciar» muestra la corrida completa y
«Paso» avanza de uno en uno.

---

## 3. Contrato de cada simulación

Convenciones de cada módulo:

```js
export const meta = { slug, title };
export const schema = { /* nombre: { min, max, step, default, unit, label } */ };
export const defaults = Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, v.default]));
// determinísticos:
export function compute(params) { /* → objeto de salidas */ }
// aleatorios:
export function simulate(params, seed) { /* → { series, summary } */ }
```

Parámetros fuera de rango se recortan al rango (`clamp`) y se redondean al `step`.

### 3.1 Oferta y demanda — `sims/oferta-demanda.js`

| Parámetro | Rango | Default | Unidad |
|---|---|---|---|
| `a` demanda base | 20 – 200 | 100 | u |
| `b` sensibilidad al precio | 0.5 – 5 (0.1) | 2 | u/$ |
| `c` oferta base | −50 – 100 | 10 | u |
| `d` respuesta de la oferta | 0.5 – 5 (0.1) | 1.5 | u/$ |
| `t` impuesto por unidad | 0 – 20 (0.5) | 0 | $/u |
| `pmax` precio máximo (opcional) | 0 – 100 o `null` | `null` | $ |

Modelo: `Qd = a − bP`, `Qs = c + d(P − t)` (impuesto al vendedor).
`Pc = (a − c + d·t)/(b + d)`; `Pv = Pc − t`; `Q* = a − b·Pc` (si < 0 → 0).
Excedente del consumidor `CS = (a/b − Pc)·Q*/2`.
Excedente del productor `PS = ∫₀^{Pv} max(0, c + dP) dP` (con c ≥ 0: `c·Pv + d·Pv²/2`).
Recaudación `T = t·Q*`; pérdida de eficiencia `DWL = t·(Q₀* − Q*)/2`.
Con `pmax < Pc`: `escasez = Qd(pmax) − Qs(pmax)`.
Shocks: «demanda +20 %» → `a × 1.2`; «costos +15 %» → `c − 0.15·d·Pc` (desplaza la oferta).

Salidas → gráfica: `curves.demand[]`, `curves.supply[]` (puntos P de 0 a a/b) → **line**
2 series; `equilibrium {P, Q}` → punto + guías punteadas; `CS`, `PS` → áreas rellenas.
KPIs: P*, Q*, CS, PS (+ DWL y recaudación si t > 0).

### 3.2 Interés compuesto — `sims/interes.js`

| Parámetro | Rango | Default | Unidad |
|---|---|---|---|
| `P` capital inicial | 100 – 1,000,000 | 10,000 | $ |
| `r` tasa nominal | 0 – 30 (0.25) | 8 | % anual |
| `m` capitalización | {1, 2, 4, 12, 365, `inf`} | 12 | veces/año |
| `t` plazo | 1 – 40 | 10 | años |
| `A` aportación por periodo | 0 – 5,000 (50) | 0 | $ |
| `inf` inflación | 0 – 15 (0.25) | 4 | % anual |
| `rB`, `mB` opción B | 0 – 30 / igual que `m` | 7.5 / 365 | |

Fórmulas: `i = r/m`, `n = m·t`, `VF = P(1+i)^n + A·((1+i)^n − 1)/i` (si i = 0: `P + A·n`).
Continua: `VF = P·e^{rt}` (con A > 0 se usa m = 365 para la anualidad y se avisa).
`TEA = (1+i)^m − 1` (continua: `e^r − 1`). Simple: `P(1 + r·t)`.
Valor real: `VF / (1+inf)^t`. Duplicación: `ln 2 / (m·ln(1+i))`.

Salidas → gráfica **line** con eje X en años: `series.compound[]`, `series.simple[]`,
`series.optionB[]` (un punto por año). KPIs: VF A, VF simple, TEA A, valor real.
Veredicto: opción con mayor VF y diferencia en $.

### 3.3 EOQ — `sims/eoq.js`

| Parámetro | Rango | Default | Unidad |
|---|---|---|---|
| `D` demanda anual | 100 – 20,000 (100) | 1,200 | u/año |
| `S` costo por pedido | 1 – 500 | 50 | $/pedido |
| `H` costo de mantener | 0.1 – 50 (0.1) | 2 | $/u·año |
| `L` tiempo de entrega | 0 – 60 | 5 | días |
| `Q` lote actual | 10 – 2,000 (10) | 400 | u |
| `dias` días por año | 250 – 365 | 365 | días |

Fórmulas: `Q* = √(2DS/H)`, `CT(Q) = DS/Q + HQ/2`, `N = D/Q*`, `T = dias/N`,
`ROP = (D/dias)·L`, `Δ = CT(Q) − CT(Q*)`.

Salidas → **line** costos: `costCurve[] = {Q, ordering, holding, total}` para Q en
`[max(1, 0.2Q*), 2.5Q*]` (60 puntos); punto Q* y punto Q actual. **line escalonada**:
`sawtooth[]` nivel de inventario en un año con Q*. KPIs: Q*, N, T, CT*, ROP. Alerta si
`|Q − Q*|/Q* > 5 %`, indicando si se pide de más o de menos.

### 3.4 Punto de reorden con demanda variable — `sims/punto-reorden.js` (aleatoria)

| Parámetro | Rango | Default | Unidad |
|---|---|---|---|
| `d` demanda diaria media | 1 – 200 | 20 | u/día |
| `sd` desviación diaria | 0 – 50 (0.5) | 5 | u |
| `L` tiempo de entrega | 1 – 30 | 7 | días |
| `ns` nivel de servicio | 50 – 99.9 (0.1) | 95 | % |
| `Q` tamaño de pedido | 10 – 2,000 (10) | 400 | u |
| `dias` horizonte | 30 – 365 (5) | 120 | días |
| `seed` semilla | entero 32 bits | 42 | |

Fórmulas: `z = Φ⁻¹(ns)` (Acklam o Beasley-Springer-Moro en `stats.js`),
`SS = z·sd·√L`, `ROP = d·L + SS`.
Reglas diarias (orden fijo): 1) recibir pedidos cuyo día de llegada = hoy; 2) demanda
`D_t = max(0, round(normal(d, sd)))`; 3) vender `min(I, D_t)`, faltante = resto (venta
perdida); 4) si `I + enTránsito ≤ ROP` y no hay pedido abierto → pedir Q, llega en `t + L`.
Inventario inicial: `ROP + Q`.

Salidas: `series.inventory[]`, `series.demand[]`, `orders[] {day, arrival}`,
`stockoutDays[]` → **line** con anotaciones ROP y SS y marcadores ▼ de pedido.
`summary`: SS, ROP, ciclos, ciclos con faltante, unidades faltantes,
`fillRate = vendidas/demandadas`, inventario promedio.

### 3.5 Revisión continua vs. periódica — `sims/revision.js` (aleatoria)

Parámetros comunes de 3.4 más `R` periodo de revisión (1 – 60, default 20 días).
Ambas políticas consumen **la misma serie de demanda** generada una vez con la semilla.

- Continua (s, Q): `s = d·L + z·sd·√L`; pedir Q cuando la posición `IP ≤ s`.
- Periódica (R, S): `S = d(R+L) + z·sd·√(R+L)`; en días `t % R === 0` pedir `S − IP` si > 0.
- `IP = a mano + en tránsito`. Faltantes = venta perdida.

Salidas → 2 gráficas **line** (`continuous.inventory[]`, `periodic.inventory[]`, líneas s y S,
marcas verticales de revisión) y **tabla** comparativa: SS, inventario promedio, nº pedidos,
rango de tamaño de pedido, unidades faltantes, fill rate, nº de revisiones.

### 3.6 Efecto látigo — `sims/bullwhip.js` (aleatoria)

| Parámetro | Rango | Default | Unidad |
|---|---|---|---|
| `mu` demanda media cliente | 10 – 500 (10) | 100 | u/sem |
| `sd` desviación cliente | 0 – 100 | 10 | u |
| `L` entrega por eslabón | 1 – 6 | 2 | sem |
| `p` ventana de promedio móvil | 1 – 12 | 4 | sem |
| `sem` horizonte | 20 – 104 | 52 | sem |
| `info` información compartida | booleano | false | |
| `seed` | | 42 | |

Eslabones `k = 0..3`: Minorista, Mayorista, Distribuidor, Fábrica.
Demanda del cliente `D_t = max(0, round(normal(mu, sd)))`. Demanda vista por k:
`x⁰ = D`, `xᵏ = q^{k−1}` (pedidos del eslabón inferior); con `info = true`, todos pronostican
con `D` pero siguen recibiendo `q^{k−1}` como pedido a surtir.
Pronóstico `D̂ᵏ_t` = promedio móvil de los últimos p valores observados; `σ̂ᵏ_t` = desviación
de esos p valores. Nivel objetivo `Sᵏ_t = L·D̂ᵏ_t + z·σ̂ᵏ_t·√L` (z = 1.645).
Pedido `qᵏ_t = max(0, Sᵏ_t − Sᵏ_{t−1} + xᵏ_t)`. Calentamiento: primeras p semanas pedidos = mu.

Salidas: `orders[k][]`, `demand[]` → **line** 5 series; `ratio[k] = Var(qᵏ)/Var(D)` (sin
calentamiento) → **bar** horizontal; `bound(k) = (1 + 2L/p + 2L²/p²)^{k+1}` → columna
«cota teórica» de la tabla.

### 3.7 Beer Game simplificado — `sims/beer-game.js` (aleatoria / interactiva)

| Parámetro | Rango | Default | Unidad |
|---|---|---|---|
| `modo` | `jugar` \| `auto` | `jugar` | |
| `rol` | minorista \| mayorista \| distribuidor \| fabrica | minorista | |
| `sem` duración | 20 – 52 | 30 | semanas |
| `L` retraso | 1 – 4 | 2 | semanas |
| `d0`, `d1` demanda antes/después | 0 – 20 | 4 / 8 | u/sem |
| `salto` semana del salto | 1 – 20 | 5 | |
| `ruido` Poisson | booleano | true | |
| `h` costo de inventario | 0 – 5 (0.1) | 0.5 | $/u·sem |
| `b` costo de pendientes | 0 – 10 (0.1) | 1.0 | $/u·sem |
| `seed` | | 42 | |

Estado inicial por eslabón: inventario 12, pendientes 0, tubería de envío `[4, 4]` (longitud L),
pedidos previos 4. Demanda del cliente: `d0` hasta `salto − 1`, luego `d1`; con ruido,
`D_t = poisson(nivel)`.
Paso semanal (orden fijo, mismo para todos):
1. Llega el envío de la cabeza de la tubería.
2. Se recibe el pedido del eslabón inferior (cliente para el minorista).
3. Se surte `min(inventario, pedido + pendientes)`; el resto queda pendiente.
4. Cada eslabón decide su pedido: jugador = número del stepper; automático =
   `q = max(0, round(D̂ + α(S* − IP)))` con `D̂ ← θ·x + (1−θ)·D̂`, θ = 0.3, α = 0.4,
   `S* = D̂·(L+1) + 8` (con D̂ = 4 coincide con la posición inicial 12 + 4L), `IP = inventario − pendientes + en tránsito`.
5. La fábrica «produce» su pedido con el mismo retraso L.
6. Costo semanal `h·max(I,0) + b·pendientes`.

API: `createGame(params, seed)` → `{ state, step(orderForPlayer), isOver }` y
`simulate(params, seed)` (todo automático). En modo `jugar`, el juego espera el pedido del
usuario cada semana (estado «Esperando tu pedido»).
Salidas: `netInventory[k][]` (inventario − pendientes) → **line** 4 series;
`orders[k][]`; `cost[k]`, `totalCost`; `amplification = Var(orders fábrica)/Var(demanda)`.
KPI «Política automática» = mismo rol, misma semilla, jugado por la política.

### 3.8 Colas y cuellos de botella — `sims/colas.js` (aleatoria)

| Parámetro | Rango | Default | Unidad |
|---|---|---|---|
| `modelo` | `mm1` \| `mmc` \| `serie` | `mm1` | |
| `lambda` | 0.1 – 30 (0.1) | 4 | clientes/h |
| `mu` | 0.1 – 30 (0.1) | 5 | clientes/h por servidor |
| `c` servidores | 1 – 10 | 1 | |
| `mus` estaciones en serie | 2–5 valores 0.1 – 30 | [6, 5, 7] | /h |
| `Cw` costo de espera | 0 – 200 | 20 | $/cliente·h |
| `Cs` costo por servidor | 0 – 200 | 15 | $/h |
| `horas` horizonte | 1 – 24 | 8 | h |
| `seed` | | 42 | |

Teoría (`compute`):
- `ρ = λ/(cμ)`; si `ρ ≥ 1` → `{ stable: false }` y la UI muestra «Sistema inestable».
- M/M/1: `L = ρ/(1−ρ)`, `Lq = ρ²/(1−ρ)`, `W = 1/(μ−λ)`, `Wq = ρ/(μ−λ)`, `P0 = 1−ρ`.
- M/M/c (Erlang C): `a = λ/μ`, `P0 = [Σ_{n=0}^{c−1} aⁿ/n! + a^c/(c!(1−ρ))]⁻¹`,
  `Lq = P0·a^c·ρ / (c!(1−ρ)²)`, `L = Lq + a`, `Wq = Lq/λ`, `W = Wq + 1/μ`.
- Costo `CT = c·Cs + L·Cw`; recomendación: c entre 1 y 10 con menor CT (estable).
- Serie: `ρᵢ = λ/μᵢ`, cuello de botella `argmin μᵢ`, capacidad `min μᵢ`,
  throughput `min(λ, min μᵢ)`.

Simulación (`simulate`) por eventos discretos: interllegadas `exponential(λ)`, servicio
`exponential(μ)`, FIFO, c servidores. Salidas: `queueLength[] {t, n}` (escalonada) → **line
stepped**; `events[]` (para animar las entidades SVG); `summary` observado (L, Lq, W, Wq,
atendidos). Curva teórica `L(ρ)` para ρ ∈ [0, 0.95] → **line**.

### 3.9 `lib/prng.js`

```js
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const normal = (rng, mu = 0, sd = 1) => {           // Box-Muller
  const u1 = 1 - rng(), u2 = rng();
  return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};
export const exponential = (rng, rate) => -Math.log(1 - rng()) / rate;
export const poisson = (rng, lambda) => {                   // Knuth (λ < 30)
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
};
```

---

## 4. Casos de prueba (resultado esperado)

Ejecutar con `node --test tests/`. Tolerancia por defecto `1e-2` salvo que se indique.

| # | Módulo | Entrada | Resultado esperado |
|---|---|---|---|
| T1 | prng | `mulberry32(42)` tres llamadas | `0.6011037519`, `0.4482905590`, `0.8524657935` (±1e-9) |
| T2 | prng | misma semilla, 1,000 valores dos veces | arreglos idénticos |
| T3 | prng | `normal` con semilla 42, n = 100,000 | media 0 ± 0.02, desviación 1 ± 0.02 |
| T4 | prng | `exponential(rng, 4)`, n = 100,000 | media 0.25 ± 0.005 |
| T5 | eoq | D = 1,200, S = 50, H = 2 | **Q\* ≈ 244.9** (244.949), CT\* = 489.90, N = 4.899, T = 74.5 días |
| T6 | eoq | D = 1,200, S = 50, H = 2, Q = 400 | CT(400) = 550.00, Δ = 60.10 |
| T7 | eoq | D = 1,200, L = 5, dias = 365 | ROP = 16.44 |
| T8 | eoq | D × 4 | Q\* × 2 (exacto) |
| T9 | oferta-demanda | a = 100, b = 2, c = 10, d = 1.5, t = 0 | P\* = 25.714, Q\* = 48.571, CS = 589.80, PS = 753.06 |
| T10 | oferta-demanda | mismo, t = 5 | Pc = 27.857, Q = 44.286 |
| T11 | interes | P = 10,000, r = 8, m = 12, t = 10 | VF = 22,196.40, TEA = 8.300 %, simple = 18,000 |
| T12 | interes | m = `inf`, mismos datos | VF = 22,255.41 |
| T13 | interes | rB = 7.5, mB = 365 | VF_B = 21,168.37; A supera a B por 1,028.03 |
| T14 | interes | P = 0, A = 100, r = 12, m = 12, t = 1 | VF = 1,268.25 |
| T15 | interes | inf = 4, VF = 22,196.40, t = 10 | valor real = 14,995.1; duplicación = 8.69 años |
| T16 | stats | `zFromServiceLevel(0.95)` / `(0.99)` | 1.6449 / 2.3263 (±1e-3) |
| T17 | punto-reorden | d = 20, sd = 5, L = 7, ns = 95 | SS = 21.76, ROP = 161.76 |
| T18 | punto-reorden | sd = 0 | SS = 0, ROP = 140, sin faltantes en la simulación |
| T19 | punto-reorden | semilla 42 dos veces | `series.inventory` idénticas |
| T20 | revision | d = 20, sd = 5, L = 7, R = 20, ns = 95 | S = 582.73; SS periódica (42.74) > SS continua (21.76) |
| T21 | revision | cualquier semilla | ambas políticas usan exactamente la misma `demand[]` |
| T22 | bullwhip | L = 2, p = 4 | cota por eslabón = 2.5 |
| T23 | bullwhip | defaults, semilla 42 | `ratio[0] > 1` y `ratio[3] > ratio[0]` (amplificación creciente) |
| T24 | bullwhip | defaults, semilla 42, `info = true` | `ratio[3]` menor que con `info = false` |
| T25 | beer-game | `simulate` defaults, semilla 42 | **amplificación medible**: `Var(pedidos fábrica)/Var(demanda) > 2`; además `Var(fábrica) > Var(minorista)` |
| T26 | beer-game | semilla 42 dos veces | mismo `totalCost` y mismas series |
| T27 | beer-game | `ruido = false`, d0 = d1 = 4 | sistema en equilibrio: pedidos = 4 todas las semanas, costo = 12·0.5·4·sem |
| T28 | colas | M/M/1, λ = 4, μ = 5 | **ρ = 0.8, L = 4**, Lq = 3.2, W = 1 h, Wq = 0.8 h, P0 = 0.2 |
| T29 | colas | M/M/c, λ = 4, μ = 5, c = 2 | P0 = 0.4286, Lq = 0.1524, L = 0.9524, Wq = 2.29 min |
| T30 | colas | Cw = 20, Cs = 15 | CT(c=1) = 95.00, CT(c=2) = 49.05, CT(c=3) = 61.38; recomendado c = 2 |
| T31 | colas | λ = 5, μ = 5, c = 1 | `stable: false` |
| T32 | colas | `simulate` M/M/1, horas = 10,000, semilla 42 | L observado = 4 ± 10 %; Little: |L − λW|/L < 2 % |
| T33 | colas | serie, λ = 4, μ = [6, 5, 7] | cuello = índice 1, capacidad = 5, ρ = [0.667, 0.8, 0.571] |
| T34 | params | `#/eoq?D=99999` | D recortado a 20,000 |

> Los «valores ilustrativos» de los mockups dinámicos no son casos de prueba: al implementar,
> reemplazar las cifras del mockup por las que produzca la semilla 42.

---

## 5. Tokens de diseño, breakpoints y estados de UI

### `css/tokens.css`

```css
:root {
  color-scheme: light dark;
  --bg: #F4F6F9;  --surface: #FFFFFF;  --surface-2: #F7F9FC;
  --ink: #14213D; --ink-2: #3D475C;    --muted: #5A6478;
  --line: #DDE2EA; --line-2: #CBD3DF;
  --accent: #0B6A88; --accent-ink: #084E64; --accent-soft: #DCEEF4;
  --accent-2: #C2410C; --warn-ink: #8A3B0A; --warn-soft: #FDF1E4; --warn-line: #F1C99E;
  --ok-ink: #14532D; --ok-soft: #E7F3EC; --ok-line: #B9DCC6;
  --header: #14213D; --header-2: #1C2B4D; --header-line: #3A4C74; --header-ink: #CFE3F0;
  /* series de gráficas */
  --c1: #0B6A88; --c2: #C2410C; --c3: #6D5BD0; --c4: #8A94A8;
  --seq-1: #9CC9DA; --seq-2: #4FA3C0; --seq-3: #0B6A88; --seq-4: #14213D;
  /* tipografía */
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --fs-h1: clamp(28px, 3vw, 40px); --fs-h2: 18px; --fs-body: 15px; --fs-small: 12px; --fs-kpi: 24px;
  /* espacio y forma */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px;
  --r-sm: 6px; --r-md: 10px; --r-lg: 14px; --r-pill: 999px;
  --tap: 44px; --focus: 0 0 0 3px var(--accent);
  --nav-w: 220px; --controls-w: 300px; --content-max: 1440px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0E1626; --surface: #16213A; --surface-2: #1B2844;
    --ink: #E8EDF5; --ink-2: #C9D2E1; --muted: #A9B4C8;
    --line: #2A3856; --line-2: #3A4C74;
    --accent: #4FB3D4; --accent-ink: #9FD6EA; --accent-soft: #123247;
    --accent-2: #F08A4B; --warn-ink: #F7B98C; --warn-soft: #3A2414;
    --ok-ink: #8FD3A8; --ok-soft: #12301F;
    --c1: #4FB3D4; --c2: #F08A4B; --c3: #A79BF0; --c4: #A9B4C8;
    --seq-1: #2D5F74; --seq-2: #3E8FAD; --seq-3: #4FB3D4; --seq-4: #CFE3F0;
  }
}
:root[data-theme="dark"] { /* mismos valores que el bloque oscuro */ }
```

Fuentes: Inter, Space Grotesk y JetBrains Mono autoalojadas en `public/vendor/fonts/`
(woff2, `font-display: swap`). Chart.js lee los colores con
`getComputedStyle(document.documentElement)` y se recrea al cambiar de tema.

### Breakpoints (container queries sobre `.main`, `container-type: inline-size`)

| Nombre | Ancho | Layout |
|---|---|---|
| Móvil | < 640px | 1 columna. Navegación en hoja lateral (`<dialog>`) desde botón hamburguesa. Parámetros en `<details>` acordeón. KPIs 2×2. Runbar fija abajo (`position: sticky; bottom: 0`). Explicación en pestañas (`role="tablist"`). |
| Tableta | 640 – 1023px | Navegación como fila de chips desplazable bajo el encabezado. Parámetros (300px) + resultados en 2 columnas. Explicación 2 columnas. |
| Escritorio | ≥ 1024px | Navegación lateral 220px. Parámetros 300px, resultados fluidos. Explicación 4 columnas. Máx. 1440px. |

La navegación se decide con `@media` (depende del viewport); el interior de cada vista con
`@container`. Sin scroll horizontal de página a 320px; las tablas van en `.tbl { overflow-x: auto }`.

### Estados de UI

Ver tabla del reproductor (sección 2) y artboards **Movil** y **Tokens**.
Badge: Corriendo `--accent-soft`/`--accent-ink`; En pausa `--warn-soft`/`--warn-ink`;
Reiniciada `#EEF2F7`/`--ink-2`. El badge tiene `role="status"`.
Otros estados: «Sistema inestable» (colas, ρ ≥ 1) en tarjeta `--warn`; «Esperando tu pedido»
(Beer Game); error de parámetro en URL → aviso discreto «Se ajustó D al máximo permitido».

---

## 6. Accesibilidad

- `<html lang="es">`, un `<h1>` por vista, landmarks `header`, `nav[aria-label]`, `main`.
- **Sliders**: `<label for>` visible + `<input type="range" id>` + `<output for>` con valor y
  unidad + `aria-describedby` al texto de rango. `aria-valuetext` con la unidad
  (p. ej. «1,200 unidades por año»). Paso con flechas = `step`; RePág/AvPág = 10 × step.
- Objetivos táctiles ≥ 44 × 44 px; foco visible (`:focus-visible { box-shadow: var(--focus) }`).
- **Contraste**: texto ≥ 4.5:1 en ambos temas (ver Tokens; `--muted` #5A6478 sobre blanco ≈ 6:1).
  Las series se distinguen también por grosor y trazo, no solo por color.
- **Gráficas**: `<canvas role="img" aria-label="…">` con la conclusión en texto (p. ej. «El
  costo total es mínimo, 489.90, en Q = 244.9»), generada por el módulo UI; y
  `<details><summary>Ver datos como tabla</summary>` con `<table>` y `<th scope>`.
- SVG animados: `role="img"` + `aria-label` resumen; decorativos `aria-hidden="true"`.
- KPIs en `aria-live="polite"`, limitado a 1 anuncio por segundo durante la reproducción.
- Fórmulas KaTeX con salida `htmlAndMathml` (lectores de pantalla leen MathML).
- `prefers-reduced-motion`: sin animación (ver reproductor).
- Botones de icono con `aria-label` («Reiniciar», «Siguiente evento»).

---

## 7. Despliegue (Cloudflare Workers con Static Assets)

### `wrangler.jsonc`

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "simeco-web",
  "compatibility_date": "2026-11-01",
  // Solo assets: sin "main", no hay script de Worker.
  "assets": {
    "directory": "./public",
    "not_found_handling": "404-page",
    "html_handling": "auto-trailing-slash"
  },
  "observability": { "enabled": false }
}
```

Rutas por hash ⇒ el servidor solo ve `/`; no se necesitan reglas SPA ni redirecciones.
`public/404.html` opcional con enlace a `/`.

### `.node-version`

```
24
```

### `package.json`

```json
{
  "name": "simeco-web",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "dev": "npx wrangler dev",
    "deploy": "npx wrangler deploy"
  },
  "devDependencies": { "wrangler": "^4.34.0" }
}
```

### Workers Builds (Cloudflare dashboard → Workers & Pages → Create → Import a repository)

| Ajuste | Valor |
|---|---|
| Repositorio | este repo de GitHub, rama de producción `main` |
| Root directory | `/` |
| Build command | *(vacío)* |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Variables | ninguna (Node 24 se toma de `.node-version`) |

URL pública: `https://simeco-web.<subdominio>.workers.dev`.
Despliegue manual alternativo desde una máquina local: `npx wrangler login` y luego
`npx wrangler deploy`.
**Alternativa Cloudflare Pages**: framework preset «None», build command vacío, output
directory `public`.

Encabezados recomendados en `public/_headers`:

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self' 'unsafe-eval'
/vendor/*
  Cache-Control: public, max-age=31536000, immutable
```

(`'unsafe-eval'` lo requiere el build estándar de Alpine; si se usa `@alpinejs/csp`, quitarlo.)

---

## 8. Criterios de aceptación por sección

**Generales (todas las vistas)**

- [ ] `public/` se sirve tal cual con `npx wrangler dev`; no existe paso de build.
- [ ] Cada ruta hash carga su vista; atrás/adelante del navegador funciona; ruta desconocida → «No encontrada».
- [ ] Todos los sliders muestran valor + unidad, respetan rango/default de la sección 3 y recalculan en < 50 ms.
- [ ] «Copiar enlace» produce una URL que, abierta en otra pestaña, restaura los mismos parámetros y semilla.
- [ ] «Guardar escenario» persiste en `localStorage`; la app funciona si `localStorage` lanza error.
- [ ] Sección `explain` con las 4 tarjetas (qué simula, parámetros, efectos, utilidad en negocios).
- [ ] Fórmulas renderizadas con KaTeX 0.19.1.
- [ ] Cada gráfica tiene `aria-label` con la conclusión y «Ver datos como tabla».
- [ ] Sin scroll horizontal a 320, 390, 768, 1024 y 1440 px; layout según la tabla de breakpoints.
- [ ] Tema oscuro por `prefers-color-scheme` con contraste ≥ 4.5:1.
- [ ] `node --test` pasa T1–T34.

**Oferta y demanda** — Con defaults se ven P\* = $25.71, Q\* = 48.6, CS = $589.8, PS = $753.1 (T9).
Subir `a` mueve el punto de equilibrio arriba-derecha. Con t > 0 se muestran Pc, Pv, recaudación
y DWL. Precio máximo bajo P\* muestra la escasez en unidades.

**Interés compuesto** — Defaults: VF A = $22,196, simple = $18,000, TEA = 8.30 %, valor real
= $14,995; veredicto «Conviene A» por $1,028 (T11–T15). Cambiar la capitalización a «Continua»
muestra $22,255.

**EOQ** — Defaults: Q\* = 244.9, N = 4.90, T = 74.5 días, CT\* = $489.90, ROP = 16.4; la
curva total tiene su mínimo marcado en Q\*; el lote actual 400 aparece a $550.00 con alerta
«+12.3 %» (T5–T8).

**Punto de reorden** — Defaults: SS = 21.8, ROP = 161.8. Iniciar anima 120 días; pausa congela;
reiniciar y volver a iniciar con semilla 42 produce la misma gráfica (T19). Con σ = 0 no hay
faltantes (T18). Los marcadores de pedido coinciden con los cruces de ROP.

**Revisión continua vs. periódica** — Ambas gráficas avanzan sincronizadas sobre la misma
demanda (T21). La tabla muestra S = 582.7 y SS periódica > SS continua (T20). Las marcas de
revisión aparecen cada R días.

**Efecto látigo** — Con semilla 42 la barra de la fábrica es la más larga y todas > 1 (T23).
Activar «Compartir demanda» reduce visiblemente la razón de la fábrica (T24). El diagrama SVG
anima producto hacia el cliente y pedidos hacia la fábrica; se detiene en pausa.

**Beer Game** — En modo «Jugar un rol» la semana no avanza hasta enviar el pedido; los otros 3
eslabones usan la política. Al terminar se comparan «Tu costo» y «Política automática» (misma
semilla). En modo automático con semilla 42 la amplificación de la fábrica es > 2 (T25) y se
muestra en el KPI. El stepper acepta teclado (flechas) y no permite negativos.

**Colas** — Defaults M/M/1: ρ = 0.80, L = 4.00, Lq = 3.20, W = 60 min, Wq = 48 min (T28);
veredicto recomienda c = 2 a $49.05/h (T30). λ ≥ cμ muestra «Sistema inestable» sin romper la
gráfica (T31). La animación SVG muestra entidades que llegan, esperan y salen, sincronizadas con
la gráfica de longitud de fila. Modo «Línea en serie» resalta la estación B como cuello de
botella (T33).

**Móvil y estados** — A 390px: menú en hoja lateral con foco atrapado y cierre con Esc;
parámetros en acordeón; runbar fija abajo con los 3 estados de la sección 2 (iconos con
`aria-label`).
