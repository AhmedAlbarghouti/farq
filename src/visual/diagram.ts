import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractJson } from "../extract-json.js";
import type { ChangeSummary } from "../schema.js";
import type { Provider } from "../providers/index.js";

export type DiagramResult =
  | { feasible: true; htmlPath: string }
  | { feasible: false; reason: string };

export async function generateDiagram(options: {
  provider: Provider;
  summary: ChangeSummary;
  diffText: string;
  outDir: string;
  model?: string;
  log?: (msg: string) => void;
}): Promise<DiagramResult> {
  const prompt = `You create a conceptual before/after flowchart as one self-contained HTML document.

This is the fallback visual when a pixel UI mockup is not appropriate (API, logic, docs, config, etc.). Prefer a small flowchart or labeled before/after boxes that explain the change at a glance.

Rules:
- Pure HTML/CSS, no libraries, no external requests, system fonts.
- Two labeled columns (Before / After) with simple boxes/arrows (flowchart style).
- Concept-level only: field/endpoint/step names OK. NO code, NO syntax, NO JSON dumps, NO walls of text.
- Include a small corner badge text: generated preview
- If you truly cannot produce a faithful conceptual visual from the diff alone, return {"feasible": false, "reason": "..."}. Prefer a simple flowchart over declining.

Return JSON only:
{"feasible": true, "html": "..."}
or {"feasible": false, "reason": "..."}

Change summary:
${JSON.stringify(options.summary, null, 2)}

Diff:
${options.diffText}
`;

  const raw = await options.provider.complete(prompt, { model: options.model });
  const json = extractJson(raw) as {
    feasible?: boolean;
    reason?: string;
    html?: string;
  };

  if (!json.feasible || !json.html) {
    options.log?.(json.reason ?? "diagram not feasible");
    return { feasible: false, reason: json.reason ?? "not feasible" };
  }

  mkdirSync(options.outDir, { recursive: true });
  const htmlPath = join(options.outDir, "diagram.html");
  writeFileSync(htmlPath, json.html, "utf8");
  return { feasible: true, htmlPath };
}
