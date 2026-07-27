import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../src/concurrency.js";

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const delays = [30, 5, 20, 1];
    const out = await mapWithConcurrency(delays, 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it("never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBe(3);
  });

  it("actually runs work in parallel", async () => {
    const started = Date.now();
    await mapWithConcurrency([20, 20, 20], 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
    });
    expect(Date.now() - started).toBeLessThan(55);
  });

  it("handles an empty list and a silly limit", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n * 2)).toEqual([
      2, 4,
    ]);
  });
});
