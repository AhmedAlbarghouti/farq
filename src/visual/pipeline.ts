import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChangeSummary } from "../schema.js";
import type { Provider } from "../providers/index.js";
import type { GatherDiffResult } from "../git.js";
import { gatherVisualFileContents } from "../git.js";
import { decideGate } from "./gate.js";
import { generateMockup } from "./mockup.js";
import { generateDiagram } from "./diagram.js";
import { defaultOutDir } from "../paths.js";
import { composeBeforeAfter, ChromeError } from "./compose.js";
import { screenshotHtml, resolveChrome } from "./chrome.js";

export type VisualPipelineResult = {
  imagePath: string | null;
  images: string[];
  softDegraded: boolean;
  warning?: string;
};

export type VisualPipelineOptions = {
  cwd?: string;
  outDir?: string;
  summary: ChangeSummary;
  diff: GatherDiffResult;
  provider: Provider;
  modelCheap?: string;
  noImages?: boolean;
  before?: string;
  after?: string;
  verbose?: boolean;
  log?: (msg: string) => void;
};

export async function runVisualPipeline(
  options: VisualPipelineOptions,
): Promise<VisualPipelineResult> {
  const cwd = options.cwd ?? process.cwd();
  const outDir = resolve(cwd, options.outDir ?? defaultOutDir(cwd));
  const log = options.log ?? (() => undefined);
  const vlog = (msg: string) => {
    if (options.verbose) log(msg);
  };

  if (options.noImages) {
    return { imagePath: null, images: [], softDegraded: false };
  }

  // Manual screenshots skip generation
  if (options.before && options.after) {
    try {
      mkdirSync(outDir, { recursive: true });
      const beforeCopy = join(outDir, "before.png");
      const afterCopy = join(outDir, "after.png");
      copyFileSync(options.before, beforeCopy);
      copyFileSync(options.after, afterCopy);
      const composed = await composeBeforeAfter({
        cwd,
        outDir,
        beforePath: beforeCopy,
        afterPath: afterCopy,
        badge: "before / after",
      });
      return { imagePath: composed, images: [composed], softDegraded: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ChromeError(msg);
    }
  }

  const gate = decideGate(options.diff.files);
  vlog(`visual gate: ${gate}`);
  if (gate === "none") {
    return { imagePath: null, images: [], softDegraded: false };
  }

  try {
    resolveChrome();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      imagePath: null,
      images: [],
      softDegraded: true,
      warning: msg,
    };
  }

  try {
    if (gate === "mockup") {
      const files = await gatherVisualFileContents(
        cwd,
        options.diff.files,
        options.diff.baseRef,
      );
      const mockup = await generateMockup({
        provider: options.provider,
        summary: options.summary,
        files,
        outDir,
        model: options.modelCheap,
        log: vlog,
      });
      if (mockup.feasible) {
        const beforePng = join(outDir, "before.png");
        const afterPng = join(outDir, "after.png");
        await screenshotHtml({
          url: pathToFileURL(mockup.beforePath).href,
          outPath: beforePng,
          width: mockup.viewport?.width,
          height: mockup.viewport?.height,
        });
        await screenshotHtml({
          url: pathToFileURL(mockup.afterPath).href,
          outPath: afterPng,
          width: mockup.viewport?.width,
          height: mockup.viewport?.height,
        });
        const composed = await composeBeforeAfter({
          cwd,
          outDir,
          beforePath: beforePng,
          afterPath: afterPng,
          badge: "generated preview",
        });
        return { imagePath: composed, images: [composed], softDegraded: false };
      }
      vlog(`mockup infeasible: ${mockup.reason}; trying diagram`);
    }

    // diagram path (gate=diagram or mockup downgrade)
    const diagram = await generateDiagram({
      provider: options.provider,
      summary: options.summary,
      diffText: options.diff.diffText,
      outDir,
      model: options.modelCheap,
      log: vlog,
    });
    if (!diagram.feasible) {
      vlog(`diagram infeasible: ${diagram.reason}`);
      return { imagePath: null, images: [], softDegraded: false };
    }
    const outPng = join(outDir, "before-after.png");
    await screenshotHtml({
      url: pathToFileURL(diagram.htmlPath).href,
      outPath: outPng,
    });
    return { imagePath: outPng, images: [outPng], softDegraded: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      imagePath: null,
      images: [],
      softDegraded: true,
      warning: msg,
    };
  }
}
