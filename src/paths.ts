import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

/**
 * Default image output dir — outside the repo so generated files
 * never require a `.gitignore` entry.
 *
 * Override with `FARQ_CACHE_DIR` (root) or `--out <dir>`.
 */
export function defaultOutDir(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const abs = resolve(cwd);
  const hash = createHash("sha256").update(abs).digest("hex").slice(0, 16);
  return join(cacheRoot(env), hash);
}

export function cacheRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.FARQ_CACHE_DIR) return resolve(env.FARQ_CACHE_DIR);

  if (process.platform === "win32") {
    const local = env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(local, "farq", "cache");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches", "farq");
  }
  const xdg = env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(xdg, "farq");
}

/**
 * Path shown in markdown: repo-relative when inside cwd, else absolute.
 */
export function displayImageRef(cwd: string, imagePath: string): string {
  const abs = resolve(imagePath);
  const rel = relative(resolve(cwd), abs);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
    return rel.replaceAll("\\", "/");
  }
  return abs;
}
