import { describe, expect, it } from "vitest";
import { interval90, makeRng, posteriorMean, sampleBeta } from "../src/domain/bayes";

describe("bayes", () => {
  it("posterior mean uses a Beta(1,1) prior", () => {
    expect(posteriorMean(18, 2)).toBeCloseTo(0.864, 3);
    expect(posteriorMean(0, 0)).toBe(0.5);
  });

  it("no history gives a wide interval", () => {
    const [lo, hi] = interval90(0, 0, makeRng(1));
    expect(lo).toBeLessThan(0.1);
    expect(hi).toBeGreaterThan(0.9);
  });

  it("a long good record gives a tight, high interval", () => {
    const [lo, hi] = interval90(18, 2, makeRng(1));
    expect(lo).toBeGreaterThan(0.6);
    expect(hi).toBeLessThan(1);
  });

  it("seeded draws are repeatable", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect(sampleBeta(3, 4, a)).toBe(sampleBeta(3, 4, b));
  });
});
