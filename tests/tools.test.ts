import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  isHostedImageUrl,
  resolveExecutable,
  resolveGh,
  resetGhCache,
  stripLocalImageNote,
  ToolNotFoundError,
} from "../src/tools.js";

describe("isHostedImageUrl", () => {
  it("detects http(s) URLs", () => {
    expect(isHostedImageUrl("https://example.com/a.png")).toBe(true);
    expect(isHostedImageUrl("http://example.com/a.png")).toBe(true);
    expect(isHostedImageUrl(".farq/before-after.png")).toBe(false);
  });
});

describe("stripLocalImageNote", () => {
  it("removes the italic local-path note", () => {
    const body =
      "### Before / After\n\n![x](https://ex/a.png)\n\n_Local image path - attach the file when pasting into GitHub if it does not render._\n\n### Changes\n";
    const out = stripLocalImageNote(body);
    expect(out).not.toContain("Local image path");
    expect(out).toContain("https://ex/a.png");
    expect(out).toContain("### Changes");
  });
});

describe("resolveExecutable / resolveGh", () => {
  const dirs: string[] = [];

  afterEach(() => {
    resetGhCache();
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("finds a binary on PATH", () => {
    const dir = mkdtempSync(join(tmpdir(), "farq-bin-"));
    dirs.push(dir);
    const name = process.platform === "win32" ? "fakegh.exe" : "fakegh";
    const bin = join(dir, name);
    writeFileSync(bin, "");
    const resolved = resolveExecutable(["fakegh", "fakegh.exe"], {
      env: {
        PATH: dir,
        Path: dir,
        PATHEXT: ".EXE;.CMD",
      },
      notFoundMessage: "missing",
    });
    expect(resolved).toBe(bin);
  });

  it("falls back to extraPaths", () => {
    const dir = mkdtempSync(join(tmpdir(), "farq-extra-"));
    dirs.push(dir);
    const bin = join(dir, "gh.exe");
    writeFileSync(bin, "");
    const resolved = resolveExecutable(["gh", "gh.exe"], {
      env: { PATH: "", Path: "", PATHEXT: ".EXE" },
      extraPaths: [bin],
      notFoundMessage: "missing",
    });
    expect(resolved).toBe(bin);
  });

  it("honors GH_PATH", () => {
    const dir = mkdtempSync(join(tmpdir(), "farq-gh-"));
    dirs.push(dir);
    const bin = join(dir, "gh.exe");
    writeFileSync(bin, "");
    resetGhCache();
    expect(
      resolveGh({
        GH_PATH: bin,
        PATH: "",
        Path: "",
      } as NodeJS.ProcessEnv),
    ).toBe(bin);
  });

  it("throws ToolNotFoundError when missing", () => {
    expect(() =>
      resolveExecutable(["nope-bin"], {
        env: { PATH: "", Path: "" },
        notFoundMessage: "nope",
      }),
    ).toThrow(ToolNotFoundError);
  });
});
