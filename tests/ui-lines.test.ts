import { describe, expect, it } from "vitest";
import { linesFor } from "../src/ui/lines.js";

describe("linesFor", () => {
  it("names the provider in summarize lines", () => {
    for (const line of linesFor("summarize", "claude")) {
      expect(line).toContain("claude");
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it("keeps witty lines short", () => {
    for (const bank of ["summarize", "visual", "open", "diff"] as const) {
      for (const line of linesFor(bank, "opencode")) {
        expect(line.length).toBeLessThanOrEqual(42);
      }
    }
  });
});
