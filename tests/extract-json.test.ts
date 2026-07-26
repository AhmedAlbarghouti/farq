import { describe, expect, it } from "vitest";
import { extractJson } from "../src/extract-json.js";

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences", () => {
    const text = "```json\n{\"a\":1}\n```";
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it("strips leading prose and grabs outermost object", () => {
    const text = 'Here is the result:\n{"headline":"x","nested":{"y":2}}\nThanks!';
    expect(extractJson(text)).toEqual({ headline: "x", nested: { y: 2 } });
  });

  it("throws when no JSON object is present", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
