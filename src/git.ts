import { execa } from "execa";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapWithConcurrency } from "./concurrency.js";

export const SUMMARY_DIFF_BUDGET = 150_000;
export const VISUAL_DIFF_BUDGET = 60_000;
const GIT_TIMEOUT_MS = 30_000;

export class NoChangesError extends Error {
  constructor(message = "No changes found in range — nothing to summarize") {
    super(message);
    this.name = "NoChangesError";
  }
}

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

export type DiffFile = {
  path: string;
  status: string;
  patch: string;
};

export type GatherDiffResult = {
  mode: "range" | "worktree";
  range: string;
  baseRef: string | null;
  headRef: string;
  files: DiffFile[];
  diffText: string;
  truncated: boolean;
  commits: string[];
};

export type GatherDiffOptions = {
  cwd?: string;
  range?: string;
  budget?: number;
};

export async function gatherDiff(
  options: GatherDiffOptions = {},
): Promise<GatherDiffResult> {
  const cwd = options.cwd ?? process.cwd();
  const budget = options.budget ?? SUMMARY_DIFF_BUDGET;

  await assertGitRepo(cwd);

  if (options.range) {
    const explicit = await gatherRangeDiff(cwd, options.range, budget);
    if (explicit.files.length === 0 && !explicit.diffText.trim()) {
      throw new NoChangesError();
    }
    return explicit;
  }

  const base = await resolveMergeBase(cwd);
  const range = `${base}..HEAD`;
  const committed = await gatherRangeDiff(cwd, range, budget);
  if (committed.files.length > 0 || committed.diffText.trim()) {
    return committed;
  }
  // merge-base..HEAD empty — fall through to worktree

  const worktree = await gatherWorktreeDiff(cwd, budget);
  if (worktree.files.length === 0) {
    throw new NoChangesError();
  }
  return worktree;
}

export async function getFileAtRef(
  cwd: string,
  ref: string,
  filePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await git(cwd, ["show", `${ref}:${filePath}`]);
    return stdout;
  } catch {
    return null;
  }
}

export type VisualFile = { path: string; before: string; after: string };

/** Cap on git subprocesses spawned to build visual context. */
const MAX_VISUAL_FILES = 40;
const VISUAL_READ_CONCURRENCY = 8;

/** Size-capped before/after pairs for visual generation. */
export async function gatherVisualFileContents(
  cwd: string,
  files: DiffFile[],
  baseRef: string | null,
  options: { budget?: number; mode?: GatherDiffResult["mode"] } = {},
): Promise<VisualFile[]> {
  const budget = options.budget ?? VISUAL_DIFF_BUDGET;
  const worktree = options.mode === "worktree";
  const targets = files.slice(0, MAX_VISUAL_FILES);

  const fetched = await mapWithConcurrency(
    targets,
    VISUAL_READ_CONCURRENCY,
    async (file): Promise<VisualFile> => {
      const [before, after] = await Promise.all([
        baseRef ? getFileAtRef(cwd, baseRef, file.path) : Promise.resolve(""),
        // In worktree mode HEAD still holds the *old* content, so read from disk.
        worktree
          ? readWorktreeFile(cwd, file.path)
          : getFileAtRef(cwd, "HEAD", file.path),
      ]);
      return {
        path: file.path,
        before: before ?? "",
        after: after ?? (await readWorktreeFile(cwd, file.path)) ?? "",
      };
    },
  );

  const out: VisualFile[] = [];
  let used = 0;
  for (const file of fetched) {
    if (used >= budget) break;
    const chunk = file.before.length + file.after.length;
    if (used + chunk > budget && out.length > 0) break;
    out.push({
      path: file.path,
      before: file.before.slice(0, budget - used),
      after: file.after.slice(
        0,
        Math.max(0, budget - used - file.before.length),
      ),
    });
    used += Math.min(chunk, budget - used);
  }
  return out;
}

async function gatherRangeDiff(
  cwd: string,
  range: string,
  budget: number,
): Promise<GatherDiffResult> {
  const [baseRef, headRef] = splitRange(range);
  const [nameStatus, patch, commits] = await Promise.all([
    git(cwd, ["diff", "--name-status", "--find-renames", range]),
    git(cwd, ["diff", "--find-renames", "--unified=5", range]),
    listCommits(cwd, range),
  ]);
  const files = parseNameStatus(nameStatus.stdout, patch.stdout);
  const { text, truncated } = capText(patch.stdout, budget);

  return {
    mode: "range",
    range,
    baseRef: baseRef === "HEAD" ? null : baseRef,
    headRef,
    files,
    diffText: text,
    truncated,
    commits,
  };
}

async function gatherWorktreeDiff(
  cwd: string,
  budget: number,
): Promise<GatherDiffResult> {
  const [nameStatus, patch, untracked] = await Promise.all([
    git(cwd, ["diff", "HEAD", "--name-status", "--find-renames"]),
    git(cwd, ["diff", "HEAD", "--find-renames", "--unified=5"]),
    listUntracked(cwd),
  ]);

  const files = parseNameStatus(nameStatus.stdout, patch.stdout);
  let diffText = patch.stdout;

  for (const path of untracked) {
    if (!files.some((f) => f.path === path)) {
      const content = (await readWorktreeFile(cwd, path)) ?? "";
      const patchChunk = formatNewFilePatch(path, content);
      files.push({ path, status: "A", patch: patchChunk });
      diffText += (diffText.endsWith("\n") || !diffText ? "" : "\n") + patchChunk;
    }
  }

  const capped = capText(diffText, budget);
  return {
    mode: "worktree",
    range: "WORKTREE",
    baseRef: "HEAD",
    headRef: "WORKTREE",
    files,
    diffText: capped.text,
    truncated: capped.truncated,
    commits: [],
  };
}

async function resolveMergeBase(cwd: string): Promise<string> {
  const candidates = [
    "origin/HEAD",
    "origin/main",
    "origin/master",
    "main",
    "master",
  ];

  for (const ref of candidates) {
    try {
      const { stdout } = await git(cwd, ["merge-base", "HEAD", ref]);
      if (stdout.trim()) return stdout.trim();
    } catch {
      // try next
    }
  }

  // Fallback: first commit / empty tree against parent
  try {
    const { stdout } = await git(cwd, ["rev-parse", "HEAD~1"]);
    return stdout.trim();
  } catch {
    throw new NoChangesError(
      "Could not resolve a merge base — provide --range explicitly",
    );
  }
}

async function assertGitRepo(cwd: string): Promise<void> {
  try {
    await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new GitError(
      "Not a git repository — run farq inside a repo (install: https://git-scm.com/)",
    );
  }
}

async function listCommits(cwd: string, range: string): Promise<string[]> {
  try {
    const { stdout } = await git(cwd, [
      "log",
      "--format=%s",
      range.includes("..") ? range : `${range}`,
    ]);
    return stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function listUntracked(cwd: string): Promise<string[]> {
  const { stdout } = await git(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  return stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function readWorktreeFile(
  cwd: string,
  filePath: string,
): Promise<string | null> {
  try {
    return readFileSync(join(cwd, filePath), "utf8");
  } catch {
    return null;
  }
}

function formatNewFilePatch(path: string, content: string): string {
  const lines = content.split("\n");
  const body = lines.map((l) => `+${l}`).join("\n");
  return `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${body}\n`;
}

function parseNameStatus(nameStatus: string, patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0] ?? "M";
    const path = parts[parts.length - 1] ?? "";
    if (!path) continue;
    files.push({
      path,
      status: status[0] ?? "M",
      patch: extractFilePatch(patch, path),
    });
  }
  return files;
}

function extractFilePatch(patch: string, path: string): string {
  const marker = `diff --git a/${path} b/${path}`;
  const start = patch.indexOf(marker);
  if (start === -1) {
    // renamed or quoted paths — soft fallback
    const idx = patch.indexOf(path);
    if (idx === -1) return "";
  }
  const from = start === -1 ? 0 : start;
  const rest = patch.slice(from + (start === -1 ? 0 : marker.length));
  const next = rest.indexOf("\ndiff --git ");
  if (start === -1) return "";
  return patch.slice(start, next === -1 ? undefined : start + marker.length + next);
}

function splitRange(range: string): [string, string] {
  if (range.includes("...")) {
    const [a, b] = range.split("...");
    return [a || "HEAD", b || "HEAD"];
  }
  if (range.includes("..")) {
    const [a, b] = range.split("..");
    return [a || "HEAD", b || "HEAD"];
  }
  return [range, "HEAD"];
}

function capText(text: string, budget: number): { text: string; truncated: boolean } {
  if (text.length <= budget) return { text, truncated: false };
  return {
    text:
      text.slice(0, budget) +
      `\n\n… [farq truncated diff at ${budget} bytes]\n`,
    truncated: true,
  };
}

async function git(cwd: string, args: string[]) {
  try {
    return await execa("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      reject: true,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    const e = err as { timedOut?: boolean; stderr?: string; message?: string };
    if (e.timedOut) {
      throw new GitError("git did not respond — check that the repository is healthy");
    }
    throw err;
  }
}
