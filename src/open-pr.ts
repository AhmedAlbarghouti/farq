import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
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
      title: string;
      body: string;
      imageUrl?: string | null;
      imageUrls?: string[];
    };

/** Prerelease tag used to host a branch's composed PNG. */
export function assetTagForBranch(branch: string): string {
  return `farq-assets-${branch.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40)}`;
}

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
  imagePaths?: string[];
  imageTitles?: string[];
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

  const paths =
    options.imagePaths && options.imagePaths.length > 0
      ? options.imagePaths
      : options.imagePath
        ? [options.imagePath]
        : [];

  let imageUrls: string[] = [];
  let warning: string | undefined;

  if (paths.length > 0) {
    try {
      imageUrls = await uploadPrImages(cwd, paths, branch);
    } catch (err) {
      warning = `Image upload failed — attach manually: ${paths.join(", ")} (${
        err instanceof Error ? err.message : String(err)
      })`;
    }
  }

  const template = findPrTemplate(cwd);
  const { title, body } = fillPrTemplate({
    template,
    summary: options.summary,
    bodyMarkdown: options.bodyMarkdown,
    imageUrl: imageUrls[0] ?? null,
    images: imageUrls.map((url, i) => ({
      url,
      title: options.imageTitles?.[i],
    })),
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
        title,
        body,
        imageUrl: imageUrls[0] ?? null,
        imageUrls,
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
      title,
      body,
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`gh pr create/edit failed: ${msg}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Delete `farq-assets-*` prereleases whose branch no longer has an open PR.
 * Always keeps `keepTag` (the just-uploaded asset).
 */
export async function pruneOrphanedFarqAssets(
  cwd: string,
  keepTag: string,
): Promise<string[]> {
  const deleted: string[] = [];
  try {
    const { stdout: releasesOut, exitCode: relCode } = await gh(
      cwd,
      ["release", "list", "--limit", "100", "--json", "tagName,isPrerelease"],
      { reject: false },
    );
    if (relCode !== 0 || !releasesOut.trim()) return deleted;

    const releases = JSON.parse(releasesOut) as {
      tagName: string;
      isPrerelease: boolean;
    }[];

    const candidates = releases.filter(
      (r) =>
        r.isPrerelease &&
        r.tagName.startsWith("farq-assets-") &&
        r.tagName !== keepTag,
    );
    if (candidates.length === 0) return deleted;

    const { stdout: prsOut, exitCode: prCode } = await gh(
      cwd,
      ["pr", "list", "--state", "open", "--limit", "100", "--json", "headRefName"],
      { reject: false },
    );
    const openTags = new Set<string>();
    if (prCode === 0 && prsOut.trim()) {
      const prs = JSON.parse(prsOut) as { headRefName: string }[];
      for (const pr of prs) {
        openTags.add(assetTagForBranch(pr.headRefName));
      }
    }

    for (const rel of candidates) {
      if (openTags.has(rel.tagName)) continue;
      try {
        await gh(
          cwd,
          ["release", "delete", rel.tagName, "--yes", "--cleanup-tag"],
          { reject: false },
        );
        deleted.push(rel.tagName);
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort — never fail --open for prune
  }
  return deleted;
}

/** Best-effort: prerelease asset URL for one PNG. */
export async function uploadPrImage(
  cwd: string,
  imagePath: string,
  branch: string,
): Promise<string> {
  const urls = await uploadPrImages(cwd, [imagePath], branch);
  const url = urls[0];
  if (!url) throw new Error("no asset URL returned");
  return url;
}

/** Best-effort: upload many PNGs to one prerelease; URLs in input order. */
export async function uploadPrImages(
  cwd: string,
  imagePaths: string[],
  branch: string,
): Promise<string[]> {
  if (imagePaths.length === 0) return [];

  const tag = assetTagForBranch(branch);
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
    ...imagePaths,
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
  ]);

  const parsed = JSON.parse(stdout) as {
    assets?: Array<{ name?: string; url?: string }>;
  };
  const assets = parsed.assets ?? [];
  const urls = imagePaths.map((p) => {
    const name = basename(p);
    const hit = assets.find((a) => a.name === name);
    if (!hit?.url) {
      throw new Error(`no asset URL for ${name}`);
    }
    return hit.url;
  });

  await pruneOrphanedFarqAssets(cwd, tag);
  return urls;
}
