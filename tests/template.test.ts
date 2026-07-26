import { describe, expect, it } from "vitest";
import { fillPrTemplate } from "../src/template.js";
import { FAKE_SUMMARY } from "../src/providers/index.js";

describe("fillPrTemplate", () => {
  it("fills Summary and Test plan sections", () => {
    const template = `# Summary\n\nTODO\n\n# Test plan\n\n- [ ]\n`;
    const { title, body } = fillPrTemplate({
      template,
      summary: FAKE_SUMMARY,
      bodyMarkdown: "ignored",
    });
    expect(title).toBe(FAKE_SUMMARY.headline);
    expect(body).toContain(FAKE_SUMMARY.overview);
    expect(body).toMatch(/Test plan/i);
    expect(body).toContain("Verify:");
  });

  it("puts title overflow into the body", () => {
    const long = "word ".repeat(80).trim();
    const { title, body } = fillPrTemplate({
      template: null,
      summary: { ...FAKE_SUMMARY, headline: long },
      bodyMarkdown: "body",
    });
    expect(title.length).toBeLessThanOrEqual(256);
    expect(title.endsWith("...")).toBe(true);
    expect(body.length).toBeGreaterThan(10);
  });

  it("uses image URL when provided", () => {
    const { body } = fillPrTemplate({
      template: null,
      summary: FAKE_SUMMARY,
      bodyMarkdown: "### Before / After\n\n![x](.farq/before-after.png)\n",
      imageUrl: "https://example.com/a.png",
    });
    expect(body).toContain("https://example.com/a.png");
  });

  it("strips local image note when substituting hosted URL", () => {
    const { body } = fillPrTemplate({
      template: null,
      summary: FAKE_SUMMARY,
      bodyMarkdown:
        "### Before / After\n\n![x](.farq/before-after.png)\n\n_Local image path - attach the file when pasting into GitHub if it does not render._\n\n### Changes\n",
      imageUrl: "https://github.com/x/y/releases/download/t/a.png",
    });
    expect(body).toContain("https://github.com/x/y/releases/download/t/a.png");
    expect(body).not.toContain("Local image path");
  });

  it("substitutes absolute cache image paths with hosted URL", () => {
    const { body } = fillPrTemplate({
      template: null,
      summary: FAKE_SUMMARY,
      bodyMarkdown:
        "### Before / After\n\n![x](C:\\Users\\me\\AppData\\Local\\farq\\cache\\abc\\before-after.png)\n",
      imageUrl: "https://example.com/a.png",
    });
    expect(body).toContain("https://example.com/a.png");
    expect(body).not.toContain("AppData");
  });
});
