import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultOutDir } from "../paths.js";
import { resolveChrome, screenshotHtml, ChromeError } from "./chrome.js";
import { buildComposeDocument, resolveTheme, type Theme } from "./design.js";
import { DEFAULT_VIEWPORT } from "./viewport.js";

export type ComposeOptions = {
  cwd?: string;
  outDir?: string;
  beforePath: string;
  afterPath: string;
  badge?: string;
  title?: string;
  theme?: Theme;
  chromePath?: string;
  /** Output PNG basename (default before-after.png). */
  outFileName?: string;
};

export function buildComposeHtml(options: {
  beforeBase64: string;
  afterBase64: string;
  badge: string;
  title?: string;
  theme?: Theme;
}): string {
  return buildComposeDocument({
    theme: options.theme ?? resolveTheme(),
    title: options.title ?? "Before / after",
    beforeBase64: options.beforeBase64,
    afterBase64: options.afterBase64,
    badge: options.badge,
  });
}

export async function composeBeforeAfter(
  options: ComposeOptions,
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const outDir = resolve(cwd, options.outDir ?? defaultOutDir(cwd));
  mkdirSync(outDir, { recursive: true });

  const before = readFileSync(options.beforePath);
  const after = readFileSync(options.afterPath);
  const html = buildComposeHtml({
    beforeBase64: before.toString("base64"),
    afterBase64: after.toString("base64"),
    badge: options.badge ?? "before / after",
    title: options.title,
    theme: options.theme,
  });

  const stem = (options.outFileName ?? "before-after.png").replace(
    /\.png$/i,
    "",
  );
  const composePath = join(outDir, `${stem}-compose.html`);
  writeFileSync(composePath, html, "utf8");

  const outPng = join(outDir, `${stem}.png`);
  const chromePath = options.chromePath ?? resolveChrome();
  await screenshotHtml({
    chromePath,
    url: pathToFileURL(composePath).href,
    outPath: outPng,
    width: DEFAULT_VIEWPORT.width,
    height: DEFAULT_VIEWPORT.height,
  });
  return outPng;
}

export { ChromeError, resolveChrome };
