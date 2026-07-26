import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveChrome, screenshotHtml, ChromeError } from "./chrome.js";

export type ComposeOptions = {
  cwd?: string;
  outDir?: string;
  beforePath: string;
  afterPath: string;
  badge?: "generated preview" | "before / after";
  chromePath?: string;
};

export function buildComposeHtml(options: {
  beforeBase64: string;
  afterBase64: string;
  badge: string;
}): string {
  const { beforeBase64, afterBase64, badge } = options;
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  html,body{margin:0;background:#1b1d21;color:#e8e8e8;font-family:system-ui,sans-serif}
  .wrap{padding:24px}
  .badge{position:fixed;top:12px;right:12px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;
    background:#2a2e35;border:1px solid #3a3f48;padding:4px 8px;border-radius:4px;opacity:.9}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  h2{margin:0 0 10px;font-size:14px;font-weight:600;color:#b9c0c9}
  img{width:100%;height:auto;background:#0f1114;border:1px solid #2f343d;border-radius:6px;display:block}
</style></head>
<body>
  <div class="badge">${escapeHtml(badge)}</div>
  <div class="wrap"><div class="grid">
    <section><h2>Before</h2><img alt="Before" src="data:image/png;base64,${beforeBase64}" /></section>
    <section><h2>After</h2><img alt="After" src="data:image/png;base64,${afterBase64}" /></section>
  </div></div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function composeBeforeAfter(
  options: ComposeOptions,
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const outDir = resolve(cwd, options.outDir ?? ".farq");
  mkdirSync(outDir, { recursive: true });

  const before = readFileSync(options.beforePath);
  const after = readFileSync(options.afterPath);
  const badge = options.badge ?? "generated preview";
  const html = buildComposeHtml({
    beforeBase64: before.toString("base64"),
    afterBase64: after.toString("base64"),
    badge,
  });

  const composePath = join(outDir, "compose.html");
  writeFileSync(composePath, html, "utf8");

  const outPng = join(outDir, "before-after.png");
  const chromePath = options.chromePath ?? resolveChrome();
  await screenshotHtml({
    chromePath,
    url: pathToFileURL(composePath).href,
    outPath: outPng,
    width: 1400,
    height: 900,
  });
  return outPng;
}

export { ChromeError, resolveChrome };
