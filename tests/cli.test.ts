import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function repoWithChange(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "farq-cli-"));
  dirs.push(dir);
  await execa("git", ["init", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "t@example.com"], { cwd: dir });
  await execa("git", ["config", "user.name", "T"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# x\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-m", "init"], { cwd: dir });
  await execa("git", ["checkout", "-b", "feature"], { cwd: dir });
  writeFileSync(join(dir, "app.ts"), "export const n = 1;\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-m", "feat: app"], { cwd: dir });
  return dir;
}

const bin = join(process.cwd(), "dist", "index.js");

describe("cli", () => {
  it("farq pr --provider fake prints title and body", async () => {
    const dir = await repoWithChange();
    const result = await execa(
      process.execPath,
      [bin, "pr", "--provider", "fake", "--no-images"],
      { cwd: dir, reject: false },
    );
    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    const first = result.stdout.split("\n")[0];
    expect(first.length).toBeGreaterThan(0);
    expect(result.stdout).toContain("### Changes");
  });

  it("farq slack --provider fake prints mrkdwn", async () => {
    const dir = await repoWithChange();
    const result = await execa(
      process.execPath,
      [bin, "slack", "--provider", "fake"],
      { cwd: dir, reject: false },
    );
    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(/^\*/m);
    expect(result.stdout).toContain(":sparkles:");
  });

  it("farq pr --open on default branch skips create", async () => {
    const dir = mkdtempSync(join(tmpdir(), "farq-cli-"));
    dirs.push(dir);
    await execa("git", ["init", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    await execa("git", ["config", "user.name", "T"], { cwd: dir });
    writeFileSync(join(dir, "a.ts"), "1\n");
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-m", "a"], { cwd: dir });
    writeFileSync(join(dir, "b.ts"), "2\n");

    const result = await execa(
      process.execPath,
      [bin, "pr", "--provider", "fake", "--no-images", "--open"],
      { cwd: dir, reject: false },
    );
    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(result.stderr).toMatch(/Already on main|skipping PR/i);
  });
});
