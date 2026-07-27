import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractJson } from "../extract-json.js";
import type { ChangeSummary } from "../schema.js";
import type { Provider } from "../providers/index.js";
import {
  DEFAULT_MOCKUP_STAGE_WIDTH,
  MOCKUP_PANEL,
  STYLE_CONTRACT,
  buildMockupDocument,
  resolveTheme,
  type Theme,
} from "./design.js";

export type MockupResult =
  | { feasible: true; htmlPath: string }
  | { feasible: false; reason: string };

export type MockupFile = { path: string; before: string; after: string };

export function buildMockupPrompt(options: {
  summary: ChangeSummary;
  files: MockupFile[];
}): string {
  return `You turn a git diff into a faithful before/after UI mockup.

farq supplies the page frame: background, header, Before/After labels, the badge, and automatic scale-to-fit. You supply only the two panel interiors. Never recreate the frame.

Each panel renders into a ${MOCKUP_PANEL.width}x${MOCKUP_PANEL.height}px box. Compose for that box: show the changed component and just enough surrounding context to place it. This is a close-up, not a whole application screen — no site nav, no sidebars, no footer, unless the diff changes those. Anything you design wider than the box gets scaled down and becomes hard to read.

Produce:
- "before_body" / "after_body": HTML fragments for the two states. No <html>, <head>, <body>, <style> or <script> tags.
- "css": one stylesheet shared by both fragments.
- "before_css" / "after_css" (optional): rules for one state only. farq scopes them for you, so keep the same class names in both fragments and put the differences here.
- "stage_width": the pixel width you designed against. Default ${DEFAULT_MOCKUP_STAGE_WIDTH}; use 390 for a phone view. Never exceed ${MOCKUP_PANEL.width}.

Fidelity rules:
- Render the markup and styles the diff actually shows. Do not invent UI that is not in the code.
- Stub only what is dynamic: realistic placeholder copy for props and data.
- The only visible difference between the panels must be the change itself. Do not redesign anything else.
- Whatever the diff adds must be easy to see: give it at least the weight of the content around it, never the faintest token on the panel. Do not add callouts, arrows or highlight boxes to point at it.
- Never render raw code, diff text, or file paths as content.
- If the diff contains no renderable UI, decline instead of guessing.

${STYLE_CONTRACT}

Return JSON only:
{"feasible":true,"css":"...","before_css":"...","after_css":"...","before_body":"...","after_body":"...","stage_width":${DEFAULT_MOCKUP_STAGE_WIDTH}}
or {"feasible":false,"reason":"..."}

Change summary context:
${JSON.stringify(options.summary, null, 2)}

File contents:
${options.files
  .map(
    (f) =>
      `### ${f.path}\n--- BEFORE ---\n${f.before}\n--- AFTER ---\n${f.after}`,
  )
  .join("\n\n")}
`;
}

export async function generateMockup(options: {
  provider: Provider;
  summary: ChangeSummary;
  files: MockupFile[];
  outDir: string;
  model?: string;
  theme?: Theme;
  title?: string;
  log?: (msg: string) => void;
  /** Prefix for the written HTML file (e.g. visual-1-). */
  filePrefix?: string;
}): Promise<MockupResult> {
  const prompt = buildMockupPrompt({
    summary: options.summary,
    files: options.files,
  });

  const raw = await options.provider.complete(prompt, { model: options.model });
  const json = extractJson(raw) as {
    feasible?: boolean;
    reason?: string;
    css?: string;
    before_css?: string;
    after_css?: string;
    before_body?: string;
    after_body?: string;
    stage_width?: number;
  };

  if (!json.feasible) {
    options.log?.(json.reason ?? "mockup not feasible");
    return { feasible: false, reason: json.reason ?? "not feasible" };
  }

  if (!json.before_body || !json.after_body) {
    return { feasible: false, reason: "missing before_body/after_body" };
  }

  const html = buildMockupDocument({
    theme: options.theme ?? resolveTheme(),
    title: options.title ?? options.summary.headline,
    css: json.css,
    beforeCss: json.before_css,
    afterCss: json.after_css,
    beforeBody: json.before_body,
    afterBody: json.after_body,
    stageWidth: json.stage_width,
  });

  mkdirSync(options.outDir, { recursive: true });
  const htmlPath = join(
    options.outDir,
    `${options.filePrefix ?? ""}mockup.html`,
  );
  writeFileSync(htmlPath, html, "utf8");
  return { feasible: true, htmlPath };
}
