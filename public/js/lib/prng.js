// Generadores pseudoaleatorios reproducibles (sin Math.random).

/** PRNG mulberry32: devuelve una función que produce números en [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal por Box-Muller. */
export const normal = (rng, mu = 0, sd = 1) => {
  const u1 = 1 - rng(), u2 = rng();
  return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

/** Exponencial con tasa `rate` (media 1/rate). */
export const exponential = (rng, rate) => -Math.log(1 - rng()) / rate;

/** Poisson por el método de Knuth (adecuado para lambda < 30). */
export const poisson = (rng, lambda) => {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
};

/** Normaliza cualquier valor a una semilla entera de 32 bits. */
export function toSeed(value, fallback = 42) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n >>> 0 : fallback;
}
