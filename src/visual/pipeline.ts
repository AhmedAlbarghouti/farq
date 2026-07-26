import { copyFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChangeSummary } from "../schema.js";
import type { Provider } from "../providers/index.js";
import type { DiffFile, GatherDiffResult } from "../git.js";
import { gatherVisualFileContents } from "../git.js";
import { decideGate } from "./gate.js";
import { generateMockup } from "./mockup.js";
import { generateDiagram } from "./diagram.js";
import { clusterVisualTopics, type VisualTopic } from "./cluster.js";
import { defaultOutDir } from "../paths.js";
import { composeBeforeAfter, ChromeError } from "./compose.js";
import { screenshotHtml, resolveChrome } from "./chrome.js";
import { DEFAULT_VIEWPORT, clampViewport } from "./viewport.js";

export type VisualImage = {
  path: string;
  title: string;
};

export type VisualPipelineResult = {
  imagePath: string | null;
  images: string[];
  imageMeta: VisualImage[];
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
    return emptyResult(false);
  }

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
        outFileName: "visual-1.png",
      });
      return singleResult(composed, "before / after");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ChromeError(msg);
    }
  }

  try {
    resolveChrome();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...emptyResult(true),
      warning: msg,
    };
  }

  const topics = await clusterVisualTopics(options.summary, {
    provider: options.provider,
    model: options.modelCheap,
    log: vlog,
  });
  vlog(`visual topics: ${topics.length}`);
  if (topics.length === 0) {
    return emptyResult(false);
  }

  const imageMeta: VisualImage[] = [];
  const warnings: string[] = [];

  for (const topic of topics) {
    try {
      const path = await renderTopic({
        topic,
        cwd,
        outDir,
        summary: options.summary,
        diff: options.diff,
        provider: options.provider,
        modelCheap: options.modelCheap,
        vlog,
      });
      if (path) {
        imageMeta.push({ path, title: topic.title });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`topic "${topic.title}": ${msg}`);
      vlog(`topic failed: ${msg}`);
    }
  }

  if (imageMeta.length === 0) {
    return {
      ...emptyResult(warnings.length > 0),
      warning: warnings[0],
    };
  }

  return {
    imagePath: imageMeta[0]!.path,
    images: imageMeta.map((i) => i.path),
    imageMeta,
    softDegraded: warnings.length > 0,
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

async function renderTopic(options: {
  topic: VisualTopic;
  cwd: string;
  outDir: string;
  summary: ChangeSummary;
  diff: GatherDiffResult;
  provider: Provider;
  modelCheap?: string;
  vlog: (msg: string) => void;
}): Promise<string | null> {
  const { topic, cwd, outDir, provider, modelCheap, vlog } = options;
  const prefix = `visual-${topic.id}-`;
  const stem = `visual-${topic.id}`;
  const topicSummary = scopeSummary(options.summary, topic);
  const topicFiles = filterDiffFiles(options.diff.files, topic.files);

  const gate =
    topicFiles.length > 0
      ? decideGate(topicFiles)
      : decideGate(options.diff.files);
  vlog(`visual gate [${topic.id} ${topic.title}]: ${gate}`);
  if (gate === "none") return null;

  if (gate === "mockup") {
    const files = await gatherVisualFileContents(
      cwd,
      topicFiles.length > 0 ? topicFiles : options.diff.files,
      options.diff.baseRef,
    );
    const mockup = await generateMockup({
      provider,
      summary: topicSummary,
      files,
      outDir,
      model: modelCheap,
      log: vlog,
      filePrefix: prefix,
    });
    if (mockup.feasible) {
      const beforePng = join(outDir, `${prefix}before.png`);
      const afterPng = join(outDir, `${prefix}after.png`);
      const vp = clampViewport(mockup.viewport);
      await screenshotHtml({
        url: pathToFileURL(mockup.beforePath).href,
        outPath: beforePng,
        width: vp.width,
        height: vp.height,
      });
      await screenshotHtml({
        url: pathToFileURL(mockup.afterPath).href,
        outPath: afterPng,
        width: vp.width,
        height: vp.height,
      });
      return composeBeforeAfter({
        cwd,
        outDir,
        beforePath: beforePng,
        afterPath: afterPng,
        badge: "generated preview",
        outFileName: `${stem}.png`,
      });
    }
    vlog(`mockup infeasible [${topic.id}]: ${mockup.reason}; trying diagram`);
  }

  const diagram = await generateDiagram({
    provider,
    summary: topicSummary,
    diffText: scopeDiffText(options.diff.diffText, topic.files),
    outDir,
    model: modelCheap,
    log: vlog,
    filePrefix: prefix,
  });
  if (!diagram.feasible) {
    vlog(`diagram infeasible [${topic.id}]: ${diagram.reason}`);
    return null;
  }
  const outPng = join(outDir, `${stem}.png`);
  await screenshotHtml({
    url: pathToFileURL(diagram.htmlPath).href,
    outPath: outPng,
    width: DEFAULT_VIEWPORT.width,
    height: DEFAULT_VIEWPORT.height,
  });
  return outPng;
}

function scopeSummary(
  summary: ChangeSummary,
  topic: VisualTopic,
): ChangeSummary {
  return {
    ...summary,
    headline: topic.title.slice(0, 140),
    overview: topic.items.map((i) => i.description).join(" "),
    items: topic.items,
  };
}

function filterDiffFiles(files: DiffFile[], topicFiles: string[]): DiffFile[] {
  if (topicFiles.length === 0) return files;
  const set = new Set(topicFiles.map((f) => f.replaceAll("\\", "/")));
  return files.filter((f) => set.has(f.path.replaceAll("\\", "/")));
}

function scopeDiffText(diffText: string, topicFiles: string[]): string {
  if (topicFiles.length === 0 || !diffText) return diffText;
  // Keep hunks whose path header mentions a topic file; else full diff.
  const norms = topicFiles.map((f) => f.replaceAll("\\", "/"));
  const parts = diffText.split(/(?=^diff --git )/m);
  const kept = parts.filter((p) =>
    norms.some((f) => p.includes(f) || p.includes(basename(f))),
  );
  return kept.length > 0 ? kept.join("") : diffText;
}

function emptyResult(soft: boolean): VisualPipelineResult {
  return {
    imagePath: null,
    images: [],
    imageMeta: [],
    softDegraded: soft,
  };
}

function singleResult(path: string, title: string): VisualPipelineResult {
  return {
    imagePath: path,
    images: [path],
    imageMeta: [{ path, title }],
    softDegraded: false,
  };
}
