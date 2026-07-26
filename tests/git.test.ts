import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import {
  NoChangesError,
  gatherDiff,
  SUMMARY_DIFF_BUDGET,
} from "../src/git.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function initRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "farq-git-"));
  dirs.push(dir);
  await execa("git", ["init", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  await execa("git", ["config", "user.name", "Test"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# root\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-m", "initial"], { cwd: dir });
  return dir;
}

describe("gatherDiff", () => {
  it("throws NoChangesError when there are no changes", async () => {
    const dir = await initRepo();
    await expect(gatherDiff({ cwd: dir, range: "HEAD" })).rejects.toBeInstanceOf(
      NoChangesError,
    );
  });

  it("returns worktree changes when committed range is empty", async () => {
    const dir = await initRepo();
    writeFileSync(join(dir, "app.ts"), "export const x = 1;\n");
    const result = await gatherDiff({ cwd: dir });
    expect(result.mode).toBe("worktree");
    expect(result.files.some((f) => f.path === "app.ts")).toBe(true);
    expect(result.diffText).toContain("app.ts");
  });

  it("returns committed branch diff vs merge-base", async () => {
    const dir = await initRepo();
    await execa("git", ["checkout", "-b", "feature"], { cwd: dir });
    writeFileSync(join(dir, "feature.ts"), "export const y = 2;\n");
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-m", "feat: feature"], { cwd: dir });

    const result = await gatherDiff({ cwd: dir });
    expect(result.mode).toBe("range");
    expect(result.files.some((f) => f.path === "feature.ts")).toBe(true);
    expect(result.baseRef).toBeTruthy();
  });

  it("respects an explicit range", async () => {
    const dir = await initRepo();
    await execa("git", ["checkout", "-b", "feature"], { cwd: dir });
    writeFileSync(join(dir, "a.ts"), "a\n");
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-m", "a"], { cwd: dir });

    const result = await gatherDiff({ cwd: dir, range: "main..HEAD" });
    expect(result.diffText).toContain("a.ts");
  });

  it("caps summary diff near the budget", async () => {
    const dir = await initRepo();
    await execa("git", ["checkout", "-b", "feature"], { cwd: dir });
    const big = "x".repeat(SUMMARY_DIFF_BUDGET + 50_000);
    writeFileSync(join(dir, "big.txt"), big + "\n");
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-m", "big"], { cwd: dir });

    const result = await gatherDiff({ cwd: dir });
    expect(result.diffText.length).toBeLessThanOrEqual(SUMMARY_DIFF_BUDGET + 200);
    expect(result.truncated).toBe(true);
  });
});
