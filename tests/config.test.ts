import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, mergeConfig, sanitize } from "../src/config.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "farq-config-"));
  dirs.push(d);
  return d;
}

describe("loadConfig", () => {
  it("returns empty config when no files exist", () => {
    const cwd = tempDir();
    const globalDir = tempDir();
    expect(loadConfig({ cwd, globalDir })).toEqual({});
  });

  it("loads project .farqrc.json", () => {
    const cwd = tempDir();
    writeFileSync(
      join(cwd, ".farqrc.json"),
      JSON.stringify({ provider: "opencode", tone: "client" }),
    );
    expect(loadConfig({ cwd, globalDir: tempDir() })).toEqual({
      provider: "opencode",
      tone: "client",
    });
  });

  it("loads project .farqrc", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".farqrc"), JSON.stringify({ provider: "claude" }));
    expect(loadConfig({ cwd, globalDir: tempDir() }).provider).toBe("claude");
  });

  it("loads global config", () => {
    const globalDir = tempDir();
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, "config.json"),
      JSON.stringify({
        provider: "claude",
        models: { claudeCheap: "haiku", opencodeCheap: "cheap" },
      }),
    );
    expect(loadConfig({ cwd: tempDir(), globalDir })).toEqual({
      provider: "claude",
      models: { claudeCheap: "haiku", opencodeCheap: "cheap" },
    });
  });

  it("project overrides global", () => {
    const cwd = tempDir();
    const globalDir = tempDir();
    writeFileSync(
      join(globalDir, "config.json"),
      JSON.stringify({ provider: "claude", tone: "technical" }),
    );
    writeFileSync(
      join(cwd, ".farqrc.json"),
      JSON.stringify({ provider: "opencode" }),
    );
    expect(loadConfig({ cwd, globalDir })).toEqual({
      provider: "opencode",
      tone: "technical",
    });
  });
});

describe("mergeConfig", () => {
  it("flag overrides project and global", () => {
    const merged = mergeConfig(
      { provider: "claude", tone: "technical" },
      { provider: "fake", tone: "client" },
    );
    expect(merged).toEqual({ provider: "fake", tone: "client" });
  });

  it("keeps base when flag fields are undefined", () => {
    const merged = mergeConfig(
      { provider: "claude", models: { claudeCheap: "haiku" } },
      { tone: "client" },
    );
    expect(merged).toEqual({
      provider: "claude",
      tone: "client",
      models: { claudeCheap: "haiku" },
    });
  });
});

describe("sanitize (Zod)", () => {
  it("keeps valid fields and drops invalid ones", () => {
    expect(
      sanitize({
        provider: "nope",
        tone: "client",
        visual: {
          theme: "midnight",
          accent: "  #0af  ",
          maxTopics: 2.9,
          concurrency: 0,
          unknown: true,
        },
        extra: 1,
      }),
    ).toEqual({
      tone: "client",
      visual: {
        theme: "midnight",
        accent: "#0af",
        maxTopics: 2,
      },
    });
  });

  it("returns empty object for non-objects", () => {
    expect(sanitize(null)).toEqual({});
    expect(sanitize("x")).toEqual({});
  });
});
