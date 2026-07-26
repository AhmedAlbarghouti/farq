import { describe, expect, it } from "vitest";
import { renderPr } from "../src/render/pr.js";
import { renderSlack } from "../src/render/slack.js";
import { renderJson } from "../src/render/json.js";
import { FAKE_SUMMARY } from "../src/providers/index.js";

describe("renderers", () => {
  it("pr puts title on first line and can embed image", () => {
    const out = renderPr({
      summary: FAKE_SUMMARY,
      imagePath: ".farq/before-after.png",
    });
    const first = out.split("\n")[0];
    expect(first).toBe(FAKE_SUMMARY.headline);
    expect(out).toContain("](.farq/before-after.png)");
    expect(out).toContain("### Changes");
  });

  it("slack uses mrkdwn emoji lines and no image", () => {
    const out = renderSlack(FAKE_SUMMARY);
    expect(out).toContain(`*${FAKE_SUMMARY.headline}*`);
    expect(out).toContain(":sparkles:");
    expect(out).not.toContain(".png");
  });

  it("json includes images array", () => {
    const out = renderJson(FAKE_SUMMARY, [".farq/before-after.png"]);
    const parsed = JSON.parse(out) as { images: string[]; headline: string };
    expect(parsed.headline).toBe(FAKE_SUMMARY.headline);
    expect(parsed.images).toEqual([".farq/before-after.png"]);
  });
});
