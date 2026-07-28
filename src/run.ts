import {
  loadConfig,
  mergeConfig,
  type FarqConfig,
  type ProviderName,
  type ToneName,
} from "./config.js";
import { gatherDiff, gatherVisualFileContents, type VisualFile } from "./git.js";
import { resolveProvider } from "./providers/index.js";
import { summarize } from "./summarize.js";
import { inferTitleConvention } from "./title.js";
import { fetchRecentPrTitles, openPullRequest } from "./open-pr.js";
import { runVisualPipeline, type VisualProgress } from "./visual/pipeline.js";
import { ChromeError } from "./visual/chrome.js";
import {
  DEFAULT_THEME,
  THEME_NAMES,
  isThemeName,
  resolveTheme,
} from "./visual/design.js";
import { renderPr } from "./render/pr.js";
import { renderSlack } from "./render/slack.js";
import { renderJson } from "./render/json.js";
import { createUi, linesFor } from "./ui/index.js";
import { defaultOutDir, displayImageRef } from "./paths.js";

export type OutputType = "pr" | "slack" | "json";

export type RunFarqOpts = {
  range?: string;
  provider?: string;
  tone?: string;
  before?: string;
  after?: string;
  noImages?: boolean;
  images?: boolean;
  out?: string;
  modelCheap?: string;
  theme?: string;
  accent?: string;
  maxVisuals?: string;
  verbose?: boolean;
  open?: boolean;
};

export type RunFarqOptions = {
  type: OutputType;
  opts: RunFarqOpts;
  cwd?: string;
  /** Override stdout write (tests). Defaults to process.stdout.write. */
  write?: (text: string) => void;
};

/**
 * Composition root for one farq run: gather → summarize → optional visuals →
 * render → optional --open. Returns a process exit code.
 */
export async function runFarq(options: RunFarqOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const opts = options.opts;
  const type = options.type;
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const ui = createUi();
  const fileConfig = loadConfig({ cwd });

  if (opts.theme && !isThemeName(opts.theme)) {
    ui.note(
      `unknown theme "${opts.theme}" — using ${DEFAULT_THEME} (options: ${THEME_NAMES.join(", ")})`,
    );
  }
  const maxVisuals = Number(opts.maxVisuals);

  const flagConfig: FarqConfig = {
    provider: opts.provider as ProviderName | undefined,
    tone: opts.tone as ToneName | undefined,
    models: opts.modelCheap
      ? {
          claudeCheap: opts.modelCheap,
          opencodeCheap: opts.modelCheap,
        }
      : undefined,
    visual: {
      theme: isThemeName(opts.theme) ? opts.theme : undefined,
      accent: opts.accent,
      maxTopics: Number.isFinite(maxVisuals) && maxVisuals >= 1
        ? Math.floor(maxVisuals)
        : undefined,
    },
  };
  const config = mergeConfig(fileConfig, flagConfig);

  const tone: ToneName = config.tone ?? "technical";
  const noImages = opts.noImages === true || opts.images === false;
  const manualShots = Boolean(opts.before && opts.after);
  const imagesEnabled = type === "pr" ? !noImages : false;
  const willVisual = imagesEnabled || manualShots;

  ui.plan(2 + (willVisual ? 1 : 0) + (type === "pr" && opts.open ? 1 : 0));

  // Provider detection, the diff and the `gh` title lookup are independent —
  // start them together so the first model call is not waiting on subprocesses.
  const providerNotes: string[] = [];
  const providerPromise = resolveProvider({
    flag: config.provider,
    config,
    log: (msg) => providerNotes.push(msg),
  }).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const titlesPromise =
    type === "pr" ? fetchRecentPrTitles(cwd).catch(() => []) : null;

  let diff;
  const diffSpin = ui.stage("diff");
  try {
    diff = await gatherDiff({ cwd, range: opts.range });
    diffSpin.succeed(`diff ready — ${describeDiff(diff.files.length)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diffSpin.fail(msg);
    return 1;
  }

  const resolved = await providerPromise;
  for (const note of providerNotes) ui.note(note);
  if (!resolved.ok) {
    ui.error(
      resolved.error instanceof Error
        ? resolved.error.message
        : String(resolved.error),
    );
    return 1;
  }
  const provider = resolved.value;

  // Read the before/after file bodies while the model writes the summary.
  const visualFiles: Promise<VisualFile[]> | undefined =
    imagesEnabled && !manualShots
      ? gatherVisualFileContents(cwd, diff.files, diff.baseRef, {
          mode: diff.mode,
        }).catch(() => [] as VisualFile[])
      : undefined;

  const titleBlurb = titlesPromise
    ? inferTitleConvention(await titlesPromise).blurb
    : "";

  let summary;
  const sumSpin = ui.stage("summarize", provider.name);
  try {
    summary = await summarize({
      provider,
      diff,
      tone,
      titleConventionBlurb: titleBlurb || undefined,
    });
    sumSpin.succeed(`summarized with ${provider.name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sumSpin.fail(msg);
    return 2;
  }

  const cheapModel =
    provider.name === "claude"
      ? config.models?.claudeCheap
      : provider.name === "opencode"
        ? config.models?.opencodeCheap ?? process.env.FARQ_OPENCODE_MODEL
        : undefined;

  let images: string[] = [];
  let imageMeta: Array<{ path: string; title: string }> = [];

  if (willVisual) {
    const visSpin = ui.stage("topics", {
      provider: provider.name,
      label: "visuals",
    });
    const track = { total: 0, done: 0, current: "" };
    const refresh = () => {
      const parts: string[] = [];
      if (track.total > 1) parts.push(`${track.done}/${track.total}`);
      if (track.current) parts.push(track.current);
      visSpin.detail(parts.join(" · ") || null);
    };
    const onProgress = (event: VisualProgress) => {
      switch (event.kind) {
        case "topics":
          track.total = event.total;
          visSpin.setLines(linesFor("visual", provider.name));
          break;
        // The rotating line already names the activity; the detail names the
        // topic being worked on, plus a counter once there is more than one.
        case "topic-start":
          track.current = shorten(event.title);
          visSpin.setLines(linesFor(event.mode, provider.name));
          break;
        case "topic-fallback":
          track.current = shorten(event.title);
          visSpin.setLines(linesFor("diagram", provider.name));
          break;
        case "topic-shot":
          track.current = shorten(event.title);
          visSpin.setLines(linesFor("shoot", provider.name));
          break;
        case "topic-done":
          track.done = event.done;
          track.total = event.total;
          if (event.done === event.total) track.current = "";
          break;
      }
      refresh();
    };

    try {
      const visual = await runVisualPipeline({
        cwd,
        outDir: opts.out ?? defaultOutDir(cwd),
        summary,
        diff,
        provider,
        modelCheap: cheapModel,
        noImages: noImages && !manualShots,
        before: opts.before,
        after: opts.after,
        theme: resolveTheme(config.visual ?? {}),
        maxTopics: config.visual?.maxTopics,
        concurrency: config.visual?.concurrency,
        visualFiles,
        verbose: opts.verbose,
        log: opts.verbose ? (msg) => ui.note(msg) : () => undefined,
        onProgress,
      });
      images = visual.images;
      imageMeta = visual.imageMeta;
      if (visual.warning && images.length === 0) {
        visSpin.succeed("visuals skipped");
        ui.note(visual.warning);
      } else if (images.length > 0) {
        visSpin.succeed(
          `${images.length} visual${images.length === 1 ? "" : "s"} ready`,
        );
        if (visual.warning) ui.note(visual.warning);
      } else {
        visSpin.succeed("no visual (ok)");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof ChromeError && manualShots) {
        visSpin.fail(msg);
        return 1;
      }
      visSpin.succeed("visuals skipped");
      ui.note(`${msg} (continuing without image)`);
    }
  }

  const prImages = (imageMeta.length > 0 ? imageMeta : images.map((p) => ({ path: p, title: "before / after" }))).map(
    (img) => ({ path: displayImageRef(cwd, img.path), title: img.title }),
  );

  let artifact = "";
  if (type === "pr") {
    artifact = renderPr({ summary, images: prImages });
  } else if (type === "slack") {
    artifact = renderSlack(summary);
  } else {
    artifact = renderJson(
      summary,
      images.map((p) => displayImageRef(cwd, p)),
    );
  }

  if (type === "pr" && opts.open) {
    const openSpin = ui.stage("open");
    try {
      const result = await openPullRequest({
        cwd,
        summary,
        bodyMarkdown: artifact.includes("\n\n")
          ? artifact.split("\n\n").slice(1).join("\n\n")
          : artifact,
        imagePaths: images,
        imageTitles: imageMeta.map((m) => m.title),
      });
      if (result.skipped) {
        openSpin.succeed(result.reason);
      } else {
        openSpin.succeed(
          `PR ${result.action}${result.url ? ` — ${result.url}` : ""}`,
        );
        if (result.warning) ui.note(result.warning);
        // Match GitHub body (hosted image URL, no local-path note).
        artifact = `${result.title}\n\n${result.body}`.replace(/\n{3,}/g, "\n\n");
        if (!artifact.endsWith("\n")) artifact += "\n";
      }
    } catch (err) {
      openSpin.fail(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  write(artifact);
  return 0;
}

function describeDiff(fileCount: number): string {
  return `${fileCount} file${fileCount === 1 ? "" : "s"}`;
}

function shorten(text: string, max = 28): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
