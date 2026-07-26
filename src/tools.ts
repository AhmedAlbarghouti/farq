import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { platform } from "node:os";

export class ToolNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolNotFoundError";
  }
}

/** True when the image reference is already a hosted URL. */
export function isHostedImageUrl(ref: string): boolean {
  return /^https?:\/\//i.test(ref.trim());
}

/** Italic note appended for local-only image paths in PR markdown. */
export const LOCAL_IMAGE_NOTE =
  "_Local image path - attach the file when pasting into GitHub if it does not render._";

/** Strip the local-image attach note from PR markdown. */
export function stripLocalImageNote(body: string): string {
  return body
    .replace(/\n*_Local image path[^\n]*_\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Resolve an executable: env override, then PATH, then extra candidate paths.
 */
export function resolveExecutable(
  names: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    envKey?: string;
    extraPaths?: string[];
    notFoundMessage: string;
  },
): string {
  const env = options.env ?? process.env;

  if (options.envKey && env[options.envKey]) {
    const forced = env[options.envKey]!;
    if (existsSync(forced)) return forced;
    throw new ToolNotFoundError(`${options.envKey} not found: ${forced}`);
  }

  const pathEnv = env.PATH ?? env.Path ?? "";
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  const win = platform() === "win32";
  const exts = win
    ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
        .split(";")
        .map((e) => e.toLowerCase())
    : [""];

  const tryName = (dir: string, name: string): string | null => {
    if (win) {
      if (name.includes(".")) {
        const p = join(dir, name);
        return existsSync(p) ? p : null;
      }
      for (const ext of exts) {
        const p = join(dir, name + ext);
        if (existsSync(p)) return p;
      }
      return null;
    }
    const p = join(dir, name);
    return existsSync(p) ? p : null;
  };

  for (const dir of dirs) {
    for (const name of names) {
      const hit = tryName(dir, name);
      if (hit) return hit;
    }
  }

  for (const candidate of options.extraPaths ?? []) {
    if (candidate && existsSync(candidate)) return candidate;
  }

  throw new ToolNotFoundError(options.notFoundMessage);
}

let cachedGh: string | undefined;

export function resolveGh(env: NodeJS.ProcessEnv = process.env): string {
  if (cachedGh) return cachedGh;
  const local = env.LOCALAPPDATA ?? "";
  const pf = env.ProgramFiles ?? "C:\\Program Files";
  const pf86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";

  cachedGh = resolveExecutable(["gh", "gh.exe"], {
    env,
    envKey: "GH_PATH",
    extraPaths: [
      join(pf, "GitHub CLI", "gh.exe"),
      join(pf86, "GitHub CLI", "gh.exe"),
      join(local, "Programs", "GitHub CLI", "gh.exe"),
      "/usr/local/bin/gh",
      "/opt/homebrew/bin/gh",
      "/usr/bin/gh",
    ],
    notFoundMessage:
      "gh not found — install GitHub CLI (https://cli.github.com) or set GH_PATH",
  });
  return cachedGh;
}

/** Reset cache (tests). */
export function resetGhCache(): void {
  cachedGh = undefined;
}
