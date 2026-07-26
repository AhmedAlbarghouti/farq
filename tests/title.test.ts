import { describe, expect, it } from "vitest";
import { inferTitleConvention, truncateTitle } from "../src/title.js";

describe("truncateTitle", () => {
  it("returns title unchanged when under limit", () => {
    expect(truncateTitle("Short title", 256)).toEqual({
      title: "Short title",
      overflow: "",
    });
  });

  it("truncates at 256 with ellipsis and returns overflow", () => {
    const long = "a".repeat(300);
    const { title, overflow } = truncateTitle(long, 256);
    expect(title.length).toBe(256);
    expect(title.endsWith("...")).toBe(true);
    expect(overflow.length).toBeGreaterThan(0);
    expect(title.slice(0, -3) + overflow).toContain("aaa");
  });

  it("prefers a word boundary when truncating", () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const { title } = truncateTitle(words, 50);
    expect(title.endsWith("...")).toBe(true);
    expect(title.slice(0, -3)).not.toMatch(/\s$/);
    expect(title.length).toBeLessThanOrEqual(50);
  });
});

describe("inferTitleConvention", () => {
  it("detects conventional commit prefixes", () => {
    const result = inferTitleConvention([
      "feat: add login",
      "fix: repair checkout",
      "feat(api): refunds",
      "chore: bump deps",
    ]);
    expect(result.kind).toBe("conventional");
    expect(result.blurb.toLowerCase()).toContain("conventional");
  });

  it("detects ticket prefixes", () => {
    const result = inferTitleConvention([
      "[PROJ-123] Add filters",
      "[PROJ-124] Fix crash",
      "[PROJ-125] Docs",
    ]);
    expect(result.kind).toBe("ticket");
    expect(result.blurb.toLowerCase()).toMatch(/ticket|prefix|\[/);
  });

  it("returns none when samples are mixed/plain", () => {
    const result = inferTitleConvention([
      "Update readme",
      "misc changes",
      "WIP",
    ]);
    expect(result.kind).toBe("none");
  });
});
