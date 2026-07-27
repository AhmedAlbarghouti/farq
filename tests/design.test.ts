import { execaSync } from "execa";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIAGRAM_STAGE_WIDTH,
  DEFAULT_MOCKUP_STAGE_WIDTH,
  DEFAULT_THEME,
  DIAGRAM_PANEL,
  MOCKUP_PANEL,
  STYLE_CONTRACT,
  buildDiagramDocument,
  buildMockupDocument,
  clampStageWidth,
  isThemeName,
  resolveTheme,
} from "../src/visual/design.js";
import { resolveChrome } from "../src/visual/chrome.js";
import { VIEWPORT_MAX_HEIGHT, VIEWPORT_MAX_WIDTH } from "../src/visual/viewport.js";

describe("resolveTheme", () => {
  it("falls back to the default theme for unknown names", () => {
    expect(resolveTheme({ theme: "neon-disco" }).name).toBe(DEFAULT_THEME);
  });

  it("applies an accent override", () => {
    const theme = resolveTheme({ theme: "daylight", accent: "#ff5722" });
    expect(theme.name).toBe("daylight");
    expect(theme.tokens.accent).toBe("#ff5722");
  });

  it("rejects accent values that could escape the declaration", () => {
    const theme = resolveTheme({ accent: "red;} body{display:none" });
    expect(theme.tokens.accent).not.toContain("display:none");
  });

  it("recognizes shipped theme names only", () => {
    expect(isThemeName("midnight")).toBe(true);
    expect(isThemeName("chartreuse")).toBe(false);
  });
});

describe("clampStageWidth", () => {
  it("defaults when the model omits or fumbles the width", () => {
    expect(clampStageWidth(undefined).width).toBe(DEFAULT_MOCKUP_STAGE_WIDTH);
    expect(clampStageWidth({ width: -5 }).width).toBe(DEFAULT_MOCKUP_STAGE_WIDTH);
    expect(clampStageWidth(undefined, "diagram").width).toBe(
      DEFAULT_DIAGRAM_STAGE_WIDTH,
    );
  });

  it("clamps mockups to a width that stays legible in the panel", () => {
    expect(clampStageWidth({ width: 10 }).width).toBe(320);
    expect(clampStageWidth({ width: 9000 }).width).toBe(900);
    // Worst allowed case still renders above two-thirds scale.
    expect(900 / MOCKUP_PANEL.width).toBeLessThan(1.5);
  });

  it("lets diagrams use the full-width panel", () => {
    expect(clampStageWidth({ width: 9000 }, "diagram").width).toBe(1600);
    expect(clampStageWidth({ width: 1200 }, "diagram").width).toBe(1200);
  });

  it("keeps the defaults near 1:1 in their panels", () => {
    expect(DEFAULT_MOCKUP_STAGE_WIDTH).toBeLessThanOrEqual(MOCKUP_PANEL.width);
    expect(DEFAULT_MOCKUP_STAGE_WIDTH / MOCKUP_PANEL.width).toBeGreaterThan(0.9);
    expect(DEFAULT_DIAGRAM_STAGE_WIDTH / DIAGRAM_PANEL.width).toBeGreaterThan(0.9);
  });
});

describe("buildMockupDocument", () => {
  const html = buildMockupDocument({
    theme: resolveTheme(),
    title: "Refund status on orders",
    css: ".card{color:var(--fq-text)}",
    beforeCss: ".card{opacity:.6}",
    afterCss: ".card{opacity:1}",
    beforeBody: '<div class="card">before</div>',
    afterBody: '<div class="card">after</div>',
    stageWidth: 900,
  });

  it("pins the document to the screenshot frame", () => {
    expect(html).toContain(`width:${VIEWPORT_MAX_WIDTH}px`);
    expect(html).toContain(`height:${VIEWPORT_MAX_HEIGHT}px`);
  });

  it("supplies tokens, labels and the badge so the model does not have to", () => {
    expect(html).toContain("--fq-accent:");
    expect(html).toContain(">Before<");
    expect(html).toContain(">After<");
    expect(html).toContain("generated preview");
    expect(html).toContain("Refund status on orders");
  });

  it("scopes per-state css to its own panel", () => {
    expect(html).toContain(".fq-panel--before .card{opacity:.6}");
    expect(html).toContain(".fq-panel--after .card{opacity:1}");
  });

  it("keeps shared css unscoped and honors the stage width", () => {
    expect(html).toContain(".card{color:var(--fq-text)}");
    expect(html).toContain("width:900px");
  });

  it("escapes the title", () => {
    const escaped = buildMockupDocument({
      theme: resolveTheme(),
      title: '<script>alert("x")</script>',
      beforeBody: "a",
      afterBody: "b",
    });
    expect(escaped).not.toContain('<script>alert("x")');
    expect(escaped).toContain("&lt;script&gt;");
  });
});

describe("buildDiagramDocument", () => {
  it("renders a single stage with the same chrome", () => {
    const html = buildDiagramDocument({
      theme: resolveTheme({ theme: "daylight" }),
      title: "API shape",
      css: ".col{gap:8px}",
      body: '<div class="col">x</div>',
    });
    expect(html).toContain("fq-body--single");
    expect(html).toContain("generated preview");
    expect(html).toContain("API shape");
  });
});

/**
 * MOCKUP_PANEL / DIAGRAM_PANEL are measured from the shell and quoted to the
 * model, so a shell layout change that moves them must not go unnoticed.
 * Skipped wherever Chrome is unavailable.
 */
function chromeOrNull(): string | null {
  try {
    return resolveChrome();
  } catch {
    return null;
  }
}

const chrome = chromeOrNull();

/** A cold Chrome start can take several seconds, well past vitest's default. */
const CHROME_TEST_TIMEOUT_MS = 60_000;
const CHROME_RUN_TIMEOUT_MS = 45_000;

describe.skipIf(!chrome)("measured panel sizes", () => {
  function measure(html: string): Array<{ width: number; height: number }> {
    const dir = mkdtempSync(join(tmpdir(), "farq-measure-"));
    try {
      const file = join(dir, "page.html");
      writeFileSync(file, html, "utf8");
      const { stdout } = execaSync(
        chrome!,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-first-run",
          `--window-size=${VIEWPORT_MAX_WIDTH},${VIEWPORT_MAX_HEIGHT}`,
          "--dump-dom",
          `file://${file}`,
        ],
        { timeout: CHROME_RUN_TIMEOUT_MS },
      );
      return [...stdout.matchAll(/data-fit="(\d+)x(\d+)@/g)].map((m) => ({
        width: Number(m[1]),
        height: Number(m[2]),
      }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it(
    "matches MOCKUP_PANEL for both panels",
    () => {
      const panels = measure(
        buildMockupDocument({
          theme: resolveTheme(),
          title: "Measure",
          beforeBody: "<p>x</p>",
          afterBody: "<p>x</p>",
        }),
      );
      expect(panels).toHaveLength(2);
      for (const panel of panels) {
        expect(panel).toEqual({
          width: MOCKUP_PANEL.width,
          height: MOCKUP_PANEL.height,
        });
      }
    },
    CHROME_TEST_TIMEOUT_MS,
  );

  it(
    "matches DIAGRAM_PANEL",
    () => {
      const panels = measure(
        buildDiagramDocument({
          theme: resolveTheme(),
          title: "Measure",
          body: "<p>x</p>",
        }),
      );
      expect(panels).toEqual([
        { width: DIAGRAM_PANEL.width, height: DIAGRAM_PANEL.height },
      ]);
    },
    CHROME_TEST_TIMEOUT_MS,
  );
});

describe("STYLE_CONTRACT", () => {
  it("names the tokens the prompts promise", () => {
    for (const token of [
      "--fq-accent",
      "--fq-text-muted",
      "--fq-font-display",
      "--fq-radius",
    ]) {
      expect(STYLE_CONTRACT).toContain(token);
    }
  });
});
