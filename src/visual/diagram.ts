import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractJson } from "../extract-json.js";
import type { ChangeSummary } from "../schema.js";
import type { Provider } from "../providers/index.js";
import {
  DEFAULT_DIAGRAM_STAGE_WIDTH,
  DIAGRAM_PANEL,
  STYLE_CONTRACT,
  buildDiagramDocument,
  resolveTheme,
  type Theme,
} from "./design.js";

export type DiagramResult =
  | { feasible: true; htmlPath: string }
  | { feasible: false; reason: string };

export function buildDiagramPrompt(options: {
  summary: ChangeSummary;
  diffText: string;
}): string {
  return `You explain a code change as a conceptual before/after flowchart.

This is the fallback when there is no pixel UI to show (API, logic, config, docs). farq supplies the page frame, header, badge and automatic scale-to-fit — you supply only the diagram body and its CSS.

The diagram renders into a ${DIAGRAM_PANEL.width}x${DIAGRAM_PANEL.height}px box. Fill it: this is a wide, short canvas, so lay the two columns out side by side and let them breathe.

Produce:
- "body": an HTML fragment with two labelled columns (Before / After) of boxes and arrows. No <html>, <head>, <body>, <style> or <script> tags.
- "css": the stylesheet for that fragment.
- "stage_width": the pixel width you designed against (${DEFAULT_DIAGRAM_STAGE_WIDTH} is a good default).

Content rules:
- Concept level only: step, field and endpoint names are fine. No code, no syntax, no JSON dumps, no paragraphs.
- At most 5 boxes per column, at most 8 words per box.
- Make the delta obvious: mark what is new or changed with the accent color, and keep unchanged steps neutral.
- Draw arrows with CSS borders or plain characters. No SVG sprites, no external assets.

${STYLE_CONTRACT}

Return JSON only:
{"feasible":true,"css":"...","body":"...","stage_width":${DEFAULT_DIAGRAM_STAGE_WIDTH}}
or {"feasible":false,"reason":"..."} — prefer a simple flowchart over declining.

Change summary:
${JSON.stringify(options.summary, null, 2)}

Diff:
${options.diffText}
`;
}

export async function generateDiagram(options: {
  provider: Provider;
  summary: ChangeSummary;
  diffText: string;
  outDir: string;
  model?: string;
  theme?: Theme;
  title?: string;
  log?: (msg: string) => void;
  filePrefix?: string;
}): Promise<DiagramResult> {
  const prompt = buildDiagramPrompt({
    summary: options.summary,
    diffText: options.diffText,
  });

  const raw = await options.provider.complete(prompt, { model: options.model });
  const json = extractJson(raw) as {
    feasible?: boolean;
    reason?: string;
    css?: string;
    body?: string;
    html?: string;
    stage_width?: number;
  };

  if (!json.feasible || !json.body) {
    options.log?.(json.reason ?? "diagram not feasible");
    return { feasible: false, reason: json.reason ?? "not feasible" };
  }

  const html = buildDiagramDocument({
    theme: options.theme ?? resolveTheme(),
    title: options.title ?? options.summary.headline,
    css: json.css,
    body: json.body,
    stageWidth: json.stage_width,
  });

  mkdirSync(options.outDir, { recursive: true });
  const htmlPath = join(
    options.outDir,
    `${options.filePrefix ?? ""}diagram.html`,
  );
  writeFileSync(htmlPath, html, "utf8");
  return { feasible: true, htmlPath };
}
