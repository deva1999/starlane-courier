// A tiny seeded random source (mulberry32). Gameplay randomness always
// comes from one of these, never from Math.random, so a run — and every
// screenshot scene — is exactly reproducible from its seed.

/** Create a generator: call it for a float in [0, 1). */
export function makeRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, bound) from a generator. */
export function randomInt(next, bound) {
  return Math.floor(next() * bound);
}

/** One of the array's items, chosen by the generator. */
export function pick(next, items) {
  return items[randomInt(next, items.length)];
}
