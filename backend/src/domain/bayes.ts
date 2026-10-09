import { config } from "../config";

export type Rng = () => number;

// Seeded RNG so rehearsals are repeatable (mulberry32)
export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Marsaglia–Tsang gamma sampler
function gamma(shape: number, rng: Rng): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(a: number, b: number, rng: Rng): number {
  const x = gamma(a, rng);
  const y = gamma(b, rng);
  return x / (x + y);
}

// Beta(1,1) prior: 50% with no history, very uncertain
export function posterior(completed: number, failures: number) {
  return { a: 1 + completed, b: 1 + failures };
}

export function posteriorMean(completed: number, failures: number): number {
  const { a, b } = posterior(completed, failures);
  return a / (a + b);
}

export function interval90(completed: number, failures: number, rng: Rng, draws = 2000): [number, number] {
  const { a, b } = posterior(completed, failures);
  const xs = Array.from({ length: draws }, () => sampleBeta(a, b, rng)).sort((p, q) => p - q);
  return [xs[Math.floor(draws * 0.05)], xs[Math.floor(draws * 0.95)]];
}

// ---- shared RNG for matching (reset on /api/demo/reset) ----
let shared: Rng = makeRng(config.DEMO_SEED);
export function rng(): Rng {
  return shared;
}
export function resetRng(): void {
  shared = makeRng(config.DEMO_SEED);
}
