import { describe, expect, it } from "vitest";
import { buildComposeHtml, resolveChrome, ChromeError } from "../src/visual/compose.js";

describe("buildComposeHtml", () => {
  it("embeds base64 images and badge text", () => {
    const html = buildComposeHtml({
      beforeBase64: "AAA",
      afterBase64: "BBB",
      badge: "generated preview",
    });
    expect(html).toContain("data:image/png;base64,AAA");
    expect(html).toContain("data:image/png;base64,BBB");
    expect(html).toContain("generated preview");
    expect(html).not.toContain("file://");
  });
});

describe("resolveChrome", () => {
  it("honors CHROME_PATH when the file exists", () => {
    // Use this test file as a stand-in path that exists
    const path = process.execPath;
    const resolved = resolveChrome({ CHROME_PATH: path } as NodeJS.ProcessEnv);
    expect(resolved).toBe(path);
  });

  it("throws ChromeError when missing", () => {
    expect(() =>
      resolveChrome({
        CHROME_PATH: "C:\\\\definitely\\\\missing\\\\chrome.exe",
        LOCALAPPDATA: "C:\\\\definitely\\\\missing",
      } as NodeJS.ProcessEnv),
    ).toThrow(ChromeError);
  });
});
