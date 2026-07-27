import { describe, expect, it } from "vitest";
import { labelFor, linesFor, type LineBank } from "../src/ui/lines.js";

const BANKS: LineBank[] = [
  "diff",
  "summarize",
  "topics",
  "mockup",
  "diagram",
  "shoot",
  "visual",
  "open",
];

describe("linesFor", () => {
  it("names the provider in summarize lines", () => {
    for (const line of linesFor("summarize", "claude")) {
      expect(line).toContain("claude");
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it("keeps witty lines short for the longest provider name", () => {
    for (const bank of BANKS) {
      for (const line of linesFor(bank, "opencode")) {
        expect(line.length, `${bank}: ${line}`).toBeLessThanOrEqual(42);
      }
    }
  });

  it("leaves no unsubstituted placeholders", () => {
    for (const bank of BANKS) {
      for (const line of linesFor(bank, "claude")) {
        expect(line).not.toContain("{p}");
      }
    }
  });

  it("gives every bank enough lines to rotate", () => {
    for (const bank of BANKS) {
      expect(linesFor(bank).length, bank).toBeGreaterThanOrEqual(4);
    }
  });

  it("labels every stage honestly", () => {
    for (const bank of BANKS) {
      const label = labelFor(bank);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain("…");
    }
  });
});
