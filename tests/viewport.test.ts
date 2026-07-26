import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEWPORT,
  VIEWPORT_MAX_HEIGHT,
  VIEWPORT_MAX_WIDTH,
  clampViewport,
} from "../src/visual/viewport.js";

describe("clampViewport", () => {
  it("defaults to the max frame", () => {
    expect(clampViewport()).toEqual(DEFAULT_VIEWPORT);
    expect(clampViewport(null)).toEqual(DEFAULT_VIEWPORT);
  });

  it("clamps oversized dimensions", () => {
    expect(clampViewport({ width: 2400, height: 2000 })).toEqual({
      width: VIEWPORT_MAX_WIDTH,
      height: VIEWPORT_MAX_HEIGHT,
    });
  });

  it("keeps smaller valid sizes", () => {
    expect(clampViewport({ width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("rejects non-positive values", () => {
    expect(clampViewport({ width: 0, height: -10 })).toEqual(DEFAULT_VIEWPORT);
  });
});
