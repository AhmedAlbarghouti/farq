import { describe, expect, it } from "vitest";
import { scopeCss } from "../src/visual/css-scope.js";

describe("scopeCss", () => {
  it("prefixes plain selectors", () => {
    expect(scopeCss(".card{color:red}", ".panel")).toBe(".panel .card{color:red}");
  });

  it("prefixes every selector in a list", () => {
    expect(scopeCss(".a,.b > .c{gap:4px}", ".panel")).toBe(
      ".panel .a,.panel .b > .c{gap:4px}",
    );
  });

  it("retargets root selectors at the panel instead of the page", () => {
    expect(scopeCss("body{background:blue}", ".panel")).toBe(
      ".panel{background:blue}",
    );
    expect(scopeCss("html .card{margin:0}", ".panel")).toBe(
      ".panel .card{margin:0}",
    );
  });

  it("descends into media queries", () => {
    expect(scopeCss("@media (min-width:600px){.a{gap:8px}}", ".panel")).toBe(
      "@media (min-width:600px){.panel .a{gap:8px}}",
    );
  });

  it("leaves keyframes and font-face alone", () => {
    const css = "@keyframes spin{from{opacity:0}to{opacity:1}}";
    expect(scopeCss(css, ".panel")).toContain("@keyframes spin{");
    expect(scopeCss(css, ".panel")).not.toContain(".panel from");
  });

  it("ignores commas inside :is() and attribute selectors", () => {
    expect(scopeCss(':is(.a,.b) [data-x="1,2"]{gap:0}', ".panel")).toBe(
      '.panel :is(.a,.b) [data-x="1,2"]{gap:0}',
    );
  });

  it("strips comments and survives empty input", () => {
    expect(scopeCss("/* hi */ .a{gap:0}", ".panel")).toBe(".panel .a{gap:0}");
    expect(scopeCss("", ".panel")).toBe("");
  });

  it("keeps one panel's rules from leaking into the other", () => {
    const before = scopeCss(".badge{display:none}", ".fq-panel--before");
    expect(before).toBe(".fq-panel--before .badge{display:none}");
    expect(before).not.toContain("--after");
  });
});
