/**
 * Deterministic PRNG. Every random decision in the simulation routes through
 * here so that a run is fully reproducible from its seed — that is what makes
 * the engine testable and what lets a finished run be replayed or shared.
 *
 * mulberry32: 32-bit state, good enough distribution for a game, ~5 lines.
 *
 * @param {number} seed
 * @returns {() => number} generator returning floats in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick one element from an array using a supplied generator.
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 * @returns {T|undefined}
 */
export function pick(arr, rng) {
  if (!arr.length) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}
