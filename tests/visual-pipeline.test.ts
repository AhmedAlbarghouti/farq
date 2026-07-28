import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/visual/chrome.js", () => ({
  resolveChrome: vi.fn(() => "/fake/chrome"),
  screenshotHtml: vi.fn(async ({ outPath }: { outPath: string }) => {
    writeFileSync(outPath, "fake-png");
  }),
  ChromeError: class ChromeError extends Error {
    name = "ChromeError";
  },
}));

vi.mock("../src/visual/cluster.js", () => ({
  clusterVisualTopics: vi.fn(),
}));

vi.mock("../src/visual/mockup.js", () => ({
  generateMockup: vi.fn(),
}));

vi.mock("../src/visual/diagram.js", () => ({
  generateDiagram: vi.fn(),
}));

vi.mock("../src/visual/compose.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/visual/compose.js")>();
  return {
    ...actual,
    composeBeforeAfter: vi.fn(),
  };
});

import { runVisualPipeline } from "../src/visual/pipeline.js";
import { resolveChrome, screenshotHtml } from "../src/visual/chrome.js";
import { clusterVisualTopics } from "../src/visual/cluster.js";
import { generateMockup } from "../src/visual/mockup.js";
import { generateDiagram } from "../src/visual/diagram.js";
import { composeBeforeAfter, ChromeError } from "../src/visual/compose.js";
import { FAKE_SUMMARY } from "../src/providers/index.js";
import type { Provider } from "../src/providers/index.js";
import type { GatherDiffResult } from "../src/git.js";

const mockedResolveChrome = vi.mocked(resolveChrome);
const mockedScreenshot = vi.mocked(screenshotHtml);
const mockedCluster = vi.mocked(clusterVisualTopics);
const mockedMockup = vi.mocked(generateMockup);
const mockedDiagram = vi.mocked(generateDiagram);
const mockedCompose = vi.mocked(composeBeforeAfter);

const dirs: string[] = [];

afterEach(() => {
  vi.clearAllMocks();
  mockedResolveChrome.mockReturnValue("/fake/chrome");
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "farq-pipe-"));
  dirs.push(d);
  return d;
}

function fakeProvider(): Provider {
  return { name: "fake", complete: async () => "{}" };
}

function baseDiff(files: GatherDiffResult["files"]): GatherDiffResult {
  return {
    mode: "range",
    baseRef: "main",
    headRef: "HEAD",
    range: "main..HEAD",
    files,
    commits: [],
    truncated: false,
    diffText: files.map((f) => `diff --git a/${f.path} b/${f.path}`).join("\n"),
  };
}

describe("runVisualPipeline", () => {
  it("returns empty when noImages is set", async () => {
    const result = await runVisualPipeline({
      summary: FAKE_SUMMARY,
      diff: baseDiff([]),
      provider: fakeProvider(),
      noImages: true,
      outDir: tempDir(),
    });
    expect(result.images).toEqual([]);
    expect(result.softDegraded).toBe(false);
    expect(mockedCluster).not.toHaveBeenCalled();
  });

  it("soft-degrades when Chrome is missing", async () => {
    mockedResolveChrome.mockImplementation(() => {
      throw new Error("Chrome not found — install Google Chrome");
    });
    const result = await runVisualPipeline({
      summary: FAKE_SUMMARY,
      diff: baseDiff([
        { path: "src/Button.tsx", status: "M", patch: "+x" },
      ]),
      provider: fakeProvider(),
      outDir: tempDir(),
    });
    expect(result.images).toEqual([]);
    expect(result.softDegraded).toBe(true);
    expect(result.warning).toMatch(/Chrome not found/);
    expect(mockedCluster).not.toHaveBeenCalled();
  });

  it("returns empty when clustering yields no topics", async () => {
    mockedCluster.mockResolvedValueOnce([]);
    const result = await runVisualPipeline({
      summary: FAKE_SUMMARY,
      diff: baseDiff([
        { path: "src/Button.tsx", status: "M", patch: "+x" },
      ]),
      provider: fakeProvider(),
      outDir: tempDir(),
      visualFiles: [],
    });
    expect(result.images).toEqual([]);
    expect(result.softDegraded).toBe(false);
    expect(mockedMockup).not.toHaveBeenCalled();
  });

  it("renders a mockup topic through screenshot", async () => {
    const outDir = tempDir();
    const htmlPath = join(outDir, "visual-1-after.html");
    writeFileSync(htmlPath, "<html></html>");

    mockedCluster.mockResolvedValueOnce([
      {
        id: 1,
        title: "Button polish",
        items: FAKE_SUMMARY.items,
        files: ["src/Button.tsx"],
      },
    ]);
    mockedMockup.mockResolvedValueOnce({
      feasible: true,
      htmlPath,
    });

    const events: string[] = [];
    const result = await runVisualPipeline({
      summary: FAKE_SUMMARY,
      diff: baseDiff([
        { path: "src/Button.tsx", status: "M", patch: "+className" },
      ]),
      provider: fakeProvider(),
      outDir,
      visualFiles: [
        { path: "src/Button.tsx", before: "<button/>", after: "<button class='x'/>" },
      ],
      onProgress: (e) => events.push(e.kind),
    });

    expect(result.images).toHaveLength(1);
    expect(result.imageMeta[0]?.title).toBe("Button polish");
    expect(existsSync(result.images[0]!)).toBe(true);
    expect(readFileSync(result.images[0]!, "utf8")).toBe("fake-png");
    expect(mockedScreenshot).toHaveBeenCalledOnce();
    expect(events).toContain("topics");
    expect(events).toContain("topic-start");
    expect(events).toContain("topic-shot");
    expect(events).toContain("topic-done");
  });

  it("falls back to diagram when mockup is infeasible", async () => {
    const outDir = tempDir();
    const htmlPath = join(outDir, "visual-1-diagram.html");
    writeFileSync(htmlPath, "<html></html>");

    mockedCluster.mockResolvedValueOnce([
      {
        id: 1,
        title: "API route",
        items: FAKE_SUMMARY.items,
        files: ["src/Button.tsx"],
      },
    ]);
    mockedMockup.mockResolvedValueOnce({
      feasible: false,
      reason: "needs live data",
    });
    mockedDiagram.mockResolvedValueOnce({
      feasible: true,
      htmlPath,
    });

    const events: string[] = [];
    const result = await runVisualPipeline({
      summary: FAKE_SUMMARY,
      diff: baseDiff([
        { path: "src/Button.tsx", status: "M", patch: "+x" },
      ]),
      provider: fakeProvider(),
      outDir,
      visualFiles: [],
      onProgress: (e) => events.push(e.kind),
    });

    expect(result.images).toHaveLength(1);
    expect(mockedDiagram).toHaveBeenCalledOnce();
    expect(events).toContain("topic-fallback");
  });

  it("soft-degrades when a topic throws", async () => {
    mockedCluster.mockResolvedValueOnce([
      {
        id: 1,
        title: "Broken topic",
        items: FAKE_SUMMARY.items,
        files: ["src/Button.tsx"],
      },
    ]);
    mockedMockup.mockRejectedValueOnce(new Error("model timeout"));

    const result = await runVisualPipeline({
      summary: FAKE_SUMMARY,
      diff: baseDiff([
        { path: "src/Button.tsx", status: "M", patch: "+x" },
      ]),
      provider: fakeProvider(),
      outDir: tempDir(),
      visualFiles: [],
    });

    expect(result.images).toEqual([]);
    expect(result.softDegraded).toBe(true);
    expect(result.warning).toMatch(/Broken topic/);
    expect(result.warning).toMatch(/model timeout/);
  });

  it("composes manual before/after shots", async () => {
    const outDir = tempDir();
    const before = join(outDir, "in-before.png");
    const after = join(outDir, "in-after.png");
    writeFileSync(before, "b");
    writeFileSync(after, "a");
    const composed = join(outDir, "visual-1.png");
    mockedCompose.mockResolvedValueOnce(composed);

    const result = await runVisualPipeline({
      summary: FAKE_SUMMARY,
      diff: baseDiff([]),
      provider: fakeProvider(),
      outDir,
      before,
      after,
    });

    expect(result.images).toEqual([composed]);
    expect(result.imageMeta[0]?.title).toBe("before / after");
    expect(mockedCluster).not.toHaveBeenCalled();
    expect(mockedCompose).toHaveBeenCalledOnce();
  });

  it("rethrows ChromeError for failed manual compose", async () => {
    const outDir = tempDir();
    const before = join(outDir, "in-before.png");
    const after = join(outDir, "in-after.png");
    writeFileSync(before, "b");
    writeFileSync(after, "a");
    mockedCompose.mockRejectedValueOnce(new Error("chrome died"));

    await expect(
      runVisualPipeline({
        summary: FAKE_SUMMARY,
        diff: baseDiff([]),
        provider: fakeProvider(),
        outDir,
        before,
        after,
      }),
    ).rejects.toBeInstanceOf(ChromeError);
  });
});
