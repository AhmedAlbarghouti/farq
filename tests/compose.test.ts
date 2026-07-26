import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildComposeHtml,
  resolveChrome,
  ChromeError,
} from "../src/visual/compose.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

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
    const path = process.execPath;
    const resolved = resolveChrome({ CHROME_PATH: path } as NodeJS.ProcessEnv);
    expect(resolved).toBe(path);
  });

  it("throws ChromeError when missing", () => {
    expect(() =>
      resolveChrome({
        CHROME_PATH: "C:\\\\definitely\\\\missing\\\\chrome.exe",
        LOCALAPPDATA: "C:\\\\definitely\\\\missing",
        PATH: "",
        Path: "",
        ProgramFiles: "C:\\\\definitely\\\\missing",
        "ProgramFiles(x86)": "C:\\\\definitely\\\\missing",
      } as NodeJS.ProcessEnv),
    ).toThrow(ChromeError);
  });

  it("finds chrome on PATH when present", () => {
    const dir = mkdtempSync(join(tmpdir(), "farq-chrome-"));
    dirs.push(dir);
    const name = process.platform === "win32" ? "chrome.exe" : "google-chrome";
    const bin = join(dir, name);
    writeFileSync(bin, "");
    const resolved = resolveChrome({
      PATH: dir,
      Path: dir,
      PATHEXT: ".EXE;.CMD",
      LOCALAPPDATA: "C:\\\\definitely\\\\missing",
      ProgramFiles: "C:\\\\definitely\\\\missing",
      "ProgramFiles(x86)": "C:\\\\definitely\\\\missing",
    } as NodeJS.ProcessEnv);
    expect(resolved).toBe(bin);
  });
});
