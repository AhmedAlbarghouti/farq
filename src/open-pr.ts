import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import type { ChangeSummary } from "./schema.js";
import { fillPrTemplate, findPrTemplate } from "./template.js";
import { resolveGh } from "./tools.js";

const GH_TIMEOUT = 60_000;

export type OpenPrResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      action: "created" | "updated";
      url?: string;
      warning?: string;
    };

async function gh(
  cwd: string,
  args: string[],
  options: { reject?: boolean } = {},
) {
  return execa(resolveGh(), args, {
    cwd,
    timeout: GH_TIMEOUT,
    reject: options.reject ?? true,
  });
}

export async function resolveDefaultBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await gh(cwd, [
      "repo",
      "view",
      "--json",
      "defaultBranchRef",
      "--jq",
      ".defaultBranchRef.name",
    ]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    // fall through
  }
  for (const name of ["main", "master"]) {
    try {
      await execa("git", ["rev-parse", "--verify", name], {
        cwd,
        timeout: 10_000,
        reject: true,
      });
      return name;
    } catch {
      // try next
    }
  }
  return "main";
}

export async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    timeout: 10_000,
    reject: true,
  });
  return stdout.trim();
}

export async function fetchRecentPrTitles(
  cwd: string,
  limit = 20,
): Promise<string[]> {
  try {
    const { stdout } = await gh(cwd, [
      "pr",
      "list",
      "--state",
      "merged",
      "--limit",
      String(limit),
      "--json",
      "title",
      "--jq",
      ".[].title",
    ]);
    return stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Existing open PR for the current branch, if any. */
export async function findExistingPr(
  cwd: string,
): Promise<{ number: number; url: string } | null> {
  try {
    const { stdout, exitCode } = await gh(
      cwd,
      ["pr", "view", "--json", "number,url"],
      { reject: false },
    );
    if (exitCode !== 0 || !stdout.trim()) return null;
    const parsed = JSON.parse(stdout) as { number?: number; url?: string };
    if (typeof parsed.number === "number" && typeof parsed.url === "string") {
      return { number: parsed.number, url: parsed.url };
    }
    return null;
  } catch {
    return null;
  }
}

export async function openPullRequest(options: {
  cwd: string;
  summary: ChangeSummary;
  bodyMarkdown: string;
  imagePath?: string | null;
}): Promise<OpenPrResult> {
  const cwd = options.cwd;
  const branch = await currentBranch(cwd);
  const defaultBranch = await resolveDefaultBranch(cwd);

  if (branch === defaultBranch) {
    return {
      skipped: true,
      reason: `Already on ${defaultBranch} — skipping PR create`,
    };
  }

  let imageUrl: string | null = null;
  let warning: string | undefined;

  if (options.imagePath) {
    try {
      imageUrl = await uploadPrImage(cwd, options.imagePath, branch);
    } catch (err) {
      warning = `Image upload failed — attach manually: ${options.imagePath} (${
        err instanceof Error ? err.message : String(err)
      })`;
    }
  }

  const template = findPrTemplate(cwd);
  const { title, body } = fillPrTemplate({
    template,
    summary: options.summary,
    bodyMarkdown: options.bodyMarkdown,
    imageUrl,
  });

  const dir = mkdtempSync(join(tmpdir(), "farq-pr-"));
  const bodyFile = join(dir, "body.md");
  writeFileSync(bodyFile, body, "utf8");

  try {
    const existing = await findExistingPr(cwd);
    if (existing) {
      await gh(cwd, [
        "pr",
        "edit",
        String(existing.number),
        "--title",
        title,
        "--body-file",
        bodyFile,
      ]);
      try {
        await gh(cwd, ["pr", "view", "--web"], { reject: false });
      } catch {
        // non-fatal
      }
      return {
        skipped: false,
        action: "updated",
        url: existing.url,
        warning,
      };
    }

    const created = await gh(cwd, [
      "pr",
      "create",
      "--title",
      title,
      "--body-file",
      bodyFile,
    ]);
    try {
      await gh(cwd, ["pr", "view", "--web"], { reject: false });
    } catch {
      // non-fatal
    }
    return {
      skipped: false,
      action: "created",
      url: created.stdout?.trim() || undefined,
      warning,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`gh pr create/edit failed: ${msg}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Best-effort: prerelease asset URL for the PNG. */
export async function uploadPrImage(
  cwd: string,
  imagePath: string,
  branch: string,
): Promise<string> {
  const tag = `farq-assets-${branch.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40)}`;
  try {
    await gh(cwd, ["release", "delete", tag, "--yes", "--cleanup-tag"], {
      reject: false,
    });
  } catch {
    // ok if missing
  }

  await gh(cwd, [
    "release",
    "create",
    tag,
    imagePath,
    "--title",
    `farq assets (${branch})`,
    "--notes",
    "Auto-uploaded by farq for PR description embedding.",
    "--prerelease",
  ]);

  const { stdout } = await gh(cwd, [
    "release",
    "view",
    tag,
    "--json",
    "assets",
    "--jq",
    ".assets[0].url",
  ]);

  const url = stdout.trim();
  if (!url) throw new Error("no asset URL returned");
  return url;
}
