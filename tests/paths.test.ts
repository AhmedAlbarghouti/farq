import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cacheRoot, defaultOutDir, displayImageRef } from "../src/paths.js";

describe("defaultOutDir", () => {
  it("is outside the repo cwd", () => {
    const cwd = resolve("/tmp/my-repo");
    const out = defaultOutDir(cwd, {
      FARQ_CACHE_DIR: "C:\\farq-cache-root",
      LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local",
    } as NodeJS.ProcessEnv);
    expect(out.startsWith(resolve("C:\\farq-cache-root"))).toBe(true);
    expect(out.includes("my-repo") || out.length > 10).toBe(true);
    expect(resolve(out).startsWith(resolve(cwd) + "\\") || resolve(out) === resolve(cwd)).toBe(
      false,
    );
  });

  it("is stable for the same cwd", () => {
    const env = { FARQ_CACHE_DIR: "/tmp/farq-cache" } as NodeJS.ProcessEnv;
    expect(defaultOutDir("/proj/a", env)).toBe(defaultOutDir("/proj/a", env));
    expect(defaultOutDir("/proj/a", env)).not.toBe(defaultOutDir("/proj/b", env));
  });
});

describe("cacheRoot", () => {
  it("honors FARQ_CACHE_DIR", () => {
    expect(cacheRoot({ FARQ_CACHE_DIR: "/custom/cache" } as NodeJS.ProcessEnv)).toBe(
      resolve("/custom/cache"),
    );
  });
});

describe("displayImageRef", () => {
  it("keeps in-repo paths relative", () => {
    const cwd = resolve("/repo");
    expect(displayImageRef(cwd, join(cwd, ".farq", "before-after.png"))).toBe(
      ".farq/before-after.png",
    );
  });

  it("uses absolute path when outside the repo", () => {
    const cwd = resolve("/repo");
    const abs = resolve("/cache/abc/before-after.png");
    expect(displayImageRef(cwd, abs)).toBe(abs);
  });
});
