import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

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
});
