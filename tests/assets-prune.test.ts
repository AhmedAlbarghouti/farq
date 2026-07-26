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
import {
  assetTagForBranch,
  pruneOrphanedFarqAssets,
} from "../src/open-pr.js";

const mocked = vi.mocked(execa);

describe("assetTagForBranch", () => {
  it("slugifies branch names", () => {
    expect(assetTagForBranch("fix/foo-bar")).toBe("farq-assets-fix-foo-bar");
  });
});

describe("pruneOrphanedFarqAssets", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("deletes farq-assets tags with no open PR, keeps keepTag and open branches", async () => {
    const deleted: string[] = [];
    mocked.mockImplementation(async (_cmd: string, args: string[] = []) => {
      if (args[0] === "release" && args[1] === "list") {
        return {
          exitCode: 0,
          stdout: JSON.stringify([
            { tagName: "farq-assets-keep-me", isPrerelease: true },
            { tagName: "farq-assets-open-branch", isPrerelease: true },
            { tagName: "farq-assets-stale", isPrerelease: true },
            { tagName: "v0.0.1", isPrerelease: false },
          ]),
        } as never;
      }
      if (args[0] === "pr" && args[1] === "list") {
        return {
          exitCode: 0,
          stdout: JSON.stringify([{ headRefName: "open/branch" }]),
        } as never;
      }
      if (args[0] === "release" && args[1] === "delete") {
        deleted.push(args[2]);
        return { exitCode: 0, stdout: "" } as never;
      }
      return { exitCode: 0, stdout: "" } as never;
    });

    const result = await pruneOrphanedFarqAssets(
      process.cwd(),
      "farq-assets-keep-me",
    );
    expect(result).toEqual(["farq-assets-stale"]);
    expect(deleted).toEqual(["farq-assets-stale"]);
  });
});
