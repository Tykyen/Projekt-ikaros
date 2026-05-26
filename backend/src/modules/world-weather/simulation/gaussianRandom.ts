// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

/**
 * Seedable PRNG (mulberry32) — deterministic, fast, 32-bit state.
 * Reference: https://en.wikipedia.org/wiki/Mulberry32
 *
 * Vrací closure ktery generuje uniform [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform — uniform [0,1) → Gaussian N(0, 1).
 * Vrací cca rovnoměrně rozložené v rozsahu (-3, +3) σ.
 */
export function gaussianFromUniform(u1: number, u2: number): number {
  // Avoid Math.log(0)
  const safe = Math.max(u1, 1e-10);
  return Math.sqrt(-2 * Math.log(safe)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Pohodlný wrapper — vrací Gaussian sample N(0, 1) z RNG.
 */
export function gaussianRandom(rng: () => number = Math.random): number {
  return gaussianFromUniform(rng(), rng());
}

/**
 * Pomocný builder — deterministic seed z config + month (pro parity testy + FE preview).
 * Použit u FE-side preview: `seededGaussian(configId, monthIndex, salt)`.
 */
export function seededGaussian(seed: number): number {
  const rng = mulberry32(seed);
  return gaussianFromUniform(rng(), rng());
}

/**
 * Stable hash string → 32-bit int (pro deterministic seed z config ID + měsíce).
 * FNV-1a.
 */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
