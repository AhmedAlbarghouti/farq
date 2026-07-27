import { copyFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChangeSummary } from "../schema.js";
import type { Provider } from "../providers/index.js";
import type { DiffFile, GatherDiffResult, VisualFile } from "../git.js";
import { gatherVisualFileContents } from "../git.js";
import { mapWithConcurrency } from "../concurrency.js";
import { decideGate } from "./gate.js";
import { generateMockup } from "./mockup.js";
import { generateDiagram } from "./diagram.js";
import { clusterVisualTopics, type VisualTopic } from "./cluster.js";
import { defaultOutDir } from "../paths.js";
import { composeBeforeAfter, ChromeError } from "./compose.js";
import { screenshotHtml, resolveChrome } from "./chrome.js";
import { resolveTheme, type Theme } from "./design.js";
import { DEFAULT_VIEWPORT } from "./viewport.js";

export const DEFAULT_VISUAL_CONCURRENCY = 3;

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

/** Structured events so the CLI can show what is actually happening. */
export type VisualProgress =
  | { kind: "topics"; total: number }
  | { kind: "topic-start"; title: string; mode: "mockup" | "diagram" }
  | { kind: "topic-fallback"; title: string }
  | { kind: "topic-shot"; title: string }
  | { kind: "topic-done"; title: string; ok: boolean; done: number; total: number };

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
  theme?: Theme;
  maxTopics?: number;
  concurrency?: number;
  /** Pre-fetched before/after file contents; avoids git work in the hot path. */
  visualFiles?: Promise<VisualFile[]> | VisualFile[];
  verbose?: boolean;
  log?: (msg: string) => void;
  onProgress?: (event: VisualProgress) => void;
};

export async function runVisualPipeline(
  options: VisualPipelineOptions,
): Promise<VisualPipelineResult> {
  const cwd = options.cwd ?? process.cwd();
  const outDir = resolve(cwd, options.outDir ?? defaultOutDir(cwd));
  const log = options.log ?? (() => undefined);
  const theme = options.theme ?? resolveTheme();
  const emit = options.onProgress ?? (() => undefined);
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
        theme,
        title: options.summary.headline,
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
    maxTopics: options.maxTopics,
    log: vlog,
  });
  vlog(`visual topics: ${topics.length}`);
  if (topics.length === 0) {
    return emptyResult(false);
  }
  emit({ kind: "topics", total: topics.length });

  const allFiles = await resolveVisualFiles(options, cwd);
  const warnings: string[] = [];
  let done = 0;

  const rendered = await mapWithConcurrency(
    topics,
    options.concurrency ?? DEFAULT_VISUAL_CONCURRENCY,
    async (topic): Promise<VisualImage | null> => {
      try {
        const path = await renderTopic({
          topic,
          cwd,
          outDir,
          theme,
          summary: options.summary,
          diff: options.diff,
          provider: options.provider,
          modelCheap: options.modelCheap,
          allFiles,
          vlog,
          emit,
        });
        emit({
          kind: "topic-done",
          title: topic.title,
          ok: path !== null,
          done: ++done,
          total: topics.length,
        });
        return path ? { path, title: topic.title } : null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`topic "${topic.title}": ${msg}`);
        vlog(`topic failed: ${msg}`);
        emit({
          kind: "topic-done",
          title: topic.title,
          ok: false,
          done: ++done,
          total: topics.length,
        });
        return null;
      }
    },
  );

  const imageMeta = rendered.filter((img): img is VisualImage => img !== null);

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

async function resolveVisualFiles(
  options: VisualPipelineOptions,
  cwd: string,
): Promise<VisualFile[]> {
  if (options.visualFiles) return await options.visualFiles;
  return gatherVisualFileContents(cwd, options.diff.files, options.diff.baseRef, {
    mode: options.diff.mode,
  });
}

async function renderTopic(options: {
  topic: VisualTopic;
  cwd: string;
  outDir: string;
  theme: Theme;
  summary: ChangeSummary;
  diff: GatherDiffResult;
  provider: Provider;
  modelCheap?: string;
  allFiles: VisualFile[];
  vlog: (msg: string) => void;
  emit: (event: VisualProgress) => void;
}): Promise<string | null> {
  const { topic, outDir, theme, provider, modelCheap, vlog, emit } = options;
  const prefix = `visual-${topic.id}-`;
  const stem = `visual-${topic.id}`;
  const outPng = join(outDir, `${stem}.png`);
  const topicSummary = scopeSummary(options.summary, topic);
  const topicFiles = filterDiffFiles(options.diff.files, topic.files);

  const gate =
    topicFiles.length > 0
      ? decideGate(topicFiles)
      : decideGate(options.diff.files);
  vlog(`visual gate [${topic.id} ${topic.title}]: ${gate}`);
  if (gate === "none") return null;

  emit({ kind: "topic-start", title: topic.title, mode: gate });

  if (gate === "mockup") {
    const scoped = filterVisualFiles(options.allFiles, topic.files);
    const mockup = await generateMockup({
      provider,
      summary: topicSummary,
      files: scoped.length > 0 ? scoped : options.allFiles,
      outDir,
      theme,
      title: topic.title,
      model: modelCheap,
      log: vlog,
      filePrefix: prefix,
    });
    if (mockup.feasible) {
      emit({ kind: "topic-shot", title: topic.title });
      await screenshotHtml({
        url: pathToFileURL(mockup.htmlPath).href,
        outPath: outPng,
        width: DEFAULT_VIEWPORT.width,
        height: DEFAULT_VIEWPORT.height,
      });
      return outPng;
    }
    vlog(`mockup infeasible [${topic.id}]: ${mockup.reason}; trying diagram`);
    emit({ kind: "topic-fallback", title: topic.title });
  }

  const diagram = await generateDiagram({
    provider,
    summary: topicSummary,
    diffText: scopeDiffText(options.diff.diffText, topic.files),
    outDir,
    theme,
    title: topic.title,
    model: modelCheap,
    log: vlog,
    filePrefix: prefix,
  });
  if (!diagram.feasible) {
    vlog(`diagram infeasible [${topic.id}]: ${diagram.reason}`);
    return null;
  }
  emit({ kind: "topic-shot", title: topic.title });
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
    visual_topics: undefined,
  };
}

function filterDiffFiles(files: DiffFile[], topicFiles: string[]): DiffFile[] {
  if (topicFiles.length === 0) return files;
  const set = new Set(topicFiles.map(normalizePath));
  return files.filter((f) => set.has(normalizePath(f.path)));
}

function filterVisualFiles(
  files: VisualFile[],
  topicFiles: string[],
): VisualFile[] {
  if (topicFiles.length === 0) return files;
  const set = new Set(topicFiles.map(normalizePath));
  return files.filter((f) => set.has(normalizePath(f.path)));
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function scopeDiffText(diffText: string, topicFiles: string[]): string {
  if (topicFiles.length === 0 || !diffText) return diffText;
  // Keep hunks whose path header mentions a topic file; else full diff.
  const norms = topicFiles.map(normalizePath);
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
