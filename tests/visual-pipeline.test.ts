import { describe, expect, it, vi } from "vitest";
import { decideGate } from "../src/visual/gate.js";
import { generateMockup } from "../src/visual/mockup.js";
import { generateDiagram } from "../src/visual/diagram.js";
import { FAKE_SUMMARY } from "../src/providers/index.js";
import type { Provider } from "../src/providers/index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("visual generation cascade", () => {
  it("mockup feasible:false triggers diagram-shaped follow-up via provider calls", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ feasible: false, reason: "needs live data" }))
      .mockResolvedValueOnce(
        JSON.stringify({
          feasible: true,
          html: "<html><body>diagram</body></html>",
        }),
      );

    const provider: Provider = { name: "fake", complete };
    const dir = mkdtempSync(join(tmpdir(), "farq-vis-"));
    try {
      const mockup = await generateMockup({
        provider,
        summary: FAKE_SUMMARY,
        files: [{ path: "a.tsx", before: "<div/>", after: "<div class='x'/>" }],
        outDir: dir,
      });
      expect(mockup.feasible).toBe(false);

      const diagram = await generateDiagram({
        provider,
        summary: FAKE_SUMMARY,
        diffText: "diff",
        outDir: dir,
      });
      expect(diagram.feasible).toBe(true);
      expect(complete).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("diagram feasible:false yields no image artifact", async () => {
    const provider: Provider = {
      name: "fake",
      complete: async () =>
        JSON.stringify({ feasible: false, reason: "too abstract" }),
    };
    const dir = mkdtempSync(join(tmpdir(), "farq-vis-"));
    try {
      const diagram = await generateDiagram({
        provider,
        summary: FAKE_SUMMARY,
        diffText: "diff",
        outDir: dir,
      });
      expect(diagram.feasible).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
