import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

vi.mock("../src/tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/tools.js")>();
  return {
    ...actual,
    resolveGh: () => "gh",
  };
});

import { execa } from "execa";
import { openPullRequest } from "../src/open-pr.js";
import { FAKE_SUMMARY } from "../src/providers/index.js";

const mocked = vi.mocked(execa);

describe("openPullRequest", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("skips create when on default branch", async () => {
    mocked.mockImplementation(async (cmd: string, args: string[] = []) => {
      if (cmd === "git" && args[0] === "rev-parse") {
        return { stdout: "main" } as never;
      }
      if (cmd === "gh" && args.includes("defaultBranchRef")) {
        return { stdout: "main" } as never;
      }
      return { stdout: "" } as never;
    });

    const result = await openPullRequest({
      cwd: process.cwd(),
      summary: FAKE_SUMMARY,
      bodyMarkdown: "body",
    });
    expect(result.skipped).toBe(true);
    if (result.skipped) expect(result.reason).toMatch(/Already on main/);
  });

  it("updates an existing PR instead of creating", async () => {
    const calls: string[] = [];
    mocked.mockImplementation(async (cmd: string, args: string[] = []) => {
      const key = [cmd, ...args].join(" ");
      calls.push(key);
      if (cmd === "git" && args[0] === "rev-parse") {
        return { stdout: "feature" } as never;
      }
      if (cmd === "gh" && args.includes("defaultBranchRef")) {
        return { stdout: "main" } as never;
      }
      if (cmd === "gh" && args[0] === "pr" && args[1] === "view" && args.includes("--json")) {
        return {
          stdout: JSON.stringify({
            number: 2,
            url: "https://github.com/x/y/pull/2",
          }),
          exitCode: 0,
        } as never;
      }
      if (cmd === "gh" && args[0] === "pr" && args[1] === "edit") {
        return { stdout: "", exitCode: 0 } as never;
      }
      if (cmd === "gh" && args[0] === "pr" && args[1] === "view" && args.includes("--web")) {
        return { stdout: "", exitCode: 0 } as never;
      }
      return { stdout: "", exitCode: 0 } as never;
    });

    const result = await openPullRequest({
      cwd: process.cwd(),
      summary: FAKE_SUMMARY,
      bodyMarkdown: "### Changes\n\n- thing\n",
    });

    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.action).toBe("updated");
      expect(result.url).toContain("/pull/2");
    }
    expect(calls.some((c) => c.includes("git push -u origin HEAD"))).toBe(true);
    expect(calls.some((c) => c.includes("pr edit 2"))).toBe(true);
    expect(calls.some((c) => c.includes("pr create"))).toBe(false);
  });

  it("creates a PR when none exists", async () => {
    const calls: string[] = [];
    mocked.mockImplementation(async (cmd: string, args: string[] = []) => {
      const key = [cmd, ...args].join(" ");
      calls.push(key);
      if (cmd === "git" && args[0] === "rev-parse") {
        return { stdout: "feature" } as never;
      }
      if (cmd === "gh" && args.includes("defaultBranchRef")) {
        return { stdout: "main" } as never;
      }
      if (cmd === "gh" && args[0] === "pr" && args[1] === "view" && args.includes("--json")) {
        return { stdout: "", exitCode: 1 } as never;
      }
      if (cmd === "gh" && args[0] === "pr" && args[1] === "create") {
        return {
          stdout: "https://github.com/x/y/pull/9",
          exitCode: 0,
        } as never;
      }
      return { stdout: "", exitCode: 0 } as never;
    });

    const result = await openPullRequest({
      cwd: process.cwd(),
      summary: FAKE_SUMMARY,
      bodyMarkdown: "body",
    });

    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.action).toBe("created");
      expect(result.url).toContain("/pull/9");
    }
    expect(calls.some((c) => c.includes("git push -u origin HEAD"))).toBe(true);
    expect(calls.some((c) => c.includes("pr create"))).toBe(true);
    expect(calls.some((c) => c.includes("pr edit"))).toBe(false);
  });

  it("fails clearly when git push fails", async () => {
    mocked.mockImplementation(async (cmd: string, args: string[] = []) => {
      if (cmd === "git" && args[0] === "rev-parse") {
        return { stdout: "feature" } as never;
      }
      if (cmd === "gh" && args.includes("defaultBranchRef")) {
        return { stdout: "main" } as never;
      }
      if (cmd === "git" && args[0] === "push") {
        throw new Error("Permission denied");
      }
      return { stdout: "", exitCode: 0 } as never;
    });

    await expect(
      openPullRequest({
        cwd: process.cwd(),
        summary: FAKE_SUMMARY,
        bodyMarkdown: "body",
      }),
    ).rejects.toThrow(/git push failed/);
  });
});
