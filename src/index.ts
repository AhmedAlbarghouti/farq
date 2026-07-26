#!/usr/bin/env node
import { Command } from "commander";
import { relative, resolve } from "node:path";
import { loadConfig, mergeConfig, type ProviderName, type ToneName } from "./config.js";
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

type OutputType = "pr" | "slack" | "json";

type SharedOpts = {
  range?: string;
  provider?: string;
  tone?: string;
  before?: string;
  after?: string;
  noImages?: boolean;
  out?: string;
  modelCheap?: string;
  verbose?: boolean;
  open?: boolean;
};

async function run(type: OutputType, opts: SharedOpts): Promise<number> {
  const cwd = process.cwd();
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

  const log = (msg: string) => {
    console.error(msg);
  };

  let provider;
  try {
    provider = await resolveProvider({
      flag: config.provider,
      config,
      log,
    });
  } catch (err) {
    log(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const tone: ToneName = config.tone ?? "technical";
  const imagesEnabled =
    type === "pr" ? !opts.noImages : false;

  let diff;
  try {
    log("farq: gathering diff…");
    diff = await gatherDiff({ cwd, range: opts.range });
  } catch (err) {
    if (err instanceof NoChangesError || err instanceof GitError) {
      log(err.message);
      return 1;
    }
    log(err instanceof Error ? err.message : String(err));
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

  log(`farq: summarizing with ${provider.name}…`);
  let summary;
  try {
    summary = await summarize({
      provider,
      diff,
      tone,
      titleConventionBlurb: titleBlurb || undefined,
    });
  } catch (err) {
    if (err instanceof SummarizeError) {
      log(err.message);
      return 2;
    }
    log(err instanceof Error ? err.message : String(err));
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

  if (imagesEnabled || (opts.before && opts.after)) {
    log("farq: visual pipeline…");
    try {
      const visual = await runVisualPipeline({
        cwd,
        outDir: opts.out ?? ".farq",
        summary,
        diff,
        provider,
        modelCheap: cheapModel,
        noImages: opts.noImages && !(opts.before && opts.after),
        before: opts.before,
        after: opts.after,
        verbose: opts.verbose,
        log: opts.verbose ? log : () => undefined,
      });
      imagePath = visual.imagePath;
      images = visual.images;
      if (visual.warning) log(`farq: ${visual.warning}`);
    } catch (err) {
      if (err instanceof ChromeError && opts.before && opts.after) {
        log(err.message);
        return 1;
      }
      log(
        `farq: ${err instanceof Error ? err.message : String(err)} (continuing without image)`,
      );
    }
  }

  const relImage =
    imagePath != null ? relative(cwd, resolve(imagePath)).replaceAll("\\", "/") : null;

  let artifact = "";
  if (type === "pr") {
    artifact = renderPr({ summary, imagePath: relImage });
  } else if (type === "slack") {
    artifact = renderSlack(summary);
  } else {
    artifact = renderJson(summary, images.map((p) => relative(cwd, p).replaceAll("\\", "/")));
  }

  if (type === "pr" && opts.open) {
    log("farq: opening PR…");
    try {
      const result = await openPullRequest({
        cwd,
        summary,
        bodyMarkdown: artifact.includes("\n\n")
          ? artifact.split("\n\n").slice(1).join("\n\n")
          : artifact,
        imagePath,
      });
      if (result.skipped) {
        log(`farq: ${result.reason}`);
      } else {
        log(
          `farq: PR ${result.action}${result.url ? ` — ${result.url}` : ""}`,
        );
        if (result.warning) log(`farq: ${result.warning}`);
      }
    } catch (err) {
      log(err instanceof Error ? err.message : String(err));
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
    .option("-o, --out <dir>", "output dir for images", ".farq")
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
    .version("0.0.1");

  addShared(
    program
      .command("pr", { isDefault: true })
      .description("PR title + body markdown")
      .option("--open", "create a GitHub PR with gh (template-aware)", false)
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
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
