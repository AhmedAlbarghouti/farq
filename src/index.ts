#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { createUi } from "./ui/index.js";
import { runFarq, type RunFarqOpts } from "./run.js";

const { version: PACKAGE_VERSION } = createRequire(import.meta.url)(
  "../package.json",
) as { version: string };

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
    .option("--theme <name>", "visual palette: midnight | daylight")
    .option("--accent <color>", "override the theme accent color")
    .option("--max-visuals <n>", "cap generated visuals (1-5)")
    .option("-v, --verbose", "verbose logging", false);
}

async function main() {
  const program = new Command();
  program
    .name("farq")
    .description(
      "Turn git branch changes into paste-ready PR/Slack updates with optional before/after visuals",
    )
    .version(PACKAGE_VERSION);

  addShared(
    program
      .command("pr", { isDefault: true })
      .description("PR title + body markdown")
      .option(
        "--open",
        "create or update a GitHub PR with gh (template-aware)",
        false,
      )
      .action(async (opts: RunFarqOpts) => {
        process.exitCode = await runFarq({ type: "pr", opts });
      }),
  );

  addShared(
    program
      .command("slack")
      .description("Slack mrkdwn daily update")
      .action(async (opts: RunFarqOpts) => {
        process.exitCode = await runFarq({
          type: "slack",
          opts: { ...opts, noImages: true },
        });
      }),
  );

  addShared(
    program
      .command("json")
      .description("Structured ChangeSummary JSON")
      .action(async (opts: RunFarqOpts) => {
        process.exitCode = await runFarq({
          type: "json",
          opts: { ...opts, noImages: true },
        });
      }),
  );

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  const ui = createUi();
  ui.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
