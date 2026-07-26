#!/usr/bin/env node
import { Command } from "commander";
import { relative, resolve } from "node:path";
import {
  loadConfig,
  mergeConfig,
  type ProviderName,
  type ToneName,
} from "./config.js";
import { gatherDiff, NoChangesError, GitError } from "./git.js";
import { resolveProvider } from "./providers/index.js";
import { summarize, SummarizeError } from "./summarize.js";
import { inferTitleConvention } from "./title.js";
import { fetchRecentPrTitles, openPullRequest } from "./open-pr.js";
import { runVisualPipeline } from "./visual/pipeline.js";
import { ChromeError } from "./visual/chrome.js";
import { renderPr } from "./render/pr.js";
import { renderSlack } from "./render/slack.js";
import { renderJson } from "./render/json.js";
import { createUi } from "./ui/index.js";
import { defaultOutDir, displayImageRef } from "./paths.js";

type OutputType = "pr" | "slack" | "json";

type SharedOpts = {
  range?: string;
  provider?: string;
  tone?: string;
  before?: string;
  after?: string;
  noImages?: boolean;
  images?: boolean;
  out?: string;
  modelCheap?: string;
  verbose?: boolean;
  open?: boolean;
};

async function run(type: OutputType, opts: SharedOpts): Promise<number> {
  const cwd = process.cwd();
  const ui = createUi();
  const fileConfig = loadConfig({ cwd });
  const flagConfig = {
    provider: opts.provider as ProviderName | undefined,
    tone: opts.tone as ToneName | undefined,
    models: opts.modelCheap
      ? {
          claudeCheap: opts.modelCheap,
          opencodeCheap: opts.modelCheap,
        }
      : undefined,
  };
  const config = mergeConfig(fileConfig, flagConfig);

  let provider;
  try {
    provider = await resolveProvider({
      flag: config.provider,
      config,
      log: (msg) => ui.note(msg),
    });
  } catch (err) {
    ui.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const tone: ToneName = config.tone ?? "technical";
  const noImages = opts.noImages === true || opts.images === false;
  const imagesEnabled = type === "pr" ? !noImages : false;

  let diff;
  const diffSpin = ui.stage("diff");
  try {
    diff = await gatherDiff({ cwd, range: opts.range });
    diffSpin.succeed("diff ready");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diffSpin.fail(msg);
    return 1;
  }

  let titleBlurb = "";
  if (type === "pr") {
    try {
      const titles = await fetchRecentPrTitles(cwd);
      titleBlurb = inferTitleConvention(titles).blurb;
    } catch {
      // optional
    }
  }

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

  let imagePath: string | null = null;
  let images: string[] = [];
  let imageMeta: Array<{ path: string; title: string }> = [];

  if (imagesEnabled || (opts.before && opts.after)) {
    const visSpin = ui.stage("visual", provider.name);
    try {
      const visual = await runVisualPipeline({
        cwd,
        outDir: opts.out ?? defaultOutDir(cwd),
        summary,
        diff,
        provider,
        modelCheap: cheapModel,
        noImages: noImages && !(opts.before && opts.after),
        before: opts.before,
        after: opts.after,
        verbose: opts.verbose,
        log: opts.verbose ? (msg) => ui.note(msg) : () => undefined,
      });
      imagePath = visual.imagePath;
      images = visual.images;
      imageMeta = visual.imageMeta;
      if (visual.warning) {
        visSpin.succeed("visuals skipped");
        ui.note(visual.warning);
      } else if (imagePath) {
        visSpin.succeed("visuals ready");
      } else {
        visSpin.succeed("no visual (ok)");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof ChromeError && opts.before && opts.after) {
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
        imagePath,
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

  process.stdout.write(artifact);
  return 0;
}

function addShared(cmd: Command): Command {
  return cmd
    .option("-r, --range <range>", "git range, e.g. main..feature")
    .option("-p, --provider <name>", "claude | opencode | fake")
    .option("-t, --tone <tone>", "technical | client", "technical")
    .option("--before <path>", "manual before screenshot")
    .option("--after <path>", "manual after screenshot")
    .option("--no-images", "skip image generation/composition")
    .option("-o, --out <dir>", "output dir for images (default: user cache, outside the repo)")
    .option("--model-cheap <id>", "model for visual generation")
    .option("-v, --verbose", "verbose logging", false);
}

async function main() {
  const program = new Command();
  program
    .name("farq")
    .description(
      "Turn git branch changes into paste-ready PR/Slack updates with optional before/after visuals",
    )
    .version("0.0.2");

  addShared(
    program
      .command("pr", { isDefault: true })
      .description("PR title + body markdown")
      .option(
        "--open",
        "create or update a GitHub PR with gh (template-aware)",
        false,
      )
      .action(async (opts: SharedOpts) => {
        process.exitCode = await run("pr", opts);
      }),
  );

  addShared(
    program
      .command("slack")
      .description("Slack mrkdwn daily update")
      .action(async (opts: SharedOpts) => {
        process.exitCode = await run("slack", { ...opts, noImages: true });
      }),
  );

  addShared(
    program
      .command("json")
      .description("Structured ChangeSummary JSON")
      .action(async (opts: SharedOpts) => {
        process.exitCode = await run("json", { ...opts, noImages: true });
      }),
  );

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  const ui = createUi();
  ui.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
